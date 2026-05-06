import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { leaveApproveRequest, leavePendingRequest, leaveRejectRequest } from "@/lib/api";

const tabs = ["pending", "approved", "rejected"] as const;

export default function LeaveManagement() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    if (!accessToken) return;
    const res = await leavePendingRequest(accessToken);
    if (res.ok) setItems(await res.json());
  };

  useEffect(() => { void load(); }, [accessToken]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { pending: [], approved: [], rejected: [] };
    for (const l of items) g[l.status]?.push(l);
    return g;
  }, [items]);

  const approve = async (id: any) => {
    if (!accessToken) return;
    const res = await leaveApproveRequest(accessToken, id);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || "Approve failed"); return; }
    toast.success("Leave approved");
    await load();
  };

  const reject = async (id: any) => {
    if (!accessToken) return;
    const res = await leaveRejectRequest(accessToken, id);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || "Reject failed"); return; }
    toast.success("Leave rejected");
    await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leave Management</h1>
        <p className="text-muted-foreground mt-1">Review and act on leave requests.</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap">
          {tabs.map((t) => {
            const count = grouped[t].length;
            return (
              <TabsTrigger key={t} value={t} className="gap-2 shrink-0">
                {t.toUpperCase()} <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabs.map((t) => {
          const list = grouped[t];
          return (
            <TabsContent key={t} value={t} className="mt-5">
              {list.length === 0 ? (
                <EmptyState title={`No ${t} leaves`} description="You're all caught up!" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((l) => (
                    <Card key={l.id} className="p-4 space-y-3 hover:shadow-md transition-smooth">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{l.employee_name}</p>
                          <p className="text-xs font-mono text-muted-foreground">#{l.id}</p>
                        </div>
                        <StatusPill label={String(l.leave_type).toUpperCase()} variant="info" />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <div><span className="text-muted-foreground">From </span>{l.start_date}</div>
                        <div><span className="text-muted-foreground">To </span>{l.end_date}</div>
                      </div>
                      <p className="text-sm bg-muted/40 rounded-lg p-3">{l.reason}</p>
                      {t === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                            onClick={() => void approve(l.id)}>
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => void reject(l.id)}>
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
