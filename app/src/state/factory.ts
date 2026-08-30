import type {
  Adjustment,
  InputUnit,
  Line,
  Quote,
  Section,
  SectionSettings,
} from "../core/types";
import {
  chargeTypeFor,
  company,
  defaultWastage,
  shapes,
  shortCodeFor,
  wastageRuleFor,
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

/** How the first section of a quote calculates, before anyone changes it. */
export const DEFAULT_SETTINGS: SectionSettings = {
  inputUnit: "mm",
  printUnit: "SQMT",
  gstApplicable: true,
  gstPct: company.defaults.gstPct,
};

/** The settings a new section starts on: the ones already in use above it. */
export function settingsOf(section: SectionSettings): SectionSettings {
  return {
    inputUnit: section.inputUnit,
    printUnit: section.printUnit,
    gstApplicable: section.gstApplicable,
    gstPct: section.gstPct,
  };
}

/**
 * A section starts with no glass chosen. There is a most common glass, and
 * filling it in would save a click on many quotes — but it is the line the
 * proforma prints as the description of what was sold, and a default that is
 * right most of the time is one nobody reads the rest of the time.
 *
 * It does start on the settings of the section above it: an order measured in
 * inches is measured in inches throughout far more often than not, and copying
 * them down is a default that shows on the section's own line, where the next
 * thing the operator does is read it.
 */
export function newSection(settings: Partial<SectionSettings> = {}, product = ""): Section {
  const inherited = { ...DEFAULT_SETTINGS, ...settings };
  const section: Section = {
    id: id("s"),
    ...inherited,
    product,
    shortCode: shortCodeFor(product),
    wastageRule: wastageRuleFor(product),
    wastage: defaultWastage(inherited.inputUnit),
    lines: [],
    adjustments: [],
    rounded: null,
  };
  return { ...section, lines: [newLine(section)] };
}

/**
 * A charge arrives empty — no name, no count, nothing to charge — because the
 * customer types the charge and its price on the job (§3.1). Naming one off the
 * catalogue fills in what the catalogue knows: polish is the one whose rate is a
 * rule rather than a price, so it is computed from the glass (§3.3), and the
 * catalogue also says whether a charge is normally counted, which opens the row
 * at one rather than at none. Either way the operator can change it.
 */
export function newAdjustment(section: Section, label = ""): Adjustment {
  const type = chargeTypeFor(label);
  const rate =
    type?.ratePerThicknessMm !== undefined
      ? polishRate(section.product, type.ratePerThicknessMm)
      : (type?.rate ?? 0);

  return {
    id: id("a"),
    label,
    qty: type?.basis === "per_unit" ? 1 : 0,
    rate,
    amount: null,
  };
}

export function newQuote(proformaNo = ""): Quote {
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
    sections: [newSection()],
  };
}

/**
 * Switching a section's unit refills its allowance with the standard for that
 * unit and clears the chargeable overrides on its rows, since a size typed in
 * millimetres means nothing once the section is in inches. The sizes themselves
 * are left alone: they are what somebody measured, and only they know whether
 * the tape was metric.
 */
export function switchInputUnit(section: Section, inputUnit: InputUnit): Section {
  return {
    ...section,
    inputUnit,
    wastage: defaultWastage(inputUnit),
    lines: section.lines.map((l) => ({
      ...l,
      wastage: null,
      chargeableH: null,
      chargeableW: null,
    })),
  };
}
