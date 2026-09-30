// src/lib/payslipTemplate.ts
//
// Single source of truth for the official salary slip's markup and styling.
// Deliberately built with plain, fixed-layout HTML/CSS (tables with
// table-layout: fixed, explicit column widths, no flexbox) rather than
// Tailwind utility classes. A flexible/auto-sized layout can silently
// overflow its box when captured off-screen for PDF export, and html2canvas
// then rasterizes only the declared box size, clipping everything that
// overflowed off the right edge. Fixed, deterministic layout renders
// identically on screen, in the browser's native print, and inside a
// html2canvas/html2pdf snapshot.
export const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Convert an amount into Indian Rupees words (fallback when the backend
// hasn't supplied `net_pay_in_words`).
export function numberToWords(num: number): string {
  if (!num || isNaN(num)) return "Zero Rupees Only";
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen ",
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

  const words = inWords(Math.floor(num)).trim();
  return words ? `${words} Rupees Only` : "Zero Rupees Only";
}

export function payslipFileName(payslip: any): string {
  const monthName = MONTH_NAMES[payslip?.month] || payslip?.month || "";
  const empName = (payslip?.employee_name || "Employee").replace(/\s+/g, "_");
  return `Salary_Slip_${empName}_${monthName}_${payslip?.year || ""}.pdf`;
}

// Fixed logical width the slip is authored at. A4 content width (210mm minus
// 10mm margins either side) is ~190mm, i.e. ~718px at 96dpi — 700px leaves a
// safety margin so nothing can ever be wide enough to overflow the page.
export const PAYSLIP_DOC_WIDTH = 700;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function formatMoney(value: unknown): string {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds the payslip's inner HTML (to be wrapped in a `.vtl-payslip` container
 * that carries the styling defined alongside this template). Pure string
 * output so it can be used identically for the on-screen preview
 * (dangerouslySetInnerHTML), the browser's native print, and an off-screen
 * html2canvas/html2pdf capture.
 */
export function buildPayslipBodyHtml(payslip: any): string {
  const monthName = MONTH_NAMES[payslip.month] || payslip.month;
  const year = payslip.year;

  const empName = escapeHtml(payslip.employee_name || "N/A");
  const empCode = escapeHtml(`VTL-${String(payslip.employee || "").padStart(4, "0")}`);
  const department = escapeHtml(payslip.employee_department || "General");
  const designation = escapeHtml(payslip.employee_designation || "Staff");
  const bankAccount = escapeHtml(payslip.employee_bank_account || "Confidential");
  const bankName = payslip.employee_bank_name ? ` (${escapeHtml(payslip.employee_bank_name)})` : "";
  const panNumber = escapeHtml(payslip.employee_pan || "—");

  const rawBreakdown = Array.isArray(payslip.breakdown) ? payslip.breakdown : [];
  const earnings = rawBreakdown.filter((item: any) => item.component_type === "earning");
  const deductions = rawBreakdown.filter((item: any) => item.component_type === "deduction");

  const grossEarnings = Number(payslip.gross_earnings || 0);
  const totalDeductions = Number(payslip.total_deductions || 0);
  const netPay = Number(payslip.net_pay || 0);

  const isFinalized = payslip.payroll_status === "locked";
  const rowCount = Math.max(earnings.length, deductions.length, 1);

  const breakdownRows = Array.from({ length: rowCount }).map((_, idx) => {
    const earn = earnings[idx];
    const ded = deductions[idx];
    return `
      <tr>
        <td class="vtl-ps-td">${earn ? escapeHtml(earn.component_name) : "—"}</td>
        <td class="vtl-ps-td vtl-ps-amt">${earn ? formatMoney(earn.final_value) : "—"}</td>
        <td class="vtl-ps-td vtl-ps-col-border">${ded ? escapeHtml(ded.component_name) : "—"}</td>
        <td class="vtl-ps-td vtl-ps-amt vtl-ps-deduction">${ded ? formatMoney(ded.final_value) : "—"}</td>
      </tr>`;
  }).join("");

  return `
    <table class="vtl-ps-header" role="presentation">
      <tr>
        <td class="vtl-ps-header-left">
          <img src="/vtl-transperent.png" alt="Vibe Tech Labs" class="vtl-ps-logo" crossorigin="anonymous" />
          <div class="vtl-ps-brand">
            <div class="vtl-ps-brand-name">Vibe Tech Labs</div>
            <div class="vtl-ps-brand-tag">A Digital Idea To Grow You Up</div>
          </div>
        </td>
        <td class="vtl-ps-header-right">
          <div class="vtl-ps-doc-title">Salary Slip</div>
          <div class="vtl-ps-doc-period">${escapeHtml(monthName)} ${escapeHtml(year)}</div>
          <span class="vtl-ps-badge ${isFinalized ? "vtl-ps-badge-final" : "vtl-ps-badge-draft"}">
            ${isFinalized ? "Finalized &amp; Paid" : "Generated"}
          </span>
        </td>
      </tr>
    </table>

    <table class="vtl-ps-info">
      <tr>
        <td class="vtl-ps-label">Employee Name</td>
        <td class="vtl-ps-val">${empName}</td>
        <td class="vtl-ps-label">Employee Code</td>
        <td class="vtl-ps-val">${empCode}</td>
      </tr>
      <tr>
        <td class="vtl-ps-label">Department</td>
        <td class="vtl-ps-val">${department}</td>
        <td class="vtl-ps-label">Designation</td>
        <td class="vtl-ps-val">${designation}</td>
      </tr>
      <tr>
        <td class="vtl-ps-label">Pay Period</td>
        <td class="vtl-ps-val">${escapeHtml(monthName)} ${escapeHtml(year)}</td>
        <td class="vtl-ps-label">LOP Days</td>
        <td class="vtl-ps-val">${escapeHtml(payslip.lop_days || 0)} days</td>
      </tr>
      <tr>
        <td class="vtl-ps-label">Bank Account</td>
        <td class="vtl-ps-val">${bankAccount}${bankName}</td>
        <td class="vtl-ps-label">PAN Number</td>
        <td class="vtl-ps-val">${panNumber}</td>
      </tr>
    </table>

    <table class="vtl-ps-breakdown">
      <thead>
        <tr>
          <th class="vtl-ps-th">Earnings Component</th>
          <th class="vtl-ps-th vtl-ps-amt">Amount (₹)</th>
          <th class="vtl-ps-th vtl-ps-col-border">Deductions Component</th>
          <th class="vtl-ps-th vtl-ps-amt">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${breakdownRows}
        <tr class="vtl-ps-total-row">
          <td class="vtl-ps-td">Gross Earnings</td>
          <td class="vtl-ps-td vtl-ps-amt vtl-ps-earning">${formatMoney(grossEarnings)}</td>
          <td class="vtl-ps-td vtl-ps-col-border">Total Deductions</td>
          <td class="vtl-ps-td vtl-ps-amt vtl-ps-deduction">${formatMoney(totalDeductions)}</td>
        </tr>
      </tbody>
    </table>

    <table class="vtl-ps-net">
      <tr>
        <td class="vtl-ps-net-left">
          <div class="vtl-ps-net-title">Net Salary Payable</div>
          <div class="vtl-ps-net-words">${escapeHtml(payslip.net_pay_in_words || numberToWords(netPay))}</div>
        </td>
        <td class="vtl-ps-net-right">${formatMoney(netPay)}</td>
      </tr>
    </table>

    <div class="vtl-ps-footer">
      This is a system-generated salary slip and does not require a signature.<br />
      <strong>Vibe Tech Labs</strong> &mdash; Confidential HR Document
    </div>
  `;
}
