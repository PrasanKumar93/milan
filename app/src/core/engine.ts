import Decimal from "decimal.js";
import { d, toPaise, toRupees } from "./money";
import type { Adjustment, InputUnit, Line, Quote, Section, WastageRule } from "./types";
import { areaOf, toNextFoot } from "./units";

/**
 * The calculation engine (dev-plan §2).
 *
 * Every function here is pure: a quote in, a computed quote out. Nothing is
 * mutated and nothing is stored, so the same code serves the entry screen, the
 * PDF exporter and the regression tests without them ever disagreeing.
 *
 * Each computed value carries whether it came from the formula or from the
 * operator, which is what the override badges and the pre-download warning
 * summary are built on.
 */

/**
 * Rounding a subtotal to the rupee moves it by less than a rupee, so a gap up to
 * this is the rounding and nothing else. Anything beyond it was typed, and that
 * is what the business calls a discount (dev-plan §2.9).
 */
export const ROUNDING_GAP = 1;

export interface Computed<T = Decimal> {
  value: T;
  overridden: boolean;
  /** What the formula produced, kept even when overridden so the UI can show both. */
  computed: T;
}

function auto<T>(value: T): Computed<T> {
  return { value, overridden: false, computed: value };
}

function withOverride(computed: Decimal, override: number | null): Computed {
  if (override === null) return auto(computed);
  return { value: d(override), overridden: true, computed };
}

export interface ComputedLine {
  line: Line;
  /** Allowance in force on this line: the section default unless the line overrides it. */
  wastage: Decimal;
  wastageOverridden: boolean;
  chargeableH: Computed;
  chargeableW: Computed;
  /** What the chargeable size actually added per side. Under foot to foot these differ. */
  addedH: Decimal;
  addedW: Decimal;
  /**
   * The glass the piece is measured at, before any allowance — what the shop
   * cuts to. It is never priced and never overridden: it stands beside the
   * chargeable area so the difference between the two can be read off the row,
   * and that difference is the wastage (dev-plan §2.1).
   */
  actualArea: Decimal;
  /** The area the line is billed on: chargeable size by chargeable size, by the count. */
  area: Computed;
  amount: Computed;
}

export interface ComputedAdjustment {
  adjustment: Adjustment;
  amount: Computed;
}

export interface ComputedSection {
  section: Section;
  rule: WastageRule;
  lines: ComputedLine[];
  adjustments: ComputedAdjustment[];
  totalQty: Decimal;
  /** The glass as measured, added up — the same column the lines carry. */
  totalActualArea: Decimal;
  totalArea: Decimal;
  /** Sum of line amounts, printed unrounded. */
  subtotal: Decimal;
  rounded: Computed;
  /** subtotal − rounded. Positive means the operator gave a discount (dev-plan §2.9). */
  discount: Decimal;
  /** The gap is more than the rounding itself could explain, so it was meant. */
  discounted: boolean;
  charges: Decimal;
  /** Rounded subtotal plus the charges — what CGST and SGST are worked out on. */
  taxableBase: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  total: Decimal;
}

export interface ComputedQuote {
  quote: Quote;
  sections: ComputedSection[];
  grandTotal: Decimal;
  /** Every field the operator typed over, for the warning summary before download. */
  overrides: OverrideRef[];
}

export interface OverrideRef {
  sectionId: string;
  lineId?: string;
  adjustmentId?: string;
  field: string;
  computed: string;
  value: string;
}

/** dev-plan §2.2. Under foot to foot the wastage number is ignored entirely. */
export function chargeableOf(
  actual: number,
  rule: WastageRule,
  wastage: Decimal,
  inputUnit: InputUnit,
): Decimal {
  if (actual <= 0) return new Decimal(0);
  if (rule === "foot_to_foot") return d(toNextFoot(actual, inputUnit));
  return d(actual).plus(wastage);
}

