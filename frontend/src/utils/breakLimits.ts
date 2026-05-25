/** Maximum continuous break before work auto-resumes (must match backend MAX_BREAK_DURATION_MINUTES). */
export const MAX_BREAK_DURATION_MS = 60 * 60 * 1000;

export function cappedBreakEndMs(breakStartAt: number, endAtMs: number = Date.now()): number {
  return Math.min(endAtMs, breakStartAt + MAX_BREAK_DURATION_MS);
}

export function msUntilBreakAutoResume(breakStartAt: number, nowMs: number = Date.now()): number {
  return Math.max(0, breakStartAt + MAX_BREAK_DURATION_MS - nowMs);
}
