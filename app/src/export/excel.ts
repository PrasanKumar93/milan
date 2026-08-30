import type Decimal from "decimal.js";
import type { Borders, Cell as XlsxCell, Fill, Workbook, Worksheet } from "exceljs";
// The same working the screen shows under its `i` marks, written onto the cells.
import { actualAreaSteps, amountSteps, areaSteps, chargeableSteps } from "../components/formulas";
import type { ComputedQuote, ComputedSection } from "../core/engine";
import type { Quote, Section } from "../core/types";
import { MM_PER_FOOT, SQFT_PER_SQM } from "../core/units";
import { company } from "../data/masters";
import {
  type Cell,
  type Field,
  type SheetRow,
  COLUMNS,
  COLUMN_WIDTHS,
  INK,
  META_DIVIDER,
  bankRows,
  fileNameFor,
  headRows,
  letterhead,
  lineRows,
  metaRows,
  signatureRows,
  termRows,
  titleRows,
  totalsRows,
} from "./layout";
import { type Marks, marks } from "./marks";

/**
 * The workbook — the same page as the PDF, with the arithmetic still in it.
 *
 * There is no quotation database (dev-plan §5), so this file is how an old quote
 * is revised: open it, change a size or a rate, and every chargeable size, area,
 * amount, subtotal and tax figure recalculates in Excel exactly as it does in the
 * app. Print it and the page that comes out is the proforma the customer knows,
 * because it is drawn from the same `layout.ts` rows as the preview and the PDF —
 * the same columns, spans, boxed figures and colours.
 *
 * What the printed page has no column for lives in two hidden columns beside it:
 * the wastage allowance a chargeable size is built from, and the rate behind a
 * counted charge. And a figure the operator typed over in the app is written as
 * that number, with a note recording what the formula would have given, so a
 * revision never silently undoes a deliberate override.
 */

/** A: SI NO … K: AMOUNT, as the sheet prints. Then the two working columns. */
const WASTAGE = COLUMNS + 1;
const CHARGE_RATE = COLUMNS + 2;
const LAST_PRINTED = String.fromCharCode(64 + COLUMNS);

const FONT = { name: "Arial", size: 8 };
const BOLD = { ...FONT, bold: true };

/** The mark and the stamp, in pixels, as the PDF sizes them. */
const LOGO = { width: 68, height: 68 };
const STAMP = { width: 56, height: 58 };

const THIN: Partial<Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

type Side = keyof Borders;

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const fillWith = (hex: string): Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: argb(hex) },
});

/**
 * Points across the page, as Excel counts them: a column width is a number of
 * digits, and a digit of the default font is seven pixels wide with five pixels
 * of padding in the cell.
 */
const widthOf = (points: number) => Math.round(((points * (96 / 72) - 5) / 7) * 100) / 100;

/** The sheet as it is being written: where the cursor is, and where every figure went. */
interface Pen {
  sheet: Worksheet;
  row: number;
  /** `s0.line.2.area` to `H14`, so a formula can point at the cell it needs. */
  at: Map<string, string>;
  /** How a size is shown: an inch quote prints fractions, and Excel can show them. */
  sizes: string;
}

/** `35 1/4` on the page, 35.25 to the formulas that use it. */
const FRACTIONS = "# ??/??";

const address = (row: number, col: number) => `${String.fromCharCode(64 + col)}${row}`;

// ---- drawing ----

function edge(cell: XlsxCell, ...sides: Side[]): void {
  for (const side of sides) cell.border = { ...cell.border, [side]: { style: "thin" } };
}

/** A rule round a block of the page, the way the sheet boxes its bank details. */
function frame(sheet: Worksheet, top: number, bottom: number, left = 1, right = COLUMNS): void {
  for (let col = left; col <= right; col += 1) {
    edge(sheet.getCell(top, col), "top");
    edge(sheet.getCell(bottom, col), "bottom");
  }
  for (let row = top; row <= bottom; row += 1) {
    edge(sheet.getCell(row, left), "left");
    edge(sheet.getCell(row, right), "right");
  }
}

/** The rule down the middle of a two-column block, and the one under its heading. */
function divide(sheet: Worksheet, top: number, bottom: number, col: number): void {
  for (let row = top; row <= bottom; row += 1) edge(sheet.getCell(row, col), "right");
}

