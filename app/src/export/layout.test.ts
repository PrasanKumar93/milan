import type { TableCell } from "pdfmake/interfaces";
import { describe, expect, it } from "vitest";
import { computeQuote } from "../core/engine";
import type { Quote } from "../core/types";
import { sample, toQuote } from "../test/corpus";
import {
  type SheetRow,
  COLUMN_WIDTHS,
  INK,
  bankRows,
  headRows,
  lineRows,
  summaryRows,
  tailRows,
  termRows,
} from "./layout";
import { buildDoc, printer } from "./pdf";

/**
 * Column-by-column check against the document the office sends today.
 *
 * The expected strings below are the text of PROFORMA 7178 as it came out of the
 * existing sheet, read straight off the PDF. Flattening the layout rows the same
 * way turns "does the export match the sample" into an equality, so a change to
 * a number format or a column order fails here rather than in front of a
 * customer.
 */

const flatten = (rows: SheetRow[]): string[] =>
  rows.map((row) =>
    row
      .filter((c) => !c.skip && c.text !== "")
      .map((c) => c.text)
      .join(" "),
  );

function documentOf(quote: Quote): string[] {
  const computed = computeQuote(quote);
  const alone = computed.sections.length === 1;
  const out: string[] = [];

  for (const section of computed.sections) {
    out.push(`SIZE: ${section.section.product}`);
    out.push(...flatten(headRows(quote)));
    out.push(...flatten(lineRows(section, quote)));
    out.push(...flatten(tailRows(section, quote, alone)));
  }

  out.push(...flatten(summaryRows(computed)));
  return out;
}

describe("the printed document, against PROFORMA 7178", () => {
  const quote = toQuote(sample("7178"));

  it("reproduces every printed line", () => {
    expect(documentOf(quote)).toEqual([
      "SIZE: 6MM CLEAR MIRROR",
      "SI NO SHAPE ACTUAL SIZE CHARGEABLE QTY SQMT RATE AMOUNT",
      "HEIGHT WIDTH HEIGHT WIDTH",
      "1 MIRROR 2290 340 2440 610 1 1.4884 1323 1969.153",
      "2 MIRROR 2917 628 3660 915 1 3.3489 1323 4430.595",
      "3 MIRROR 2920 630 3660 915 1 3.3489 1323 4430.595",
      "3 8.1862 10830.34",
      "10830",
      "CGST 9% 974.7",
      "SGST 9% 974.7",
      "6MM MIRROR 12779.4",

      "SIZE: 10MM CLEAR TOUGEHENED GLASS",
      "SI NO SHAPE ACTUAL SIZE CHARGEABLE QTY SQMT RATE AMOUNT",
      "HEIGHT WIDTH HEIGHT WIDTH",
      "1 BLOCK 230 838 280 888 6 1.49184 1232 1837.947",
      "2 BLOCK 195 633 245 683 8 1.33868 1232 1649.254",
      "3 BLOCK 340 1004 390 1054 8 3.28848 1232 4051.407",
      "4 BLOCK 380 908 430 958 4 1.64776 1232 2030.04",
      "5 DRW 2922 832 2972 882 1 2.621304 1232 3229.447",
      "27 10.38806 12798.09",
      "12798",
      "U CUTOUT 1 250",
      "DOCUMENT CHARGE 100",
      "13148",
      "CGST 9% 1183.32",
      "SGST 9% 1183.32",
      "10MM CTG 15514.64",

      "6MM MIRROR 12779.4",
      "10MM CTG 15514.64",
      "TOTAL AMOUNT 28294.04",
    ]);
  });

  it("puts the working nowhere on it", () => {
    const text = documentOf(quote).join("\n");
    for (const word of ["Wastage", "Rounded", "Total —", "Taxable", "override"]) {
      expect(text).not.toContain(word);
    }
  });
});

/**
 * A quote of one section is the common case and it is printed differently: the
 * sheet leaves out anything that would only be said twice. All 47 samples agree
 * on this, and ALU SYSTEM 6359 is one of them, read off the PDF as above.
 */
