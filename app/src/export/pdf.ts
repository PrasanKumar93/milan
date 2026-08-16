import type { Content, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import type { ComputedQuote } from "../core/engine";
import { company } from "../data/masters";
import {
  type Cell,
  type SheetRow,
  COLUMN_WIDTHS,
  bankRows,
  fileNameFor,
  headRows,
  hsnLabel,
  letterhead,
  lineRows,
  metaRows,
  sectionTitle,
  summaryRows,
  tailRows,
  termRows,
} from "./layout";

/**
 * The PDF, built from the same rows as the preview (see `layout.ts`).
 *
 * A4 rather than the Letter size the current sheet exports at: the office prints
 * on A4 anyway, so today's PDF is already being scaled to fit. Column
 * proportions are kept, so the page reads the same.
 */

const HEAD_FILL = "#e9e9e9";
const RULE = 0.5;

function toCell(cell: Cell): TableCell {
  if (cell.skip) return {};
  return {
    text: cell.text,
    alignment: cell.align ?? "left",
    bold: cell.bold ?? false,
    ...(cell.colSpan ? { colSpan: cell.colSpan } : {}),
    ...(cell.rowSpan ? { rowSpan: cell.rowSpan } : {}),
  };
}

function toBody(rows: SheetRow[]): TableCell[][] {
  return rows.map((row) => row.map(toCell));
}

const PADDING = 2;

/**
 * pdfmake rewrites the arrays it is handed in place, turning the strings into
 * its own node objects. Everything shared with the preview and the workbook is
 * therefore copied on the way in.
 */
const widths = () => [...COLUMN_WIDTHS];

/** The lines are boxed and ruled down every column; the totals below them are not. */
function gridLayout(headCount: number) {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 || i === headCount || i === node.table.body.length ? RULE : 0,
    vLineWidth: () => RULE,
    hLineColor: () => "#000000",
    vLineColor: () => "#000000",
    fillColor: (i: number) => (i < headCount ? HEAD_FILL : null),
    paddingTop: () => PADDING,
    paddingBottom: () => PADDING,
    paddingLeft: () => PADDING,
    paddingRight: () => PADDING,
  };
}

const noBorders = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingTop: () => 1,
  paddingBottom: () => 1,
  paddingLeft: () => PADDING,
  paddingRight: () => PADDING,
};

export function buildDoc(computed: ComputedQuote): TDocumentDefinitions {
  const quote = computed.quote;
  const content: Content[] = [
    {
      stack: [
        { text: company.name, bold: true, fontSize: 13 },
        ...letterhead.slice(1).map((line) => ({ text: line })),
        { text: "PROFORMA INVOICE", bold: true, margin: [0, 6, 0, 0] as [number, number, number, number] },
      ],
      alignment: "center",
      margin: [0, 0, 0, 8],
    },
    {
      table: { widths: ["*", "*"], body: metaRows(quote).map(([left, right]) => [left, right]) },
      layout: noBorders,
      margin: [0, 0, 0, 10],
    },
  ];

  for (const section of computed.sections) {
    const head = headRows(quote);
    const lines = lineRows(section, quote);

    content.push({
      columns: [
        { text: sectionTitle(section), bold: true },
        { text: hsnLabel, alignment: "right" },
      ],
      margin: [0, 0, 0, 3],
    });

    content.push({
      table: { widths: widths(), headerRows: head.length, body: toBody([...head, ...lines]) },
      layout: gridLayout(head.length),
    });

    content.push({
      table: {
        widths: widths(),
        body: toBody(tailRows(section, quote, computed.sections.length === 1)),
      },
      layout: noBorders,
      margin: [0, 2, 0, 10],
    });
  }

  content.push({
    table: { widths: widths(), body: toBody(summaryRows(computed)) },
    layout: noBorders,
    margin: [0, 0, 0, 9],
  });

  // The closing blocks read as one thing each, so none of them is allowed to be
  // split by a page break.
  content.push({
    table: {
      widths: ["*", "*"],
      body: [
        [
          { text: "BANK DETAILS", bold: true, alignment: "center" },
          { text: "TERMS :-", bold: true },
        ],
        [{ stack: [...bankRows] }, { stack: [...termRows] }],
      ],
    },
    layout: noBorders,
    unbreakable: true,
    margin: [0, 0, 0, 9],
  });

  content.push({
    stack: [{ text: "NOTE :", bold: true }, ...company.notes.map((n) => ({ text: n }))],
    alignment: "center",
    unbreakable: true,
    margin: [0, 0, 0, 9],
  });

  content.push({
    stack: [
      { text: "CUSTOMERS ACCEPTANCE", bold: true, alignment: "center" },
      {
        columns: company.signatureBlocks.map((b) => ({ text: b })),
        margin: [0, 30, 0, 0] as [number, number, number, number],
      },
    ],
    unbreakable: true,
  });

  return {
    pageSize: "A4",
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: "Roboto", fontSize: 8, lineHeight: 1.15 },
    info: {
      title: `Proforma ${quote.proformaNo}`.trim(),
      author: company.name,
    },
    content,
  };
}

/**
 * pdfmake and its fonts are close to a megabyte, so they are fetched the first
 * time a quote is downloaded rather than on the way into the entry screen.
 */
export async function printer() {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);

  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });

  return pdfMake;
}

export async function downloadPdf(computed: ComputedQuote): Promise<void> {
  const pdfMake = await printer();
  pdfMake.createPdf(buildDoc(computed)).download(fileNameFor(computed.quote));
}