function rule(sheet: Worksheet, row: number, left = 1, right = COLUMNS): void {
  for (let col = left; col <= right; col += 1) edge(sheet.getCell(row, col), "top");
}

function text(
  pen: Pen,
  col: number,
  value: string | Field,
  style: { bold?: boolean; size?: number; colour?: string; align?: "left" | "center" | "right" } = {},
): XlsxCell {
  const cell = pen.sheet.getCell(pen.row, col);
  const font = {
    ...FONT,
    ...(style.size ? { size: style.size } : {}),
    bold: style.bold ?? false,
    ...(style.colour ? { color: { argb: argb(style.colour) } } : {}),
  };

  if (typeof value === "string") {
    cell.value = value;
    cell.font = font;
  } else if (value.label && value.value) {
    // `LABEL : value` — the label bold and the value as typed, which is what
    // makes a page of headings and blanks readable at a glance.
    cell.value = {
      richText: [
        { font: { ...font, bold: true }, text: value.label },
        { font, text: ` ${value.value}` },
      ],
    };
  } else {
    // A heading with nothing beside it yet, or a line that is all value.
    cell.value = value.label || value.value;
    cell.font = value.label ? { ...font, bold: true } : font;
  }

  if (style.align) cell.alignment = { horizontal: style.align };
  return cell;
}

function span(pen: Pen, from: number, to: number): void {
  if (to > from) pen.sheet.mergeCells(pen.row, from, pen.row, to);
}

/**
 * Columns to start `count` equal blocks at. The printed columns are not equally
 * wide, so each block starts at the column nearest its share of the page rather
 * than at a fixed number of columns along.
 */
function spread(count: number): number[] {
  const edges = COLUMN_WIDTHS.reduce<number[]>((out, w) => [...out, out[out.length - 1] + w], [0]);
  const width = edges[edges.length - 1];

  return Array.from({ length: count }, (_, i) => {
    const want = (width * i) / count;
    let nearest = 0;
    for (let col = 0; col < COLUMNS; col += 1) {
      if (Math.abs(edges[col] - want) < Math.abs(edges[nearest] - want)) nearest = col;
    }
    return nearest + 1;
  });
}

const px = (points: number) => (points * 96) / 72;

/** Excel measures a picture's position in English Metric Units: 914400 to the inch. */
const EMU_PER_PX = 9525;

/**
 * Where a picture starts, in the terms Excel stores: which column it lands in
 * and how far into it. ExcelJS also takes a fractional column, but converts it
 * as though a column were a tenth of its width, so the offset is given here.
 */
function anchor(offset: number, row: number): { col: number; row: number } {
  let col = 0;
  let left = offset;

  while (col < COLUMNS - 1 && left >= px(COLUMN_WIDTHS[col])) {
    left -= px(COLUMN_WIDTHS[col]);
    col += 1;
  }

  // ExcelJS writes these straight through; only the fractional form is typed.
  return {
    nativeCol: col,
    nativeColOff: Math.round(left * EMU_PER_PX),
    nativeRow: row,
    nativeRowOff: 0,
  } as unknown as { col: number; row: number };
}

/** A line of the letterhead or a note: one cell across the width of the page. */
function centre(pen: Pen, value: string, style: Parameters<typeof text>[3] = {}): void {
  text(pen, 1, value, { ...style, align: "center" });
  span(pen, 1, COLUMNS);
  pen.row += 1;
}

/**
 * A height or a width, which is the only kind of figure the page prints as a
 * fraction. An area is never one of them, however it is named: `35 1/4` is a
 * size off a tape, and an area of 4.305 written that way reads as nonsense.
 */
const dimension = (cell: Cell) => /(actual|chargeable)[HW]$/.test(cell.key ?? "");

/**
 * A figure belonging to the quote rather than to the section it is drawn under.
 * The summary is printed inside the last section's block, so its cells arrive
 * with that section's scope; the grand total is nobody's section.
 */
const quoteWide = (key: string) => key === "grandTotal" || key.startsWith("section.");

/**
 * One row of the sheet described in `layout.ts`. A figure is written as a number
 * rather than as its printed text, because a workbook that cannot add up its own
 * column is a picture with extra steps; `key` records where it went.
 */
