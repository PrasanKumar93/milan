import { describe, expect, it } from "vitest";
import { computeSection } from "../core/engine";
import type { Section } from "../core/types";
import { chargeTypes } from "../data/masters";
import { newLine, newSection } from "../state/factory";
import {
  amountHint,
  areaHint,
  chargeableHint,
  feetSpan,
  footStepsPair,
  polishHint,
} from "./formulas";

/**
 * The headings explain the columns the app fills in for itself, so what they say
 * has to be what the engine actually did — including for a section on foot to
 * foot, or one typed in inches and priced by the square foot.
 */

/** What the charge master asks per millimetre of glass, as the app reads it. */
const perMm = chargeTypes.filter((c) => c.ratePerThicknessMm !== undefined)[0]
  .ratePerThicknessMm as number;

/** A section with one row in it, the row the headings work through. */
function sectionWith(section: Section) {
  section.lines = [{ ...newLine(section), actualH: 2000, actualW: 1000, qty: 2, rate: 1238 }];
  return computeSection(section);
}

const plain = () => sectionWith(newSection());

describe("the heading that explains a column", () => {
  it("works the first row through the allowance", () => {
    const hint = chargeableHint(plain());

    expect(hint).toContain("actual + wastage");
    expect(hint).toContain("2000 + 50 = 2050");
    expect(hint).toContain("1000 + 50 = 1050");
  });

  it("walks through the feet where the section is measured that way", () => {
    const section = sectionWith(newSection({}, "6MM CLEAR MIRROR"));

    // 2000 mm is six and a half feet, so it is cut and charged at seven.
    const hint = chargeableHint(section);
    expect(hint).toContain("Height 2000:\n2000 ÷ 304.8 = 6.56 ft");
    expect(hint).toContain("up to the next foot = 7 ft");
    expect(hint).toContain("7 × 304.8 = 2133.6");
    expect(hint).toContain("up to the next 5 mm = 2135");
    expect(hint).not.toContain("wastage");

    // The width goes through the same steps rather than being summarised: it is
    // the side that surprises, being the one a foot rounds hardest.
    expect(hint).toContain("Width 1000:\n1000 ÷ 304.8 = 3.28 ft");
    expect(hint).toContain("4 × 304.8 = 1219.2");
    expect(hint).toContain("up to the next 5 mm = 1220");
  });

  it("says nothing about a fifth of a millimetre where the foot lands on one", () => {
    const inches = newSection({ inputUnit: "inch" }, "6MM CLEAR MIRROR");
    const section = sectionWith(inches);

    // A foot is twelve inches exactly, so the last step of the mm case is absent.
    const hint = chargeableHint(section);
    expect(hint).toContain("÷ 12 =");
    expect(hint).not.toContain("5 mm");
  });

  it("says how the area is arrived at, a bracket to a step", () => {
    // 2.05 x 1.05 metres, two pieces.
    expect(areaHint(plain())).toContain("((2050 ÷ 1000) × (1050 ÷ 1000)) × 2 = 4.305");
  });

  /*
   * Both units are the section's own, so a section in inches priced by the
   * square foot explains itself that way even where the section above it is in
   * millimetres and square metres.
   */
  it("takes the section's own units into account too", () => {
    const section = sectionWith(newSection({ inputUnit: "inch", printUnit: "SQFT" }));

    const hint = areaHint(section);
    expect(hint).toContain("((chargeable H × chargeable W) ÷ 144) × qty");
    expect(hint).not.toContain("10.764");
  });

  it("multiplies the area by the rate, and shows the row's own money", () => {
    expect(amountHint(plain())).toContain("4.305 × 1238 = 5329.59");
  });

  it("reads a row's own sizes in feet, for the column that used to say only the rule", () => {
    expect(feetSpan(2290, "mm")).toBe("7.51 → 8 ft");
    expect(feetSpan(340, "mm")).toBe("1.12 → 2 ft");
    expect(feetSpan(88, "inch")).toBe("7.33 → 8 ft");

    // Nothing typed yet, so there is nothing to say about it.
    expect(feetSpan(0, "mm")).toBe("");
  });

  it("covers both sides of a row in one go, the column being one box", () => {
    const pair = footStepsPair(2290, 340, "mm");

    expect(pair).toContain("Height 2290:");
    expect(pair).toContain("up to the next 5 mm = 2440");
    expect(pair).toContain("Width 340:");
    expect(pair).toContain("up to the next 5 mm = 610");

    // A row half typed says what it can and stays quiet about the rest.
    expect(footStepsPair(2290, 0, "mm")).not.toContain("Width");
  });

  it("prices polish along the edge, in the running feet it is billed by", () => {
    const section = sectionWith(newSection({}, "10MM CLEAR TOUGHENED GLASS"));

    // The rupees per millimetre come from the charge master, so the hint says
    // whatever that file says rather than a figure of its own.
    const hint = polishHint(section, perMm);
    expect(hint).toContain("₹1 × 10 mm = ₹10 per running foot");
    // Two pieces cut 2050 x 1050: 3100 twice round, twice over, in feet.
    expect(hint).toContain("((2050 + 1050) × 2 × 2) ÷ 304.8 = 40.68");
  });

  it("says what polish is waiting on where the glass has not been chosen", () => {
    // No glass means no thickness, and the thickness is the whole price.
    expect(polishHint(plain(), perMm)).toContain("waiting on the glass");
  });

  it("still explains the rule for a section with nothing typed in it yet", () => {
    const empty = computeSection({ ...newSection(), lines: [] });

    for (const hint of [chargeableHint(empty), areaHint(empty), amountHint(empty)]) {
      expect(hint).not.toContain("Row 1");
      expect(hint.length).toBeGreaterThan(20);
    }
  });
});
