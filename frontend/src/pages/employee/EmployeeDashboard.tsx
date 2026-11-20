import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, Coffee, Clock, CalendarDays, MessageSquare, User,
  Pause, AlertTriangle, Sparkles, CheckCircle2, ScanFace, MapPin, ArrowLeft, Loader2, Phone,
  CheckSquare, HelpCircle, UserCheck, Users, ChevronRight, Mail, Briefcase
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useAttendanceStore } from "@/store/attendanceStore";
import { CheckInModal } from "@/components/CheckInModal";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { cn, userFirstName } from "@/lib/utils";
import { safeGetItem, safeSetItem } from "@/utils/storageSafe";
import { toast } from "sonner";
import { format, subDays, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { formatTimestampMs, parseApiDate } from "@/utils/safeDate";
import {
  bumpGlobalIdleActivity,
  clearGlobalAutoIdleFlag,
  requestGlobalSystemIdleDetection,
} from "@/utils/idleActivity";
import { ensureSystemIdlePermission } from "@/hooks/useAutoIdleBreak";
import {
  applyAttendanceSession,
  isOnCallFromSession,
  type AttendanceSessionBody,
} from "@/utils/attendanceSession";
import { canUseDesktopNotifications, ensureNotificationPermission } from "@/utils/desktopNotify";
import {
  attendanceBreakEndRequest,
  attendanceBreakStartRequest,
  attendanceCallEndRequest,
  attendanceCallStartRequest,
  attendanceHistoryRequest,
  attendanceOvertimeNotifyRequest,
  attendanceSessionRequest,
  attendanceAdminRequest,
  employeeOverviewRequest,
  leaveBalanceRequest,
  leaveHistoryRequest,
  updatesPostRequest,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const EARLY_REASON_CHIPS = [
  "Doctor appointment",
  "Half day",
  "Family",
  "Personal errand",
  "Feeling unwell",
  "Approved early leave",
];

type SalesDailyReport = {
  totalCalls: string;
  meetings: string;
  mailSent: string;
  linkedinConnections: string;
  linkedinMessages: string;
  todaySummary: string;
};

const EMPTY_SALES_REPORT: SalesDailyReport = {
  totalCalls: "",
  meetings: "",
  mailSent: "",
  linkedinConnections: "",
  linkedinMessages: "",
  todaySummary: "",
};

const SALES_REPORT_FIELD_META: { key: keyof SalesDailyReport; label: string; placeholder: string; apiKey?: string }[] = [
  { key: "totalCalls", label: "1) Total calls", placeholder: "e.g. 100", apiKey: "total_calls" },
  { key: "meetings", label: "2) Total meetings (min 1)", placeholder: "e.g. 1", apiKey: "meetings" },
  { key: "mailSent", label: "3) Mails sent — total (min 20)", placeholder: "e.g. 20", apiKey: "mail_sent" },
  { key: "linkedinConnections", label: "4) LinkedIn connections (min 20)", placeholder: "e.g. 20", apiKey: "linkedin_connections" },
  { key: "linkedinMessages", label: "5) LinkedIn messages sent", placeholder: "e.g. 15", apiKey: "linkedin_messages" },
];

const SALES_MINIMUMS: Partial<Record<keyof SalesDailyReport, number>> = {
  meetings: 1,
  mailSent: 20,
  linkedinConnections: 20,
};

const SALES_API_FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    SALES_REPORT_FIELD_META.filter((field) => field.apiKey).map((field) => [field.apiKey!, field.label]),
  ),
  today_summary: "Today's work summary",
};

const SALES_API_TO_FRONTEND: Record<string, keyof SalesDailyReport> = {
  ...Object.fromEntries(
    SALES_REPORT_FIELD_META.filter((field) => field.apiKey).map((field) => [field.apiKey!, field.key]),
  ),
  today_summary: "todaySummary",
};

type CheckoutFieldError = {
  fieldId: string;
  message: string;
};

function cleanFieldLabel(label: string): string {
  return label.replace(/^\d+[a-z]?\)\s*/, "").trim();
}

