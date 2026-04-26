import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Conversation,
  ConversationDocument,
  ConversationType,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

type UserLite = { _id: Types.ObjectId; name: string; avatarUrl?: string | null; role?: string | null };

@Injectable()
export class MessagingService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private _ensureObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid ${label}`);
    return new Types.ObjectId(id);
  }

  private async _loadParticipants(participantIds: Types.ObjectId[]): Promise<UserLite[]> {
    const users = await this.userModel
      .find({ _id: { $in: participantIds } })
      .select('_id name avatarUrl role')
      .lean()
      .exec();
    return users as UserLite[];
  }

  async getConversations(userId: string) {
    const uid = this._ensureObjectId(userId, 'userId');
    const convs = await this.conversationModel
      .find({ participants: uid })
      .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })
      .lean()
      .exec();

    const allParticipantIds = Array.from(
      new Set(
        convs.flatMap((c: any) => (c.participants ?? []).map((p: any) => p.toString())),
      ),
    ).map((s) => new Types.ObjectId(s));

    const users = await this._loadParticipants(allParticipantIds);
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    return convs.map((c: any) => {
      const unread = (c.unreadCounts?.[uid.toString()] ??
        (c.unreadCounts instanceof Map ? c.unreadCounts.get(uid.toString()) : 0) ??
        0) as number;
      return {
        id: c._id.toString(),
        type: c.type as ConversationType,
        name: c.name ?? null,
        avatarUrl: c.avatarUrl ?? null,
        participants: (c.participants ?? []).map((p: any) => {
          const u = userById.get(p.toString());
          return {
            id: p.toString(),
            name: u?.name ?? '',
            avatarUrl: u?.avatarUrl ?? null,
            role: u?.role ?? null,
          };
        }),
        lastMessage: c.lastMessage
          ? {
              content: c.lastMessage.content,
              senderId: c.lastMessage.senderId?.toString?.() ?? String(c.lastMessage.senderId),
              senderName: c.lastMessage.senderName,
              createdAt: c.lastMessage.createdAt,
            }
          : null,
        unreadCount: unread,
      };
    });
  }

  async getOrCreateDirect(userId: string, otherUserId: string) {
    const uid = this._ensureObjectId(userId, 'userId');
    const oid = this._ensureObjectId(otherUserId, 'participantId');
    if (uid.equals(oid)) throw new BadRequestException('Cannot DM yourself');

    const existing = await this.conversationModel
      .findOne({
        type: 'direct',
        participants: { $all: [uid, oid] },
        $expr: { $eq: [{ $size: '$participants' }, 2] },
      })
      .lean()
      .exec();
    if (existing) {
      const [conv] = await this.getConversations(userId).then((list) =>
        list.filter((c) => c.id === existing._id.toString()),
      );
      return conv ?? { id: existing._id.toString() };
    }

    const conv = await this.conversationModel.create({
      type: 'direct',
      participants: [uid, oid],
      name: null,
      avatarUrl: null,
      lastMessage: null,
      unreadCounts: {},
    });
    const [created] = await this.getConversations(userId).then((list) =>
      list.filter((c) => c.id === conv._id.toString()),
    );
    return created ?? { id: conv._id.toString() };
  }

  async createGroup(userId: string, dto: CreateConversationDto) {
    const uid = this._ensureObjectId(userId, 'userId');
    if (dto.type !== 'group') throw new BadRequestException('type must be group');
    if (!dto.name || !dto.name.trim()) throw new BadRequestException('name required');
    const participantIds = Array.from(
      new Set([uid.toString(), ...(dto.participantIds ?? [])]),
    ).map((id) => this._ensureObjectId(id, 'participantId'));

    const conv = await this.conversationModel.create({
      type: 'group',
      participants: participantIds,
      name: dto.name.trim(),
      avatarUrl: null,
      lastMessage: null,
      unreadCounts: {},
    });

    const [created] = await this.getConversations(userId).then((list) =>
      list.filter((c) => c.id === conv._id.toString()),
    );
    return created ?? { id: conv._id.toString() };
  }

  async getMessages(conversationId: string, userId: string, cursor?: string, limit = 30) {
    const cid = this._ensureObjectId(conversationId, 'conversationId');
    const uid = this._ensureObjectId(userId, 'userId');
    const conv = await this.conversationModel.findById(cid).lean().exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = (conv as any).participants?.some((p: any) => p.toString() === uid.toString());
    if (!isParticipant) throw new ForbiddenException('Not a participant');

    const q: any = { conversationId: cid };
    if (cursor && Types.ObjectId.isValid(cursor)) {
      q._id = { $lt: new Types.ObjectId(cursor) };
    }

    const msgs = await this.messageModel
      .find(q)
      .sort({ _id: -1 })
      .limit(Math.max(1, Math.min(100, limit)))
      .lean()
      .exec();

    const messages = msgs
      .reverse()
      .map((m: any) => ({
        id: m._id.toString(),
        conversationId: m.conversationId.toString(),
        senderId: m.senderId.toString(),
        senderName: m.senderName,
        senderAvatar: m.senderAvatar ?? null,
        content: m.content,
        createdAt: m.createdAt,
        readBy: (m.readBy ?? []).map((x: any) => x.toString()),
      }));
    const nextCursor =
      msgs.length > 0 ? (msgs[msgs.length - 1] as any)._id?.toString?.() ?? null : null;
    return { messages, nextCursor };
  }

  async sendMessage(senderId: string, dto: SendMessageDto) {
    const sid = this._ensureObjectId(senderId, 'senderId');
    const cid = this._ensureObjectId(dto.conversationId, 'conversationId');
    const conv = await this.conversationModel.findById(cid).exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p) => p.toString() === sid.toString());
    if (!isParticipant) throw new ForbiddenException('Not a participant');

    const sender = await this.userModel
      .findById(sid)
      .select('_id name avatarUrl')
      .lean()
      .exec();
    if (!sender) throw new NotFoundException('User not found');

    const msg = await this.messageModel.create({
      conversationId: cid,
      senderId: sid,
      senderName: sender.name,
      senderAvatar: sender.avatarUrl ?? null,
      content: dto.content,
      type: 'text',
      readBy: [sid],
    });

    const createdAt = (msg as any).createdAt as Date;
    conv.lastMessage = {
      content: dto.content,
      senderId: sid,
      senderName: sender.name,
      createdAt,
    } as any;

    // increment unread for everyone except sender
    const unreadMap: Map<string, number> =
      conv.unreadCounts instanceof Map
        ? (conv.unreadCounts as Map<string, number>)
        : new Map<string, number>(
            Object.entries(((conv as any).unreadCounts ?? {}) as Record<string, number>),
          );
    for (const pid of conv.participants) {
      const key = pid.toString();
      if (key === sid.toString()) {
        unreadMap.set(key, 0);
      } else {
        const current = unreadMap.get(key) ?? 0;
        unreadMap.set(key, current + 1);
      }
    }
    conv.unreadCounts = unreadMap;
    await conv.save();

    return {
      message: {
        id: msg._id.toString(),
        conversationId: cid.toString(),
        senderId: sid.toString(),
        senderName: sender.name,
        senderAvatar: sender.avatarUrl ?? null,
        content: msg.content,
        createdAt,
        readBy: [sid.toString()],
      },
      conversation: conv,
    };
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    const cid = this._ensureObjectId(conversationId, 'conversationId');
    const uid = this._ensureObjectId(userId, 'userId');
    const conv = await this.conversationModel.findById(cid).exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    const isParticipant = conv.participants.some((p) => p.toString() === uid.toString());
    if (!isParticipant) throw new ForbiddenException('Not a participant');

    const unreadMap: Map<string, number> =
      conv.unreadCounts instanceof Map
        ? (conv.unreadCounts as Map<string, number>)
        : new Map<string, number>(
            Object.entries(((conv as any).unreadCounts ?? {}) as Record<string, number>),
          );
    unreadMap.set(uid.toString(), 0);
    conv.unreadCounts = unreadMap;
    await conv.save();

    // add userId to readBy for messages not yet read by this user
    await this.messageModel.updateMany(
      { conversationId: cid, readBy: { $ne: uid } },
      { $addToSet: { readBy: uid } },
    );
  }

  async getTotalUnread(userId: string): Promise<number> {
    const uid = this._ensureObjectId(userId, 'userId');
    const convs = await this.conversationModel.find({ participants: uid }).lean().exec();
    let total = 0;
    for (const c of convs as any[]) {
      const unread =
        (c.unreadCounts?.[uid.toString()] ??
          (c.unreadCounts instanceof Map ? c.unreadCounts.get(uid.toString()) : 0) ??
          0) as number;
      total += unread;
    }
    return total;
  }

  async getConversationParticipants(conversationId: string): Promise<string[]> {
    const cid = this._ensureObjectId(conversationId, 'conversationId');
    const conv = await this.conversationModel.findById(cid).lean().exec();
    if (!conv) throw new NotFoundException('Conversation not found');
    return (conv as any).participants.map((p: any) => p.toString());
  }

  async searchUsers(query: string, requestingUserId: string) {
    const q = (query ?? '').trim();
    if (!q) return [];
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const reqId = this._ensureObjectId(requestingUserId, 'userId');
    const users = await this.userModel
      .find({ _id: { $ne: reqId }, name: regex })
      .select('_id name avatarUrl role department')
      .limit(20)
      .lean()
      .exec();
    return (users as any[]).map((u) => ({
      id: u._id?.toString?.() ?? String(u._id),
      name: u.name ?? '',
      avatarUrl: u.avatarUrl ?? null,
      role: u.role ?? null,
      department: u.department ?? null,
    }));
  }
}

