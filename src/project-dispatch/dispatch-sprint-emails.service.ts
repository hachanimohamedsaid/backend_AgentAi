import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { InjectModel } from '@nestjs/mongoose';
import Handlebars from 'handlebars';
import { Model, Types } from 'mongoose';

import { DispatchEmailLlmService, DispatchPayloadJson } from '../ai/dispatch-email-llm.service';
import {
  TaskAssignmentLlmService,
  type TaskAssignmentLlmInput,
} from '../ai/task-assignment-llm.service';
import { ProjectDecisionsService } from '../project-decisions/project-decisions.service';
import { ProposalPlanGeneratorService } from '../pm/proposal-plan-generator.service';
import { Employee, EmployeeDocument } from '../pm/schemas/employee.schema';
import { Project, ProjectDocument } from '../pm/schemas/project.schema';
import { Sprint, SprintDocument } from '../pm/schemas/sprint.schema';
import { Task, TaskDocument } from '../pm/schemas/task.schema';
import {
  dispatchSprintEmailsBodySchema,
  type DispatchSprintEmailsBody,
} from './dispatch-sprint-emails.zod';

const FIXED_HTML_TEMPLATE = Handlebars.compile(`<h1>Vos missions — {{employee.fullName}}</h1>
<p><strong>Email :</strong> {{employee.email}}</p>
<p><strong>Profil :</strong> {{employee.profile}}</p>
<p><strong>Compétences :</strong> {{employee.skillsJoined}}</p>
<p><strong>Projet :</strong> {{project.title}}</p>
{{#each sprints}}
<h2>{{title}}</h2>
<p><strong>Objectif :</strong> {{goal}}</p>
<p><strong>Période :</strong> {{startDate}} → {{endDate}}</p>
<ul>
{{#each tasks}}
  <li>
    <p><strong>{{title}}</strong> — priorité {{priority}} — {{status}}</p>
    <p>Livrable : {{deliverable}}</p>
    <p>{{description}}</p>
  </li>
{{/each}}
</ul>
{{/each}}
`);

export interface DispatchSprintEmailsResult {
  message: string;
  sent: Array<{
    employeeId: string;
    email: string;
    filename?: string;
    dryRun?: boolean;
  }>;
  reports: Array<{
    employeeId: string;
    employeeName: string;
    email: string;
    subject: string;
    projectTitle: string;
    sprintCount: number;
    taskCount: number;
    contentSource: 'gemini' | 'openai' | 'fixed_template';
    llmModel?: string;
    htmlBody: string;
    pdfRequested: boolean;
    pdfSuppressed: boolean;
    suppressedPdfFilename?: string;
    emailSuppressed: true;
  }>;
  failed: Array<{ employeeId?: string; email?: string; reason: string; error: string }>;
  skippedUnassignedTaskCount: number;
  unassignedTasks: Array<{ taskId: string; sprintId: string }>;
  assignedCount: number;
  /** Tâches assignées via OpenAI (si activé). */
  aiAssignedCount?: number;
  /** Tâches assignées via correspondance texte (repli ou sans IA). */
  rulesAssignedCount?: number;
  emailsSent: number;
  sprintsCreated?: number;
  tasksCreated?: number;
}

