import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Variables d’environnement :
 * - Gemini (priorité) : GEMINI_API_KEY ou GOOGLE_GEMINI_API_KEY, GEMINI_MODEL (défaut gemini-2.0-flash),
 *   optionnel GEMINI_FALLBACK_MODEL (ex. gemini-1.5-flash). En 429, attente plafonnée (~10s) puis autre modèle.
 * - Repli : OPENAI_API_KEY, optionnellement OPENAI_MODEL.
 * Ne jamais committer de clé : uniquement .env / secrets déploiement.
 */
const SYSTEM_PROMPT = `Tu es un chef de projet technique. On te fournit un projet et des tâches à répartir entre des employés (profil, compétences, tags).
Règles :
- Assigne chaque tâche à exactement UN employé de la liste fournie.
- Choisis l’employé dont le profil et les compétences correspondent le mieux à la tâche (titre, description, profil requis, livrable) et au contexte du projet (type, description, stack, tags).
- Pour un projet mobile / Flutter, privilégie les profils orientés front mobile ou full-stack adaptés ; pour API / backend, privilégie backend / NestJS / MongoDB si pertinent.
- Réponds UNIQUEMENT avec un objet JSON, sans markdown ni texte avant/après : {"assignments":[{"taskId":"...","employeeId":"..."}]}
- Copie les identifiants taskId et employeeId EXACTEMENT tels qu’ils figurent dans les données (24 caractères hex MongoDB).`;

export interface TaskAssignmentLlmInput {
  project: {
    title: string;
    description?: string;
    type_projet?: string;
    techStack?: string[];
    tags?: string[];
  };
  /** Chaque tâche expose taskId (ObjectId 24 hex) pour que le modèle le recopie à l'identique dans la réponse. */
  tasks: Array<{
    taskId: string;
    title: string;
    description: string;
    requiredProfile: string;
    deliverable: string;
  }>;
  employees: Array<{
    employeeId: string;
    fullName: string;
    profile: string;
    skills: string[];
    tags: string[];
  }>;
}

const LLM_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 8192;
/** Plafond d’attente entre deux essais 429 (l’API peut suggérer 60s+ ; on préfère basculer plus vite vers autre modèle / OpenAI). */
const MAX_GEMINI_429_WAIT_MS = 10_000;
/** Une seule relance par modèle : évite de bloquer la requête HTTP plusieurs minutes. */
const MAX_ATTEMPTS_PER_GEMINI_MODEL = 2;

