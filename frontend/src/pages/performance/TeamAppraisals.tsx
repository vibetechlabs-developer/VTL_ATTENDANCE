// src/pages/performance/TeamAppraisals.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Target, Star, CheckCircle2, ChevronDown, ChevronUp, Lock,
  Clock, Zap, Layers, Handshake, Lightbulb, MessageSquare, BarChart3,
} from "lucide-react";
import {
  fetchTeamAppraisals,
  submitManagerRating,
  finalizeAppraisal,
  evaluateFactors,
} from "@/api/performance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const RATING_LABELS: Record<number, string> = {
  1: "Needs Improvement",
  2: "Below Expectations",
  3: "Meets Expectations",
  4: "Exceeds Expectations",
  5: "Outstanding",
};

const RATING_COLORS: Record<number, string> = {
  1: "text-red-500 border-red-400 bg-red-500/10",
  2: "text-orange-500 border-orange-400 bg-orange-500/10",
  3: "text-yellow-500 border-yellow-400 bg-yellow-500/10",
  4: "text-blue-500 border-blue-400 bg-blue-500/10",
  5: "text-emerald-500 border-emerald-400 bg-emerald-500/10",
};

const EVALUATION_FACTORS = [
  {
    key: "punctuality_rating",
    commentKey: "punctuality_comment",
    label: "Punctuality & Attendance",
    icon: Clock,
    description: "Timeliness, late arrivals, early departures, attendance regularity",
    color: "text-blue-500",
  },
  {
    key: "quality_rating",
    commentKey: "quality_comment",
    label: "Work Quality & Accuracy",
    icon: Star,
    description: "Output precision, attention to detail, completeness of deliverables",
    color: "text-amber-500",
  },
  {
    key: "productivity_rating",
    commentKey: "productivity_comment",
    label: "Productivity & Speed",
    icon: Zap,
    description: "Task completion rate, deadline adherence, efficiency under workload",
    color: "text-emerald-500",
  },
  {
    key: "teamwork_rating",
    commentKey: "teamwork_comment",
    label: "Teamwork & Communication",
    icon: Handshake,
    description: "Team collaboration, responsiveness, conflict resolution",
    color: "text-purple-500",
  },
  {
    key: "initiative_rating",
    commentKey: "initiative_comment",
    label: "Initiative & Problem Solving",
    icon: Lightbulb,
    description: "Self-motivation, creative problem-solving, ownership of responsibilities",
    color: "text-pink-500",
  },
];

function RatingSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          disabled={disabled}
          onClick={() => onChange(score)}
          className={`min-w-[2.5rem] py-1.5 px-2 rounded-lg border-2 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            value === score
              ? RATING_COLORS[score]
              : "border-border/40 text-muted-foreground hover:border-primary/40 hover:bg-muted/20"
          }`}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

