// src/lib/payslipDownload.tsx
//
// Generates a real, downloadable PDF for a salary slip without requiring the
// PayslipViewModal to be open — used by the row-level "Download" action on
// the salary slips list. Builds the same fixed-layout markup used everywhere
// else (see payslipTemplate.ts) and hands it to html2pdf.js (already used
// elsewhere in the app for letter/document PDFs).
//
// Important: the node passed to html2canvas (inside html2pdf) must stay in
// normal document flow. html2canvas cannot reliably measure an element that
// is itself positioned `fixed`/`absolute` and pushed off-screen — it
// silently measures it as zero height, producing a blank PDF with no error.
// So the payslip node itself is left unpositioned; it's a zero-size,
// overflow-hidden *wrapper* around it that keeps it off-screen instead.
import { buildPayslipBodyHtml, payslipFileName } from "@/lib/payslipTemplate";

const PDF_OPTIONS = {
  margin: [10, 10, 10, 10],
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, logging: false },
  jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
};

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
    )
  ).then(() => undefined);
}

/** Renders `payslip` off-screen and saves it as a PDF file to the browser's downloads. */
export async function downloadPayslipPdf(payslip: any): Promise<void> {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "0";
  wrapper.style.width = "0";
  wrapper.style.height = "0";
  wrapper.style.overflow = "hidden";
  wrapper.style.zIndex = "-1";

  const container = document.createElement("div");
  container.className = "vtl-payslip";
  container.innerHTML = buildPayslipBodyHtml(payslip);
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  try {
    await waitForImages(container);

    const html2pdfModule: any = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default || html2pdfModule;

    await html2pdf()
      .set({ ...PDF_OPTIONS, filename: payslipFileName(payslip) })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(wrapper);
  }
}
