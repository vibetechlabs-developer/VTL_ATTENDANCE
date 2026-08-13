// src/pages/performance/GoalsBoard.tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Plus } from "lucide-react";
import { fetchGoals, createGoal, fetchActiveCycle } from "@/api/performance";
import { fetchEmployees } from "@/api/employees";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

const emptyForm = {
  employee: "",
  title: "",
  description: "",
  target_metric: "",
  weightage: 20,
};

export default function GoalsBoard() {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: activeCycle, isLoading: loadingCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: () => fetchActiveCycle().then((res) => res.data),
    retry: false,
  });

  const { data: employeesData } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchEmployees({ limit: 200 }).then((res) => res.data),
    enabled: openModal,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["goals"],
    queryFn: () => fetchGoals().then((res) => res.data),
  });

  const employeeList = Array.isArray(employeesData) ? employeesData : employeesData?.results || [];
  const goalList = Array.isArray(data) ? data : data?.results || [];

  useEffect(() => {
    if (openModal && employeeList.length === 1 && !form.employee) {
      setForm((f) => ({ ...f, employee: String(employeeList[0].id) }));
    }
  }, [openModal, employeeList, form.employee]);

  const mutation = useMutation({
    mutationFn: (payload: {
      cycle: number;
      employee: number;
      title: string;
      description: string;
      target_metric: string;
      weightage: number;
    }) => createGoal(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Performance goal created successfully");
      setOpenModal(false);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      if (data && typeof data === "object") {
        const msg = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" · ");
        toast.error(msg || "Failed to set goal");
      } else {
        toast.error(data?.detail || "Failed to set goal");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCycle?.id) {
      toast.error("No active appraisal cycle. Create one first under Appraisal Cycles.");
      return;
    }
    if (!form.employee) {
      toast.error("Please select an employee.");
      return;
    }
    mutation.mutate({
      cycle: activeCycle.id,
      employee: Number(form.employee),
      title: form.title.trim(),
      description: form.description.trim(),
      target_metric: form.target_metric.trim(),
      weightage: form.weightage,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Performance Goals
          </h1>
          <p className="text-sm text-muted-foreground">
            Track employee goals, OKRs, weightage, and rating progress.
            {activeCycle?.name && (
              <span className="ml-1">
                Active cycle: <strong>{activeCycle.name}</strong>
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setOpenModal(true)}
          className="gap-2"
          disabled={loadingCycle || !activeCycle?.id}
        >
          <Plus className="h-4 w-4" />
          Set Goal
        </Button>
      </div>

      {!loadingCycle && !activeCycle?.id && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          No active appraisal cycle found. Go to <strong>Appraisal Cycles</strong> and create or activate a cycle before setting goals.
        </div>
      )}

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading goals...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load performance goals.</div>
          ) : goalList.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Goals Set" message="No performance goals registered yet. Click 'Set Goal' to define objectives." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Goal Title</TableHead>
                  <TableHead>Weightage</TableHead>
                  <TableHead>Self Rating</TableHead>
                  <TableHead>Manager Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goalList.map((goal: any) => (
                  <TableRow key={goal.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="text-sm text-muted-foreground">{goal.employee_name || "—"}</TableCell>
                    <TableCell className="font-semibold text-foreground">
                      <div>{goal.title}</div>
                      {goal.description && <div className="text-xs text-muted-foreground">{goal.description}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{goal.weightage || 0}%</Badge>
                    </TableCell>
                    <TableCell>{goal.self_rating ? `${goal.self_rating} / 5` : "Not rated"}</TableCell>
                    <TableCell>{goal.manager_rating ? `${goal.manager_rating} / 5` : "Pending"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Performance Goal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="g-employee">Employee <span className="text-red-500">*</span></Label>
              <Select
                value={form.employee}
                onValueChange={(val) => setForm({ ...form, employee: val })}
              >
                <SelectTrigger id="g-employee">
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employeeList.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.name}{emp.department ? ` · ${emp.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-title">Goal Title / Objective <span className="text-red-500">*</span></Label>
              <Input
                id="g-title"
                required
                placeholder="e.g. Complete HRMS Frontend Migration"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-desc">Description</Label>
              <Textarea
                id="g-desc"
                placeholder="Key result areas and deliverables..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-metric">Target Metric <span className="text-red-500">*</span></Label>
              <Textarea
                id="g-metric"
                required
                rows={2}
                placeholder="e.g. 100% unit tests passing and documentation complete"
                value={form.target_metric}
                onChange={(e) => setForm({ ...form, target_metric: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-weight">Weightage (%) <span className="text-red-500">*</span></Label>
              <Input
                id="g-weight"
                type="number"
                min={1}
                max={100}
                required
                value={form.weightage}
                onChange={(e) => setForm({ ...form, weightage: Number(e.target.value) })}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save Goal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
