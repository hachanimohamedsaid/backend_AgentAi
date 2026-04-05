import type { ComputedScores, DominantStressType } from './scoring';

export interface RecoveryProtocolHint {
  protocolType: string;
  intensity: 'low' | 'moderate' | 'high' | 'critical';
  archetypes: string[];
}

function intensityFromScore(
  stressScore: number,
): RecoveryProtocolHint['intensity'] {
  if (stressScore <= 20) {
    return 'low';
  }
  if (stressScore <= 60) {
    return 'moderate';
  }
  if (stressScore <= 80) {
    return 'high';
  }
  return 'critical';
}

function archetypesFor(dominant: DominantStressType, level: string): string[] {
  const base: Record<DominantStressType, string[]> = {
    COGNITIVE: [
      'Decision hygiene blocks',
      'Cognitive offload (delegate / defer)',
      'Evening shutdown ritual',
    ],
    EMOTIONAL: [
      'Connection blocks with peers or mentor',
      'Guilt boundaries around rest',
      'Financial anxiety check-in cadence',
    ],
    PHYSICAL: [
      'Sleep and stimulant audit',
      'Movement micro-sessions',
      'Body signal tracking (tension, headaches)',
    ],
  };
  const a = [...base[dominant]];
  if (level.includes('CRITICAL')) {
    a.push('Professional support screening');
  }
  return a;
}

function protocolType(level: string, dominant: DominantStressType): string {
  const d = dominant.toLowerCase();
  if (level.includes('BALANCED')) {
    return `maintenance_${d}`;
  }
  if (level.includes('EARLY')) {
    return `early_pressure_${d}`;
  }
  if (level.includes('STRUCTURED')) {
    return `structured_reset_${d}`;
  }
  if (level.includes('ACTIVE')) {
    return `active_recovery_${d}`;
  }
  return `critical_intervention_${d}`;
}

/** Library hints for prompts and future APIs — not the HTTP JSON contract itself. */
export function getRecoveryProtocol(
  scores: ComputedScores,
): RecoveryProtocolHint {
  return {
    protocolType: protocolType(scores.level, scores.dominant),
    intensity: intensityFromScore(scores.stressScore),
    archetypes: archetypesFor(scores.dominant, scores.level),
  };
}
