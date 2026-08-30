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
  /** Type size in points, where a row is set larger than the sheet's own 8. */
  size?: number;
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
 * SI NO, SHAPE, actual H and W, chargeable H and W, QTY, area, chargeable area,
 * RATE, AMOUNT.
 *
 * The count before either area, as the office's sheet has always had it and as
 * the entry grid has it: an area is a size times the count, so the count is read
 * on the way to it rather than after it.
 *
 * The two areas stand together: the glass as measured, then the glass as billed.
 * Only the second prices anything — the first is there because the shop floor
 * reads the pair of them as the wastage, and asked to have it on the sheet.
 */
export const COLUMNS = 11;

/**
 * Column widths in points, in the proportions the current PDFs use: the size,
 * quantity and money columns are near enough equal, and the two on the left
 * carry the serial number and the shape. The serial column is wide enough to
 * keep "SI NO" on one line.
 *
 * The total is what is left of an A4 page after its margins, the padding in
 * eleven cells and the rules between them — 463 points, and not a point more.
 * The order details and the blocks that close the page are set to the width of
 * the page itself, so anything wider here would stand out past them at the join,
 * which is the step the customer spotted along the edge of the download.
 */
export const COLUMN_WIDTHS = [28, 39, 41, 41, 41, 41, 31, 50, 50, 41, 60];

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

/** Where the ruling below the lines begins: the first area column, just after the count. */
const TAIL_FROM = 7;

/**
 * Below the lines the sheet is still one grid, not a set of figures floating
 * over the page. From the area column across, every cell is ruled — a charge, a
 * blank, the tax, the total — so the block runs down unbroken from the last
 * line to the bottom. The width to the left of it is a single empty box, and
 * the count of pieces stands at that box's right edge rather than in a box of
 * its own, which is exactly where the office's sheet prints it.
 */
