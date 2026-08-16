import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Decimal from "decimal.js";
import type { Adjustment, InputUnit, Line, PrintUnit, Quote, Section } from "../core/types";
import { areaOf } from "../core/units";

/**
 * The 47 parsed sample quotations, rebuilt in the app's own model.
 *
 * The samples are the specification: the engine tests assert the arithmetic
 * against them and the layout test asserts the document reproduces them
 * line for line, so both start here.
 */

export interface ParsedLine {
  sl: number;
  shape: string;
  ah: number;
  aw: number;
  ch: number;
  cw: number;
  qty: number;
  area: number;
  rate: number;
  amount: number;
  has_frac: boolean;
}

export interface ParsedSection {
  product: string;
  out_unit: PrintUnit;
  hsn: string;
  lines: ParsedLine[];
  extras: Array<{ name: string; qty: number | null; amount: number }>;
  post_tax_labels: Array<{ name: string; amount: number }>;
  subtotal: number | null;
  bare_amounts: number[];
  cgst: number | null;
  sgst: number | null;
  gst_pct: number | null;
}

export interface ParsedQuote {
  file: string;
  proforma_no: string;
  date: string;
  customer: string;
  sections: ParsedSection[];
  grand_total: number | null;
}

const here = dirname(fileURLToPath(import.meta.url));

export const corpus: ParsedQuote[] = JSON.parse(
  readFileSync(resolve(here, "../../../scripts/parsed.json"), "utf8"),
);

export function sample(proformaNo: string): ParsedQuote {
  const found = corpus.filter((q) => q.proforma_no === proformaNo)[0];
  if (!found) throw new Error(`No sample quotation ${proformaNo}`);
  return found;
}

/** Pick the input unit whose area formula lands closest to the printed area. */
export function inferUnit(section: ParsedSection, line: ParsedLine): InputUnit {
  const err = (unit: InputUnit) =>
    areaOf(unit, section.out_unit, line.ch, line.cw, line.qty).minus(line.area).abs();
  return err("mm").lte(err("inch")) ? "mm" : "inch";
}

/**
 * The rounded subtotal is an operator entry, so replay it from the sheet: any
 * bare amount within ~a rupee of the line sum is the figure they typed. Sections
 * print the exact subtotal above the rounded one, so the last match is the one
 * that was actually carried forward.
 */
function roundedFrom(section: ParsedSection, lineSum: Decimal): number | null {
  let found: number | null = null;
  for (const bare of section.bare_amounts) {
    if (new Decimal(bare).minus(lineSum).abs().lte("1.5")) found = bare;
  }
  return found;
}

/**
 * Line areas and chargeable sizes are carried over as overrides, so this
 * exercises the totalling, tax and rounding logic in isolation; the size and
 * area formulas are tested directly.
 */
export function toQuote(parsed: ParsedQuote): Quote {
  const sections: Section[] = parsed.sections
    .filter((s) => s.lines.length > 0)
    .map((s, si) => {
      const lines: Line[] = s.lines.map((l, li) => ({
        id: `${si}-${li}`,
        shape: l.shape,
        actualH: l.ah,
        actualW: l.aw,
        wastage: null,
        chargeableH: l.ch,
        chargeableW: l.cw,
        qty: l.qty,
        area: l.area,
        rate: l.rate,
        amount: null,
      }));

      const lineSum = lines.reduce(
        (sum, l) => sum.plus(new Decimal(l.area ?? 0).times(l.rate)),
        new Decimal(0),
      );

      // A charge printed with a count was billed by the count; one printed with
      // only an amount was charged once, and carries no count.
      const adjustments: Adjustment[] = s.extras.map((e, ei) => ({
        id: `${si}-adj-${ei}`,
        label: e.name,
        qty: e.qty ?? 0,
        rate: e.qty ? e.amount / e.qty : e.amount,
        amount: null,
        taxable: true,
      }));

      return {
        id: String(si),
        product: s.product,
        // The section prints its own short code first, above any carried down
        // from the sections before it.
        shortCode: s.post_tax_labels[0]?.name ?? s.product,
        wastageRule: "fixed" as const,
        wastage: 50,
        lines,
        adjustments,
        rounded: roundedFrom(s, lineSum),
      };
    });

  const gstSections = parsed.sections.filter((s) => s.cgst !== null);

  return {
    proformaNo: parsed.proforma_no,
    date: parsed.date,
    customerName: parsed.customer,
    customerAddress: "",
    customerGstin: "",
    projectRemark: "",
    refPerson: "",
    partyNo: "",
    docNo: "",
    orderNo: "",
    dispatchTo: "",
    inputUnit: "mm",
    printUnit: parsed.sections[0]?.out_unit ?? "SQMT",
    gstApplicable: gstSections.length > 0,
    gstPct: gstSections[0]?.gst_pct ?? 9,
    sections,
  };
}
