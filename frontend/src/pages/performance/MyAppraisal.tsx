// src/pages/performance/MyAppraisal.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target, Star, CheckCircle2, Lock,
  Clock, Zap, Layers, Handshake, Lightbulb, MessageSquare, BarChart3,
  Download, ClipboardList, Send,
} from "lucide-react";
import {
  fetchMyAppraisal,
  submitSelfRating,
  submitSelfAssessment,
  downloadAppraisalPdf,
} from "@/api/performance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const RATING_LABELS: Record<number, string> = {
  1: "Needs Improvement",
  2: "Below Expectations",
  3: "Meets Expectations",
  4: "Exceeds Expectations",
  5: "Outstanding",
};

const FACTOR_DISPLAY = [
  { key: "punctuality_rating", commentKey: "punctuality_comment", label: "Punctuality & Attendance", icon: Clock, color: "text-blue-500" },
  { key: "quality_rating", commentKey: "quality_comment", label: "Work Quality & Accuracy", icon: Star, color: "text-amber-500" },
  { key: "productivity_rating", commentKey: "productivity_comment", label: "Productivity & Speed", icon: Zap, color: "text-emerald-500" },
  { key: "teamwork_rating", commentKey: "teamwork_comment", label: "Teamwork & Communication", icon: Handshake, color: "text-purple-500" },
  { key: "initiative_rating", commentKey: "initiative_comment", label: "Initiative & Problem Solving", icon: Lightbulb, color: "text-pink-500" },
];

