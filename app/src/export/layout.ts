import type Decimal from "decimal.js";
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
  /** Ruled on all four sides, the way the sheet boxes a figure below the lines. */
  box?: boolean;
  /** The figure the customer is agreeing to, on the sheet's yellow. */
  highlight?: boolean;
  /**
   * What figure this is — `line.2.area`, `rounded`, `cgst`. The workbook writes
   * the formula for it here instead of the number, and finds the cells the
   * formula needs by looking up their keys (see `excel.ts`). The printed
   * renderers ignore it.
   */
  key?: string;
  /** The figure itself, unrounded and unformatted, for a renderer that writes numbers. */
  value?: number;
}

/**
 * The colours of the document the office already sends: a red letterhead, a
 * purple title, the note in blue, and the total on yellow. They are held here
 * rather than in either renderer, so the preview and the PDF cannot disagree
 * about what the page looks like.
 */
export const INK = {
  heading: "#b3132c",
  title: "#5b2d8e",
  note: "#1b3fa0",
  text: "#000000",
  rule: "#000000",
  headFill: "#e9e9e9",
  totalFill: "#ffe95c",
} as const;

export type SheetRow = Cell[];

/**
 * SI NO, SHAPE, actual H and W, chargeable H and W, area, QTY, RATE, AMOUNT.
 *
 * The area comes before the quantity, which is the one place this page departs
 * from the sheet the office sends today: the entry grid ends on area, qty, rate,
 * amount, and an operator checking a printed page against the screen should be
 * reading the columns in the same order on both.
 */
export const COLUMNS = 10;

/**
 * Column widths in points, in the proportions the current PDFs use: the size,
 * quantity and money columns are near enough equal, and the two on the left
 * carry the serial number and the shape. The total leaves room for A4 margins,
 * cell padding and the rules between columns; the serial column is wide enough
 * to keep "SI NO" on one line.
 */
export const COLUMN_WIDTHS = [28, 43, 46, 46, 46, 46, 55, 39, 46, 74];

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

/** A figure that is worth something to a spreadsheet: printed text, plus what it is. */
const fig = (text: string, key: string, value: Decimal | number, bold = false): Cell => ({
  ...num(text, bold),
  key,
  value: typeof value === "number" ? value : value.toNumber(),
});

/**
 * Below the lines the sheet rules a box round each figure it prints and leaves
 * the rest of the width bare, which is what tells a charge from the empty space
 * beside it. Everything that carries text is boxed; nothing else is.
 */
const boxed = (rows: SheetRow[]): SheetRow[] =>
  rows.map((row) => row.map((cell) => (cell.text === "" ? cell : { ...cell, box: true })));

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
      6: head(quote.printUnit, { rowSpan: 2 }),
      7: head("QTY", { rowSpan: 2 }),
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
      2: fig(size(l.line.actualH), `line.${i}.actualH`, l.line.actualH),
      3: fig(size(l.line.actualW), `line.${i}.actualW`, l.line.actualW),
      4: fig(size(l.chargeableH.value.toNumber()), `line.${i}.chargeableH`, l.chargeableH.value),
      5: fig(size(l.chargeableW.value.toNumber()), `line.${i}.chargeableW`, l.chargeableW.value),
      6: fig(formatArea(l.area.value), `line.${i}.area`, l.area.value),
      7: fig(formatSheet(l.line.qty), `line.${i}.qty`, l.line.qty),
      8: fig(formatSheet(l.line.rate), `line.${i}.rate`, l.line.rate),
      9: fig(formatSheet(l.amount.value), `line.${i}.amount`, l.amount.value),
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
  // A label below the lines starts under the area column and runs to whatever
  // figure follows it — the rate column where there is a count or a tax rate,
  // the amount where there is not.
  const label = (text: string, beside: boolean): Cell => ({
    text,
    align: "left",
    colSpan: beside ? 2 : 3,
  });

  const rows: SheetRow[] = [];

  // Adding up one line would only repeat it, and the sheet never does.
  if (computed.lines.length > 1) {
    rows.push(
      row({
        6: fig(formatArea(computed.totalArea), "total.area", computed.totalArea),
        7: fig(formatSheet(computed.totalQty), "total.qty", computed.totalQty),
        9: fig(formatSheet(computed.subtotal), "subtotal", computed.subtotal),
      }),
    );
  }

  rows.push(row({ 9: fig(formatSheet(computed.rounded.value), "rounded", computed.rounded.value) }));

  // A counted charge prints its count — `HOLES 6 180`. One that was not counted
  // prints the amount alone, the way a document charge always has.
  for (const [i, a] of computed.adjustments.entries()) {
    const counted = a.adjustment.qty > 0;
    rows.push(
      row({
        6: label(a.adjustment.label, counted),
        ...(counted
          ? { 8: fig(formatSheet(a.adjustment.qty), `adj.${i}.qty`, a.adjustment.qty) }
          : {}),
        9: fig(formatSheet(a.amount.value), `adj.${i}.amount`, a.amount.value),
      }),
    );
  }

  // The taxable base only earns a line of its own where there is tax to work out
  // on it; without GST the charges simply run into the total.
  if (quote.gstApplicable && computed.adjustments.length > 0) {
    rows.push(row({ 9: fig(formatSheet(computed.taxableBase), "taxable", computed.taxableBase) }));
  }

  if (quote.gstApplicable) {
    for (const [name, value] of [
      ["CGST", computed.cgst],
      ["SGST", computed.sgst],
    ] as const) {
      const tax = name.toLowerCase();
      rows.push(
        row({
          6: label(name, true),
          // A rate, not a figure: the workbook writes it as a fraction shown as
          // a percentage, so the tax cell beside it can multiply by it.
          8: fig(`${formatSheet(quote.gstPct)}%`, `${tax}.pct`, quote.gstPct / 100),
          9: fig(formatSheet(value), tax, value),
        }),
      );
    }
  }

  // A quote of one section says its total once, as TOTAL AMOUNT. The glass is
  // named beside the figure only where there is another section to tell it from.
  if (!alone) {
    rows.push(
      row({
        6: { ...label(computed.section.shortCode, false), bold: true },
        9: fig(formatSheet(computed.total), "total", computed.total, true),
      }),
    );
  }

  return boxed(rows);
}

