import React, { useRef } from "react";
import { Printer, Download, Building2, ShieldCheck, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MncLetterDocumentProps {
  templateName?: string;
  employeeName?: string;
  employeeCode?: string;
  designation?: string;
  department?: string;
  date?: string;
  refNumber?: string;
  content: string;
  onClose?: () => void;
  showActions?: boolean;
}

export const MncLetterDocument: React.FC<MncLetterDocumentProps> = ({
  templateName = "Official Document",
  employeeName = "Employee",
  employeeCode = "VTL-EMP",
  designation = "Team Member",
  department = "General",
  date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
  refNumber,
  content,
  showActions = true,
}) => {
  const documentRef = useRef<HTMLDivElement>(null);

  const calculatedRef = refNumber || `VTL/HR/${new Date().getFullYear()}/${employeeCode || "DOC"}`;

  const handlePrint = () => {
    if (!documentRef.current) return;
    const printContent = documentRef.current.innerHTML;
    const printWindow = window.open("", "_blank", "width=850,height=1100");
    if (!printWindow) {
      toast.error("Please allow popups to print document");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${templateName} - ${employeeName}</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              color: #1a1a1a;
              margin: 0;
              padding: 0;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .letterhead-container {
              max-width: 800px;
              margin: 0 auto;
              padding: 24px;
              box-sizing: border-box;
            }
            .header-flex {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #059669;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .company-brand {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .brand-logo {
              width: 48px;
              height: 48px;
              background: #059669;
              color: #ffffff;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 20px;
            }
            .company-name {
              font-size: 20px;
              font-weight: 800;
              color: #064e3b;
              letter-spacing: 0.5px;
              text-transform: uppercase;
            }
            .company-sub {
              font-size: 11px;
              color: #059669;
              font-weight: 600;
            }
            .company-info {
              text-align: right;
              font-size: 11px;
              color: #4b5563;
              line-height: 1.4;
            }
            .ref-date-bar {
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              color: #374151;
              margin-bottom: 24px;
              font-weight: 600;
            }
            .recipient-block {
              margin-bottom: 24px;
              font-size: 13px;
              color: #1f2937;
              line-height: 1.6;
              background: #f9fafb;
              padding: 12px 16px;
              border-left: 3px solid #059669;
              border-radius: 4px;
            }
            .subject-line {
              font-size: 14px;
              font-weight: 700;
              color: #111827;
              text-decoration: underline;
              margin-bottom: 20px;
              text-align: center;
            }
            .body-text {
              font-size: 13px;
              line-height: 1.8;
              color: #1f2937;
              white-space: pre-wrap;
              margin-bottom: 40px;
            }
            .signatory-section {
              margin-top: 40px;
              font-size: 13px;
            }
            .stamp-box {
              margin-top: 12px;
              margin-bottom: 12px;
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .stamp-badge {
              border: 2px dashed #059669;
              color: #059669;
              font-weight: bold;
              font-size: 11px;
              padding: 6px 14px;
              border-radius: 6px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .footer-bar {
              margin-top: 50px;
              border-top: 1px solid #e5e7eb;
              padding-top: 12px;
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="letterhead-container">
            ${printContent}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  const handleDownloadPdf = async () => {
    if (!documentRef.current) return;
    toast.info("Preparing high-quality PDF...");

    try {
      // @ts-ignore
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const element = documentRef.current;
      const safeFileName = `${templateName.replace(/\s+/g, "_")}_${employeeName.replace(/\s+/g, "_")}.pdf`;

      const opt = {
        margin: [12, 12, 12, 12],
        filename: safeFileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      await html2pdf().set(opt).from(element).save();
      toast.success(`PDF downloaded: ${safeFileName}`);
    } catch (err) {
      console.error("PDF generation error, falling back to print dialog:", err);
      handlePrint();
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      {showActions && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border border-border/50">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>MNC Standard Formatted HR Document</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <Button size="sm" onClick={handleDownloadPdf} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
        </div>
      )}

      {/* Printable Corporate Document Card */}
      <div className="bg-white text-slate-900 dark:bg-white dark:text-slate-900 p-8 sm:p-12 rounded-xl border shadow-md font-sans max-w-4xl mx-auto overflow-hidden">
        <div ref={documentRef} className="space-y-6">
          {/* Company Letterhead Header */}
          <div className="flex justify-between items-start border-b-2 border-emerald-600 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-xl shadow-sm">
                VTL
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">
                  Vibe Tech Labs Pvt. Ltd.
                </h2>
                <p className="text-xs font-semibold text-emerald-600">A Digital Idea To Grow You Up</p>
                <p className="text-[10px] text-slate-500">CIN: U72900GJ2024PTC123456</p>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-600 leading-tight space-y-0.5">
              <p className="font-semibold text-slate-800">Corporate HQ Office</p>
              <p>101-105, Corporate Tech Park, SG Highway</p>
              <p>Ahmedabad, Gujarat 380054, India</p>
              <p className="text-emerald-700 font-medium">hr@vibetechlabs.com | www.vibetechlabs.com</p>
              <p>Phone: +91 79 4000 8800</p>
            </div>
          </div>

          {/* Document Reference & Date Bar */}
          <div className="flex justify-between items-center text-xs text-slate-700 font-semibold bg-slate-50 p-2.5 rounded-md border border-slate-200">
            <div>
              <span className="text-slate-500">Ref No: </span>
              <span className="font-mono text-slate-900">{calculatedRef}</span>
            </div>
            <div>
              <span className="text-slate-500">Date: </span>
              <span className="text-slate-900">{date}</span>
            </div>
          </div>

          {/* Addressee Info Card */}
          <div className="bg-slate-50/80 p-4 rounded-lg border-l-4 border-emerald-600 border-y border-r border-slate-200 text-xs leading-relaxed space-y-1">
            <p className="font-semibold text-slate-500 uppercase text-[10px]">Addressee Details:</p>
            <p className="text-sm font-bold text-slate-900">{employeeName}</p>
            <p className="text-slate-700">
              <span className="font-medium text-slate-500">Employee ID:</span> {employeeCode}
            </p>
            <p className="text-slate-700">
              <span className="font-medium text-slate-500">Designation:</span> {designation}
            </p>
            <p className="text-slate-700">
              <span className="font-medium text-slate-500">Department:</span> {department}
            </p>
          </div>

          {/* Subject Line */}
          <div className="text-center font-bold text-sm text-slate-900 underline underline-offset-4 tracking-wide py-1">
            {templateName.toUpperCase()}
          </div>

          {/* Document Body Text */}
          <div className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans py-2 min-h-[220px]">
            {content}
          </div>

          {/* Signatory & Corporate Stamp Seal */}
          <div className="pt-6 border-t border-slate-200 space-y-3">
            <p className="text-xs text-slate-700 font-medium">Yours Sincerely,</p>
            <p className="text-xs font-bold text-slate-900">For Vibe Tech Labs Pvt. Ltd.</p>

            <div className="flex items-center gap-4 py-2">
              <div className="border-2 border-dashed border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-md px-3 py-1.5 text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5 shadow-xs">
                <FileCheck className="h-4 w-4" />
                VTL HR SEAL & VERIFIED
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-900">Head of Human Resources</p>
              <p className="text-[11px] text-slate-500">Authorized Signatory • HR Department</p>
            </div>
          </div>

          {/* Corporate Footer Bar */}
          <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500 font-medium">
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-emerald-600" />
              <span>Vibe Tech Labs Pvt. Ltd. | Confidential Enterprise Document</span>
            </div>
            <div>Page 1 of 1</div>
          </div>
        </div>
      </div>
    </div>
  );
};
