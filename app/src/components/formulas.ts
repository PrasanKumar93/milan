import type Decimal from "decimal.js";
import type { ComputedSection } from "../core/engine";
import type { Quote } from "../core/types";
import { SQFT_PER_SQM, formatInches } from "../core/units";

/**
 * The worked-out columns, in words.
 *
 * The whole point of the screen is that nothing about a price is hidden
 * (dev-plan §2.8), so each of the columns the app fills in for itself says what
 * it did — the rule in the heading, and the first row of this very section put
 * through it, because a formula with the operator's own numbers in it is read
 * far quicker than one with letters.
 *
 * The rule is not restated here: every explanation is built from the same
 * section and quote the engine calculated from, so a quote in inches or a
 * section on foot to foot explains itself accordingly.
 */

const round = (value: Decimal, places: number) => value.toDecimalPlaces(places).toString();

/** A size the way the row shows it: eighths for an inch quote, plain millimetres otherwise. */
const size = (quote: Quote) => (value: Decimal | number) => {
  const n = typeof value === "number" ? value : value.toNumber();
  return quote.inputUnit === "inch" ? formatInches(n) : String(n);
};

const lines = (rule: string, example?: string) =>
  example ? `${rule}\n\nRow 1:  ${example}` : rule;

/** Actual plus the allowance, or up to the next foot — whichever this section is on. */
export function chargeableHint(computed: ComputedSection, quote: Quote): string {
  const show = size(quote);
  const first = computed.lines[0];

  if (computed.section.wastageRule === "foot_to_foot") {
    const nextFoot =
      quote.inputUnit === "mm"
        ? "the next whole foot (304.8 mm) and then up to the next 5 mm"
        : "the next whole foot (12 in)";

    return lines(
      `Chargeable = the actual size taken up to ${nextFoot}. A size that already lands on a foot is left where it is.`,
      first &&
        `${show(first.line.actualH)} → ${show(first.chargeableH.value)} and ${show(first.line.actualW)} → ${show(first.chargeableW.value)}`,
    );
  }

  return lines(
    "Chargeable = actual + wastage, the same allowance added to the height and to the width.",
    first &&
      `${show(first.line.actualH)} + ${show(first.wastage)} = ${show(first.chargeableH.value)} and ${show(first.line.actualW)} + ${show(first.wastage)} = ${show(first.chargeableW.value)}`,
  );
}

/** The printed area, in whichever pair of units the quote is being typed and priced in. */
export function areaHint(computed: ComputedSection, quote: Quote): string {
  const show = size(quote);
  const first = computed.lines[0];

  /*
   * Bracketed even where the precedence would hold without it: the reader is
   * checking a price, not parsing an expression, and each pair of brackets is a
   * step they can do in their head — the height in metres, the width in metres,
   * then the two multiplied, then the count.
   */
  const shape = (h: string, w: string, qty: string) => {
    if (quote.inputUnit === "mm") {
      const metres = `((${h} ÷ 1000) × (${w} ÷ 1000)) × ${qty}`;
      return quote.printUnit === "SQFT" ? `(${metres}) × ${SQFT_PER_SQM}` : metres;
    }

    const feet = `((${h} × ${w}) ÷ 144) × ${qty}`;
    return quote.printUnit === "SQMT" ? `(${feet}) ÷ ${SQFT_PER_SQM}` : feet;
  };

  return lines(
    `Area = ${shape("chargeable H", "chargeable W", "qty")}, so the count is already in it.`,
    first &&
      `${shape(show(first.chargeableH.value), show(first.chargeableW.value), String(first.line.qty))} = ${round(first.area.value, 6)}`,
  );
}

/** What the line is worth: the area at the rate, the count having been counted already. */
export function amountHint(computed: ComputedSection): string {
  const first = computed.lines[0];

  return lines(
    "Amount = area × rate. The rate is per unit of area, and the count is inside the area.",
    first &&
      `${round(first.area.value, 6)} × ${first.line.rate} = ${round(first.amount.value, 2)}`,
  );
}
