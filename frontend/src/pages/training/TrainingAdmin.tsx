// src/pages/training/TrainingAdmin.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Plus, Users, Trash2, BookOpen
} from "lucide-react";
import { fetchPrograms, createProgram, deleteProgram, bulkEnroll } from "@/api/training";
import { fetchDepartments } from "@/api/employees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const emptyForm = {
  title: "",
  description: "",
  start_date: "",
  duration_days: 1,
  mode: "online",
  max_participants: 0,
  trainer_name: "",
};

export default function TrainingAdmin() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [bulkModal, setBulkModal] = useState<number | null>(null);
  const [bulkDept, setBulkDept] = useState("");

  const { data: programsData, isLoading } = useQuery({
    queryKey: ["training-programs-admin"],
    queryFn: () => fetchPrograms().then((res) => res.data),
  });

  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => fetchDepartments().then((res) => res.data),
  });

  const programs = Array.isArray(programsData) ? programsData : programsData?.results || [];
  const departments = Array.isArray(deptData) ? deptData : deptData?.results || [];

  const createMutation = useMutation({
    mutationFn: createProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-programs-admin"] });
      toast.success("Training program created");
      setShowCreate(false);
      setForm({ ...emptyForm });
    },
    onError: (err: any) => {
      const errData = err?.response?.data;
      let msg = "Failed to create program";
      if (typeof errData === "string") msg = errData;
      else if (errData && typeof errData === "object") {
        msg = Object.entries(errData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
      }
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-programs-admin"] });
      toast.success("Program deleted");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to delete"),
  });

  const bulkMutation = useMutation({
    mutationFn: () => bulkEnroll(bulkModal!, Number(bulkDept)),
    onSuccess: (res: any) => {
      toast.success(res.data?.message || "Bulk enrollment done");
      setBulkModal(null);
      setBulkDept("");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Bulk enroll failed"),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Training Admin
          </h1>
          <p className="text-sm text-muted-foreground">Create programs and manage enrollments.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Program
        </Button>
      </div>

      {/* Programs Table */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-0 border-b border-border/40">
          <CardTitle className="text-sm font-semibold">All Programs ({programs.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : programs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No programs yet. Create one above.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Title", "Start Date", "Mode", "Participants", "Trainer", "Actions"].map((c) => (
                    <th key={c} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {programs.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{p.title}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.start_date?.slice(0, 10)}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="capitalize">{p.mode}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {p.current_participants ?? 0} / {p.max_participants || "∞"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{p.trainer_name || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs"
                          onClick={() => setBulkModal(p.id)}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Bulk Enroll
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs text-red-600 hover:text-red-700"
                          onClick={() => deleteMutation.mutate(p.id)}
                          disabled={deleteMutation.isPending || deleteMutation.isLoading}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Create Program Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Training Program</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="prog-title">Title *</Label>
              <Input
                id="prog-title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Leadership Essentials"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prog-desc">Description</Label>
              <Textarea
                id="prog-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prog-start">Start Date *</Label>
                <Input
                  id="prog-start"
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prog-dur">Duration (days)</Label>
                <Input
                  id="prog-dur"
                  type="number"
                  min={1}
                  value={form.duration_days}
                  onChange={(e) => setForm({ ...form, duration_days: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">In-Person</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prog-max">Max Participants (0 = unlimited)</Label>
                <Input
                  id="prog-max"
                  type="number"
                  min={0}
                  value={form.max_participants}
                  onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prog-trainer">Trainer Name</Label>
              <Input
                id="prog-trainer"
                value={form.trainer_name}
                onChange={(e) => setForm({ ...form, trainer_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || createMutation.isLoading}>
                {createMutation.isPending || createMutation.isLoading ? "Creating..." : "Create Program"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Enroll Dialog */}
      <Dialog open={bulkModal !== null} onOpenChange={() => { setBulkModal(null); setBulkDept(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Enroll by Department</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Select Department</Label>
              <Select value={bulkDept} onValueChange={setBulkDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkModal(null); setBulkDept(""); }}>
              Cancel
            </Button>
            <Button
              disabled={!bulkDept || bulkMutation.isPending || bulkMutation.isLoading}
              onClick={() => bulkMutation.mutate()}
            >
              {bulkMutation.isPending || bulkMutation.isLoading ? "Enrolling..." : "Enroll All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
