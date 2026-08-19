import ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { computeQuote } from "../core/engine";
import type { Quote } from "../core/types";
import { newAdjustment, newLine, newQuote, newSection } from "../state/factory";
import { buildWorkbook, downloadExcel } from "./excel";
import { INK } from "./layout";

/**
 * The workbook is the app's answer to "we need to change an old quote", so the
 * formulas in it have to produce the same numbers the app does, and the page it
 * prints has to be the proforma. These tests recalculate the sheet the way Excel
 * would and compare it with the engine, then check what the page looks like.
 *
 * Columns, as the sheet prints them: A SI NO, B SHAPE, C/D actual, E/F
 * chargeable, G QTY, H area, I RATE, J AMOUNT — then K and L, hidden, holding
 * the wastage allowance and the rate behind a counted charge.
 */

// ---- a small Excel, enough for the formulas this exporter writes ----

const CEILING = (x: number, significance: number) => Math.ceil(x / significance) * significance;
const ROUND = (x: number, places: number) => {
  const factor = 10 ** places;
  return (Math.sign(x) * Math.round(Math.abs(x) * factor)) / factor;
};
const IF = (test: boolean, yes: number, no: number) => (test ? yes : no);

function recalculate(sheet: Worksheet) {
  const numberAt = (ref: string): number => {
    const value = sheet.getCell(ref).value;
    if (typeof value === "number") return value;
    if (value && typeof value === "object" && "formula" in value) {
      return evaluate((value as { formula: string }).formula);
    }
    return 0;
  };

  const evaluate = (formula: string): number => {
    let expression = formula.replace(
      /SUM\(([A-Z]+)(\d+):[A-Z]+(\d+)\)/g,
      (_, col: string, from: string, to: string) => {
        const cells = [];
        for (let row = Number(from); row <= Number(to); row += 1)
          cells.push(numberAt(`${col}${row}`));
        return `(${cells.join("+") || "0"})`;
      },
    );

    expression = expression
      .replace(/\b([A-L])(\d+)\b/g, (_, col: string, row: string) => String(numberAt(`${col}${row}`)))
      .replace(/([^<>=!])=([^=])/g, "$1===$2");

    return Function("CEILING", "ROUND", "IF", `"use strict"; return (${expression});`)(
      CEILING,
      ROUND,
      IF,
    ) as number;
  };

  return { numberAt, evaluate };
}

