// src/pages/payroll/PayslipsList.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Banknote, Calendar, Download, Eye, Plus, CheckCircle2, Clock, Search, Filter, RefreshCw
} from "lucide-react";
import { fetchPayslips, generatePayrollRun, finalizePayrollRun, fetchPayrollRuns } from "@/api/payroll";
import { useAuthStore, userHasRole } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import PayslipViewModal from "@/components/payroll/PayslipViewModal";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export default function PayslipsList() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdminOrHR = userHasRole(user, "admin") || userHasRole(user, "hr");

  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);

  // Modal for HR payroll generation
  const [genModal, setGenModal] = useState(false);
  const [genMonth, setGenMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [genYear, setGenYear] = useState<string>(String(new Date().getFullYear()));

  // Fetch payslips query
  const { data, isLoading, error } = useQuery({
    queryKey: ["payslips", isAdminOrHR ? "all" : "mine", selectedMonth, selectedYear],
    queryFn: () =>
      fetchPayslips({
        scope: isAdminOrHR ? undefined : "mine",
        month: selectedMonth !== "all" ? selectedMonth : undefined,
        year: selectedYear,
      }).then((res) => res.data),
  });

  const payslips = Array.isArray(data) ? data : data?.results || [];

  const filtered = payslips.filter((p: any) => {
    const s = search.toLowerCase();
    const empName = (p.employee_name || "").toLowerCase();
    return empName.includes(s);
  });

  // Payroll generation mutation
  const generateMutation = useMutation({
    mutationFn: generatePayrollRun,
    onSuccess: (res: any) => {
      toast.success(res.data?.message || "Payroll run generated successfully!");
      queryClient.invalidateQueries({ queryKey: ["payslips"] });
      setGenModal(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Failed to generate payroll run");
    },
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    generateMutation.mutate({
      month: Number(genMonth),
      year: Number(genYear),
    });
  };

  // Stats calculation
  const totalGross = payslips.reduce((acc: number, p: any) => acc + Number(p.gross_earnings || 0), 0);
  const totalNet = payslips.reduce((acc: number, p: any) => acc + Number(p.net_pay || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Banknote className="h-6 w-6 text-emerald-500" />
            Salary Slips & Payroll
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdminOrHR
              ? "Generate monthly payroll runs and view employee salary slips."
              : "View and download your monthly official salary slips."}
          </p>
        </div>

        {isAdminOrHR && (
          <Button onClick={() => setGenModal(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" />
            Generate Monthly Payroll
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-border/40 shadow-sm bg-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{payslips.length}</div>
              <div className="text-xs text-muted-foreground">Total Salary Slips</div>
            </div>
          </CardContent>
        </Card>

        {isAdminOrHR && (
          <>
            <Card className="border border-border/40 shadow-sm bg-card">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400 shrink-0">
                  <Banknote className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">
                    ₹{totalGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Gross Earnings</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/40 shadow-sm bg-card">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 shrink-0">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{totalNet.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Net Disbursement</div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {isAdminOrHR && (
          <div className="relative max-w-xs flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by employee name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table / Cards */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-0 border-b border-border/40">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Salary Slips ({filtered.length})</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["payslips"] })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading salary slips...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Failed to load salary slips.</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground space-y-2">
              <Banknote className="h-8 w-8 mx-auto opacity-30" />
              <p>No salary slips found for the selected period.</p>
              {isAdminOrHR && (
                <Button size="sm" variant="outline" onClick={() => setGenModal(true)}>
                  Generate Payroll Now
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {isAdminOrHR && <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Employee</th>}
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Period</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Gross Earnings</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Deductions</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Net Pay</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map((p: any) => {
                  const monthName = MONTHS.find((m) => m.value === String(p.month))?.label || p.month;
                  return (
                    <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                      {isAdminOrHR && (
                        <td className="px-5 py-3.5 font-semibold text-foreground">
                          {p.employee_name || `Employee #${p.employee}`}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-muted-foreground font-medium">
                        {monthName} {p.year}
                      </td>
                      <td className="px-5 py-3.5 text-foreground font-medium">
                        ₹{Number(p.gross_earnings || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-3.5 text-rose-500 font-medium">
                        ₹{Number(p.total_deductions || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{Number(p.net_pay || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Generated
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs"
                          onClick={() => setSelectedPayslip(p)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Salary Slip
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Generate Payroll Dialog for HR */}
      <Dialog open={genModal} onOpenChange={setGenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-500" />
              Generate Monthly Payroll Run
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGenerate} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Month</Label>
                <Select value={genMonth} onValueChange={setGenMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Select Year</Label>
                <Select value={genYear} onValueChange={setGenYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-muted/20 border border-border/40 rounded-lg text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">What this does:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Calculates employee base earnings, allowances & deductions.</li>
                <li>Prorates pay for LOP (Loss of Pay) leave days.</li>
                <li>Generates official printable salary slips with Vibe Tech Labs logo.</li>
              </ul>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGenModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={generateMutation.isPending || generateMutation.isLoading}
              >
                {generateMutation.isPending || generateMutation.isLoading ? "Generating..." : "Generate Payroll"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payslip View & Print Modal */}
      <PayslipViewModal
        open={selectedPayslip !== null}
        onOpenChange={(open) => !open && setSelectedPayslip(null)}
        payslip={selectedPayslip}
      />
    </div>
  );
}
