import { useEffect, useState, useRef } from "react";
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
import { format } from "date-fns";
import { attendanceBreakEndRequest, attendanceBreakStartRequest, attendanceSessionRequest, updatesPostRequest } from "@/lib/api";

function formatDuration(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const FULL_DAY_MS = 8 * 60 * 60 * 1000;

type VerifyStep = "face" | "location" | "done" | null;

export default function EmployeeDashboard() {
  const { user, accessToken } = useAuthStore();
  const { leaves } = useDataStore();
  const { status, checkInAt, checkOutAt, workedMsToday, totalBreakMs, breakStartAt, breaks, setCheckInAt, hydrateSession, startBreak, endBreak, checkOut, reset } = useAttendanceStore();
  const [now, setNow] = useState(Date.now());
  const [coDialog, setCoDialog] = useState(false);
  const [workNote, setWorkNote] = useState("");
  const [earlyReason, setEarlyReason] = useState("");

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showCheckoutVerifyModal, setShowCheckoutVerifyModal] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);

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

  useEffect(() => {
    if (!accessToken) return;
    const restore = async () => {
      // Always clear previous session state when switching users.
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
        // Not checked-in today for this employee.
        reset();
        return;
      }

      const breakList = (body.breaks || [])
        .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
        .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));
      const breakStartAtMs = body.active_break_start ? new Date(body.active_break_start).getTime() : null;
      const totalBreakMsFromApi = Math.max(0, (body.total_break_minutes || 0) * 60 * 1000);
      const checkedOutAtMs = body.checked_out_at ? new Date(body.checked_out_at).getTime() : null;
      const workedMs = Math.max(0, (body.total_work_minutes || 0) * 60 * 1000);

      hydrateSession({
        status: body.active ? (breakStartAtMs ? "on-break" : "checked-in") : "checked-out",
        checkInAt: new Date(body.checked_in_at).getTime(),
        checkOutAt: checkedOutAtMs,
        workedMsToday: workedMs,
        totalBreakMs: totalBreakMsFromApi,
        breakStartAt: breakStartAtMs,
        breaks: breakList,
      });
    };
    void restore();
  }, [accessToken, hydrateSession, reset]);

  const currentBreak = status === "on-break" && breakStartAt ? now - breakStartAt : 0;
  const liveWorkMs = checkInAt ? now - checkInAt - totalBreakMs - currentBreak : 0;
  const workMs = status === "checked-out" ? workedMsToday : liveWorkMs;
  const isEarly = workMs < FULL_DAY_MS;
  const remainingMs = Math.max(0, FULL_DAY_MS - workMs);
  const breakTakenMs = totalBreakMs + currentBreak;
  const remainingDisplayMs = status === "checked-out" ? 0 : status === "idle" ? FULL_DAY_MS : remainingMs;
  const breakProgressPct = Math.min(100, Math.round((breakTakenMs / FULL_DAY_MS) * 100));
  const pendingApprovals = leaves.filter((l) => l.empId === user?.empId && l.status === "Pending").length;

  const handleCheckIn = () => {
    setShowVerifyModal(true);
  };

  const handleVerified = (data?: { checkInAt?: string }) => {
    setShowVerifyModal(false);
    const serverMs = data?.checkInAt ? new Date(data.checkInAt).getTime() : Date.now();
    setCheckInAt(serverMs);
    toast.success("Check-in successful");
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

  const handleCheckoutVerified = (data?: { checkOutAt?: string; totalHours?: number }) => {
    setShowCheckoutVerifyModal(false);
    const outMs = data?.checkOutAt ? new Date(data.checkOutAt).getTime() : Date.now();
    const workedMsFromApi = typeof data?.totalHours === "number" ? Math.max(0, data.totalHours * 60 * 60 * 1000) : workMs;
    checkOut({ checkOutAt: outMs, workedMsToday: workedMsFromApi });
    toast.success(isEarly ? "Checked out early. Take care!" : "Checked out. See you tomorrow!");
  };

  const quickActions = [
    { label: "Apply Leave", description: "Request casual/sick leave and track approval status.", icon: CalendarDays, to: "/employee/leaves", accent: "icon-3d-sage" },
    { label: "Attendance", description: "See your check-in/out history and daily status.", icon: Clock, to: "/employee/attendance", accent: "icon-3d-peach" },
    { label: "Updates", description: "View daily updates you shared today.", icon: MessageSquare, to: "/employee/updates", accent: "icon-3d-powder" },
    { label: "Profile", description: "Manage your profile and face settings.", icon: User, to: "/profile", accent: "icon-3d-cream" },
  ];

  const completedPct = Math.min(100, Math.round((workMs / FULL_DAY_MS) * 100));

  return (
    <div className="space-y-6">
      <CheckInModal open={showVerifyModal} onOpenChange={setShowVerifyModal} onVerified={handleVerified} mode="check-in" />
      <CheckInModal open={showCheckoutVerifyModal} onOpenChange={setShowCheckoutVerifyModal} onVerified={handleCheckoutVerified} mode="check-out" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.5px' }}>Hi, {user?.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">{completedPct}% of your day</span>
        </div>
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
                1) Tap <b>Check In</b> (Face + GPS). 2) Break માટે <b>Break</b> અને પછી <b>Resume</b>. 3) Daily work complete হলে <b>Check Out</b>.
              </p>
            </div>
            <Button size="sm" className="hover-shine" onClick={() => setShowHowToUse(false)} type="button">
              Got it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Check-in hero card — 3D sage */}
      <Card className="relative overflow-hidden border-0 shadow-3d rounded-3xl min-h-[220px] flex flex-col justify-center">
        <div className="absolute inset-0 bg-sage-3d" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-12 -left-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />

        <CardContent className="relative p-6 sm:p-8 text-primary-foreground">
          <AnimatePresence mode="wait">
            <motion.div
              key="idle-working"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
            >
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary-foreground/80">
                  {status === "idle" ? "You're off the clock" : status === "on-break" ? "On break" : status === "checked-out" ? "Today's work complete" : "Currently working"}
                </p>
                <motion.p
                  key={status}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-4xl sm:text-6xl font-bold tabular-nums tracking-tight"
                >
                  {status === "idle" ? formatDuration(0) : status === "checked-out" ? formatDuration(workMs) : formatDuration(remainingMs)}
                </motion.p>

                {/* Clear status stats (remaining + break time) */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-primary-foreground/75">Remaining</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">
                      {formatDuration(remainingDisplayMs)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
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
                    Checked in at {format(new Date(checkInAt!), "h:mm a")} · {breaks.length} breaks taken
                  </p>
                )}
                {status === "checked-out" && (
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    {checkInAt ? format(new Date(checkInAt), "h:mm a") : "—"} - {checkOutAt ? format(new Date(checkOutAt), "h:mm a") : "—"} · Total worked today
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
                  <>
                    <Button size="lg" onClick={handleBreak}
                      className="h-14 px-6 bg-white/20 hover:bg-white/30 text-white border border-white/30 font-semibold backdrop-blur rounded-2xl hover-shine hover:scale-[1.02]">
                      {status === "on-break" ? <><Play className="h-5 w-5 mr-2" /> Resume</> : <><Coffee className="h-5 w-5 mr-2" /> Break</>}
                    </Button>
                    <Button size="lg" onClick={openCheckout}
                      className="h-14 px-6 bg-destructive hover:bg-destructive/90 font-semibold shadow-3d rounded-2xl hover-shine hover:scale-[1.02]">
                      <Square className="h-5 w-5 mr-2 fill-current" /> Check Out
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Quick actions — peach + powder + sage 3D */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
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
                        {format(new Date(b.start), "h:mm a")} – {format(new Date(b.end), "h:mm a")}
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
        <DialogContent className="sm:max-w-[480px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-5 w-5 text-primary" /> Wrap up your day
            </DialogTitle>
            <DialogDescription>
              Worked {formatDuration(workMs)} today · {completedPct}% of an 8h day
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {isEarly && (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3.5 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-warning-foreground">Early check-out</p>
                  <p className="text-xs text-muted-foreground">You haven't completed 8 hours yet. Please share a reason below.</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>What did you work on today? <span className="text-destructive">*</span></Label>
              <Textarea
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
                placeholder="Shipped X, paired with Y on Z, reviewed 3 PRs..."
                className="min-h-[90px] rounded-2xl"
              />
              <p className="text-[11px] text-muted-foreground">This will also post to the Daily Updates feed.</p>
            </div>

            {isEarly && (
              <div className="space-y-1.5">
                <Label>Reason for early check-out <span className="text-destructive">*</span></Label>
                <Textarea
                  value={earlyReason}
                  onChange={(e) => setEarlyReason(e.target.value)}
                  placeholder="Doctor appointment, family emergency, half-day approved..."
                  className="min-h-[70px] rounded-2xl"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCoDialog(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={confirmCheckout} className="bg-sage-3d shadow-3d border-0 text-primary-foreground rounded-xl">
              Confirm check-out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
