// src/pages/exit/ExitInterviewPage.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquareMore, Star } from "lucide-react";
import { fetchResignationDetail, createExitInterview, fetchExitInterviews } from "@/api/exitManagement";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const LEAVE_REASONS = [
  "Better compensation elsewhere",
  "Career growth opportunities",
  "Relocation / Personal reasons",
  "Work-life balance",
  "Management issues",
  "Company culture",
  "Higher education",
  "Other",
];

export default function ExitInterviewPage() {
  const { resignationId } = useParams<{ resignationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    primary_reason: "",
    satisfaction_score: 3,
    comments: "",
    would_rejoin: "maybe",
  });

  const { data: resignation, isLoading: loadRes } = useQuery({
    queryKey: ["resignation", resignationId],
    queryFn: () => fetchResignationDetail(resignationId!).then((res) => res.data),
    enabled: !!resignationId,
  });

  const { data: existingInterviews } = useQuery({
    queryKey: ["exit-interviews", resignationId],
    queryFn: () => fetchExitInterviews({ resignation: resignationId }).then((res) => res.data),
    enabled: !!resignationId,
  });

  const interviews = Array.isArray(existingInterviews)
    ? existingInterviews
    : existingInterviews?.results || [];

  const existingInterview = interviews.find((i: any) =>
    String(i.resignation) === String(resignationId) ||
    String(i.resignation_id) === String(resignationId)
  );

  const mutation = useMutation({
    mutationFn: createExitInterview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exit-interviews", resignationId] });
      toast.success("Exit interview submitted successfully");
      navigate("/exit/admin");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to submit exit interview");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      resignation: Number(resignationId),
      primary_reason: form.primary_reason,
      satisfaction_score: form.satisfaction_score,
      comments: form.comments,
      would_rejoin: form.would_rejoin,
    });
  };

  if (loadRes) return <div className="p-8 text-center text-muted-foreground">Loading resignation details...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/exit/admin")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquareMore className="h-6 w-6 text-primary" />
            Exit Interview
          </h1>
          <p className="text-sm text-muted-foreground">
            {resignation
              ? `Employee: ${resignation.employee_name || `#${resignation.employee}`}`
              : `Resignation #${resignationId}`}
          </p>
        </div>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Exit Interview Form</CardTitle>
        </CardHeader>
        <CardContent>
          {existingInterview ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted/20 rounded-lg border border-border/40 text-sm space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground">Primary Reason</span>
                  <p className="font-semibold text-foreground">{existingInterview.primary_reason}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Satisfaction Score</span>
                  <p className="font-semibold text-foreground">{existingInterview.satisfaction_score} / 5</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Would Rejoin</span>
                  <p className="font-semibold text-foreground capitalize">{existingInterview.would_rejoin}</p>
                </div>
                {existingInterview.comments && (
                  <div>
                    <span className="text-xs text-muted-foreground">Comments</span>
                    <p className="text-foreground italic">{existingInterview.comments}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Exit interview already submitted. No further edits possible.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reason">Primary Reason for Leaving</Label>
                <Select value={form.primary_reason} onValueChange={(val) => setForm({ ...form, primary_reason: val })}>
                  <SelectTrigger id="reason">
                    <SelectValue placeholder="Select primary reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Overall Satisfaction Score (1 = Very Dissatisfied, 5 = Very Satisfied)</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setForm({ ...form, satisfaction_score: score })}
                      className={`flex-1 py-2 rounded-md border text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
                        form.satisfaction_score === score
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-muted/30 border-border/40 text-muted-foreground"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${form.satisfaction_score >= score ? "fill-primary text-primary" : ""}`} />
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="would-rejoin">Would You Rejoin?</Label>
                <Select value={form.would_rejoin} onValueChange={(val) => setForm({ ...form, would_rejoin: val })}>
                  <SelectTrigger id="would-rejoin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes, definitely</SelectItem>
                    <SelectItem value="maybe">Maybe</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comments">Additional Comments & Feedback</Label>
                <Textarea
                  id="comments"
                  rows={5}
                  placeholder="Share feedback about management, culture, career growth, or suggestions..."
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate("/exit/admin")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!form.primary_reason || mutation.isPending || mutation.isLoading}>
                  {mutation.isPending || mutation.isLoading ? "Submitting..." : "Submit Interview"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
