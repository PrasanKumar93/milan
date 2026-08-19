import type { ComputedQuote } from "../core/engine";
import { company } from "../data/masters";
import {
  COLUMN_WIDTHS,
  type Cell,
  type Field,
  META_DIVIDER,
  type SheetRow,
  bankRows,
  headRows,
  letterhead,
  lineRows,
  metaRows,
  signatureRows,
  termRows,
  titleRows,
  totalsRows,
} from "../export/layout";
import { LOGO_URL, STAMP_URL } from "../export/marks";

/**
 * The document, on screen, at the size it comes out of the printer: an A4 page
 * with the PDF's own margins and type sizes, so "what prints" is what prints.
 *
 * Every row comes from `layout.ts`, which also builds the PDF, so the preview
 * cannot promise something the download does not deliver. Nothing from the entry
 * screen appears here: no wastage column, no override markers, no working — the
 * customer's copy has never shown any of it (dev-plan §2.10).
 */
export function PrintView({ computed }: { computed: ComputedQuote }) {
  const quote = computed.quote;
  const meta = metaRows(quote);

  return (
    <div className="page-sheet">
      <div className="print">
        <div className="print__head">
          <img className="print__logo" src={LOGO_URL} alt="" />
          <div className="print__letterhead">
            <h2>{company.name}</h2>
            {letterhead.slice(1).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>

        <div className="print__title">PROFORMA INVOICE</div>

        <div className="print__box print__meta">
          {meta.map(([left, right], i) => (
            <div
              key={i}
              className={`print__meta-row${i === META_DIVIDER ? " print__meta-row--rule" : ""}`}
            >
              <span>
                <Labelled field={left} />
              </span>
              <span>
                <Labelled field={right} />
              </span>
            </div>
          ))}
        </div>

        {computed.sections.map((section, i) => (
          <PrintSection key={section.section.id} computed={computed} index={i} />
        ))}

        {/*
          One frame round the three closing blocks, divided by rules and by a
          band of empty page, as the sheet has always closed the document.
        */}
        <div className="print__box print__closing">
          <div className="print__cols">
            <div>
              <div className="print__block-head">BANK DETAILS</div>
              <div className="print__block-body">
                {bankRows.map((line) => (
                  <div key={line.label + line.value}>
                    <Labelled field={line} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="print__block-head">TERMS :-</div>
              <div className="print__block-body">
                {termRows.map((line) => (
                  <div key={line.label}>
                    <Labelled field={line} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="print__band" />

          <div className="print__note">
            <div className="print__block-head">NOTE :</div>
            <div className="print__block-body">
              {company.notes.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
          </div>

          <div className="print__band" />

          <div>
            <div className="print__block-head">CUSTOMERS ACCEPTANCE</div>
            {/* The company's stamp stands over the last of the four names. */}
            <div className="print__sign">
              {signatureRows.map((name, i) => (
                <div key={name.label}>
                  {i === signatureRows.length - 1 && (
                    <img className="print__stamp" src={STAMP_URL} alt="" />
                  )}
                  <div>
                    <Labelled field={name} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** `LABEL : value` — the label bold, the value as typed (see `Field`). */
function Labelled({ field }: { field: Field }) {
  return (
    <>
      {field.label && <span className="print__label">{field.label}</span>}
      {field.label && field.value ? " " : ""}
      {field.value}
    </>
  );
}

function PrintSection({ computed, index }: { computed: ComputedQuote; index: number }) {
  const quote = computed.quote;
  const section = computed.sections[index];

  return (
    <div className="print__section">
      {/* Drawn in the sheet's own columns, so the HSN code stands in the width
          of the amount column below it. */}
      <Sheet rows={titleRows(section)} className="print-table print-table--plain" />
      <Sheet head={headRows(quote)} rows={lineRows(section, quote)} />
      {/* The last section carries the quote's total: one block to the bottom. */}
      <Sheet rows={totalsRows(computed, index)} className="print-table print-table--plain" />
    </div>
  );
}

const TOTAL_WIDTH = COLUMN_WIDTHS.reduce((a, b) => a + b, 0);

/** One column's share of the sheet, for anything drawn to line up with it. */
const share = (column: number) => `${(COLUMN_WIDTHS[column] / TOTAL_WIDTH) * 100}%`;

function Sheet({
  head,
  rows,
  className = "print-table",
}: {
  head?: SheetRow[];
  rows: SheetRow[];
  className?: string;
}) {
  return (
    <table className={className}>
      <colgroup>
        {COLUMN_WIDTHS.map((_, i) => (
          <col key={i} style={{ width: share(i) }} />
        ))}
      </colgroup>
      {head && (
        <thead>
          {head.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => renderCell(cell, j, "th"))}</tr>
          ))}
        </thead>
      )}
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => renderCell(cell, j, "td"))}</tr>
        ))}
      </tbody>
    </table>
  );
}

function renderCell(cell: Cell, key: number, tag: "td" | "th") {
  if (cell.skip) return null;

  const props = {
    colSpan: cell.colSpan,
    rowSpan: cell.rowSpan,
    className: `${cell.box ? "boxed" : ""}${cell.highlight ? " highlight" : ""}`.trim() || undefined,
    style: {
      textAlign: cell.align ?? "left",
      fontWeight: cell.bold ? 600 : undefined,
      fontSize: cell.size ? `${cell.size}pt` : undefined,
    } as const,
  };

  return tag === "th" ? (
    <th key={key} {...props}>
      {cell.text}
    </th>
  ) : (
    <td key={key} {...props}>
      {cell.text}
    </td>
  );
}
