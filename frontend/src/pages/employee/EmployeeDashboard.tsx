import { useCallback, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, Coffee, Clock, CalendarDays, MessageSquare, User,
  Pause, AlertTriangle, Sparkles, CheckCircle2, ScanFace, MapPin, ArrowLeft, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useAttendanceStore } from "@/store/attendanceStore";
import { CheckInModal } from "@/components/CheckInModal";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, subDays, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { formatTimestampMs, parseApiDate } from "@/utils/safeDate";
import {
  attendanceBreakEndRequest,
  attendanceBreakStartRequest,
  attendanceHistoryRequest,
  attendanceOvertimeNotifyRequest,
  attendanceSessionRequest,
  leaveBalanceRequest,
  leaveHistoryRequest,
  updatesPostRequest,
} from "@/lib/api";
import { LeaveBalanceRings, type LeaveBalanceShape } from "@/components/LeaveBalanceRings";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame } from "lucide-react";
import { MAX_BREAK_DURATION_MS, msUntilBreakAutoResume } from "@/utils/breakLimits";

function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const FULL_DAY_MS = 8 * 60 * 60 * 1000;
const WEEK_GOAL_HOURS = 40;

const DAY_TIPS = [
  "Deep work before email — guard your first hour.",
  "A short walk between meetings resets focus.",
  "Leave buffers between tasks; humans are not APIs.",
  "Ship something small today; momentum compounds.",
];

const EARLY_REASON_CHIPS = [
  "Doctor appointment",
  "Half day",
  "Family",
  "Personal errand",
  "Feeling unwell",
  "Approved early leave",
];

function isLateCheckIn(iso: string): boolean {
  const dt = parseApiDate(iso);
  if (!dt) return false;
  return dt.getHours() > 10 || (dt.getHours() === 10 && dt.getMinutes() > 15);
}

function punctualityStreakFromLogs(logs: { date: string; check_in: string | null }[]): number {
  const map = new Map(logs.map((l) => [l.date, l]));
  let d = new Date();
  let streak = 0;
  for (let i = 0; i < 200; i++) {
    const w = d.getDay();
    if (w === 0 || w === 6) {
      d = subDays(d, 1);
      continue;
    }
    const key = format(d, "yyyy-MM-dd");
    const log = map.get(key);
    if (log?.check_in && !isLateCheckIn(log.check_in)) {
      streak += 1;
      d = subDays(d, 1);
    } else {
      break;
    }
  }
  return streak;
}

type AttendanceSessionBody = {
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
};

