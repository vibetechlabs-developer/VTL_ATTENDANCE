// src/pages/exit/ResignationPage.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, AlertTriangle, CheckCircle2, Clock, XCircle, Info } from "lucide-react";
import { fetchResignations, submitResignation, withdrawResignation } from "@/api/exitManagement";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "Submitted - Pending Acknowledgement", icon: <Clock className="h-4 w-4" />, variant: "outline" },
  acknowledged: { label: "Acknowledged by Manager / HR", icon: <CheckCircle2 className="h-4 w-4" />, variant: "default" },
  completed: { label: "Exit Completed", icon: <CheckCircle2 className="h-4 w-4" />, variant: "default" },
  withdrawn: { label: "Withdrawn", icon: <XCircle className="h-4 w-4" />, variant: "secondary" },
};

export default function ResignationPage() {
  const queryClient = useQueryClient();
  const [noticeDays, setNoticeDays] = useState(30);
  const [reason, setReason] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-resignation"],
    queryFn: () => fetchResignations({ scope: "mine" }).then((res) => res.data),
  });

  const resignations = Array.isArray(data) ? data : data?.results || [];
  const activeResignation = resignations.find((r: any) =>
    r.status !== "withdrawn"
  ) || null;

  const submitMutation = useMutation({
    mutationFn: submitResignation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-resignation"] });
      toast.success("Resignation submitted successfully");
      setReason("");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to submit resignation");
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawResignation(activeResignation?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-resignation"] });
      toast.success("Resignation withdrawn successfully");
      setWithdrawOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to withdraw resignation");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate({ reason, notice_period_days: noticeDays });
  };

  // Calculate proposed last working day
  const today = new Date();
  const proposedLastDay = new Date(today);
  proposedLastDay.setDate(today.getDate() + noticeDays);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading resignation status...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Failed to load resignation data.</div>;

  const statusConfig = activeResignation ? STATUS_CONFIG[activeResignation.status] : null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <LogOut className="h-6 w-6 text-primary" />
          My Resignation
        </h1>
        <p className="text-sm text-muted-foreground">
          Submit or manage your resignation and view last working day calculation.
        </p>
      </div>

      {activeResignation ? (
        /* Active Resignation Status View */
        <div className="space-y-4">
          <Card className="border border-border/40 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Resignation Status</CardTitle>
              {statusConfig && (
                <Badge variant={statusConfig.variant} className="gap-1.5 capitalize">
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 rounded-lg p-4">
                <div>
                  <span className="text-xs text-muted-foreground block">Submitted On</span>
                  <strong className="text-foreground">{activeResignation.submitted_on?.slice(0, 10)}</strong>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Notice Period</span>
                  <strong className="text-foreground">{activeResignation.notice_period_days} days</strong>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Proposed Last Day</span>
                  <strong className="text-foreground">{activeResignation.proposed_last_working_day}</strong>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Approved Last Day</span>
                  <strong className="text-foreground">
                    {activeResignation.approved_last_working_day || "Pending acknowledgement"}
                  </strong>
                </div>
              </div>

              {activeResignation.reason && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs text-muted-foreground block mb-1">Reason on Record</span>
                  <p className="text-foreground text-sm italic">{activeResignation.reason}</p>
                </div>
              )}

              {activeResignation.status === "submitted" && (
                <div className="pt-2">
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Your resignation is pending acknowledgement from your manager or HR. You may withdraw it at any time before acknowledgement.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {activeResignation.status === "submitted" && (
            <Button
              variant="outline"
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setWithdrawOpen(true)}
            >
              <XCircle className="h-4 w-4" />
              Withdraw Resignation
            </Button>
          )}
        </div>
      ) : (
        /* Resignation Submission Form */
        <Card className="border border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Submit Resignation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="notice-days">Notice Period (Days)</Label>
                <Input
                  id="notice-days"
                  type="number"
                  min={1}
                  required
                  value={noticeDays}
                  onChange={(e) => setNoticeDays(Number(e.target.value))}
                />
              </div>

              {/* Notice Period Summary */}
              <div className="flex items-start gap-2 p-4 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-foreground block mb-0.5">Calculated Last Working Day</span>
                  <span className="text-muted-foreground">
                    {noticeDays} days from today ({today.toLocaleDateString()}) = <strong className="text-foreground">{proposedLastDay.toLocaleDateString()}</strong>
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="res-reason">Reason for Resignation</Label>
                <Textarea
                  id="res-reason"
                  required
                  rows={4}
                  placeholder="Describe your reason for leaving (personal growth, relocation, compensation, etc.)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Submitting a resignation will trigger an automated clearance process. You may withdraw it as long as the status remains <strong>"submitted"</strong>.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="submit" variant="destructive" disabled={submitMutation.isPending || submitMutation.isLoading}>
                  {submitMutation.isPending || submitMutation.isLoading ? "Submitting..." : "Submit Resignation"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Withdraw Confirm Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Withdrawal</DialogTitle>
            <DialogDescription>
              Are you sure you want to withdraw your resignation? This will cancel the exit process and your employment will continue normally.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={withdrawMutation.isPending || withdrawMutation.isLoading}
              onClick={() => withdrawMutation.mutate()}
            >
              {withdrawMutation.isPending || withdrawMutation.isLoading ? "Withdrawing..." : "Yes, Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
