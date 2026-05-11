import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/StatusPill";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { leaveApplyRequest, leaveBalanceRequest, leaveHistoryRequest, type LeaveTypeApi } from "@/lib/api";

export default function EmployeeLeaves() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveTypeApi>("casual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [customLeaveType, setCustomLeaveType] = useState("");
  const [balance, setBalance] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const load = async () => {
    if (!accessToken) return;
    const [bRes, hRes] = await Promise.all([
      leaveBalanceRequest(accessToken),
      leaveHistoryRequest(accessToken),
    ]);
    if (bRes.ok) setBalance(await bRes.json());
    if (hRes.ok) setHistory(await hRes.json());
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  const balances = useMemo(() => {
    if (!balance) return [];
    return [
      { label: "Casual", used: balance.casual_used, total: balance.casual_total, remaining: balance.casual_remaining, accent: "bg-gradient-primary" },
      { label: "Sick", used: balance.sick_used, total: balance.sick_total, remaining: balance.sick_remaining, accent: "bg-gradient-warm" },
      { label: "Earned", used: balance.earned_used, total: balance.earned_total, remaining: balance.earned_remaining, accent: "bg-gradient-success" },
    ];
  }, [balance]);

  const handleApply = async () => {
    if (!accessToken) { toast.error("Session expired. Please login again."); return; }
    if (!from || !to || !reason.trim()) { toast.error("Please fill all fields"); return; }
    if (type === "other" && !customLeaveType.trim()) { toast.error("Please enter custom leave type."); return; }
    if (half && from !== to) { toast.error("For half-day, From and To date must be same."); return; }
    const normalizedReason = reason.trim();
    const finalReason =
      type === "other" && customLeaveType.trim()
        ? `[Other leave type: ${customLeaveType.trim()}] ${normalizedReason}`
        : normalizedReason;
    const res = await leaveApplyRequest(accessToken, {
      leave_type: type,
      start_date: from,
      end_date: to,
      reason: finalReason,
      is_half_day: half,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      toast.error(body.error || "Leave apply failed");
      return;
    }
    toast.success(body.message || "Leave request submitted");
    setOpen(false);
    setFrom(""); setTo(""); setReason(""); setCustomLeaveType(""); setHalf(false);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Leaves</h1>
          <p className="text-muted-foreground mt-1">Balances and requests.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-md"><Plus className="h-4 w-4 mr-2" /> Apply leave</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[460px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Apply for leave</DialogTitle>
              <DialogDescription>
                Submit a leave request with dates and reason for approval.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1.5">
                <Label>Leave type</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="earned">Earned</SelectItem>
                    <SelectItem value="exam">Exam</SelectItem>
                    <SelectItem value="college">College</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === "other" && (
                <div className="space-y-1.5">
                  <Label>Other leave type</Label>
                  <Input
                    value={customLeaveType}
                    onChange={(e) => setCustomLeaveType(e.target.value)}
                    placeholder="Enter your leave type"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div><p className="text-sm font-medium">Half day</p><p className="text-xs text-muted-foreground">Counts as 0.5 days</p></div>
                <Switch checked={half} onCheckedChange={setHalf} />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly describe..." className="min-h-[80px]" />
              </div>
            </div>
            <DialogFooter>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleApply} className="bg-gradient-primary w-full sm:w-auto">Submit request</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {balances.map((b: any) => (
          <Card key={b.label} className="p-4 hover:shadow-md transition-smooth">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">{b.label}</p>
              <div className={`h-8 w-8 rounded-lg ${b.accent} shadow-sm`} />
            </div>
            <p className="text-3xl font-bold tracking-tight">{b.remaining}<span className="text-base text-muted-foreground font-normal">/{b.total}</span></p>
            <p className="text-xs text-muted-foreground mb-2">days remaining</p>
            <Progress value={b.total > 0 ? (b.remaining / b.total) * 100 : 0} className="h-1.5" />
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">You have no leave history yet.</p>
          ) : history.map((l: any) => (
            <div key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-sm">{String(l.leave_type).toUpperCase()} leave</p>
                <p className="text-xs text-muted-foreground">{l.start_date} → {l.end_date}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{l.reason}</p>
              </div>
              <StatusPill
                label={String(l.status).toUpperCase()}
                variant={l.status === "approved" ? "success" : l.status === "rejected" ? "destructive" : "warning"}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
