import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { corpus, inferUnit, toQuote } from "../test/corpus";
import { computeQuote } from "./engine";
import { polishRate, thicknessMm, wastageRuleFor } from "./products";
import { areaOf, formatInches, parseDimension, toNextFoot } from "./units";

/**
 * The samples are the specification. These tests read the same parsed corpus the
 * Python harness uses (`scripts/parsed.json`, 47 quotes / 57 sections / 284
 * lines) and assert the TypeScript engine reproduces it, so a change to the
 * rules that silently alters a customer-facing number fails here first.
 */

const TOLERANCE_RUPEE = new Decimal("0.5");

describe("inch entry", () => {
  it("parses the fractions the samples actually use", () => {
    expect(parseDimension("33 1/4", "inch")).toBe(33.25);
    expect(parseDimension("34 5/8", "inch")).toBe(34.625);
    expect(parseDimension("38 3/8", "inch")).toBe(38.375);
    expect(parseDimension("52 7/8", "inch")).toBe(52.875);
    expect(parseDimension("96", "inch")).toBe(96);
    expect(parseDimension("5/8", "inch")).toBe(0.625);
  });

  it("rejects fractions on millimetre entry, where none ever occur", () => {
    expect(parseDimension("2290", "mm")).toBe(2290);
    expect(parseDimension("33 1/4", "mm")).toBeNull();
  });

  it("prints inches back the way the sheet writes them", () => {
    expect(formatInches(33.25)).toBe("33 1/4");
    expect(formatInches(34.625)).toBe("34 5/8");
    expect(formatInches(96)).toBe("96");
  });
});

describe("area formulas (dev-plan §2.1)", () => {
  it("covers all four input/print combinations", () => {
    expect(areaOf("inch", "SQFT", 24, 18, 1).toString()).toBe("3");
    expect(areaOf("mm", "SQMT", 2150, 700, 2).toString()).toBe("3.01");
    expect(areaOf("mm", "SQFT", 1000, 1000, 1).toString()).toBe("10.764");
    expect(areaOf("inch", "SQMT", 144, 144, 1).toString()).toBe(
      new Decimal(144).div("10.764").toString(),
    );
  });
});

describe("foot to foot (dev-plan §2.2)", () => {
  it("rounds millimetres up to the next foot, then up to a whole 5 mm", () => {
    expect(toNextFoot(2290, "mm")).toBe(2440); // 8 ft
    expect(toNextFoot(340, "mm")).toBe(610); // 2 ft
    expect(toNextFoot(628, "mm")).toBe(915); // 3 ft
  });

  it("leaves a side already on an exact foot alone", () => {
    // 8.2 ft becomes 9 ft, 8 ft stays 8 ft — only the overhang moves the size up.
    expect(toNextFoot(24, "inch")).toBe(24);
    expect(toNextFoot(84, "inch")).toBe(84);
    expect(toNextFoot(85, "inch")).toBe(96);
  });

  it("reproduces the G FOCUSS mirror line the rule explains", () => {
    expect([toNextFoot(2290, "mm"), toNextFoot(340, "mm")]).toEqual([2440, 610]);
  });

  it("leaves the lines the rule does not explain to a manual override", () => {
    // Charged 3660 x 915; the rule alone gives 3050 on the long side (§2.6).
    expect(toNextFoot(2917, "mm")).toBe(3050);
    expect(toNextFoot(628, "mm")).toBe(915);
    // AD GLASS 7176 charged 84 in (exactly 7 ft) as 96 (§2.7).
    expect(toNextFoot(84, "inch")).toBe(84);
  });
});

describe("products", () => {
  it("reads thickness off the printed name, adding up laminated build-ups", () => {
    expect(thicknessMm("10MM CLEAR TOUGHENED GLASS")).toBe(10);
    expect(thicknessMm("6+6MM LAMINATED GLASS")).toBe(12);
    expect(thicknessMm("SOMETHING CUSTOM")).toBe(0);
  });

  it("defaults the wastage rule from the glass type", () => {
    expect(wastageRuleFor("10MM CLEAR TOUGHENED GLASS")).toBe("fixed");
    expect(wastageRuleFor("12MM KACCHA GLASS")).toBe("fixed");
    expect(wastageRuleFor("6MM CLEAR MIRROR")).toBe("foot_to_foot");
    expect(wastageRuleFor("10MM CLEAR FLUTED TOUGHENED GLASS")).toBe("foot_to_foot");
    expect(wastageRuleFor("8MM BLACK FLUTED TOUGHENED GLASS")).toBe("foot_to_foot");
    expect(wastageRuleFor("8MM BLACK TOUGHENED GLASS")).toBe("fixed");
  });

  it("prices polish at 1 rupee per mm of thickness per running foot", () => {
    expect(polishRate("10MM CLEAR TOUGHENED GLASS")).toBe(10);
    expect(polishRate("12MM CLEAR TOUGHENED GLASS")).toBe(12);
  });
});

describe("regression against the 47 sample quotations", () => {
  const lines = corpus.flatMap((q) => q.sections.flatMap((s) => s.lines.map((l) => ({ s, l }))));

  it("reproduces every line amount as area x rate", () => {
    const good = lines.filter(({ l }) =>
      new Decimal(l.area).times(l.rate).minus(l.amount).abs().lte("0.02"),
    );
    expect(good.length).toBe(284);
    expect(lines.length).toBe(284);
  });

  it("reproduces 271 of 284 printed areas from the chargeable sizes", () => {
    const good = lines.filter(({ s, l }) => {
      const calc = areaOf(inferUnit(s, l), s.out_unit, l.ch, l.cw, l.qty);
      const tol = Decimal.max("0.001", new Decimal(l.area).times("0.002"));
      return calc.minus(l.area).abs().lte(tol);
    });
    // The 13 misses are the typed-over area cells documented in dev-plan §9.
    expect(good.length).toBe(271);
  });

  it("reproduces every quote total except the known operator overrides", () => {
    const priced = corpus.filter((q) => q.grand_total !== null);
    const failures = priced
      .filter((q) => {
        const total = computeQuote(toQuote(q)).grandTotal;
        return total.minus(q.grand_total!).abs().gt(TOLERANCE_RUPEE);
      })
      .map((q) => q.file);

    // ASHRAF KOLAR: a section subtotal of 1350.5557 was carried down as 1350,
    // a 1 rupee operator override (§2.3).
    // BHOOTH SINGH: a 1,238 discount booked as a round-off, which is now
    // recorded by overriding the rounded subtotal (§2.9).
    // SAI GLASS: one section is missing its GST rows. The engine deliberately
    // will not reproduce that — GST is a quote-level flag precisely so the
    // omission becomes impossible (§9).
    expect(failures.sort()).toEqual([
      "ASHRAF KOLAR 7161 (1).pdf",
      "BHOOTH SINGH 6613.pdf",
      "SAI GLASS 6374.pdf",
    ]);
    expect(priced.length - failures.length).toBe(42);
  });
});