function drawRow(pen: Pen, cells: SheetRow, scope: string, ruled: boolean): void {
  for (const [i, cell] of cells.entries()) {
    if (cell.skip) continue;

    const col = i + 1;
    const target = pen.sheet.getCell(pen.row, col);
    const bottom = pen.row + (cell.rowSpan ?? 1) - 1;
    const right = col + (cell.colSpan ?? 1) - 1;

    target.value = cell.value ?? cell.text;
    const font = cell.bold ? BOLD : FONT;
    target.font = cell.size ? { ...font, size: cell.size } : font;
    // A figure standing beside a block of rows belongs on the first of them —
    // the count of pieces is read against the last line, not against the tax.
    target.alignment = {
      horizontal: cell.align ?? "left",
      vertical: cell.rowSpan ? "top" : "middle",
    };
    if (cell.value !== undefined) target.numFmt = dimension(cell) ? pen.sizes : "General";
    if (cell.highlight) target.fill = fillWith(INK.totalFill);
    if (cell.key) pen.at.set(`${quoteWide(cell.key) ? "" : scope}${cell.key}`, address(pen.row, col));

    if (bottom > pen.row || right > col) pen.sheet.mergeCells(pen.row, col, bottom, right);

    // In the grid every cell is ruled; below the lines the rule is round the
    // block. A merged block shares one style, so ruling its cells rules the
    // block itself and leaves no lines inside it.
    if (ruled || cell.box) {
      for (let r = pen.row; r <= bottom; r += 1) {
        for (let c = col; c <= right; c += 1) pen.sheet.getCell(r, c).border = THIN;
      }
    }
  }
  pen.row += 1;
}

function drawRows(pen: Pen, rows: SheetRow[], scope: string, ruled = false): void {
  for (const row of rows) drawRow(pen, row, scope, ruled);
}

// ---- formulas ----

/**
 * A formula is always written with the answer beside it. Nothing recalculates a
 * spreadsheet until it is opened in a spreadsheet, so without the cached result
 * the quote reads as a page of blanks in Google Sheets, in macOS Preview and in
 * a WhatsApp preview.
 */
function live(
  pen: Pen,
  at: string,
  formula: string,
  result: Decimal | number,
  note?: string,
): void {
  const cell = pen.sheet.getCell(at);
  cell.value = {
    formula,
    result: typeof result === "number" ? result : result.toNumber(),
    date1904: false,
  };

  // Excel can only ever show `I9*K9` in the formula bar, which says where the
  // figures came from but not what was done to them. The note carries the
  // working in the same words the screen puts under its `i` marks.
  if (note) cell.note = note;
}

/**
 * A figure the operator typed over is written as that number and says so, since
 * a formula would quietly undo it the moment the sheet recalculates. Typing the
 * same number the formula gives is not a disagreement, so those cells stay live.
 */
function overridable(
  pen: Pen,
  at: string,
  override: number | null,
  formula: string,
  computed: Decimal,
  note?: string,
): void {
  if (override === null || computed.eq(override)) {
    live(pen, at, formula, computed, note);
    return;
  }

  const cell = pen.sheet.getCell(at);
  cell.value = override;
  cell.note = `Typed over in the app. The formula here gives ${computed.toString()}.`;
}

/**
 * Chargeable size, as Excel sees it. Under a fixed allowance it is the actual
 * plus the wastage cell; foot to foot it is the next whole foot, and in
 * millimetres the next whole 5 mm above that (dev-plan §2.2).
 */
function chargeableFormula(section: Section, quote: Quote, actual: string, wastage: string): string {
  if (section.wastageRule === "fixed") return `IF(${actual}=0,0,${actual}+${wastage})`;

  const perFoot = quote.inputUnit === "mm" ? MM_PER_FOOT.toString() : "12";
  const feet = `CEILING(${actual}/${perFoot},1)*${perFoot}`;
  return quote.inputUnit === "mm"
    ? `IF(${actual}=0,0,CEILING(${feet},5))`
    : `IF(${actual}=0,0,${feet})`;
}

/** Printed area from the chargeable sizes, for whichever pair of units the quote uses (§2.1). */
function areaFormula(quote: Quote, h: string, w: string, qty: string): string {
  const sqft = SQFT_PER_SQM.toString();

  if (quote.inputUnit === "mm") {
    const sqm = `${h}/1000*${w}/1000*${qty}`;
    return quote.printUnit === "SQFT" ? `${sqm}*${sqft}` : sqm;
  }

  const sqftArea = `${h}*${w}/144*${qty}`;
  return quote.printUnit === "SQFT" ? sqftArea : `${sqftArea}/${sqft}`;
}

