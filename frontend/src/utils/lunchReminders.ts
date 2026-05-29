import type { AttendanceStatus } from "@/store/attendanceStore";

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** User already on break or took a break before 1:00 PM — skip lunch reminder. */
export function shouldSkipLunchReminder(
  status: AttendanceStatus,
  breaks: { start: number; end: number }[],
  breakStartAt: number | null,
  now: Date,
): boolean {
  if (status === "on-break") return true;

  const onePm = new Date(now);
  onePm.setHours(13, 0, 0, 0);

  if (breakStartAt && sameLocalDay(new Date(breakStartAt), now)) {
    if (breakStartAt < onePm.getTime()) return true;
  }

  for (const b of breaks) {
    const start = new Date(b.start);
    if (!sameLocalDay(start, now)) continue;
    if (start.getTime() < onePm.getTime()) return true;
  }

  return false;
}

/** Only nudge after a 30+ minute break (still on break or just finished). */
export function shouldShowBreakDurationAlert(
  status: AttendanceStatus,
  breaks: { start: number; end: number }[],
  breakStartAt: number | null,
  now: Date,
): boolean {
  const thirtyMinMs = 30 * 60 * 1000;

  if (status === "on-break" && breakStartAt) {
    return now.getTime() - breakStartAt >= thirtyMinMs;
  }

  for (const b of [...breaks].reverse()) {
    if (!sameLocalDay(new Date(b.end), now)) continue;
    const duration = b.end - b.start;
    if (duration < thirtyMinMs) continue;
    const endedAgo = now.getTime() - b.end;
    if (endedAgo >= 0 && endedAgo <= 10 * 60 * 1000) return true;
  }

  return false;
}
