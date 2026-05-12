import {
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CalendarCheck,
  ShieldCheck,
  ClipboardList,
  Zap,
  Download,
  Inbox,
  MapPinOff,
  Check,
  X,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { AttendanceChart } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, format, subDays } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import {
  attendanceAdminRequest,
  leavePendingRequest,
  updatesRequest,
  usersListRequest,
  leaveApproveRequest,
  leaveRejectRequest,
} from "@/lib/api";
import { exportCsv } from "@/utils/csv";
import { toast } from "sonner";

type AttRow = {
  id: string;
  name: string;
  empId: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
};

type LeaveRow = { id: number; employee_name?: string; leave_type?: string; start_date?: string; end_date?: string };

function pctTrend(current: number, previous: number): number | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return current > 0 ? 100 : undefined;
  return Math.round(((current - previous) / previous) * 100);
}

export default function AdminDashboard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttRow[]>([]);
  const [attendancePrev, setAttendancePrev] = useState<AttRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaveBusyId, setLeaveBusyId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    if (!accessToken) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const yest = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const [eRes, aRes, aPrev, lRes, uRes] = await Promise.all([
      usersListRequest(accessToken),
      attendanceAdminRequest(accessToken, today),
      attendanceAdminRequest(accessToken, yest),
      leavePendingRequest(accessToken),
      updatesRequest(accessToken, { all: true }),
    ]);
    if (eRes.ok) setEmployees(await eRes.json());
    if (aRes.ok) setAttendance(await aRes.json());
    if (aPrev.ok) setAttendancePrev(await aPrev.json());
    if (lRes.ok) setLeaves(await lRes.json());
    if (uRes.ok) setUpdates(await uRes.json());
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!accessToken) return;
    const id = window.setInterval(() => void loadAll(), 45000);
    return () => window.clearInterval(id);
  }, [accessToken, loadAll]);

  const total = employees.length;
  const present = attendance.filter((a) => a.status === "Present" || a.status === "Late").length;
  const absent = attendance.filter((a) => a.status === "Absent").length;
  const late = attendance.filter((a) => a.status === "Late").length;
  const pendingApprovals = leaves.length;

  const prevLate = attendancePrev.filter((a) => a.status === "Late").length;
  const prevPresent = attendancePrev.filter((a) => a.status === "Present" || a.status === "Late").length;
  const prevAbsent = attendancePrev.filter((a) => a.status === "Absent").length;

  const missedCheckout = useMemo(
    () =>
      attendance.filter(
        (a) => (a.status === "Present" || a.status === "Late") && a.checkIn && !a.checkOut
      ).length,
    [attendance]
  );

  const teamQuick = useMemo(
    () =>
      [...attendance]
        .sort((a, b) => {
          const ta = a.checkIn ? new Date(a.checkIn).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.checkIn ? new Date(b.checkIn).getTime() : Number.POSITIVE_INFINITY;
          return ta - tb;
        })
        .slice(0, 10),
    [attendance]
  );

  const exportToday = () => {
    if (!attendance.length) {
      toast.error("No attendance rows to export yet.");
      return;
    }
    const rows = attendance.map((a) => ({
      name: a.name,
      empId: a.empId,
      status: a.status,
      checkIn: a.checkIn ?? "",
      checkOut: a.checkOut ?? "",
    }));
    exportCsv(`attendance-${format(new Date(), "yyyy-MM-dd")}.csv`, rows);
    toast.success("Today's report exported");
  };

  const actOnLeave = async (id: number, action: "approve" | "reject") => {
    if (!accessToken) return;
    setLeaveBusyId(id);
    try {
      const res =
        action === "approve"
          ? await leaveApproveRequest(accessToken, id)
          : await leaveRejectRequest(accessToken, id);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Could not update leave");
        return;
      }
      toast.success(action === "approve" ? "Leave approved" : "Leave rejected");
      setLeaves((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setLeaveBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            Welcome back 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Workforce snapshot — auto-refreshes every 45s. Press{" "}
            <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">⌘K</kbd> to search.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-2 shrink-0" onClick={exportToday}>
          <Download className="h-4 w-4" />
          Export today (CSV)
        </Button>
      </motion.div>

      {loading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
        >
          <StatCard
            label="Pending Approvals"
            value={pendingApprovals}
            icon={CheckCircle2}
            trend={undefined}
            accent="warning"
            onClick={() => navigate("/admin/leaves")}
          />
          <StatCard
            label="Late Arrivals"
            value={late}
            icon={AlertTriangle}
            trend={pctTrend(late, prevLate)}
            accent="warning"
            onClick={() => navigate("/admin/attendance")}
          />
          <StatCard
            label="Present Today"
            value={present}
            icon={UserCheck}
            trend={pctTrend(present, prevPresent)}
            accent="success"
            onClick={() => navigate("/admin/attendance")}
          />
          <StatCard
            label="Absent"
            value={absent}
            icon={UserX}
            trend={pctTrend(absent, prevAbsent)}
            accent="info"
            onClick={() => navigate("/admin/attendance")}
          />
          <StatCard label="Total Employees" value={total} icon={Users} trend={undefined} accent="primary" onClick={() => navigate("/admin/users")} />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <Card className="glass-card-premium border-0 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Needs attention</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Grouped actions for HR standup</p>
            </div>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => navigate("/admin/leaves")}
              className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-warning font-semibold text-sm">
                <Inbox className="h-4 w-4" />
                Pending leaves
              </div>
              <p className="text-2xl font-bold tabular-nums mt-2">{pendingApprovals}</p>
              <p className="text-xs text-muted-foreground mt-1">Awaiting decision</p>
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/attendance")}
              className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                <MapPinOff className="h-4 w-4" />
                Open sessions
              </div>
              <p className="text-2xl font-bold tabular-nums mt-2">{missedCheckout}</p>
              <p className="text-xs text-muted-foreground mt-1">Checked in, no check-out yet</p>
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/updates")}
              className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <ClipboardList className="h-4 w-4" />
                Daily updates
              </div>
              <p className="text-2xl font-bold tabular-nums mt-2">{updates.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total posts loaded</p>
            </button>
          </CardContent>
        </Card>

        <Card className="glass-card-premium border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick leave actions</CardTitle>
            <p className="text-xs text-muted-foreground">Approve or reject without leaving dashboard</p>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {leaves.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success/70" />
                No pending leaves. You&apos;re all caught up.
              </div>
            ) : (
              leaves.slice(0, 6).map((lv) => (
                <div
                  key={lv.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/15 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{lv.employee_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {lv.leave_type} · {lv.start_date} → {lv.end_date}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-success hover:text-success"
                      disabled={leaveBusyId === lv.id}
                      onClick={() => void actOnLeave(lv.id, "approve")}
                      aria-label="Approve"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={leaveBusyId === lv.id}
                      onClick={() => void actOnLeave(lv.id, "reject")}
                      aria-label="Reject"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid gap-4 grid-cols-1"
      >
        <Card className="glass-card-premium border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Attendance overview</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Last 7 days</p>
            </div>
          </CardHeader>
          <CardContent>
            <AttendanceChart />
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card-premium border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {updates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium">No updates yet</p>
                <p className="text-xs text-muted-foreground mt-1">When employees post daily updates, they appear here.</p>
              </div>
            ) : (
              updates.slice(0, 5).map((u, i) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-3 p-3 rounded-xl hover:bg-muted/40 hover:-translate-y-[1px] transition-all duration-200 cursor-default"
                >
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-gradient-primary text-primary-foreground text-[10px] font-bold">
                      {u.employee_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="font-medium text-sm truncate">{u.employee_name}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{u.update_text}</p>
                  </div>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="glass-card-premium border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Admin Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Team Attendance", icon: CalendarCheck, url: "/admin/attendance", extra: `${present}/${total}` },
              { label: "Approvals", icon: CheckCircle2, url: "/admin/leaves" },
              { label: "Tasks", icon: ClipboardList, url: "/admin/updates" },
              { label: "Audit Logs", icon: ShieldCheck, url: "/admin/audit" },
            ].map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigate(action.url)}
                className="flex items-center justify-between p-5 bg-muted/15 hover:bg-muted/40 hover:-translate-y-[1px] transition-all duration-200 rounded-2xl cursor-pointer group border border-border/30 hover:shadow-glass hover-shine focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`h-11 w-11 rounded-xl flex items-center justify-center ${
                      action.label === "Approvals"
                        ? "bg-success/10"
                        : action.label === "Tasks"
                          ? "bg-warning/10"
                          : action.label === "Audit Logs"
                            ? "bg-info/10"
                            : "bg-primary/10"
                    }`}
                  >
                    <action.icon
                      className="h-5 w-5"
                      style={{
                        color:
                          action.label === "Approvals"
                            ? "hsl(var(--success))"
                            : action.label === "Tasks"
                              ? "hsl(var(--warning))"
                              : action.label === "Audit Logs"
                                ? "hsl(var(--info))"
                                : "hsl(var(--primary))",
                      }}
                    />
                  </div>
                  <span className="font-medium truncate">{action.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  {action.extra && <span className="font-semibold text-sm text-muted-foreground whitespace-nowrap">{action.extra}</span>}
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card-premium border-0">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Today&apos;s team status</CardTitle>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Live</span>
        </CardHeader>
        <CardContent className="space-y-2">
          <AnimatePresence initial={false}>
            {teamQuick.map((a) => (
              <motion.div
                key={a.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.empId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {a.checkIn ? `In ${format(new Date(a.checkIn), "h:mm a")}` : "Not checked in"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
                      a.status === "Present"
                        ? "bg-success/15 text-success border-success/30"
                        : a.status === "Late"
                          ? "bg-warning/15 text-warning border-warning/30"
                          : a.status === "On Leave"
                            ? "bg-info/15 text-info border-info/30"
                            : "bg-destructive/15 text-destructive border-destructive/30"
                    }`}
                  >
                    {a.status === "Present" && <UserCheck className="h-3.5 w-3.5" />}
                    {a.status === "Late" && <AlertTriangle className="h-3.5 w-3.5" />}
                    {a.status === "On Leave" && <CalendarCheck className="h-3.5 w-3.5" />}
                    {a.status !== "Present" && a.status !== "Late" && a.status !== "On Leave" && <UserX className="h-3.5 w-3.5" />}
                    {a.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
