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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useAuthStore } from "@/store/authStore";
import { useAttendanceStore } from "@/store/attendanceStore";
import {
  attendanceAdminRequest,
  attendanceBreakEndRequest,
  attendanceBreakStartRequest,
  attendanceSessionRequest,
  appraisalCreateRequest,
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
        const dept = user?.department;
        const filtered = rows
          .filter((r) => (dept ? r.department === dept : true))
          .filter((r) => r.role === "employee" || r.role === "sales");

        setTeamRows(filtered);
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
                      className="border-b border-border/30 hover:bg-muted/30 transition-smooth"
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
    </div>
  );
}
