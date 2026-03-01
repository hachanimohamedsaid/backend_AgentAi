import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import WebSocket, { Server } from 'ws';
import { RealtimeVoiceService } from './realtime-voice.service';

export type RealtimeClient = WebSocket & {
  id?: string;
  realtimeService?: RealtimeVoiceService;
};

@WebSocketGateway({ path: '/realtime-voice' })
export class RealtimeVoiceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(private readonly configService: ConfigService) {}

  async handleConnection(client: RealtimeClient): Promise<void> {
    client.id = Math.random().toString(36).slice(2);
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const service = new RealtimeVoiceService(apiKey);

    try {
      await service.connectToOpenAI(
        (base64) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({ type: 'response.audio.delta', delta: base64 }),
            );
          }
        },
        (text) => {
          if (client.readyState === 1) {
            client.send(
              JSON.stringify({
                type: 'response.output_text.delta',
                delta: text,
              }),
            );
          }
        },
      );
      client.realtimeService = service;
      client.send(JSON.stringify({ type: 'session.ready' }));
    } catch (err) {
      console.error('[RealtimeVoice] OpenAI connection failed:', err);
      client.close();
      return;
    }

    client.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });
  }

  handleDisconnect(client: RealtimeClient): void {
    const svc = client.realtimeService;
    if (svc && typeof svc.close === 'function') {
      svc.close();
    }
  }

  handleMessage(client: RealtimeClient, payload: Buffer): void {
    try {
      const msg = JSON.parse(payload.toString());
      const svc = client.realtimeService;

      if (msg.type === 'input_audio_buffer.append' && msg.audio && svc) {
        svc.sendAudioChunk(msg.audio);
      }
      if (msg.type === 'input_audio_buffer.commit' && svc) {
        svc.commitAndCreateResponse();
      }
    } catch {
      // ignore parse errors
    }
  }
}