/** A cell's text, whether it was written plain or as a bold label and a value. */
function textAt(sheet: Worksheet, ref: string): string {
  const value = sheet.getCell(ref).value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function rowOf(sheet: Worksheet, column: string, text: string | number): number {
  for (let row = 1; row <= 400; row += 1) {
    if (textAt(sheet, `${column}${row}`) === String(text)) return row;
  }
  throw new Error(`No row with ${text} in column ${column}`);
}

// ---- a quote with both wastage rules, both charge kinds and GST ----

function quote(): Quote {
  const q = newQuote("7200");
  q.customerName = "G FOCUSS INTERIORS";

  const toughened = newSection("mm", "10MM CLEAR TOUGHENED GLASS");
  toughened.lines = [
    { ...newLine(toughened), actualH: 2000, actualW: 1000, qty: 2, rate: 1238 },
    { ...newLine(toughened), actualH: 1220, actualW: 610, qty: 1, rate: 1238 },
  ];
  // Charges are typed on the job now, name and price alike (§3.1), so a quote
  // being checked types them the way an operator does.
  toughened.adjustments = [
    { ...newAdjustment(toughened, "HOLES"), qty: 4, rate: 30 },
    { ...newAdjustment(toughened, "DOCUMENT CHARGE"), rate: 100 },
  ];

  const mirror = newSection("mm", "6MM CLEAR MIRROR");
  mirror.lines = [{ ...newLine(mirror), actualH: 2290, actualW: 340, qty: 1, rate: 1323 }];
  q.sections = [toughened, mirror];

  return q;
}

function sheetFor(q: Quote): Worksheet {
  const workbook = new ExcelJS.Workbook();
  return buildWorkbook(computeQuote(q), workbook);
}

describe("the workbook", () => {
  it("recalculates to the same figures the app shows", () => {
    const q = quote();
    const computed = computeQuote(q);
    const sheet = sheetFor(q);
    const { numberAt } = recalculate(sheet);

    for (const section of computed.sections) {
      const row = rowOf(sheet, "H", section.section.shortCode);
      expect(numberAt(`J${row}`)).toBeCloseTo(section.total.toNumber(), 6);
    }

    const total = rowOf(sheet, "H", "TOTAL AMOUNT");
    expect(numberAt(`J${total}`)).toBeCloseTo(computed.grandTotal.toNumber(), 6);
  });

  // One section prints no section total of its own, so the grand total has to
  // add up the parts instead of pointing at a cell.
  it("adds up a single-section quote too", () => {
    const q = quote();
    q.sections = [q.sections[0]];

    const sheet = sheetFor(q);
    const { numberAt } = recalculate(sheet);
    const total = rowOf(sheet, "H", "TOTAL AMOUNT");

    expect(numberAt(`J${total}`)).toBeCloseTo(computeQuote(q).grandTotal.toNumber(), 6);
  });

  it("adds the allowance to both sides, and rounds mirror up to the next foot", () => {
    const sheet = sheetFor(quote());
    const { numberAt } = recalculate(sheet);

    const toughened = rowOf(sheet, "C", 2000);
    expect(numberAt(`E${toughened}`)).toBe(2050);
    expect(numberAt(`F${toughened}`)).toBe(1050);

    // 2290 mm overhangs seven feet, so it is charged at eight: 2438.4, up to 2440.
    const mirror = rowOf(sheet, "C", 2290);
    expect(numberAt(`E${mirror}`)).toBe(2440);
    expect(numberAt(`F${mirror}`)).toBe(610);
  });

  it("still recalculates once a size is changed, as a revision would", () => {
    const sheet = sheetFor(quote());
    const row = rowOf(sheet, "C", 2000);

    sheet.getCell(`C${row}`).value = 2500;
    const { numberAt } = recalculate(sheet);

    expect(numberAt(`E${row}`)).toBe(2550);
    // 2.55 x 1.05 SQMT, two pieces, at 1238.
    expect(numberAt(`H${row}`)).toBeCloseTo(5.355, 6);
    expect(numberAt(`J${row}`)).toBeCloseTo(6629.49, 2);
  });

  it("keeps a typed-over figure as a number, and says what the formula gives", () => {
    const q = quote();
    q.sections[0].lines[0].area = 5;

    const sheet = sheetFor(q);
    const row = rowOf(sheet, "C", 2000);
    const cell = sheet.getCell(`H${row}`);

    expect(cell.value).toBe(5);
    expect(String(cell.note)).toContain("4.305");
  });

  it("says on the cell what its formula did, since the formula bar only says where", () => {
    const sheet = sheetFor(quote());
    const row = rowOf(sheet, "C", 2000);
    const note = (ref: string) => String(sheet.getCell(ref).note);

    // 2000 and 1000 cut at 2050 x 1050, two pieces, at 1238 the square metre.
    expect(note(`E${row}`)).toBe("Height: actual + wastage = 2000 + 50 = 2050");
    expect(note(`H${row}`)).toBe("Area = ((2050 ÷ 1000) × (1050 ÷ 1000)) × 2 = 4.305");
    expect(note(`J${row}`)).toBe("Amount = area × rate = 4.305 × 1238 = 5329.59");
  });

  it("caches an answer beside every formula, for viewers that never calculate", () => {
    const q = quote();
    const computed = computeQuote(q);
    const sheet = sheetFor(q);
    let formulas = 0;

    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        const value = cell.value;
        if (!value || typeof value !== "object" || !("formula" in value)) return;
        formulas += 1;
        expect(typeof (value as { result?: unknown }).result).toBe("number");
      }),
    );

    expect(formulas).toBeGreaterThan(20);

    const total = rowOf(sheet, "H", "TOTAL AMOUNT");
    const cached = sheet.getCell(`J${total}`).value as { result: number };
    expect(cached.result).toBeCloseTo(computed.grandTotal.toNumber(), 6);
  });

  it("closes with the bank details, the terms and the notes", () => {
    const sheet = sheetFor(quote());

    expect(textAt(sheet, `A${rowOf(sheet, "A", "HDFC BANK")}`)).toBe("HDFC BANK");
    expect(rowOf(sheet, "F", "VALIDITY : 3 Days")).toBeGreaterThan(0);
    expect(rowOf(sheet, "A", "CUSTOMERS ACCEPTANCE")).toBeGreaterThan(0);
  });

  // Catches a broken ExcelJS import, which would otherwise only show up when an
  // operator clicks Download Excel.
  it("writes a file when the button is pressed", async () => {
    const saved: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      saved.push(blob);
      return "blob:x";
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    await downloadExcel(computeQuote(quote()));

    expect(saved).toHaveLength(1);
    expect(saved[0].size).toBeGreaterThan(3000);
    vi.unstubAllGlobals();
  }, 30000);

  it("hides the working columns and prints as the proforma", () => {
    const sheet = sheetFor(quote());

    expect(sheet.getColumn(11).hidden).toBe(true);
    expect(sheet.getColumn(12).hidden).toBe(true);
    expect(sheet.pageSetup.printArea).toMatch(/^A1:J\d+$/);
    expect(sheet.pageSetup.fitToWidth).toBe(1);
    expect(textAt(sheet, "A1")).toBe("MILAN TOUGHENED GLASS LLP");
  });
});