@Injectable()
export class TaskAssignmentLlmService {
  private readonly logger = new Logger(TaskAssignmentLlmService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Propose taskId → employeeId. Gemini en priorité, puis OpenAI. Retourne null si aucun LLM ou erreur.
   */
  async suggestAssignments(
    input: TaskAssignmentLlmInput,
  ): Promise<Map<string, string> | null> {
    if (input.tasks.length === 0 || input.employees.length === 0) {
      return null;
    }

    const userContent = JSON.stringify(input, null, 2);
    const userMessage =
      `Données JSON (projet, tâches, employés) :\n${userContent}`;

    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ??
      this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    if (geminiKey?.trim()) {
      const primaryModel =
        this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
      const fallbackModel = this.configService.get<string>('GEMINI_FALLBACK_MODEL')?.trim();
      try {
        const raw = await this.withTimeout(
          this.callGeminiWithRetries(geminiKey, userMessage, primaryModel, fallbackModel),
          LLM_TIMEOUT_MS,
          'Gemini timeout (assignation)',
        );
        const map = this.assignmentsFromJsonText(raw, input);
        if (map) {
          this.logger.log(`Assignation IA (Gemini) : ${map.size} tâche(s).`);
          return map;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Gemini assignation échoué, repli OpenAI : ${msg}`);
      }
    } else {
      this.logger.debug('GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY absente — essai OpenAI.');
    }

    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!openaiKey?.trim() || openaiKey.includes('your-openai')) {
      this.logger.debug('OPENAI_API_KEY absente ou placeholder — pas d’assignation IA.');
      return null;
    }

    try {
      const raw = await this.withTimeout(
        this.callOpenAI(openaiKey, userMessage),
        LLM_TIMEOUT_MS,
        'OpenAI timeout (assignation)',
      );
      const map = this.assignmentsFromJsonText(raw, input);
      if (map) {
        this.logger.log(`Assignation IA (OpenAI) : ${map.size} tâche(s).`);
        return map;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`OpenAI assignation échouée : ${msg}`);
    }

    return null;
  }

  /**
   * Un seul appel generateContent (sans responseMimeType) pour limiter la conso quota free tier.
   * Re-tentatives sur 429 avec délai suggéré par l’API ; puis modèle de secours si défini.
   */
  private async callGeminiWithRetries(
    apiKey: string,
    userMessage: string,
    primaryModel: string,
    fallbackModel: string | undefined,
  ): Promise<string> {
    const maxPerModel = MAX_ATTEMPTS_PER_GEMINI_MODEL;
    let lastErr: unknown;
    for (const modelName of [primaryModel, ...(fallbackModel ? [fallbackModel] : [])]) {
      if (!modelName) continue;
      for (let attempt = 1; attempt <= maxPerModel; attempt++) {
        try {
          return await this.callGeminiOnce(apiKey, userMessage, modelName);
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          const is429 =
            msg.includes('429') ||
            msg.includes('Too Many Requests') ||
            msg.includes('RESOURCE_EXHAUSTED');
          if (!is429) throw e;

          if (this.gemini429LikelyExhaustedForPeriod(msg)) {
            this.logger.warn(
              `Gemini ${modelName} : quota / limite atteinte (retry peu utile) — essai modèle suivant ou OpenAI.`,
            );
            break;
          }
          if (attempt === maxPerModel) {
            this.logger.warn(
              `Gemini ${modelName} : toujours 429 après ${maxPerModel} tentative(s).`,
            );
            break;
          }
          const waitMs = this.parseGeminiRetryDelayMs(e);
          this.logger.warn(
            `Gemini 429 (${modelName}) — attente ${waitMs}ms puis retry ${attempt + 1}/${maxPerModel}`,
          );
          if (waitMs > 0) {
            await this.sleep(waitMs);
          }
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(String(lastErr ?? 'Gemini indisponible'));
  }

  /** Quota journalier ou limite à 0 : inutile d’enchaîner les longues attentes. */
  private gemini429LikelyExhaustedForPeriod(msg: string): boolean {
    if (msg.includes('PerDay') && msg.includes('Quota exceeded')) return true;
    if (msg.includes('limit: 0') && msg.includes('free_tier')) return true;
    return false;
  }

  private parseGeminiRetryDelayMs(err: unknown): number {
    const msg = err instanceof Error ? err.message : String(err);
    let ms: number;
    const m = msg.match(/Please retry in ([\d.]+)s/i);
    if (m) {
      ms = Math.ceil(parseFloat(m[1]) * 1000) + 400;
    } else {
      const m2 = msg.match(/"retryDelay":"(\d+)s"/i);
      if (m2) {
        ms = parseInt(m2[1], 10) * 1000 + 400;
      } else {
        ms = 4_000;
      }
    }
    return Math.min(MAX_GEMINI_429_WAIT_MS, ms);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async callGeminiOnce(
    apiKey: string,
    userMessage: string,
    modelName: string,
  ): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.15,
      },
    });
    const text = result.response.text()?.trim();
    if (!text) throw new Error('Réponse Gemini vide');
    return text;
  }

  private async callOpenAI(apiKey: string, userMessage: string): Promise<string> {
    const openai = new OpenAI({ apiKey, timeout: LLM_TIMEOUT_MS });
    const completion = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.15,
      max_tokens: 4096,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('Réponse OpenAI vide');
    return raw;
  }

  private assignmentsFromJsonText(
    raw: string,
    input: TaskAssignmentLlmInput,
  ): Map<string, string> | null {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let parsed: { assignments?: Array<{ taskId?: string; employeeId?: string }> };
    try {
      parsed = JSON.parse(cleaned) as {
        assignments?: Array<{ taskId?: string; employeeId?: string }>;
      };
    } catch {
      this.logger.warn('JSON assignation invalide (parse).');
      return null;
    }
    const assignments = parsed.assignments;
    if (!Array.isArray(assignments)) {
      this.logger.warn('JSON sans tableau assignments.');
      return null;
    }

    const validTaskIds = new Set(input.tasks.map((t) => t.taskId));
    const validEmpIds = new Set(input.employees.map((e) => e.employeeId));
    const map = new Map<string, string>();

    for (const a of assignments) {
      const tid = a.taskId?.trim();
      const eid = a.employeeId?.trim();
      if (!tid || !eid) continue;
      if (!validTaskIds.has(tid) || !validEmpIds.has(eid)) {
        this.logger.debug(`Assignation ignorée (id invalide): task=${tid} emp=${eid}`);
        continue;
      }
      map.set(tid, eid);
    }

    if (map.size === 0) {
      this.logger.warn('Aucune assignation IA valide après filtrage.');
      return null;
    }
    return map;
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
    ]);
  }
}
