/**
 * Monthly diagnostic cycles anchored to the user's registration day-of-month.
 * Uses UTC calendar dates for deterministic server behaviour.
 */

export function daysInMonthUtc(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Clamp anchor (e.g. 31) to the last day of the given month. */
export function effectiveAnchorDayUtc(
  year: number,
  month0: number,
  anchorDay: number,
): number {
  const dim = daysInMonthUtc(year, month0);
  return Math.min(Math.max(1, anchorDay), dim);
}

/**
 * Cycle key identifies the period start month (YYYY-MM) in UTC.
 * If today is before the effective anchor this month, the active cycle started in the previous month.
 */
export function currentCycleKeyUtc(
  now: Date,
  diagnosticAnchorDay: number,
): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const eff = effectiveAnchorDayUtc(y, m, diagnosticAnchorDay);

  let startY = y;
  let startM = m;
  if (d < eff) {
    const prev = new Date(Date.UTC(y, m, 1));
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    startY = prev.getUTCFullYear();
    startM = prev.getUTCMonth();
  }

  return `${startY}-${String(startM + 1).padStart(2, '0')}`;
}

/** First instant of the next cycle (UTC). */
export function nextCycleStartUtc(
  now: Date,
  diagnosticAnchorDay: number,
): Date {
  const key = currentCycleKeyUtc(now, diagnosticAnchorDay);
  const [ys, ms] = key.split('-');
  const startY = Number(ys);
  const startM0 = Number(ms) - 1;
  const next = new Date(Date.UTC(startY, startM0 + 1, 1));
  const ny = next.getUTCFullYear();
  const nm = next.getUTCMonth();
  const day = effectiveAnchorDayUtc(ny, nm, diagnosticAnchorDay);
  return new Date(Date.UTC(ny, nm, day, 0, 0, 0, 0));
}

export function formatDateIsoUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
