import { useEffect, useMemo, useState } from "react";
import { Download, Search, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, UserCheck, UserX, Plane, Eye, Coffee, UserPlus, UserMinus } from "lucide-react";
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { exportCsv } from "@/utils/csv";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { attendanceAdminHistoryRequest, attendanceAdminRequest, attendanceForceCheckoutRequest } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AttendanceManagement() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState("All");
  const today = new Date();
  const canGoNext = format(date, "yyyy-MM-dd") < format(today, "yyyy-MM-dd");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState<"week" | "month">("week");
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadAttendance = async () => {
    if (!accessToken) return;
    const res = await attendanceAdminRequest(accessToken, format(date, "yyyy-MM-dd"));
    if (!res.ok) return;
    setAttendance(await res.json());
  };

  const loadHistory = async (mode: "week" | "month", row: any) => {
    if (!accessToken) return;
    setHistoryLoading(true);
    try {
      const from = mode === "week" ? startOfWeek(date, { weekStartsOn: 1 }) : startOfMonth(date);
      const to = mode === "week" ? endOfWeek(date, { weekStartsOn: 1 }) : endOfMonth(date);
      const res = await attendanceAdminHistoryRequest(accessToken, {
        employee_id: row.employeePk,
        from: format(from, "yyyy-MM-dd"),
        to: format(to, "yyyy-MM-dd"),
      });
      const body = (await res.json().catch(() => [])) as any[];
      if (!res.ok) {
        toast.error((body as any)?.error || "Could not load attendance history");
        setHistoryRows([]);
        return;
      }
      setHistoryRows(Array.isArray(body) ? body : []);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = async (row: any) => {
    setSelectedEmployee(row);
    setHistoryMode("week");
    setHistoryRows([]);
    setHistoryOpen(true);
    await loadHistory("week", row);
  };

  useEffect(() => {
    void loadAttendance();
  }, [accessToken, date]);

  const rows = attendance.filter((a) =>
    (activeTab === "All" || (activeTab === "Present" && a.status === "Present") || (activeTab === "Absent" && a.status === "Absent") || (activeTab === "On Leave" && (a.status as string) === "On Leave")) &&
    (q === "" || [a.name, a.empId, a.department].some((v) => v.toLowerCase().includes(q.toLowerCase())))
  );

  const total = attendance.length;
  const presentCount = attendance.filter(a => a.status === "Present" || a.status === "Late").length;
  const absentCount = attendance.filter(a => a.status === "Absent").length;
  const leaveCount = attendance.filter(a => a.status === "On Leave").length;
  const canForceCheckout = user?.role === "admin" || user?.role === "hr";

  const handleForceCheckout = async (row: any) => {
    if (!accessToken || !canForceCheckout) return;
    const res = await attendanceForceCheckoutRequest(accessToken, {
      employee_id: row.employeePk,
      date: format(date, "yyyy-MM-dd"),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Force check-out failed");
      return;
    }
    toast.success(body.message || "Force check-out done");
    await loadAttendance();
  };

  return (
    <div className="space-y-8 w-full max-w-none">
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-3xl rounded-3xl border-border/50 bg-card/95 backdrop-blur-2xl shadow-3d max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendance History</DialogTitle>
            <DialogDescription>
              {selectedEmployee?.name || "Employee"} · {historyMode === "week" ? "This week" : "This month"}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={historyMode}
            onValueChange={(v) => {
              const mode = (v === "month" ? "month" : "week") as "week" | "month";
              setHistoryMode(mode);
              if (selectedEmployee) void loadHistory(mode, selectedEmployee);
            }}
          >
            <TabsList className="w-full rounded-2xl">
              <TabsTrigger value="week" className="flex-1 rounded-xl">Week</TabsTrigger>
              <TabsTrigger value="month" className="flex-1 rounded-xl">Month</TabsTrigger>
            </TabsList>

            <TabsContent value="week" className="mt-4">
              <HistoryTable loading={historyLoading} rows={historyRows} />
            </TabsContent>
            <TabsContent value="month" className="mt-4">
              <HistoryTable loading={historyLoading} rows={historyRows} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <div>
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team Attendance</h1>
        </div>
        <p className="text-muted-foreground mt-1 ml-9">View and track staff attendance for any date</p>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setDate(subDays(date, 1))} className="p-2 rounded-full border border-border/50 hover:bg-muted/50 transition-smooth">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 font-semibold text-base sm:text-lg text-primary bg-muted/20 rounded-xl">
          <CalendarIcon className="h-5 w-5" />
          {format(date, "dd-MM-yyyy")}
        </div>
        <button
          onClick={() => canGoNext && setDate(addDays(date, 1))}
          disabled={!canGoNext}
          className="p-2 rounded-full border border-border/50 hover:bg-muted/50 transition-smooth disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-2xl p-5 flex items-center gap-4 shadow-sm border-glow-shine">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{total}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Total Staff</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-5 flex items-center gap-4 shadow-sm border-glow-shine">
          <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-success">{presentCount}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Present</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-5 flex items-center gap-4 shadow-sm border-glow-shine">
          <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <UserMinus className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-bold text-destructive">{absentCount}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Absent</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-5 flex items-center gap-4 shadow-sm border-glow-shine">
          <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
            <Plane className="h-6 w-6 text-warning" />
          </div>
          <div>
            <p className="text-2xl font-bold text-warning">{leaveCount}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">On Leave</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, ID, or role..." className="pl-9 h-10 bg-transparent border-0 border-b border-border/50 rounded-none focus-visible:ring-0 focus-visible:border-primary shadow-none w-full" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="flex bg-muted/40 p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-hide shrink-0">
            {["All", "Present", "Absent", "On Leave"].map(tab => {
              const count = tab === "All" ? total : tab === "Present" ? presentCount : tab === "Absent" ? absentCount : leaveCount;
              return (
                <button
                  key={tab}
                  className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-smooth whitespace-nowrap ${activeTab === tab ? "bg-background shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab} ({count})
                </button>
              )
            })}
          </div>
        </div>

        <button onClick={() => exportCsv("team_attendance.csv", rows)} className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors shrink-0">
          <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
        </button>
      </div>

      {/* Mobile/tablet: card list; Desktop: table */}
      <div className="lg:hidden space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-card shadow-sm border-glow-shine p-6 text-center text-sm text-muted-foreground">
            No records found.
          </div>
        ) : (
          rows.map((r) => {
            const role = r.role || "employee";
            const isPresent = r.status === "Present" || r.status === "Late";
            return (
              <div key={r.id} className="rounded-2xl bg-card shadow-sm border-glow-shine p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{String(r.empId).split("-")[1] || r.empId} · {r.department}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{role}</p>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${isPresent ? "bg-success/15 text-success" : r.status === "On Leave" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"}`}>
                    {isPresent ? <UserCheck className="h-3 w-3" /> : r.status === "On Leave" ? <Plane className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                    {r.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Check In</p>
                    <p className="font-medium text-sm">{r.checkIn ? format(new Date(r.checkIn), "h:mm a") : "—"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Check Out</p>
                    <p className="font-medium text-sm">{r.checkOut ? format(new Date(r.checkOut), "h:mm a") : "—"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Breaks</p>
                    <p className="font-medium text-sm">
                      {r.status === "Present"
                        ? `${Math.floor((r.breakMinutes || 0) / 60)}h ${(r.breakMinutes || 0) % 60}m × ${r.breakCount || 0}`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Hours</p>
                    <p className="font-medium text-sm">{r.hours > 0 ? `${Math.floor(r.hours)}h ${Math.round((r.hours * 60) % 60)}m` : "—"}</p>
                  </div>
                </div>

                {canForceCheckout && (
                  <div className="mt-3">
                    {!r.checkIn || r.checkOut || r.status === "Absent" || r.status === "On Leave" ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => void handleForceCheckout(r)}
                      >
                        Force Out
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="hidden lg:block w-full overflow-x-auto text-sm rounded-2xl bg-card shadow-sm pb-2 border-glow-shine">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Employee</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ID</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Dept / Role</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Check In</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Breaks</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Check Out</th>
              <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Hours</th>
              {canForceCheckout && <th className="text-left py-4 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Action</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const role = r.role || "employee";
              return (
                <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="font-semibold text-sm">{r.name}</span>
                      <button
                        type="button"
                        className="p-1 rounded-md hover:bg-muted/40 transition-smooth"
                        onClick={() => void openHistory(r)}
                        title="View week/month attendance"
                      >
                        <Eye className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-primary" />
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-6"><span className="text-muted-foreground text-xs font-mono">{String(r.empId).split('-')[1] || r.empId}</span></td>
                  <td className="py-3 px-6">
                    <p className="font-medium text-sm capitalize">{role}</p>
                    <p className="text-xs text-muted-foreground">{r.department}</p>
                  </td>
                  <td className="py-3 px-6">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${r.status === "Present" || r.status === "Late" ? "bg-success/15 text-success" :
                      "bg-destructive/15 text-destructive"
                      }`}>
                      {r.status === "Present" || r.status === "Late" ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {r.status}
                    </div>
                  </td>
                  <td className="py-3 px-6 font-medium text-sm">{r.checkIn ? format(new Date(r.checkIn), "h:mm a") : "—"}</td>
                  <td className="py-3 px-6">
                    {r.status === "Present" ? (
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <div className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                        </div>
                        {Math.floor((r.breakMinutes || 0) / 60)}h {(r.breakMinutes || 0) % 60}m <span className="text-[10px] text-muted-foreground font-bold ml-1">× {r.breakCount || 0}</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 px-6">
                    <span className="text-sm font-medium">{r.checkOut ? format(new Date(r.checkOut), "h:mm a") : "—"}</span>
                  </td>
                  <td className="py-3 px-6 text-sm font-medium">{r.hours > 0 ? `${Math.floor(r.hours)}h ${Math.round((r.hours * 60) % 60)}m` : "—"}</td>
                  {canForceCheckout && (
                    <td className="py-3 px-6">
                      {!r.checkIn || r.checkOut || r.status === "Absent" || r.status === "On Leave" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => void handleForceCheckout(r)}
                        >
                          Force Out
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryTable({ loading, rows }: { loading: boolean; rows: any[] }) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-border/40">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border/40 bg-muted/20">
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Check In</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Check Out</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Break</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="py-6 px-4 text-center text-muted-foreground">
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 px-4 text-center text-muted-foreground">
                No records found for this range.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-smooth">
                <td className="py-3 px-4 font-medium">{r.date ? format(new Date(r.date), "dd MMM yyyy") : "—"}</td>
                <td className="py-3 px-4 tabular-nums">{r.checkIn ? format(new Date(r.checkIn), "h:mm a") : "—"}</td>
                <td className="py-3 px-4 tabular-nums">{r.checkOut ? format(new Date(r.checkOut), "h:mm a") : "—"}</td>
                <td className="py-3 px-4 tabular-nums">
                  {typeof r.breakMinutes === "number"
                    ? `${Math.floor(r.breakMinutes / 60)}h ${r.breakMinutes % 60}m`
                    : "—"}
                </td>
                <td className="py-3 px-4 tabular-nums font-semibold">{r.hours > 0 ? Number(r.hours).toFixed(2) : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
