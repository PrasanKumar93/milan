import type { Content, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import type { ComputedQuote } from "../core/engine";
import { company } from "../data/masters";
import {
  type Cell,
  type Field,
  type SheetRow,
  COLUMN_WIDTHS,
  INK,
  META_DIVIDER,
  bankRows,
  fileNameFor,
  headRows,
  hsnLabel,
  letterhead,
  lineRows,
  metaRows,
  sectionTitle,
  signatureRows,
  summaryRows,
  tailRows,
  termRows,
} from "./layout";
import { type Marks, marks } from "./marks";

/**
 * The PDF, built from the same rows as the preview (see `layout.ts`).
 *
 * A4 rather than the Letter size the current sheet exports at: the office prints
 * on A4 anyway, so today's PDF is already being scaled to fit. Column
 * proportions are kept, and so are the sheet's boxed blocks and its colours, so
 * the page reads as the document the customer already knows.
 */

const RULE = 0.5;
const PADDING = 2;

type Margin = [number, number, number, number];

function toCell(cell: Cell): TableCell {
  if (cell.skip) return {};
  return {
    text: cell.text,
    alignment: cell.align ?? "left",
    bold: cell.bold ?? false,
    border: [cell.box ?? false, cell.box ?? false, cell.box ?? false, cell.box ?? false],
    ...(cell.highlight ? { fillColor: INK.totalFill } : {}),
    ...(cell.colSpan ? { colSpan: cell.colSpan } : {}),
    ...(cell.rowSpan ? { rowSpan: cell.rowSpan } : {}),
  };
}

function toBody(rows: SheetRow[]): TableCell[][] {
  return rows.map((row) => row.map(toCell));
}

/**
 * pdfmake rewrites the arrays it is handed in place, turning the strings into
 * its own node objects. Everything shared with the preview and the workbook is
 * therefore copied on the way in.
 */
const widths = () => [...COLUMN_WIDTHS];

const padding = {
  paddingTop: () => PADDING,
  paddingBottom: () => PADDING,
  paddingLeft: () => PADDING,
  paddingRight: () => PADDING,
};

/** The lines are boxed and ruled down every column, with a tinted head. */
function gridLayout(headCount: number) {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 || i === headCount || i === node.table.body.length ? RULE : 0,
    vLineWidth: () => RULE,
    hLineColor: () => INK.rule,
    vLineColor: () => INK.rule,
    fillColor: (i: number) => (i < headCount ? INK.headFill : null),
    ...padding,
  };
}

/**
 * Under the lines each figure is boxed on its own, so the rules come from the
 * cells rather than from the table: `defaultBorder` off, and every cell that
 * carries text asks for its four sides (see `boxed` in layout.ts).
 */
const cellBorders = {
  defaultBorder: false,
  hLineWidth: () => RULE,
  vLineWidth: () => RULE,
  hLineColor: () => INK.rule,
  vLineColor: () => INK.rule,
  ...padding,
};

/** A block of the page: ruled all round, and down the middle where it has two halves. */
function boxLayout(divider = false, rules: number[] = []) {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 || i === node.table.body.length || rules.includes(i) ? RULE : 0,
    vLineWidth: (i: number, node: { table: { body: unknown[][] } }) =>
      i === 0 || i === node.table.body[0].length || divider ? RULE : 0,
    hLineColor: () => INK.rule,
    vLineColor: () => INK.rule,
    paddingTop: () => 4,
    paddingBottom: () => 4,
    paddingLeft: () => 5,
    paddingRight: () => 5,
  };
}

const heading = (text: string, fontSize = 9): Content => ({
  text,
  bold: true,
  fontSize,
  color: INK.heading,
  alignment: "center",
});

/** `LABEL : value` — the label bold, the value as typed (see `Field`). */
const fieldText = (f: Field): { text: Array<{ text: string; bold?: boolean }> } => ({
  text: [
    ...(f.label ? [{ text: f.label, bold: true }] : []),
    ...(f.value ? [{ text: f.label ? ` ${f.value}` : f.value }] : []),
  ],
});

/** Room enough to sign in, or for the stamp that goes over the last name. */
const SIGNING_SPACE = 30;
const STAMP_WIDTH = 42;
const STAMP_HEIGHT = 49;

/**
 * The four names at the foot of the page, with the company's stamp standing
 * over the last of them. The others are dropped by the height of the stamp so
 * all four names sit on one line.
 */
