import Decimal from "decimal.js";
import type { ComputedSection } from "../core/engine";
import { perimeterRft, polishRate, thicknessMm } from "../core/products";
import type { InputUnit, Quote, Section } from "../core/types";
import { MM_PER_FOOT, SQFT_PER_SQM, formatInches, toNextFoot } from "../core/units";

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
const shown = (value: Decimal | number, unit: InputUnit) => {
  const n = typeof value === "number" ? value : value.toNumber();
  return unit === "inch" ? formatInches(n) : String(n);
};

const size = (quote: Quote) => (value: Decimal | number) => shown(value, quote.inputUnit);

const lines = (rule: string, example?: string) =>
  example ? `${rule}\n\nRow 1:  ${example}` : rule;

/** How long the size is in feet, which is the number the foot-to-foot rule acts on. */
const perFoot = (unit: InputUnit) => (unit === "mm" ? MM_PER_FOOT : new Decimal(12));

const feetOf = (value: number, unit: InputUnit) => new Decimal(value).div(perFoot(unit));

/**
 * `7.51 → 8 ft` — where the size stands in feet and the foot it is charged at.
 * Shown on the row itself, because "to next foot" told an operator the rule was
 * in force but never what it did to this particular piece.
 */
export function feetSpan(actual: number, unit: InputUnit): string {
  if (actual <= 0) return "";
  const feet = feetOf(actual, unit);
  return `${feet.toFixed(2)} → ${feet.ceil()} ft`;
}

/** The same conversion end to end, for the cell that shows what came out of it. */
export function footSteps(actual: number, unit: InputUnit): string {
  if (actual <= 0) return "";

  const feet = feetOf(actual, unit);
  const whole = feet.ceil();
  const exact = whole.times(perFoot(unit));
  const charged = toNextFoot(actual, unit);

  const steps = [
    `${actual} ÷ ${perFoot(unit)} = ${feet.toFixed(2)} ft`,
    `up to the next foot = ${whole} ft`,
    `${whole} × ${perFoot(unit)} = ${exact}`,
  ];

  // Millimetres land on a fraction — 8 ft is 2438.4 — and the shop cuts to five.
  if (unit === "mm" && !exact.eq(charged)) steps.push(`up to the next 5 mm = ${charged}`);

  return steps.join("\n");
}

/**
 * Both sides of a row, each stepped out under its own heading.
 *
 * The feet column is one box covering the height and the width, so it says both:
 * asking the operator to hover twice for one row, and telling them different
 * things depending which line they happened to be over, is how a rule ends up
 * half understood.
 */
export function footStepsPair(actualH: number, actualW: number, unit: InputUnit): string {
  const side = (label: string, actual: number) =>
    actual > 0 ? `${label} ${shown(actual, unit)}:\n${footSteps(actual, unit)}` : "";

  return [side("Height", actualH), side("Width", actualW)].filter(Boolean).join("\n\n");
}

/** Actual plus the allowance, or up to the next foot — whichever this section is on. */
export function chargeableHint(computed: ComputedSection, quote: Quote): string {
  const show = size(quote);
  const first = computed.lines[0];
  const unit = quote.inputUnit;

  if (computed.section.wastageRule === "foot_to_foot") {
    const rule = `Chargeable = the size taken up to the next whole foot (${perFoot(unit)} ${unit}). Only an overhang moves it up: a size already on a foot is left where it is.`;
    const steps = first ? footStepsPair(first.line.actualH, first.line.actualW, unit) : "";

    return steps ? `${rule}\n\nRow 1\n\n${steps}` : rule;
  }

  return lines(
    "Chargeable = actual + wastage, the same allowance added to the height and to the width.",
    first &&
      `${show(first.line.actualH)} + ${show(first.wastage)} = ${show(first.chargeableH.value)} and ${show(first.line.actualW)} + ${show(first.wastage)} = ${show(first.chargeableW.value)}`,
  );
}

/*
 * Bracketed even where the precedence would hold without it: the reader is
 * checking a price, not parsing an expression, and each pair of brackets is a
 * step they can do in their head — the height in metres, the width in metres,
 * then the two multiplied, then the count.
 */
const areaShape = (quote: Quote) => (h: string, w: string, qty: string) => {
  if (quote.inputUnit === "mm") {
    const metres = `((${h} ÷ 1000) × (${w} ÷ 1000)) × ${qty}`;
    return quote.printUnit === "SQFT" ? `(${metres}) × ${SQFT_PER_SQM}` : metres;
  }

  const feet = `((${h} × ${w}) ÷ 144) × ${qty}`;
  return quote.printUnit === "SQMT" ? `(${feet}) ÷ ${SQFT_PER_SQM}` : feet;
};

