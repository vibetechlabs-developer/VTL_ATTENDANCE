import { Users, UserCheck, UserX, AlertTriangle, CheckCircle2, ChevronRight, CalendarCheck, ShieldCheck, ClipboardList, Zap } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { AttendanceChart } from "@/components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { attendanceAdminRequest, leavePendingRequest, updatesRequest, usersListRequest } from "@/lib/api";
import { format } from "date-fns";

export default function AdminDashboard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const [eRes, aRes, lRes, uRes] = await Promise.all([
        usersListRequest(accessToken),
        attendanceAdminRequest(accessToken, today),
        leavePendingRequest(accessToken),
        updatesRequest(accessToken, { all: true }),
      ]);
      if (eRes.ok) setEmployees(await eRes.json());
      if (aRes.ok) setAttendance(await aRes.json());
      if (lRes.ok) setLeaves(await lRes.json());
      if (uRes.ok) setUpdates(await uRes.json());
    };
    void run();
  }, [accessToken]);

  const total = employees.length;
  const present = attendance.filter((a) => a.status === "Present" || a.status === "Late").length;
  const absent = attendance.filter((a) => a.status === "Absent").length;
  const late = attendance.filter((a) => a.status === "Late").length;
  const pendingApprovals = leaves.length;
  const teamQuick = [...attendance]
    .sort((a, b) => {
      const ta = a.checkIn ? new Date(a.checkIn).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.checkIn ? new Date(b.checkIn).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    })
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.5px' }}>Welcome back 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening across your workforce today.</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
      >
        <StatCard label="Total Employees" value={total} icon={Users} trend={4.2} accent="primary" onClick={() => navigate("/admin/users")} />
        <StatCard label="Present Today" value={present} icon={UserCheck} trend={2.1} accent="success" onClick={() => navigate("/admin/attendance")} />
        <StatCard label="Absent" value={absent} icon={UserX} trend={-1.4} accent="warning" onClick={() => navigate("/admin/attendance")} />
        <StatCard label="Late Arrivals" value={late} icon={AlertTriangle} trend={-0.5} accent="info" onClick={() => navigate("/admin/attendance")} />
        <StatCard label="Pending Approvals" value={pendingApprovals} icon={CheckCircle2} accent="success" onClick={() => navigate("/admin/leaves")} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
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
            {updates.slice(0, 5).map((u, i) => (
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
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card-premium border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Admin Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Team Attendance", icon: CalendarCheck, url: "/admin/attendance", extra: `${present}/${total}` },
              { label: "Approvals", icon: CheckCircle2, url: "/admin/leaves" },
              { label: "Tasks", icon: ClipboardList, url: "/admin/updates" },
              { label: "Audit Logs", icon: ShieldCheck, url: "/admin/audit" }
            ].map((action, i) => (
              <div key={i} onClick={() => navigate(action.url)} className="flex items-center justify-between p-4 bg-muted/15 hover:bg-muted/40 hover:-translate-y-[1px] transition-all duration-200 rounded-2xl cursor-pointer group border border-border/30">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${action.label === "Approvals" ? "bg-success/10" : action.label === "Tasks" ? "bg-warning/10" : action.label === "Audit Logs" ? "bg-info/10" : "bg-primary/10"}`}>
                    <action.icon className="h-5 w-5" style={{ color: action.label === "Approvals" ? 'hsl(var(--success))' : action.label === "Tasks" ? 'hsl(var(--warning))' : action.label === "Audit Logs" ? 'hsl(var(--info))' : 'hsl(var(--primary))' }} />
                  </div>
                  <span className="font-medium">{action.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  {action.extra && <span className="font-semibold text-sm text-muted-foreground">{action.extra}</span>}
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card-premium border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Today's Team Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {teamQuick.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
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
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    a.status === "Present"
                      ? "bg-success/15 text-success"
                      : a.status === "Late"
                        ? "bg-warning/15 text-warning"
                        : a.status === "On Leave"
                          ? "bg-info/15 text-info"
                          : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {a.status}
                </span>
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}
