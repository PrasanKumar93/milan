/**
 * Domain model for a proforma quotation.
 *
 * The stored model holds only what the operator typed. Every derived number
 * (chargeable size, area, amount, rounded subtotal) is either absent — meaning
 * "use the computed default" — or an explicit override. Resetting a field is
 * therefore setting it back to null, and the engine never has to guess whether
 * a stored number was calculated or typed. See dev-plan §2.8.
 */

export type InputUnit = "mm" | "inch";
export type PrintUnit = "SQFT" | "SQMT";

/** dev-plan §2.2. `fixed` adds an allowance; `foot_to_foot` rounds each side up to a whole foot. */
export type WastageRule = "fixed" | "foot_to_foot";

/** How the charge catalogue describes a charge: counted, or charged once (§2.9). */
export type ChargeBasis = "per_unit" | "flat";

export interface Line {
  id: string;
  /** BLOCK, DRW, TEMPLATE, MIRROR — free text, defaulted from the shape master. */
  shape: string;
  actualH: number;
  actualW: number;
  /** One allowance for both sides. null inherits the section value. Ignored under foot_to_foot. */
  wastage: number | null;
  chargeableH: number | null;
  chargeableW: number | null;
  qty: number;
  area: number | null;
  rate: number;
  amount: number | null;
}

export interface Adjustment {
  id: string;
  label: string;
  /**
   * How many of them. Zero means the charge is not counted — the rate is the
   * whole charge, and the printed line carries no count, which is how the sheet
   * writes a document or transport charge (dev-plan §2.9).
   */
  qty: number;
  rate: number;
  amount: number | null;
}

/**
 * Wastage is entirely a section-level decision: the rule follows the glass, and
 * the allowance is set beside it so there is one place to look rather than two
 * (dev-plan §2.2).
 */
export interface Section {
  id: string;
  /** Printed section title, e.g. "10MM CLEAR TOUGHENED GLASS". */
  product: string;
  /** Short form for the summary block, e.g. "10MM CTG". */
  shortCode: string;
  wastageRule: WastageRule;
  /** Fixed allowance for this section, in the input unit. Ignored under foot_to_foot. */
  wastage: number;
  lines: Line[];
  adjustments: Adjustment[];
  /** Operator-entered rounded subtotal. A discount is recorded here (dev-plan §2.9). */
  rounded: number | null;
}

export interface Quote {
  proformaNo: string;
  /** dd/mm/yyyy, as printed. Free text so an operator can match whatever the sheet says. */
  date: string;
  customerName: string;
  customerAddress: string;
  customerGstin: string;
  projectRemark: string;
  refPerson: string;
  partyNo: string;
  docNo: string;
  orderNo: string;
  dispatchTo: string;
  /** Set once per quote and inherited by every line — verified across all 47 samples (§2.1). */
  inputUnit: InputUnit;
  printUnit: PrintUnit;
  gstApplicable: boolean;
  /** CGST and SGST each charge this rate. */
  gstPct: number;
  sections: Section[];
}
