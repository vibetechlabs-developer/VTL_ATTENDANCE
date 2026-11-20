import { format } from "date-fns";
import { formatApiDate, formatTimestampMs, parseApiDate } from "@/utils/safeDate";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play,
  Square,
  Coffee,
  Clock,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  X,
  ChevronRight,
  CalendarDays,
  Briefcase,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

import { CheckInModal } from "@/components/CheckInModal";
import { StatCard } from "@/components/StatCard";
import { AttendanceChart } from "@/components/Charts";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useAuthStore } from "@/store/authStore";
import { useAttendanceStore } from "@/store/attendanceStore";
import {
  attendanceAdminRequest,
  attendanceBreakEndRequest,
  attendanceBreakStartRequest,
  attendanceSessionRequest,
  appraisalCreateRequest,
  employeeOverviewRequest,
} from "@/lib/api";

const FULL_DAY_MS = 8 * 60 * 60 * 1000;

function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

type AttendanceAdminRow = {
  id: string;
  employeePk: string;
  name: string;
  empId: string;
  department: string;
  role: string;
  status: "Present" | "Late" | "Absent" | "On Leave";
  checkIn: string | null;
  checkOut: string | null;
  hours: number;
  overtimeHours?: number;
};

export default function ManagerDashboard() {
  const { user, accessToken } = useAuthStore();
  const {
    status,
    checkInAt,
    checkOutAt,
    workedMsToday,
    totalBreakMs,
    breakStartAt,
    breaks,
    setCheckInAt,
    hydrateSession,
    startBreak,
    endBreak,
    checkOut,
    reset,
  } = useAttendanceStore();

  const [now, setNow] = useState(Date.now());
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCheckoutVerifyModal, setShowCheckoutVerifyModal] = useState(false);

  const [teamRows, setTeamRows] = useState<AttendanceAdminRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [appraisalEmployeeId, setAppraisalEmployeeId] = useState("");
  const [appraisalRating, setAppraisalRating] = useState("5");
  const [appraisalMessage, setAppraisalMessage] = useState("");
  const [appraisalSending, setAppraisalSending] = useState(false);

  // Employee Overview Sheet state
  const [selectedEmployeePk, setSelectedEmployeePk] = useState<string | null>(null);
  const [empOverview, setEmpOverview] = useState<any>(null);
  const [empOverviewLoading, setEmpOverviewLoading] = useState(false);

  const loadEmployeeOverview = async (empPk: string) => {
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
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Restore manager personal attendance state from backend.
  useEffect(() => {
    if (!accessToken) return;

    const restore = async () => {
      reset();
      const res = await attendanceSessionRequest(accessToken);
      if (!res.ok) return;

      const body = (await res.json().catch(() => ({}))) as {
        active?: boolean;
        checked_in_at?: string;
        checked_out_at?: string | null;
        total_work_minutes?: number;
        total_break_minutes?: number;
        active_break_start?: string | null;
        breaks?: { start: string; end: string }[];
      };

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
      const workedMs = Math.max(0, (body.total_work_minutes || 0) * 60 * 1000);

      hydrateSession({
        status: body.active ? (breakStartAtMs ? "on-break" : "checked-in") : "checked-out",
        checkInAt: parseApiDate(body.checked_in_at)?.getTime() ?? Date.now(),
        checkOutAt: checkedOutAtMs,
        workedMsToday: workedMs,
        totalBreakMs: totalBreakMsFromApi,
        breakStartAt: breakStartAtMs,
        breaks: breakList,
      });
    };

    void restore();
  }, [accessToken, hydrateSession, reset]);

  // Load today's team attendance (restricted to your department as a proxy for "under you").
  useEffect(() => {
    if (!accessToken) return;

    const run = async () => {
      setTeamLoading(true);
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const res = await attendanceAdminRequest(accessToken, today);
        if (!res.ok) return;

        const rows = (await res.json().catch(() => [])) as AttendanceAdminRow[];
        setTeamRows(Array.isArray(rows) ? rows : []);
      } finally {
        setTeamLoading(false);
      }
    };

    void run();
  }, [accessToken, user?.department]);

  const currentBreak = status === "on-break" && breakStartAt ? now - breakStartAt : 0;
  const liveWorkMs = checkInAt ? now - checkInAt - totalBreakMs - currentBreak : 0;
  const workMs = status === "checked-out" ? workedMsToday : liveWorkMs;
  const remainingMs = Math.max(0, FULL_DAY_MS - workMs);
  const completedPct = Math.min(100, Math.round((workMs / FULL_DAY_MS) * 100));

  const teamStats = useMemo(() => {
    const total = teamRows.length;
    const present = teamRows.filter((a) => a.status === "Present").length;
    const absent = teamRows.filter((a) => a.status === "Absent").length;
    const late = teamRows.filter((a) => a.status === "Late").length;
    return { total, present, absent, late };
  }, [teamRows]);

  const formatTime = (iso: string | null) => formatApiDate(iso, "h:mm a");

  const handleVerified = (data?: { checkInAt?: string }) => {
    setShowVerifyModal(false);
    const serverMs = data?.checkInAt ? new Date(data.checkInAt).getTime() : Date.now();
    setCheckInAt(serverMs);
    toast.success("Check-in successful");
  };

  const handleCheckoutVerified = (data?: { checkOutAt?: string; totalHours?: number }) => {
    setShowCheckoutVerifyModal(false);
    const outMs = data?.checkOutAt ? new Date(data.checkOutAt).getTime() : Date.now();
    const workedMsFromApi =
      typeof data?.totalHours === "number" ? Math.max(0, data.totalHours * 60 * 60 * 1000) : workMs;
    checkOut({ checkOutAt: outMs, workedMsToday: workedMsFromApi });
    toast.success("Checked out successfully");
  };

  const handleGiveAppraisal = async () => {
    if (!accessToken) return;
    const message = appraisalMessage.trim();
    if (!appraisalEmployeeId) {
      toast.error("Select a team member");
      return;
    }
    if (message.length < 10) {
      toast.error("Appraisal message must be at least 10 characters");
      return;
    }
    setAppraisalSending(true);
    try {
      const res = await appraisalCreateRequest(accessToken, {
        employee_id: Number(appraisalEmployeeId),
        rating: Number(appraisalRating),
        message,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not send appraisal");
        return;
      }
      toast.success(body.message || "Appraisal sent — employee will be notified");
      setAppraisalMessage("");
      setAppraisalEmployeeId("");
      setAppraisalRating("5");
    } finally {
      setAppraisalSending(false);
    }
  };

  const handleBreak = async () => {
    if (!accessToken) return;
    if (status === "on-break") {
      const res = await attendanceBreakEndRequest(accessToken);
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
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

  return (
    <div className="space-y-6">
      <CheckInModal open={showVerifyModal} onOpenChange={setShowVerifyModal} onVerified={handleVerified} mode="check-in" />
      <CheckInModal
        open={showCheckoutVerifyModal}
        onOpenChange={setShowCheckoutVerifyModal}
        onVerified={handleCheckoutVerified}
        mode="check-out"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            Hi, {user?.name?.split(" ")[0] || "Manager"} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">{completedPct}% of your day</span>
        </div>
      </div>

      {/* Personal check-in/out hero */}
      <Card className="relative overflow-hidden border-0 shadow-3d rounded-3xl min-h-[220px] flex flex-col justify-center">
        <div
          className={`absolute inset-0 ${status === "on-break" ? "bg-peach-3d" : "bg-sage-3d"}`}
        />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-12 -left-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />

        <CardContent className="relative p-6 sm:p-8 text-primary-foreground">
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
            >
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
                  {status === "idle"
                    ? "You're off the clock"
                    : status === "on-break"
                      ? "On break"
                      : status === "checked-out"
                        ? "Today's work complete"
                        : "Currently working"}
                </p>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-4xl sm:text-6xl font-bold tabular-nums tracking-tight"
                >
                  {status === "idle"
                    ? formatDuration(0)
                    : status === "checked-out"
                      ? formatDuration(workMs)
                      : formatDuration(remainingMs)}
                </motion.p>

                {status !== "idle" && status !== "checked-out" && (
                  <>
                    <p className="mt-2 text-sm text-primary-foreground/85">
                      {status === "on-break" ? `Break: ${formatDuration(currentBreak)} · ` : ""}
                      Remaining working time
                    </p>
                    <p className="mt-2 text-sm text-primary-foreground/85">
                      Checked in at {checkInAt ? formatTimestampMs(checkInAt, "h:mm a") : "—"} · {breaks.length} breaks taken
                    </p>
                  </>
                )}

                {status === "checked-out" && (
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    {checkInAt ? formatTimestampMs(checkInAt, "h:mm a") : "—"} -{" "}
                    {checkOutAt ? formatTimestampMs(checkOutAt, "h:mm a") : "—"} · Total worked today
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {status === "idle" ? (
                  <Button
                    size="lg"
                    onClick={() => setShowVerifyModal(true)}
                    className="h-14 px-8 bg-white text-primary hover:bg-white/90 font-semibold shadow-3d animate-pulse-ring rounded-2xl border-0"
                  >
                    <Play className="h-5 w-5 mr-2 fill-primary" /> Check In
                  </Button>
                ) : status === "checked-out" ? (
                  <div className="h-14 px-6 rounded-2xl bg-white/20 text-white border border-white/30 font-semibold backdrop-blur flex items-center">
                    <CheckCircle2 className="h-5 w-5 mr-2" /> Checked out for today
                  </div>
                ) : (
                  <>
                    <Button
                      size="lg"
                      onClick={() => void handleBreak()}
                      className="h-14 px-6 bg-white/20 hover:bg-white/30 text-white border border-white/30 font-semibold backdrop-blur rounded-2xl"
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
                      onClick={() => setShowCheckoutVerifyModal(true)}
                      className="h-14 px-6 bg-destructive hover:bg-destructive/90 font-semibold shadow-3d rounded-2xl"
                    >
                      <Square className="h-5 w-5 mr-2 fill-current" /> Check Out
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Team attendance (single page, manager-scoped) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ letterSpacing: "-0.3px" }}>
            Team Attendance
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Only employees under your team scope.</p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Staff" value={teamStats.total} icon={Users} trend={0} accent="primary" />
        <StatCard label="Present Today" value={teamStats.present} icon={UserCheck} trend={2.1} accent="success" />
        <StatCard label="Absent" value={teamStats.absent} icon={UserX} trend={-1.4} accent="warning" />
        <StatCard label="Late Arrivals" value={teamStats.late} icon={AlertTriangle} trend={-0.5} accent="info" />
      </div>

      <Card className="glass-card-premium border-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Weekly Attendance</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Last 7 days trend</p>
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceChart />
        </CardContent>
      </Card>

      <Card className="glass-card-premium border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Today's Attendance Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Employee</th>
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Department</th>
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Check In</th>
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Check Out</th>
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Hours</th>
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Profile</th>
                </tr>
              </thead>
              <tbody>
                {teamLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      Loading team attendance...
                    </td>
                  </tr>
                ) : teamRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No team attendance found.
                    </td>
                  </tr>
                ) : (
                  teamRows.map((a, i) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-border/30 hover:bg-primary/5 transition-smooth cursor-pointer"
                      onClick={() => void loadEmployeeOverview(a.employeePk)}
                    >
                      <td className="py-3 px-2 font-medium">{a.name}</td>
                      <td className="py-3 px-2 text-muted-foreground">{a.department}</td>
                      <td className="py-3 px-2 tabular-nums">{formatTime(a.checkIn)}</td>
                      <td className="py-3 px-2 tabular-nums">{formatTime(a.checkOut)}</td>
                      <td className="py-3 px-2 tabular-nums font-medium">
                        {a.hours > 0 ? a.hours.toFixed(1) : "—"}
                        {Number(a.overtimeHours || 0) > 0 && (
                          <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold bg-warning/15 text-warning">
                            OT {Number(a.overtimeHours).toFixed(1)}h
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <StatusPill
                          label={a.status}
                          variant={
                            a.status === "Present"
                              ? "success"
                              : a.status === "Late"
                                ? "warning"
                                : a.status === "Absent"
                                  ? "destructive"
                                  : "info"
                          }
                        />
                      </td>
                      <td className="py-3 px-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-primary gap-1 px-2"
                          onClick={(e) => { e.stopPropagation(); void loadEmployeeOverview(a.employeePk); }}
                        >
                          View <ChevronRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="soft-3d border-0">
        <CardHeader>
          <CardTitle className="text-base">Give performance appraisal</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Feedback is sent instantly as an in-app notification to the employee.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Team member</Label>
              <Select value={appraisalEmployeeId} onValueChange={setAppraisalEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {teamRows.map((row) => (
                    <SelectItem key={row.employeePk} value={String(row.employeePk)}>
                      {row.name} ({row.empId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rating</Label>
              <Select value={appraisalRating} onValueChange={setAppraisalRating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "4", "3", "2", "1"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r} / 5
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Appraisal message</Label>
            <Textarea
              value={appraisalMessage}
              onChange={(e) => setAppraisalMessage(e.target.value)}
              placeholder="Share strengths, areas to improve, and goals for the next period..."
              rows={4}
            />
          </div>
          <Button
            className="bg-gradient-primary"
            disabled={appraisalSending || teamRows.length === 0}
            onClick={() => void handleGiveAppraisal()}
          >
            {appraisalSending ? "Sending..." : "Send appraisal & notify"}
          </Button>
        </CardContent>
      </Card>

      {/* Employee Overview Sheet */}
      <Sheet open={selectedEmployeePk !== null} onOpenChange={(open) => { if (!open) { setSelectedEmployeePk(null); setEmpOverview(null); } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="p-5 pb-3 border-b border-border/40 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              {empOverview?.employee?.name ?? "Employee"} — Full Profile
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
