import type { InputUnit, PrintUnit, Quote } from "../core/types";
import { Field, NumberField, Pill, TextField } from "../ui/controls";

/**
 * Everything printed above the first section: who the quote is for and the three
 * settings that change how the whole quote calculates. Wastage is not among them;
 * it belongs to a section, and is set there (dev-plan §2.2). The proforma number and
 * the date are plain text on purpose — the numbering follows the sheet the office
 * already keeps, and nothing here invents one (dev-plan §5).
 */
export function QuoteHeader({
  quote,
  onChange,
  onInputUnit,
  onPrintUnit,
}: {
  quote: Quote;
  onChange: (patch: Partial<Quote>) => void;
  onInputUnit: (unit: InputUnit) => void;
  onPrintUnit: (unit: PrintUnit) => void;
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
            <TextField
              value={quote.proformaNo}
              onChange={(v) => onChange({ proformaNo: v })}
              placeholder="7178"
            />
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
              <TextField
                value={quote.dispatchTo}
                onChange={(v) => onChange({ dispatchTo: v })}
                placeholder="Same as address"
              />
            </Field>
          </div>
        </div>

        <hr className="divider" />

        <div className="settings">
          <div className="stack">
            <span className="field__label">Sizes entered in</span>
            <div className="row row--tight">
              <Pill active={quote.inputUnit === "mm"} onClick={() => onInputUnit("mm")}>
                mm
              </Pill>
              <Pill active={quote.inputUnit === "inch"} onClick={() => onInputUnit("inch")}>
                inch
              </Pill>
            </div>
          </div>

          <div className="stack">
            <span className="field__label">Area printed in</span>
            <div className="row row--tight">
              <Pill active={quote.printUnit === "SQFT"} onClick={() => onPrintUnit("SQFT")}>
                SQFT
              </Pill>
              <Pill active={quote.printUnit === "SQMT"} onClick={() => onPrintUnit("SQMT")}>
                SQMT
              </Pill>
            </div>
          </div>

          <div className="stack">
            <span className="field__label">GST</span>
            <div className="row row--tight">
              {/* Not applied first, so that "Applied" sits beside the rate it governs. */}
              <Pill active={!quote.gstApplicable} onClick={() => onChange({ gstApplicable: false })}>
                Not applied
              </Pill>
              <Pill active={quote.gstApplicable} onClick={() => onChange({ gstApplicable: true })}>
                Applied
              </Pill>
              <NumberField
                value={quote.gstPct}
                onChange={(v) => onChange({ gstPct: v })}
                width={56}
                disabled={!quote.gstApplicable}
                title="CGST and SGST each at this rate"
              />
              <span className="muted small">% CGST + same SGST</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
