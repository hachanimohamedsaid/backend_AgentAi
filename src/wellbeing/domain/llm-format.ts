import type { ComputedScores } from './scoring';
import { getRecoveryProtocol } from './proposal';

/**
 * Fixed structured block for the LLM — facts only; model must not recompute scores.
 */
export function formatDiagnosticForLlm(scores: ComputedScores): string {
  const proposal = getRecoveryProtocol(scores);

  const lines = [
    '=== AVA WELLBEING DIAGNOSTIC (FACTS — DO NOT CHANGE NUMBERS) ===',
    `Overall stress score (0-100): ${scores.stressScore}`,
    `Stress band: ${scores.level}`,
    `Dominant stress type: ${scores.dominant}`,
    `Cognitive average (1-5 stress scale): ${scores.cogAvg}`,
    `Emotional average (1-5 stress scale): ${scores.emoAvg}`,
    `Physical average (1-5 stress scale): ${scores.phyAvg}`,
    `Stress signature: ${scores.signature}`,
    `Trend vs previous assessment: ${scores.trend}`,
    '',
    '=== ENGINE HINTS (recovery taxonomy) ===',
    `Protocol type: ${proposal.protocolType}`,
    `Intensity: ${proposal.intensity}`,
    `Archetypes: ${proposal.archetypes.join('; ')}`,
    '',
    'TASK: Write empathetic HTML (sections with headings and lists) for an entrepreneur.',
    'Interpret the facts above; do not contradict scores, band, dominant type, or trend.',
    'Include: What Your Results Reveal, The Hidden Risk, Your Recovery Protocol, Your 4-Week Roadmap.',
    'Use HTML tags like <h3>, <p>, <ul>, <li>, <strong>. No markdown.',
  ];

  return lines.join('\n');
}
