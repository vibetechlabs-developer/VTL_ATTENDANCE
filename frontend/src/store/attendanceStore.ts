import { create } from "zustand";

export type AttendanceStatus = "idle" | "checked-in" | "on-break" | "checked-out";

interface AttendanceState {
  status: AttendanceStatus;
  checkInAt: number | null;
  checkOutAt: number | null;
  workedMsToday: number;
  totalBreakMs: number;
  breakStartAt: number | null;
  breaks: { start: number; end: number }[];
  checkIn: () => void;
  setCheckInAt: (ms: number) => void;
  hydrateSession: (payload: {
    status: AttendanceStatus;
    checkInAt: number | null;
    checkOutAt?: number | null;
    workedMsToday?: number;
    totalBreakMs: number;
    breakStartAt: number | null;
    breaks: { start: number; end: number }[];
  }) => void;
  startBreak: (atMs?: number) => void;
  endBreak: (atMs?: number) => void;
  checkOut: (payload?: { checkOutAt?: number; workedMsToday?: number }) => void;
  reset: () => void;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  status: "idle",
  checkInAt: null,
  checkOutAt: null,
  workedMsToday: 0,
  totalBreakMs: 0,
  breakStartAt: null,
  breaks: [],
  checkIn: () => set({ status: "checked-in", checkInAt: Date.now(), checkOutAt: null, workedMsToday: 0, totalBreakMs: 0, breaks: [] }),
  setCheckInAt: (ms) => set({ status: "checked-in", checkInAt: ms, checkOutAt: null, workedMsToday: 0, totalBreakMs: 0, breaks: [] }),
  hydrateSession: (payload) =>
    set({
      status: payload.status,
      checkInAt: payload.checkInAt,
      checkOutAt: payload.checkOutAt ?? null,
      workedMsToday: payload.workedMsToday ?? 0,
      totalBreakMs: payload.totalBreakMs,
      breakStartAt: payload.breakStartAt,
      breaks: payload.breaks,
    }),
  startBreak: (atMs) => set({ status: "on-break", breakStartAt: atMs ?? Date.now() }),
  endBreak: (atMs) => {
    const { breakStartAt, totalBreakMs, breaks } = get();
    if (!breakStartAt) return;
    const now = atMs ?? Date.now();
    set({
      status: "checked-in",
      breakStartAt: null,
      totalBreakMs: totalBreakMs + (now - breakStartAt),
      breaks: [...breaks, { start: breakStartAt, end: now }],
    });
  },
  checkOut: (payload) => {
    const { checkInAt, totalBreakMs } = get();
    const now = payload?.checkOutAt ?? Date.now();
    const computedWorked = checkInAt ? Math.max(0, now - checkInAt - totalBreakMs) : 0;
    set({
      status: "checked-out",
      checkOutAt: now,
      workedMsToday: payload?.workedMsToday ?? computedWorked,
      breakStartAt: null,
    });
  },
  reset: () => set({ status: "idle", checkInAt: null, checkOutAt: null, workedMsToday: 0, totalBreakMs: 0, breakStartAt: null, breaks: [] }),
}));
