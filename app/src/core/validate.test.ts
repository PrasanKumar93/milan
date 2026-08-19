import { describe, expect, it } from "vitest";
import { newLine, newQuote, newSection } from "../state/factory";
import { computeQuote } from "./engine";
import type { Quote } from "./types";
import { warningsFor } from "./validate";

/** dev-plan §7. Each of these is a mistake that actually reached a customer (§9). */

function quoteWith(edit: (q: Quote) => void): Quote {
  const q = newQuote("7178");
  // A new section starts with no glass on it, so a quote being checked has to
  // pick one the way an operator does.
  const s = newSection("mm", "10MM CLEAR TOUGHENED GLASS");
  s.lines = [{ ...newLine(s), actualH: 2000, actualW: 1000, rate: 1238 }];
  q.sections = [s];
  edit(q);
  return q;
}

const textsFor = (q: Quote) => warningsFor(computeQuote(q)).map((w) => w.text);
const tagsFor = (q: Quote) => warningsFor(computeQuote(q)).map((w) => w.tag);

describe("warnings", () => {
  it("say nothing about a quote that is simply being typed", () => {
    expect(textsFor(newQuote())).toEqual([]);
    expect(textsFor(quoteWith(() => {}))).toEqual([]);
  });

  // The list is read while somebody is waiting, so each line opens with what it
  // is and the sentence is there for the operator who then asks why.
  it("name the mistake before explaining it", () => {
    expect(
      tagsFor(
        quoteWith((q) => {
          q.printUnit = "SQFT";
          q.sections[0].lines[0].rate = 135;
        }),
      ),
    ).toContain("GST twice");

    expect(tagsFor(quoteWith((q) => (q.gstApplicable = false)))).toContain("GST missing");
    expect(tagsFor(quoteWith((q) => (q.sections[0].lines[0].rate = 0)))).toContain("No rate");
    expect(tagsFor(quoteWith((q) => (q.sections[0].rounded = 2000)))).toContain("Discount");
  });

  it("catch a section that was priced without a glass being chosen", () => {
    const blank = quoteWith((q) => (q.sections[0].product = ""));
    expect(textsFor(blank)).toContain(
      "Section 1 has no glass chosen, so the proforma has nothing to describe it by.",
    );

    // Half a name is still no glass; a name off nobody's catalogue is a glass.
    expect(textsFor(quoteWith((q) => (q.sections[0].product = "12MM")))).toHaveLength(1);
    expect(textsFor(quoteWith((q) => (q.sections[0].product = "12MM LOW IRON")))).toEqual([]);
  });

  it("catch a SQFT rate left in a SQMT quote", () => {
    const texts = textsFor(quoteWith((q) => (q.sections[0].lines[0].rate = 135)));
    expect(texts.some((t) => t.includes("Check the unit"))).toBe(true);
  });

  it("catch a row with no rate and a row with no quantity", () => {
    expect(textsFor(quoteWith((q) => (q.sections[0].lines[0].rate = 0)))).toContain(
      "Row 1 has no rate.",
    );
    expect(textsFor(quoteWith((q) => (q.sections[0].lines[0].qty = 0)))).toContain(
      "Row 1 has no quantity.",
    );
  });

  /*
   * The card prices square metres before tax and square feet after it (§2.5),
   * and the printed unit and the GST switch are set independently, so both
   * mismatches are a click away and neither looks wrong on the page.
   */
  it("catch a card price that already includes GST being taxed again", () => {
    const texts = textsFor(
      quoteWith((q) => {
        q.printUnit = "SQFT";
        q.sections[0].lines[0].rate = 135;
      }),
    );

    expect(texts.some((t) => t.includes("already includes GST"))).toBe(true);
    // And says what the rate would be without it: 135 / 1.18.
    expect(texts.some((t) => t.includes("114.41"))).toBe(true);
  });

  it("catch a pre-tax card price on a quote that adds no tax", () => {
    const texts = textsFor(quoteWith((q) => (q.gstApplicable = false)));
    expect(texts.some((t) => t.includes("before GST, and this quote adds none"))).toBe(true);
  });

  it("say nothing where the operator has priced it themselves", () => {
    // 114 is the square-foot rate with the tax taken out — a deliberate figure.
    const texts = textsFor(
      quoteWith((q) => {
        q.printUnit = "SQFT";
        q.sections[0].lines[0].rate = 114;
      }),
    );

    expect(texts.some((t) => t.includes("GST"))).toBe(false);
  });

  it("name a discount rather than object to it", () => {
    const texts = textsFor(
      quoteWith((q) => {
        q.sections[0].rounded = 2000;
      }),
    );
    expect(texts.some((t) => t.includes("rounded down by") && t.includes("larger than a rounding"))).toBe(
      true,
    );
  });

  it("notice glass measured against its usual rule", () => {
    const texts = textsFor(
      quoteWith((q) => {
        q.sections[0].wastageRule = "foot_to_foot";
      }),
    );
    expect(texts).toContain(
      "10MM CLEAR TOUGHENED GLASS is usually measured on a fixed allowance, and this section is set the other way.",
    );
  });

  /*
   * Mirror is the glass measured foot to foot; everything else takes the fixed
   * allowance. This once came from a list of words in the code, which went on
   * calling extra clear and fluted foot to foot after the customer said
   * otherwise — so a section set exactly as the catalogue has it was told it
   * was set the other way.
   */
  it("say nothing about glass set the way the catalogue has it", () => {
    const extraClear = quoteWith((q) => {
      q.sections[0].product = "5MM EXTRA CLEAR TOUGHENED GLASS";
      q.sections[0].lines[0].rate = 0;
    });

    expect(tagsFor(extraClear)).not.toContain("Wastage rule");
    expect(tagsFor(quoteWith((q) => (q.sections[0].product = "8MM BLACK FLUTED TOUGHENED GLASS")))).not.toContain(
      "Wastage rule",
    );
  });

  // A warning names the glass as the section header does. The short code is an
  // abbreviation for the printed summary, and beside a sentence it reads as a
  // name somebody cut short.
  it("name the glass in full", () => {
    const texts = textsFor(quoteWith((q) => (q.gstApplicable = false)));
    expect(texts.some((t) => t.startsWith("10MM CLEAR TOUGHENED GLASS is at the card's"))).toBe(true);
  });
});
