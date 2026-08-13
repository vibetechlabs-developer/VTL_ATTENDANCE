// src/pages/payroll/SalaryStructurePage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings2, User, Plus, Save, ChevronDown, ChevronUp, Banknote,
  Trash2, Building2, AlertCircle, CheckCircle2, Search
} from "lucide-react";
import axios from "@/api/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ---- API helpers ----
const fetchAllEmployees = () => axios.get("/api/users/employees/").then(r => r.data);
const fetchComponents = () => axios.get("/api/payroll/salary-components/").then(r => r.data);
const fetchStructures = () => axios.get("/api/payroll/salary-structures/").then(r => r.data);
const upsertStructure = (payload: any) =>
  axios.post("/api/payroll/salary-structures/upsert/", payload);
const createComponent = (payload: any) =>
  axios.post("/api/payroll/salary-components/", payload);

// ---- Types ----
interface Component {
  id: number;
  name: string;
  component_type: "earning" | "deduction";
  calculation_type: "fixed" | "percentage";
  percentage_of: number | null;
  percentage_of_name?: string;
}

interface StructureRow {
  component_id: number;
  value: number;
}

export default function SalaryStructurePage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [structureRows, setStructureRows] = useState<StructureRow[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // New Component Dialog
  const [compDialog, setCompDialog] = useState(false);
  const [newComp, setNewComp] = useState({
    name: "",
    component_type: "earning",
    calculation_type: "fixed",
    percentage_of: "",
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["all-employees"],
    queryFn: fetchAllEmployees,
    select: (d) => (Array.isArray(d) ? d : d?.results || []),
  });

  const { data: components = [] } = useQuery<Component[]>({
    queryKey: ["salary-components"],
    queryFn: fetchComponents,
    select: (d) => (Array.isArray(d) ? d : d?.results || []),
  });

  const { data: structures = [] } = useQuery({
    queryKey: ["salary-structures"],
    queryFn: fetchStructures,
    select: (d) => (Array.isArray(d) ? d : d?.results || []),
  });

  // Load existing structure when employee is selected
  useEffect(() => {
    if (!selectedEmp) return;
    const existing = structures.find((s: any) => s.employee === selectedEmp.id);
    if (existing) {
      setEffectiveFrom(existing.effective_from || new Date().toISOString().slice(0, 10));
      setStructureRows(
        (existing.components || []).map((c: any) => ({
          component_id: c.component,
          value: Number(c.value),
        }))
      );
    } else {
      setStructureRows([]);
      setEffectiveFrom(new Date().toISOString().slice(0, 10));
    }
  }, [selectedEmp, structures]);

  const saveMutation = useMutation({
    mutationFn: upsertStructure,
    onSuccess: () => {
      toast.success(`Salary structure saved for ${selectedEmp?.name}!`);
      queryClient.invalidateQueries({ queryKey: ["salary-structures"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to save salary structure.");
    },
  });

  const createCompMutation = useMutation({
    mutationFn: createComponent,
    onSuccess: () => {
      toast.success("Salary component created!");
      queryClient.invalidateQueries({ queryKey: ["salary-components"] });
      setCompDialog(false);
      setNewComp({ name: "", component_type: "earning", calculation_type: "fixed", percentage_of: "" });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to create component.");
    },
  });

  const handleSave = () => {
    if (!selectedEmp) return toast.error("Please select an employee first.");
    saveMutation.mutate({
      employee_id: selectedEmp.id,
      effective_from: effectiveFrom,
      components: structureRows.map((r) => ({
        component_id: r.component_id,
        value: r.value,
      })),
    });
  };

  const addRow = () => {
    if (components.length === 0) return;
    const firstComp = components[0];
    setStructureRows((prev) => [
      ...prev,
      { component_id: firstComp.id, value: 0 },
    ]);
  };

  const removeRow = (idx: number) => {
    setStructureRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof StructureRow, val: any) => {
    setStructureRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r))
    );
  };

  const filteredEmployees = employees.filter((e: any) =>
    (e.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const hasStructure = (empId: number) =>
    structures.some((s: any) => s.employee === empId);

  const earnings = components.filter((c) => c.component_type === "earning");
  const deductions = components.filter((c) => c.component_type === "deduction");

  const totalEarnings = structureRows
    .filter((r) => components.find((c) => c.id === r.component_id)?.component_type === "earning")
    .reduce((acc, r) => acc + Number(r.value || 0), 0);

  const totalDeductions = structureRows
    .filter((r) => components.find((c) => c.id === r.component_id)?.component_type === "deduction")
    .reduce((acc, r) => acc + Number(r.value || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-emerald-500" />
            Salary Structure Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure component-wise salary breakdowns for each employee.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => setCompDialog(true)}
        >
          <Plus className="h-4 w-4" />
          Add Salary Component
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Employee List */}
        <Card className="border border-border/40 shadow-sm lg:col-span-1">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Employees ({employees.length})
            </CardTitle>
            <div className="relative mt-2">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            {filteredEmployees.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No employees found.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredEmployees.map((emp: any) => {
                  const configured = hasStructure(emp.id);
                  const isSelected = selectedEmp?.id === emp.id;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmp(emp)}
                      className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? "bg-emerald-500/10 border-l-2 border-emerald-500"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {emp.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {emp.department} · {emp.designation || "Staff"}
                        </div>
                        {emp.salary && (
                          <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                            CTC: ₹{Number(emp.salary).toLocaleString("en-IN")}
                          </div>
                        )}
                      </div>
                      {configured ? (
                        <Badge variant="outline" className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Set
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground gap-1">
                          <AlertCircle className="h-2.5 w-2.5" />
                          None
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Structure Editor */}
        <Card className="border border-border/40 shadow-sm lg:col-span-2">
          {!selectedEmp ? (
            <div className="flex flex-col items-center justify-center h-full min-h-64 text-center p-8 gap-3">
              <Building2 className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">
                Select an employee on the left to configure their salary structure.
              </p>
            </div>
          ) : (
            <>
              <CardHeader className="border-b border-border/40 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      {selectedEmp.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedEmp.department} · {selectedEmp.designation || "Staff"}
                    </p>
                    {selectedEmp.salary && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Employee CTC/Salary field: ₹{Number(selectedEmp.salary || 0).toLocaleString("en-IN")}
                        <span className="text-muted-foreground ml-1">(used as fallback if no structure set)</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div>
                      <Label className="text-xs text-muted-foreground">Effective From</Label>
                      <Input
                        type="date"
                        value={effectiveFrom}
                        onChange={(e) => setEffectiveFrom(e.target.value)}
                        className="h-8 text-sm w-36"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-3 bg-muted/20 p-3 rounded-lg border border-border/30 text-xs">
                  <div className="text-center">
                    <div className="text-muted-foreground">Gross Earnings</div>
                    <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      ₹{totalEarnings.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-center border-x border-border/30">
                    <div className="text-muted-foreground">Total Deductions</div>
                    <div className="font-bold text-sm text-rose-600 dark:text-rose-400">
                      ₹{totalDeductions.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">Net Pay</div>
                    <div className="font-bold text-sm text-foreground">
                      ₹{(totalEarnings - totalDeductions).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>

                {/* Component Rows */}
                <div className="space-y-2">
                  {structureRows.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border/40 rounded-lg">
                      No components added yet. Click "Add Row" to start building the salary structure.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {structureRows.map((row, idx) => {
                        const comp = components.find((c) => c.id === row.component_id);
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-muted/10 border border-border/30 rounded-lg"
                          >
                            <div className="flex-1">
                              <Select
                                value={String(row.component_id)}
                                onValueChange={(v) => updateRow(idx, "component_id", Number(v))}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select component" />
                                </SelectTrigger>
                                <SelectContent>
                                  {earnings.length > 0 && (
                                    <>
                                      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Earnings</div>
                                      {earnings.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                          {c.name} ({c.calculation_type})
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                  {deductions.length > 0 && (
                                    <>
                                      <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide mt-1">Deductions</div>
                                      {deductions.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                          {c.name} ({c.calculation_type})
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="w-40">
                              <div className="relative">
                                <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">
                                  {comp?.calculation_type === "percentage" ? "%" : "₹"}
                                </span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="pl-6 h-8 text-sm"
                                  value={row.value}
                                  onChange={(e) => updateRow(idx, "value", Number(e.target.value))}
                                />
                              </div>
                            </div>

                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${
                                comp?.component_type === "earning"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                              }`}
                            >
                              {comp?.component_type || "—"}
                            </Badge>

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-rose-500 shrink-0"
                              onClick={() => removeRow(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={addRow}
                    disabled={components.length === 0}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                  </Button>

                  <Button
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    <Save className="h-4 w-4" />
                    {saveMutation.isPending ? "Saving..." : "Save Structure"}
                  </Button>
                </div>

                {components.length === 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      No salary components found. Click <strong>"Add Salary Component"</strong> in the top-right to create components like Basic Salary, HRA, PF, etc.
                    </span>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Create Component Dialog */}
      <Dialog open={compDialog} onOpenChange={setCompDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-500" />
              New Salary Component
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Component Name</Label>
              <Input
                placeholder="e.g. Basic Salary, HRA, PF..."
                value={newComp.name}
                onChange={(e) => setNewComp((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <Select
                  value={newComp.component_type}
                  onValueChange={(v) => setNewComp((p) => ({ ...p, component_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earning">Earning</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Calculation</Label>
                <Select
                  value={newComp.calculation_type}
                  onValueChange={(v) => setNewComp((p) => ({ ...p, calculation_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newComp.calculation_type === "percentage" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Percentage of Component</Label>
                <Select
                  value={newComp.percentage_of}
                  onValueChange={(v) => setNewComp((p) => ({ ...p, percentage_of: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select base component..." />
                  </SelectTrigger>
                  <SelectContent>
                    {components.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCompDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!newComp.name || createCompMutation.isPending}
              onClick={() =>
                createCompMutation.mutate({
                  name: newComp.name,
                  component_type: newComp.component_type,
                  calculation_type: newComp.calculation_type,
                  percentage_of: newComp.percentage_of ? Number(newComp.percentage_of) : null,
                })
              }
            >
              {createCompMutation.isPending ? "Creating..." : "Create Component"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
