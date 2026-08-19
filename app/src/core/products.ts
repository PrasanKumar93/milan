import Decimal from "decimal.js";
import { d } from "./money";
import type { InputUnit, Line } from "./types";
import { MM_PER_FOOT } from "./units";

/**
 * Product names are stored and printed as one string ("10MM CLEAR TOUGHENED
 * GLASS") but entered as two dropdowns, so everything here works by pulling the
 * string apart again. Keeping the printed form as the stored form means a quote
 * saved before a catalogue change still prints exactly as it did.
 */

/**
 * The glass name may be half typed — a section starts with neither dropdown
 * chosen, so "10MM" on its own is a thickness waiting for a glass rather than a
 * glass called 10MM, and the trailing part is allowed to be empty.
 */
const THICKNESS = /^\s*(\d+(?:\s*\+\s*\d+)?\s*MM)\s*(.*)$/i;

export function splitProduct(product: string): { thickness: string; glassType: string } {
  const m = THICKNESS.exec(product);
  if (!m) return { thickness: "", glassType: product.trim().toUpperCase() };
  return {
    thickness: m[1].replace(/\s+/g, "").toUpperCase(),
    glassType: m[2].trim().toUpperCase(),
  };
}

/** Total glass thickness in mm. A laminated 6+6 is 12. */
export function thicknessMm(product: string): number {
  const digits = splitProduct(product).thickness.match(/\d+/g);
  return digits ? digits.reduce((sum, x) => sum + Number(x), 0) : 0;
}

/**
 * Polish as job work is priced by the glass it is done on: so many rupees per
 * millimetre of thickness, per running foot (§3.3). How many rupees is the
 * charge master's `ratePerThicknessMm` — today ₹1, so 10 MM polishes at ₹10 —
 * and it is passed in rather than kept here, because a price held in two places
 * is a price that will be changed in one of them.
 */
export function polishRate(product: string, perMm: number): number {
  return thicknessMm(product) * perMm;
}

/**
 * Perimeter of every piece, in running feet — the quantity a polish charge is
 * billed on. Uses chargeable sizes, since that is the glass being cut.
 */
export function perimeterRft(
  lines: Array<{ line: Line; chargeableH: Decimal; chargeableW: Decimal }>,
  inputUnit: InputUnit,
): Decimal {
  const perFoot = inputUnit === "mm" ? MM_PER_FOOT : d(12);
  return lines.reduce(
    (sum, l) =>
      sum.plus(l.chargeableH.plus(l.chargeableW).times(2).times(l.line.qty).div(perFoot)),
    new Decimal(0),
  );
}
