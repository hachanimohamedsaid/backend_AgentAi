import {
  effectiveStressScores,
  type WellbeingDimension,
  WELLBEING_QUESTIONS,
} from './questions';

export type DominantStressType = 'COGNITIVE' | 'EMOTIONAL' | 'PHYSICAL';

export interface ComputedScores {
  stressScore: number;
  level: string;
  cogAvg: number;
  emoAvg: number;
  phyAvg: number;
  dominant: DominantStressType;
  signature: string;
  trend: string;
  emoji: string;
  color: string;
}

const SUM_MIN = 9;
const SUM_MAX = 45;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function stressScoreFromSum(sumEffective: number): number {
  const clamped = Math.min(SUM_MAX, Math.max(SUM_MIN, sumEffective));
  return Math.round(((clamped - SUM_MIN) / (SUM_MAX - SUM_MIN)) * 100);
}

export function bandFromStressScore(score: number): {
  level: string;
  emoji: string;
  color: string;
} {
  if (score <= 20) {
    return { level: 'BALANCED', emoji: '🌿', color: '#4ade80' };
  }
  if (score <= 40) {
    return { level: 'EARLY PRESSURE', emoji: '🌤️', color: '#fbbf24' };
  }
  if (score <= 60) {
    return { level: 'STRUCTURED RESET', emoji: '⚡', color: '#fb923c' };
  }
  if (score <= 80) {
    return { level: 'ACTIVE RECOVERY', emoji: '🔥', color: '#f97316' };
  }
  return { level: 'CRITICAL INTERVENTION', emoji: '🚨', color: '#ef4444' };
}

function indicesForDimension(dim: WellbeingDimension): number[] {
  const out: number[] = [];
  WELLBEING_QUESTIONS.forEach((q, i) => {
    if (q.dimension === dim) {
      out.push(i);
    }
  });
  return out;
}

function dimensionAverages(effective: number[]): {
  cogAvg: number;
  emoAvg: number;
  phyAvg: number;
} {
  const avg = (indices: number[]) =>
    indices.reduce((s, i) => s + effective[i], 0) / indices.length;

  return {
    cogAvg: round1(avg(indicesForDimension('cognitive'))),
    emoAvg: round1(avg(indicesForDimension('emotional'))),
    phyAvg: round1(avg(indicesForDimension('physical'))),
  };
}

export function dominantType(
  cogAvg: number,
  emoAvg: number,
  phyAvg: number,
): DominantStressType {
  if (cogAvg >= emoAvg && cogAvg >= phyAvg) {
    return 'COGNITIVE';
  }
  if (emoAvg >= phyAvg) {
    return 'EMOTIONAL';
  }
  return 'PHYSICAL';
}

const HIGH = 3.6;
const LOW = 2.4;

export function stressSignature(
  cogAvg: number,
  emoAvg: number,
  phyAvg: number,
): string {
  const hi = (n: number) => n >= HIGH;
  const lo = (n: number) => n <= LOW;
  const countHigh = [cogAvg, emoAvg, phyAvg].filter(hi).length;
  if (countHigh === 0) {
    return 'Moderate load across dimensions — no single channel dominates sharply.';
  }
  if (hi(cogAvg) && !hi(emoAvg) && !hi(phyAvg)) {
    return 'Cognitive overload pattern — decisions and mental load lead.';
  }
  if (hi(emoAvg) && !hi(cogAvg) && !hi(phyAvg)) {
    return 'Emotional pressure pattern — isolation, guilt, or anxiety lead.';
  }
  if (hi(phyAvg) && !hi(cogAvg) && !hi(emoAvg)) {
    return 'Physical depletion pattern — body signals and energy lead.';
  }
  if (countHigh >= 2) {
    return 'Multi-channel strain — stress is showing up in more than one dimension.';
  }
  if (lo(cogAvg) && lo(emoAvg) && hi(phyAvg)) {
    return 'Physical-first profile with relatively lower cognitive/emotional averages.';
  }
  return 'Mixed profile — review dimension scores for where to intervene first.';
}

/**
 * Trend vs previous total score (0–100). Positive delta = worse (higher stress).
 */
export function trendFromPrevious(
  currentScore: number,
  previousScore: number | undefined | null,
): string {
  if (
    previousScore === undefined ||
    previousScore === null ||
    Number.isNaN(previousScore)
  ) {
    return 'First Assessment';
  }
  const diff = currentScore - previousScore;
  if (diff < -10) {
    return 'Recovering';
  }
  if (diff <= 10) {
    return 'Stable';
  }
  if (diff <= 20) {
    return 'Deteriorating';
  }
  return 'Accelerating Collapse';
}

export function computeDiagnostic(
  answers: number[],
  previousScore?: number | null,
): ComputedScores {
  const effective = effectiveStressScores(answers);
  const sum = effective.reduce((a, b) => a + b, 0);
  const stressScore = stressScoreFromSum(sum);
  const { level, emoji, color } = bandFromStressScore(stressScore);
  const { cogAvg, emoAvg, phyAvg } = dimensionAverages(effective);
  const dominant = dominantType(cogAvg, emoAvg, phyAvg);
  const signature = stressSignature(cogAvg, emoAvg, phyAvg);
  const trend = trendFromPrevious(stressScore, previousScore);

  return {
    stressScore,
    level,
    cogAvg,
    emoAvg,
    phyAvg,
    dominant,
    signature,
    trend,
    emoji,
    color,
  };
}
