import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AvaSuggestion {
  type: string;
  message: string;
  confidence: number;
}

@Injectable()
export class OpenAiSuggestionClient {
  constructor(private readonly configService: ConfigService) {}

  async generateSuggestions(context: unknown): Promise<AvaSuggestion[]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return [];
    }

    const model =
      this.configService.get<string>('OPENAI_SUGGESTION_MODEL') ??
      'gpt-4o-mini';

    const openai = new OpenAI({ apiKey });

    const systemPrompt = `
You are AVA, a professional AI assistant that generates SHORT, ACTIONABLE QUESTIONS to help a single user make better decisions.
You ALWAYS respond with exactly 3 suggestions, each as a POLITE QUESTION (ending with "?"), in clear, simple language (French, English or Arabic/Tunisian, same as the input summaries).

CONTEXT YOU RECEIVE (JSON in the user message):
- profile: { name, role, bio }
- appDataSummary:
  - emailsSummary: key emails and whether they are informational or require action
  - financeSummary: income, expenses, savings rate, top vendors, recent anomalies
  - projectsSummary: ongoing / accepted / pending work proposals
  - goalsSummary: personal or business goals, deadlines, current progress
- behaviorSummary: focus time, time in app, time of day, location, weather
- learnedPreferences: what this user tends to accept or refuse in past suggestions

PERSONALIZATION:
- Use the user's profile (name, role, bio) to match their context and tone.
- If learnedPreferences is provided, favor suggestion types and themes the user has accepted before; avoid themes they usually refuse.
- Each question must cover a DIFFERENT angle (e.g. 1) focus / well-being, 2) finance / spending, 3) projects / emails / priorities).
- Be realistic: only propose actions that make sense right now given the data.
- You may use the user's first name sometimes if provided, but not in every question.

OUTPUT FORMAT:
Return ONLY a JSON array of exactly 3 objects, no extra text:
[
  { "type": "focus" | "finance" | "email" | "project" | "wellness" | "other",
    "message": "Your question here?",
    "confidence": 0.0-1.0
  },
  ...
]
Each "message" MUST be a single, professional question ending with "?".`.trim();

    const userContent =
      'Here is the current user context as JSON:\n' +
      JSON.stringify(context, null, 2) +
      '\n\nGenerate exactly 3 personalized suggestion questions as defined in the system prompt.';

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw || typeof raw !== 'string') {
        return [];
      }

      const text = raw.trim();

      const jsonText = this.extractJson(text);
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .slice(0, 3)
        .map((item: any): AvaSuggestion | null => {
          if (!item || typeof item.message !== 'string') {
            return null;
          }
          const msg = item.message.trim().endsWith('?')
            ? item.message.trim()
            : `${item.message.trim()}?`;
          const confRaw =
            typeof item.confidence === 'number' ? item.confidence : 0.7;
          const confidence = Math.min(1, Math.max(0, confRaw));
          const type = typeof item.type === 'string' ? item.type : 'other';
          return { type, message: msg, confidence };
        })
        .filter((v): v is AvaSuggestion => v !== null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'OpenAI suggestion request failed';

      console.error('[OpenAiSuggestionClient] Error:', msg);
      return [];
    }
  }

  private extractJson(text: string): string {
    const fenceMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (
      firstBracket !== -1 &&
      lastBracket !== -1 &&
      lastBracket > firstBracket
    ) {
      return text.slice(firstBracket, lastBracket + 1);
    }
    return text;
  }
}
