// src/components/payroll/PayslipDocument.tsx
//
// Thin React wrapper around the shared payslip HTML template (see
// src/lib/payslipTemplate.ts). Kept as a component so PayslipViewModal can
// hold a ref to the rendered DOM node for Print/Download, but the actual
// markup and styling live in one place, reused for the on-screen view, the
// browser's native print, and direct PDF download.
import { forwardRef } from "react";
import { buildPayslipBodyHtml } from "@/lib/payslipTemplate";

export { MONTH_NAMES, numberToWords, payslipFileName } from "@/lib/payslipTemplate";

interface PayslipDocumentProps {
  payslip: any;
}

const PayslipDocument = forwardRef<HTMLDivElement, PayslipDocumentProps>(
  ({ payslip }, ref) => (
    <div
      ref={ref}
      className="vtl-payslip"
      dangerouslySetInnerHTML={{ __html: buildPayslipBodyHtml(payslip) }}
    />
  )
);

PayslipDocument.displayName = "PayslipDocument";

export default PayslipDocument;
