import { describe, expect, it } from "vitest";
import { computeSection } from "../core/engine";
import type { Quote, Section } from "../core/types";
import { newLine, newQuote, newSection } from "../state/factory";
import { amountHint, areaHint, chargeableHint } from "./formulas";

/**
 * The headings explain the columns the app fills in for itself, so what they say
 * has to be what the engine actually did — including for a section on foot to
 * foot, or a quote typed in inches and priced by the square foot.
 */

function quoteWith(patch: Partial<Quote> = {}): Quote {
  return { ...newQuote("7200"), ...patch };
}

function sectionWith(quote: Quote, section: Section) {
  section.lines = [
    { ...newLine(section), actualH: 2000, actualW: 1000, qty: 2, rate: 1238 },
  ];
  return computeSection(section, quote);
}

describe("the heading that explains a column", () => {
  it("works the first row through the allowance", () => {
    const quote = quoteWith();
    const section = sectionWith(quote, quote.sections[0]);

    const hint = chargeableHint(section, quote);
    expect(hint).toContain("actual + wastage");
    expect(hint).toContain("2000 + 50 = 2050");
    expect(hint).toContain("1000 + 50 = 1050");
  });

  it("explains the foot instead where the section is measured that way", () => {
    const quote = quoteWith();
    const mirror = newSection("mm", "6MM CLEAR MIRROR");
    const section = sectionWith(quote, mirror);

    const hint = chargeableHint(section, quote);
    expect(hint).toContain("304.8 mm");
    expect(hint).toContain("2000 → 2135");
    expect(hint).not.toContain("wastage");
  });

  it("says how the area is arrived at, a bracket to a step", () => {
    const quote = quoteWith();
    const section = sectionWith(quote, quote.sections[0]);

    // 2.05 x 1.05 metres, two pieces.
    expect(areaHint(section, quote)).toContain("((2050 ÷ 1000) × (1050 ÷ 1000)) × 2 = 4.305");
  });

  it("takes the printed unit into account too", () => {
    const quote = quoteWith({ inputUnit: "inch", printUnit: "SQFT" });
    const section = sectionWith(quote, quote.sections[0]);

    const hint = areaHint(section, quote);
    expect(hint).toContain("((chargeable H × chargeable W) ÷ 144) × qty");
    expect(hint).not.toContain("10.764");
  });

  it("multiplies the area by the rate, and shows the row's own money", () => {
    const quote = quoteWith();
    const section = sectionWith(quote, quote.sections[0]);

    expect(amountHint(section)).toContain("4.305 × 1238 = 5329.59");
  });

  it("still explains the rule for a section with nothing typed in it yet", () => {
    const quote = quoteWith();
    const empty = computeSection({ ...quote.sections[0], lines: [] }, quote);

    for (const hint of [chargeableHint(empty, quote), areaHint(empty, quote), amountHint(empty)]) {
      expect(hint).not.toContain("Row 1");
      expect(hint.length).toBeGreaterThan(20);
    }
  });
});
