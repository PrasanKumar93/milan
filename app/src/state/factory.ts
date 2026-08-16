import { wastageRuleFor } from "../core/products";
import type { Adjustment, InputUnit, Line, Quote, Section } from "../core/types";
import {
  chargeTypeFor,
  chargeTypes,
  company,
  defaultProduct,
  defaultWastage,
  shapes,
  shortCodeFor,
} from "../data/masters";
import { polishRate } from "../core/products";

/**
 * Builders for a new quote and its parts. Every default the operator sees when
 * they start typing is decided here, in one place, rather than scattered through
 * the UI.
 */

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** dd/mm/yyyy, the format the sheet prints. */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

export function newLine(section: Section): Line {
  return {
    id: id("l"),
    shape: shapes[0],
    actualH: 0,
    actualW: 0,
    wastage: null,
    chargeableH: null,
    chargeableW: null,
    qty: 1,
    // A new line inherits the rate already in use, since a section is one glass
    // at one price far more often than not (dev-plan §2.5).
    rate: section.lines.length > 0 ? section.lines[section.lines.length - 1].rate : 0,
    area: null,
    amount: null,
  };
}

export function newSection(inputUnit: InputUnit, product = defaultProduct): Section {
  const section: Section = {
    id: id("s"),
    product,
    shortCode: shortCodeFor(product),
    wastageRule: wastageRuleFor(product),
    wastage: defaultWastage(inputUnit),
    lines: [],
    adjustments: [],
    rounded: null,
  };
  return { ...section, lines: [newLine(section)] };
}

/**
 * Charges arrive with their catalogue defaults filled in. Polish is the one
 * whose rate depends on the glass, so it is computed from the section (§3.3).
 *
 * The catalogue also says whether a charge is normally counted, which sets the
 * count to one hole or to none at all; either way the operator can change it.
 */
export function newAdjustment(section: Section, label = chargeTypes[0].label): Adjustment {
  const type = chargeTypeFor(label);
  const rate =
    type?.ratePerThicknessMm !== undefined ? polishRate(section.product) : (type?.rate ?? 0);

  return {
    id: id("a"),
    label,
    qty: type?.basis === "per_unit" ? 1 : 0,
    rate,
    amount: null,
    taxable: type?.taxable ?? true,
  };
}

export function newQuote(proformaNo = ""): Quote {
  const inputUnit: InputUnit = "mm";
  return {
    proformaNo,
    date: today(),
    customerName: "",
    customerAddress: "",
    customerGstin: "",
    projectRemark: "",
    refPerson: "",
    partyNo: "",
    docNo: "",
    orderNo: "",
    dispatchTo: "",
    inputUnit,
    printUnit: "SQMT",
    gstApplicable: true,
    gstPct: company.defaults.gstPct,
    sections: [newSection(inputUnit)],
  };
}

/**
 * Switching the quote's unit refills every allowance with the standard for that
 * unit and clears chargeable overrides, since a size typed in millimetres means
 * nothing once the quote is in inches.
 */
export function switchInputUnit(quote: Quote, inputUnit: InputUnit): Quote {
  const wastage = defaultWastage(inputUnit);
  return {
    ...quote,
    inputUnit,
    sections: quote.sections.map((s) => ({
      ...s,
      wastage,
      lines: s.lines.map((l) => ({ ...l, wastage: null, chargeableH: null, chargeableW: null })),
    })),
  };
}
