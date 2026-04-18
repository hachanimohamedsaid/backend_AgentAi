import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `Tu es un assistant qui rédige des e-mails professionnels en français pour une équipe technique.
Tu reçois un JSON strict décrivant UN employé et SES sprints/tâches réels.
Tu dois produire uniquement le corps du message en HTML simple (h1, h2, ul, li, p) ou en texte brut si demandé.
Tu ne dois jamais ajouter de tâche, de sprint ou d'employé qui ne figure pas dans le JSON.
Si une information manque, écris « non renseigné » sans l'inventer.`;

export interface DispatchPayloadJson {
  employee: {
    id: string;
    email: string;
    fullName: string;
    profile: string;
    skills: string[];
  };
  project: { id: string; title: string };
  sprints: Array<{
    sprintId: string;
    title: string;
    goal: string;
    startDate: string;
    endDate: string;
    tasks: Array<{
      title: string;
      description: string;
      priority: string;
      status: string;
      deliverable: string;
    }>;
  }>;
}

const LLM_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 2048;

export type DispatchEmailProvider = 'gemini' | 'openai';

export interface DispatchEmailGenerationResult {
  html: string;
  provider: DispatchEmailProvider;
  model: string;
}

@Injectable()
export class DispatchEmailLlmService {
  constructor(private readonly configService: ConfigService) {}

  async generateEmailHtml(payload: DispatchPayloadJson): Promise<string> {
    const result = await this.generateEmailReport(payload);
    return result.html;
  }

  async generateEmailReport(payload: DispatchPayloadJson): Promise<DispatchEmailGenerationResult> {
    const payloadStr = JSON.stringify(payload);
    const userPrompt = `Voici les données JSON : ${payloadStr}. Rédige l'e-mail pour ${payload.employee.email} en expliquant clairement ce que cette personne doit faire sprint par sprint.`;

    const geminiKey = this.configService.get<string>('GEMINI_API_KEY')
      ?? this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    const geminiModel = this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
    if (geminiKey?.trim()) {
      try {
        const html = await this.withTimeout(
          this.callGemini(geminiKey, geminiModel, userPrompt),
          LLM_TIMEOUT_MS,
          'Gemini timeout',
        );
        if (html) {
          return { html, provider: 'gemini', model: geminiModel };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[DispatchEmailLlm] Gemini échoué, fallback OpenAI:', msg);
      }
    }

    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    const openaiModel = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
    if (openaiKey?.trim() && !openaiKey.includes('your-openai')) {
      try {
        const html = await this.withTimeout(
          this.callOpenAI(openaiKey, openaiModel, userPrompt),
          LLM_TIMEOUT_MS,
          'OpenAI timeout',
        );
        if (html) {
          return { html, provider: 'openai', model: openaiModel };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[DispatchEmailLlm] OpenAI échoué:', msg);
      }
    }

    throw new Error('LLM indisponible (Gemini et OpenAI).');
  }

  private async callGemini(apiKey: string, modelName: string, userPrompt: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      },
    });
    const text = result.response.text()?.trim();
    if (!text) throw new Error('Réponse Gemini vide');
    return text;
  }

  private async callOpenAI(apiKey: string, modelName: string, userPrompt: string): Promise<string> {
    const openai = new OpenAI({ apiKey, timeout: LLM_TIMEOUT_MS });
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Réponse OpenAI vide');
    return content;
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
    ]);
  }
}
