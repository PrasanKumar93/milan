import type { Content, ContentText, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
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
 * The PDF, built from the same rows as the preview (see `layout.ts`).
 *
 * A4 rather than the Letter size the current sheet exports at: the office prints
 * on A4 anyway, so today's PDF is already being scaled to fit. Column
 * proportions are kept, and so are the sheet's boxed blocks and its colours, so
 * the page reads as the document the customer already knows.
 */

/** A pixel at 96dpi, which is what the preview rules in. */
const RULE = 0.75;
const PADDING = 2;
/** A block of the page is set in from its border further than a cell of the grid. */
const BOX_PADDING = 5;

type Margin = [number, number, number, number];

/**
 * A cell asks for its four sides only where the layout leaves the choice to it —
 * the boxed figures under the lines. In the ruled grid it says nothing and takes
 * the table's own rules, because a cell that names its borders overrides them.
 */
function toCell(cell: Cell): TableCell {
  if (cell.skip) return {};
  return {
    text: cell.text,
    alignment: cell.align ?? "left",
    bold: cell.bold ?? false,
    ...(cell.size ? { fontSize: cell.size } : {}),
    ...(cell.box ? { border: [true, true, true, true] } : {}),
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

/**
 * The lines are ruled every way, with a tinted head: the sheet draws a box round
 * every cell of the grid, so one row of sizes cannot be read into the next.
 */
function gridLayout(headCount: number) {
  return {
    hLineWidth: () => RULE,
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
    paddingLeft: () => BOX_PADDING,
    paddingRight: () => BOX_PADDING,
  };
}

/**
 * The closing frame: every rule across it drawn, so each block inside is closed
 * top and bottom, and the outer border carried down the sides through the empty
 * bands between them. The rule down the middle is only ever seen beside the
 * bank details — the blocks below it are one cell wide, and a rule is not drawn
 * through a cell that spans.
 */
const framedBlocks = {
  hLineWidth: () => RULE,
  vLineWidth: () => RULE,
  hLineColor: () => INK.rule,
  vLineColor: () => INK.rule,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 5,
  paddingRight: () => 5,
};

const heading = (text: string, fontSize = 9): ContentText => ({
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
    },
  ];

  for (const [index, section] of computed.sections.entries()) {
    const head = headRows(quote);
    const lines = lineRows(section, quote);

    content.push({
      table: { widths: widths(), body: toBody(titleRows(section)) },
      layout: cellBorders,
      // The order details and the first section are one frame on the sheet: the
      // details sit on the head of the glass they were taken for. A later
      // section stands clear of the one before it, as the sheet has it.
      margin: [0, index === 0 ? -RULE : 0, 0, 0] as Margin,
    });

    content.push({
      table: { widths: widths(), headerRows: head.length, body: toBody([...head, ...lines]) },
      layout: gridLayout(head.length),
      // The glass sits on the head of its own table. Without the pull the block's
      // bottom rule and the grid's top rule are drawn one under the other, which
      // reads on the page as a rule twice the weight of every other.
      margin: [0, -RULE, 0, 0] as Margin,
    });

    content.push({
      table: { widths: widths(), body: toBody(totalsRows(computed, index)) },
      layout: cellBorders,
      /*
       * The sheet is one continuous grid: the subtotal sits on the last line
       * and the total sits on the charge above it, sharing a rule rather than
       * standing clear of it. These are separate tables only because the rules
       * below the lines come from the cells, so the joins are closed by hand —
       * pulled up by the width of a rule, which lands the two borders on each
       * other instead of leaving a pair.
       */
      margin: [0, -RULE, 0, 10] as Margin,
    });
  }

  /*
   * The bank details, the note and the acceptance are one frame on the sheet,
   * divided by rules and by a band of empty page — not three boxes with the
   * page showing between them. They are also one thing to read, so the block is
   * kept off a page break as a whole.
   */
  const wide = <T extends object>(cell: T): TableCell[] => [
    { ...cell, colSpan: 2 } as TableCell,
    {},
  ];
  const band = () => wide({ text: "" });

  content.push({
    table: {
      widths: ["*", "*"],
      body: [
        [heading("BANK DETAILS"), heading("TERMS :-")],
        [{ stack: bankRows.map(fieldText) }, { stack: termRows.map(fieldText) }],
        band(),
        wide(heading("NOTE :")),
        wide({
          stack: company.notes.map((n) => ({ text: n })),
          alignment: "center",
          color: INK.note,
        }),
        band(),
        wide(heading("CUSTOMERS ACCEPTANCE")),
        wide({ columns: signatures(stamp) }),
      ],
    },
    layout: framedBlocks,
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
