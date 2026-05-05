import { useEffect, useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { exportCsv } from "@/utils/csv";
import { useAuthStore } from "@/store/authStore";
import { auditLogsRequest } from "@/lib/api";

export default function AuditLogs() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [audit, setAudit] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filters = ["All", "Auth", "Leave", "Attendance", "Settings", "Security"];

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const res = await auditLogsRequest(accessToken, {
        q: q.trim() || undefined,
        type: activeFilter.toLowerCase(),
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      if (!res.ok) return;
      setAudit(await res.json());
    };
    void run();
  }, [accessToken, q, activeFilter, fromDate, toDate]);

  const rows = useMemo(() => audit, [audit]);

  return (
    <div className="space-y-8 w-full max-w-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Audit Logs</h1>
        </div>
        <button onClick={() => exportCsv("audit_logs.csv", rows)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium rounded-lg transition-colors shadow-sm">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="bg-card border border-border/40 rounded-2xl p-4 sm:p-6 shadow-sm space-y-6">

        {/* Search and Dates */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <Input
              placeholder="Search by user or action..."
              className="pl-9 h-11 bg-transparent border-border/50 rounded-xl focus-visible:ring-1 focus-visible:ring-primary shadow-none"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-40">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 h-11 border border-border/50 rounded-xl bg-transparent text-sm text-muted-foreground"
              />
            </div>
            <div className="relative w-full sm:w-40">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 h-11 border border-border/50 rounded-xl bg-transparent text-sm text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-smooth ${activeFilter === f ? "bg-blue-600 border-blue-600 text-white" : "bg-transparent border-border/60 text-muted-foreground hover:border-border hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto text-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-4 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                <th className="text-left py-4 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">User</th>
                <th className="text-left py-4 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Action</th>
                <th className="text-left py-4 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Resource</th>
                <th className="text-left py-4 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">IP Address</th>
                <th className="text-left py-4 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const colors = ["bg-blue-600", "bg-emerald-600", "bg-rose-600", "bg-amber-500", "bg-indigo-600"];
                const avatarColor = colors[i % colors.length];
                return (
                  <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="py-4 px-2 text-muted-foreground font-medium text-[13px] whitespace-nowrap">
                      {format(new Date(r.timestamp), "MMM dd, hh:mm a")}
                    </td>
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full ${avatarColor} text-white flex items-center justify-center font-bold text-xs shadow-sm`}>
                          {r.user.charAt(0).toLowerCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-[13px] leading-tight">{r.user}</p>
                          <p className="text-[11px] text-muted-foreground font-medium tracking-wide mt-0.5">
                            {r.userId} · {r.role}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2 font-semibold text-foreground/90 text-[13px]">{r.action}</td>
                    <td className="py-4 px-2 text-muted-foreground font-medium text-[13px]">{r.resource}</td>
                    <td className="py-4 px-2 text-muted-foreground text-[13px] font-mono tabular-nums">{r.ip}</td>
                    <td className="py-4 px-2">
                      <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${String(r.status).toLowerCase() === "success" ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                        <span className="lowercase">{r.status}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
