// src/pages/training/TrainingDetail.tsx
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, GraduationCap, Calendar, Users, Clock, MapPin, CheckCircle2, Star
} from "lucide-react";
import {
  fetchProgramDetail,
  fetchEnrollments,
  markAttendance,
  fetchFeedback,
  submitFeedback,
} from "@/api/training";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function TrainingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const isAdmin = userHasRole(user, "admin") || userHasRole(user, "hr");

  const { data: program, isLoading: loadingProgram } = useQuery({
    queryKey: ["training-program", id],
    queryFn: () => fetchProgramDetail(id!).then((res) => res.data),
    enabled: !!id,
  });

  const { data: enrollmentsData, isLoading: loadingEnrollments } = useQuery({
    queryKey: ["enrollments", id],
    queryFn: () => fetchEnrollments({ program: id }).then((res) => res.data),
    enabled: !!id && isAdmin,
  });

  const enrollments = Array.isArray(enrollmentsData)
    ? enrollmentsData
    : enrollmentsData?.results || [];

  const { data: feedbackData } = useQuery({
    queryKey: ["my-feedback", id],
    queryFn: () => fetchFeedback({ program: id }).then((res) => res.data),
    enabled: !!id,
  });

  const myFeedback = Array.isArray(feedbackData)
    ? feedbackData[0]
    : feedbackData?.results?.[0];

  const [feedbackForm, setFeedbackForm] = useState({ rating: 4, comments: "" });

  const attendanceMutation = useMutation({
    mutationFn: ({ enrollmentId, attended }: { enrollmentId: number; attended: boolean }) =>
      markAttendance(enrollmentId, attended),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments", id] });
      toast.success("Attendance updated");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to update attendance");
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: submitFeedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-feedback", id] });
      toast.success("Feedback submitted successfully");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to submit feedback");
    },
  });

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    feedbackMutation.mutate({
      program: Number(id),
      rating: feedbackForm.rating,
      comments: feedbackForm.comments,
    });
  };

  // Can submit feedback if user has enrolled and attended
  const programDate = program ? new Date(program.start_date) : null;
  const isPast = programDate ? programDate < new Date() : false;

  if (loadingProgram)
    return <div className="p-8 text-center text-muted-foreground">Loading program details...</div>;
  if (!program)
    return <div className="p-8 text-center text-red-500">Program not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/training")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            {program.title}
          </h1>
          <p className="text-sm text-muted-foreground">{program.description}</p>
        </div>
      </div>

      {/* Program Info */}
      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Start Date</div>
                <div className="font-semibold">{program.start_date?.slice(0, 10)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Duration</div>
                <div className="font-semibold">
                  {program.duration_days ? `${program.duration_days} day(s)` : "N/A"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Mode</div>
                <div className="font-semibold capitalize">{program.mode || "N/A"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Participants</div>
                <div className="font-semibold">
                  {program.current_participants ?? "?"} / {program.max_participants || "∞"}
                </div>
              </div>
            </div>
          </div>
          {program.trainer_name && (
            <div className="mt-3 pt-3 border-t border-border/40 text-sm">
              Trainer: <span className="font-semibold">{program.trainer_name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin: Participant Attendance */}
      {isAdmin && (
        <Card className="border border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Participant List {isPast && <Badge variant="outline" className="ml-2">Mark Attendance</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingEnrollments ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
            ) : enrollments.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No enrollments yet.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {enrollments.map((enr: any) => (
                  <div key={enr.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {enr.employee_name || `Employee #${enr.employee}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Enrolled: {enr.enrolled_on?.slice(0, 10)}
                      </div>
                    </div>
                    {isPast ? (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`att-${enr.id}`}
                          checked={!!enr.attended}
                          onCheckedChange={(checked) =>
                            attendanceMutation.mutate({
                              enrollmentId: enr.id,
                              attended: !!checked,
                            })
                          }
                        />
                        <Label htmlFor={`att-${enr.id}`} className="text-xs cursor-pointer select-none">
                          {enr.attended ? "Attended" : "Mark attended"}
                        </Label>
                      </div>
                    ) : (
                      <Badge variant={enr.attended ? "default" : "outline"} className="text-xs">
                        {enr.attended ? "Attended" : "Pending"}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Employee: Feedback (only after attendance) */}
      {isPast && !isAdmin && (
        <Card className="border border-border/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Training Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myFeedback ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Your Rating:</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${s <= (myFeedback.rating || 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-muted-foreground italic">"{myFeedback.comments}"</p>
                <p className="text-xs text-muted-foreground">
                  Submitted on {myFeedback.submitted_on?.slice(0, 10)}
                </p>
              </div>
            ) : (
              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label>Overall Rating</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        type="button"
                        key={score}
                        onClick={() => setFeedbackForm({ ...feedbackForm, rating: score })}
                        className={`p-2 rounded-md border text-sm transition-colors flex items-center gap-1 ${
                          feedbackForm.rating === score
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/40 text-muted-foreground hover:bg-muted/20"
                        }`}
                      >
                        <Star className={`h-4 w-4 ${feedbackForm.rating >= score ? "fill-current" : ""}`} />
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fb-comments">Comments</Label>
                  <Textarea
                    id="fb-comments"
                    rows={4}
                    placeholder="Share what you learned and any suggestions for improvement..."
                    value={feedbackForm.comments}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={feedbackMutation.isPending || feedbackMutation.isLoading}>
                    {feedbackMutation.isPending || feedbackMutation.isLoading ? "Submitting..." : "Submit Feedback"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
