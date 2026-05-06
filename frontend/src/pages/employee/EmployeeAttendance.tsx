import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { StatusPill } from "@/components/StatusPill";
import { Download } from "lucide-react";
import { eachDayOfInterval, format, isWeekend } from "date-fns";
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
    const map: Record<string, "Present"> = {};
    for (const l of logs) {
      if (l.check_in) map[l.date] = "Present";
    }
    return map;
  }, [logs]);

  const presentDays = Object.entries(statusMap).filter(([, v]) => v === "Present").map(([k]) => new Date(k));

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
    const presentKeys = new Set(presentDays.map((d) => format(d, "yyyy-MM-dd")));
    const leaveKeys = new Set(leaveDays.map((d) => format(d, "yyyy-MM-dd")));
    const start = new Date(today.getFullYear(), 0, 1);
    const range = eachDayOfInterval({ start, end: today });
    return range.filter((d) => {
      if (isWeekend(d)) return false;
      const key = format(d, "yyyy-MM-dd");
      return !presentKeys.has(key) && !leaveKeys.has(key);
    });
  }, [presentDays, leaveDays]);

  const key = selected ? format(selected, "yyyy-MM-dd") : "";
  const selectedStatus = statusMap[key];
  const selectedLog = logs.find((l) => l.date === key);

  const handleExport = () => {
    const rows = logs.map((l) => ({
      date: l.date,
      checkIn: l.check_in ?? "—",
      checkOut: l.check_out ?? "—",
      totalHours: l.total_hours,
      status: l.status,
    }));
    exportCsv("my-attendance.csv", rows);
    toast.success("CSV downloaded");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Attendance</h1>
          <p className="text-muted-foreground mt-1">Calendar view of your working days.</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto"><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
      </div>

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
              modifiers={{ present: presentDays, absent: absentDays, leave: leaveDays }}
              modifiersClassNames={{
                present: "bg-success/15 text-success font-semibold hover:bg-success/25",
                absent: "bg-destructive/15 text-destructive font-semibold hover:bg-destructive/25",
                leave: "bg-warning/15 text-warning font-semibold hover:bg-warning/25",
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Legend</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded bg-success" /> Present</div>
              <div className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded bg-destructive" /> Absent</div>
              <div className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded bg-warning" /> Leave</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Selected day</CardTitle></CardHeader>
            <CardContent>
              {selected ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{format(selected, "EEEE, MMMM d")}</p>
                  {selectedStatus ? (
                    <>
                      <StatusPill
                        label={selectedStatus}
                        variant={selectedStatus === "Present" ? "success" : selectedStatus === "Absent" ? "destructive" : "warning"}
                      />
                      {selectedStatus === "Present" && (
                        <div className="text-sm space-y-1 pt-2 border-t">
                          <p><span className="text-muted-foreground">Check-in: </span>{selectedLog?.check_in ? format(new Date(selectedLog.check_in), "h:mm a") : "—"}</p>
                          <p><span className="text-muted-foreground">Check-out: </span>{selectedLog?.check_out ? format(new Date(selectedLog.check_out), "h:mm a") : "—"}</p>
                          <p><span className="text-muted-foreground">Hours: </span>{selectedLog?.total_hours ?? 0}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Weekend or no data.</p>
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
        <CardHeader className="pb-2"><CardTitle className="text-base">Today</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(() => {
            const todayKey = format(today, "yyyy-MM-dd");
            const todayLog = logs.find((l) => l.date === todayKey);
            return (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Check In</span>
                  <span className="font-medium">{todayLog?.check_in ? format(new Date(todayLog.check_in), "hh:mm a") : "--:--"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Check Out</span>
                  <span className="font-medium">{todayLog?.check_out ? format(new Date(todayLog.check_out), "hh:mm a") : "--:--"}</span>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
