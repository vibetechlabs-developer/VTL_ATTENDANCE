// src/pages/exit/ExitAdminPage.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, ClipboardList, CalendarCheck2, AlertCircle, CheckCircle2, Clock, FileText
} from "lucide-react";
import { fetchResignations } from "@/api/exitManagement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "Submitted", icon: <Clock className="h-3.5 w-3.5" />, variant: "outline" },
  acknowledged: { label: "Acknowledged", icon: <CheckCircle2 className="h-3.5 w-3.5" />, variant: "default" },
  completed: { label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5" />, variant: "secondary" },
  withdrawn: { label: "Withdrawn", icon: <AlertCircle className="h-3.5 w-3.5" />, variant: "destructive" },
};

export default function ExitAdminPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["all-resignations", statusFilter],
    queryFn: () =>
      fetchResignations({
        scope: "admin",
        status: statusFilter !== "all" ? statusFilter : undefined,
      }).then((res) => res.data),
  });

  const resignations = Array.isArray(data) ? data : data?.results || [];

  const filtered = resignations.filter((r: any) => {
    const searchLower = search.toLowerCase();
    const empName = (r.employee_name || r.employee_code || String(r.employee) || "").toLowerCase();
    return empName.includes(searchLower);
  });

  // Stats
  const stats = {
    total: resignations.length,
    submitted: resignations.filter((r: any) => r.status === "submitted").length,
    acknowledged: resignations.filter((r: any) => r.status === "acknowledged").length,
    completed: resignations.filter((r: any) => r.status === "completed").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Exit Management — Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage all employee resignations, clearance checklists, and exit interviews.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Resignations", value: stats.total, icon: <FileText className="h-5 w-5 text-primary" /> },
          { label: "Pending Acknowledgement", value: stats.submitted, icon: <Clock className="h-5 w-5 text-amber-500" /> },
          { label: "In Progress", value: stats.acknowledged, icon: <ClipboardList className="h-5 w-5 text-blue-500" /> },
          { label: "Completed Exits", value: stats.completed, icon: <CalendarCheck2 className="h-5 w-5 text-emerald-500" /> },
        ].map((stat) => (
          <Card key={stat.label} className="border border-border/40 shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="shrink-0">{stat.icon}</div>
              <div>
                <div className="text-xl font-bold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search by employee name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-0 border-b border-border/40">
          <CardTitle className="text-sm font-semibold">Resignations ({filtered.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load data.</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No resignations found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Employee", "Submitted On", "Notice Period", "Proposed Last Day", "Status", "Actions"].map((col) => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((r: any) => {
                  const sc = STATUS_CONFIG[r.status] || { label: r.status, icon: null, variant: "outline" as const };
                  return (
                    <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground">
                        {r.employee_name || r.employee_code || `Employee #${r.employee}`}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {r.submitted_on?.slice(0, 10)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{r.notice_period_days}d</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {r.proposed_last_working_day}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={sc.variant} className="gap-1">
                          {sc.icon}
                          {sc.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            onClick={() => navigate(`/exit/clearance/${r.id}`)}
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            Clearance
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            onClick={() => navigate(`/exit/interview/${r.id}`)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Interview
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
