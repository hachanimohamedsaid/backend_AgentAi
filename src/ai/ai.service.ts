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

  async chat(messages: { role: string; content: string }[]): Promise<ChatResponse> {
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
          { role: 'system', content: "You are Buddy, a friendly and helpful voice assistant. Keep replies concise and natural for conversation." },
          ...clientMessages,
        ];

    try {
      const completion = await openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: openaiMessages,
      });

      const content = completion.choices[0]?.message?.content?.trim();
      return { message: content ?? "I'm not sure how to reply. Try again?" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OpenAI request failed';
      console.error('[AiService] OpenAI error:', msg);
      return { message: "Sorry, I couldn't process that. Please try again later." };
    }
  }

  private getFallbackResponse(messages: { role: string; content: string }[]): ChatResponse {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content?.trim() ?? '';

    if (!userText) {
      return { message: "Hello! I'm Buddy. How can I help you today?" };
    }

    return {
      message: `You said: "${userText}". (Set OPENAI_API_KEY in .env for full AI replies.)`,
    };
  }
}
