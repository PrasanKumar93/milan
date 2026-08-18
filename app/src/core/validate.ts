import { cardPrice } from "../data/masters";
import type { ComputedQuote } from "./engine";
import { formatMoney } from "./money";
import { wastageRuleFor } from "./products";

/**
 * Warnings, never blocks (dev-plan §7).
 *
 * Overrides are the whole point of the app, so nothing here refuses a value. It
 * points at the handful of things that were actually wrong in the sample
 * quotations — a SQFT rate typed into a SQMT quote, a section quietly discounted,
 * a mirror left on fixed wastage — plus the one the samples were right about but
 * only by habit: which of the card's two prices already has GST in it.
 * Everything here leaves the decision with the operator.
 */

export interface Warning {
  sectionId: string;
  lineId?: string;
  text: string;
}

/** A discount larger than this share of the section is worth a second look. */
export const DISCOUNT_WARN_PCT = 5;

/** A rate this far from the rate card is more likely the wrong unit than a deal. */
const RATE_FACTOR = 5;

/** How near the card a rate has to be before it is taken to *be* the card's. */
const ON_THE_CARD = 0.02;

export function warningsFor(computed: ComputedQuote): Warning[] {
  const quote = computed.quote;
  const out: Warning[] = [];

  for (const s of computed.sections) {
    const section = s.section;
    const id = section.id;
    const price = cardPrice(section.product, quote.printUnit);
    const card = price?.rate;

    /*
     * The card's two columns mean different things: a square-metre price is
     * before tax and a square-foot price has it in already (§2.5), and the two
     * settings that decide which applies — printed unit and GST — are set
     * independently. So a quote can end up taxing a taxed price, or printing a
     * pre-tax price with no tax on it, and both look like ordinary numbers.
     *
     * Only rows still sitting on the card figure are worth mentioning: an
     * operator who has typed their own rate has decided what it includes.
     */
    if (price !== undefined) {
      const onTheCard = s.lines.some(
        (l) =>
          l.line.rate > 0 &&
          Math.abs(l.line.rate - price.rate) <= price.rate * ON_THE_CARD &&
          (l.line.actualH > 0 || l.line.actualW > 0),
      );

      if (onTheCard && price.includesGst && quote.gstApplicable) {
        out.push({
          sectionId: id,
          text: `${section.shortCode} is at the card's ₹${price.rate.toLocaleString("en-IN")} per ${quote.printUnit}, which already includes GST, and this quote adds GST on top. Before tax it is about ₹${formatMoney(price.rate / (1 + quote.gstPct / 50))}.`,
        });
      }

      if (onTheCard && !price.includesGst && !quote.gstApplicable) {
        out.push({
          sectionId: id,
          text: `${section.shortCode} is at the card's ₹${price.rate.toLocaleString("en-IN")} per ${quote.printUnit}, which is before GST, and this quote adds none.`,
        });
      }
    }

    if (section.wastageRule !== wastageRuleFor(section.product)) {
      out.push({
        sectionId: id,
        text: `${section.shortCode} is usually measured ${
          wastageRuleFor(section.product) === "foot_to_foot" ? "foot to foot" : "on a fixed allowance"
        }, and this section is set the other way.`,
      });
    }

    s.lines.forEach((l, i) => {
      const line = l.line;
      // A row nobody has typed a size into yet is not a mistake, it is the next row.
      if (line.actualH <= 0 && line.actualW <= 0) return;

      if (line.rate <= 0) {
        out.push({ sectionId: id, lineId: line.id, text: `Row ${i + 1} has no rate.` });
      } else if (card !== undefined && (line.rate < card / RATE_FACTOR || line.rate > card * RATE_FACTOR)) {
        out.push({
          sectionId: id,
          lineId: line.id,
          text: `Row ${i + 1} is at ₹${formatMoney(line.rate)} per ${quote.printUnit} where the rate card says ₹${formatMoney(card)}. Check the unit.`,
        });
      }

      if (line.qty <= 0) {
        out.push({ sectionId: id, lineId: line.id, text: `Row ${i + 1} has no quantity.` });
      }
    });

    // The rounded figure is where a negotiated reduction lands (§2.9), so this
    // names the amount rather than objecting to it.
    if (s.discounted) {
      const pct = s.subtotal.isZero() ? 0 : s.discount.div(s.subtotal).times(100).toNumber();
      const big = Math.abs(pct) > DISCOUNT_WARN_PCT;
      out.push({
        sectionId: id,
        text: `${section.shortCode} is rounded ${s.discount.isPositive() ? "down" : "up"} by ₹${formatMoney(
          s.discount.abs(),
        )}, ${Math.abs(pct).toFixed(1)}% of the total${big ? " — larger than a rounding" : ""}.`,
      });
    }
  }

  return out;
}
