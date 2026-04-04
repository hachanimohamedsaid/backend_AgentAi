import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { inspect } from 'node:util';
import type { InterviewMessageRole } from './schemas/interview-session.schema';

const RECRUITER_SYSTEM = `Tu es un recruteur expérimenté. Tu conduis un entretien d'embauche structuré (introduction, compétences, expérience, motivation, questions du candidat, clôture). Adopte un ton professionnel, courtois et neutre. Pose une question à la fois. Ne divulgue aucune clé API ni information technique sur le système.`;

export function buildInterviewKickoffUserMessage(contextLines: string[]): string {
  const block =
    contextLines.length > 0
      ? contextLines.join('\n')
      : "(Aucun détail candidat fourni — mène un entretien générique adapté au poste si mentionné.)";
  return `Démarre l'entretien : présente-toi brièvement en tant que recruteur, puis pose la première question pertinente.\n\nContexte :\n${block}`;
}

const LLM_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 8192;

@Injectable()
export class InterviewGeminiService {
  private readonly logger = new Logger(InterviewGeminiService.name);

  constructor(private readonly configService: ConfigService) {}

  private apiKey(): string {
    const k =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ??
      this.configService.get<string>('GOOGLE_GEMINI_API_KEY')?.trim();
    if (!k) {
      throw new ServiceUnavailableException(
        'Configuration serveur incomplète : GEMINI_API_KEY requise pour les entretiens.',
      );
    }
    return k;
  }

  private modelName(): string {
    return this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
  }

  private recruiterModel() {
    const genAI = new GoogleGenerativeAI(this.apiKey());
    return genAI.getGenerativeModel({
      model: this.modelName(),
      systemInstruction: RECRUITER_SYSTEM,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.35,
      },
    });
  }

  /** Logs détaillés (stack / inspect) uniquement en dev ou si LOG_GEMINI_ERRORS=true — jamais renvoyés au client HTTP. */
  private verboseGeminiErrorLogging(): boolean {
    return (
      process.env.NODE_ENV === 'development' ||
      this.configService.get<string>('LOG_GEMINI_ERRORS')?.toLowerCase() === 'true'
    );
  }

  private logGeminiFailure(operation: string, e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.logger.warn(`Gemini ${operation} échoué : ${msg}`);
    if (this.verboseGeminiErrorLogging()) {
      const detail =
        e instanceof Error && e.stack
          ? e.stack
          : inspect(e, { depth: 5, breakLength: 120 });
      this.logger.warn(`Gemini ${operation} détail brut (serveur uniquement) :\n${detail}`);
    }
  }

  private async withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<T>((_, reject) => {
          t = setTimeout(() => reject(new Error(`${label} (${LLM_TIMEOUT_MS}ms)`)), LLM_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (t) clearTimeout(t);
    }
  }

  async firstAssistantMessage(userKick: string): Promise<string> {
    const model = this.recruiterModel();
    const chat = model.startChat({ history: [] });
    try {
      const result = await this.withTimeout(chat.sendMessage(userKick), 'Gemini timeout (start)');
      const text = result.response.text()?.trim();
      if (!text) throw new Error('Réponse Gemini vide');
      return text;
    } catch (e) {
      this.logGeminiFailure('start', e);
      throw new ServiceUnavailableException("L'assistant d'entretien est temporairement indisponible.");
    }
  }

  private toGeminiHistory(
    messages: Array<{ role: InterviewMessageRole; content: string }>,
  ): { role: string; parts: { text: string }[] }[] {
    return messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
  }

  async continueConversation(
    priorMessages: Array<{ role: InterviewMessageRole; content: string }>,
    userContent: string,
  ): Promise<string> {
    const model = this.recruiterModel();
    const history = this.toGeminiHistory(priorMessages);
    const chat = model.startChat({ history });
    try {
      const result = await this.withTimeout(
        chat.sendMessage(userContent),
        'Gemini timeout (message)',
      );
      const text = result.response.text()?.trim();
      if (!text) throw new Error('Réponse Gemini vide');
      return text;
    } catch (e) {
      this.logGeminiFailure('message', e);
      throw new ServiceUnavailableException("L'assistant d'entretien est temporairement indisponible.");
    }
  }

  async summarizeConversation(transcript: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(this.apiKey());
    const model = genAI.getGenerativeModel({
      model: this.modelName(),
      systemInstruction: `Tu es un recruteur senior. À partir du transcript d'un entretien, rédige une synthèse courte en français avec ces parties (titres optionnels) : Points forts — Réserves / zones d'attention — Recommandation (ex. poursuivre le processus, entretien complémentaire, ou non conforme). Reste factuel et professionnel.`,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.2,
      },
    });
    const prompt = `Voici les échanges de l'entretien :\n\n${transcript}`;
    try {
      const result = await this.withTimeout(
        model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
        'Gemini timeout (summary)',
      );
      const text = result.response.text()?.trim();
      if (!text) throw new Error('Réponse Gemini vide');
      return text;
    } catch (e) {
      this.logGeminiFailure('synthèse', e);
      throw new ServiceUnavailableException('Impossible de générer la synthèse pour le moment.');
    }
  }
}
