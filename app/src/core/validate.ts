import { cardPrice, wastageRuleFor } from "../data/masters";
import type { ComputedQuote } from "./engine";
import { formatMoney } from "./money";
import { splitProduct } from "./products";

/**
 * Warnings, never blocks (dev-plan §7).
 *
 * Overrides are the whole point of the app, so nothing here refuses a value. It
 * points at the handful of things that were actually wrong in the sample
 * quotations — a SQFT rate typed into a SQMT quote, a section quietly discounted,
 * a mirror left on fixed wastage — plus the one the samples were right about but
 * only by habit: which of the card's two prices already has GST in it.
 * Everything here leaves the decision with the operator.
 *
 * Each warning carries a tag as well as its sentence. The list is read while
 * somebody is waiting on the phone, and "GST twice" is the part that has to land
 * in a glance; the sentence is there for the operator who then asks why.
 */

export interface Warning {
  sectionId: string;
  lineId?: string;
  /** Two or three words naming the mistake, read before the sentence explaining it. */
  tag: string;
  text: string;
}

/** A discount larger than this share of the section is worth a second look. */
export const DISCOUNT_WARN_PCT = 5;

/** A rate this far from the rate card is more likely the wrong unit than a deal. */
const RATE_FACTOR = 5;

/** How near the card a rate has to be before it is taken to *be* the card's. */
const ON_THE_CARD = 0.02;

export function warningsFor(computed: ComputedQuote): Warning[] {
  const out: Warning[] = [];

  for (const [n, s] of computed.sections.entries()) {
    const section = s.section;
    const id = section.id;
    const price = cardPrice(section.product, section.printUnit);
    const card = price?.rate;
    const started = s.lines.some((l) => l.line.actualH > 0 || l.line.actualW > 0);

    /*
     * Nothing is chosen for the operator any more, which means a section can be
     * priced and printed with no glass on it — the one line of the proforma that
     * says what was sold. A section nobody has typed a size into is the next
     * section, not a mistake, so this waits until the work has started.
     */
    if (started && splitProduct(section.product).glassType === "") {
      out.push({
        sectionId: id,
        tag: "No glass",
        text: `Section ${n + 1} has no glass chosen, so the proforma has nothing to describe it by.`,
      });
    }

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

      if (onTheCard && price.includesGst && section.gstApplicable) {
        out.push({
          sectionId: id,
          tag: "GST twice",
          text: `${section.product} is at the card's ₹${price.rate.toLocaleString("en-IN")} per ${section.printUnit}, which already includes GST, and this section adds GST on top. Before tax it is about ₹${formatMoney(price.rate / (1 + section.gstPct / 50))}.`,
        });
      }

      if (onTheCard && !price.includesGst && !section.gstApplicable) {
        out.push({
          sectionId: id,
          tag: "GST missing",
          text: `${section.product} is at the card's ₹${price.rate.toLocaleString("en-IN")} per ${section.printUnit}, which is before GST, and this section adds none.`,
        });
      }
    }

    if (section.wastageRule !== wastageRuleFor(section.product)) {
      out.push({
        sectionId: id,
        tag: "Wastage rule",
        text: `${section.product} is usually measured ${
          wastageRuleFor(section.product) === "foot_to_foot" ? "foot to foot" : "on a fixed allowance"
        }, and this section is set the other way.`,
      });
    }

    s.lines.forEach((l, i) => {
      const line = l.line;
      // A row nobody has typed a size into yet is not a mistake, it is the next row.
      if (line.actualH <= 0 && line.actualW <= 0) return;

      if (line.rate <= 0) {
        out.push({ sectionId: id, lineId: line.id, tag: "No rate", text: `Row ${i + 1} has no rate.` });
      } else if (card !== undefined && (line.rate < card / RATE_FACTOR || line.rate > card * RATE_FACTOR)) {
        out.push({
          sectionId: id,
          lineId: line.id,
          tag: "Rate unit",
          text: `Row ${i + 1} is at ₹${formatMoney(line.rate)} per ${section.printUnit} where the rate card says ₹${formatMoney(card)}. Check the unit.`,
        });
      }

      if (line.qty <= 0) {
        out.push({
          sectionId: id,
          lineId: line.id,
          tag: "No quantity",
          text: `Row ${i + 1} has no quantity.`,
        });
      }
    });

    // The rounded figure is where a negotiated reduction lands (§2.9), so this
    // names the amount rather than objecting to it.
    if (s.discounted) {
      const pct = s.subtotal.isZero() ? 0 : s.discount.div(s.subtotal).times(100).toNumber();
      const big = Math.abs(pct) > DISCOUNT_WARN_PCT;
      out.push({
        sectionId: id,
        // Which of the two it is, before the sentence says how much.
        tag: big ? "Discount" : "Rounding",
        text: `${section.product} is rounded ${s.discount.isPositive() ? "down" : "up"} by ₹${formatMoney(
          s.discount.abs(),
        )}, ${Math.abs(pct).toFixed(1)}% of the total${big ? " — larger than a rounding" : ""}.`,
      });
    }
  }

  return out;
}
