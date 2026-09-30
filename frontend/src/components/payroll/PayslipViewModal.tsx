// src/components/payroll/PayslipViewModal.tsx
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PayslipDocument, { payslipFileName } from "@/components/payroll/PayslipDocument";

interface PayslipViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payslip: any;
}

const PDF_OPTIONS = {
  margin: [10, 10, 10, 10],
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, logging: false },
  jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
};

export default function PayslipViewModal({
  open,
  onOpenChange,
  payslip,
}: PayslipViewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!payslip) return null;

  const monthName = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"][payslip.month] || payslip.month;
  const year = payslip.year;
  const empName = payslip.employee_name || "N/A";

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!printRef.current || downloading) return;
    setDownloading(true);
    try {
      const html2pdfModule: any = await import("html2pdf.js");
      const html2pdf = html2pdfModule.default || html2pdfModule;
      await html2pdf()
        .set({ ...PDF_OPTIONS, filename: payslipFileName(payslip) })
        .from(printRef.current)
        .save();
      toast.success("Salary slip downloaded successfully.");
    } catch (err) {
      console.error("Payslip PDF generation failed:", err);
      toast.error("Could not generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6 bg-background text-foreground">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/40">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-500" />
            Salary Slip — {empName} ({monthName} {year})
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </Button>
          </div>
        </DialogHeader>

        {/* Printable / downloadable area */}
        <div id="payslip-print-area" className="mt-3 rounded-xl border border-border/40 overflow-hidden">
          <PayslipDocument ref={printRef} payslip={payslip} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
