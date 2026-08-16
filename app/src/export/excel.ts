import type Decimal from "decimal.js";
import type { Borders, Cell, Workbook, Worksheet } from "exceljs";
import type { ComputedQuote, ComputedSection } from "../core/engine";
import type { Quote, Section } from "../core/types";
import { SQFT_PER_SQM, MM_PER_FOOT } from "../core/units";
import { HSN, company } from "../data/masters";
import { bankRows, fileNameFor, letterhead, metaRows, termRows } from "./layout";

/**
 * The workbook — the quote as a working document rather than a picture of one.
 *
 * There is no quotation database (dev-plan §5), so this file is how an old quote
 * is revised: open it, change a size or a rate, and every chargeable size, area,
 * amount, subtotal and tax figure recalculates in Excel exactly as it does in the
 * app, because the same formulas are written into the cells. Print it and the
 * page that comes out is the proforma.
 *
 * Two things make that work. The working columns — the wastage allowance and the
 * unit rate behind a charge — are written but hidden, so the formulas have their
 * inputs while the printed page stays the document the customer knows. And a
 * figure the operator typed over in the app is written as that number, with a
 * note recording what the formula would have given, so a revision never silently
 * undoes a deliberate override.
 */

/** A: SI NO, B: SHAPE, C/D: actual, E: wastage (hidden), F/G: chargeable, H: qty, I: area, J: rate, K: amount, L: charge rate (hidden). */
const COLUMNS = [
  { key: "si", width: 6 },
  { key: "shape", width: 13 },
  { key: "actualH", width: 10 },
  { key: "actualW", width: 10 },
  { key: "wastage", width: 9, hidden: true },
  { key: "chargeableH", width: 10 },
  { key: "chargeableW", width: 10 },
  { key: "qty", width: 7 },
  { key: "area", width: 12 },
  { key: "rate", width: 10 },
  { key: "amount", width: 13 },
  { key: "chargeRate", width: 10, hidden: true },
];

const LAST_PRINTED = "K";
const FONT = { name: "Calibri", size: 9 };
const BOLD = { ...FONT, bold: true };

const THIN: Partial<Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

/**
 * A formula is always written with the answer beside it. Nothing recalculates a
 * spreadsheet until it is opened in a spreadsheet, so without the cached result
 * the quote reads as a page of blanks in Google Sheets, in macOS Preview and in
 * a WhatsApp preview.
 */
type Value = string | number | { formula: string; result: Numeric };
type Numeric = number | Decimal;

function write(sheet: Worksheet, row: number, col: number, value: Value, bold = false): Cell {
  const cell = sheet.getCell(row, col);

  if (typeof value === "object") {
    cell.value = {
      formula: value.formula,
      result: typeof value.result === "number" ? value.result : value.result.toNumber(),
      date1904: false,
    };
  } else {
    cell.value = value;
  }

  cell.font = bold ? BOLD : FONT;
  return cell;
}

function merge(sheet: Worksheet, row: number, from: string, to: string): void {
  sheet.mergeCells(`${from}${row}:${to}${row}`);
}

