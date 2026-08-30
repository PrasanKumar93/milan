import { describe, expect, it } from "vitest";
import { computeQuote } from "../core/engine";
import {
  newAdjustment,
  newLine,
  newQuote,
  newSection,
  settingsOf,
  switchInputUnit,
} from "./factory";

describe("new quote defaults", () => {
  it("starts on the settings the samples use most", () => {
    const q = newQuote("7180");
    const [section] = q.sections;

    // The settings belong to the section now, not to the quote (§2.1).
    expect(section.inputUnit).toBe("mm");
    expect(section.printUnit).toBe("SQMT");
    expect(section.gstApplicable).toBe(true);
    expect(section.gstPct).toBe(9);
    expect(q.sections).toHaveLength(1);
    expect(section.lines).toHaveLength(1);
  });

  it("computes to zero rather than to an error", () => {
    const computed = computeQuote(newQuote());
    expect(computed.grandTotal.toNumber()).toBe(0);
    expect(computed.overrides).toEqual([]);
  });
});

describe("new section", () => {
  it("starts with no glass, so the printed description is one somebody chose", () => {
    expect(newSection().product).toBe("");
    expect(newSection().shortCode).toBe("");
  });

  it("takes its wastage rule from the glass and its allowance from the unit", () => {
    expect(newSection().wastageRule).toBe("fixed");
    expect(newSection().wastage).toBe(50);
    expect(newSection({ inputUnit: "inch" }).wastage).toBe(2);
    expect(newSection({}, "6MM CLEAR MIRROR").wastageRule).toBe("foot_to_foot");
  });

  it("carries the short code the summary block prints", () => {
    expect(newSection({}, "10MM CLEAR TOUGHENED GLASS").shortCode).toBe("10MM CTG");
    expect(newSection({}, "6MM CLEAR MIRROR").shortCode).toBe("6MM MIRROR");
    expect(newSection({}, "SOMETHING CUSTOM").shortCode).toBe("SOMETHING CUSTOM");
  });

  /*
   * A quote can measure one section in millimetres and the next in inches, but
   * it rarely does. The second section starts where the first one is, and the
   * operator changes it there if this is one of the rare ones.
   */
  it("starts on the settings of the section above it", () => {
    const above = newSection({ inputUnit: "inch", printUnit: "SQFT", gstApplicable: false });
    const below = newSection(settingsOf(above), "6MM CLEAR MIRROR");

    expect(below.inputUnit).toBe("inch");
    expect(below.printUnit).toBe("SQFT");
    expect(below.gstApplicable).toBe(false);
    // Only the settings are carried down. What is in the section is its own.
    expect(below.wastage).toBe(2);
    expect(below.wastageRule).toBe("foot_to_foot");
  });
});

describe("new line", () => {
  it("inherits the rate already in use in the section", () => {
    const section = newSection();
    section.lines[0].rate = 1232;
    expect(newLine(section).rate).toBe(1232);
  });
});

describe("new charge", () => {
  it("arrives unnamed, and no name carries a price", () => {
    const charge = newAdjustment(newSection());
    expect(charge.label).toBe("");
    expect(charge.qty).toBe(0);
    expect(charge.rate).toBe(0);

    // The catalogue says how a charge is billed, never at what (§3.1).
    expect(newAdjustment(newSection(), "HOLES").rate).toBe(0);
    expect(newAdjustment(newSection(), "HOLES").qty).toBe(1);
    expect(newAdjustment(newSection(), "DOCUMENT CHARGE").qty).toBe(0);
  });

  it("prices polish off the glass at 1 rupee per mm, and counts it", () => {
    // The one charge with a rule behind it rather than a price (§3.3).
    const polish = "POLISH (JOB WORK)";
    expect(newAdjustment(newSection({}, "10MM CLEAR TOUGHENED GLASS"), polish).rate).toBe(10);
    expect(newAdjustment(newSection({}, "12MM CLEAR TOUGHENED GLASS"), polish).rate).toBe(12);
    expect(newAdjustment(newSection(), polish).qty).toBe(1);
  });
});

describe("switching the input unit", () => {
  it("refills the allowance and drops sizes that no longer mean anything", () => {
    const section = newSection();
    section.lines[0].chargeableH = 2440;
    section.lines[0].wastage = 30;

    const switched = switchInputUnit(section, "inch");
    expect(switched.wastage).toBe(2);
    expect(switched.lines[0].chargeableH).toBeNull();
    expect(switched.lines[0].wastage).toBeNull();
  });

  // One section at a time: the section beside it may be measured in the other
  // unit, and switching this one says nothing about that one.
  it("leaves the rest of the quote alone", () => {
    const q = newQuote();
    q.sections.push(newSection());

    const switched = { ...q, sections: [switchInputUnit(q.sections[0], "inch"), q.sections[1]] };
    expect(switched.sections[0].inputUnit).toBe("inch");
    expect(switched.sections[1].inputUnit).toBe("mm");
    expect(switched.sections[1].wastage).toBe(50);
  });
});