function signatures(stamp?: string): Content[] {
  const drop = stamp ? STAMP_HEIGHT : SIGNING_SPACE;

  return signatureRows.map((name, i) => {
    const stamped = stamp && i === signatureRows.length - 1;
    if (!stamped) return { ...fieldText(name), margin: [0, drop, 0, 0] as Margin };

    // Held to the width of the name it stands over, so it is centred on the
    // name rather than on the quarter of the page the name starts in.
    return {
      columns: [
        {
          width: "auto",
          stack: [
            { image: stamp, width: STAMP_WIDTH, height: STAMP_HEIGHT, alignment: "center" },
            fieldText(name),
          ],
        },
      ],
    };
  });
}

export function buildDoc(computed: ComputedQuote, pictures: Marks = {}): TDocumentDefinitions {
  const quote = computed.quote;
  const { logo, stamp } = pictures;

  // The letterhead sits between the logo and a space of the same width, so the
  // name stays centred on the page rather than on what is left of it.
  const content: Content[] = [
    {
      columns: [
        logo ? { image: logo, width: 54, height: 54 } : { text: "", width: 54 },
        {
          width: "*",
          stack: [
            { text: company.name, bold: true, fontSize: 15, color: INK.heading },
            ...letterhead.slice(1).map((line) => ({ text: line, color: INK.heading })),
          ],
          alignment: "center",
        },
        { text: "", width: 54 },
      ],
      margin: [0, 0, 0, 6] as Margin,
    },
    {
      text: "PROFORMA INVOICE",
      bold: true,
      fontSize: 12,
      color: INK.title,
      alignment: "center",
      margin: [0, 0, 0, 6] as Margin,
    },
    {
      table: {
        widths: ["*", "*"],
        body: metaRows(quote).map(([left, right]) => [fieldText(left), fieldText(right)]),
      },
      layout: boxLayout(true, [META_DIVIDER]),
      margin: [0, 0, 0, 10] as Margin,
    },
  ];

  for (const [index, section] of computed.sections.entries()) {
    const head = headRows(quote);
    const lines = lineRows(section, quote);
    const last = index === computed.sections.length - 1;

    content.push({
      table: {
        widths: ["*", "auto"],
        body: [
          [
            { text: sectionTitle(section), bold: true, fontSize: 9 },
            { text: hsnLabel, alignment: "right", bold: true },
          ],
        ],
      },
      layout: boxLayout(true),
      margin: [0, 0, 0, 0] as Margin,
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
      layout: cellBorders,
      // The last section runs straight into the summary, as the sheet has the
      // total sitting on the charge above it.
      margin: [0, 2, 0, last ? 0 : 10] as Margin,
    });
  }

  content.push({
    table: { widths: widths(), body: toBody(summaryRows(computed)) },
    layout: cellBorders,
    margin: [0, 0, 0, 10] as Margin,
  });

  // The closing blocks read as one thing each, so none of them is allowed to be
  // split by a page break.
  content.push({
    table: {
      widths: ["*", "*"],
      body: [
        [heading("BANK DETAILS"), heading("TERMS :-")],
        [{ stack: bankRows.map(fieldText) }, { stack: termRows.map(fieldText) }],
      ],
    },
    layout: boxLayout(true, [1]),
    unbreakable: true,
    margin: [0, 0, 0, 10] as Margin,
  });

  content.push({
    table: {
      widths: ["*"],
      body: [
        [heading("NOTE :")],
        [
          {
            stack: company.notes.map((n) => ({ text: n })),
            alignment: "center",
            color: INK.note,
          },
        ],
      ],
    },
    layout: boxLayout(false, [1]),
    unbreakable: true,
    margin: [0, 0, 0, 10] as Margin,
  });

  content.push({
    table: {
      widths: ["*"],
      body: [[heading("CUSTOMERS ACCEPTANCE")], [{ columns: signatures(stamp) }]],
    },
    layout: boxLayout(false, [1]),
    unbreakable: true,
  });

  return {
    pageSize: "A4",
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: "Roboto", fontSize: 8, lineHeight: 1.15, color: INK.text },
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
  const [pdfMake, pictures] = await Promise.all([printer(), marks()]);
  pdfMake.createPdf(buildDoc(computed, pictures)).download(fileNameFor(computed.quote));
}
