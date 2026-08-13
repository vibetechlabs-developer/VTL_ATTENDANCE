// src/components/payroll/PayslipViewModal.tsx
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Building2 } from "lucide-react";

interface PayslipViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payslip: any;
}

// Convert numbers to Indian Rupees words
function numberToWords(num: number): string {
  if (!num || isNaN(num)) return "Zero Rupees Only";
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty ", "Thirty ", "Forty ", "Fifty ", "Sixty ", "Seventy ", "Eighty ", "Ninety "];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + a[n % 10];
    if (n < 1000) return inWords(Math.floor(n / 100)) + "Hundred " + inWords(n % 100);
    if (n < 100000) return inWords(Math.floor(n / 1000)) + "Thousand " + inWords(n % 1000);
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + "Lakh " + inWords(n % 100000);
    return inWords(Math.floor(n / 10000000)) + "Crore " + inWords(n % 10000000);
  }

  const integerPart = Math.floor(num);
  const words = inWords(integerPart).trim();
  return words ? `${words} Rupees Only` : "Zero Rupees Only";
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PayslipViewModal({
  open,
  onOpenChange,
  payslip,
}: PayslipViewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!payslip) return null;

  const monthName = MONTH_NAMES[payslip.month] || payslip.month;
  const year = payslip.year;

  // Use enriched fields from improved serializer
  const empName = payslip.employee_name || "N/A";
  const empCode = `VTL-${String(payslip.employee || "").padStart(4, "0")}`;
  const department = payslip.employee_department || "General";
  const designation = payslip.employee_designation || "Staff";
  const bankAccount = payslip.employee_bank_account || "Confidential";
  const bankName = payslip.employee_bank_name || "";
  const panNumber = payslip.employee_pan || "";

  // Extract breakdown
  const rawBreakdown = Array.isArray(payslip.breakdown) ? payslip.breakdown : [];
  const earnings = rawBreakdown.filter((item: any) => item.component_type === "earning");
  const deductions = rawBreakdown.filter((item: any) => item.component_type === "deduction");

  const grossEarnings = Number(payslip.gross_earnings || 0);
  const totalDeductions = Number(payslip.total_deductions || 0);
  const netPay = Number(payslip.net_pay || 0);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Salary_Slip_${empName.replace(/ /g, "_")}_${monthName}_${year}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #111; background: #fff; }
            .payslip-box { border: 2px solid #059669; padding: 28px; max-width: 820px; margin: 0 auto; border-radius: 6px; }
            .header-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 14px; margin-bottom: 20px; }
            .logo-img { height: 52px; object-fit: contain; }
            .company-name { font-size: 22px; font-weight: 700; color: #059669; }
            .company-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
            .doc-title { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #374151; text-align: right; }
            .doc-period { font-size: 13px; color: #6b7280; text-align: right; margin-top: 3px; }
            .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .info-table td { padding: 7px 12px; border: 1px solid #d1fae5; font-size: 12.5px; }
            .info-label { font-weight: 600; color: #065f46; background-color: #f0fdf4; width: 20%; }
            .info-val { color: #111827; width: 30%; }
            .section-title { font-size: 13px; font-weight: 700; background: #059669; color: white; padding: 7px 12px; margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.5px; }
            .breakdown-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .breakdown-table th { background-color: #d1fae5; color: #065f46; padding: 8px 12px; font-size: 12px; text-align: left; border: 1px solid #a7f3d0; }
            .breakdown-table td { padding: 8px 12px; border: 1px solid #e5e7eb; font-size: 12.5px; }
            .amount-col { text-align: right; font-variant-numeric: tabular-nums; }
            .total-row td { font-weight: 700; background-color: #ecfdf5; border-top: 2px solid #059669; }
            .total-deductions td { font-weight: 700; background-color: #fff1f2; border-top: 2px solid #ef4444; }
            .net-box { border: 2px solid #059669; background-color: #ecfdf5; padding: 16px 20px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
            .net-label { font-size: 13px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 1px; }
            .net-words { font-size: 11px; color: #6b7280; font-style: italic; margin-top: 4px; }
            .net-amount { font-size: 26px; font-weight: 900; color: #047857; }
            .footer { font-size: 10.5px; color: #9ca3af; text-align: center; margin-top: 24px; border-top: 1px dashed #d1d5db; padding-top: 12px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="payslip-box">
            ${printContent}
          </div>
          <script>window.onload = function() { window.print(); };<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6 bg-background text-foreground">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-500" />
            Salary Slip — {empName} ({monthName} {year})
          </DialogTitle>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            Print / Save PDF
          </Button>
        </DialogHeader>

        {/* Printable Area */}
        <div ref={printRef} className="space-y-5 pt-3">

          {/* Header: Logo + Title */}
          <div className="header-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b-2 border-emerald-500">
            <div className="flex items-center gap-3">
              <img
                src="/vtl-transperent.png"
                alt="Vibe Tech Labs"
                className="logo-img h-12 w-auto object-contain"
              />
              <div>
                <div className="company-name text-xl font-bold text-emerald-600">Vibe Tech Labs</div>
                <div className="company-sub text-[11px] text-muted-foreground">Smart HR & Attendance Platform</div>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="doc-title text-base font-bold uppercase tracking-wider text-foreground">Official Salary Slip</div>
              <div className="doc-period text-sm text-muted-foreground mt-0.5">{monthName} {year}</div>
              <Badge variant="outline" className="mt-1.5 text-[11px] bg-emerald-500/10 text-emerald-600 border-emerald-500/25">
                {payslip.payroll_status === "locked" ? "✓ Finalized & Paid" : "Generated"}
              </Badge>
            </div>
          </div>

          {/* Employee Info Grid */}
          <table className="info-table w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">Employee Name</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium">{empName}</td>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">Employee Code</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium">{empCode}</td>
              </tr>
              <tr>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">Department</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium capitalize">{department}</td>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">Designation</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium capitalize">{designation}</td>
              </tr>
              <tr>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">Pay Period</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium">{monthName} {year}</td>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">LOP Days</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium">{payslip.lop_days || 0} days</td>
              </tr>
              <tr>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">Bank Account</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium">{bankAccount}{bankName ? ` (${bankName})` : ""}</td>
                <td className="info-label px-3 py-2 font-semibold text-emerald-700 bg-emerald-50/50 border border-emerald-100">PAN Number</td>
                <td className="info-val px-3 py-2 border border-emerald-100 font-medium">{panNumber || "—"}</td>
              </tr>
            </tbody>
          </table>

          {/* Earnings vs Deductions Table */}
          <div className="breakdown-table border border-border/40 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-emerald-600 text-white font-semibold">
                  <th className="py-2.5 px-4 text-left w-[38%]">Earnings Component</th>
                  <th className="py-2.5 px-4 text-right w-[12%]">Amount (₹)</th>
                  <th className="py-2.5 px-4 text-left w-[38%] border-l border-emerald-500">Deductions Component</th>
                  <th className="py-2.5 px-4 text-right w-[12%]">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {Array.from({ length: Math.max(earnings.length, deductions.length, 1) }).map((_, idx) => {
                  const earn = earnings[idx];
                  const ded = deductions[idx];
                  return (
                    <tr key={idx} className="hover:bg-muted/10">
                      <td className="py-2 px-4 text-foreground">
                        {earn ? earn.component_name : "—"}
                      </td>
                      <td className="py-2 px-4 text-right font-medium text-foreground tabular-nums">
                        {earn ? `₹${Number(earn.final_value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="py-2 px-4 text-foreground border-l border-border/30">
                        {ded ? ded.component_name : "—"}
                      </td>
                      <td className="py-2 px-4 text-right font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                        {ded ? `₹${Number(ded.final_value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="bg-muted/30 font-bold border-t-2 border-border/50">
                  <td className="py-3 px-4 text-foreground">Gross Earnings</td>
                  <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ₹{grossEarnings.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-foreground border-l border-border/40">Total Deductions</td>
                  <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 tabular-nums">
                    ₹{totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Pay */}
          <div className="net-box bg-emerald-500/10 border-2 border-emerald-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="net-label text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                Net Salary Payable
              </span>
              <span className="net-words text-xs text-muted-foreground italic block mt-1">
                {payslip.net_pay_in_words || numberToWords(netPay)}
              </span>
            </div>
            <div className="net-amount text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
              ₹{netPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Employer Contributions & YTD Summary */}
          {(Number(payslip.ytd_gross || 0) > 0 || Number(payslip.employer_pf || 0) > 0) && (
            <div className="border border-border/40 rounded-lg overflow-hidden text-xs">
              <div className="bg-emerald-600 text-white font-semibold px-4 py-2 uppercase text-[11px] tracking-wider">
                Employer Contributions & YTD Summary
              </div>
              <table className="w-full">
                <thead className="bg-muted/30 text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-2 px-4 text-left">Employer Contribution</th>
                    <th className="py-2 px-4 text-right">Amount (₹)</th>
                    <th className="py-2 px-4 text-left border-l border-border/30">YTD Component</th>
                    <th className="py-2 px-4 text-right">YTD Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  <tr>
                    <td className="py-2 px-4">Employer PF (12%)</td>
                    <td className="py-2 px-4 text-right font-medium">₹{Number(payslip.employer_pf || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-4 border-l border-border/20">YTD Gross Earnings</td>
                    <td className="py-2 px-4 text-right font-medium">₹{Number(payslip.ytd_gross || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4">Employer ESI (3.25%)</td>
                    <td className="py-2 px-4 text-right font-medium">₹{Number(payslip.employer_esi || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-4 border-l border-border/20">YTD PF Contribution</td>
                    <td className="py-2 px-4 text-right font-medium">₹{Number(payslip.ytd_pf || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-4">Employer Gratuity (4.81%)</td>
                    <td className="py-2 px-4 text-right font-medium">₹{Number(payslip.employer_gratuity || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-4 border-l border-border/20">YTD Total Deductions</td>
                    <td className="py-2 px-4 text-right font-medium">₹{Number(payslip.ytd_tds || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="footer text-[11px] text-center text-muted-foreground pt-3 border-t border-dashed border-border/40">
            This is a computer-generated salary slip issued by{" "}
            <strong>Vibe Tech Labs Smart HR System</strong>. No physical signature is required.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