/**
 * One row's own working, for whoever is looking at that row rather than at the
 * column: the heading explains the rule with an example, and these say what
 * happened here. The workbook writes them onto the cells, where Excel can only
 * show `I9*K9` of its own accord.
 */
export function chargeableSteps(
  l: ComputedSection["lines"][number],
  rule: Section["wastageRule"],
  quote: Quote,
  side: "Height" | "Width",
): string {
  const show = size(quote);
  const actual = side === "Height" ? l.line.actualH : l.line.actualW;
  const charged = side === "Height" ? l.chargeableH.value : l.chargeableW.value;

  return rule === "foot_to_foot"
    ? `${side} up to the next foot:\n${footSteps(actual, quote.inputUnit)}`
    : `${side}: actual + wastage = ${show(actual)} + ${show(l.wastage)} = ${show(charged)}`;
}

export function areaSteps(l: ComputedSection["lines"][number], quote: Quote): string {
  const show = size(quote);
  const shape = areaShape(quote);

  return `Area = ${shape(show(l.chargeableH.value), show(l.chargeableW.value), String(l.line.qty))} = ${round(l.area.value, 6)}`;
}

export function amountSteps(l: ComputedSection["lines"][number]): string {
  return `Amount = area × rate = ${round(l.area.value, 6)} × ${l.line.rate} = ${round(l.amount.value, 2)}`;
}

/** The printed area, in whichever pair of units the quote is being typed and priced in. */
export function areaHint(computed: ComputedSection, quote: Quote): string {
  const first = computed.lines[0];

  return lines(
    `Area = ${areaShape(quote)("chargeable H", "chargeable W", "qty")}, so the count is already in it.`,
    first && areaSteps(first, quote).replace("Area = ", ""),
  );
}

/**
 * Polish, which is the one charge with a rule behind it rather than a price.
 *
 * It is also the one billed in a unit that appears nowhere else on the quote —
 * running feet of cut edge, not area — so both halves are spelled out: where the
 * ₹10 comes from, and where the 3.73 comes from. The office's own note writes it
 * as `H + W × 2 / 12 × thickness × qty`, in inches; this is the same thing in
 * whichever unit the quote is being typed in.
 */
export function polishHint(computed: ComputedSection, quote: Quote, perMm: number): string {
  const show = size(quote);
  const unit = quote.inputUnit;
  const per = perFoot(unit);
  const mm = thicknessMm(computed.section.product);

  const rft = (line: ComputedSection["lines"][number]) =>
    perimeterRft(
      [{ line: line.line, chargeableH: line.chargeableH.value, chargeableW: line.chargeableW.value }],
      unit,
    );

  const rule = [
    `Polish as job work is billed along the cut edge, in running feet — not by area. On glass sold from here it is already inside the glass rate.`,
    `Rate = ₹${perMm} × the thickness of the glass, per running foot.`,
    `Running feet = ((chargeable H + chargeable W) × 2 × qty) ÷ ${per}`,
  ].join("\n");

  const rate =
    mm > 0
      ? `Rate:  ₹${perMm} × ${mm} mm = ₹${polishRate(computed.section.product, perMm)} per running foot`
      : `Rate:  waiting on the glass — the thickness is what prices it.`;

  const rows = computed.lines
    .filter((l) => l.chargeableH.value.gt(0) && l.chargeableW.value.gt(0))
    .map(
      (l, i) =>
        `Row ${i + 1}:  ((${show(l.chargeableH.value)} + ${show(l.chargeableW.value)}) × 2 × ${l.line.qty}) ÷ ${per} = ${round(rft(l), 2)} rft`,
    );

  const total = computed.lines.reduce((sum, l) => sum.plus(rft(l)), new Decimal(0));
  const all = rows.length > 1 ? [...rows, `Every piece:  ${round(total, 2)} rft`] : rows;

  return [rule, "", rate, ...all].join("\n");
}

/** What the line is worth: the area at the rate, the count having been counted already. */
export function amountHint(computed: ComputedSection): string {
  const first = computed.lines[0];

  return lines(
    "Amount = area × rate. The rate is per unit of area, and the count is inside the area.",
    first && amountSteps(first).replace("Amount = area × rate = ", ""),
  );
}