/** Every printed figure of one section, made live. Returns what its total is worth. */
function liveSection(pen: Pen, index: number, computed: ComputedSection, quote: Quote): string {
  const scope = `s${index}.`;
  const at = (key: string): string | undefined => pen.at.get(`${scope}${key}`);
  const rowOf = (ref: string) => Number(ref.slice(1));
  const section = computed.section;

  for (const [i, line] of computed.lines.entries()) {
    const actualH = at(`line.${i}.actualH`);
    const actualW = at(`line.${i}.actualW`);
    const chargeableH = at(`line.${i}.chargeableH`);
    const chargeableW = at(`line.${i}.chargeableW`);
    const actualArea = at(`line.${i}.actualArea`);
    const area = at(`line.${i}.area`);
    const amount = at(`line.${i}.amount`);
    const qty = at(`line.${i}.qty`);
    const rate = at(`line.${i}.rate`);
    if (
      !actualH ||
      !actualW ||
      !chargeableH ||
      !chargeableW ||
      !actualArea ||
      !area ||
      !amount ||
      !qty ||
      !rate
    ) {
      continue;
    }

    // The allowance has no column on the printed page, so it is kept beside it,
    // out of sight, where the chargeable formulas can reach it.
    const working = address(rowOf(actualH), WASTAGE);
    if (section.wastageRule === "fixed") {
      pen.sheet.getCell(working).value = line.wastage.toNumber();
    }

    overridable(
      pen,
      chargeableH,
      line.line.chargeableH,
      chargeableFormula(section, quote, actualH, working),
      line.chargeableH.computed,
      chargeableSteps(line, section.wastageRule, quote, "Height"),
    );
    overridable(
      pen,
      chargeableW,
      line.line.chargeableW,
      chargeableFormula(section, quote, actualW, working),
      line.chargeableW.computed,
      chargeableSteps(line, section.wastageRule, quote, "Width"),
    );
    // The measured area prices nothing, so there is nothing to type over: it
    // follows the sizes above it wherever they are edited.
    live(
      pen,
      actualArea,
      areaFormula(quote, actualH, actualW, qty),
      line.actualArea,
      actualAreaSteps(line, quote),
    );
    overridable(
      pen,
      area,
      line.line.area,
      areaFormula(quote, chargeableH, chargeableW, qty),
      line.area.computed,
      areaSteps(line, quote),
    );
    overridable(
      pen,
      amount,
      line.line.amount,
      `${area}*${rate}`,
      line.amount.computed,
      amountSteps(line),
    );
  }

  const column = (key: string) => {
    const first = at(`line.0.${key}`);
    const last = at(`line.${computed.lines.length - 1}.${key}`);
    return first && last ? `SUM(${first}:${last})` : undefined;
  };

  for (const [key, sum, result] of [
    ["total.qty", column("qty"), computed.totalQty],
    ["total.actualArea", column("actualArea"), computed.totalActualArea],
    ["total.area", column("area"), computed.totalArea],
    ["subtotal", column("amount"), computed.subtotal],
  ] as const) {
    const cell = at(key);
    if (cell && sum) live(pen, cell, sum, result);
  }

  // One line is never added up — the sheet has never printed a total that only
  // repeats the line above it — so the rounding works off the line itself.
  const summed = at("subtotal") ?? at("line.0.amount");
  const rounded = at("rounded");
  if (rounded && summed) {
    overridable(pen, rounded, section.rounded, `ROUND(${summed},0)`, computed.rounded.computed);
  }

  const charges: string[] = [];
  for (const [i, adjustment] of computed.adjustments.entries()) {
    const amount = at(`adj.${i}.amount`);
    if (!amount) continue;
    charges.push(amount);

    // A counted charge prints its count where the rate column is, as the current
    // sheet does it; the rate for one is hidden beside the row.
    const count = at(`adj.${i}.qty`);
    if (!count) continue;

    const working = address(rowOf(amount), CHARGE_RATE);
    pen.sheet.getCell(working).value = adjustment.adjustment.rate;
    overridable(
      pen,
      amount,
      adjustment.adjustment.amount,
      `${count}*${working}`,
      adjustment.amount.computed,
    );
  }

  const base = [rounded ?? "", ...charges].filter(Boolean).join("+");
  const taxable = at("taxable");
  if (taxable) live(pen, taxable, base, computed.taxableBase);

  const taxed = taxable ?? base;
  const taxes: string[] = [];
  for (const name of ["cgst", "sgst"] as const) {
    const tax = at(name);
    const pct = at(`${name}.pct`);
    if (!tax || !pct) continue;
    pen.sheet.getCell(pct).numFmt = "0%";
    live(pen, tax, `ROUND(${taxed}*${pct},2)`, computed[name]);
    taxes.push(tax);
  }

  const total = [taxed, ...taxes].join("+");
  const cell = at("total");
  if (cell) live(pen, cell, total, computed.total);

  // A quote of one section prints no section total, so the grand total below has
  // to be told how that section adds up rather than pointed at a cell.
  return cell ?? `(${total})`;
}

