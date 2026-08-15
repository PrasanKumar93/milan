import type { ComputedQuote, ComputedSection } from "../core/engine";
import type { Quote } from "../core/types";
import { company } from "../data/masters";
import {
  COLUMN_WIDTHS,
  type Cell,
  type SheetRow,
  bankRows,
  headRows,
  hsnLabel,
  letterhead,
  lineRows,
  metaRows,
  sectionTitle,
  summaryRows,
  tailRows,
  termRows,
} from "../export/layout";

/**
 * The document, on screen. Every row comes from `layout.ts`, which also builds
 * the PDF, so this preview cannot promise something the download does not
 * deliver. Nothing from the entry screen appears here: no wastage column, no
 * override markers, no working — the customer's copy has never shown any of it
 * (dev-plan §2.10).
 */
export function PrintView({ computed }: { computed: ComputedQuote }) {
  const quote = computed.quote;

  return (
    <div className="print">
      <div className="print__center">
        <h2>{company.name}</h2>
        {letterhead.slice(1).map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div className="strong" style={{ marginTop: 6 }}>
          PROFORMA INVOICE
        </div>
      </div>

      <div className="print__meta">
        {metaRows(quote).map(([left, right], i) => (
          <div key={i} className="print__meta-row">
            <span>{left}</span>
            <span>{right}</span>
          </div>
        ))}
      </div>

      {computed.sections.map((section) => (
        <PrintSection key={section.section.id} quote={quote} computed={section} />
      ))}

      <Sheet rows={summaryRows(computed)} className="print-table print-table--plain" />

      <div className="print__cols">
        <div>
          <div className="strong print__center">BANK DETAILS</div>
          {bankRows.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div>
          <div className="strong">TERMS :-</div>
          {termRows.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>

      <div className="print__center" style={{ marginTop: 12 }}>
        <div className="strong">NOTE :</div>
        {company.notes.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>

      <div className="print__center strong" style={{ marginTop: 12 }}>
        CUSTOMERS ACCEPTANCE
      </div>
      <div className="print__sign">
        {company.signatureBlocks.map((b) => (
          <div key={b}>{b}</div>
        ))}
      </div>
    </div>
  );
}

function PrintSection({ quote, computed }: { quote: Quote; computed: ComputedSection }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row row--between">
        <span className="strong">{sectionTitle(computed)}</span>
        <span>{hsnLabel}</span>
      </div>
      <Sheet head={headRows(quote)} rows={lineRows(computed, quote)} />
      <Sheet rows={tailRows(computed, quote)} className="print-table print-table--plain" />
    </div>
  );
}

const TOTAL_WIDTH = COLUMN_WIDTHS.reduce((a, b) => a + b, 0);

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
        {COLUMN_WIDTHS.map((w, i) => (
          <col key={i} style={{ width: `${(w / TOTAL_WIDTH) * 100}%` }} />
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
    key,
    colSpan: cell.colSpan,
    rowSpan: cell.rowSpan,
    style: { textAlign: cell.align ?? "left", fontWeight: cell.bold ? 600 : undefined } as const,
  };

  return tag === "th" ? <th {...props}>{cell.text}</th> : <td {...props}>{cell.text}</td>;
}
