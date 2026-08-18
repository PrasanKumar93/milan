import { describe, expect, it } from "vitest";
import { newLine, newQuote } from "../state/factory";
import { computeQuote } from "./engine";
import type { Quote } from "./types";
import { warningsFor } from "./validate";

/** dev-plan §7. Each of these is a mistake that actually reached a customer (§9). */

function quoteWith(edit: (q: Quote) => void): Quote {
  const q = newQuote("7178");
  const s = q.sections[0];
  s.lines = [{ ...newLine(s), actualH: 2000, actualW: 1000, rate: 1238 }];
  edit(q);
  return q;
}

const textsFor = (q: Quote) => warningsFor(computeQuote(q)).map((w) => w.text);

describe("warnings", () => {
  it("say nothing about a quote that is simply being typed", () => {
    expect(textsFor(newQuote())).toEqual([]);
    expect(textsFor(quoteWith(() => {}))).toEqual([]);
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
    expect(texts.some((t) => t.includes("usually measured on a fixed allowance"))).toBe(true);
  });
});
