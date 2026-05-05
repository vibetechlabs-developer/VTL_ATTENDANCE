import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Inbox, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { leaveHistoryRequest } from "@/lib/api";

const tabs: { key: string; label: string; icon: any; msg: string }[] = [
  { key: "all", label: "All Requests", icon: Inbox, msg: "No requests found." },
  { key: "pending", label: "Pending", icon: Clock, msg: "No pending approvals. Enjoy the calm ✨" },
  { key: "approved", label: "Approved", icon: CheckCircle2, msg: "Nothing approved yet — your future requests will show here." },
  { key: "rejected", label: "Rejected", icon: XCircle, msg: "No rejections. Keep it up!" },
  { key: "regularization", label: "Regularization", icon: RefreshCw, msg: "No regularization requests." },
];

export default function EmployeeApprovals() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    const run = async () => {
      const res = await leaveHistoryRequest(accessToken);
      if (!res.ok) return;
      const body = (await res.json().catch(() => [])) as any[];
      setHistory(body);
    };
    void run();
  }, [accessToken]);

  const grouped = useMemo(() => {
    const normalized = history.map((l) => ({
      ...l,
      status: String(l.status || "").toLowerCase(),
      leave_type: String(l.leave_type || "").toLowerCase(),
    }));
    return {
      all: normalized,
      pending: normalized.filter((l) => l.status === "pending"),
      approved: normalized.filter((l) => l.status === "approved"),
      rejected: normalized.filter((l) => l.status === "rejected"),
      regularization: normalized.filter((l) => l.leave_type === "regularization"),
    };
  }, [history]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground mt-1">Track the status of your leave requests.</p>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          {tabs.map((t) => {
            const count = grouped[t.key as keyof typeof grouped].length;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-2">
                {t.label} <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabs.map((t) => {
          const items = grouped[t.key as keyof typeof grouped];
          return (
            <TabsContent key={t.key} value={t.key} className="mt-5">
              {items.length === 0 ? (
                <EmptyState icon={t.icon} title={`No ${t.label.toLowerCase()} requests`} description={t.msg} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((l) => (
                    <Card key={l.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">{String(l.leave_type).toUpperCase()} leave</p>
                        <StatusPill
                          label={String(l.status).toUpperCase()}
                          variant={l.status === "approved" ? "success" : l.status === "rejected" ? "destructive" : "warning"}
                        />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <div><span className="text-muted-foreground">From </span>{l.start_date}</div>
                        <div><span className="text-muted-foreground">To </span>{l.end_date}</div>
                      </div>
                      <p className="text-sm text-muted-foreground">{l.reason}</p>
                      <p className="text-xs text-muted-foreground pt-1 border-t">Applied on {String(l.applied_at).slice(0, 10)}</p>
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
