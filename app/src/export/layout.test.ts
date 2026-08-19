import type { TableCell } from "pdfmake/interfaces";
import { describe, expect, it } from "vitest";
import { computeQuote } from "../core/engine";
import type { Quote } from "../core/types";
import { sample, toQuote } from "../test/corpus";
import {
  type Field,
  type SheetRow,
  COLUMN_WIDTHS,
  INK,
  bankRows,
  fieldText,
  fileNameFor,
  headRows,
  lineRows,
  metaRows,
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

/**
 * Below the lines the sheet is still one grid. The office's own PDFs rule every
 * row from the area column across — a charge, a blank, the tax, the total — and
 * leave the width beside them as a single empty box with the count of pieces at
 * its right edge. Figures boxed one at a time, with the page showing between
 * them, is the thing the customer asked us to stop doing.
 */
describe("the totals under the lines", () => {
  const quote = toQuote(sample("7178"));
  const rows = tailRows(computeQuote(quote).sections[0], quote);

  it("rules every row from the area column across", () => {
    for (const row of rows) {
      for (const cell of row.slice(7)) {
        expect(cell.skip || cell.box).toBeTruthy();
      }
    }
  });

  it("leaves the width beside them one box, with the count standing in it", () => {
    const beside = rows[0][0];

    expect(beside).toMatchObject({ colSpan: 7, rowSpan: rows.length, box: true, align: "right" });
    // The count of pieces, which is all the sheet ever prints on that side.
    expect(beside.text).toBe("3");
    expect(rows.slice(1).every((row) => row.slice(0, 7).every((cell) => cell.skip))).toBe(true);
  });
});

/**
 * The order block is a form: the office fills a few of its lines and writes the
 * rest in by hand. Not one of the 62 samples prints a delivery address, so the
 * line stays a blank to write on rather than being filled with something the
 * operator never typed.
 */
describe("the order details", () => {
  const rows = (quote: Quote) => metaRows(quote).map(([left, right]) => [left, right] as const);

  it("prints where a quote is going against the label that asks", () => {
    const quote = { ...toQuote(sample("7178")), dispatchTo: "SITE 2, WHITEFIELD" };
    const right = rows(quote).map(([, r]) => fieldText(r));

    expect(right).toContain("DISPATCH TO : SITE 2, WHITEFIELD");
    expect(right.filter((line) => line === "ADDRESS :")).toHaveLength(1);
  });

  it("leaves the delivery address blank when nothing was typed", () => {
    const quote = { ...toQuote(sample("7178")), customerAddress: "12 MG ROAD" };
    const [left, right] = [rows(quote).map(([l]) => fieldText(l)), rows(quote).map(([, r]) => fieldText(r))];

    expect(left).toContain("ADDRESS : 12 MG ROAD");
    expect(right).toContain("DISPATCH TO :");
    expect(right.join("\n")).not.toContain("12 MG ROAD");
  });
});

interface SignatureBlock {
  text?: string;
  columns?: Array<{ stack: Array<{ image?: string; text?: string }> }>;
}

describe("the downloaded file", () => {
  const quote = toQuote(sample("7178"));

  it("is named for the proforma it is", () => {
    expect(fileNameFor(quote)).toBe("PROFORMA-7178.pdf");
    expect(fileNameFor(quote, "xlsx")).toBe("PROFORMA-7178.xlsx");
  });

  it("is just PROFORMA while the number is still blank", () => {
    expect(fileNameFor({ ...quote, proformaNo: "  " })).toBe("PROFORMA.pdf");
  });

  // Anything typed into the number reaches a file name, and some of it cannot.
  it("keeps a typed number safe to save", () => {
    expect(fileNameFor({ ...quote, proformaNo: "7178/A rev 2" })).toBe("PROFORMA-7178-A-rev-2.pdf");
  });
});

describe("the PDF", () => {
  it("is A4, with the lines boxed and the totals ruled beneath them", () => {
    const doc = buildDoc(computeQuote(toQuote(sample("7178"))));
    const content = doc.content as unknown as Array<Record<string, unknown>>;
    const tables = content.filter((c) => "table" in c);

    expect(doc.pageSize).toBe("A4");
    // The order block; a title, the lines and the totals for each of the two
    // sections; the summary; and the one frame that closes the document.
    expect(tables).toHaveLength(9);

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
    const closing = content[content.length - 1] as unknown as {
      table: { body: Array<Array<{ columns: SignatureBlock[] }>> };
    };
    // The last row of the closing frame: the four names, under the acceptance.
    const rows = closing.table.body;
    const signatures = rows[rows.length - 1][0].columns;
    const stamped = signatures[signatures.length - 1];

    expect(head.columns[0].image).toBe("data:image/png;base64,LOGO");
    // Nested in a block of its own so it is held to the width of the name and
    // centred on it, rather than on the quarter of the page the name sits in.
    expect(stamped.columns?.[0].stack[0].image).toBe("data:image/png;base64,STAMP");
    // Only over the last name — the other three are left to be signed by hand.
    expect(signatures.slice(0, -1).every((c) => c.columns === undefined)).toBe(true);
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
    const intact = (f: Field) => typeof f.label === "string" && typeof f.value === "string";
    expect(bankRows.every(intact)).toBe(true);
    expect(termRows.every(intact)).toBe(true);
    expect(COLUMN_WIDTHS.every((w) => typeof w === "number")).toBe(true);
  }, 30000);
});
