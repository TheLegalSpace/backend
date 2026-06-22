import PDFDocument from "pdfkit";
import { uploadToR2, MAX_ARTICLE_ASSET_BYTES } from "./storage";

export interface InvoicePdfInput {
  invoiceNumber: string;
  planName: string;
  amountKobo: number;
  issuedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  accountId: string;
  accountName: string;
  accountEmail: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
}

const naira = (kobo: number) =>
  "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const renderPdf = (input: InvoicePdfInput): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("The Legal Space", { align: "left" });
    doc.fontSize(10).fillColor("#666").text("Invoice", { align: "left" });
    doc.moveDown();

    doc.fillColor("#000").fontSize(11);
    doc.text(`Invoice #: ${input.invoiceNumber}`);
    doc.text(`Date: ${fmtDate(input.issuedAt)}`);
    doc.moveDown(0.5);
    doc.text(`Billed to: ${input.accountName}`);
    doc.text(input.accountEmail);
    doc.moveDown();

    // Line item
    doc.fontSize(12).fillColor("#000").text("Description", 50, doc.y, { continued: true });
    doc.text("Amount", { align: "right" });
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor("#ccc").stroke();
    doc.moveDown(0.5);

    const periodLabel =
      input.periodStart && input.periodEnd
        ? ` (${fmtDate(input.periodStart)} – ${fmtDate(input.periodEnd)})`
        : "";
    doc.fontSize(11).fillColor("#000").text(`${input.planName}${periodLabel}`, 50, doc.y, {
      continued: true,
    });
    doc.text(naira(input.amountKobo), { align: "right" });
    doc.moveDown();

    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor("#ccc").stroke();
    doc.moveDown(0.5);
    doc.fontSize(13).text("Total", 50, doc.y, { continued: true });
    doc.text(naira(input.amountKobo), { align: "right" });

    if (input.cardLast4) {
      doc.moveDown(1.5);
      doc
        .fontSize(10)
        .fillColor("#666")
        .text(`Paid with ${input.cardBrand || "card"} ending ${input.cardLast4}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#999").text("Thank you for your membership.", { align: "center" });

    doc.end();
  });

// Renders the invoice PDF and uploads it to storage, returning the public URL.
export const generateInvoicePdf = async (input: InvoicePdfInput): Promise<string> => {
  const buffer = await renderPdf(input);
  const { url } = await uploadToR2({
    buffer,
    mimetype: "application/pdf",
    originalName: `${input.invoiceNumber}.pdf`,
    folder: `invoices/${input.accountId}`,
    allowPdf: true,
    maxBytes: MAX_ARTICLE_ASSET_BYTES,
  });
  return url;
};
