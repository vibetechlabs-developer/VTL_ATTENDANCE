// src/pages/performance/CyclesList.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Plus, Users, Building2, Globe, ChevronDown } from "lucide-react";
import { fetchCycles, createCycle } from "@/api/performance";
import { fetchEmployees, fetchDepartments } from "@/api/employees";
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

const TARGET_TYPES = [
  { value: "all", label: "All Employees", icon: Globe },
  { value: "department", label: "Specific Department", icon: Building2 },
  { value: "employees", label: "Specific Employees", icon: Users },
];

export default function CyclesList() {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    start_date: "",
    end_date: "",
    target_type: "all",
    target_department: "",
    target_employee_ids: [] as number[],
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["cycles"],
    queryFn: () => fetchCycles().then((res) => res.data),
  });

  const { data: employeesData } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => fetchEmployees({ limit: 200 }).then((res) => res.data),
    enabled: form.target_type === "employees",
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments-list"],
    queryFn: () => fetchDepartments().then((res) => res.data),
    enabled: form.target_type === "department",
  });

  const cycleList = Array.isArray(data) ? data : data?.results || [];
  const employeeList = Array.isArray(employeesData) ? employeesData : employeesData?.results || [];
  const departmentList = Array.isArray(departmentsData) ? departmentsData : departmentsData?.results || [];

  const mutation = useMutation({
    mutationFn: (payload: any) => createCycle(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Appraisal cycle created successfully");
      setOpenModal(false);
      setForm({ name: "", description: "", start_date: "", end_date: "", target_type: "all", target_department: "", target_employee_ids: [] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || "Failed to create cycle");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: form.name,
      description: form.description,
      start_date: form.start_date,
      end_date: form.end_date,
      target_type: form.target_type,
    };
    if (form.target_type === "department") payload.target_department = form.target_department;
    if (form.target_type === "employees") payload.target_employee_ids = form.target_employee_ids;
    mutation.mutate(payload);
  };

  const toggleEmployee = (id: number) => {
    setForm((f) => ({
      ...f,
      target_employee_ids: f.target_employee_ids.includes(id)
        ? f.target_employee_ids.filter((x) => x !== id)
        : [...f.target_employee_ids, id],
    }));
  };

  const getTargetBadge = (cycle: any) => {
    if (cycle.target_type === "department" && cycle.target_department)
      return `Dept: ${cycle.target_department}`;
    if (cycle.target_type === "employees" && cycle.target_employee_names?.length)
      return `${cycle.target_employee_names.length} employees`;
    return "All Employees";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" />
            Appraisal Cycles
          </h1>
          <p className="text-sm text-muted-foreground">Manage organizational performance evaluation timelines and active cycles.</p>
        </div>
        <Button onClick={() => setOpenModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Cycle
        </Button>
      </div>

      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading cycles...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load appraisal cycles.</div>
          ) : cycleList.length === 0 ? (
            <div className="py-12">
              <EmptyState title="No Appraisal Cycles" message="No performance appraisal cycles found. Click 'Create Cycle' to start a new period." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Target Scope</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycleList.map((cycle: any) => (
                  <TableRow key={cycle.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-foreground">{cycle.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{cycle.description || "—"}</TableCell>
                    <TableCell>{cycle.start_date || "N/A"}</TableCell>
                    <TableCell>{cycle.end_date || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs gap-1">
                        {cycle.target_type === "all" && <Globe className="h-3 w-3" />}
                        {cycle.target_type === "department" && <Building2 className="h-3 w-3" />}
                        {cycle.target_type === "employees" && <Users className="h-3 w-3" />}
                        {getTargetBadge(cycle)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cycle.status === "active" ? "default" : "secondary"}>
                        {cycle.status === "active" ? "Active" : "Closed"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Cycle Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              Create Appraisal Cycle
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 py-2">
            {/* Cycle Name */}
            <div className="space-y-2">
              <Label htmlFor="cycle-name">Cycle Name <span className="text-red-500">*</span></Label>
              <Input
                id="cycle-name"
                required
                placeholder="e.g. Q3 2026 Performance Review"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="cycle-desc">Description</Label>
              <Textarea
                id="cycle-desc"
                rows={2}
                placeholder="Brief purpose or objectives of this appraisal cycle..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date <span className="text-red-500">*</span></Label>
                <Input
                  id="start_date"
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date <span className="text-red-500">*</span></Label>
                <Input
                  id="end_date"
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            {/* Target Scope */}
            <div className="space-y-3 bg-muted/30 rounded-xl border border-border/50 p-4">
              <Label className="font-semibold">Target Scope — Who is this cycle for?</Label>
              <div className="grid grid-cols-3 gap-3">
                {TARGET_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, target_type: value, target_department: "", target_employee_ids: [] })}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 text-xs font-semibold transition-all ${
                      form.target_type === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 text-muted-foreground hover:border-primary/40 hover:bg-muted/20"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Department Selector */}
              {form.target_type === "department" && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="target-dept">Select Department <span className="text-red-500">*</span></Label>
                  <Select
                    value={form.target_department}
                    onValueChange={(val) => setForm({ ...form, target_department: val })}
                  >
                    <SelectTrigger id="target-dept">
                      <SelectValue placeholder="Choose department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentList.length > 0
                        ? departmentList.map((dept: any) => (
                            <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                          ))
                        : ["Engineering", "HR", "Sales", "Marketing", "Operations", "Finance"].map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Employee Multi-Select */}
              {form.target_type === "employees" && (
                <div className="space-y-2 pt-1">
                  <Label>Select Employees <span className="text-red-500">*</span></Label>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 divide-y divide-border/20">
                    {employeeList.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">Loading employees...</div>
                    ) : (
                      employeeList.map((emp: any) => (
                        <label
                          key={emp.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={form.target_employee_ids.includes(emp.id)}
                            onChange={() => toggleEmployee(emp.id)}
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.department || "General"} · {emp.designation || emp.role || ""}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  {form.target_employee_ids.length > 0 && (
                    <p className="text-xs text-primary font-medium">{form.target_employee_ids.length} employee(s) selected</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating..." : "Create Cycle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
