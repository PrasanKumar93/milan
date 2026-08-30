import type { Quote } from "../core/types";
import { Field, TextField } from "../ui/controls";

/**
 * Everything printed above the first section: who the quote is for, and nothing
 * about how it calculates. The units, the tax and the wastage all follow the
 * glass, so they are set on the section (dev-plan §2.1, §2.2) — a quote can run
 * millimetres on one section and inches on the next.
 *
 * The proforma number and the date are plain text on purpose: the numbering
 * follows the sheet the office already keeps, and nothing here invents one (§5).
 */
export function QuoteHeader({
  quote,
  onChange,
}: {
  quote: Quote;
  onChange: (patch: Partial<Quote>) => void;
}) {
  return (
    <section className="card">
      <div className="card__head">
        <h2>Quotation details</h2>
      </div>

      <div className="card__body">
        {/* Four short fields to a row, then the three long ones at half width
            underneath, so the form reads as two blocks rather than a ragged grid. */}
        <div className="form-grid">
          <Field label="Proforma no">
            <TextField value={quote.proformaNo} onChange={(v) => onChange({ proformaNo: v })} />
          </Field>
          <Field label="Date">
            <TextField
              value={quote.date}
              onChange={(v) => onChange({ date: v })}
              placeholder="dd/mm/yyyy"
            />
          </Field>
          <Field label="Order no">
            <TextField value={quote.orderNo} onChange={(v) => onChange({ orderNo: v })} />
          </Field>
          <Field label="Doc no">
            <TextField value={quote.docNo} onChange={(v) => onChange({ docNo: v })} />
          </Field>

          <Field label="Customer">
            <TextField
              value={quote.customerName}
              onChange={(v) => onChange({ customerName: v })}
              placeholder="M/S ..."
            />
          </Field>
          <Field label="GSTIN">
            <TextField
              value={quote.customerGstin}
              onChange={(v) => onChange({ customerGstin: v })}
            />
          </Field>
          <Field label="Ref person">
            <TextField value={quote.refPerson} onChange={(v) => onChange({ refPerson: v })} />
          </Field>
          <Field label="Party no">
            <TextField value={quote.partyNo} onChange={(v) => onChange({ partyNo: v })} />
          </Field>

          <div className="span-2">
            <Field label="Address">
              <TextField
                value={quote.customerAddress}
                onChange={(v) => onChange({ customerAddress: v })}
              />
            </Field>
          </div>
          <div className="span-2">
            <Field label="Project / remark">
              <TextField
                value={quote.projectRemark}
                onChange={(v) => onChange({ projectRemark: v })}
              />
            </Field>
          </div>
          <div className="span-2">
            <Field label="Dispatch to">
              <TextField value={quote.dispatchTo} onChange={(v) => onChange({ dispatchTo: v })} />
            </Field>
          </div>
        </div>
      </div>
    </section>
  );
}
