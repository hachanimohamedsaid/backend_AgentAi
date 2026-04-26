import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import WebSocket, { Server } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { MessagingService } from './messaging.service';

export type MessagingClient = WebSocket & {
  userId?: string;
  activeConversationId?: string;
};

@WebSocketGateway({ path: '/messaging-ws' })
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly clientsByUserId = new Map<string, MessagingClient>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly messagingService: MessagingService,
  ) {}

  async handleConnection(client: MessagingClient, req: any): Promise<void> {
    try {
      const url = req?.url ? new URL(req.url, 'http://localhost') : null;
      const token = url?.searchParams.get('token') ?? '';
      if (!token) {
        client.close();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret:
          this.configService.get<string>('JWT_SECRET') ||
          '7e6c26f44782b2b49cbf9e37fe77d013d41b43bcc9a47993e2024905ee04aad6',
      });
      const userId = payload?.sub;
      if (!userId) {
        client.close();
        return;
      }

      client.userId = String(userId);
      this.clientsByUserId.set(client.userId, client);

      client.on('message', (data: Buffer) => {
        this.handleMessage(client, data);
      });
    } catch {
      client.close();
    }
  }

  handleDisconnect(client: MessagingClient): void {
    if (client.userId) {
      const current = this.clientsByUserId.get(client.userId);
      if (current === client) {
        this.clientsByUserId.delete(client.userId);
      }
    }
  }

  private async handleMessage(client: MessagingClient, payload: Buffer): Promise<void> {
    try {
      const msg = JSON.parse(payload.toString());
      const type = msg?.type as string | undefined;
      if (!type || !client.userId) return;

      if (type === 'join') {
        client.activeConversationId = msg.conversationId;
        return;
      }

      if (type === 'message') {
        const conversationId = String(msg.conversationId ?? '');
        const content = String(msg.content ?? '').trim();
        if (!conversationId || !content) return;

        const result = await this.messagingService.sendMessage(client.userId, {
          conversationId,
          content,
        });

        const participantIds = await this.messagingService.getConversationParticipants(conversationId);
        for (const pid of participantIds) {
          this.broadcastToUser(pid, {
            type: 'new_message',
            conversationId,
            message: result.message,
          });
        }
        return;
      }

      if (type === 'read') {
        const conversationId = String(msg.conversationId ?? '');
        if (!conversationId) return;
        await this.messagingService.markRead(conversationId, client.userId);
        const participantIds = await this.messagingService.getConversationParticipants(conversationId);
        for (const pid of participantIds) {
          this.broadcastToUser(pid, {
            type: 'read_receipt',
            conversationId,
            userId: client.userId,
          });
        }
        return;
      }
    } catch {
      // ignore parse errors
    }
  }

  broadcastToUser(userId: string, payload: any): void {
    const client = this.clientsByUserId.get(userId);
    if (!client || client.readyState !== 1) return;
    try {
      client.send(JSON.stringify(payload));
    } catch {
      // ignore send errors
    }
  }
}

