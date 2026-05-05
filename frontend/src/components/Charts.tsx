import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";

const attendanceData = [
  { day: "Mon", present: 168, absent: 12 },
  { day: "Tue", present: 172, absent: 8 },
  { day: "Wed", present: 165, absent: 15 },
  { day: "Thu", present: 178, absent: 6 },
  { day: "Fri", present: 170, absent: 10 },
  { day: "Sat", present: 82, absent: 98 },
  { day: "Sun", present: 20, absent: 160 },
];

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

export function AttendanceChart() {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={attendanceData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
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
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="present" stroke="url(#presentStroke)" strokeWidth={2.5} fill="url(#present)" animationDuration={1500} />
          <Area type="monotone" dataKey="absent" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#absent)" animationDuration={1500} />
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
