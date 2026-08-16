import type { ComputedQuote, ComputedSection } from "../core/engine";
import { formatArea, formatSheet } from "../core/money";
import type { Quote } from "../core/types";
import { formatInches } from "../core/units";
import { HSN, company } from "../data/masters";

/**
 * The printed document, described once.
 *
 * The screen preview and the PDF are built from these rows, so "what prints" and
 * what prints cannot drift apart. The shape follows the existing sheet closely:
 * the totals are not labelled rows, they are numbers sitting in the same columns
 * as the lines above them, which is how the office reads the page.
 */

export type Align = "left" | "right" | "center";

export interface Cell {
  text: string;
  align?: Align;
  bold?: boolean;
  colSpan?: number;
  rowSpan?: number;
  /** A position covered by a span above or to the left. */
  skip?: boolean;
}

export type SheetRow = Cell[];

/** SI NO, SHAPE, actual H and W, chargeable H and W, QTY, area, RATE, AMOUNT. */
export const COLUMNS = 10;

/**
 * Column widths in points, in the proportions the current PDFs use: the size,
 * quantity and money columns are near enough equal, and the two on the left
 * carry the serial number and the shape. The total leaves room for A4 margins,
 * cell padding and the rules between columns.
 */
export const COLUMN_WIDTHS = [24, 47, 46, 46, 46, 46, 39, 55, 46, 74];

const SKIP: Cell = { text: "", skip: true };

function row(cells: Record<number, Cell | undefined>): SheetRow {
  const out: SheetRow = [];
  for (let i = 0; i < COLUMNS; i += 1) {
    const cell = cells[i];
    if (cell) {
      out.push(cell);
      for (let s = 1; s < (cell.colSpan ?? 1); s += 1) {
        out.push(SKIP);
        i += 1;
      }
    } else {
      out.push({ text: "" });
    }
  }
  return out;
}

const num = (text: string, bold = false): Cell => ({ text, align: "right", bold });

/**
 * The two-level head. "ACTAUL SIZE" is spelt correctly here — it is one of the
 * typos listed in dev-plan §8, and a heading is the safest place to fix one.
 */
export function headRows(quote: Quote): SheetRow[] {
  const head = (text: string, extra: Partial<Cell> = {}): Cell => ({
    text,
    align: "center",
    bold: true,
    ...extra,
  });

  return [
    row({
      0: head("SI NO", { rowSpan: 2 }),
      1: head("SHAPE", { rowSpan: 2 }),
      2: head("ACTUAL SIZE", { colSpan: 2 }),
      4: head("CHARGEABLE", { colSpan: 2 }),
      6: head("QTY", { rowSpan: 2 }),
      7: head(quote.printUnit, { rowSpan: 2 }),
      8: head("RATE", { rowSpan: 2 }),
      9: head("AMOUNT", { rowSpan: 2 }),
    }),
    row({
      0: SKIP,
      1: SKIP,
      2: head("HEIGHT"),
      3: head("WIDTH"),
      4: head("HEIGHT"),
      5: head("WIDTH"),
      6: SKIP,
      7: SKIP,
      8: SKIP,
      9: SKIP,
    }),
  ];
}

export function lineRows(computed: ComputedSection, quote: Quote): SheetRow[] {
  const size = (v: number) => (quote.inputUnit === "inch" ? formatInches(v) : formatSheet(v));

  return computed.lines.map((l, i) =>
    row({
      0: { text: String(i + 1), align: "center" },
      1: { text: l.line.shape },
      2: num(size(l.line.actualH)),
      3: num(size(l.line.actualW)),
      4: num(size(l.chargeableH.value.toNumber())),
      5: num(size(l.chargeableW.value.toNumber())),
      6: num(formatSheet(l.line.qty)),
      7: num(formatArea(l.area.value)),
      8: num(formatSheet(l.line.rate)),
      9: num(formatSheet(l.amount.value)),
    }),
  );
}

/**
 * Everything below the lines. A charge, the GST or a section total is written as
 * a label in the area column and a figure in the amount column, exactly as the
 * current sheet does it — no "Total" or "Rounded" captions, because the sheet has
 * never printed any.
 *
 * `alone` says this is the only section in the quote, which changes what the
 * sheet prints: see the section total at the bottom.
 */