function splitUrls(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectCheckoutErrors(
  workNote: string,
  salesReport: SalesDailyReport,
  earlyReason: string,
  isSales: boolean,
  isEarly: boolean,
  callsMinimum: number = 0,
  hasCallsTarget: boolean = false,
): CheckoutFieldError[] {
  const errors: CheckoutFieldError[] = [];

  if (!workNote.trim()) {
    errors.push({ fieldId: "workNote", message: "Daily update is required" });
  }

  if (isSales) {
    const parseMaybeNumber = (raw: string): number | null => {
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    // total calls — only compulsory if manager explicitly assigned a calls target in task
    const totalCallsRaw = String(salesReport.totalCalls ?? "").trim();
    if (hasCallsTarget && callsMinimum > 0) {
      if (!totalCallsRaw) {
        errors.push({ fieldId: "totalCalls", message: `Total calls is required (Target: min ${callsMinimum} from manager's task)` });
      } else {
        const totalCallsNum = parseMaybeNumber(totalCallsRaw);
        if (totalCallsNum === null) {
          errors.push({ fieldId: "totalCalls", message: "Total calls: enter a valid number" });
        } else if (totalCallsNum < callsMinimum) {
          errors.push({ fieldId: "totalCalls", message: `Total calls: minimum ${callsMinimum} required as assigned by manager (you entered ${totalCallsNum})` });
        }
      }
    } else if (totalCallsRaw) {
      const totalCallsNum = parseMaybeNumber(totalCallsRaw);
      if (totalCallsNum === null || totalCallsNum < 0) {
        errors.push({ fieldId: "totalCalls", message: "Total calls: enter a valid number" });
      }
    }

    // meetings — min 1
    const meetingsRaw = String(salesReport.meetings ?? "").trim();
    if (!meetingsRaw) {
      errors.push({ fieldId: "meetings", message: "Total meetings is required (min 1)" });
    } else {
      const meetingsNum = parseMaybeNumber(meetingsRaw);
      if (meetingsNum === null) {
        errors.push({ fieldId: "meetings", message: "Total meetings: enter a valid number" });
      } else if (meetingsNum < 1) {
        errors.push({ fieldId: "meetings", message: `Total meetings: minimum 1 (you entered ${meetingsNum})` });
      }
    }

    // mail sent — min 20 combined
    const mailSentRaw = String(salesReport.mailSent ?? "").trim();
    if (!mailSentRaw) {
      errors.push({ fieldId: "mailSent", message: "Mails sent is required (min 20)" });
    } else {
      const mailSentNum = parseMaybeNumber(mailSentRaw);
      if (mailSentNum === null) {
        errors.push({ fieldId: "mailSent", message: "Mails sent: enter a valid number" });
      } else if (mailSentNum < 20) {
        errors.push({ fieldId: "mailSent", message: `Mails sent: minimum 20 (you entered ${mailSentNum})` });
      }
    }

    // linkedin connections — min 20
    const linkedinConnectionsRaw = String(salesReport.linkedinConnections ?? "").trim();
    if (!linkedinConnectionsRaw) {
      errors.push({ fieldId: "linkedinConnections", message: "LinkedIn connections is required (min 20)" });
    } else {
      const lc = parseMaybeNumber(linkedinConnectionsRaw);
      if (lc === null) {
        errors.push({ fieldId: "linkedinConnections", message: "LinkedIn connections: enter a valid number" });
      } else if (lc < 20) {
        errors.push({ fieldId: "linkedinConnections", message: `LinkedIn connections: minimum 20 (you entered ${lc})` });
      }
    }

    // linkedin messages — required, no minimum
    const linkedinMessagesRaw = String(salesReport.linkedinMessages ?? "").trim();
    if (!linkedinMessagesRaw) {
      errors.push({ fieldId: "linkedinMessages", message: "LinkedIn messages sent is required" });
    } else if (parseMaybeNumber(linkedinMessagesRaw) === null) {
      errors.push({ fieldId: "linkedinMessages", message: "LinkedIn messages: enter a valid number" });
    }

    // today summary — required English text
    const todaySummaryRaw = String(salesReport.todaySummary ?? "").trim();
    if (!todaySummaryRaw) {
      errors.push({ fieldId: "todaySummary", message: "Today's work summary is required" });
    }
  }

  if (isEarly && !earlyReason.trim()) {
    errors.push({ fieldId: "earlyReason", message: "Reason for early check-out is required" });
  }

  return errors;
}

function mapApiCheckoutErrors(body: {
  missing_fields?: string[];
  invalid_fields?: { field: string; minimum: number; actual: unknown }[];
  duplicate_links?: { field: string; url: string }[];
}): CheckoutFieldError[] {
  const errors: CheckoutFieldError[] = [];

  const missing = body.missing_fields ?? [];
  const invalid = body.invalid_fields ?? [];

  for (const apiField of missing) {
    const fieldId = SALES_API_TO_FRONTEND[apiField] ?? apiField;
    const label = SALES_API_FIELD_LABELS[apiField] ?? apiField;
    errors.push({ fieldId, message: `${cleanFieldLabel(label)} is required` });
  }

  for (const item of invalid) {
    const fieldId = SALES_API_TO_FRONTEND[item.field] ?? item.field;
    const label = SALES_API_FIELD_LABELS[item.field] ?? item.field;
    const actual = item.actual ?? "invalid";
    errors.push({
      fieldId,
      message: `${cleanFieldLabel(label)}: minimum ${item.minimum} (you entered ${actual})`,
    });
  }

  return errors;
}

function showCheckoutValidationToast(errors: CheckoutFieldError[], title: string) {
  const preview = errors.slice(0, 2).map((error) => error.message).join(" | ");
  toast.error(title, {
    description: preview ? `${preview}${errors.length > 2 ? " ..." : ""}` : "Please check required fields.",
    duration: 7000,
  });
}

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

export default function EmployeeDashboard() {
  const { user, accessToken } = useAuthStore();
  const { addNotification } = useDataStore();
  const { status, checkInAt, checkOutAt, workedMsToday, totalBreakMs, breakStartAt, breaks, setCheckInAt, hydrateSession, startBreak, endBreak, checkOut, reset } = useAttendanceStore();
  const [now, setNow] = useState(Date.now());
  const [coDialog, setCoDialog] = useState(false);
  const [workNote, setWorkNote] = useState("");
  const [earlyReason, setEarlyReason] = useState("");
  const [outsideMeetingCheckout, setOutsideMeetingCheckout] = useState(false);
  const [outsideMeetingNote, setOutsideMeetingNote] = useState("");
  const [pendingCheckoutMeta, setPendingCheckoutMeta] = useState<{ allowOutsideMeeting: boolean; outsideNote: string }>({
    allowOutsideMeeting: false,
    outsideNote: "",
  });
  const [salesReport, setSalesReport] = useState<SalesDailyReport>(EMPTY_SALES_REPORT);
  const [checkoutErrors, setCheckoutErrors] = useState<CheckoutFieldError[]>([]);
  const [callsMinimum, setCallsMinimum] = useState(0);
  const [hasCallsTarget, setHasCallsTarget] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCheckoutVerifyModal, setShowCheckoutVerifyModal] = useState(false);
  /** Daily update already posted; only face scan remains for checkout. */
  const [checkoutAwaitingFace, setCheckoutAwaitingFace] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceShape | null>(null);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(true);
  const [weekWorkedHours, setWeekWorkedHours] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [quickNote, setQuickNote] = useState("");
  const [quickNoteSending, setQuickNoteSending] = useState(false);
  const [onCallMode, setOnCallMode] = useState(false);

  // Managed team state (visible for managers / users with subordinates)
  const [teamRows, setTeamRows] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [selectedEmployeePk, setSelectedEmployeePk] = useState<string | number | null>(null);
  const [empOverview, setEmpOverview] = useState<any>(null);
  const [empOverviewLoading, setEmpOverviewLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const fetchTeam = async () => {
      setTeamLoading(true);
      try {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        const res = await attendanceAdminRequest(accessToken, todayStr);
        if (res.ok && !cancelled) {
          const rows = await res.json().catch(() => []);
          setTeamRows(Array.isArray(rows) ? rows : []);
        }
      } catch {
        // Not a manager or no subordinates; silently ignore
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    };
    void fetchTeam();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const loadEmployeeOverview = async (empPk: string | number) => {
    if (!accessToken) return;
    setSelectedEmployeePk(empPk);
    setEmpOverview(null);
    setEmpOverviewLoading(true);
    try {
      const res = await employeeOverviewRequest(accessToken, empPk);
      if (res.ok) {
        const data = await res.json();
        setEmpOverview(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Could not load employee details.");
      }
    } catch {
      toast.error("Failed to load employee overview.");
    } finally {
      setEmpOverviewLoading(false);
    }
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status !== "checked-in") setOnCallMode(false);
  }, [status]);

  useEffect(() => {
    if (status === "idle" || status === "checked-out") {
      setCheckoutAwaitingFace(false);
    }
  }, [status]);

  useEffect(() => {
    // First-time hint per employee.
    if (!user?.empId) return;
    const key = `vtl_hint_employee_${user.empId}`;
    if (safeGetItem(localStorage, key) === "1") return;
    setShowHowToUse(true);
    safeSetItem(localStorage, key, "1");
  }, [user?.empId]);

  const refreshSession = useCallback(async () => {
    if (!accessToken) return null;
    const res = await attendanceSessionRequest(accessToken);
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as AttendanceSessionBody;
    applyAttendanceSession(body, hydrateSession, reset);
    setOnCallMode(isOnCallFromSession(body));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (safeGetItem(localStorage, storageKey) === "1") return;
    safeSetItem(localStorage, storageKey, "1");
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
    bumpGlobalIdleActivity();
    requestGlobalSystemIdleDetection();
    void ensureSystemIdlePermission(true);
    void ensureNotificationPermission(true);
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
      clearGlobalAutoIdleFlag();
      endBreak();
      bumpGlobalIdleActivity();
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
    clearGlobalAutoIdleFlag();
    startBreak(serverStartMs);
    toast.success(body.message || "Break started");
  };

  const toggleOnCallMode = async () => {
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (onCallMode) {
      const res = await attendanceCallEndRequest(accessToken);
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not end call mode");
        return;
      }
      setOnCallMode(false);
      bumpGlobalIdleActivity();
      toast.info(body.message || "Call mode ended — idle tracking resumed.");
      return;
    }
    const res = await attendanceCallStartRequest(accessToken);
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Could not start call mode");
      return;
    }
    setOnCallMode(true);
    bumpGlobalIdleActivity();
    toast.success(body.message || "On a call — auto-break paused while you are on the phone.");
  };

  const fetchCallsTarget = useCallback(async () => {
    if (!accessToken) return { target: 0, hasTarget: false };
    try {
      const res = await fetch("/api/updates/tasks/my_calls_target/", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { calls_target?: number; has_target?: boolean };
        const hasTgt = Boolean(data.has_target && (data.calls_target ?? 0) > 0);
        const tgt = hasTgt ? Number(data.calls_target) : 0;
        setCallsMinimum(tgt);
        setHasCallsTarget(hasTgt);
        return { target: tgt, hasTarget: hasTgt };
      }
    } catch {
      // fallback
    }
    setCallsMinimum(0);
    setHasCallsTarget(false);
    return { target: 0, hasTarget: false };
  }, [accessToken]);

  useEffect(() => {
    if (userHasRole(user, "sales")) {
      void fetchCallsTarget();
    }
  }, [user, fetchCallsTarget]);

  const openCheckout = () => {
    if (checkoutAwaitingFace) {
      setShowCheckoutVerifyModal(true);
      toast.info("Your daily update is saved. Complete face scan to check out.");
      return;
    }
    if (userHasRole(user, "sales")) {
      void fetchCallsTarget();
    }
    setWorkNote("");
    setEarlyReason("");
    setOutsideMeetingCheckout(false);
    setOutsideMeetingNote("");
    setSalesReport(EMPTY_SALES_REPORT);
    setCheckoutErrors([]);
    setCoDialog(true);
  };

  const handleCheckoutVerifyOpenChange = (open: boolean) => {
    setShowCheckoutVerifyModal(open);
    if (!open && checkoutAwaitingFace) {
      toast.info("Daily update saved. Tap Check Out again to retry face scan only.");
    }
  };

  const confirmCheckout = async () => {
    const isSales = userHasRole(user, "sales");
    let targetMin = callsMinimum;
    let hasTarget = hasCallsTarget;
    if (isSales) {
      const targetRes = await fetchCallsTarget();
      targetMin = targetRes.target;
      hasTarget = targetRes.hasTarget;
    }

    const validationErrors = collectCheckoutErrors(workNote, salesReport, earlyReason, isSales, isEarly, targetMin, hasTarget);
    if (validationErrors.length > 0) {
      setCheckoutErrors(validationErrors);
      showCheckoutValidationToast(
        validationErrors,
        `Cannot check out — ${validationErrors.length} issue${validationErrors.length > 1 ? "s" : ""} found`,
      );
      return;
    }
    setCheckoutErrors([]);
    if (!accessToken) {
      toast.error("Session expired. Please login again.");
      return;
    }
    if (outsideMeetingCheckout && !outsideMeetingNote.trim()) {
      toast.error("Please add client meeting note for outside checkout");
      return;
    }
    if (!checkoutAwaitingFace) {
      const updateRes = await updatesPostRequest(
        accessToken,
        workNote.trim(),
        isSales
          ? {
              total_calls: Number(salesReport.totalCalls),
              meetings: Number(salesReport.meetings),
              mail_sent: Number(salesReport.mailSent),
              linkedin_connections: Number(salesReport.linkedinConnections),
              linkedin_messages: Number(salesReport.linkedinMessages),
              today_summary: salesReport.todaySummary.trim(),
            }
          : undefined,
      );
      const updateBody = (await updateRes.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        missing_fields?: string[];
        invalid_fields?: { field: string; minimum: number; actual: unknown }[];
        duplicate_links?: { field: string; url: string }[];
      };
      if (!updateRes.ok) {
        const apiErrors = mapApiCheckoutErrors(updateBody);
        if (apiErrors.length > 0) {
          setCheckoutErrors(apiErrors);
          showCheckoutValidationToast(
            apiErrors,
            updateBody.error || "Sales daily report is incomplete",
          );
          return;
        }
        toast.error(updateBody.error || "Could not post daily update. Please try again.");
        return;
      }
      setCheckoutAwaitingFace(true);
      setPendingCheckoutMeta({
        allowOutsideMeeting: outsideMeetingCheckout,
        outsideNote: outsideMeetingNote.trim(),
      });
    }

    setCoDialog(false);
    setShowCheckoutVerifyModal(true);
  };

  const handleCheckoutVerified = (data?: { checkOutAt?: string; totalHours?: number; overtimeHours?: number }) => {
    setShowCheckoutVerifyModal(false);
    setCheckoutAwaitingFace(false);
    const outMs = data?.checkOutAt ? new Date(data.checkOutAt).getTime() : Date.now();
    const workedMsFromApi = typeof data?.totalHours === "number" ? Math.max(0, data.totalHours * 60 * 60 * 1000) : workMs;
    checkOut({ checkOutAt: outMs, workedMsToday: workedMsFromApi });
    if (typeof data?.overtimeHours === "number" && data.overtimeHours > 0) {
      toast.success(`Checked out. Overtime recorded: ${data.overtimeHours.toFixed(1)}h`);
    }
  };

  const quickActions = [
    { label: "Apply Leave", description: "Request casual/sick leave and track status.", icon: CalendarDays, to: "/employee/leaves", accent: "icon-3d-sage" },
    { label: "Attendance", description: "See check-in/out history and daily status.", icon: Clock, to: "/employee/attendance", accent: "icon-3d-peach" },
    { label: "Task Assignments", description: "View and track tasks assigned to you.", icon: CheckSquare, to: "/tasks", accent: "icon-3d-powder" },
    { label: "Daily Updates", description: "View updates shared today or add notes.", icon: MessageSquare, to: "/employee/updates", accent: "icon-3d-cream" },
    { label: "HR Support Tickets", description: "Raise HR support tickets or view status.", icon: HelpCircle, to: "/tickets", accent: "icon-3d-sage" },
    { label: "Change Requests", description: "Track profile update requests & status.", icon: UserCheck, to: "/my-profile/change-requests", accent: "icon-3d-peach" },
  ];

  const completedPct = Math.min(100, Math.round((workMs / FULL_DAY_MS) * 100));
  const weekProgressPct = Math.min(100, Math.round((weekWorkedHours / WEEK_GOAL_HOURS) * 100));

  const checkoutErrorFieldIds = new Set(checkoutErrors.map((error) => error.fieldId));
  const step1Errors = checkoutErrors.filter((error) => error.fieldId === "workNote");
  const step2Errors = checkoutErrors.filter(
    (error) => error.fieldId !== "workNote" && error.fieldId !== "earlyReason",
  );
  const step2UniqueErrors = Array.from(new Map(step2Errors.map((e) => [e.message, e])).values());
  const step3Errors = checkoutErrors.filter((error) => error.fieldId === "earlyReason");

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
      <CheckInModal
        open={showCheckoutVerifyModal}
        onOpenChange={handleCheckoutVerifyOpenChange}
        onVerified={handleCheckoutVerified}
        mode="check-out"
        checkoutMeta={pendingCheckoutMeta}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            {greetingLine}, {userFirstName(user?.name)}
          </h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
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
                {status === "checked-in" && onCallMode && (
                  <p className="mt-2 text-sm font-medium text-primary-foreground flex items-center gap-1.5">
                    <Phone className="h-4 w-4 shrink-0" />
                    On a call — auto-break paused (PC idle is ignored)
                  </p>
                )}
                {status === "on-break" && (
                  <p className="mt-2 text-sm font-medium text-primary-foreground/90">
                    You are on break — use keyboard or mouse anywhere on your PC to resume after an auto-break, or tap Resume.
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
                      {userHasRole(user, "sales") && status === "checked-in" && (
                        <Button
                          size="lg"
                          type="button"
                          onClick={toggleOnCallMode}
                          className={cn(
                            "h-14 px-6 font-semibold backdrop-blur rounded-2xl hover-shine hover:scale-[1.02] border",
                            onCallMode
                              ? "bg-amber-400/90 text-amber-950 border-amber-200 hover:bg-amber-300/90 ring-2 ring-amber-200/60"
                              : "bg-white/20 hover:bg-white/30 text-white border-white/30",
                          )}
                        >
                          <Phone className="h-5 w-5 mr-2" />
                          {onCallMode ? "End call" : "On a call"}
                        </Button>
                      )}
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

      {/* Quick actions — self-service operations & requests */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-5">
        {pendingApprovals > 0 && (
          <Link to="/employee/leaves" className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-6">
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

      {/* Managed Team Section (for managers with subordinates) */}
      {teamRows.length > 0 && (
        <Card className="glass-card-premium border border-border/40 overflow-hidden shadow-sm">
          <CardHeader className="pb-3 border-b border-border/30 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> My Team &amp; Subordinates
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Employees reporting to you — click any team member to track full profile, attendance, tasks &amp; daily updates.
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold">
              {teamRows.length} Member{teamRows.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamRows.map((member) => {
                const statusVariant =
                  member.status === "Present"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    : member.status === "Late"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    : member.status === "On Leave"
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                    : "bg-red-500/10 text-red-600 border-red-500/30";

                return (
                  <div
                    key={member.id}
                    onClick={() => void loadEmployeeOverview(member.employeePk)}
                    className="p-4 rounded-xl border border-border/50 bg-background/60 hover:bg-muted/40 hover:border-primary/40 transition-all cursor-pointer space-y-3 group shadow-sm hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0 text-sm">
                          {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                            {member.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {member.department} · {member.empId}
                          </p>
                        </div>
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0", statusVariant)}>
                        {member.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/30">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Today In:</span>
                        <span className="font-medium text-foreground text-xs">
                          {member.checkIn ? format(new Date(member.checkIn), "h:mm a") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Hours:</span>
                        <span className="font-medium text-foreground text-xs">
                          {member.hours > 0 ? `${member.hours}h` : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-xs text-primary font-medium group-hover:underline">
                      <span>Track Attendance &amp; Tasks</span>
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
            {checkoutErrors.length > 0 && (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 sm:p-3.5">
                <p className="text-sm font-semibold text-destructive">
                  Cannot check out yet. Please follow these steps:
                </p>
                <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                  <div className="rounded-lg border border-destructive/30 bg-background/30 p-2">
                    <p className="text-xs font-semibold text-destructive/95">Step 1: Daily update</p>
                    {step1Errors.length === 0 ? (
                      <p className="text-xs text-emerald-300">Done</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {step1Errors.map((error, index) => (
                          <li key={`${error.fieldId}-${index}`} className="text-xs leading-relaxed text-destructive/90">
                            - {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-background/30 p-2">
                    <p className="text-xs font-semibold text-destructive/95">Step 2: Sales/BDE report</p>
                    {step2Errors.length === 0 ? (
                      <p className="text-xs text-emerald-300">Done</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {step2UniqueErrors.map((error, index) => (
                          <li key={`${error.fieldId}-${index}`} className="text-xs leading-relaxed text-destructive/90">
                            - {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-lg border border-destructive/30 bg-background/30 p-2">
                    <p className="text-xs font-semibold text-destructive/95">Step 3: Early check-out reason</p>
                    {step3Errors.length === 0 ? (
                      <p className="text-xs text-emerald-300">Done</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {step3Errors.map((error, index) => (
                          <li key={`${error.fieldId}-${index}`} className="text-xs leading-relaxed text-destructive/90">
                            - {error.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                onChange={(e) => {
                  setWorkNote(e.target.value);
                  if (checkoutErrorFieldIds.has("workNote")) {
                    setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== "workNote"));
                  }
                }}
                placeholder="Write your daily update (tasks completed, blockers, next steps)..."
                className={cn(
                  "min-h-[90px] w-full min-w-0 resize-none rounded-2xl",
                  checkoutErrorFieldIds.has("workNote") && "border-destructive ring-1 ring-destructive/50",
                )}
              />
              <p className="text-[11px] leading-snug text-muted-foreground">This will also post to the Daily Updates feed.</p>
            </div>

            <div className="min-w-0 space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3">
              <Label className="text-sm">Checkout location type</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOutsideMeetingCheckout(false)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    !outsideMeetingCheckout
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 hover:bg-muted",
                  )}
                >
                  Office checkout
                </button>
                <button
                  type="button"
                  onClick={() => setOutsideMeetingCheckout(true)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    outsideMeetingCheckout
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 hover:bg-muted",
                  )}
                >
                  Outside client meeting (direct home)
                </button>
              </div>
              {outsideMeetingCheckout ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] leading-snug">
                    Client meeting note <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={outsideMeetingNote}
                    onChange={(e) => setOutsideMeetingNote(e.target.value)}
                    placeholder="Client name, location, short meeting summary..."
                    className="min-h-[70px] w-full min-w-0 resize-none rounded-xl text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Office radius check will be skipped for this checkout.
                  </p>
                </div>
              ) : null}
            </div>

            {userHasRole(user, "sales") && (
              <div className="min-w-0 space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    Sales daily report — Compulsory before check-out
                  </p>
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    {hasCallsTarget && callsMinimum > 0
                      ? `Target: ${callsMinimum} calls · min 1 meeting · min 20 mails · min 20 connections`
                      : `Target: min 1 meeting · min 20 mails · min 20 connections`}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SALES_REPORT_FIELD_META.map((field) => {
                    const isTotalCalls = field.key === "totalCalls";
                    const isCompulsory = !isTotalCalls || (hasCallsTarget && callsMinimum > 0);
                    const labelText = isTotalCalls
                      ? (hasCallsTarget && callsMinimum > 0
                          ? `1) Total calls (Target: ${callsMinimum} from task)`
                          : `1) Total calls (No target assigned)`)
                      : field.label;

                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label className={cn("text-[11px] leading-snug", checkoutErrorFieldIds.has(field.key) && "text-destructive")}>
                          {labelText} {isCompulsory && <span className="text-destructive">*</span>}
                        </Label>
                        <input
                          type="number"
                          min={0}
                          value={String(salesReport[field.key] ?? "")}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSalesReport((prev) => ({ ...prev, [field.key]: val } as SalesDailyReport));
                            if (checkoutErrorFieldIds.has(field.key)) {
                              setCheckoutErrors((prev) => prev.filter((err) => err.fieldId !== field.key));
                            }
                          }}
                          placeholder={isTotalCalls && !hasCallsTarget ? "e.g. 25 (no target set)" : field.placeholder}
                          className={cn(
                            "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            checkoutErrorFieldIds.has(field.key) && "border-destructive ring-1 ring-destructive/50",
                          )}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Today's summary — full width */}
                <div className="space-y-1.5">
                  <Label className={cn("text-[11px] leading-snug", checkoutErrorFieldIds.has("todaySummary") && "text-destructive")}>
                    6) Today&apos;s Work Summary <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={salesReport.todaySummary}
                    onChange={(e) => {
                      setSalesReport((prev) => ({ ...prev, todaySummary: e.target.value }));
                      if (checkoutErrorFieldIds.has("todaySummary")) {
                        setCheckoutErrors((prev) => prev.filter((err) => err.fieldId !== "todaySummary"));
                      }
                    }}
                    placeholder="Summarize today's key achievements, client discussions, and progress..."
                    className={cn(
                      "min-h-[80px] w-full min-w-0 resize-none rounded-xl text-xs",
                      checkoutErrorFieldIds.has("todaySummary") && "border-destructive ring-1 ring-destructive/50",
                    )}
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Brief summary of today&apos;s work — required before check-out.
                  </p>
                </div>
              </div>
            )}
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
                  onChange={(e) => {
                    setEarlyReason(e.target.value);
                    if (checkoutErrorFieldIds.has("earlyReason")) {
                      setCheckoutErrors((prev) => prev.filter((error) => error.fieldId !== "earlyReason"));
                    }
                  }}
                  placeholder="Doctor appointment, family emergency, half-day approved..."
                  className={cn(
                    "min-h-[70px] w-full min-w-0 resize-none rounded-2xl",
                    checkoutErrorFieldIds.has("earlyReason") && "border-destructive ring-1 ring-destructive/50",
                  )}
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
              {checkoutAwaitingFace ? "Continue to face scan" : "Confirm check-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Overview Sheet */}
      <Sheet open={selectedEmployeePk !== null} onOpenChange={(open) => { if (!open) { setSelectedEmployeePk(null); setEmpOverview(null); } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="p-5 pb-3 border-b border-border/40 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              {empOverview?.employee?.name ?? "Employee"} — Full Profile &amp; Tracking
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 overflow-y-auto">
            {empOverviewLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading employee details...</div>
            )}
            {!empOverviewLoading && empOverview && (() => {
              const emp = empOverview.employee;
              const todayAtt = empOverview.today_attendance;
              const history: any[] = empOverview.attendance_history ?? [];
              const tasks: any[] = empOverview.tasks ?? [];
              const updates: any[] = empOverview.daily_updates ?? [];
              const leaves: any[] = empOverview.leaves ?? [];
              const statusColor = (s: string) =>
                s === "Present" ? "text-emerald-600" : s === "Late" ? "text-amber-600" : s === "On Leave" ? "text-blue-600" : "text-red-500";
              return (
                <div className="p-5 space-y-5">
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      {emp.avatar ? (
                        <img src={emp.avatar} alt={emp.name} className="h-14 w-14 rounded-full object-cover border-2 border-primary/20" />
                      ) : (
                        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                          {emp.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-base text-foreground">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.designation} · {emp.empId}</p>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {(emp.roles ?? [emp.role]).map((r: string) => (
                            <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" />{emp.email}</div>
                      {emp.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" />{emp.phone}</div>}
                      <div className="flex items-center gap-1.5 text-muted-foreground"><Briefcase className="h-3 w-3" />{emp.department}</div>
                      {emp.date_of_joining && <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="h-3 w-3" />Joined: {emp.date_of_joining}</div>}
                      <div className="text-muted-foreground col-span-2">Reports to: <span className="text-foreground font-medium">{emp.reports_to}</span></div>
                      {emp.is_wfh && <Badge variant="outline" className="text-[10px] w-fit">Work From Home</Badge>}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Today Attendance</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div><span className="text-muted-foreground text-xs">Status </span><span className={"font-bold " + statusColor(todayAtt.status)}>{todayAtt.status}</span></div>
                      <div><span className="text-muted-foreground text-xs">In </span><span className="font-medium">{todayAtt.check_in ? format(new Date(todayAtt.check_in), "h:mm a") : "—"}</span></div>
                      <div><span className="text-muted-foreground text-xs">Out </span><span className="font-medium">{todayAtt.check_out ? format(new Date(todayAtt.check_out), "h:mm a") : "—"}</span></div>
                      <div><span className="text-muted-foreground text-xs">Hours </span><span className="font-medium">{todayAtt.hours > 0 ? todayAtt.hours + "h" : "—"}</span></div>
                    </div>
                  </div>

                  {history.length > 0 && (
                    <div className="rounded-xl border border-border/40 overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/20 border-b border-border/40">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attendance History (Last 14 Days)</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-border/30 text-muted-foreground">
                            <th className="text-left py-2 px-3 font-semibold">Date</th>
                            <th className="text-left py-2 px-3 font-semibold">Status</th>
                            <th className="text-left py-2 px-3 font-semibold">In</th>
                            <th className="text-left py-2 px-3 font-semibold">Out</th>
                            <th className="text-left py-2 px-3 font-semibold">Hrs</th>
                          </tr></thead>
                          <tbody>{history.map((h) => (
                            <tr key={h.id} className="border-b border-border/20 hover:bg-muted/20">
                              <td className="py-2 px-3">{h.date}</td>
                              <td className={"py-2 px-3 font-medium " + statusColor(h.status)}>{h.status}</td>
                              <td className="py-2 px-3">{h.check_in ? format(new Date(h.check_in), "h:mm a") : "—"}</td>
                              <td className="py-2 px-3">{h.check_out ? format(new Date(h.check_out), "h:mm a") : "—"}</td>
                              <td className="py-2 px-3">{h.hours > 0 ? h.hours + "h" : "—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks ({tasks.length})</p>
                    {tasks.length === 0 ? (
                      <div className="p-3 rounded-lg border border-border/40 bg-muted/10 text-xs text-muted-foreground text-center">
                        No tasks assigned to this employee.
                      </div>
                    ) : (
                      tasks.map((t) => (
                        <div key={t.id} className={"rounded-lg border p-3 text-xs space-y-1.5 " + (t.is_overdue ? "border-red-400/40 bg-red-500/5" : t.status === "reviewed" ? "border-purple-400/30 bg-purple-500/5" : t.status === "completed" ? "border-emerald-400/30 bg-emerald-500/5" : "border-border/40")}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-foreground leading-snug">{t.title}</span>
                            <div className="flex gap-1 shrink-0">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{t.priority}</Badge>
                              <Badge variant="outline" className={"text-[10px] px-1.5 py-0 " + (t.is_overdue ? "border-red-400 text-red-600" : (t.status === "completed" || t.status === "reviewed") ? "border-emerald-400 text-emerald-600" : "")}>
                                {t.is_overdue ? "Overdue" : t.status.replace("_", " ")}
                              </Badge>
                            </div>
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.description}</p>}
                          {t.due_datetime && <p className="text-muted-foreground">Due: {format(new Date(t.due_datetime), "PP p")}</p>}
                          {t.completion_notes && <p className="text-emerald-700 dark:text-emerald-400"><span className="font-semibold">Report: </span>{t.completion_notes}</p>}
                          {t.incomplete_reason && <p className="text-orange-600"><span className="font-semibold">Delay: </span>{t.incomplete_reason}</p>}
                        </div>
                      ))
                    )}
                  </div>

                  {updates.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Daily Updates</p>
                      {updates.map((u) => (
                        <div key={u.id} className="rounded-lg border border-border/40 p-3 text-xs space-y-1">
                          <p className="text-muted-foreground font-medium">{u.date}</p>
                          <p className="text-foreground whitespace-pre-wrap">{u.update_text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {leaves.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leave Requests</p>
                      {leaves.map((lr) => (
                        <div key={lr.id} className="rounded-lg border border-border/40 p-3 text-xs flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium capitalize">{(lr.leave_type ?? "").replace(/_/g, " ")} leave</p>
                            <p className="text-muted-foreground">{lr.start_date} to {lr.end_date}</p>
                            {lr.reason && <p className="text-muted-foreground mt-0.5">{lr.reason}</p>}
                          </div>
                          <Badge variant="outline" className={"text-[10px] capitalize shrink-0 " + (lr.status === "approved" ? "border-emerald-400 text-emerald-600" : lr.status === "rejected" ? "border-red-400 text-red-600" : "")}>{lr.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
