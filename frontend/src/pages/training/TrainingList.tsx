// src/pages/training/TrainingList.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Calendar, Users, Clock, MapPin, CheckCircle2, AlertCircle
} from "lucide-react";
import { fetchPrograms, enrollInProgram } from "@/api/training";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const MODE_LABELS: Record<string, string> = {
  online: "Online",
  offline: "In-Person",
  hybrid: "Hybrid",
};

export default function TrainingList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [timing, setTiming] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["training-programs", timing],
    queryFn: () => fetchPrograms({ timing: timing !== "all" ? timing : undefined }).then((res) => res.data),
  });

  const programs = Array.isArray(data) ? data : data?.results || [];

  const filtered = programs.filter((p: any) =>
    (p.title || "").toLowerCase().includes(search.toLowerCase())
  );

  const enrollMutation = useMutation({
    mutationFn: enrollInProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-programs"] });
      toast.success("Enrolled successfully!");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to enroll");
    },
  });

  const isAdmin = userHasRole(user, "admin") || userHasRole(user, "hr");
  const now = new Date();

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Training & Development
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse and enroll in available training programs.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/training/admin")} className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Admin Panel
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search programs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={timing} onValueChange={setTiming}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Timing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="past">Past</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading programs...</div>
      ) : error ? (
        <div className="p-8 text-center text-red-500">Failed to load training programs.</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No training programs found.</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((program: any) => {
            const startDate = new Date(program.start_date);
            const isPast = startDate < now;
            const isFull = program.max_participants > 0 &&
              program.current_participants >= program.max_participants;
            const isEnrolled = program.is_enrolled;

            return (
              <Card
                key={program.id}
                className="border border-border/40 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/training/${program.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                        {program.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {program.description}
                      </p>
                    </div>
                    {isPast ? (
                      <Badge variant="secondary" className="shrink-0">Past</Badge>
                    ) : (
                      <Badge variant="default" className="shrink-0 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30">Upcoming</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{program.start_date?.slice(0, 10)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {program.duration_days
                          ? `${program.duration_days} day${program.duration_days !== 1 ? "s" : ""}`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>{MODE_LABELS[program.mode] || program.mode}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {program.current_participants ?? "?"} / {program.max_participants || "∞"}
                      </span>
                    </div>
                  </div>

                  {program.trainer_name && (
                    <div className="text-xs text-muted-foreground">
                      Trainer: <span className="text-foreground font-medium">{program.trainer_name}</span>
                    </div>
                  )}

                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {isEnrolled ? (
                      <Button size="sm" variant="outline" className="gap-1 text-emerald-600 pointer-events-none" disabled>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Enrolled
                      </Button>
                    ) : isFull ? (
                      <Button size="sm" variant="outline" className="gap-1 text-muted-foreground" disabled>
                        <AlertCircle className="h-3.5 w-3.5" />
                        Full
                      </Button>
                    ) : isPast ? (
                      <Button size="sm" variant="outline" disabled>
                        Closed
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={enrollMutation.isPending || enrollMutation.isLoading}
                        onClick={() => enrollMutation.mutate({ program: program.id })}
                      >
                        Enroll Now
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
