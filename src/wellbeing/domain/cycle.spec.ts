import {
  currentCycleKeyUtc,
  effectiveAnchorDayUtc,
  nextCycleStartUtc,
} from './cycle';

describe('effectiveAnchorDayUtc', () => {
  it('clamps 31 to last day in February', () => {
    expect(effectiveAnchorDayUtc(2026, 1, 31)).toBe(28);
  });
});

describe('currentCycleKeyUtc', () => {
  it('uses previous month when before anchor', () => {
    const d = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));
    expect(currentCycleKeyUtc(d, 15)).toBe('2025-12');
  });

  it('uses current month when on or after anchor', () => {
    const d = new Date(Date.UTC(2026, 0, 16, 12, 0, 0));
    expect(currentCycleKeyUtc(d, 15)).toBe('2026-01');
  });
});

describe('nextCycleStartUtc', () => {
  it('returns next anchor after current cycle', () => {
    const d = new Date(Date.UTC(2026, 0, 10, 12, 0, 0));
    const next = nextCycleStartUtc(d, 15);
    expect(next.toISOString().startsWith('2026-01-15')).toBe(true);
  });
});
