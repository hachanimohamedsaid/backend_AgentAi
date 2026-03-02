import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument } from './meeting.schema';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { AppendTranscriptDto } from './dto/append-transcript.dto';
import { SaveSummaryDto } from './dto/save-summary.dto';

@Injectable()
export class MeetingService {
  constructor(
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
  ) {}

  private defaultTitle(): string {
    const date = new Date().toISOString().slice(0, 10);
    return `Meeting - ${date}`;
  }

  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
  }

  async create(dto: CreateMeetingDto): Promise<MeetingDocument> {
    const title = (dto.title ?? '').trim() || this.defaultTitle();
    const payload: Record<string, unknown> = {
      title,
      roomId: dto.roomId,
      startTime: new Date(dto.startTime),
      duration: dto.duration ?? 0,
      participants: dto.participants ?? [],
      transcript: dto.transcript ?? [],
      keyPoints: dto.keyPoints ?? [],
      actionItems: dto.actionItems ?? [],
      decisions: dto.decisions ?? [],
      summary: dto.summary ?? '',
    };
    if (dto.endTime) payload.endTime = new Date(dto.endTime);
    const doc = await this.meetingModel.create(payload as any);
    const json = (doc as any).toJSON ? (doc as any).toJSON() : doc;
    return json as MeetingDocument;
  }

  async findAll(): Promise<MeetingDocument[]> {
    const list = await this.meetingModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return list.map((doc: any) => {
      const id = doc._id?.toString();
      return { ...doc, id, _id: undefined, __v: undefined } as MeetingDocument;
    });
  }

  async findOne(id: string): Promise<MeetingDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const doc = await this.meetingModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Meeting not found');
    }
    const ret = doc as any;
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret as MeetingDocument;
  }

  async appendTranscript(id: string, dto: AppendTranscriptDto): Promise<MeetingDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    const chunks = (dto.chunks ?? []).map((c) => ({
      speaker: c.speaker,
      text: c.text,
      timestamp: c.timestamp,
    }));
    meeting.transcript = meeting.transcript ?? [];
    meeting.transcript.push(...chunks);

    // Optional metadata updates (sent by client on end-call).
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (t) (meeting as any).title = t;
    }
    if (dto.endTime !== undefined) {
      (meeting as any).endTime = dto.endTime ? new Date(dto.endTime) : undefined;
    }
    if (dto.duration !== undefined) {
      (meeting as any).duration = Math.max(0, Number(dto.duration) || 0);
    }
    if (dto.participants !== undefined) {
      const incoming = (dto.participants ?? [])
        .map((p) => (p ?? '').trim())
        .filter((p) => p.length > 0);
      const existing = Array.isArray((meeting as any).participants)
        ? ((meeting as any).participants as string[])
        : [];
      const merged = Array.from(new Set([...existing, ...incoming]));
      (meeting as any).participants = merged;
    }

    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async saveSummary(id: string, dto: SaveSummaryDto): Promise<MeetingDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (dto.summary !== undefined) (meeting as any).summary = dto.summary;
    if (dto.keyPoints !== undefined) (meeting as any).keyPoints = dto.keyPoints;
    if (dto.actionItems !== undefined) (meeting as any).actionItems = dto.actionItems;
    if (dto.decisions !== undefined) (meeting as any).decisions = dto.decisions;
    await meeting.save();
    return meeting.toJSON() as MeetingDocument;
  }

  async delete(id: string): Promise<void> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid meeting id');
    }
    const result = await this.meetingModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Meeting not found');
    }
  }
}