export function computeLine(line: Line, section: Section): ComputedLine {
  const rule = section.wastageRule;
  const wastage = d(line.wastage ?? section.wastage);

  const chargeableH = withOverride(
    chargeableOf(line.actualH, rule, wastage, section.inputUnit),
    line.chargeableH,
  );
  const chargeableW = withOverride(
    chargeableOf(line.actualW, rule, wastage, section.inputUnit),
    line.chargeableW,
  );

  const area = withOverride(
    areaOf(
      section.inputUnit,
      section.printUnit,
      chargeableH.value.toNumber(),
      chargeableW.value.toNumber(),
      line.qty,
    ),
    line.area,
  );

  const actualArea = areaOf(
    section.inputUnit,
    section.printUnit,
    line.actualH,
    line.actualW,
    line.qty,
  );

  const amount = withOverride(area.value.times(line.rate), line.amount);

  return {
    line,
    wastage,
    wastageOverridden: line.wastage !== null && !d(line.wastage).eq(section.wastage),
    chargeableH,
    chargeableW,
    addedH: chargeableH.value.minus(line.actualH),
    addedW: chargeableW.value.minus(line.actualW),
    actualArea,
    area,
    amount,
  };
}

/** Rate times count, and where there is no count, the rate is the charge (§2.9). */
export function computeAdjustment(adjustment: Adjustment): ComputedAdjustment {
  const base =
    adjustment.qty > 0 ? d(adjustment.rate).times(adjustment.qty) : d(adjustment.rate);

  return { adjustment, amount: withOverride(base, adjustment.amount) };
}

export function computeSection(section: Section): ComputedSection {
  const lines = section.lines.map((line) => computeLine(line, section));
  const adjustments = section.adjustments.map(computeAdjustment);

  const zero = new Decimal(0);
  const totalQty = lines.reduce((sum, l) => sum.plus(l.line.qty), zero);
  const totalActualArea = lines.reduce((sum, l) => sum.plus(l.actualArea), zero);
  const totalArea = lines.reduce((sum, l) => sum.plus(l.area.value), zero);
  const subtotal = lines.reduce((sum, l) => sum.plus(l.amount.value), zero);

  const rounded = withOverride(toRupees(subtotal), section.rounded);
  const discount = subtotal.minus(rounded.value);

  // Every charge is taxed with the glass it belongs to, at that glass's own
  // rate: all 47 samples charge the tax on the extras as well as the lines,
  // and one of them taxes two sections of a quote and not the third (§2.1).
  const charges = adjustments.reduce((sum, a) => sum.plus(a.amount.value), zero);
  const taxableBase = rounded.value.plus(charges);
  const gst = section.gstApplicable
    ? toPaise(taxableBase.times(section.gstPct).div(100))
    : zero;

  return {
    section,
    rule: section.wastageRule,
    lines,
    adjustments,
    totalQty,
    totalActualArea,
    totalArea,
    subtotal,
    rounded,
    discount,
    discounted: discount.abs().gt(ROUNDING_GAP),
    charges,
    taxableBase,
    cgst: gst,
    sgst: gst,
    total: taxableBase.plus(gst).plus(gst),
  };
}

export function computeQuote(quote: Quote): ComputedQuote {
  const sections = quote.sections.map(computeSection);
  const grandTotal = sections.reduce((sum, s) => sum.plus(s.total), new Decimal(0));
  return { quote, sections, grandTotal, overrides: collectOverrides(sections) };
}

function collectOverrides(sections: ComputedSection[]): OverrideRef[] {
  const out: OverrideRef[] = [];

  for (const s of sections) {
    const sectionId = s.section.id;

    for (const l of s.lines) {
      const fields: Array<[string, Computed]> = [
        ["Chargeable height", l.chargeableH],
        ["Chargeable width", l.chargeableW],
        ["Area", l.area],
        ["Amount", l.amount],
      ];
      for (const [field, c] of fields) {
        if (c.overridden) {
          out.push({
            sectionId,
            lineId: l.line.id,
            field,
            computed: c.computed.toString(),
            value: c.value.toString(),
          });
        }
      }
      if (l.wastageOverridden) {
        out.push({
          sectionId,
          lineId: l.line.id,
          field: "Wastage",
          computed: "section allowance",
          value: l.wastage.toString(),
        });
      }
    }

    for (const a of s.adjustments) {
      if (a.amount.overridden) {
        out.push({
          sectionId,
          adjustmentId: a.adjustment.id,
          field: a.adjustment.label,
          computed: a.amount.computed.toString(),
          value: a.amount.value.toString(),
        });
      }
    }

    if (s.rounded.overridden) {
      out.push({
        sectionId,
        field: "Rounded subtotal",
        computed: s.rounded.computed.toString(),
        value: s.rounded.value.toString(),
      });
    }
  }

  return out;
}