function centre(sheet: Worksheet, row: number, text: string, bold = false, size = 9): void {
  const cell = write(sheet, row, 1, text, bold);
  cell.font = { ...FONT, bold, size };
  cell.alignment = { horizontal: "center" };
  merge(sheet, row, "A", LAST_PRINTED);
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

/**
 * A figure the operator typed over is written as that number and says so, since
 * a formula would quietly undo it the moment the sheet recalculates. Typing the
 * same number the formula gives is not a disagreement, so those cells stay live.
 */
function overridable(cell: Cell, override: number | null, formula: string, computed: Decimal): void {
  if (override === null || computed.eq(override)) {
    cell.value = { formula, result: computed.toNumber(), date1904: false };
    return;
  }
  cell.value = override;
  cell.note = `Typed over in the app. The formula here gives ${computed.toString()}.`;
}

export function buildWorkbook(computed: ComputedQuote, workbook: Workbook): Worksheet {
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

  sheet.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width, hidden: c.hidden }));

  let r = 1;

  centre(sheet, r++, company.name, true, 13);
  for (const line of letterhead.slice(1)) centre(sheet, r++, line);
  centre(sheet, r++, "PROFORMA INVOICE", true);
  r += 1;

  for (const [left, right] of metaRows(quote)) {
    write(sheet, r, 1, left);
    merge(sheet, r, "A", "E");
    write(sheet, r, 6, right);
    merge(sheet, r, "F", LAST_PRINTED);
    r += 1;
  }
  r += 1;

  const sectionTotalRows: number[] = [];

  for (const section of computed.sections) {
    r = writeSection(sheet, r, section, quote, sectionTotalRows);
  }

  for (const [i, section] of computed.sections.entries()) {
    write(sheet, r, 9, section.section.shortCode);
    write(sheet, r, 11, {
      formula: `K${sectionTotalRows[i]}`,
      result: section.total,
    }).alignment = { horizontal: "right" };
    r += 1;
  }

  write(sheet, r, 9, "TOTAL AMOUNT", true);
  const grand = write(
    sheet,
    r,
    11,
    { formula: sectionTotalRows.map((row) => `K${row}`).join("+"), result: computed.grandTotal },
    true,
  );
  grand.alignment = { horizontal: "right" };
  r += 2;

  write(sheet, r, 1, "BANK DETAILS", true);
  write(sheet, r, 6, "TERMS :-", true);
  r += 1;

  for (let i = 0; i < Math.max(bankRows.length, termRows.length); i += 1) {
    if (bankRows[i]) {
      write(sheet, r, 1, bankRows[i]);
      merge(sheet, r, "A", "E");
    }
    if (termRows[i]) {
      write(sheet, r, 6, termRows[i]);
      merge(sheet, r, "F", LAST_PRINTED);
    }
    r += 1;
  }
  r += 1;

  centre(sheet, r++, "NOTE :", true);
  for (const note of company.notes) centre(sheet, r++, note);
  r += 1;

  centre(sheet, r++, "CUSTOMERS ACCEPTANCE", true);
  r += 2;

  for (const [i, block] of company.signatureBlocks.entries()) {
    write(sheet, r, 1 + i * 3, block);
  }

  sheet.pageSetup.printArea = `A1:${LAST_PRINTED}${r}`;
  return sheet;
}

