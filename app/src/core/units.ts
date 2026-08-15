import Decimal from "decimal.js";
import type { InputUnit, PrintUnit } from "./types";

/**
 * The conversion factor is 10.764 exactly, not 10.7639. Confirmed on all 79
 * sample lines where a conversion occurs; using the more precise value puts the
 * printed areas out by enough to fail the regression tests.
 */
export const SQFT_PER_SQM = new Decimal("10.764");

export const MM_PER_FOOT = new Decimal("304.8");
export const MM_PER_INCH = new Decimal("25.4");

/** Foot-to-foot results in millimetres are nudged up to a whole 5 mm (dev-plan §2.2). */
const MM_STEP = new Decimal(5);

const FRACTION = /^\s*(-?\d+(?:\.\d+)?)?\s*(?:(\d+)\s*\/\s*(\d+))?\s*$/;

/**
 * Parse a typed dimension. Inch entry accepts eighths written as "33 1/4" or a
 * bare "5/8", since 96 of the 137 inch lines in the samples use fractions and no
 * mm line ever does.
 */
export function parseDimension(text: string, unit: InputUnit): number | null {
  const raw = String(text).trim();
  if (raw === "") return null;

  if (unit === "mm") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  const m = FRACTION.exec(raw);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;

  const whole = m[1] === undefined ? new Decimal(0) : new Decimal(m[1]);
  if (m[2] === undefined) return whole.toNumber();

  const den = new Decimal(m[3]);
  if (den.isZero()) return null;
  const frac = new Decimal(m[2]).div(den);
  return whole.isNegative() ? whole.minus(frac).toNumber() : whole.plus(frac).toNumber();
}

/** Render inches back as the sheet writes them: 33.25 becomes "33 1/4". */
export function formatInches(value: number, denominator = 8): string {
  const d = new Decimal(value);
  const sign = d.isNegative() ? "-" : "";
  const abs = d.abs();
  const whole = abs.floor();
  const eighths = abs.minus(whole).times(denominator).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  if (eighths.isZero()) return `${sign}${whole.toString()}`;
  if (eighths.gte(denominator)) return `${sign}${whole.plus(1).toString()}`;

  let num = eighths.toNumber();
  let den = denominator;
  while (num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const wholePart = whole.isZero() ? "" : `${whole.toString()} `;
  return `${sign}${wholePart}${num}/${den}`;
}

/**
 * Round a dimension up to a whole foot: 8.2 ft becomes 9 ft, and 8 ft stays 8 ft.
 * Only the overhang moves the size up (confirmed with the customer).
 */
export function toNextFoot(value: number, unit: InputUnit): number {
  const x = new Decimal(value);
  if (x.lte(0)) return 0;

  if (unit === "inch") return x.div(12).ceil().times(12).toNumber();

  const feet = x.div(MM_PER_FOOT).ceil().times(MM_PER_FOOT);
  return feet.div(MM_STEP).ceil().times(MM_STEP).toNumber();
}

/**
 * Printed area. Input unit and printed unit are independent, so all four
 * combinations below occur in real quotes (dev-plan §2.1).
 */
export function areaOf(
  inputUnit: InputUnit,
  printUnit: PrintUnit,
  chargeableH: number,
  chargeableW: number,
  qty: number,
): Decimal {
  const h = new Decimal(chargeableH);
  const w = new Decimal(chargeableW);
  const q = new Decimal(qty);

  if (inputUnit === "mm") {
    const sqm = h.div(1000).times(w.div(1000)).times(q);
    return printUnit === "SQFT" ? sqm.times(SQFT_PER_SQM) : sqm;
  }

  const sqft = h.times(w).div(144).times(q);
  return printUnit === "SQFT" ? sqft : sqft.div(SQFT_PER_SQM);
}

/**
 * Guess the input unit from magnitude: 2-digit values are inches, 3-4 digit
 * values are millimetres. Used to warn on entry, never to override the quote
 * setting.
 */
export function inferInputUnit(value: number): InputUnit {
  return Math.abs(value) < 100 ? "inch" : "mm";
}