export default function TeamAppraisals() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [ratingDraft, setRatingDraft] = useState<Record<number, { rating: number; comment: string }>>({});
  const [factorDraft, setFactorDraft] = useState<Record<number, any>>({});
  const [factorTab, setFactorTab] = useState<Record<number, "goals" | "factors">>({});
  const [finalizeTarget, setFinalizeTarget] = useState<any>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["team-appraisals"],
    queryFn: () => fetchTeamAppraisals().then((r) => r.data),
  });

  const teamMembers: any[] = Array.isArray(data) ? data : data?.results || [];

  const managerRateMutation = useMutation({
    mutationFn: ({ goalId, rating, comment }: { goalId: number; rating: number; comment: string }) =>
      submitManagerRating(goalId, { manager_rating: rating, manager_comment: comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-appraisals"] });
      toast.success("Manager rating saved");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to save rating"),
  });

  const factorMutation = useMutation({
    mutationFn: ({ appraisalId, payload }: { appraisalId: number; payload: any }) =>
      evaluateFactors(appraisalId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-appraisals"] });
      toast.success("Evaluation factors saved — overall rating updated");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to save factors"),
  });

  const finalizeMutation = useMutation({
    mutationFn: (employeeId: number) => finalizeAppraisal(employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-appraisals"] });
      toast.success("Appraisal finalised successfully");
      setFinalizeTarget(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to finalise"),
  });

  const getTab = (empId: number) => factorTab[empId] || "goals";

  if (isLoading)
    return <div className="p-8 text-center text-muted-foreground">Loading team appraisals…</div>;
  if (error)
    return <div className="p-8 text-center text-red-500">Failed to load team appraisals.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Team Appraisals
        </h1>
        <p className="text-sm text-muted-foreground">
          Review and rate your team members' goals and performance factors for the active cycle.
        </p>
      </div>

      {teamMembers.length === 0 ? (
        <Card className="border border-border/40 shadow-sm">
          <CardContent className="p-10 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>No team members with active appraisals found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {teamMembers.map((member: any) => {
            const isOpen = expanded === member.employee_id;
            const goals: any[] = member.goals || [];
            const allGoalsRated = goals.length > 0 && goals.every((g: any) => g.manager_rating != null);
            const currentTab = getTab(member.employee_id);
            const appraisalId: number = member.appraisal_id;

            const fd = factorDraft[member.employee_id] || {};
            const getFactor = (key: string) => fd[key] ?? member[key] ?? 0;
            const filledFactors = EVALUATION_FACTORS.filter((f) => getFactor(f.key) > 0).length;

            return (
              <Card key={member.employee_id} className="border border-border/40 shadow-sm overflow-hidden">
                {/* Header */}
                <CardHeader
                  className="cursor-pointer select-none hover:bg-muted/10 transition-colors py-4"
                  onClick={() => setExpanded(isOpen ? null : member.employee_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {(member.employee_name || "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{member.employee_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {[member.designation, member.department].filter(Boolean).join(" · ") || "Team Member"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {member.overall_rating > 0 && (
                        <Badge className="gap-1 text-xs bg-primary/10 text-primary border border-primary/20">
                          <BarChart3 className="h-3 w-3" />
                          {Number(member.overall_rating).toFixed(1)}/5
                        </Badge>
                      )}
                      <Badge
                        variant={member.finalized ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {member.finalized
                          ? "Finalised"
                          : `${goals.filter((g: any) => g.manager_rating != null).length}/${goals.length} goals`}
                      </Badge>
                      {filledFactors > 0 && (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/40">
                          {filledFactors}/5 factors
                        </Badge>
                      )}
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="p-0 border-t border-border/40">
                    {/* Tab Switcher */}
                    <div className="flex border-b border-border/40">
                      {[
                        { id: "goals" as const, label: `Goals (${goals.length})`, icon: Target },
                        { id: "factors" as const, label: "Performance Factors", icon: Layers },
                      ].map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFactorTab((t) => ({ ...t, [member.employee_id]: id }))}
                          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                            currentTab === id
                              ? "border-primary text-primary bg-primary/5"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                          {id === "factors" && filledFactors > 0 && (
                            <span className="ml-1 bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                              {filledFactors}/5
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* ── GOALS TAB ──────────────────────────────── */}
                    {currentTab === "goals" && (
                      <div className="divide-y divide-border/40">
                        {goals.length === 0 ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">
                            No goals assigned for this cycle yet.
                          </div>
                        ) : (
                          goals.map((goal: any) => {
                            const draft = ratingDraft[goal.id] || {
                              rating: goal.manager_rating ?? 0,
                              comment: goal.manager_comment ?? "",
                            };
                            const alreadyRated = goal.manager_rating != null;

                            return (
                              <div key={goal.id} className="p-5 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                                      <Target className="h-4 w-4 text-primary shrink-0" />
                                      {goal.title}
                                    </div>
                                    {goal.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 ml-6">{goal.description}</p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground mt-1 ml-6 font-medium">
                                      Weightage: {goal.weightage}%
                                    </p>
                                  </div>
                                  {goal.self_rating != null && (
                                    <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                                      <Star className="h-3 w-3" />
                                      Self: {goal.self_rating}/5
                                    </Badge>
                                  )}
                                </div>

                                {!member.finalized ? (
                                  <div className="space-y-2 ml-6">
                                    <Label className="text-xs text-muted-foreground">Manager Rating</Label>
                                    <RatingSelector
                                      value={draft.rating}
                                      onChange={(score) =>
                                        setRatingDraft((d) => ({
                                          ...d,
                                          [goal.id]: { ...d[goal.id], rating: score, comment: d[goal.id]?.comment ?? "" },
                                        }))
                                      }
                                      disabled={alreadyRated}
                                    />
                                    {draft.rating > 0 && (
                                      <p className="text-[11px] text-muted-foreground">{RATING_LABELS[draft.rating]}</p>
                                    )}
                                    {!alreadyRated && (
                                      <>
                                        <Textarea
                                          rows={2}
                                          className="text-xs"
                                          placeholder="Manager comment for this goal…"
                                          value={draft.comment}
                                          onChange={(e) =>
                                            setRatingDraft((d) => ({
                                              ...d,
                                              [goal.id]: { ...d[goal.id], comment: e.target.value },
                                            }))
                                          }
                                        />
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-xs"
                                          disabled={!draft.rating || managerRateMutation.isPending}
                                          onClick={() =>
                                            managerRateMutation.mutate({
                                              goalId: goal.id,
                                              rating: draft.rating,
                                              comment: draft.comment,
                                            })
                                          }
                                        >
                                          Save Rating
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground ml-6">
                                    <Lock className="h-3.5 w-3.5" />
                                    Manager: {goal.manager_rating}/5
                                    {goal.manager_comment && ` — "${goal.manager_comment}"`}
                                  </div>
                                )}

                                {alreadyRated && !member.finalized && (
                                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 ml-6">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Rated {goal.manager_rating}/5
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* ── FACTORS TAB ────────────────────────────── */}
                    {currentTab === "factors" && (
                      <div className="p-5 space-y-5">
                        <div className="flex items-start gap-2 bg-muted/30 p-3 rounded-lg border border-border/40 text-xs text-muted-foreground">
                          <BarChart3 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>
                            Performance factors contribute <strong className="text-foreground">40%</strong> to the overall score
                            (goals: 60%). Rate each factor 1–5 and click Save at the bottom.
                          </span>
                        </div>

                        {/* Live overall score */}
                        {member.overall_rating > 0 && (
                          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
                            <div className="text-2xl font-black text-primary">
                              {Number(member.overall_rating).toFixed(1)}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">Current Overall Score</p>
                              <p className="text-[11px] text-muted-foreground">
                                {RATING_LABELS[Math.round(member.overall_rating)] || "—"}
                              </p>
                            </div>
                            <Progress value={member.overall_rating * 20} className="flex-1 h-2" />
                          </div>
                        )}

                        {/* Factors */}
                        {EVALUATION_FACTORS.map(({ key, commentKey, label, icon: Icon, description, color }) => {
                          const currentVal = getFactor(key);
                          return (
                            <div key={key} className="space-y-2 pb-4 border-b border-border/30 last:border-0 last:pb-0">
                              <div className="flex items-start gap-2">
                                <Icon className={`h-4 w-4 ${color} shrink-0 mt-0.5`} />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{label}</p>
                                  <p className="text-[11px] text-muted-foreground">{description}</p>
                                </div>
                              </div>
                              <RatingSelector
                                value={currentVal}
                                onChange={(v) =>
                                  setFactorDraft((d) => ({
                                    ...d,
                                    [member.employee_id]: { ...d[member.employee_id], [key]: v },
                                  }))
                                }
                                disabled={member.finalized}
                              />
                              {currentVal > 0 && (
                                <p className="text-[11px] text-muted-foreground font-medium">
                                  {RATING_LABELS[currentVal]}
                                </p>
                              )}
                              {!member.finalized && (
                                <Textarea
                                  rows={2}
                                  className="text-xs"
                                  placeholder={`Notes on ${label.toLowerCase()}…`}
                                  value={fd[commentKey] ?? member[commentKey] ?? ""}
                                  onChange={(e) =>
                                    setFactorDraft((d) => ({
                                      ...d,
                                      [member.employee_id]: { ...d[member.employee_id], [commentKey]: e.target.value },
                                    }))
                                  }
                                />
                              )}
                            </div>
                          );
                        })}

                        {/* Manager Overall Notes */}
                        {!member.finalized && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5 text-primary" />
                              Manager Overall Notes
                            </Label>
                            <Textarea
                              rows={3}
                              className="text-xs"
                              placeholder="Summarise your overall assessment, strengths, and growth areas…"
                              value={fd.manager_notes ?? member.manager_notes ?? ""}
                              onChange={(e) =>
                                setFactorDraft((d) => ({
                                  ...d,
                                  [member.employee_id]: { ...d[member.employee_id], manager_notes: e.target.value },
                                }))
                              }
                            />
                          </div>
                        )}

                        {!member.finalized && (
                          <Button
                            className="w-full gap-2"
                            disabled={factorMutation.isPending || !appraisalId}
                            onClick={() => {
                              if (!appraisalId) {
                                toast.error("Appraisal record not found for this employee.");
                                return;
                              }
                              factorMutation.mutate({
                                appraisalId,
                                payload: factorDraft[member.employee_id] || {},
                              });
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {factorMutation.isPending ? "Saving…" : "Save All Factors & Recalculate Score"}
                          </Button>
                        )}

                        {member.finalized && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 border border-border/40">
                            <Lock className="h-4 w-4" />
                            Appraisal finalised — all ratings are locked.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Finalise Footer */}
                    {!member.finalized && (
                      <div className="px-5 py-4 border-t border-border/40 flex justify-between items-center gap-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {allGoalsRated && filledFactors >= 3
                            ? "✓ Ready to finalise — goals and key factors rated."
                            : `Complete goal ratings + at least 3 performance factors to finalise.`}
                        </p>
                        <Button
                          className="gap-1.5 shrink-0"
                          disabled={!allGoalsRated && filledFactors < 3}
                          onClick={() => setFinalizeTarget(member)}
                        >
                          <Lock className="h-4 w-4" />
                          Finalise Appraisal
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Finalise Dialog */}
      <Dialog open={!!finalizeTarget} onOpenChange={() => setFinalizeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finalise Appraisal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will lock all ratings and factor scores for{" "}
            <strong className="text-foreground">{finalizeTarget?.employee_name}</strong> and make
            them visible to the employee. This action <strong>cannot be undone</strong>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={finalizeMutation.isPending}
              onClick={() => finalizeMutation.mutate(finalizeTarget?.employee_id)}
            >
              {finalizeMutation.isPending ? "Finalising…" : "Yes, Finalise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
