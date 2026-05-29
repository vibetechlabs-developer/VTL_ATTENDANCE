import type { AttendanceStatus } from "@/store/attendanceStore";

export type AttendanceSessionBody = {
  active?: boolean;
  checked_in_at?: string;
  checked_out_at?: string | null;
  total_work_minutes?: number;
  worked_hours?: number;
  overtime_hours?: number;
  total_break_minutes?: number;
  active_break_start?: string | null;
  breaks?: { start: string; end: string }[];
  break_auto_resumed?: boolean;
  active_call_start?: string | null;
  on_call?: boolean;
};

function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function applyAttendanceSession(
  body: AttendanceSessionBody,
  hydrateSession: (payload: {
    status: AttendanceStatus;
    checkInAt: number | null;
    checkOutAt?: number | null;
    workedMsToday?: number;
    totalBreakMs: number;
    breakStartAt: number | null;
    breaks: { start: number; end: number }[];
  }) => void,
  reset: () => void,
): void {
  if (!body.checked_in_at) {
    reset();
    return;
  }
  const breakList = (body.breaks || [])
    .map((b) => ({
      start: parseApiDate(b.start)?.getTime() ?? NaN,
      end: parseApiDate(b.end)?.getTime() ?? NaN,
    }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));
  const breakStartAtMs = body.active_break_start
    ? (parseApiDate(body.active_break_start)?.getTime() ?? null)
    : null;
  const totalBreakMsFromApi = Math.max(0, (body.total_break_minutes || 0) * 60 * 1000);
  const checkedOutAtMs = body.checked_out_at
    ? (parseApiDate(body.checked_out_at)?.getTime() ?? null)
    : null;
  const workedMs = Math.max(
    0,
    typeof body.worked_hours === "number"
      ? body.worked_hours * 60 * 60 * 1000
      : (body.total_work_minutes || 0) * 60 * 1000,
  );
  hydrateSession({
    status: body.active ? (breakStartAtMs ? "on-break" : "checked-in") : "checked-out",
    checkInAt: parseApiDate(body.checked_in_at)?.getTime() ?? Date.now(),
    checkOutAt: checkedOutAtMs,
    workedMsToday: workedMs,
    totalBreakMs: totalBreakMsFromApi,
    breakStartAt: breakStartAtMs,
    breaks: breakList,
  });
}

export function isOnCallFromSession(body: AttendanceSessionBody): boolean {
  return Boolean(body.on_call || body.active_call_start);
}
