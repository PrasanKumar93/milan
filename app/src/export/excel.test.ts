import ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { computeQuote } from "../core/engine";
import type { Quote } from "../core/types";
import { newAdjustment, newLine, newQuote, newSection } from "../state/factory";
import { buildWorkbook, downloadExcel } from "./excel";

/**
 * The workbook is the app's answer to "we need to change an old quote", so the
 * formulas in it have to produce the same numbers the app does. These tests
 * recalculate the sheet the way Excel would and compare it with the engine.
 */

// ---- a small Excel, enough for the formulas this exporter writes ----

const CEILING = (x: number, significance: number) => Math.ceil(x / significance) * significance;
const ROUND = (x: number, places: number) => {
  const factor = 10 ** places;
  return Math.sign(x) * Math.round(Math.abs(x) * factor) / factor;
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
        for (let row = Number(from); row <= Number(to); row += 1) cells.push(numberAt(`${col}${row}`));
        return `(${cells.join("+") || "0"})`;
      },
    );

    expression = expression
      .replace(/\b([A-L])(\d+)\b/g, (_, col: string, row: string) => String(numberAt(`${col}${row}`)))
      .replace(/([^<>=!])=([^=])/g, "$1===$2");

    return Function(
      "CEILING",
      "ROUND",
      "IF",
      `"use strict"; return (${expression});`,
    )(CEILING, ROUND, IF) as number;
  };

  return { numberAt, evaluate };
}

function rowOf(sheet: Worksheet, column: string, text: string | number): number {
  for (let row = 1; row <= 400; row += 1) {
    if (sheet.getCell(`${column}${row}`).value === text) return row;
  }
  throw new Error(`No row with ${text} in column ${column}`);
}

// ---- a quote with both wastage rules, both charge kinds and GST ----

function quote(): Quote {
  const q = newQuote("7200");
  q.customerName = "G FOCUSS INTERIORS";

  const toughened = q.sections[0];
  toughened.lines = [
    { ...newLine(toughened), actualH: 2000, actualW: 1000, qty: 2, rate: 1238 },
    { ...newLine(toughened), actualH: 1220, actualW: 610, qty: 1, rate: 1238 },
  ];
  toughened.adjustments = [
    { ...newAdjustment(toughened, "HOLES"), qty: 4 },
    newAdjustment(toughened, "DOCUMENT CHARGE"),
  ];

  const mirror = newSection("mm", "6MM CLEAR MIRROR");
  mirror.lines = [{ ...newLine(mirror), actualH: 2290, actualW: 340, qty: 1, rate: 1323 }];
  q.sections.push(mirror);

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
      const row = rowOf(sheet, "I", section.section.shortCode);
      expect(numberAt(`K${row}`)).toBeCloseTo(section.total.toNumber(), 6);
    }

    const total = rowOf(sheet, "I", "TOTAL AMOUNT");
    expect(numberAt(`K${total}`)).toBeCloseTo(computed.grandTotal.toNumber(), 6);
  });

  it("adds the allowance to both sides, and rounds mirror up to the next foot", () => {
    const sheet = sheetFor(quote());
    const { numberAt } = recalculate(sheet);

    const toughened = rowOf(sheet, "C", 2000);
    expect(numberAt(`F${toughened}`)).toBe(2050);
    expect(numberAt(`G${toughened}`)).toBe(1050);

    // 2290 mm overhangs seven feet, so it is charged at eight: 2438.4, up to 2440.
    const mirror = rowOf(sheet, "C", 2290);
    expect(numberAt(`F${mirror}`)).toBe(2440);
    expect(numberAt(`G${mirror}`)).toBe(610);
  });

  it("still recalculates once a size is changed, as a revision would", () => {
    const sheet = sheetFor(quote());
    const row = rowOf(sheet, "C", 2000);

    sheet.getCell(`C${row}`).value = 2500;
    const { numberAt } = recalculate(sheet);

    expect(numberAt(`F${row}`)).toBe(2550);
    // 2.55 x 1.05 SQMT, two pieces, at 1238.
    expect(numberAt(`I${row}`)).toBeCloseTo(5.355, 6);
    expect(numberAt(`K${row}`)).toBeCloseTo(6629.49, 2);
  });

  it("keeps a typed-over figure as a number, and says what the formula gives", () => {
    const q = quote();
    q.sections[0].lines[0].area = 5;

    const sheet = sheetFor(q);
    const row = rowOf(sheet, "C", 2000);
    const cell = sheet.getCell(`I${row}`);

    expect(cell.value).toBe(5);
    expect(String(cell.note)).toContain("4.305");
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

    const total = rowOf(sheet, "I", "TOTAL AMOUNT");
    const cached = sheet.getCell(`K${total}`).value as { result: number };
    expect(cached.result).toBeCloseTo(computed.grandTotal.toNumber(), 6);
  });

  it("closes with the bank details, the terms and the notes", () => {
    const sheet = sheetFor(quote());

    expect(sheet.getCell(`A${rowOf(sheet, "A", "HDFC BANK")}`).value).toBe("HDFC BANK");
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

    expect(sheet.getColumn(5).hidden).toBe(true);
    expect(sheet.getColumn(12).hidden).toBe(true);
    expect(sheet.pageSetup.printArea).toMatch(/^A1:K\d+$/);
    expect(sheet.pageSetup.fitToWidth).toBe(1);
    expect(sheet.getCell("A1").value).toBe("MILAN TOUGHENED GLASS LLP");
  });
});
