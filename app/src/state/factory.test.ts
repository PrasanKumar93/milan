import { describe, expect, it } from "vitest";
import { computeQuote } from "../core/engine";
import { newAdjustment, newLine, newQuote, newSection, switchInputUnit } from "./factory";

describe("new quote defaults", () => {
  it("starts on the settings the samples use most", () => {
    const q = newQuote("7180");
    expect(q.inputUnit).toBe("mm");
    expect(q.printUnit).toBe("SQMT");
    expect(q.gstApplicable).toBe(true);
    expect(q.gstPct).toBe(9);
    expect(q.sections).toHaveLength(1);
    expect(q.sections[0].lines).toHaveLength(1);
  });

  it("computes to zero rather than to an error", () => {
    const computed = computeQuote(newQuote());
    expect(computed.grandTotal.toNumber()).toBe(0);
    expect(computed.overrides).toEqual([]);
  });
});

describe("new section", () => {
  it("takes its wastage rule from the glass and its allowance from the unit", () => {
    expect(newSection("mm").wastageRule).toBe("fixed");
    expect(newSection("mm").wastage).toBe(50);
    expect(newSection("inch").wastage).toBe(2);
    expect(newSection("mm", "6MM CLEAR MIRROR").wastageRule).toBe("foot_to_foot");
  });

  it("carries the short code the summary block prints", () => {
    expect(newSection("mm").shortCode).toBe("10MM CTG");
    expect(newSection("mm", "6MM CLEAR MIRROR").shortCode).toBe("6MM MIRROR");
    expect(newSection("mm", "SOMETHING CUSTOM").shortCode).toBe("SOMETHING CUSTOM");
  });
});

describe("new line", () => {
  it("inherits the rate already in use in the section", () => {
    const section = newSection("mm");
    section.lines[0].rate = 1232;
    expect(newLine(section).rate).toBe(1232);
  });
});

describe("new charge", () => {
  it("fills in the catalogue default", () => {
    const charge = newAdjustment(newSection("mm"), "HOLES");
    expect(charge.basis).toBe("per_unit");
    expect(charge.rate).toBe(30);
    expect(charge.taxable).toBe(true);
  });

  it("prices polish off the glass at 1 rupee per mm", () => {
    expect(newAdjustment(newSection("mm", "10MM CLEAR TOUGHENED GLASS"), "POLISH").rate).toBe(10);
    expect(newAdjustment(newSection("mm", "12MM CLEAR TOUGHENED GLASS"), "POLISH").rate).toBe(12);
  });
});

describe("switching the input unit", () => {
  it("refills every allowance and drops sizes that no longer mean anything", () => {
    const q = newQuote();
    q.sections[0].lines[0].chargeableH = 2440;
    q.sections[0].lines[0].wastage = 30;

    const switched = switchInputUnit(q, "inch");
    expect(switched.sections[0].wastage).toBe(2);
    expect(switched.sections[0].lines[0].chargeableH).toBeNull();
    expect(switched.sections[0].lines[0].wastage).toBeNull();
  });
});