export default function MyAppraisal() {
  const queryClient = useQueryClient();
  const [selfRatings, setSelfRatings] = useState<Record<number, number>>({});
  const [assessment, setAssessment] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-appraisal"],
    queryFn: () => fetchMyAppraisal().then((r) => r.data),
  });

  const appraisal = data || null;
  const goals: any[] = appraisal?.goals || [];

  const selfRateMutation = useMutation({
    mutationFn: ({ goalId, rating }: { goalId: number; rating: number }) =>
      submitSelfRating(goalId, { self_rating: rating }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-appraisal"] });
      toast.success("Self-rating saved");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to save rating"),
  });

  const assessmentMutation = useMutation({
    mutationFn: () => submitSelfAssessment({ self_assessment: assessment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-appraisal"] });
      toast.success("Self-assessment submitted");
      setAssessment("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to submit"),
  });

  const ratedCount = goals.filter((g) => g.self_rating != null).length;
  const progress = goals.length > 0 ? Math.round((ratedCount / goals.length) * 100) : 0;
  const factorsFilled = FACTOR_DISPLAY.filter((f) => appraisal?.[f.key] != null).length;

  if (isLoading)
    return <div className="p-8 text-center text-muted-foreground">Loading appraisal…</div>;
  if (error || !appraisal)
    return (
      <div className="p-8 text-center text-muted-foreground">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
        <p>No active appraisal cycle found for you right now.</p>
      </div>
    );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          My Appraisal
        </h1>
        <p className="text-sm text-muted-foreground">
          Cycle: <strong>{appraisal.cycle_name || "Active Cycle"}</strong>
          {appraisal.status && (
            <Badge variant="outline" className="ml-2 capitalize">{appraisal.status}</Badge>
          )}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border border-border/40 shadow-sm">
          <CardContent className="p-5">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-semibold text-foreground">Self-Rating Progress</span>
              <span className="text-sm text-muted-foreground">{ratedCount} / {goals.length} goals</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
        {appraisal.overall_rating > 0 && (
          <Card className="border border-border/40 shadow-sm bg-primary/5">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="text-3xl font-black text-primary">{Number(appraisal.overall_rating).toFixed(1)}</div>
              <div>
                <p className="text-sm font-semibold text-foreground">Overall Score</p>
                <p className="text-xs text-muted-foreground">{RATING_LABELS[Math.round(appraisal.overall_rating)] || "—"}</p>
              </div>
              <BarChart3 className="h-6 w-6 text-primary/40 ml-auto" />
            </CardContent>
          </Card>
        )}
        {/* Download PDF button */}
        {appraisal.id && (
          <Button
            className="gap-2"
            variant="secondary"
            onClick={() => downloadAppraisalPdf(appraisal.id)}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        )}
      </div>

      {/* Goals */}
      <div className="space-y-3">
        {goals.length === 0 ? (
          <Card className="border border-border/40 shadow-sm">
            <CardContent className="p-8 text-center text-muted-foreground">
              No goals assigned for this cycle yet.
            </CardContent>
          </Card>
        ) : (
          goals.map((goal: any) => {
            const currentRating = selfRatings[goal.id] ?? goal.self_rating ?? 0;
            return (
              <Card key={goal.id} className="border border-border/40 shadow-sm">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary shrink-0" />
                        {goal.title}
                      </div>
                      {goal.description && (
                        <p className="text-xs text-muted-foreground mt-1">{goal.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">Weight: {goal.weightage}%</p>
                    </div>
                    {goal.manager_rating != null && (
                      <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        Manager: {goal.manager_rating}/5
                      </Badge>
                    )}
                  </div>

                  {/* Self Rating */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Your Self-Rating</Label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          type="button"
                          onClick={() => setSelfRatings((r) => ({ ...r, [goal.id]: score }))}
                          className={`flex-1 py-1.5 rounded border text-xs font-semibold transition-colors ${
                            currentRating === score
                              ? "bg-primary/10 border-primary text-primary"
                              : "border-border/40 text-muted-foreground hover:bg-muted/20"
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs gap-1"
                        disabled={!selfRatings[goal.id] || selfRateMutation.isPending}
                        onClick={() => selfRateMutation.mutate({ goalId: goal.id, rating: selfRatings[goal.id] })}
                      >
                        <Send className="h-3 w-3" />
                        Save
                      </Button>
                    </div>
                    {currentRating > 0 && (
                      <p className="text-[11px] text-muted-foreground">{RATING_LABELS[currentRating]}</p>
                    )}
                  </div>

                  {goal.self_rating != null && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Self-rated: {goal.self_rating}/5
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Manager's Performance Factor Ratings (read-only for employee) */}
      {factorsFilled > 0 && (
        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Manager's Performance Factor Ratings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {FACTOR_DISPLAY.map(({ key, commentKey, label, icon: Icon, color }) => {
              const rating = appraisal[key];
              if (!rating) return null;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className="text-sm font-medium text-foreground">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{RATING_LABELS[rating] || ""}</span>
                      <Badge variant="outline" className="text-xs font-bold">{rating}/5</Badge>
                    </div>
                  </div>
                  <Progress value={rating * 20} className="h-1.5" />
                  {appraisal[commentKey] && (
                    <p className="text-[11px] text-muted-foreground italic">"{appraisal[commentKey]}"</p>
                  )}
                </div>
              );
            })}
            {appraisal.manager_notes && (
              <div className="pt-2 border-t border-border/30">
                <p className="text-xs font-semibold text-foreground mb-1">Manager Notes:</p>
                <p className="text-xs text-muted-foreground italic">"{appraisal.manager_notes}"</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Self-Assessment */}
      {!appraisal.self_assessment_submitted && (
        <Card className="border border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Self-Assessment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Summarise your achievements, challenges, and development goals for this cycle.
            </p>
            <Textarea
              rows={5}
              placeholder="Describe your key accomplishments, areas where you grew, and what you want to improve…"
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                disabled={!assessment.trim() || assessmentMutation.isPending}
                onClick={() => assessmentMutation.mutate()}
              >
                {assessmentMutation.isPending ? "Submitting…" : "Submit Assessment"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {appraisal.self_assessment_submitted && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4" />
          Self-assessment already submitted for this cycle.
        </div>
      )}
    </div>
  );
}
