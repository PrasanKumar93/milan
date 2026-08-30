import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { corpus, inferUnit, sample, toQuote } from "../test/corpus";
import { computeQuote } from "./engine";
import {
  chargeTypes,
  company,
  glassTypes,
  rateCard,
  shortCodeFor,
  thicknesses,
  wastageRuleFor,
} from "../data/masters";
import { newAdjustment, newLine, newQuote, newSection } from "../state/factory";
import { polishRate, thicknessMm } from "./products";
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

  /*
   * A size is written back at whatever it was measured to. The samples never go
   * finer than an eighth, but a sixteenth is not an eighth: rounded to one for
   * the sake of a tidier column, the row is priced on a size the customer never
   * gave and the sheet says so nowhere.
   */
  it("keeps a finer fraction rather than tidying it into an eighth", () => {
    expect(formatInches(42.6875)).toBe("42 11/16");
    expect(formatInches(42.0625)).toBe("42 1/16");
    expect(formatInches(42.03125)).toBe("42 1/32");
    expect(formatInches(0.5)).toBe("1/2");

    // The smallest denominator that says it exactly: a half is a half.
    expect(formatInches(42.5)).toBe("42 1/2");
    expect(formatInches(42.75)).toBe("42 3/4");
  });

  // A third of an inch is no fraction of a tape. It is written as the number it
  // is, because the row is priced on that number.
  it("writes a size that is no fraction at all as the figure it is", () => {
    expect(formatInches(42 + 1 / 3)).toBe("42.3333");
  });

  it("takes back every fraction it writes", () => {
    for (const inch of [33.25, 34.625, 42.6875, 42.0625, 42.03125, 0.625, 96]) {
      expect(parseDimension(formatInches(inch), "inch")).toBe(inch);
    }
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

/**
 * Two areas on the row: the glass as measured and the glass as billed. Only the
 * second prices anything — the first is there so the shop floor can read the
 * wastage off the row, which is the whole reason it was asked for.
 */
describe("the measured area beside the chargeable one", () => {
  const sized = (rule: "fixed" | "foot_to_foot", h: number, w: number, qty = 1) => {
    const section = { ...newSection({}, "10MM CLEAR TOUGHENED GLASS"), wastageRule: rule };
    const quote = {
      ...newQuote(),
      sections: [
        { ...section, lines: [{ ...newLine(section), actualH: h, actualW: w, qty, rate: 1000 }] },
      ],
    };

    return computeQuote(quote).sections[0];
  };

  it("measures the glass on the sizes as taken, count included", () => {
    const [line] = sized("fixed", 2000, 1000, 2).lines;

    // 2 x 1 metres, twice, against 2.05 x 1.05 cut — the allowance costs 0.305.
    expect(line.actualArea.toString()).toBe("4");
    expect(line.area.value.toString()).toBe("4.305");
  });

  it("measures it the same way under foot to foot, where the allowance is the rule", () => {
    const [line] = sized("foot_to_foot", 2290, 340).lines;

    expect(line.actualArea.toString()).toBe("0.7786");
    expect(line.area.value.toString()).toBe("1.4884");
  });

  // Typing over the chargeable area is how an operator settles a row; the
  // measured area is not theirs to type, so it stays what the tape said.
  it("is left alone by a typed-over chargeable area", () => {
    const section = sized("fixed", 2000, 1000, 2);
    const quote = newQuote();
    const typed = {
      ...quote,
      sections: [{ ...section.section, lines: [{ ...section.section.lines[0], area: 9 }] }],
    };
    const [line] = computeQuote(typed).sections[0].lines;

    expect(line.area.value.toString()).toBe("9");
    expect(line.actualArea.toString()).toBe("4");
  });

  it("adds both up over the section, so the wastage is the difference", () => {
    const section = sized("fixed", 2000, 1000, 2);

    expect(section.totalActualArea.toString()).toBe("4");
    expect(section.totalArea.minus(section.totalActualArea).toString()).toBe("0.305");
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

  /*
   * The customer's word: mirror is measured foot to foot, and everything else
   * takes the fixed allowance. The rule comes off the product master, so the
   * catalogue and the app cannot say different things about the same glass —
   * fluted and extra clear were foot to foot in an earlier answer, and a
   * keyword list here went on warning about them long after it changed.
   */
  it("takes the wastage rule from the product master", () => {
    expect(wastageRuleFor("6MM CLEAR MIRROR")).toBe("foot_to_foot");
    expect(wastageRuleFor("10MM CLEAR TOUGHENED GLASS")).toBe("fixed");
    expect(wastageRuleFor("5MM EXTRA CLEAR TOUGHENED GLASS")).toBe("fixed");
    expect(wastageRuleFor("8MM BLACK FLUTED TOUGHENED GLASS")).toBe("fixed");
    expect(wastageRuleFor("12MM KACCHA GLASS")).toBe("fixed");

    // A glass typed in by hand is not in the catalogue, and the allowance is
    // what the office measures by unless somebody says otherwise.
    expect(wastageRuleFor("22MM LAXMAN GLASS")).toBe("fixed");
  });

  it("prices polish by the thickness, at the charge master's rupees per mm", () => {
    expect(polishRate("10MM CLEAR TOUGHENED GLASS", 1)).toBe(10);
    expect(polishRate("12MM CLEAR TOUGHENED GLASS", 1)).toBe(12);
    // The rate is the master's to change, and this is what changing it does.
    expect(polishRate("10MM CLEAR TOUGHENED GLASS", 2)).toBe(20);
  });
});

/*
 * The masters are the specification: `products.json`, `chargeTypes.json`,
 * `rateCard.json` and `company.json` are where the customer's answers live, and
 * the code is supposed to have no opinion of its own to contradict them. That
 * is easy to break quietly — a keyword list beside the catalogue kept calling
 * extra clear foot to foot for months after the answer changed — because
 * nothing fails when the two disagree; the app simply stops doing what the file
 * says. These read the files and ask the app what it thinks.
 */
describe("what the masters say is what the app does", () => {
  it("measures every glass the way the catalogue says", () => {
    for (const thickness of thicknesses) {
      for (const glass of glassTypes) {
        expect(wastageRuleFor(`${thickness} ${glass.name}`)).toBe(glass.wastageRule);
      }
    }
  });

  it("names every glass in the summary the way the catalogue does", () => {
    for (const glass of glassTypes) {
      expect(shortCodeFor(`10MM ${glass.name}`)).toBe(`10MM ${glass.shortCode}`);
    }
  });

  // A card entry no pair of dropdowns can produce is a price nobody will see:
  // the header shows nothing, and the two GST checks have nothing to compare.
  it("prices glass the dropdowns can actually make", () => {
    const catalogue = new Set(thicknesses.flatMap((t) => glassTypes.map((g) => `${t} ${g.name}`)));

    for (const item of rateCard.items) expect(catalogue.has(item.product)).toBe(true);
  });

  it("starts a new quote on the company's own defaults", () => {
    const [section] = newQuote().sections;

    expect(section.gstPct).toBe(company.defaults.gstPct);
    expect(newSection().wastage).toBe(company.defaults.wastageMm);
    expect(newSection({ inputUnit: "inch" }).wastage).toBe(company.defaults.wastageInch);
  });

  it("opens a charge on the count and the rate the charge master gives it", () => {
    const section = newSection({}, "10MM CLEAR TOUGHENED GLASS");

    for (const type of chargeTypes) {
      const a = newAdjustment(section, type.label);

      expect(a.qty).toBe(type.basis === "per_unit" ? 1 : 0);
      expect(a.rate).toBe(
        type.ratePerThicknessMm === undefined ? (type.rate ?? 0) : 10 * type.ratePerThicknessMm,
      );
    }
  });
});

describe("regression against the 48 sample quotations", () => {
  const lines = corpus.flatMap((q) => q.sections.flatMap((s) => s.lines.map((l) => ({ s, l }))));

  it("reproduces every line amount as area x rate", () => {
    const good = lines.filter(({ l }) =>
      new Decimal(l.area).times(l.rate).minus(l.amount).abs().lte("0.02"),
    );
    expect(good.length).toBe(316);
    expect(lines.length).toBe(316);
  });

  it("reproduces 303 of 316 printed areas from the chargeable sizes", () => {
    const good = lines.filter(({ s, l }) => {
      const calc = areaOf(inferUnit(s, l), s.out_unit, l.ch, l.cw, l.qty);
      const tol = Decimal.max("0.001", new Decimal(l.area).times("0.002"));
      return calc.minus(l.area).abs().lte(tol);
    });
    // The 13 misses are the typed-over area cells documented in dev-plan §9.
    expect(good.length).toBe(303);
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
    expect(failures.sort()).toEqual(["ASHRAF KOLAR 7161 (1).pdf", "BHOOTH SINGH 6613.pdf"]);
    expect(priced.length - failures.length).toBe(44);
  });

  /*
   * SAI GLASS 6374 taxes two of its three sections and leaves the third — 1,564
   * of glass and 120 of holes, printed as 1,684 and carried into the grand
   * total untaxed. While GST was one switch for the whole quote the engine
   * could not produce that page at all, and the sample sat on the list above as
   * a bill the app would not reproduce. With the switch on the section it is
   * simply what the operator set, which is the case for having it there.
   */
  it("reproduces the sample that taxes one section and not the next", () => {
    const sai = toQuote(sample("6374"));
    const taxed = sai.sections.map((s) => s.gstApplicable);

    expect(taxed).toEqual([true, true, false]);
    expect(computeQuote(sai).grandTotal.toNumber()).toBeCloseTo(15943.12, 2);
  });
});
