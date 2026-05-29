import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";
import { useAuthStore } from "@/store/authStore";
import { attendanceAdminOverviewRequest } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const weeklyData = [
  { week: "W1", score: 72 },
  { week: "W2", score: 78 },
  { week: "W3", score: 74 },
  { week: "W4", score: 85 },
  { week: "W5", score: 88 },
  { week: "W6", score: 82 },
  { week: "W7", score: 91 },
];

const tooltipStyle = {
  background: "hsl(var(--popover) / 0.9)",
  border: "1px solid hsl(var(--border) / 0.3)",
  borderRadius: "12px",
  fontSize: "12px",
  boxShadow: "0 12px 32px -8px rgba(13,31,26,0.2)",
  backdropFilter: "blur(16px)",
  padding: "10px 14px",
};

type OverviewDay = {
  day: string;
  date: string;
  present: number;
  absent: number;
};

type OverviewTooltipProps = {
  active?: boolean;
  payload?: { value: number; dataKey: string; payload: OverviewDay }[];
};

function OverviewTooltip({ active, payload }: OverviewTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  let dateLabel = row.date;
  try {
    dateLabel = format(parseISO(row.date), "EEE, d MMM yyyy");
  } catch {
    /* keep raw */
  }
  const present = row.present ?? 0;
  const absent = row.absent ?? 0;
  return (
    <div style={tooltipStyle}>
      <p className="font-semibold mb-1.5">{dateLabel}</p>
      <p className="text-emerald-600 dark:text-emerald-400">Present: {present}</p>
      <p className="text-destructive">Absent: {absent}</p>
    </div>
  );
}

export function AttendanceChart({ days = 7 }: { days?: number }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<OverviewDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await attendanceAdminOverviewRequest(accessToken, days);
      const body = (await res.json().catch(() => ({}))) as {
        days?: OverviewDay[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not load attendance overview");
        setData([]);
        return;
      }
      setData(Array.isArray(body.days) ? body.days : []);
    } catch {
      setError("Network error loading chart");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [accessToken, load]);

  const yMax = Math.max(
    5,
    ...data.flatMap((d) => [d.present, d.absent]),
  );

  if (loading) {
    return (
      <div className="h-[280px] w-full flex flex-col justify-end gap-2 px-2">
        <Skeleton className="h-[220px] w-full rounded-xl" />
        <div className="flex justify-between">
          {Array.from({ length: days }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[280px] w-full flex flex-col items-center justify-center text-center px-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          className="mt-2 text-xs font-medium text-primary underline"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[280px] w-full flex items-center justify-center text-sm text-muted-foreground">
        No attendance data for the last {days} days.
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="present" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity={0.35} />
              <stop offset="50%" stopColor="#25d499" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#1D9E75" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="absent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="presentStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0F6E56" />
              <stop offset="50%" stopColor="#1D9E75" />
              <stop offset="100%" stopColor="#25d499" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
          <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, yMax]}
          />
          <Tooltip content={<OverviewTooltip />} />
          <Area
            type="monotone"
            dataKey="present"
            name="Present"
            stroke="url(#presentStroke)"
            strokeWidth={2.5}
            fill="url(#present)"
            animationDuration={800}
          />
          <Area
            type="monotone"
            dataKey="absent"
            name="Absent"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            fill="url(#absent)"
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceChart() {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeklyData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#25d499" />
              <stop offset="50%" stopColor="#1D9E75" />
              <stop offset="100%" stopColor="#0F6E56" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
          <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.2)" }} />
          <Bar dataKey="score" fill="url(#barGrad)" radius={[10, 10, 0, 0]} animationDuration={1500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
