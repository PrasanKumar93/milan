import type { ReactNode } from "react";
import type { ComputedSection } from "../core/engine";
import { formatArea, formatMoney } from "../core/money";
import type { Quote, Section } from "../core/types";
import { NumberField, OverrideDot } from "../ui/controls";

/**
 * The tail of a section. The rounded subtotal is the one editable total: a
 * discount is not a printed line in this business, it is the operator writing a
 * lower round figure, so that is exactly how it is recorded (dev-plan §2.9).
 */
export function SectionTotals({
  quote,
  computed,
  onPatchSection,
}: {
  quote: Quote;
  computed: ComputedSection;
  onPatchSection: (patch: Partial<Section>) => void;
}) {
  const c = computed;
  const charges = c.taxableCharges.plus(c.untaxedCharges);

  return (
    // Striped for the same reason the charges are: label at one end, figure at
    // the other, and nothing in between to follow.
    <div className="totals totals--zebra">
      <Row label={`Area (${quote.printUnit})`} value={formatArea(c.totalArea)} />
      <Row label="Total" value={formatMoney(c.subtotal)} />

      <div className="totals__row">
        <span className="totals__label">Rounded</span>
        <div className="pair">
          <NumberField
            value={c.rounded.value.toNumber()}
            width={130}
            className={c.rounded.overridden ? "input--overridden" : "input--derived"}
            title={
              c.rounded.overridden
                ? `Rounding the total gives ${c.rounded.computed.toFixed(2)}`
                : "Total, to the nearest rupee"
            }
            onChange={(v) =>
              onPatchSection({ rounded: c.rounded.computed.eq(v) ? null : v })
            }
          />
          {c.rounded.overridden && (
            <OverrideDot title={`Rounding gives ${c.rounded.computed.toFixed(2)}`} />
          )}
        </div>
      </div>

      {!c.discount.isZero() && (
        <Row
          label={c.discount.isPositive() ? "Discount given" : "Added on rounding"}
          value={formatMoney(c.discount.abs())}
          muted
        />
      )}

      {!charges.isZero() && <Row label="Charges" value={formatMoney(charges)} />}

      {quote.gstApplicable && (
        <>
          <Row label={`CGST ${quote.gstPct}%`} value={formatMoney(c.cgst)} muted />
          <Row label={`SGST ${quote.gstPct}%`} value={formatMoney(c.sgst)} muted />
        </>
      )}

      <div className="totals__row totals__row--grand">
        <span className="totals__label strong">Section total</span>
        <span className="totals__value">₹ {formatMoney(c.total)}</span>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="totals__row">
      <span className={`totals__label ${muted ? "muted" : ""}`}>{label}</span>
      <span className={`totals__value ${muted ? "muted" : ""}`}>{value}</span>
    </div>
  );
}
