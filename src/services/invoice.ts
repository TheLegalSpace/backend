import path from "path";
import PDFDocument from "pdfkit";
import { uploadToR2, MAX_ARTICLE_ASSET_BYTES } from "./storage";

// Brand assets — copied to dist/assets on build (see package.json "build").
const LOGO_PATH = path.join(__dirname, "../assets/logo.png"); // 184×34
const THANK_YOU_PATH = path.join(__dirname, "../assets/thank-you.png"); // 122×37

// Inter matches the design and (unlike built-in Helvetica) carries the ₦ glyph.
const FONTS_DIR = path.join(__dirname, "../assets/fonts");
const FONT = "Inter";
const FONT_SEMI = "Inter-SemiBold";
const FONT_BOLD = "Inter-Bold";

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
  discountKobo?: number | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
}

// Palette — mirrors the receipt design.
const INK = "#1A1D24"; // near-black headings
const HEAD = "#3F4551"; // table column headers
const MUTED = "#9AA0AA"; // small gray labels
const SUBTLE = "#5B616E"; // secondary body text
const DATE_GRAY = "#6B7280"; // row dates
const BOX_BG = "#F1F3F6"; // neutral gray panels
const GREEN_BG = "#ECF4EF"; // footer panel
const HAIRLINE = "#E6E8EC"; // table divider
const BRAND_GREEN = "#2F5D3E";
const SCRIPT_GREEN = "#3F7D57";

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

const TZ = "Africa/Lagos";

const fmtLongDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: TZ,
      })
    : "—";

const fmtShortDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: TZ,
      })
    : "—";

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });

export const renderInvoicePdf = (input: InvoicePdfInput): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_LEFT });
    doc.registerFont(FONT, path.join(FONTS_DIR, "Inter-Regular.ttf"));
    doc.registerFont(FONT_SEMI, path.join(FONTS_DIR, "Inter-SemiBold.ttf"));
    doc.registerFont(FONT_BOLD, path.join(FONTS_DIR, "Inter-Bold.ttf"));
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Right-aligned single line ending at `xRight`.
    const right = (
      str: string,
      xRight: number,
      y: number,
      size: number,
      color: string,
      font = FONT
    ) => {
      const w = 300;
      doc.font(font).fontSize(size).fillColor(color).text(str, xRight - w, y, {
        width: w,
        align: "right",
        lineBreak: false,
      });
    };

    const left = (
      str: string,
      x: number,
      y: number,
      size: number,
      color: string,
      font = FONT
    ) => {
      doc.font(font).fontSize(size).fillColor(color).text(str, x, y, { lineBreak: false });
    };

    // ---- Header panel ----
    doc.roundedRect(PAGE_LEFT, 40, PAGE_RIGHT - PAGE_LEFT, 160, 14).fill(BOX_BG);

    left("Payment Receipt", 64, 66, 22, INK, FONT_BOLD);
    right("Invoice No.", 531, 62, 9, MUTED);
    right(input.invoiceNumber, 531, 76, 13, INK, FONT_BOLD);

    left("Billed To:", 64, 120, 9, MUTED);
    left(input.accountName, 64, 134, 13, INK, FONT_SEMI);
    left(input.accountEmail, 64, 154, 9.5, MUTED);

    right("Date:", 531, 118, 9, MUTED);
    right(fmtLongDate(input.issuedAt), 531, 132, 10.5, INK);
    right("Time:", 531, 154, 9, MUTED);
    right(fmtTime(input.issuedAt), 531, 168, 10.5, INK);

    // ---- Line items table ----
    const headY = 234;
    left("Description", PAGE_LEFT, headY, 9.5, HEAD, FONT_SEMI);
    left("Start Date", 250, headY, 9.5, HEAD, FONT_SEMI);
    left("End Date", 355, headY, 9.5, HEAD, FONT_SEMI);
    right("Amount", PAGE_RIGHT, headY, 9.5, HEAD, FONT_SEMI);

    const rowY = headY + 30;
    left(input.planName, PAGE_LEFT, rowY, 11, INK);
    left(fmtShortDate(input.periodStart), 250, rowY, 10, DATE_GRAY);
    left(fmtShortDate(input.periodEnd), 355, rowY, 10, DATE_GRAY);
    right(naira(input.amountKobo), PAGE_RIGHT, rowY, 10.5, INK, FONT_SEMI);

    // Hairline under the row.
    doc
      .moveTo(PAGE_LEFT, rowY + 24)
      .lineTo(PAGE_RIGHT, rowY + 24)
      .lineWidth(1)
      .strokeColor(HAIRLINE)
      .stroke();

    // ---- Totals panel ----
    const discount = ((input.discountKobo ?? 0) / 100).toFixed(2);
    const totalsX = 320;
    doc.roundedRect(totalsX, 548, PAGE_RIGHT - totalsX, 80, 12).fill(BOX_BG);
    left("Discount", totalsX + 24, 570, 10, MUTED);
    right(discount, PAGE_RIGHT - 24, 570, 10.5, INK);
    left("Total (NG)", totalsX + 24, 598, 10.5, SUBTLE);
    right(naira(input.amountKobo), PAGE_RIGHT - 24, 594, 15, INK, FONT_BOLD);

    // ---- Footer panel ----
    const footY = 648;
    doc.roundedRect(PAGE_LEFT, footY, PAGE_RIGHT - PAGE_LEFT, 118, 14).fill(GREEN_BG);

    // Brand logo (emblem + wordmark) — 184×34 native.
    const logoW = 184 * 1.15;
    const logoH = 34 * 1.15;
    try {
      doc.image(LOGO_PATH, 58, footY + 22, { width: logoW, height: logoH });
    } catch {
      // Fallback if the asset is missing at runtime.
      left("THE LEGAL SPACE", 58, footY + 26, 15, BRAND_GREEN, FONT_BOLD);
    }

    left("Thank you for using The Legal Space!", 58, footY + 66, 11, INK, FONT_SEMI);
    left(
      "This receipt is proof of payment for the membership listed above",
      58,
      footY + 85,
      9.5,
      SUBTLE
    );
    left("Please keep this receipt for your records", 58, footY + 101, 9.5, SUBTLE);

    // Cursive "Thank you!" — 122×37 native, upper-right (clear of the body text).
    const tyW = 122 * 1.15;
    const tyH = 37 * 1.15;
    try {
      doc.image(THANK_YOU_PATH, PAGE_RIGHT - 30 - tyW, footY + 46, { width: tyW, height: tyH });
    } catch {
      doc
        .font("Times-Italic")
        .fontSize(24)
        .fillColor(SCRIPT_GREEN)
        .text("Thank you!", 380, footY + 60, { width: 155, align: "right", lineBreak: false });
    }

    doc.end();
  });

// Renders the invoice PDF and uploads it to storage, returning the public URL.
export const generateInvoicePdf = async (input: InvoicePdfInput): Promise<string> => {
  const buffer = await renderInvoicePdf(input);
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