function applyAttendanceSession(
  body: AttendanceSessionBody,
  hydrateSession: ReturnType<typeof useAttendanceStore.getState>["hydrateSession"],
  reset: ReturnType<typeof useAttendanceStore.getState>["reset"],
) {
  if (!body.checked_in_at) {
    reset();
    return;
  }
  const breakList = (body.breaks || [])
    .map((b) => ({ start: parseApiDate(b.start)?.getTime() ?? NaN, end: parseApiDate(b.end)?.getTime() ?? NaN }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));
  const breakStartAtMs = body.active_break_start ? parseApiDate(body.active_break_start)?.getTime() ?? null : null;
  const totalBreakMsFromApi = Math.max(0, (body.total_break_minutes || 0) * 60 * 1000);
  const checkedOutAtMs = body.checked_out_at ? parseApiDate(body.checked_out_at)?.getTime() ?? null : null;
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

export default function EmployeeDashboard() {
  const { user, accessToken } = useAuthStore();
  const { addNotification } = useDataStore();
  const { status, checkInAt, checkOutAt, workedMsToday, totalBreakMs, breakStartAt, breaks, setCheckInAt, hydrateSession, startBreak, endBreak, checkOut, reset } = useAttendanceStore();
  const [now, setNow] = useState(Date.now());
  const [coDialog, setCoDialog] = useState(false);
  const [workNote, setWorkNote] = useState("");
  const [earlyReason, setEarlyReason] = useState("");

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCheckoutVerifyModal, setShowCheckoutVerifyModal] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceShape | null>(null);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(true);
  const [weekWorkedHours, setWeekWorkedHours] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [quickNote, setQuickNote] = useState("");
  const [quickNoteSending, setQuickNoteSending] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // First-time hint per employee.
    if (!user?.empId) return;
    const key = `vtl_hint_employee_${user.empId}`;
    if (localStorage.getItem(key) === "1") return;
    setShowHowToUse(true);
    localStorage.setItem(key, "1");
  }, [user?.empId]);

  const refreshSession = useCallback(async () => {
    if (!accessToken) return null;
    const res = await attendanceSessionRequest(accessToken);
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as AttendanceSessionBody;
    applyAttendanceSession(body, hydrateSession, reset);
    return body;
  }, [accessToken, hydrateSession, reset]);

  useEffect(() => {
    if (!accessToken) return;
    reset();
    void refreshSession();
  }, [accessToken, refreshSession, reset]);

  // Auto-resume break after 1 hour (client timer + server enforcement on session API).
  useEffect(() => {
    if (status !== "on-break" || !breakStartAt || !accessToken) return;

    const autoResume = async () => {
      const res = await attendanceBreakEndRequest(accessToken);
      if (res.ok) {
        endBreak(breakStartAt + MAX_BREAK_DURATION_MS);
        toast.info("Break ended automatically after 1 hour. You are back on the clock.");
        return;
      }
      const body = await refreshSession();
      if (body?.break_auto_resumed || !body?.active_break_start) {
        toast.info("Break ended automatically after 1 hour. You are back on the clock.");
      }
    };

    const remaining = msUntilBreakAutoResume(breakStartAt, now);
    if (remaining <= 0) {
      void autoResume();
      return;
    }
    const timer = window.setTimeout(() => void autoResume(), remaining);
    return () => window.clearTimeout(timer);
  }, [status, breakStartAt, accessToken, endBreak, refreshSession]);

  // Poll session while on break (covers background tabs / missed timers).
  useEffect(() => {
    if (status !== "on-break" || !accessToken) return;
    const interval = window.setInterval(() => void refreshSession(), 30_000);
    return () => window.clearInterval(interval);
  }, [status, accessToken, refreshSession]);

  // Real pending approvals from backend (per employee), instead of demo seedLeaves.
  useEffect(() => {
    if (!accessToken || !user?.empId) return;
    const run = async () => {
      try {
        const res = await leaveHistoryRequest(accessToken);
        if (!res.ok) return;
        const list = (await res.json().catch(() => [])) as any[];
        const count = list.filter((l) => String(l.status).toLowerCase() === "pending").length;
        setPendingApprovals(count);
      } catch {
        // silently ignore; banner simply won't show
      }
    };
    void run();
  }, [accessToken, user?.empId]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLeaveBalanceLoading(true);
    void leaveBalanceRequest(accessToken).then(async (res) => {
      if (!res.ok || cancelled) {
        if (!cancelled) {
          setLeaveBalance(null);
          setLeaveBalanceLoading(false);
        }
        return;
      }
      const body = (await res.json().catch(() => null)) as LeaveBalanceShape | null;
      if (!cancelled) {
        setLeaveBalance(body);
        setLeaveBalanceLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void attendanceHistoryRequest(accessToken).then(async (res) => {
      if (!res.ok || cancelled) return;
      const logs = (await res.json().catch(() => [])) as { date: string; check_in: string | null; total_hours?: number }[];
      if (!Array.isArray(logs) || cancelled) return;
      const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
      const we = endOfWeek(new Date(), { weekStartsOn: 1 });
      let hours = 0;
      for (const l of logs) {
        if (!l.date) continue;
        const day = parseISO(l.date);
        if (Number.isNaN(day.getTime())) continue;
        if (isWithinInterval(day, { start: ws, end: we })) {
          hours += Number(l.total_hours ?? 0) || 0;
        }
      }
      setWeekWorkedHours(Math.round(hours * 10) / 10);
      setStreakDays(punctualityStreakFromLogs(logs));
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const greetingLine = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const tipOfDay = DAY_TIPS[(user?.empId?.charCodeAt(0) ?? 0) % DAY_TIPS.length];

  const currentBreak =
    status === "on-break" && breakStartAt
      ? Math.min(now - breakStartAt, MAX_BREAK_DURATION_MS)
      : 0;
  const liveWorkMs = checkInAt ? now - checkInAt - totalBreakMs - currentBreak : 0;
  const workMs = status === "checked-out" ? workedMsToday : liveWorkMs;
  const isEarly = workMs < FULL_DAY_MS;
  const remainingMs = Math.max(0, FULL_DAY_MS - workMs);
  const overtimeMs = Math.max(0, workMs - FULL_DAY_MS);
  const hasOvertime = overtimeMs > 0;
  const breakTakenMs = totalBreakMs + currentBreak;
  const breakAutoResumeInMs =
    status === "on-break" && breakStartAt ? msUntilBreakAutoResume(breakStartAt, now) : 0;
  const remainingDisplayMs = status === "checked-out" ? 0 : status === "idle" ? FULL_DAY_MS : remainingMs;
  const breakProgressPct = Math.min(100, Math.round((breakTakenMs / FULL_DAY_MS) * 100));

  useEffect(() => {
    if (!accessToken || !user?.empId) return;
    if (!hasOvertime || status === "idle") return;
    const dayKey = format(new Date(), "yyyy-MM-dd");
    const storageKey = `vtl_ot_notify_${user.empId}_${dayKey}`;
    if (localStorage.getItem(storageKey) === "1") return;
    localStorage.setItem(storageKey, "1");
    void attendanceOvertimeNotifyRequest(accessToken).then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { notified?: boolean; overtime_hours?: number };
      if (!body.notified) return;
      const otH = body.overtime_hours ?? overtimeMs / (60 * 60 * 1000);
      addNotification({
        title: "Overtime",
        body: `You've worked beyond 8 hours today. Overtime: ${Number(otH).toFixed(1)}h.`,
        type: "warning",
      });
      toast.info("Overtime is now counting — you've passed 8 hours today.");
    });
  }, [accessToken, user?.empId, hasOvertime, status, overtimeMs, addNotification]);

  const handleCheckIn = () => {
    setShowVerifyModal(true);
  };

  const handleVerified = (data?: { checkInAt?: string }) => {
    setShowVerifyModal(false);
    const serverMs = data?.checkInAt ? new Date(data.checkInAt).getTime() : Date.now();
    setCheckInAt(serverMs);
  };

  const handleBreak = async () => {
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (status === "on-break") {
      const res = await attendanceBreakEndRequest(accessToken);
      const body = (await res.json().catch(() => ({}))) as { error?: string; break_minutes?: number; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not end break");
        return;
      }
      endBreak();
      toast.success(body.message || "Break ended");
      return;
    }

    const res = await attendanceBreakStartRequest(accessToken);
    const body = (await res.json().catch(() => ({}))) as { error?: string; break_start?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not start break");
      return;
    }
    const serverStartMs = body.break_start ? new Date(body.break_start).getTime() : Date.now();
    startBreak(serverStartMs);
    toast.success(body.message || "Break started");
  };

  const openCheckout = () => {
    setWorkNote("");
    setEarlyReason("");
    setCoDialog(true);
  };

  const confirmCheckout = async () => {
    if (!workNote.trim()) {
      toast.error("Please share what you worked on today");
      return;
    }
    if (isEarly && !earlyReason.trim()) {
      toast.error("Please add a reason for early check-out");
      return;
    }
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    // Daily update is compulsory before checkout and must sync to backend.
    const updateRes = await updatesPostRequest(accessToken, workNote.trim());
    const updateBody = (await updateRes.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!updateRes.ok) {
      toast.error(updateBody.error || "Could not post daily update. Please try again.");
      return;
    }

    // Require face+location verification before checkout
    setCoDialog(false);
    setShowCheckoutVerifyModal(true);
  };

  const handleCheckoutVerified = (data?: { checkOutAt?: string; totalHours?: number; overtimeHours?: number }) => {
    setShowCheckoutVerifyModal(false);
    const outMs = data?.checkOutAt ? new Date(data.checkOutAt).getTime() : Date.now();
    const workedMsFromApi = typeof data?.totalHours === "number" ? Math.max(0, data.totalHours * 60 * 60 * 1000) : workMs;
    checkOut({ checkOutAt: outMs, workedMsToday: workedMsFromApi });
    if (typeof data?.overtimeHours === "number" && data.overtimeHours > 0) {
      toast.success(`Checked out. Overtime recorded: ${data.overtimeHours.toFixed(1)}h`);
    }
  };

  const quickActions = [
    { label: "Apply Leave", description: "Request casual/sick leave and track approval status.", icon: CalendarDays, to: "/employee/leaves", accent: "icon-3d-sage" },
    { label: "Attendance", description: "See your check-in/out history and daily status.", icon: Clock, to: "/employee/attendance", accent: "icon-3d-peach" },
    { label: "Updates", description: "View daily updates you shared today.", icon: MessageSquare, to: "/employee/updates", accent: "icon-3d-powder" },
    { label: "Profile", description: "Manage your profile and face settings.", icon: User, to: "/profile", accent: "icon-3d-cream" },
  ];

  const completedPct = Math.min(100, Math.round((workMs / FULL_DAY_MS) * 100));
  const weekProgressPct = Math.min(100, Math.round((weekWorkedHours / WEEK_GOAL_HOURS) * 100));

  const postQuickNote = async () => {
    const text = quickNote.trim();
    if (!text || !accessToken) return;
    setQuickNoteSending(true);
    try {
      const res = await updatesPostRequest(accessToken, `• ${text}`);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not save note");
        return;
      }
      setQuickNote("");
      toast.success("Added to your daily log");
    } finally {
      setQuickNoteSending(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <CheckInModal open={showVerifyModal} onOpenChange={setShowVerifyModal} onVerified={handleVerified} mode="check-in" />
      <CheckInModal open={showCheckoutVerifyModal} onOpenChange={setShowCheckoutVerifyModal} onVerified={handleCheckoutVerified} mode="check-out" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            {greetingLine}, {user?.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          <p className="text-xs text-muted-foreground/90 max-w-xl leading-relaxed border-l-2 border-primary/30 pl-3 italic">
            {tipOfDay}
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium tabular-nums">{completedPct}% of your day</span>
          </div>
          {streakDays > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-warning px-2 py-1 rounded-full bg-warning/10 border border-warning/25">
              <Flame className="h-3.5 w-3.5" />
              <span className="tabular-nums">{streakDays} day punctuality streak</span>
            </div>
          )}
        </div>
      </div>

      {/* Check-in hero card — 3D sage (primary: first thing after greeting) */}
      <Card className="relative overflow-hidden border-0 shadow-3d rounded-3xl min-h-[220px] flex flex-col justify-center">
        <div className="absolute inset-0 bg-sage-3d vtl-animated-mesh" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/15 blur-2xl motion-safe:animate-pulse" />
        <div className="absolute -bottom-12 -left-10 w-56 h-56 rounded-full bg-white/10 blur-2xl motion-safe:animate-pulse" />

        <CardContent className="relative p-6 sm:p-8 text-primary-foreground">
          <AnimatePresence mode="wait">
            <motion.div
              key="idle-working"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6"
            >
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
                  {status === "idle"
                    ? "You're off the clock"
                    : status === "on-break"
                      ? "On break"
                      : status === "checked-out"
                        ? "Today's work complete"
                        : hasOvertime
                          ? "Overtime — time worked today"
                          : "Time worked today"}
                </p>
                <motion.p
                  key={`${status}-${hasOvertime}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-4xl sm:text-6xl font-bold tabular-nums tracking-tight"
                >
                  {status === "idle" ? formatDuration(0) : formatDuration(workMs)}
                </motion.p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hasOvertime ? (
                    <div className="rounded-2xl bg-amber-400/25 border border-amber-200/40 p-3 sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-wider text-primary-foreground/90 font-semibold">Overtime (&gt; 8h)</p>
                      <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                        {formatDuration(overtimeMs)}
                      </p>
                      <p className="mt-1 text-xs text-primary-foreground/80">
                        Standard shift complete — extra time is tracked as overtime.
                      </p>
                    </div>
                  ) : null}
                  {!hasOvertime && status !== "idle" && status !== "checked-out" ? (
                    <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-primary-foreground/75">Remaining</p>
                      <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                        {formatDuration(remainingDisplayMs)}
                      </p>
                    </div>
                  ) : null}
                  <div className={cn("rounded-2xl bg-white/10 border border-white/15 p-3", hasOvertime && status !== "idle" && status !== "checked-out" ? "" : !hasOvertime ? "" : "sm:col-span-2")}>
                    <p className="text-[11px] uppercase tracking-wider text-primary-foreground/75">Break taken</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                      {formatDuration(breakTakenMs)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-xs text-primary-foreground/80">
                      <span>Work progress</span>
                      <span className="font-semibold">{completedPct}%</span>
                    </div>
                    <div className="h-2 mt-1 rounded-full bg-white/15 overflow-hidden">
                      <div className="h-full bg-sage-3d" style={{ width: `${completedPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-primary-foreground/80">
                      <span>Break time</span>
                      <span className="font-semibold">{breakProgressPct}%</span>
                    </div>
                    <div className="h-2 mt-1 rounded-full bg-white/15 overflow-hidden">
                      <div className="h-full bg-peach-3d" style={{ width: `${breakProgressPct}%` }} />
                    </div>
                  </div>
                </div>

                {status !== "idle" && status !== "checked-out" && (
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    Checked in at {formatTimestampMs(checkInAt!, "h:mm a")} · {breaks.length} breaks taken
                  </p>
                )}
                {status === "checked-out" && (
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    {checkInAt ? formatTimestampMs(checkInAt, "h:mm a") : "—"} - {checkOutAt ? formatTimestampMs(checkOutAt, "h:mm a") : "—"}
                    {" · "}Total {formatDuration(workMs)}
                    {hasOvertime ? ` · Overtime ${formatDuration(overtimeMs)}` : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {status === "idle" ? (
                  <Button size="lg" onClick={handleCheckIn}
                    className="h-16 px-8 bg-white text-primary hover:bg-white/90 font-semibold shadow-3d animate-pulse-ring rounded-2xl border-0 hover-shine shadow-glow">
                    <Play className="h-5 w-5 mr-2 fill-primary" /> Check In
                  </Button>
                ) : status === "checked-out" ? (
                  <div className="h-14 px-6 rounded-2xl bg-white/20 text-white border border-white/30 font-semibold backdrop-blur flex items-center">
                    <CheckCircle2 className="h-5 w-5 mr-2" /> Checked out for today
                  </div>
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        size="lg"
                        onClick={handleBreak}
                        className={cn(
                          "h-14 px-6 bg-white/20 hover:bg-white/30 text-white border border-white/30 font-semibold backdrop-blur rounded-2xl hover-shine hover:scale-[1.02]",
                          status === "on-break" && "vtl-pulse-soft ring-2 ring-white/40",
                        )}
                      >
                        {status === "on-break" ? (
                          <>
                            <Play className="h-5 w-5 mr-2" /> Resume
                          </>
                        ) : (
                          <>
                            <Coffee className="h-5 w-5 mr-2" /> Break
                          </>
                        )}
                      </Button>
                      <Button
                        size="lg"
                        onClick={openCheckout}
                        className="h-14 px-6 bg-destructive hover:bg-destructive/90 font-semibold shadow-3d rounded-2xl hover-shine hover:scale-[1.02]"
                      >
                        <Square className="h-5 w-5 mr-2 fill-current" /> Check Out
                      </Button>
                    </div>
                    {status === "on-break" && breakStartAt ? (
                      <p className="text-xs text-primary-foreground/85 leading-snug">
                        Auto-resumes in{" "}
                        <span className="font-semibold tabular-nums">{formatDuration(breakAutoResumeInMs)}</span>
                        {" "}(max 1 hour break)
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="soft-3d border-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Leave balance</CardTitle>
            <p className="text-xs text-muted-foreground">Casual · Sick · Paid</p>
          </CardHeader>
          <CardContent>
            {leaveBalanceLoading ? (
              <div className="flex justify-center py-4 gap-8">
                <Skeleton className="h-[76px] w-[76px] rounded-full" />
                <Skeleton className="h-[76px] w-[76px] rounded-full hidden sm:block" />
                <Skeleton className="h-[76px] w-[76px] rounded-full hidden sm:block" />
              </div>
            ) : (
              <LeaveBalanceRings balance={leaveBalance} />
            )}
            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs rounded-xl" asChild>
              <Link to="/employee/leaves">View leave history</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="soft-3d border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">This week&apos;s hours</CardTitle>
            <p className="text-xs text-muted-foreground">Goal {WEEK_GOAL_HOURS}h (Mon–Sun)</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight">{weekWorkedHours}h</span>
              <span className="text-sm text-muted-foreground tabular-nums">/ {WEEK_GOAL_HOURS}h</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${weekProgressPct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{weekProgressPct}% of weekly goal logged.</p>
          </CardContent>
        </Card>

        <Card className="soft-3d border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Quick log</CardTitle>
            <p className="text-xs text-muted-foreground">Add a bullet to your daily updates anytime</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="Shipped feature X, blocked on Y…"
              className="min-h-[72px] rounded-2xl text-sm"
              disabled={quickNoteSending}
            />
            <Button
              type="button"
              size="sm"
              className="w-full rounded-xl"
              disabled={!quickNote.trim() || quickNoteSending}
              onClick={() => void postQuickNote()}
            >
              {quickNoteSending ? "Saving…" : "Add to daily log"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {showHowToUse && (
        <Card className="soft-3d border-0 hover-shine">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">How to use</p>
              <p className="text-xs text-muted-foreground mt-1">
                1) Tap <b>Check In</b> (Face + GPS). 2) Tap <b>Break</b> / <b>Resume</b> — breaks auto-resume after 1 hour. 3) Tap <b>Check Out</b> when done.
              </p>
            </div>
            <Button size="sm" className="hover-shine" onClick={() => setShowHowToUse(false)} type="button">
              Got it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick actions — peach + powder + sage 3D */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {pendingApprovals > 0 && (
          <Link to="/employee/leaves" className="col-span-2 lg:col-span-4">
            <Card className="border-0 shadow-lg text-white hover:-translate-y-1 transition-smooth cursor-pointer mb-1 border-glow-shine" style={{ background: "var(--gradient-success)" }}>
              <CardContent className="p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-sm">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">You have {pendingApprovals} pending approval{pendingApprovals > 1 ? "s" : ""}</p>
                    <p className="text-xs text-white/80">Your leave requests are currently under review.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
        {quickActions.map((qa, i) => (
          <Link to={qa.to} key={qa.label}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="soft-3d border-0 p-5 hover:-translate-y-1 transition-smooth cursor-pointer h-full hover-shine">
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center mb-3", qa.accent)}>
                  <qa.icon className={cn("h-5 w-5", qa.accent === "icon-3d-sage" ? "text-primary-foreground" : "text-foreground/80")} />
                </div>
                <p className="font-semibold text-sm">{qa.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{qa.description}</p>
              </Card>
            </motion.div>
          </Link>
        ))}
      </div>

      {/* Break history */}
      <Card className="card-3d border-0">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Pause className="h-4 w-4" /> Break history</CardTitle>
          <span className="text-xs text-muted-foreground">Total: {formatDuration(totalBreakMs + currentBreak)}</span>
        </CardHeader>
        <CardContent>
          {breaks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No breaks yet today.</p>
          ) : (
            <div className="space-y-2">
              {[...breaks].sort((a, b) => a.start - b.start).map((b, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-peach-3d shadow-sm flex items-center justify-center">
                      <Coffee className="h-4 w-4 text-foreground/80" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Break #{i + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestampMs(b.start, "h:mm a")} – {formatTimestampMs(b.end, "h:mm a")}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatDuration(b.end - b.start)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart checkout dialog */}
      <Dialog open={coDialog} onOpenChange={setCoDialog}>
        <DialogContent className="max-w-[min(100%,480px)] rounded-2xl sm:rounded-3xl">
          <DialogHeader className="min-w-0 pr-8 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
              <Square className="h-5 w-5 shrink-0 text-primary" /> Wrap up your day
            </DialogTitle>
            <DialogDescription className="text-left break-words">
              Worked {formatDuration(workMs)} today · {completedPct}% of an 8h day
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-4 py-1">
            {isEarly && (
              <div className="flex min-w-0 gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3 sm:gap-3 sm:p-3.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-warning-foreground">Early check-out</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    You haven&apos;t completed 8 hours yet. Please share a reason below.
                  </p>
                </div>
              </div>
            )}

            <div className="min-w-0 space-y-1.5">
              <Label className="text-sm">Daily update <span className="text-destructive">*</span></Label>
              <Textarea
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
                placeholder="Write your daily update (tasks completed, blockers, next steps)..."
                className="min-h-[90px] w-full min-w-0 resize-none rounded-2xl"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">This will also post to the Daily Updates feed.</p>
            </div>

            {isEarly && (
              <div className="min-w-0 space-y-1.5">
                <Label className="text-sm">Reason for early check-out <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {EARLY_REASON_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setEarlyReason(chip)}
                      className={cn(
                        "max-w-full rounded-full border px-2.5 py-1.5 text-[11px] leading-tight transition-colors sm:px-3 sm:text-xs",
                        earlyReason === chip
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/50 hover:bg-muted"
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={earlyReason}
                  onChange={(e) => setEarlyReason(e.target.value)}
                  placeholder="Doctor appointment, family emergency, half-day approved..."
                  className="min-h-[70px] w-full min-w-0 resize-none rounded-2xl"
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setCoDialog(false)} className="w-full rounded-xl sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={confirmCheckout}
              className="w-full rounded-xl border-0 bg-sage-3d text-primary-foreground shadow-3d sm:w-auto"
            >
              Confirm check-out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