/**
 * The workbook is the third renderer of `layout.ts`, and the one nobody watches:
 * the preview is on screen and the PDF is checked against the samples, but a
 * workbook is only seen when an operator opens it weeks later. So the page it
 * draws is held to the same description the other two are.
 */
describe("the printed page of the workbook", () => {
  const sheet = sheetFor(quote());

  it("is the sheet's ten columns, ruled and headed", () => {
    const head = rowOf(sheet, "A", "SI NO");

    expect(textAt(sheet, `E${head + 1}`)).toBe("HEIGHT");
    expect(textAt(sheet, `J${head}`)).toBe("AMOUNT");
    expect(sheet.getCell(`A${head}`).fill).toMatchObject({
      fgColor: { argb: `FF${INK.headFill.slice(1).toUpperCase()}` },
    });

    const line = rowOf(sheet, "C", 2000);
    for (const column of ["A", "C", "F", "J"]) {
      expect(sheet.getCell(`${column}${line}`).border?.left?.style).toBe("thin");
    }
  });

  it("boxes the figures under the lines and leaves the width beside them bare", () => {
    const rounded = rowOf(sheet, "H", "HOLES");

    expect(sheet.getCell(`J${rounded}`).border?.top?.style).toBe("thin");
    expect(sheet.getCell(`B${rounded}`).border).toBeUndefined();
  });

  it("puts the total on the sheet's yellow", () => {
    const total = rowOf(sheet, "H", "TOTAL AMOUNT");

    for (const column of ["H", "J"]) {
      expect(sheet.getCell(`${column}${total}`).fill).toMatchObject({
        fgColor: { argb: `FF${INK.totalFill.slice(1).toUpperCase()}` },
      });
    }
  });

  it("keeps the letterhead red and the note blue", () => {
    expect(sheet.getCell("A1").font?.color?.argb).toBe(`FF${INK.heading.slice(1).toUpperCase()}`);

    const note = rowOf(sheet, "A", "NOTE :") + 1;
    expect(sheet.getCell(`A${note}`).font?.color?.argb).toBe(`FF${INK.note.slice(1).toUpperCase()}`);
  });

  it("writes a tax rate as a percentage, and the tax beside it as money", () => {
    const cgst = rowOf(sheet, "H", "CGST");

    expect(sheet.getCell(`I${cgst}`).value).toBe(0.09);
    expect(sheet.getCell(`I${cgst}`).numFmt).toBe("0%");
    expect(sheet.getCell(`J${cgst}`).numFmt).toBe("General");
  });

  // The page prints 35 1/4; the formulas need 35.25. A fraction format is both.
  it("shows an inch quote in eighths without turning the sizes into words", () => {
    const q = quote();
    q.inputUnit = "inch";
    q.sections[0].lines = [{ ...q.sections[0].lines[0], actualH: 33.5, actualW: 35.25 }];

    const inches = sheetFor(q);
    const line = rowOf(inches, "C", 33.5);

    expect(inches.getCell(`D${line}`).value).toBe(35.25);
    expect(inches.getCell(`D${line}`).numFmt).toBe("# ?/?");
    expect(inches.getCell(`I${line}`).numFmt).toBe("General");
  });

  it("keeps the allowance and the charge rate off the page but within reach", () => {
    const line = rowOf(sheet, "C", 2000);
    const holes = rowOf(sheet, "H", "HOLES");

    expect(sheet.getCell(`K${line}`).value).toBe(50);
    expect(sheet.getCell(`L${holes}`).value).toBe(30);
    expect(String((sheet.getCell(`J${holes}`).value as { formula: string }).formula)).toBe(
      `I${holes}*L${holes}`,
    );
  });

  it("carries the mark and the stamp when it is given them", () => {
    const workbook = new ExcelJS.Workbook();
    const withMarks = buildWorkbook(computeQuote(quote()), workbook, {
      logo: "data:image/png;base64,AAAA",
      stamp: "data:image/png;base64,BBBB",
    });

    expect(withMarks.getImages()).toHaveLength(2);
  });
});
