import type { ComputedScores } from './domain/scoring';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Deterministic HTML when OpenAI is off or errors — mirrors product structure. */
export function buildMockWellbeingNarrative(scores: ComputedScores): string {
  const level = escapeHtml(scores.level);
  const dom = escapeHtml(scores.dominant);
  const trend = escapeHtml(scores.trend);
  const sig = escapeHtml(scores.signature);

  const recoveryBullets =
    scores.dominant === 'COGNITIVE'
      ? [
          'Block 2 hours weekly for “decision hygiene”: list decisions, defer non-urgent, delegate one item.',
          'Add a hard evening shutdown: same end time, no inbox after.',
          'One weekly session with a peer or advisor to offload ambiguity.',
        ]
      : scores.dominant === 'EMOTIONAL'
        ? [
            'Schedule one non-negotiable connection block (peer, mentor, or community).',
            'Name guilt explicitly when resting — treat rest as performance fuel.',
            'Short weekly financial reality check to reduce background anxiety.',
          ]
        : [
            'Sleep + stimulant audit: track caffeine cut-off and deep sleep.',
            'Two micro-movement breaks daily (even 7 minutes counts).',
            'If tension/headaches persist 2+ weeks, book a clinical screen.',
          ];

  const roadmap = [
    '<strong>Week 1:</strong> One early night and one “real meal” daily.',
    '<strong>Week 2:</strong> Add two movement or body sessions; one digital curfew evening.',
    '<strong>Week 3:</strong> Block one rest day; optional half-day recovery (walk, spa, nature).',
    '<strong>Week 4:</strong> If scores stay elevated, plan a 1–2 day recovery stay or deeper support.',
  ];

  const risk =
    scores.stressScore >= 76
      ? 'At this band, unmanaged strain can compound quickly — prioritize professional support alongside these steps.'
      : 'Unmanaged strain in your dominant channel often leaks into the others — early structure protects decision quality and health.';

  return `
<div class="ava-wellbeing-report">
  <h3>What Your Results Reveal</h3>
  <p>Your overall score is <strong>${scores.stressScore}/100</strong> (<strong>${level}</strong>). Dominant stress type: <strong>${dom}</strong>. Trend: <strong>${trend}</strong>.</p>
  <p>${sig}</p>
  <h3>The Hidden Risk</h3>
  <p>${risk}</p>
  <h3>Your Recovery Protocol</h3>
  <ul>
    ${recoveryBullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('\n    ')}
  </ul>
  <h3>Your 4-Week Roadmap</h3>
  <ul>
    ${roadmap.map((r) => `<li>${r}</li>`).join('\n    ')}
  </ul>
  <p><em>One retreat chosen well beats years of running on empty.</em></p>
</div>`.trim();
}
