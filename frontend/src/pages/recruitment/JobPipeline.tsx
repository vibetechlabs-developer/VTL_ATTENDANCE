// src/pages/recruitment/JobPipeline.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ChevronRight, ChevronLeft, User, Briefcase,
  CalendarPlus, MessageSquare, CheckCircle2, XCircle,
} from "lucide-react";
import {
  fetchJobOpening,
  fetchApplications,
  moveApplicationStage,
  fetchJobApplicationDetail,
} from "@/api/recruitment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createInterview, submitInterviewFeedback, fetchInterviews } from "@/api/recruitment";

const STAGES = [
  { key: "applied",      label: "Applied",      color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  { key: "shortlisted",  label: "Shortlisted",  color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { key: "interview",    label: "Interview",    color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { key: "offered",      label: "Offered",      color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  { key: "hired",        label: "Hired",        color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { key: "rejected",     label: "Rejected",     color: "bg-red-500/15 text-red-700 dark:text-red-300" },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

export default function JobPipeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [interviewModal, setInterviewModal] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<any>(null); // holds interview obj
  const [interviewForm, setInterviewForm] = useState({
    scheduled_at: "", mode: "online", panel_notes: "",
  });
  const [feedbackForm, setFeedbackForm] = useState({ rating: 3, notes: "" });

  const { data: job } = useQuery({
    queryKey: ["job", id],
    queryFn: () => fetchJobOpening(id!).then((r) => r.data),
    enabled: !!id,
  });

  const { data: appsData, isLoading } = useQuery({
    queryKey: ["applications", id],
    queryFn: () => fetchApplications({ job: id }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: interviewsData } = useQuery({
    queryKey: ["interviews", selectedApp?.id],
    queryFn: () => fetchInterviews({ application: selectedApp?.id }).then((r) => r.data),
    enabled: !!selectedApp?.id,
  });

  const applications: any[] = Array.isArray(appsData) ? appsData : appsData?.results || [];
  const interviews: any[] = Array.isArray(interviewsData) ? interviewsData : interviewsData?.results || [];

  const byStage = (stage: string) => applications.filter((a) => a.stage === stage);

  const moveMutation = useMutation({
    mutationFn: ({ appId, stage }: { appId: number; stage: string }) =>
      moveApplicationStage(appId, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", id] });
      toast.success("Stage updated");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to move stage"),
  });

  const interviewMutation = useMutation({
    mutationFn: (payload: any) => createInterview(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews", selectedApp?.id] });
      toast.success("Interview scheduled");
      setInterviewModal(false);
      setInterviewForm({ scheduled_at: "", mode: "online", panel_notes: "" });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to schedule interview"),
  });

  const feedbackMutation = useMutation({
    mutationFn: (payload: any) => submitInterviewFeedback(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviews", selectedApp?.id] });
      toast.success("Feedback submitted");
      setFeedbackModal(null);
      setFeedbackForm({ rating: 3, notes: "" });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to submit feedback"),
  });

  const currentIdx = selectedApp
    ? STAGE_ORDER.indexOf(selectedApp.stage)
    : -1;

  const canAdvance = currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 2; // not hired/rejected
  const canGoBack  = currentIdx > 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate("/recruitment/jobs")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            {job?.title || "Job Pipeline"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {job?.department_name} · {applications.length} application{applications.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading applications…</p>
      ) : (
        /* Kanban Board */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const cards = byStage(stage.key);
            return (
              <div
                key={stage.key}
                className="flex-none w-60 min-h-[300px] rounded-xl border border-border/40 bg-muted/10 flex flex-col"
              >
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${stage.color}`}>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {stage.label}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {cards.length}
                  </Badge>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 p-2 flex-1">
                  {cards.map((app) => (
                    <Card
                      key={app.id}
                      className={`cursor-pointer border transition-shadow hover:shadow-md ${
                        selectedApp?.id === app.id ? "border-primary ring-1 ring-primary/30" : "border-border/40"
                      }`}
                      onClick={() => setSelectedApp(app.id === selectedApp?.id ? null : app)}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-semibold text-foreground leading-tight line-clamp-1">
                            {app.candidate_name || `Candidate #${app.candidate}`}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Applied: {app.applied_on?.slice(0, 10)}
                        </p>
                        {/* Quick move buttons */}
                        <div className="flex gap-1 pt-1">
                          {stage.key !== "rejected" && stage.key !== "hired" && (
                            <>
                              {STAGE_ORDER.indexOf(stage.key) > 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveMutation.mutate({
                                      appId: app.id,
                                      stage: STAGE_ORDER[STAGE_ORDER.indexOf(stage.key) - 1],
                                    });
                                  }}
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[10px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextIdx = STAGE_ORDER.indexOf(stage.key) + 1;
                                  if (nextIdx < STAGE_ORDER.length - 1) {
                                    moveMutation.mutate({ appId: app.id, stage: STAGE_ORDER[nextIdx] });
                                  }
                                }}
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[10px] text-red-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveMutation.mutate({ appId: app.id, stage: "rejected" });
                                }}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[10px] text-emerald-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveMutation.mutate({ appId: app.id, stage: "hired" });
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {selectedApp && (
        <div className="border border-border/40 rounded-xl p-5 bg-muted/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {selectedApp.candidate_name || `Candidate #${selectedApp.candidate}`}
              <Badge variant="outline" className="capitalize ml-1">
                {selectedApp.stage}
              </Badge>
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => setInterviewModal(true)}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Schedule Interview
              </Button>
            </div>
          </div>

          {/* Interviews list */}
          {interviews.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Interviews
              </p>
              {interviews.map((iv: any) => (
                <div
                  key={iv.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-background text-sm"
                >
                  <div>
                    <span className="font-medium text-foreground">
                      {iv.scheduled_at?.replace("T", " ").slice(0, 16)}
                    </span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="capitalize text-muted-foreground">{iv.mode}</span>
                  </div>
                  {iv.feedback_submitted ? (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Feedback done
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs"
                      onClick={() => setFeedbackModal(iv)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Add Feedback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Interview Modal */}
      <Dialog open={interviewModal} onOpenChange={setInterviewModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
            <DialogDescription>
              For {selectedApp?.candidate_name || "candidate"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="iv-date">Date & Time *</Label>
              <Input
                id="iv-date"
                type="datetime-local"
                value={interviewForm.scheduled_at}
                onChange={(e) => setInterviewForm({ ...interviewForm, scheduled_at: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={interviewForm.mode}
                onValueChange={(v) => setInterviewForm({ ...interviewForm, mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="in_person">In-Person</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="iv-notes">Panel Notes</Label>
              <Textarea
                id="iv-notes"
                rows={3}
                placeholder="Topics to cover, panel member names…"
                value={interviewForm.panel_notes}
                onChange={(e) => setInterviewForm({ ...interviewForm, panel_notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInterviewModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={!interviewForm.scheduled_at || interviewMutation.isLoading}
              onClick={() =>
                interviewMutation.mutate({
                  application: selectedApp?.id,
                  scheduled_at: interviewForm.scheduled_at,
                  mode: interviewForm.mode,
                  panel_notes: interviewForm.panel_notes,
                })
              }
            >
              {interviewMutation.isLoading ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Modal */}
      <Dialog open={!!feedbackModal} onOpenChange={() => setFeedbackModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interview Feedback</DialogTitle>
            <DialogDescription>
              {feedbackModal?.scheduled_at?.replace("T", " ").slice(0, 16)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Rating (1–5)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFeedbackForm({ ...feedbackForm, rating: s })}
                    className={`flex-1 py-2 rounded-md border text-sm font-semibold transition-colors ${
                      feedbackForm.rating === s
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border/40 text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fb-notes">Notes</Label>
              <Textarea
                id="fb-notes"
                rows={4}
                placeholder="Candidate strengths, concerns, recommendation…"
                value={feedbackForm.notes}
                onChange={(e) => setFeedbackForm({ ...feedbackForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={feedbackMutation.isLoading}
              onClick={() =>
                feedbackMutation.mutate({
                  interview: feedbackModal?.id,
                  rating: feedbackForm.rating,
                  notes: feedbackForm.notes,
                })
              }
            >
              {feedbackMutation.isLoading ? "Submitting…" : "Submit Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