function tailBlock(rows: SheetRow[]): SheetRow[] {
  if (rows.length === 0) return rows;

  const out = rows.map((row) =>
    row.map((cell, i) => (i >= TAIL_FROM && !cell.skip ? { ...cell, box: true } : cell)),
  );

  const beside = Array.from({ length: TAIL_FROM - 1 }, () => SKIP);
  const covered = Array.from({ length: TAIL_FROM }, () => SKIP);

  // Only the first row of the tail carries anything to the left: the count.
  const count = out[0][TAIL_FROM - 1];

  return out.map((row, i) =>
    i === 0
      ? [
          { ...count, align: "right" as const, colSpan: TAIL_FROM, rowSpan: out.length, box: true },
          ...beside,
          ...row.slice(TAIL_FROM),
        ]
      : [...covered, ...row.slice(TAIL_FROM)],
  );
}

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
      // The measured area, then the chargeable one the amount is worked out on.
      7: head(quote.printUnit, { rowSpan: 2 }),
      8: head(`C${quote.printUnit}`, { rowSpan: 2 }),
      9: head("RATE", { rowSpan: 2 }),
      10: head("AMOUNT", { rowSpan: 2 }),
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
      10: SKIP,
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
      6: fig(formatSheet(l.line.qty), `line.${i}.qty`, l.line.qty),
      7: fig(formatArea(l.actualArea), `line.${i}.actualArea`, l.actualArea),
      8: fig(formatArea(l.area.value), `line.${i}.area`, l.area.value),
      9: fig(formatSheet(l.line.rate), `line.${i}.rate`, l.line.rate),
      10: fig(formatSheet(l.amount.value), `line.${i}.amount`, l.amount.value),
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
function sectionTotals(computed: ComputedSection, quote: Quote, alone = false): SheetRow[] {
  // A label below the lines runs from the first area column to the one before
  // the figure it belongs to — as far as the count where there is a count, and
  // across the rate column where there is not.
  const label = (text: string, withQty: boolean): Cell => ({
    text,
    align: "left",
    colSpan: withQty ? 2 : 3,
  });

  const rows: SheetRow[] = [];

  // Adding up one line would only repeat it, and the sheet never does.
  if (computed.lines.length > 1) {
    rows.push(
      row({
        6: fig(formatSheet(computed.totalQty), "total.qty", computed.totalQty),
        7: fig(formatArea(computed.totalActualArea), "total.actualArea", computed.totalActualArea),
        8: fig(formatArea(computed.totalArea), "total.area", computed.totalArea),
        10: fig(formatSheet(computed.subtotal), "subtotal", computed.subtotal),
      }),
    );
  }

  rows.push(
    row({ 10: fig(formatSheet(computed.rounded.value), "rounded", computed.rounded.value) }),
  );

  // A counted charge prints its count — `HOLES 6 180`. One that was not counted
  // prints the amount alone, the way a document charge always has.
  for (const [i, a] of computed.adjustments.entries()) {
    const counted = a.adjustment.qty > 0;
    rows.push(
      row({
        7: label(a.adjustment.label, counted),
        ...(counted
          ? { 9: fig(formatSheet(a.adjustment.qty), `adj.${i}.qty`, a.adjustment.qty) }
          : {}),
        10: fig(formatSheet(a.amount.value), `adj.${i}.amount`, a.amount.value),
      }),
    );
  }

  // The taxable base only earns a line of its own where there is tax to work out
  // on it; without GST the charges simply run into the total.
  if (quote.gstApplicable && computed.adjustments.length > 0) {
    rows.push(row({ 10: fig(formatSheet(computed.taxableBase), "taxable", computed.taxableBase) }));
  }

  if (quote.gstApplicable) {
    for (const [name, value] of [
      ["CGST", computed.cgst],
      ["SGST", computed.sgst],
    ] as const) {
      const tax = name.toLowerCase();
      rows.push(
        row({
          7: label(name, true),
          // A rate, not a figure: the workbook writes it as a fraction shown as
          // a percentage, so the tax cell beside it can multiply by it.
          9: fig(`${formatSheet(quote.gstPct)}%`, `${tax}.pct`, quote.gstPct / 100),
          10: fig(formatSheet(value), tax, value),
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
        10: fig(formatSheet(computed.total), "total", computed.total, true),
      }),
    );
  }

  return rows;
}

/** Each section total again, then the figure the customer is agreeing to. */
function quoteTotals(computed: ComputedQuote): SheetRow[] {
  const rows =
    computed.sections.length > 1
      ? computed.sections.map((s, i) =>
          row({
            7: { text: s.section.shortCode, align: "left", colSpan: 3 },
            10: fig(formatSheet(s.total), `section.${i}.total`, s.total),
          }),
        )
      : [];

  rows.push(
    row({
      7: { text: "TOTAL AMOUNT", align: "left", colSpan: 3, bold: true, highlight: true },
      10: {
        ...fig(formatSheet(computed.grandTotal), "grandTotal", computed.grandTotal, true),
        highlight: true,
      },
    }),
  );

  return rows;
}

/**
 * Everything printed under one section's lines. Under the last section that
 * includes the figure the customer is agreeing to, because the sheet closes the
 * page in one block: a rule across the empty width above TOTAL AMOUNT would
 * make a box of nothing, which the office's own sheet has never drawn.
 */
export function totalsRows(computed: ComputedQuote, index: number): SheetRow[] {
  const section = computed.sections[index];
  const alone = computed.sections.length === 1;
  const last = index === computed.sections.length - 1;

  return tailBlock([
    ...sectionTotals(section, computed.quote, alone),
    ...(last ? quoteTotals(computed) : []),
  ]);
}

export function sectionTitle(computed: ComputedSection): string {
  return `SIZE: ${computed.section.product}`;
}

export const hsnLabel = `HSNCODE ${HSN}`;

/**
 * The glass and its HSN code, standing on the head of its own lines. It is a
 * row of the sheet rather than a block of its own so that the code sits in the
 * width of the amount column below it: the same columns, drawn by the same
 * renderer, cannot come out a few points apart.
 */
export function titleRows(computed: ComputedSection): SheetRow[] {
  return [
    row({
      0: {
        text: sectionTitle(computed),
        bold: true,
        size: 9,
        box: true,
        colSpan: COLUMNS - 1,
      },
      [COLUMNS - 1]: { text: hsnLabel, align: "right", bold: true, box: true },
    }),
  ];
}

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
