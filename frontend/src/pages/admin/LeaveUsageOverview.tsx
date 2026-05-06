import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import { useAuthStore } from "@/store/authStore";
import { leaveSummaryRequest } from "@/lib/api";

export default function LeaveUsageOverview() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [items, setItems] = useState<any[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const res = await leaveSummaryRequest(accessToken);
      if (!res.ok) return;
      setItems(await res.json());
    };
    void run();
  }, [accessToken]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => String(row.employee_name || "").toLowerCase().includes(q));
  }, [items, query]);

  const totals = useMemo(() => {
    return {
      employees: filtered.length,
      approvedDays: filtered.reduce((acc, row) => acc + Number(row.approved_days || 0), 0),
      pendingRequests: filtered.reduce((acc, row) => acc + Number(row.pending_requests || 0), 0),
      totalUsed: filtered.reduce((acc, row) => acc + Number(row.total_used || 0), 0),
      totalRemaining: filtered.reduce((acc, row) => acc + Number(row.total_remaining || 0), 0),
    };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leave Usage</h1>
          <p className="text-muted-foreground mt-1">All employees with approved and pending leave stats.</p>
        </div>
        <div className="w-full sm:w-[280px]">
          <Input
            placeholder="Search employee..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Employees listed</p>
          <p className="text-2xl font-bold mt-1">{totals.employees}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total used</p>
          <p className="text-2xl font-bold mt-1">{totals.totalUsed}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total remaining</p>
          <p className="text-2xl font-bold mt-1">{totals.totalRemaining}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Approved days</p>
          <p className="text-2xl font-bold mt-1">{totals.approvedDays}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Pending requests</p>
          <p className="text-2xl font-bold mt-1">{totals.pendingRequests}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div className="col-span-3">Employee</div>
          <div className="col-span-2 text-center">Overall Used/Total</div>
          <div className="col-span-1 text-center">Approved Days</div>
          <div className="col-span-2 text-center">Pending</div>
          <div className="col-span-1 text-center">Casual (U/T)</div>
          <div className="col-span-1 text-center">Sick (U/T)</div>
          <div className="col-span-1 text-center">Earned (U/T)</div>
          <div className="col-span-2 text-center">Requests</div>
        </div>

        <div className="max-h-[520px] overflow-y-auto divide-y divide-border/60">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-8 text-center">No employees found.</p>
          ) : (
            filtered.map((row, idx) => (
              <div key={row.employee_id} className="px-4 py-3 hover:bg-muted/20 transition-smooth">
                <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 min-w-0">
                    <p className="font-semibold truncate">{row.employee_name}</p>
                    <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                  </div>
                  <div className="col-span-2 text-center text-sm">
                    <span className="font-semibold">{row.total_used || 0}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="font-semibold">{row.total_entitled || 0}</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <StatusPill label={`${row.approved_days || 0}`} variant="info" />
                  </div>
                  <div className="col-span-2 text-center">
                    <StatusPill label={`${row.pending_requests || 0} req`} variant="warning" />
                  </div>
                  <div className="col-span-1 text-center text-sm font-medium">
                    {row.casual_used || 0}/{row.casual_total || 0}
                  </div>
                  <div className="col-span-1 text-center text-sm font-medium">
                    {row.sick_used || 0}/{row.sick_total || 0}
                  </div>
                  <div className="col-span-1 text-center text-sm font-medium">
                    {row.earned_used || 0}/{row.earned_total || 0}
                  </div>
                  <div className="col-span-2 text-center text-sm text-muted-foreground">
                    {row.total_requests || 0} total
                  </div>
                </div>

                <div className="md:hidden space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{row.employee_name}</p>
                      <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                    </div>
                    <StatusPill label={`${row.approved_days || 0} days`} variant="info" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-muted-foreground">Used / Total</p>
                      <p className="font-semibold text-sm">{row.total_used || 0} / {row.total_entitled || 0}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-muted-foreground">Pending</p>
                      <p className="font-semibold text-sm">{row.pending_requests || 0} req</p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-muted-foreground">Casual</p>
                      <p className="font-semibold text-sm">{row.casual_used || 0}/{row.casual_total || 0}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-muted-foreground">Sick</p>
                      <p className="font-semibold text-sm">{row.sick_used || 0}/{row.sick_total || 0}</p>
                    </div>
                    <div className="col-span-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <p className="text-muted-foreground">Earned / Requests</p>
                      <p className="font-semibold text-sm">{row.earned_used || 0}/{row.earned_total || 0} • {row.total_requests || 0} total</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
