import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Model } from 'mongoose';
import OpenAI from 'openai';

import type { ProjectDecisionDocument } from '../project-decisions/schemas/project-decision.schema';
import { Project, ProjectDocument } from './schemas/project.schema';
import { Sprint, SprintDocument } from './schemas/sprint.schema';
import { Task, TaskDocument, TaskPriority } from './schemas/task.schema';

const LLM_TIMEOUT_MS = 60_000;

interface SprintPlanJson {
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  tasks: Array<{
    title: string;
    description: string;
    requiredProfile: string;
    priority: string;
    estimatedHours: number;
    deliverable: string;
  }>;
}

interface PlanJson {
  sprints: SprintPlanJson[];
}

@Injectable()
export class ProposalPlanGeneratorService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  /**
   * Crée sprints + tâches à partir de la proposition acceptée (aucun sprint existant).
   */
  async generateSprintsFromAcceptedProposal(
    projectId: string,
    project: ProjectDocument,
    decision: ProjectDecisionDocument,
  ): Promise<{ sprintsCreated: number; tasksCreated: number }> {
    const existingSprints = await this.sprintModel.countDocuments({ projectId }).exec();
    if (existingSprints > 0) {
      return { sprintsCreated: 0, tasksCreated: 0 };
    }

    let plan: PlanJson;
    try {
      plan = await this.withTimeout(
        this.callLlmForPlan(project, decision),
        LLM_TIMEOUT_MS,
        'Timeout génération plan',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[ProposalPlan] LLM indisponible, plan de secours:', msg);
      plan = this.fallbackPlan(project, decision);
    }

    let sprintsCreated = 0;
    let tasksCreated = 0;
    const pid = String(project._id);

    for (const sp of plan.sprints ?? []) {
      const start = new Date(sp.startDate);
      const end = new Date(sp.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

      const sprint = await this.sprintModel.create({
        title: sp.title?.slice(0, 200) || 'Sprint',
        goal: sp.goal || '—',
        startDate: start,
        endDate: end,
        status: 'PLANNED',
        projectId: pid,
      });
      sprintsCreated += 1;
      const sid = String(sprint._id);

      for (const t of sp.tasks ?? []) {
        const priority = this.normalizePriority(t.priority);
        await this.taskModel.create({
          title: t.title?.slice(0, 300) || 'Tâche',
          description: t.description || '—',
          requiredProfile: (t.requiredProfile || 'Fullstack').trim(),
          assignedEmployeeId: null,
          priority,
          estimatedHours: Math.max(1, Number(t.estimatedHours) || 4),
          status: 'TODO',
          deliverable: (t.deliverable || 'Livrable').trim(),
          sprintId: sid,
        });
        tasksCreated += 1;
      }
    }

    await this.projectModel.updateOne({ _id: project._id }, { $set: { updatedAt: new Date() } }).exec();

    return { sprintsCreated, tasksCreated };
  }

  private normalizePriority(p: string | undefined): TaskPriority {
    const u = (p ?? 'MEDIUM').toUpperCase();
    if (u === 'LOW' || u === 'HIGH' || u === 'MEDIUM') return u as TaskPriority;
    return 'MEDIUM';
  }

  private async callLlmForPlan(
    project: ProjectDocument,
    decision: ProjectDecisionDocument,
  ): Promise<PlanJson> {
    const ctx = {
      title: project.title,
      description: project.description,
      type_projet: decision.type_projet,
      budget_estime: decision.budget_estime,
      periode: decision.periode,
      name: decision.name,
      techStack: project.techStack ?? [],
      tags: project.tags ?? [],
    };

    const user = `Réponds UNIQUEMENT avec un JSON valide, sans markdown, de la forme:
{"sprints":[{"title":"...","goal":"...","startDate":"ISO","endDate":"ISO","tasks":[{"title":"...","description":"...","requiredProfile":"Backend|Frontend|Fullstack|...","priority":"LOW|MEDIUM|HIGH","estimatedHours":8,"deliverable":"..."}]}]}
Contexte projet (ne pas inventer d'autres champs) :
${JSON.stringify(ctx)}
Génère 2 à 4 sprints cohérents avec la période et le type de projet.`;

    const system =
      'Tu es un chef de projet technique. Tu produis uniquement du JSON strict, sans texte avant ou après.';

    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ??
      this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    if (geminiKey?.trim()) {
      const modelName = this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
      });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
      });
      const text = result.response.text()?.trim();
      if (text) return this.parsePlanJson(text);
    }

    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openaiKey?.trim() && !openaiKey.includes('your-openai')) {
      const openai = new OpenAI({ apiKey: openaiKey, timeout: LLM_TIMEOUT_MS });
      const completion = await openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 4096,
        temperature: 0.2,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return this.parsePlanJson(content);
    }

    throw new Error('Aucun LLM disponible');
  }

  private parsePlanJson(raw: string): PlanJson {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as PlanJson;
    if (!parsed?.sprints || !Array.isArray(parsed.sprints)) {
      throw new Error('JSON de plan invalide');
    }
    return parsed;
  }

  private fallbackPlan(
    project: ProjectDocument,
    decision: ProjectDecisionDocument,
  ): PlanJson {
    const now = new Date();
    const end1 = new Date(now);
    end1.setDate(end1.getDate() + 14);
    const start2 = new Date(end1);
    const end2 = new Date(end1);
    end2.setDate(end2.getDate() + 14);

    const baseProfile =
      (project.techStack?.[0] || 'Fullstack').replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 40) ||
      'Fullstack';

    return {
      sprints: [
        {
          title: 'Sprint 1 — Fondations',
          goal: `Mettre en place le socle pour : ${decision.type_projet || project.title}`,
          startDate: now.toISOString(),
          endDate: end1.toISOString(),
          tasks: [
            {
              title: 'Analyse et cadrage',
              description: project.description || decision.type_projet || '—',
              requiredProfile: baseProfile,
              priority: 'HIGH',
              estimatedHours: 12,
              deliverable: 'Document de cadrage',
            },
            {
              title: 'Architecture technique',
              description: `Stack / périmètre : ${(project.techStack ?? []).join(', ') || 'à définir'}`,
              requiredProfile: baseProfile,
              priority: 'MEDIUM',
              estimatedHours: 8,
              deliverable: 'Schéma d’architecture',
            },
          ],
        },
        {
          title: 'Sprint 2 — Livraison incrémentale',
          goal: 'Itération et intégration',
          startDate: start2.toISOString(),
          endDate: end2.toISOString(),
          tasks: [
            {
              title: 'Implémentation principale',
              description: decision.periode
                ? `Période prévue : ${decision.periode}`
                : 'Développement des fonctionnalités',
              requiredProfile: baseProfile,
              priority: 'HIGH',
              estimatedHours: 16,
              deliverable: 'Version intermédiaire',
            },
          ],
        },
      ],
    };
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
    ]);
  }
}
