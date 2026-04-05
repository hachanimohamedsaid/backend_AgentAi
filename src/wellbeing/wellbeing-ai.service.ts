import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import type { ComputedScores } from './domain/scoring';
import { formatDiagnosticForLlm } from './domain/llm-format';
import { buildMockWellbeingNarrative } from './wellbeing-narrative.mock';

@Injectable()
export class WellbeingAiService {
  private readonly logger = new Logger(WellbeingAiService.name);

  constructor(private readonly configService: ConfigService) {}

  private loadSystemPrompt(): string {
    const path = join(
      process.cwd(),
      'prompts',
      'ava_wellbeing_system_prompt.txt',
    );
    if (!existsSync(path)) {
      return (
        'You are AVA Wellbeing Agent, an entrepreneur psychological specialist. ' +
        'You receive fixed diagnostic facts. Write empathetic HTML only; never change numbers, ' +
        'bands, dominant type, or trend. Use <h3>, <p>, <ul>, <li>, <strong>. No markdown.'
      );
    }
    return readFileSync(path, 'utf-8').trim();
  }

  async getAiResponse(scores: ComputedScores): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return buildMockWellbeingNarrative(scores);
    }

    const openai = new OpenAI({ apiKey });
    const userContent = formatDiagnosticForLlm(scores);
    const system = this.loadSystemPrompt();

    try {
      const completion = await openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.7,
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        return buildMockWellbeingNarrative(scores);
      }
      return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`OpenAI wellbeing narrative failed, using mock: ${msg}`);
      return buildMockWellbeingNarrative(scores);
    }
  }
}
