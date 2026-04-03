import { z } from 'zod';

/** Identifiant MongoDB 24 hex (ObjectId). */
export const mongoObjectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Identifiant MongoDB invalide (24 caractères hex)');

export const dispatchSprintEmailsBodySchema = z.object({
  useLlmForEmailBody: z.boolean(),
  attachPdf: z.boolean(),
  dryRun: z.boolean().optional(),
  /** Avant envoi : assigner les tâches sans assigné selon profil / compétences / besoins projet. */
  autoAssignTasksByProfile: z.boolean().optional(),
  /** Si true (défaut) : priorité à l’IA (OpenAI) pour choisir l’employé par tâche ; sinon uniquement correspondance texte. */
  useAiForTaskAssignment: z.boolean().optional(),
  /** Si proposition acceptée liée (row_number) : générer sprints + tâches (LLM ou secours). */
  ensureSprintsFromAcceptedProposal: z.boolean().optional(),
});

export type DispatchSprintEmailsBody = z.infer<typeof dispatchSprintEmailsBodySchema>;
