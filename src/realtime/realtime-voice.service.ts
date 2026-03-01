import WebSocket from 'ws';

const OPENAI_REALTIME_URL =
  'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

/**
 * Proxy vers l'API OpenAI Realtime (voix ChatGPT originale).
 * Une instance par connexion WebSocket client.
 */
export class RealtimeVoiceService {
  private openaiWs: WebSocket | null = null;

  constructor(private readonly apiKey: string | undefined) {}

  connectToOpenAI(
    onAudioDelta: (base64: string) => void,
    onTextDelta?: (text: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error('OPENAI_API_KEY is not set'));
        return;
      }

      this.openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      } as WebSocket.ClientOptions);

      this.openaiWs.on('open', () => {
        this.openaiWs!.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              voice: 'alloy',
              instructions:
                'Understand any spoken language and respond naturally in the same language using conversational voice. Réponds en français si on te parle en français.',
            },
          }),
        );
        resolve();
      });

      this.openaiWs.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'response.audio.delta' && msg.delta) {
            onAudioDelta(msg.delta);
          }
          if (
            msg.type === 'response.output_text.delta' &&
            onTextDelta &&
            msg.delta
          ) {
            onTextDelta(msg.delta);
          }
        } catch {
          // ignore parse errors
        }
      });

      this.openaiWs.on('error', reject);
      this.openaiWs.on('close', () => {
        this.openaiWs = null;
      });
    });
  }

  sendAudioChunk(base64Audio: string): void {
    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio,
        }),
      );
    }
  }

  commitAndCreateResponse(): void {
    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      this.openaiWs.send(JSON.stringify({ type: 'response.create' }));
    }
  }

  close(): void {
    if (this.openaiWs) {
      this.openaiWs.close();
      this.openaiWs = null;
    }
  }
}