export function tailRows(computed: ComputedSection, quote: Quote, alone = false): SheetRow[] {
  const label = (text: string, withQty: boolean): Cell => ({
    text,
    align: "left",
    colSpan: withQty ? 1 : 2,
  });

  const rows: SheetRow[] = [];

  // Adding up one line would only repeat it, and the sheet never does.
  if (computed.lines.length > 1) {
    rows.push(
      row({
        6: num(formatSheet(computed.totalQty)),
        7: num(formatArea(computed.totalArea)),
        9: num(formatSheet(computed.subtotal)),
      }),
    );
  }

  rows.push(row({ 9: num(formatSheet(computed.rounded.value)) }));

  for (const a of computed.adjustments) {
    const perUnit = a.adjustment.basis === "per_unit";
    rows.push(
      row({
        7: label(a.adjustment.label, perUnit),
        ...(perUnit ? { 8: num(formatSheet(a.adjustment.qty)) } : {}),
        9: num(formatSheet(a.amount.value)),
      }),
    );
  }

  // The taxable base only earns a line of its own where there is tax to work out
  // on it; without GST the charges simply run into the total.
  if (quote.gstApplicable && computed.adjustments.length > 0) {
    rows.push(row({ 9: num(formatSheet(computed.taxableBase)) }));
  }

  if (quote.gstApplicable) {
    for (const [name, value] of [
      ["CGST", computed.cgst],
      ["SGST", computed.sgst],
    ] as const) {
      rows.push(
        row({
          7: label(name, true),
          8: num(`${formatSheet(quote.gstPct)}%`),
          9: num(formatSheet(value)),
        }),
      );
    }
  }

  // A quote of one section says its total once, as TOTAL AMOUNT. The glass is
  // named beside the figure only where there is another section to tell it from.
  if (!alone) {
    rows.push(
      row({
        7: { ...label(computed.section.shortCode, false), bold: true },
        9: num(formatSheet(computed.total), true),
      }),
    );
  }

  return rows;
}

/** Each section total again, then the figure the customer is agreeing to. */
export function summaryRows(computed: ComputedQuote): SheetRow[] {
  const rows =
    computed.sections.length > 1
      ? computed.sections.map((s) =>
          row({
            7: { text: s.section.shortCode, align: "left", colSpan: 2 },
            9: num(formatSheet(s.total)),
          }),
        )
      : [];

  rows.push(
    row({
      7: { text: "TOTAL AMOUNT", align: "left", colSpan: 2, bold: true },
      9: num(formatSheet(computed.grandTotal), true),
    }),
  );

  return rows;
}

export function sectionTitle(computed: ComputedSection): string {
  return `SIZE: ${computed.section.product}`;
}

export const hsnLabel = `HSNCODE ${HSN}`;

/** The two-column block between the letterhead and the first section. */
export function metaRows(quote: Quote): Array<[string, string]> {
  return [
    [`DATE : ${quote.date}`, `PROJECT REMARK : ${quote.projectRemark}`],
    [`PROFORMA NO : ${quote.proformaNo}`, `REF PERSON : ${quote.refPerson}`],
    [`ORDER NO : ${quote.orderNo}`, `PARTY NO : ${quote.partyNo}`],
    ["", `DOC NO : ${quote.docNo}`],
    [`NAME : ${quote.customerName}`, "DISPATCH TO :"],
    [`ADDRESS : ${quote.customerAddress}`, `ADDRESS : ${quote.dispatchTo || quote.customerAddress}`],
    [`GSTIN : ${quote.customerGstin}`, ""],
  ];
}

export const letterhead = [
  company.name,
  company.address,
  `GSTIN/UIN : ${company.gstin}`,
  company.phones.join("/"),
];

export const bankRows = [
  company.bank.accountName,
  company.bank.bankName,
  `A/C NO : ${company.bank.accountNo}`,
  `IFSC CODE : ${company.bank.ifsc}`,
  `BRANCH : ${company.bank.branch}`,
];

export const termRows = company.terms.map((t) => `${t.label} : ${t.value}`);

/** What the file is called when it lands in the operator's downloads. */
export function fileNameFor(quote: Quote, extension = "pdf"): string {
  const parts = ["PROFORMA", quote.proformaNo, quote.customerName]
    .filter((p) => p.trim() !== "")
    .join(" ");
  return `${parts.replace(/[\\/:*?"<>|]/g, "-")}.${extension}`;
}