describe("the printed document, against PROFORMA 6359", () => {
  it("says each figure once and no more", () => {
    expect(documentOf(toQuote(sample("6359")))).toEqual([
      "SIZE: 12MM CLEAR TOUGHENED GLASS",
      "SI NO SHAPE ACTUAL SIZE CHARGEABLE QTY SQFT RATE AMOUNT",
      "HEIGHT WIDTH HEIGHT WIDTH",
      "1 DRW 3555 810 3605 860 1 33.37163 155 5172.603",
      // No qty/area/subtotal row: adding up one line would only repeat it.
      "5173",
      "CROSS CHARGE 100",
      "CUTOUT 1 100",
      // No taxable base, because no GST is worked out on it, and no section
      // total, because TOTAL AMOUNT below is the same figure.
      "TOTAL AMOUNT 5373",
    ]);
  });
});

describe("the PDF", () => {
  it("is A4, with the lines boxed and the totals ruled beneath them", () => {
    const doc = buildDoc(computeQuote(toQuote(sample("7178"))));
    const content = doc.content as unknown as Array<Record<string, unknown>>;
    const tables = content.filter((c) => "table" in c);

    expect(doc.pageSize).toBe("A4");
    // The order block; a title, the lines and the totals for each of the two
    // sections; the summary; then bank and terms, the note and the acceptance.
    expect(tables).toHaveLength(11);

    const lines = tables[2].table as { headerRows: number; body: unknown[][] };
    expect(lines.headerRows).toBe(2);
    expect(lines.body).toHaveLength(2 + 3);

    const totals = tables[3].table as { body: unknown[][] };
    expect(totals.body).toHaveLength(5);

    // Every row of the sheet is ten cells wide, spans included, or the columns
    // would not line up: both sections and the summary under them.
    for (const i of [2, 3, 5, 6, 7]) {
      const body = (tables[i].table as { body: unknown[][] }).body;
      expect(body.every((row) => row.length === 10)).toBe(true);
    }
  });

  it("puts the figure the customer signs off on the sheet's yellow", () => {
    const doc = buildDoc(computeQuote(toQuote(sample("7178"))));
    const content = doc.content as unknown as Array<Record<string, unknown>>;
    const summary = (content.filter((c) => "table" in c)[7].table as { body: TableCell[][] }).body;
    const last = summary[summary.length - 1].filter(
      (c) => (c as { text?: string }).text,
    ) as Array<Record<string, unknown>>;

    expect(last.map((c) => c.text)).toEqual(["TOTAL AMOUNT", "28294.04"]);
    expect(last.every((c) => c.fillColor === INK.totalFill)).toBe(true);
  });

  it("carries the letterhead mark and stamps the last signature when given them", () => {
    const doc = buildDoc(computeQuote(toQuote(sample("7178"))), {
      logo: "data:image/png;base64,LOGO",
      stamp: "data:image/png;base64,STAMP",
    });
    const content = doc.content as unknown as Array<Record<string, never>>;
    const head = content[0] as unknown as { columns: Array<{ image?: string }> };
    const acceptance = content[content.length - 1] as unknown as {
      table: { body: Array<Array<{ columns: Array<{ stack?: Array<{ image?: string }> }> }>> };
    };
    const signatures = acceptance.table.body[1][0].columns;

    expect(head.columns[0].image).toBe("data:image/png;base64,LOGO");
    expect(signatures[signatures.length - 1].stack?.[0].image).toBe("data:image/png;base64,STAMP");
    // Only over the last name — the other three are left to be signed by hand.
    expect(signatures.slice(0, -1).every((c) => c.stack === undefined)).toBe(true);
  });

  // Catches a broken pdfmake import or an unregistered font, which would
  // otherwise only show up when an operator clicks Download.
  it("renders through pdfmake with its fonts in place", async () => {
    const pdfMake = await printer();
    const blob = await pdfMake.createPdf(buildDoc(computeQuote(toQuote(sample("7178"))))).getBlob();
    expect(blob.size).toBeGreaterThan(10000);

    // pdfmake rewrites the arrays it is handed into its own nodes. It once did
    // that to the shared layout, and the next workbook came out with pdfmake's
    // objects where the bank details belong.
    expect(bankRows.every((r) => typeof r === "string")).toBe(true);
    expect(termRows.every((r) => typeof r === "string")).toBe(true);
    expect(COLUMN_WIDTHS.every((w) => typeof w === "number")).toBe(true);
  }, 30000);
});