/** Each section total again, then the figure the customer is agreeing to. */
export function summaryRows(computed: ComputedQuote): SheetRow[] {
  const rows =
    computed.sections.length > 1
      ? computed.sections.map((s, i) =>
          row({
            6: { text: s.section.shortCode, align: "left", colSpan: 3 },
            9: fig(formatSheet(s.total), `section.${i}.total`, s.total),
          }),
        )
      : [];

  rows.push(
    row({
      6: { text: "TOTAL AMOUNT", align: "left", colSpan: 3, bold: true, highlight: true },
      9: { ...fig(formatSheet(computed.grandTotal), "grandTotal", computed.grandTotal, true), highlight: true },
    }),
  );

  return boxed(rows);
}

export function sectionTitle(computed: ComputedSection): string {
  return `SIZE: ${computed.section.product}`;
}

export const hsnLabel = `HSNCODE ${HSN}`;

/**
 * The order details are boxed as two groups: what the order is, then who it is
 * for. This is the row the rule is drawn above.
 */
export const META_DIVIDER = 4;

/**
 * A line written as `LABEL : value`. The two are kept apart because the label is
 * printed bold and the value is not — it is what makes a page of headings and
 * blanks readable at a glance. A line with no label is a plain one; a label with
 * no value is a blank to be filled in by hand.
 */
export interface Field {
  label: string;
  value: string;
}

const field = (label: string, value = ""): Field => ({ label, value });

/** The same line as one string, for anywhere that cannot set part of it bold. */
export const fieldText = (f: Field): string =>
  f.label && f.value ? `${f.label} ${f.value}` : f.label || f.value;

/** The two-column block between the letterhead and the first section. */
export function metaRows(quote: Quote): Array<[Field, Field]> {
  return [
    [field("DATE :", quote.date), field("PROJECT REMARK :", quote.projectRemark)],
    [field("PROFORMA NO :", quote.proformaNo), field("REF PERSON :", quote.refPerson)],
    [field("ORDER NO :", quote.orderNo), field("PARTY NO :", quote.partyNo)],
    [field(""), field("DOC NO :", quote.docNo)],
    [field("NAME :", quote.customerName), field("DISPATCH TO :", quote.dispatchTo)],
    // The delivery address is a line to write on: the sheet has always had it,
    // and not one of the 62 samples prints anything against it.
    [field("ADDRESS :", quote.customerAddress), field("ADDRESS :")],
    [field("GSTIN :", quote.customerGstin), field("")],
  ];
}

export const letterhead = [
  company.name,
  company.address,
  `GSTIN/UIN : ${company.gstin}`,
  company.phones.join("/"),
];

export const bankRows: Field[] = [
  field("", company.bank.accountName),
  field("", company.bank.bankName),
  field("A/C NO :", company.bank.accountNo),
  field("IFSC CODE :", company.bank.ifsc),
  field("BRANCH :", company.bank.branch),
];

export const termRows: Field[] = company.terms.map((t) => field(`${t.label} :`, t.value));

/** The four names at the foot: labels with a blank beside each, so all bold. */
export const signatureRows: Field[] = company.signatureBlocks.map((b) => field(b));

/**
 * What the file is called when it lands in the operator's downloads:
 * `PROFORMA-7178.pdf`, or `PROFORMA.pdf` while the number is still blank.
 */
export function fileNameFor(quote: Quote, extension = "pdf"): string {
  const no = quote.proformaNo.trim().replace(/[\\/:*?"<>|\s]+/g, "-");
  return `PROFORMA${no === "" ? "" : `-${no}`}.${extension}`;
}
