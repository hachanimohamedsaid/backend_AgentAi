import {
  computeDiagnostic,
  stressScoreFromSum,
  trendFromPrevious,
} from './scoring';
import { effectiveStressScores } from './questions';

describe('stressScoreFromSum', () => {
  it('maps min sum 9 to 0', () => {
    expect(stressScoreFromSum(9)).toBe(0);
  });
  it('maps max sum 45 to 100', () => {
    expect(stressScoreFromSum(45)).toBe(100);
  });
  it('maps midpoint 27 to 50', () => {
    expect(stressScoreFromSum(27)).toBe(50);
  });
});

describe('effectiveStressScores (Q2 reverse)', () => {
  it('reverses only question 2', () => {
    const answers = [3, 5, 3, 3, 3, 3, 3, 3, 3];
    const eff = effectiveStressScores(answers);
    expect(eff[0]).toBe(3);
    expect(eff[1]).toBe(1);
    expect(eff[2]).toBe(3);
  });
});

describe('computeDiagnostic', () => {
  it('marks first assessment when no previous score', () => {
    const allMid = [3, 3, 3, 3, 3, 3, 3, 3, 3];
    const r = computeDiagnostic(allMid);
    expect(r.trend).toBe('First Assessment');
    expect(r.stressScore).toBe(50);
  });

  it('detects stable trend', () => {
    const allMid = [3, 3, 3, 3, 3, 3, 3, 3, 3];
    const r = computeDiagnostic(allMid, 52);
    expect(r.trend).toBe('Stable');
  });

  it('detects accelerating collapse', () => {
    const high = [5, 1, 5, 5, 5, 5, 5, 5, 5];
    const r = computeDiagnostic(high, 20);
    expect(r.trend).toBe('Accelerating Collapse');
  });
});

describe('trendFromPrevious', () => {
  it('returns First Assessment when previous missing', () => {
    expect(trendFromPrevious(50, undefined)).toBe('First Assessment');
    expect(trendFromPrevious(50, null)).toBe('First Assessment');
  });
});
