import Decimal from "decimal.js";

/**
 * All money and area arithmetic runs through Decimal. Floats are never used —
 * the sheet prints areas to six places and rupees to two, and float drift shows
 * up directly in a customer-facing document.
 */
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type Numeric = Decimal | number | string;

export function d(value: Numeric): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Rupees and paise, half-up. Used for GST and every printed amount. */
export function toPaise(value: Numeric): Decimal {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Whole rupees, half-up — the default the rounded subtotal is pre-filled with. */
export function toRupees(value: Numeric): Decimal {
  return d(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/** Indian-format money for display: 1,26,363.00 */
export function formatMoney(value: Numeric): string {
  return d(value).toNumber().toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Seven significant figures, trailing zeros dropped, no thousands separators.
 *
 * This is not a house style, it is what the existing sheet does: all 1,086
 * numbers printed across the 47 samples carry seven significant figures and not
 * one carries more, which is Excel's General format in a standard-width column.
 * It is why an area prints as 10.38806, an amount as 1969.153, GST as 974.7 —
 * and why a total above a lakh loses its paise, as 261803.1 does on sample 6344.
 * The document reproduces that; the screen uses `formatMoney` above and shows
 * every paisa.
 */
export const SHEET_DIGITS = 7;

export function formatSheet(value: Numeric): string {
  const s = d(value).toSignificantDigits(SHEET_DIGITS, Decimal.ROUND_HALF_EVEN).toFixed();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Areas print the same way: 3.01, 2.821, 10.3229. */
export function formatArea(value: Numeric): string {
  return formatSheet(value);
}
