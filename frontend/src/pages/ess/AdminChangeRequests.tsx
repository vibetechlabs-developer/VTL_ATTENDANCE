// src/pages/ess/AdminChangeRequests.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Check, X, User, CheckCircle2, XCircle, Clock } from "lucide-react";
import { fetchProfileChangeRequests, approveProfileChangeRequest, rejectProfileChangeRequest } from "@/api/ess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const tabs = ["pending", "approved", "rejected", "all"] as const;

export default function AdminChangeRequests() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("pending");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-profile-changes"],
    queryFn: () => fetchProfileChangeRequests({ scope: "all" }).then((res) => res.data),
  });

  const requests = useMemo(() => (Array.isArray(data) ? data : data?.results || []), [data]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { pending: [], approved: [], rejected: [], all: requests };
    for (const r of requests) {
      if (g[r.status]) g[r.status].push(r);
    }
    return g;
  }, [requests]);

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveProfileChangeRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profile-changes"] });
      queryClient.invalidateQueries({ queryKey: ["ess-dashboard"] });
      toast.success("Profile change request approved and applied");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to approve request");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectProfileChangeRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profile-changes"] });
      queryClient.invalidateQueries({ queryKey: ["ess-dashboard"] });
      toast.success("Profile change request rejected");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to reject request");
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Profile Change Requests Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Review employee sensitive profile edit requests and track request history.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap">
          {tabs.map((t) => {
            const count = grouped[t]?.length || 0;
            return (
              <TabsTrigger key={t} value={t} className="gap-2 shrink-0 capitalize">
                {t} <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabs.map((t) => {
          const list = grouped[t] || [];
          return (
            <TabsContent key={t} value={t}>
              <Card className="border border-border/40 shadow-sm">
                <CardContent className="p-0">
                  {isLoading ? (
                    <div className="p-8 text-center text-muted-foreground">Loading requests...</div>
                  ) : error ? (
                    <div className="p-8 text-center text-red-500">Failed to load request queue.</div>
                  ) : list.length === 0 ? (
                    <div className="py-12">
                      <EmptyState title={`No ${t} requests`} message={`There are no ${t} profile change requests to display.`} />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Field</TableHead>
                          <TableHead>Old Value</TableHead>
                          <TableHead>Requested Value</TableHead>
                          <TableHead>Submitted On</TableHead>
                          <TableHead>Reviewed By / Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((req: any) => (
                          <TableRow key={req.id} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="font-semibold text-foreground">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{req.employee_name || req.employee?.name || `Employee #${req.employee}`}</span>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{req.field_name?.replace(/_/g, " ")}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{req.old_value || "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-foreground font-semibold">{req.requested_value}</TableCell>
                            <TableCell className="text-sm">{req.requested_on ? req.requested_on.slice(0, 10) : "N/A"}</TableCell>
                            <TableCell className="text-sm font-medium text-foreground">
                              {req.reviewed_by_name ? (
                                <div>
                                  <p>{req.reviewed_by_name}</p>
                                  <p className="text-[11px] text-muted-foreground">{req.reviewed_on ? req.reviewed_on.slice(0, 10) : ""}</p>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  req.status === "approved"
                                    ? "default"
                                    : req.status === "rejected"
                                    ? "destructive"
                                    : "outline"
                                }
                                className="gap-1 capitalize"
                              >
                                {req.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                                {req.status === "rejected" && <XCircle className="h-3 w-3" />}
                                {req.status === "pending" && <Clock className="h-3 w-3" />}
                                {req.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {req.status === "pending" ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 gap-1"
                                    onClick={() => approveMutation.mutate(req.id)}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1"
                                    onClick={() => rejectMutation.mutate(req.id)}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground font-mono">Processed</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
