import { useCallback, useEffect, useState } from "react";
import { Download, Search, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, UserCheck, UserX, Plane, Eye, UserPlus, UserMinus } from "lucide-react";
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, isAfter } from "date-fns";
import { toast } from "sonner";
import { exportCsv } from "@/utils/csv";
import { formatApiDate, safeEachDayOfInterval } from "@/utils/safeDate";
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAttendance = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await attendanceAdminRequest(accessToken, format(date, "yyyy-MM-dd"));
      const body = (await res.json().catch(() => null)) as any[] | { error?: string } | null;
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && !Array.isArray(body) && typeof body.error === "string"
            ? body.error
            : res.status === 401
              ? "Session expired. Please sign in again."
              : "Could not load attendance. Check your connection and try again.";
        setLoadError(msg);
        setAttendance([]);
        toast.error(msg);
        return;
      }
      setAttendance(Array.isArray(body) ? body : []);
    } catch {
      const msg = "Network error loading attendance.";
      setLoadError(msg);
      setAttendance([]);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, date]);

  const loadHistory = async (mode: "week" | "month", row: any) => {
    if (!accessToken) return;
    setHistoryLoading(true);
    try {
      const rawFrom = mode === "week" ? startOfWeek(date, { weekStartsOn: 1 }) : startOfMonth(date);
      const rawTo = mode === "week" ? endOfWeek(date, { weekStartsOn: 1 }) : endOfMonth(date);
      const todayStart = startOfDay(new Date());
      const rangeEnd = isAfter(rawTo, todayStart) ? todayStart : rawTo;
      const res = await attendanceAdminHistoryRequest(accessToken, {
        employee_id: row.employeePk,
        from: format(rawFrom, "yyyy-MM-dd"),
        to: format(rawTo, "yyyy-MM-dd"),
      });
      const body = (await res.json().catch(() => [])) as any[];
      if (!res.ok) {
        toast.error((body as any)?.error || "Could not load attendance history");
        setHistoryRows([]);
        return;
      }
      const logs = Array.isArray(body) ? body : [];
      const byDate = new Map(logs.map((r) => [String(r.date).slice(0, 10), r]));
      const days = safeEachDayOfInterval(rawFrom, rangeEnd).sort((a, b) => b.getTime() - a.getTime());
      setHistoryRows(
        days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const existing = byDate.get(key);
          if (existing) return existing;
          return {
            id: `no-log-${key}`,
            date: key,
            status: "Absent",
            checkIn: null,
            checkOut: null,
            breakMinutes: 0,
            hours: 0,
            overtimeHours: 0,
          };
        })
      );
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
  }, [loadAttendance]);

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
    <div className="min-w-0 space-y-6 sm:space-y-8 w-full max-w-none overflow-x-hidden">
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl rounded-2xl sm:rounded-3xl border-border/50 bg-card/95 backdrop-blur-2xl shadow-3d max-h-[min(85dvh,100%)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attendance History</DialogTitle>
            <DialogDescription>
              {selectedEmployee?.name || "Employee"} ·{" "}
              {historyMode === "week"
                ? `Week of ${format(startOfWeek(date, { weekStartsOn: 1 }), "d MMM")} – ${format(
                    isAfter(endOfWeek(date, { weekStartsOn: 1 }), startOfDay(new Date()))
                      ? startOfDay(new Date())
                      : endOfWeek(date, { weekStartsOn: 1 }),
                    "d MMM yyyy"
                  )}`
                : format(startOfMonth(date), "MMMM yyyy")}
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

      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => setDate(subDays(date, 1))}
          className="p-2 rounded-full border border-border/50 hover:bg-muted/50 transition-smooth touch-manipulation"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 font-semibold text-sm sm:text-lg text-primary bg-muted/20 rounded-xl min-w-0">
          <CalendarIcon className="h-5 w-5 shrink-0" />
          <span className="tabular-nums">{format(date, "dd-MM-yyyy")}</span>
        </div>
        <button
          type="button"
          onClick={() => canGoNext && setDate(addDays(date, 1))}
          disabled={!canGoNext}
          className="p-2 rounded-full border border-border/50 hover:bg-muted/50 transition-smooth disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
          aria-label="Next day"
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto min-w-0">
          <div className="relative w-full sm:w-72 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, ID, or role..." className="pl-9 h-10 bg-transparent border-0 border-b border-border/50 rounded-none focus-visible:ring-0 focus-visible:border-primary shadow-none w-full" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          <div className="flex bg-muted/40 p-1 rounded-xl w-full sm:w-auto touch-scroll-x scrollbar-hide min-w-0">
            {["All", "Present", "Absent", "On Leave"].map(tab => {
              const count = tab === "All" ? total : tab === "Present" ? presentCount : tab === "Absent" ? absentCount : leaveCount;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-smooth whitespace-nowrap touch-manipulation ${activeTab === tab ? "bg-background shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab} ({count})
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => exportCsv("team_attendance.csv", rows)}
          className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors shrink-0 touch-manipulation"
        >
          <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
        </button>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
          <button type="button" className="ml-2 underline font-medium touch-manipulation" onClick={() => void loadAttendance()}>
            Retry
          </button>
        </div>
      )}

      {/* Mobile/tablet: card list; Desktop: table */}
      <div className="lg:hidden space-y-3 min-w-0">
        {loading ? (
          <div className="rounded-2xl bg-card shadow-sm border-glow-shine p-6 text-center text-sm text-muted-foreground">
            Loading attendance…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-card shadow-sm border-glow-shine p-6 text-center text-sm text-muted-foreground">
            No records found.
          </div>
        ) : (
          rows.map((r) => {
            const role = r.role || "employee";
            const isPresent = r.status === "Present" || r.status === "Late";
            const statusClass =
              r.status === "Late"
                ? "bg-warning/15 text-warning"
                : isPresent
                  ? "bg-success/15 text-success"
                  : r.status === "On Leave"
                    ? "bg-warning/15 text-warning"
                    : "bg-destructive/15 text-destructive";
            return (
              <div key={r.id} className="rounded-2xl bg-card shadow-sm border-glow-shine p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground font-mono break-all">{r.empId} · {r.department}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{role}</p>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${statusClass}`}>
                    {isPresent ? <UserCheck className="h-3 w-3" /> : r.status === "On Leave" ? <Plane className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                    {r.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Check In</p>
                    <p className="font-medium text-sm">{formatApiDate(r.checkIn, "h:mm a")}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground">Check Out</p>
                    <p className="font-medium text-sm">{formatApiDate(r.checkOut, "h:mm a")}</p>
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
                    {Number(r.overtimeHours || 0) > 0 && (
                      <p className="text-[11px] font-semibold text-warning mt-0.5">
                        OT {Number(r.overtimeHours).toFixed(2)}h
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full touch-manipulation"
                    onClick={() => void openHistory(r)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View history
                  </Button>
                  {canForceCheckout &&
                  r.checkIn &&
                  !r.checkOut &&
                  r.status !== "Absent" &&
                  r.status !== "On Leave" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 touch-manipulation"
                      onClick={() => void handleForceCheckout(r)}
                    >
                      Force Out
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden lg:block w-full touch-scroll-x text-sm rounded-2xl bg-card shadow-sm pb-2 border-glow-shine">
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
              const statusClass =
                r.status === "Late"
                  ? "bg-warning/15 text-warning"
                  : r.status === "Present"
                    ? "bg-success/15 text-success"
                    : r.status === "On Leave"
                      ? "bg-warning/15 text-warning"
                      : "bg-destructive/15 text-destructive";
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
                  <td className="py-3 px-6"><span className="text-muted-foreground text-xs font-mono">{r.empId}</span></td>
                  <td className="py-3 px-6">
                    <p className="font-medium text-sm capitalize">{role}</p>
                    <p className="text-xs text-muted-foreground">{r.department}</p>
                  </td>
                  <td className="py-3 px-6">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${statusClass}`}>
                      {r.status === "Present" || r.status === "Late" ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {r.status}
                    </div>
                  </td>
                  <td className="py-3 px-6 font-medium text-sm">{formatApiDate(r.checkIn, "h:mm a")}</td>
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
                    <span className="text-sm font-medium">{formatApiDate(r.checkOut, "h:mm a")}</span>
                  </td>
                  <td className="py-3 px-6 text-sm font-medium">
                    {r.hours > 0 ? `${Math.floor(r.hours)}h ${Math.round((r.hours * 60) % 60)}m` : "—"}
                    {Number(r.overtimeHours || 0) > 0 && (
                      <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold bg-warning/15 text-warning">
                        OT {Number(r.overtimeHours).toFixed(2)}h
                      </span>
                    )}
                  </td>
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
    <div className="w-full min-w-0 rounded-2xl border border-border/40 overflow-hidden">
      <div className="max-h-[52vh] overflow-y-auto touch-scroll-x">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/40 bg-muted/20 sticky top-0 z-10">
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Check In</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Check Out</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Break</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
            <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Overtime</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground">
                Loading...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground">
                No records found for this range.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-smooth">
                <td className="py-3 px-4 font-medium">{formatApiDate(r.date, "dd MMM yyyy")}</td>
                <td className="py-3 px-4">
                  {r.status === "Late" ? (
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-warning/15 text-warning">Late</span>
                  ) : r.status === "Present" ? (
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-success/15 text-success">Present</span>
                  ) : r.status === "Absent" ? (
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-destructive/10 text-destructive">Absent</span>
                  ) : (
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 px-4 tabular-nums">{formatApiDate(r.checkIn, "h:mm a")}</td>
                <td className="py-3 px-4 tabular-nums">{formatApiDate(r.checkOut, "h:mm a")}</td>
                <td className="py-3 px-4 tabular-nums">
                  {typeof r.breakMinutes === "number"
                    ? `${Math.floor(r.breakMinutes / 60)}h ${r.breakMinutes % 60}m`
                    : "—"}
                </td>
                <td className="py-3 px-4 tabular-nums font-semibold">{r.hours > 0 ? Number(r.hours).toFixed(2) : "—"}</td>
                <td className="py-3 px-4 tabular-nums font-semibold text-warning">{Number(r.overtimeHours || 0) > 0 ? Number(r.overtimeHours).toFixed(2) : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