// ---- the page ----

export function buildWorkbook(
  computed: ComputedQuote,
  workbook: Workbook,
  pictures: Marks = {},
): Worksheet {
  const quote = computed.quote;
  // Excel recalculates the whole sheet on open, so a revision never prints a
  // stale cached figure.
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet(`Proforma ${quote.proformaNo}`.trim(), {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });

  sheet.properties.defaultRowHeight = 12;
  sheet.columns = [
    ...COLUMN_WIDTHS.map((points) => ({ width: widthOf(points) })),
    { width: 9, hidden: true },
    { width: 9, hidden: true },
  ];

  const pen: Pen = {
    sheet,
    row: 1,
    at: new Map(),
    sizes: quote.inputUnit === "inch" ? FRACTIONS : "General",
  };
  letterheadBlock(pen, workbook, pictures.logo);
  metaBlock(pen, quote);

  for (const index of computed.sections.keys()) sectionBlock(pen, index, computed);

  closingBlocks(pen, workbook, pictures.stamp);

  // Everything is on the page before any of it is made live, so a formula can
  // point at a cell that is written further down.
  const totals = computed.sections.map((section, index) => {
    const total = liveSection(pen, index, section, quote);

    // Where the sheet repeats each section total above the grand total, that
    // repetition is the cell the grand total adds up.
    const repeated = pen.at.get(`section.${index}.total`);
    if (!repeated) return total;

    live(pen, repeated, total, section.total);
    return repeated;
  });

  const grand = pen.at.get("grandTotal");
  if (grand) live(pen, grand, totals.join("+"), computed.grandTotal);

  sheet.pageSetup.printArea = `A1:${LAST_PRINTED}${pen.row}`;
  return sheet;
}

/** The mark, then the company's name and address across the rest of the width. */
function letterheadBlock(pen: Pen, workbook: Workbook, logo?: string): void {
  const top = pen.row;

  centre(pen, company.name, { bold: true, size: 14, colour: INK.heading });
  pen.sheet.getRow(top).height = 20;
  for (const line of letterhead.slice(1)) centre(pen, line, { colour: INK.heading });

  if (logo) {
    const id = workbook.addImage({ base64: logo.split(",").pop() ?? logo, extension: "png" });
    pen.sheet.addImage(id, { tl: anchor(0, top - 1), ext: LOGO });
  }

  pen.row += 1;
  centre(pen, "PROFORMA INVOICE", { bold: true, size: 11, colour: INK.title });
  pen.row += 1;
}

/** The order details, boxed as two groups: what the order is, then who it is for. */
function metaBlock(pen: Pen, quote: Quote): void {
  const top = pen.row;
  const middle = Math.ceil(COLUMNS / 2);

  for (const [left, right] of metaRows(quote)) {
    text(pen, 1, left);
    span(pen, 1, middle);
    text(pen, middle + 1, right);
    span(pen, middle + 1, COLUMNS);
    pen.row += 1;
  }

  frame(pen.sheet, top, pen.row - 1);
  divide(pen.sheet, top, pen.row - 1, middle);
  rule(pen.sheet, top + META_DIVIDER);
  // No blank row after it: the details and the first section are one frame, the
  // details sitting on the head of the glass they were taken for.
}

/** The glass, its HSN code, the lines, and everything the lines add up to. */
function sectionBlock(pen: Pen, index: number, computed: ComputedQuote): void {
  const quote = computed.quote;
  const section = computed.sections[index];
  const scope = `s${index}.`;

  drawRows(pen, titleRows(section), scope);

  const head = headRows(quote);
  for (const row of head) {
    drawRow(pen, row, scope, true);
    for (let col = 1; col <= COLUMNS; col += 1) {
      pen.sheet.getCell(pen.row - 1, col).fill = fillWith(INK.headFill);
    }
  }

  drawRows(pen, lineRows(section, quote), scope, true);
  // Under the last section this carries the quote's total as well, so the block
  // runs unbroken from the lines to the figure the customer signs off.
  drawRows(pen, totalsRows(computed, index), scope);

  pen.row += 1;
}

