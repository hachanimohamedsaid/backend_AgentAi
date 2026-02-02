import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatResponse {
  message: string;
}

/**
 * Service pour Talk to buddy (assistant vocal / chat).
 * Si OPENAI_API_KEY est défini, appelle l’API OpenAI ; sinon renvoie une réponse factice.
 */
@Injectable()
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  async chat(
    messages: { role: string; content: string }[],
    user?: { _id?: unknown; id?: string; email?: string; name?: string },
  ): Promise<ChatResponse> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      return this.getFallbackResponse(messages);
    }

    const openai = new OpenAI({ apiKey });

    const clientMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const hasSystemFromClient = clientMessages.some((m) => m.role === 'system');
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = hasSystemFromClient
      ? clientMessages
      : [
          { role: 'system', content: "Tu es Buddy, un assistant vocal amical et utile. Réponds toujours en français. Garde tes réponses courtes et naturelles pour la conversation." },
          ...clientMessages,
        ];

    try {
      const completion = await openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: openaiMessages,
      });

      const content = completion.choices[0]?.message?.content?.trim();
      return { message: content ?? "Je ne suis pas sûr de comprendre. Réessaie ?" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OpenAI request failed';
      console.error('[AiService] OpenAI error:', msg);
      return { message: "Désolé, je n'ai pas pu traiter ta demande. Réessaie plus tard." };
    }
  }

  private getFallbackResponse(messages: { role: string; content: string }[]): ChatResponse {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content?.trim() ?? '';

    if (!userText) {
      return { message: "Bonjour ! Je suis Buddy. Comment puis-je t'aider ?" };
    }

    return {
      message: `Tu as dit : « ${userText} ». (Configure OPENAI_API_KEY dans .env pour les réponses IA complètes.)`,
    };
  }
}
