// src/pages/recruitment/JobCreate.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Briefcase } from "lucide-react";
import { createJobOpening } from "@/api/recruitment";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function JobCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: "",
    department: "",
    location: "",
    experience_required: "",
    description: "",
    status: "open",
  });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => createJobOpening(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["openings"] });
      toast.success("Job opening created successfully");
      navigate("/recruitment/jobs");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to create job opening");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/recruitment/jobs")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Create Job Opening
          </h1>
          <p className="text-sm text-muted-foreground">Post a new position for candidate applications.</p>
        </div>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Job Title</Label>
              <Input
                id="title"
                required
                placeholder="e.g. Senior Frontend Engineer"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  required
                  placeholder="e.g. Engineering"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  required
                  placeholder="e.g. Remote / New York"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="experience">Experience Required</Label>
                <Input
                  id="experience"
                  required
                  placeholder="e.g. 3-5 years"
                  value={form.experience_required}
                  onChange={(e) => setForm({ ...form, experience_required: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(val) => setForm({ ...form, status: val })}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Job Description</Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="Detailed duties, qualifications, and expectations..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/recruitment/jobs")}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isLoading}>
                {mutation.isLoading ? "Creating..." : "Create Opening"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