/**
 * The three blocks that close the document, inside one frame: bank details and
 * terms, the note, the acceptance, each closed by a rule and set off by a band
 * of empty page — the border runs down the sides through all of it.
 */
function closingBlocks(pen: Pen, workbook: Workbook, stamp?: string): void {
  const top = pen.row;

  bankAndTerms(pen);
  band(pen);
  noteBlock(pen);
  band(pen);
  acceptanceBlock(pen, workbook, stamp);

  frame(pen.sheet, top, pen.row - 1);
}

/** Empty page between two blocks, ruled off from the one above it. */
function band(pen: Pen): void {
  rule(pen.sheet, pen.row);
  pen.row += 1;
}

function bankAndTerms(pen: Pen): void {
  const top = pen.row;
  const middle = Math.ceil(COLUMNS / 2);
  const headed = { bold: true, colour: INK.heading, align: "center" as const };

  text(pen, 1, "BANK DETAILS", headed);
  span(pen, 1, middle);
  text(pen, middle + 1, "TERMS :-", headed);
  span(pen, middle + 1, COLUMNS);
  pen.row += 1;

  for (let i = 0; i < Math.max(bankRows.length, termRows.length); i += 1) {
    if (bankRows[i]) {
      text(pen, 1, bankRows[i]);
      span(pen, 1, middle);
    }
    if (termRows[i]) {
      text(pen, middle + 1, termRows[i]);
      span(pen, middle + 1, COLUMNS);
    }
    pen.row += 1;
  }

  divide(pen.sheet, top, pen.row - 1, middle);
  rule(pen.sheet, top + 1);
}

function noteBlock(pen: Pen): void {
  const top = pen.row;

  centre(pen, "NOTE :", { bold: true, colour: INK.heading });
  for (const note of company.notes) centre(pen, note, { colour: INK.note });

  rule(pen.sheet, top);
  rule(pen.sheet, top + 1);
}

/** The four names at the foot, with the company's stamp standing over the last. */
function acceptanceBlock(pen: Pen, workbook: Workbook, stamp?: string): void {
  const top = pen.row;

  centre(pen, "CUSTOMERS ACCEPTANCE", { bold: true, colour: INK.heading });

  // Room to sign in, or for the stamp.
  const signing = pen.row;
  pen.sheet.getRow(signing).height = 44;
  pen.row += 1;

  const anchors = spread(signatureRows.length);
  for (const [i, block] of signatureRows.entries()) {
    text(pen, anchors[i], block, { bold: true });
    span(pen, anchors[i], (anchors[i + 1] ?? COLUMNS + 1) - 1);
  }

  if (stamp) {
    // Centred on the name it stands over, rather than on the quarter of the
    // page that name starts in.
    const over = anchors[anchors.length - 1];
    const before = COLUMN_WIDTHS.slice(0, over - 1).reduce((sum, w) => sum + w, 0);
    const width = COLUMN_WIDTHS.slice(over - 1).reduce((sum, w) => sum + w, 0);
    const id = workbook.addImage({ base64: stamp.split(",").pop() ?? stamp, extension: "png" });

    pen.sheet.addImage(id, {
      tl: anchor(px(before) + (px(width) - STAMP.width) / 2, signing - 1),
      ext: STAMP,
    });
  }

  rule(pen.sheet, top);
  rule(pen.sheet, top + 1);
  pen.row += 1;
}

/**
 * ExcelJS is a megabyte of zip and XML, so it is fetched on the click rather
 * than on the way into the entry screen. Its browser build exports through
 * `default`, its Node build does not.
 */
export async function downloadExcel(computed: ComputedQuote): Promise<void> {
  const [module, pictures] = await Promise.all([import("exceljs"), marks()]);
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = company.name;
  workbook.created = new Date();
  buildWorkbook(computed, workbook, pictures);

  const buffer = await workbook.xlsx.writeBuffer();
  save(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileNameFor(computed.quote, "xlsx"),
  );
}

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
