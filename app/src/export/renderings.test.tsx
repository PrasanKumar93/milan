import { cleanup, render } from "@testing-library/react";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { afterEach, describe, expect, it } from "vitest";
import { PrintView } from "../components/PrintView";
import { computeQuote } from "../core/engine";
import { sample, toQuote } from "../test/corpus";
import { COLUMNS, INK } from "./layout";
import { buildDoc } from "./pdf";

/**
 * The preview and the PDF, held to the same page.
 *
 * Both are built from the rows in `layout.ts`, and `layout.test.ts` proves those
 * rows carry the right words and figures. What that leaves open is how each
 * renderer *draws* them, and the two say it in different vocabularies — CSS
 * classes on one side, pdfmake's cell properties on the other. A rule that goes
 * missing on one side only is invisible to every other test here, and it has
 * happened: the boxed figures below the lines were given their four sides cell
 * by cell, which in pdfmake also told the ruled grid above them to draw nothing,
 * so the download came out with the lines unboxed while the preview looked
 * right.
 *
 * So each renderer is asked to describe the sheet cell by cell — the text, then
 * whether it is ruled and whether it is filled — and the two descriptions have
 * to be the same list.
 */

afterEach(cleanup);

/** A cell as `text|marks`: which sheet it is in, and how it is drawn. */
type Mark = string;

const mark = (text: string, grid: boolean, box: boolean, fill: boolean): Mark =>
  `${text}|${grid ? "grid" : "loose"}${box ? " box" : ""}${fill ? " yellow" : ""}`;

function onScreen(quote: ReturnType<typeof toQuote>): Mark[] {
  render(<PrintView computed={computeQuote(quote)} />);

  const marks: Mark[] = [];
  for (const table of document.querySelectorAll("table.print-table")) {
    // The ruled grid takes its rules from the table; the totals under it are
    // boxed a cell at a time.
    const grid = !table.classList.contains("print-table--plain");
    for (const cell of table.querySelectorAll("tbody td")) {
      const text = cell.textContent ?? "";
      if (text === "") continue;
      marks.push(
        mark(text, grid, cell.classList.contains("boxed"), cell.classList.contains("highlight")),
      );
    }
  }
  return marks;
}

function inThePdf(doc: TDocumentDefinitions): Mark[] {
  const content = doc.content as unknown as Array<{
    table?: {
      widths: unknown[];
      headerRows?: number;
      body: Array<Array<{ text?: unknown; border?: unknown; fillColor?: string }>>;
    };
  }>;

  const marks: Mark[] = [];
  for (const { table } of content) {
    // The sheet is the only thing on the page ten columns wide; the order block
    // and the closing blocks are laid out for reading, not for figures.
    if (!table || table.widths.length !== COLUMNS) continue;

    const grid = table.headerRows !== undefined;
    for (const row of table.body.slice(table.headerRows ?? 0)) {
      for (const cell of row) {
        if (typeof cell.text !== "string" || cell.text === "") continue;
        marks.push(
          mark(cell.text, grid, cell.border !== undefined, cell.fillColor === INK.totalFill),
        );
      }
    }
  }
  return marks;
}

describe("the preview and the PDF", () => {
  // Two sections, charges and GST: every kind of row the sheet has.
  const quote = toQuote(sample("7178"));

  it("draw the same page", () => {
    const screenMarks = onScreen(quote);
    expect(inThePdf(buildDoc(computeQuote(quote)))).toEqual(screenMarks);
  });

  it("rules the grid across as well as down, the way the printed sheet does", () => {
    const content = buildDoc(computeQuote(quote)).content as unknown as Array<{
      table?: { headerRows?: number; body: unknown[] };
      layout?: { hLineWidth?: (i: number, node: unknown) => number };
    }>;

    const grid = content.filter((c) => c.table?.headerRows !== undefined)[0];
    const body = grid.table?.body ?? [];
    const between = (grid.table?.headerRows ?? 0) + 1;

    // The rule under the first line. Without it two rows of sizes run together,
    // which is how a 2290 on one row gets read against a 340 on the next.
    expect(grid.layout?.hLineWidth?.(between, { table: { body } })).toBeGreaterThan(0);
  });

  it("runs the totals onto the lines, with no white between the two", () => {
    const content = buildDoc(computeQuote(quote)).content as unknown as Array<{
      table?: { headerRows?: number };
      margin?: number[];
    }>;

    const grids = content
      .map((c, i) => (c.table?.headerRows === undefined ? -1 : i))
      .filter((i) => i >= 0);
    // The totals sit right after each grid, and the summary right after the last.
    const joins = [...grids.map((i) => i + 1), grids[grids.length - 1] + 2];

    // Below the lines the rules come from the cells, so the totals and the
    // summary are tables of their own. Each is drawn onto the one above it: a
    // positive margin would open a gap the sheet has never had, and none at all
    // would leave the two borders side by side as one thick line.
    for (const i of joins) expect(content[i].margin?.[1]).toBeLessThan(0);
  });

  // Two empty lists would agree with each other and prove nothing.
  it("are describing a sheet that is ruled, boxed and has its total on yellow", () => {
    const marks = onScreen(quote);

    expect(marks.filter((m) => m.includes("|grid")).length).toBeGreaterThan(20);
    expect(marks.filter((m) => m.includes("box")).length).toBeGreaterThan(10);
    expect(marks.filter((m) => m.includes("yellow"))).toEqual([
      "TOTAL AMOUNT|loose box yellow",
      "28294.04|loose box yellow",
    ]);
    // A cell in the grid never names its own borders: it takes the table's.
    expect(marks.some((m) => m.startsWith("MIRROR|grid box"))).toBe(false);
  });
});
