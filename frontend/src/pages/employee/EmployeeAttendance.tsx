import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { StatusPill } from "@/components/StatusPill";
import { Download } from "lucide-react";
import { addDays, eachDayOfInterval, format, isWeekend, startOfWeek, subWeeks } from "date-fns";
import { formatApiDate, parseApiDate } from "@/utils/safeDate";
import { exportCsv } from "@/utils/csv";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { attendanceHistoryRequest, leaveHistoryRequest } from "@/lib/api";

const today = new Date();

type AttendanceLogApi = {
  id: number | string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: number;
  status: string;
};

function isLateCheckIn(iso: string | null): boolean {
  if (!iso) return false;
  const dt = parseApiDate(iso);
  if (!dt) return false;
  return dt.getHours() > 10 || (dt.getHours() === 10 && dt.getMinutes() > 15);
}

export default function EmployeeAttendance() {
  const [selected, setSelected] = useState<Date | undefined>(today);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [logs, setLogs] = useState<AttendanceLogApi[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<{ start: string; end: string }[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const [attRes, leaveRes] = await Promise.all([
        attendanceHistoryRequest(accessToken),
        leaveHistoryRequest(accessToken),
      ]);
      if (attRes.ok) {
        const body = (await attRes.json()) as AttendanceLogApi[];
        setLogs(body);
      }
      if (leaveRes.ok) {
        const body = (await leaveRes.json()) as any[];
        const approved = body
          .filter((l) => String(l.status).toLowerCase() === "approved")
          .map((l) => ({ start: l.start_date, end: l.end_date }));
        setApprovedLeaves(approved);
      }
    };
    void run();
  }, [accessToken]);

  const statusMap = useMemo(() => {
    const map: Record<string, "Present" | "Late"> = {};
    for (const l of logs) {
      if (!l.check_in) continue;
      map[l.date] = isLateCheckIn(l.check_in) ? "Late" : "Present";
    }
    return map;
  }, [logs]);

  const presentDays = Object.entries(statusMap)
    .filter(([, v]) => v === "Present")
    .map(([k]) => new Date(`${k}T12:00:00`));
  const lateDays = Object.entries(statusMap)
    .filter(([, v]) => v === "Late")
    .map(([k]) => new Date(`${k}T12:00:00`));

  const leaveDays = useMemo(() => {
    const dates: Date[] = [];
    for (const l of approvedLeaves) {
      const start = new Date(l.start);
      const end = new Date(l.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      const range = eachDayOfInterval({ start, end });
      for (const d of range) {
        if (!isWeekend(d)) dates.push(d);
      }
    }
    return dates;
  }, [approvedLeaves]);

  const absentDays = useMemo(() => {
    const attendedKeys = new Set(logs.filter((l) => l.check_in).map((l) => l.date));
    const leaveKeys = new Set(leaveDays.map((d) => format(d, "yyyy-MM-dd")));
    const start = new Date(today.getFullYear(), 0, 1);
    const range = eachDayOfInterval({ start, end: today });
    return range.filter((d) => {
      if (isWeekend(d)) return false;
      const key = format(d, "yyyy-MM-dd");
      return !attendedKeys.has(key) && !leaveKeys.has(key);
    });
  }, [logs, leaveDays]);

  const heatColumns = useMemo(() => {
    const map = new Map(logs.filter((l) => l.date).map((l) => [l.date, l]));
    const leaveSet = new Set(leaveDays.map((d) => format(d, "yyyy-MM-dd")));
    const cols: { days: { key: string; cls: string; title: string }[] }[] = [];
    for (let w = 11; w >= 0; w -= 1) {
      const monday = startOfWeek(subWeeks(today, w), { weekStartsOn: 1 });
      const days: { key: string; cls: string; title: string }[] = [];
      for (let i = 0; i < 7; i += 1) {
        const d = addDays(monday, i);
        const key = format(d, "yyyy-MM-dd");
        if (d > today) {
          days.push({ key, cls: "bg-muted/20", title: `${format(d, "MMM d")} · future` });
          continue;
        }
        const log = map.get(key);
        let cls = "bg-muted/45";
        let title = format(d, "EEE MMM d");
        if (isWeekend(d)) {
          cls = "bg-muted/25";
          title += " · weekend";
        } else if (leaveSet.has(key)) {
          cls = "bg-amber-400/85";
          title += " · leave";
        } else if (log?.check_in) {
          cls = isLateCheckIn(log.check_in) ? "bg-amber-500/90" : "bg-emerald-500/88";
          title += isLateCheckIn(log.check_in) ? " · late" : " · on time";
        } else {
          cls = "bg-rose-500/78";
          title += " · absent";
        }
        days.push({ key, cls, title });
      }
      cols.push({ days });
    }
    return cols;
  }, [logs, leaveDays]);

  const key = selected ? format(selected, "yyyy-MM-dd") : "";
  const selectedStatus = statusMap[key];
  const selectedLog = logs.find((l) => l.date === key);

  const handleExport = () => {
    const rows = logs.map((l) => ({
      date: l.date,
      checkIn: l.check_in ?? "—",
      checkOut: l.check_out ?? "—",
      totalHours: l.total_hours,
      status: l.check_in ? (isLateCheckIn(l.check_in) ? "Late" : "Present") : l.status,
    }));
    exportCsv("my-attendance.csv", rows);
    toast.success("CSV downloaded");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Attendance</h1>
          <p className="text-muted-foreground mt-1">Calendar, contribution heatmap, and exports.</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card className="soft-3d border-0">
        <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Contribution heatmap</CardTitle>
          <p className="text-xs text-muted-foreground">Last 12 weeks · Mon → Sun (rows)</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="flex gap-[3px] min-w-max pb-1">
            {heatColumns.map((col, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {col.days.map((c) => (
                  <div
                    key={c.key}
                    title={c.title}
                    className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm ${c.cls} ring-1 ring-black/5 dark:ring-white/10`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/88" /> On time
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/90" /> Late
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400/85" /> Leave
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/78" /> Absent
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{format(today, "MMMM yyyy")}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center overflow-x-auto">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (!d) return setSelected(undefined);
                const dKey = format(d, "yyyy-MM-dd");
                const tKey = format(today, "yyyy-MM-dd");
                if (dKey > tKey) return;
                setSelected(d);
              }}
              className="rounded-md"
              toMonth={today}
              disabled={(date) => format(date, "yyyy-MM-dd") > format(today, "yyyy-MM-dd")}
              modifiers={{ present: presentDays, late: lateDays, absent: absentDays, leave: leaveDays }}
              modifiersClassNames={{
                present: "bg-success/15 text-success font-semibold hover:bg-success/25",
                late: "bg-warning/25 text-warning font-semibold hover:bg-warning/35",
                absent: "bg-destructive/15 text-destructive font-semibold hover:bg-destructive/25",
                leave: "bg-warning/15 text-warning font-semibold hover:bg-warning/25",
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded bg-success" /> On time
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded bg-warning" /> Late
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded bg-destructive" /> Absent
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 rounded bg-warning/70" /> Leave
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Selected day</CardTitle>
            </CardHeader>
            <CardContent>
              {selected ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{format(selected, "EEEE, MMMM d")}</p>
                  {selectedStatus ? (
                    <>
                      <StatusPill
                        label={selectedStatus}
                        variant={selectedStatus === "Present" ? "success" : selectedStatus === "Late" ? "warning" : "destructive"}
                      />
                      {(selectedStatus === "Present" || selectedStatus === "Late") && (
                        <div className="text-sm space-y-1 pt-2 border-t">
                          <p>
                            <span className="text-muted-foreground">Check-in: </span>
                            {selectedLog?.check_in ? formatApiDate(selectedLog.check_in, "h:mm a") : "—"}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Check-out: </span>
                            {selectedLog?.check_out ? formatApiDate(selectedLog.check_out, "h:mm a") : "—"}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Hours: </span>
                            {selectedLog?.total_hours ?? 0}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Weekend or no attendance logged.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Pick a day to see details.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(() => {
            const todayKey = format(today, "yyyy-MM-dd");
            const todayLog = logs.find((l) => l.date === todayKey);
            return (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Check In</span>
                  <span className="font-medium tabular-nums">
                    {todayLog?.check_in ? formatApiDate(todayLog.check_in, "hh:mm a") : "--:--"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Check Out</span>
                  <span className="font-medium tabular-nums">
                    {todayLog?.check_out ? formatApiDate(todayLog.check_out, "hh:mm a") : "--:--"}
                  </span>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
