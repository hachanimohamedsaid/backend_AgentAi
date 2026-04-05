/** Canonical 9-item entrepreneur stress questionnaire (1–5 Likert). */

export type WellbeingDimension = 'cognitive' | 'emotional' | 'physical';

export interface WellbeingQuestionDef {
  index: number; // 1-based, order sent to API
  dimension: WellbeingDimension;
  text: string;
  /** When true, raw answer a is converted to stress as (6 - a). */
  reverseScore: boolean;
}

export const WELLBEING_QUESTIONS: readonly WellbeingQuestionDef[] = [
  {
    index: 1,
    dimension: 'cognitive',
    text: 'I feel mentally paralyzed by the number of decisions I must make daily.',
    reverseScore: false,
  },
  {
    index: 2,
    dimension: 'cognitive',
    text: 'I feel mentally clear and in control of my workload.',
    reverseScore: true,
  },
  {
    index: 3,
    dimension: 'cognitive',
    text: 'I go to bed still mentally processing work problems.',
    reverseScore: false,
  },
  {
    index: 4,
    dimension: 'emotional',
    text: 'I feel alone in carrying the weight of my responsibilities.',
    reverseScore: false,
  },
  {
    index: 5,
    dimension: 'emotional',
    text: "I feel guilty when I'm not working, even during rest time.",
    reverseScore: false,
  },
  {
    index: 6,
    dimension: 'emotional',
    text: 'I feel anxious about my finances or business performance.',
    reverseScore: false,
  },
  {
    index: 7,
    dimension: 'physical',
    text: 'I feel physically exhausted despite getting enough sleep.',
    reverseScore: false,
  },
  {
    index: 8,
    dimension: 'physical',
    text: 'I notice physical symptoms: tension, headaches, or fatigue.',
    reverseScore: false,
  },
  {
    index: 9,
    dimension: 'physical',
    text: 'I rely on caffeine or stimulants to maintain my performance.',
    reverseScore: false,
  },
] as const;

export const WELLBEING_ANSWER_COUNT = WELLBEING_QUESTIONS.length;

export function validateWellbeingAnswers(answers: number[]): string | null {
  if (!Array.isArray(answers)) {
    return 'answers must be an array';
  }
  if (answers.length !== WELLBEING_ANSWER_COUNT) {
    return `answers must have exactly ${WELLBEING_ANSWER_COUNT} items`;
  }
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 1 || a > 5) {
      return `answers[${i}] must be an integer from 1 to 5`;
    }
  }
  return null;
}

/** Per-question stress contribution on 1–5 (higher = more stress). */
export function effectiveStressScores(answers: number[]): number[] {
  return WELLBEING_QUESTIONS.map((q, i) => {
    const raw = answers[i];
    return q.reverseScore ? 6 - raw : raw;
  });
}
