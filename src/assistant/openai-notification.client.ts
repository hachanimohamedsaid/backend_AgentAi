import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

export type AssistantNotificationPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'urgent';

export interface AssistantNotificationAction {
  label: string;
  action: string;
  data?: Record<string, any>;
}

export interface AssistantNotificationMeta {
  dedupeKey: string;
  expiresAt?: string;
}

export interface AssistantNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: AssistantNotificationPriority;
  actions: AssistantNotificationAction[];
  meta: AssistantNotificationMeta;
}

@Injectable()
export class OpenAiNotificationClient {
  constructor(private readonly configService: ConfigService) {}

  async generateNotifications(input: {
    profile: { name?: string | null; role?: string | null };
    locale: string;
    timezone: string;
    tone: 'professional' | 'friendly' | 'concise';
    learnedPreferences: string | null;
    signals: unknown[];
    maxItems: number;
  }): Promise<AssistantNotification[]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return [];
    }

    const model =
      this.configService.get<string>('OPENAI_NOTIFICATION_MODEL') ??
      'gpt-4o-mini';

    const openai = new OpenAI({ apiKey });

    const systemPrompt = `
You are an AI assistant that turns normalized user "signals" into PROFESSIONAL, actionable notifications for a mobile app.

RULES:
- Output ONLY valid JSON (no markdown), as an array of notifications.
- Keep each notification short and useful.
- Use the requested locale and tone.
- Do NOT include sensitive personal data that isn't present in the input signals.
- Prefer actionable buttons when relevant.
- Avoid duplicates: each notification MUST include a stable meta.dedupeKey.

INPUT (provided as JSON in the user message):
- profile: { name, role }
- locale, timezone, tone
- learnedPreferences: string | null (what this user tends to accept or refuse)
- signals: array of objects with { signalType, payload, scores, occurredAt, source }
  - source "ml" = personalized suggestion from our ML model for this user (use payload.message as basis; make the notification feel personal and relevant).
  - source "backend" = from app context (meetings, focus, weather). Other sources = e.g. email from front.

OUTPUT FORMAT (JSON array, max length = maxItems):
[
  {
    "title": "string",
    "message": "string",
    "category": "Work" | "Personal" | "Travel" | "General",
    "priority": "low" | "medium" | "high" | "urgent",
    "actions": [
      { "label": "string", "action": "string", "data": { } }
    ],
    "meta": {
      "dedupeKey": "string",
      "expiresAt": "ISO-8601 string (optional)"
    }
  }
]
`.trim();

    const userContent =
      'Generate notifications from this JSON input:\n' +
      JSON.stringify(input, null, 2);

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

      const jsonText = this.extractJson(raw.trim());
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return this.sanitize(parsed).slice(0, input.maxItems);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'OpenAI notification request failed';

      console.error('[OpenAiNotificationClient] Error:', msg);
      return [];
    }
  }

  private sanitize(items: any[]): AssistantNotification[] {
    const out: AssistantNotification[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.title !== 'string' || typeof item.message !== 'string') {
        continue;
      }

      const category =
        item.category === 'Work' ||
        item.category === 'Personal' ||
        item.category === 'Travel' ||
        item.category === 'General'
          ? item.category
          : 'General';

      const priority: AssistantNotificationPriority =
        item.priority === 'low' ||
        item.priority === 'medium' ||
        item.priority === 'high' ||
        item.priority === 'urgent'
          ? item.priority
          : 'medium';

      const actions: AssistantNotificationAction[] = Array.isArray(item.actions)
        ? item.actions
            .map((a: any) => {
              if (!a || typeof a !== 'object') return null;
              if (typeof a.label !== 'string' || typeof a.action !== 'string') {
                return null;
              }
              const data =
                a.data && typeof a.data === 'object' ? a.data : undefined;
              return { label: a.label.trim(), action: a.action.trim(), data };
            })
            .filter((v: any) => v !== null)
        : [];

      const dedupeKeyRaw =
        item.meta && typeof item.meta === 'object' ? item.meta.dedupeKey : null;
      const dedupeKey =
        typeof dedupeKeyRaw === 'string' && dedupeKeyRaw.trim().length > 0
          ? dedupeKeyRaw.trim()
          : `openai:${randomUUID()}`;

      const expiresAtRaw =
        item.meta && typeof item.meta === 'object'
          ? item.meta.expiresAt
          : undefined;
      const expiresAt =
        typeof expiresAtRaw === 'string' && expiresAtRaw.trim().length > 0
          ? expiresAtRaw.trim()
          : undefined;

      out.push({
        id: `openai_${randomUUID()}`,
        title: item.title.trim(),
        message: item.message.trim(),
        category,
        priority,
        actions,
        meta: { dedupeKey, expiresAt },
      });
    }

    return out;
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