@Injectable()
export class DispatchSprintEmailsService {
  private readonly logger = new Logger(DispatchSprintEmailsService.name);

  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Sprint.name) private readonly sprintModel: Model<SprintDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    private readonly dispatchLlm: DispatchEmailLlmService,
    private readonly taskAssignmentLlm: TaskAssignmentLlmService,
    private readonly projectDecisionsService: ProjectDecisionsService,
    private readonly proposalPlanGenerator: ProposalPlanGeneratorService,
  ) {}

  async run(
    projectIdRaw: string,
    bodyRaw: unknown,
  ): Promise<DispatchSprintEmailsResult> {
    // Accepte un ObjectId MongoDB (24 hex) OU un row_number numérique (ex: "2" envoyé par n8n/Flutter)
    let project: ProjectDocument | null = null;
    if (Types.ObjectId.isValid(projectIdRaw) && /^[a-fA-F0-9]{24}$/.test(projectIdRaw)) {
      project = await this.projectModel.findById(projectIdRaw).exec();
    } else {
      const rowNumber = parseInt(projectIdRaw, 10);
      if (isNaN(rowNumber) || rowNumber < 1) {
        throw new BadRequestException(
          `projectId doit être un ObjectId MongoDB (24 hex) ou un row_number ≥ 1. Reçu: "${projectIdRaw}"`,
        );
      }
      project = await this.projectModel.findOne({ row_number: rowNumber }).exec();

      // Si le projet n'existe pas encore, on tente de le créer depuis la décision acceptée
      if (!project) {
        const decision = await this.projectDecisionsService.findLatestDecisionForRow(rowNumber);
        if (decision && decision.action === 'accept') {
          const techFromType = (decision.type_projet ?? '')
            .split(/[,;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          project = await this.projectModel.findOneAndUpdate(
            { row_number: rowNumber },
            {
              $set: {
                title: decision.name,
                description: decision.type_projet ?? '',
                status: 'accepted',
                row_number: rowNumber,
                techStack: techFromType,
                type_projet: decision.type_projet ?? null,
                budget_estime: decision.budget_estime ?? null,
                periode: decision.periode ?? null,
                tags: techFromType,
              },
            },
            { upsert: true, new: true },
          ).exec();
          this.logger.log(`[Dispatch] Projet row_number=${rowNumber} auto-créé depuis la décision acceptée.`);
        }
      }
    }

    if (!project) {
      throw new NotFoundException(
        `Projet introuvable (row_number=${projectIdRaw}). Aucune décision acceptée trouvée pour cette ligne.`,
      );
    }

    // À partir d'ici on travaille toujours avec le vrai ObjectId MongoDB
    const projectId = String(project._id);

    let body: DispatchSprintEmailsBody;
    try {
      body = dispatchSprintEmailsBodySchema.parse(bodyRaw);
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new BadRequestException(e.flatten());
      }
      throw e;
    }

    const autoAssign = body.autoAssignTasksByProfile ?? false;
    const ensureProposal = body.ensureSprintsFromAcceptedProposal ?? false;
    const useAiForAssignment = body.useAiForTaskAssignment !== false;

    let sprintsCreated = 0;
    let tasksCreated = 0;

    if (ensureProposal && project.row_number != null) {
      const decision = await this.projectDecisionsService.findLatestDecisionForRow(
        project.row_number,
      );
      if (decision?.action === 'accept') {
        const gen = await this.proposalPlanGenerator.generateSprintsFromAcceptedProposal(
          projectId,
          project,
          decision,
        );
        sprintsCreated = gen.sprintsCreated;
        tasksCreated = gen.tasksCreated;
        const reloaded = await this.projectModel.findById(projectId).exec();
        if (reloaded) project = reloaded;
      }
    }

    let sprints = await this.sprintModel
      .find({ projectId })
      .sort({ startDate: 1 })
      .exec();
    let sprintIds = sprints.map((s) => String(s._id));

    let assignedCount = 0;
    let aiAssignedCount = 0;
    let rulesAssignedCount = 0;
    if (autoAssign && sprintIds.length > 0) {
      const employees = await this.employeeModel.find().exec();
      const r = await this.autoAssignTasksForProject(
        project,
        sprintIds,
        employees,
        { useAi: useAiForAssignment },
      );
      assignedCount = r.assigned;
      aiAssignedCount = r.aiAssigned;
      rulesAssignedCount = r.rulesAssigned;
      sprints = await this.sprintModel
        .find({ projectId })
        .sort({ startDate: 1 })
        .exec();
      sprintIds = sprints.map((s) => String(s._id));
    }

    if (sprintIds.length === 0) {
      return {
        message:
          'Aucun sprint pour ce projet. Utilisez ensureSprintsFromAcceptedProposal avec une proposition acceptée (row_number) ou créez des sprints manuellement.',
        sent: [],
        reports: [],
        failed: [],
        skippedUnassignedTaskCount: 0,
        unassignedTasks: [],
        assignedCount,
        aiAssignedCount,
        rulesAssignedCount,
        emailsSent: 0,
        sprintsCreated,
        tasksCreated,
      };
    }

    const tasks = await this.taskModel
      .find({ sprintId: { $in: sprintIds } })
      .exec();

    const unassignedTasks: Array<{ taskId: string; sprintId: string }> = [];
    let skippedUnassignedTaskCount = 0;

    for (const t of tasks) {
      if (t.assignedEmployeeId == null) {
        skippedUnassignedTaskCount += 1;
        unassignedTasks.push({
          taskId: String(t._id),
          sprintId: String(t.sprintId),
        });
      }
    }

    const byEmployee = new Map<string, TaskDocument[]>();
    for (const t of tasks) {
      if (t.assignedEmployeeId == null) continue;
      const eid = String(t.assignedEmployeeId);
      const list = byEmployee.get(eid) ?? [];
      list.push(t);
      byEmployee.set(eid, list);
    }

    const sent: DispatchSprintEmailsResult['sent'] = [];
    const reports: DispatchSprintEmailsResult['reports'] = [];
    const failed: DispatchSprintEmailsResult['failed'] = [];

    for (const [employeeId, empTasks] of byEmployee.entries()) {
      if (!Types.ObjectId.isValid(employeeId)) {
        failed.push({ employeeId, reason: 'Identifiant employé invalide', error: 'Identifiant employé invalide' });
        continue;
      }

      const employee = await this.employeeModel.findById(employeeId).exec();
      if (!employee) {
        failed.push({ employeeId, reason: 'Employé introuvable', error: 'Employé introuvable' });
        continue;
      }

      const email = (employee.email ?? '').trim();
      if (!email) {
        failed.push({ employeeId, reason: 'Email employé vide', error: 'Email employé vide' });
        continue;
      }

      const sprintBlocks = this.buildSprintBlocks(sprints, empTasks);
      const payloadJson: DispatchPayloadJson = {
        employee: {
          id: String(employee._id),
          email,
          fullName: employee.fullName,
          profile: employee.profile,
          skills: [...(employee.skills ?? []), ...(employee.tags ?? [])],
        },
        project: { id: String(project._id), title: project.title },
        sprints: sprintBlocks.map((b) => ({
          sprintId: String(b.sprint._id),
          title: b.sprint.title,
          goal: b.sprint.goal,
          startDate: (b.sprint.startDate as Date).toISOString(),
          endDate: (b.sprint.endDate as Date).toISOString(),
          tasks: b.tasks.map((tk) => ({
            title: tk.title,
            description: tk.description,
            priority: tk.priority,
            status: tk.status,
            deliverable: tk.deliverable,
          })),
        })),
      };

      let htmlBody: string;
      let contentSource: 'gemini' | 'openai' | 'fixed_template' = 'fixed_template';
      let llmModel: string | undefined;
      if (body.useLlmForEmailBody) {
        try {
          const report = await this.dispatchLlm.generateEmailReport(payloadJson);
          htmlBody = report.html;
          contentSource = report.provider;
          llmModel = report.model;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'LLM indisponible';
          this.logger.warn(`[DispatchSprintEmails] LLM indisponible, template fixe utilisé: ${msg}`);
          htmlBody = this.renderFixedTemplate(payloadJson);
        }
      } else {
        htmlBody = this.renderFixedTemplate(payloadJson);
      }

      const subject = `Missions — ${project.title} (${employee.fullName})`;
      const safeName = employee.fullName.replace(/[^\w\s-]/g, '').trim() || 'employee';
      const filename = `missions-${project.title}-${safeName}.pdf`.replace(/\s+/g, '-');
      reports.push({
        employeeId: String(employee._id),
        employeeName: employee.fullName,
        email,
        subject,
        projectTitle: project.title,
        sprintCount: sprintBlocks.length,
        taskCount: empTasks.length,
        contentSource,
        llmModel,
        htmlBody,
        pdfRequested: body.attachPdf,
        pdfSuppressed: body.attachPdf,
        suppressedPdfFilename: body.attachPdf ? filename : undefined,
        emailSuppressed: true,
      });
    }

    const emailsSent = 0;
    const message = this.buildSummaryMessage({
      reportsGenerated: reports.length,
      llmGeneratedCount: reports.filter((r) => r.contentSource !== 'fixed_template').length,
      fixedTemplateCount: reports.filter((r) => r.contentSource === 'fixed_template').length,
      failed: failed.length,
      assignedCount,
      aiAssignedCount,
      rulesAssignedCount,
      skippedUnassignedTaskCount,
      sprintsCreated,
      tasksCreated,
      dryRun: body.dryRun ?? false,
    });

    return {
      message,
      sent,
      reports,
      failed,
      skippedUnassignedTaskCount,
      unassignedTasks,
      assignedCount,
      aiAssignedCount,
      rulesAssignedCount,
      emailsSent,
      sprintsCreated,
      tasksCreated,
    };
  }

  private buildSummaryMessage(p: {
    reportsGenerated: number;
    llmGeneratedCount: number;
    fixedTemplateCount: number;
    failed: number;
    assignedCount: number;
    aiAssignedCount?: number;
    rulesAssignedCount?: number;
    skippedUnassignedTaskCount: number;
    sprintsCreated: number;
    tasksCreated: number;
    dryRun: boolean;
  }): string {
    const assignDetail =
      p.assignedCount > 0 &&
      p.aiAssignedCount != null &&
      p.rulesAssignedCount != null
        ? ` (${p.aiAssignedCount} via IA, ${p.rulesAssignedCount} correspondance texte)`
        : '';
    if (p.dryRun) {
      return `Simulation (dryRun) : ${p.reportsGenerated} rapport(s) préparé(s), ${p.failed} échec(s) simulé(s). Aucun e-mail envoyé et aucun PDF généré. Contenu LLM : ${p.llmGeneratedCount}, template fixe : ${p.fixedTemplateCount}. Assignations auto : ${p.assignedCount}${assignDetail}. Sprints créés : ${p.sprintsCreated}, tâches créées : ${p.tasksCreated}. Tâches sans assigné : ${p.skippedUnassignedTaskCount}.`;
    }
    return `Rapport généré : ${p.reportsGenerated} synthèse(s), ${p.failed} échec(s). Aucun e-mail envoyé et aucun PDF généré. Contenu LLM : ${p.llmGeneratedCount}, template fixe : ${p.fixedTemplateCount}. Assignations automatiques : ${p.assignedCount}${assignDetail}. Sprints générés : ${p.sprintsCreated}, tâches générées : ${p.tasksCreated}. Tâches encore sans assigné : ${p.skippedUnassignedTaskCount}.`;
  }

  private buildTaskAssignmentLlmPayload(
    project: ProjectDocument,
    unassignedTasks: TaskDocument[],
    employees: EmployeeDocument[],
  ): TaskAssignmentLlmInput {
    return {
      project: {
        title: project.title,
        description: project.description,
        type_projet: project.type_projet ?? undefined,
        techStack: [...(project.techStack ?? [])],
        tags: [...(project.tags ?? [])],
      },
      tasks: unassignedTasks.map((t) => ({
        taskId: String(t._id),
        title: t.title,
        description: t.description,
        requiredProfile: (t.requiredProfile ?? '').trim(),
        deliverable: t.deliverable,
      })),
      employees: employees.map((e) => ({
        employeeId: String(e._id),
        fullName: e.fullName,
        profile: e.profile,
        skills: [...(e.skills ?? [])],
        tags: [...(e.tags ?? [])],
      })),
    };
  }

  private async autoAssignTasksForProject(
    project: ProjectDocument,
    sprintIds: string[],
    employees: EmployeeDocument[],
    options: { useAi: boolean },
  ): Promise<{ assigned: number; aiAssigned: number; rulesAssigned: number }> {
    let tasks = await this.taskModel
      .find({ sprintId: { $in: sprintIds } })
      .exec();

    let aiAssigned = 0;

    const isUnassigned = (t: TaskDocument) =>
      t.assignedEmployeeId == null || String(t.assignedEmployeeId).length === 0;

    let unassignedForAi = tasks.filter(isUnassigned);

    if (options.useAi && unassignedForAi.length > 0) {
      const payload = this.buildTaskAssignmentLlmPayload(
        project,
        unassignedForAi,
        employees,
      );
      const map = await this.taskAssignmentLlm.suggestAssignments(payload);
      if (map) {
        for (const [taskId, employeeId] of map) {
          const task = unassignedForAi.find((t) => String(t._id) === taskId);
          if (!task) continue;
          await this.taskModel
            .updateOne({ _id: task._id }, { assignedEmployeeId: employeeId })
            .exec();
          aiAssigned += 1;
          this.logger.debug(
            `[autoAssign][IA] taskId=${taskId} → employeeId=${employeeId}`,
          );
        }
      }
    }

    tasks = await this.taskModel
      .find({ sprintId: { $in: sprintIds } })
      .exec();

    const projectCorpusNorm = this.buildProjectCorpusNormalized(project);
    const matchingProject = employees.filter((e) =>
      this.employeeProfileMatchesProject(e, projectCorpusNorm),
    );
    /** Si aucun mot commun projet / profil : on répartit quand même sur toute l’équipe (repli opérationnel). */
    const projectPool =
      matchingProject.length > 0 ? matchingProject : employees;

    const assignmentCounts = new Map<string, number>();
    for (const emp of employees) {
      assignmentCounts.set(String(emp._id), 0);
    }

    let rulesAssigned = 0;
    for (const task of tasks) {
      if (task.assignedEmployeeId != null && String(task.assignedEmployeeId).length > 0) {
        continue;
      }

      const taskNeedNorm = this.buildTaskNeedNormalized(task);
      let pool = projectPool;
      if (taskNeedNorm.length > 0) {
        const forTask = projectPool.filter((e) =>
          this.employeeMatchesTaskNeed(e, taskNeedNorm),
        );
        if (forTask.length > 0) {
          pool = forTask;
        }
      }

      const chosen =
        pool.length > 0 ? this.pickLeastLoadedEmployee(pool, assignmentCounts) : null;

      if (chosen) {
        await this.taskModel
          .updateOne(
            { _id: task._id },
            { assignedEmployeeId: String(chosen._id) },
          )
          .exec();
        const eid = String(chosen._id);
        assignmentCounts.set(eid, (assignmentCounts.get(eid) ?? 0) + 1);
        rulesAssigned += 1;
        this.logger.debug(
          `[autoAssign][texte] taskId=${String(task._id)} sprintId=${String(task.sprintId)} ` +
            `assignedEmployeeId=${eid}`,
        );
      } else {
        this.logger.debug(
          `[autoAssign][texte] taskId=${String(task._id)} aucun employé éligible (équipe vide ?).`,
        );
      }
    }

    return {
      assigned: aiAssigned + rulesAssigned,
      aiAssigned,
      rulesAssigned,
    };
  }

  /** Texte projet normalisé pour correspondance avec profils employés. */
  private buildProjectCorpusNormalized(project: ProjectDocument): string {
    return this.normalizeForMatch(
      [
        project.title,
        project.description,
        ...(project.techStack ?? []),
        ...(project.tags ?? []),
        project.type_projet ?? '',
        project.budget_estime != null ? String(project.budget_estime) : '',
        project.periode ?? '',
      ].join(' '),
    );
  }

  /** Besoin tâche (profil requis + titre / description) pour affiner parmi les employés déjà alignés projet. */
  private buildTaskNeedNormalized(task: TaskDocument): string {
    const raw = (task.requiredProfile ?? '').trim();
    if (raw.length > 0) {
      return this.normalizeForMatch(raw);
    }
    return this.normalizeForMatch(
      [task.title, task.description, task.deliverable].filter(Boolean).join(' '),
    );
  }

  /** Correspondance : le libellé de profil ou une compétence / tag apparaît dans le corpus projet, ou mots communs. */
  private employeeProfileMatchesProject(
    employee: EmployeeDocument,
    projectCorpusNorm: string,
  ): boolean {
    if (!projectCorpusNorm || projectCorpusNorm.length < 2) {
      return false;
    }
    const profile = this.normalizeForMatch(employee.profile ?? '');
    const skills = [...(employee.skills ?? []), ...(employee.tags ?? [])].map((x) =>
      this.normalizeForMatch(String(x)),
    );

    if (profile.length >= 2 && projectCorpusNorm.includes(profile)) {
      return true;
    }
    for (const s of skills) {
      if (s.length >= 3 && projectCorpusNorm.includes(s)) {
        return true;
      }
    }

    const projectTokens = this.extractMatchTokens(projectCorpusNorm);
    const empTokens = this.extractMatchTokens([profile, ...skills].join(' '));
    for (const t of empTokens) {
      if (t.length > 2 && projectTokens.has(t)) {
        return true;
      }
    }
    return false;
  }

  /** Sous-ensemble : employé déjà OK projet et recoupement avec le besoin de la tâche. */
  private employeeMatchesTaskNeed(employee: EmployeeDocument, taskNeedNorm: string): boolean {
    if (!taskNeedNorm || taskNeedNorm.length < 2) {
      return true;
    }
    const profile = this.normalizeForMatch(employee.profile ?? '');
    const skills = [...(employee.skills ?? []), ...(employee.tags ?? [])].map((x) =>
      this.normalizeForMatch(String(x)),
    );
    if (profile.length >= 2 && taskNeedNorm.includes(profile)) {
      return true;
    }
    if (profile.length >= 2 && profile.includes(taskNeedNorm)) {
      return true;
    }
    for (const s of skills) {
      if (s.length >= 3 && (taskNeedNorm.includes(s) || s.includes(taskNeedNorm))) {
        return true;
      }
    }
    const needTokens = this.extractMatchTokens(taskNeedNorm);
    const empTokens = this.extractMatchTokens([profile, ...skills].join(' '));
    for (const t of needTokens) {
      if (t.length > 2 && empTokens.has(t)) {
        return true;
      }
    }
    return false;
  }

  private extractMatchTokens(norm: string): Set<string> {
    const set = new Set<string>();
    for (const t of norm.split(/[^a-z0-9]+/)) {
      if (t.length > 2) {
        set.add(t);
      }
    }
    return set;
  }

  /** Répartition équitable parmi les employés éligibles (même correspondance profil ↔ projet). */
  private pickLeastLoadedEmployee(
    employees: EmployeeDocument[],
    counts: Map<string, number>,
  ): EmployeeDocument {
    let best = employees[0];
    let bestC = counts.get(String(best._id)) ?? 0;
    for (const e of employees) {
      const c = counts.get(String(e._id)) ?? 0;
      if (c < bestC) {
        bestC = c;
        best = e;
      }
    }
    return best;
  }

  /**
   * Minuscules + suppression des accents (compatible matching « Backend » / « backend », etc.).
   */
  private normalizeForMatch(s: string): string {
    return s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  }

  private buildSprintBlocks(
    sprints: SprintDocument[],
    empTasks: TaskDocument[],
  ): Array<{ sprint: SprintDocument; tasks: TaskDocument[] }> {
    const taskBySprint = new Map<string, TaskDocument[]>();
    for (const t of empTasks) {
      const sid = String(t.sprintId);
      const list = taskBySprint.get(sid) ?? [];
      list.push(t);
      taskBySprint.set(sid, list);
    }

    const blocks: Array<{ sprint: SprintDocument; tasks: TaskDocument[] }> = [];
    for (const sp of sprints) {
      const sid = String(sp._id);
      const ts = taskBySprint.get(sid);
      if (ts?.length) {
        blocks.push({ sprint: sp, tasks: ts });
      }
    }
    return blocks;
  }

  private renderFixedTemplate(payload: DispatchPayloadJson): string {
    return FIXED_HTML_TEMPLATE({
      employee: {
        ...payload.employee,
        skillsJoined:
          payload.employee.skills?.length > 0
            ? payload.employee.skills.join(', ')
            : 'non renseigné',
      },
      project: payload.project,
      sprints: payload.sprints.map((s) => ({
        ...s,
        startDate: s.startDate.slice(0, 10),
        endDate: s.endDate.slice(0, 10),
        tasks: s.tasks.map((t) => ({
          ...t,
          description: t.description || 'non renseigné',
          deliverable: t.deliverable || 'non renseigné',
        })),
      })),
    });
  }
}