function writeSection(
  sheet: Worksheet,
  start: number,
  section: ComputedSection,
  quote: Quote,
  sectionTotalRows: number[],
): number {
  let r = start;
  const footToFoot = section.section.wastageRule === "foot_to_foot";

  write(sheet, r, 1, `SIZE: ${section.section.product}`, true);
  merge(sheet, r, "A", "H");
  const hsn = write(sheet, r, 9, `HSNCODE ${HSN}`);
  hsn.alignment = { horizontal: "right" };
  merge(sheet, r, "I", LAST_PRINTED);
  r += 1;

  const headTop = r;
  const heads: Array<[number, string]> = [
    [1, "SI NO"],
    [2, "SHAPE"],
    [3, "ACTUAL SIZE"],
    [5, "WASTAGE"],
    [6, "CHARGEABLE"],
    [8, "QTY"],
    [9, quote.printUnit],
    [10, "RATE"],
    [11, "AMOUNT"],
  ];
  for (const [col, text] of heads) {
    const cell = write(sheet, r, col, text, true);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  for (const [col, text] of [
    [3, "HEIGHT"],
    [4, "WIDTH"],
    [6, "HEIGHT"],
    [7, "WIDTH"],
  ] as Array<[number, string]>) {
    const cell = write(sheet, r + 1, col, text, true);
    cell.alignment = { horizontal: "center" };
  }

  sheet.mergeCells(`C${r}:D${r}`);
  sheet.mergeCells(`F${r}:G${r}`);
  for (const col of ["A", "B", "E", "H", "I", "J", "K"]) {
    sheet.mergeCells(`${col}${r}:${col}${r + 1}`);
  }
  r += 2;

  const firstLine = r;
  for (const [i, line] of section.lines.entries()) {
    write(sheet, r, 1, i + 1).alignment = { horizontal: "center" };
    write(sheet, r, 2, line.line.shape);
    write(sheet, r, 3, line.line.actualH);
    write(sheet, r, 4, line.line.actualW);
    if (!footToFoot) write(sheet, r, 5, line.wastage.toNumber());

    overridable(
      write(sheet, r, 6, 0),
      line.line.chargeableH,
      chargeableFormula(section.section, quote, `C${r}`, `E${r}`),
      line.chargeableH.computed,
    );
    overridable(
      write(sheet, r, 7, 0),
      line.line.chargeableW,
      chargeableFormula(section.section, quote, `D${r}`, `E${r}`),
      line.chargeableW.computed,
    );

    write(sheet, r, 8, line.line.qty);
    overridable(
      write(sheet, r, 9, 0),
      line.line.area,
      areaFormula(quote, `F${r}`, `G${r}`, `H${r}`),
      line.area.computed,
    );
    write(sheet, r, 10, line.line.rate);
    overridable(
      write(sheet, r, 11, 0),
      line.line.amount,
      `I${r}*J${r}`,
      line.amount.computed,
    );

    r += 1;
  }

  const lastLine = r - 1;
  box(sheet, headTop, lastLine);

  const totals = r;
  write(sheet, r, 8, { formula: `SUM(H${firstLine}:H${lastLine})`, result: section.totalQty });
  write(sheet, r, 9, { formula: `SUM(I${firstLine}:I${lastLine})`, result: section.totalArea });
  write(sheet, r, 11, { formula: `SUM(K${firstLine}:K${lastLine})`, result: section.subtotal });
  r += 1;

  const rounded = r;
  overridable(
    write(sheet, r, 11, 0),
    section.section.rounded,
    `ROUND(K${totals},0)`,
    section.rounded.computed,
  );
  r += 1;

  const chargeRows: string[] = [];

  for (const adjustment of section.adjustments) {
    const adj = adjustment.adjustment;
    write(sheet, r, 9, adj.label);

    if (adj.qty > 0) {
      // The count prints where the rate column is, as the current sheet does it;
      // the rate for one lives in the hidden working column beside it.
      write(sheet, r, 10, adj.qty).alignment = { horizontal: "right" };
      write(sheet, r, 12, adj.rate);
      overridable(
        write(sheet, r, 11, 0),
        adj.amount,
        `J${r}*L${r}`,
        adjustment.amount.computed,
      );
    } else {
      // Nothing to multiply, so the amount is the charge itself.
      write(sheet, r, 11, adj.amount ?? adj.rate).alignment = { horizontal: "right" };
    }

    chargeRows.push(`K${r}`);
    r += 1;
  }

  const taxable = r;
  if (section.adjustments.length > 0) {
    write(sheet, r, 11, {
      formula: [`K${rounded}`, ...chargeRows].join("+"),
      result: section.taxableBase,
    });
    r += 1;
  }

  const base = section.adjustments.length > 0 ? `K${taxable}` : `K${rounded}`;
  const gstRows: string[] = [];

  if (quote.gstApplicable) {
    for (const [name, amount] of [
      ["CGST", section.cgst],
      ["SGST", section.sgst],
    ] as const) {
      write(sheet, r, 9, name);
      const pct = write(sheet, r, 10, quote.gstPct / 100);
      pct.numFmt = "0%";
      pct.alignment = { horizontal: "right" };
      write(sheet, r, 11, { formula: `ROUND(${base}*J${r},2)`, result: amount });
      gstRows.push(`K${r}`);
      r += 1;
    }
  }

  write(sheet, r, 9, section.section.shortCode, true);
  write(
    sheet,
    r,
    11,
    { formula: [base, ...gstRows].join("+"), result: section.total },
    true,
  );
  sectionTotalRows.push(r);
  r += 2;

  return r;
}

/** Rule the grid: a box round the head and the lines, with every column divided. */
function box(sheet: Worksheet, from: number, to: number): void {
  for (let row = from; row <= to; row += 1) {
    for (let col = 1; col <= 11; col += 1) {
      sheet.getCell(row, col).border = THIN;
    }
  }
}

/**
 * ExcelJS is a megabyte of zip and XML, so it is fetched on the click rather
 * than on the way into the entry screen. Its browser build exports through
 * `default`, its Node build does not.
 */
export async function downloadExcel(computed: ComputedQuote): Promise<void> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = company.name;
  workbook.created = new Date();
  buildWorkbook(computed, workbook);

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
