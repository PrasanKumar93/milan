import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { polishRate } from "../core/products";
import { wastageRuleFor } from "../core/products";
import type { Adjustment, InputUnit, Line, Quote, Section } from "../core/types";
import { cardRate, chargeTypeFor, shortCodeFor } from "../data/masters";
import { clearDraft, isWorthRestoring, loadDraft, saveDraft } from "../storage/draft";
import { newAdjustment, newLine, newQuote, newSection, switchInputUnit } from "./factory";

/**
 * The single place the quote is edited.
 *
 * Every change goes through one of these updaters, which keeps two things true:
 * the quote object is only ever replaced, never mutated, and a change that has
 * knock-on defaults — switching the glass, switching the unit — applies them all
 * at once instead of leaving the operator to fix the rest by hand.
 */

type Patch<T> = Partial<T>;

function replace<T extends { id: string }>(items: T[], id: string, patch: Patch<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/** Clears every override on a line, putting it back on the formula (dev-plan §2.8). */
const LINE_DEFAULTS: Patch<Line> = {
  wastage: null,
  chargeableH: null,
  chargeableW: null,
  area: null,
  amount: null,
};

export function useQuote() {
  const [quote, setQuote] = useState<Quote>(() => newQuote());

  // Read once, before the first autosave overwrites it.
  const [draft] = useState(() => {
    const found = loadDraft();
    return found && isWorthRestoring(found) ? found : null;
  });
  const [draftDismissed, setDraftDismissed] = useState(false);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => saveDraft(quote), 400);
    return () => clearTimeout(timer);
  }, [quote]);

  const patchSection = useCallback((sectionId: string, patch: Patch<Section>) => {
    setQuote((q) => ({ ...q, sections: replace(q.sections, sectionId, patch) }));
  }, []);

  const mapSection = useCallback((sectionId: string, fn: (s: Section) => Section) => {
    setQuote((q) => ({
      ...q,
      sections: q.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
    }));
  }, []);

  const api = useMemo(
    () => ({
      patchQuote(patch: Patch<Quote>) {
        setQuote((q) => ({ ...q, ...patch }));
      },

      setInputUnit(unit: InputUnit) {
        setQuote((q) => (q.inputUnit === unit ? q : switchInputUnit(q, unit)));
      },

      /**
       * Changing the printed unit changes what a rate means, so the rate card is
       * re-read for any line still sitting on a card rate.
       */
      setPrintUnit(printUnit: Quote["printUnit"]) {
        setQuote((q) => {
          if (q.printUnit === printUnit) return q;
          return {
            ...q,
            printUnit,
            sections: q.sections.map((s) => {
              const before = cardRate(s.product, q.printUnit);
              const after = cardRate(s.product, printUnit);
              if (after === undefined) return s;
              return {
                ...s,
                lines: s.lines.map((l) =>
                  l.rate === 0 || l.rate === before ? { ...l, rate: after } : l,
                ),
              };
            }),
          };
        });
      },

      addSection() {
        setQuote((q) => ({ ...q, sections: [...q.sections, newSection(q.inputUnit)] }));
      },

      removeSection(sectionId: string) {
        setQuote((q) =>
          q.sections.length === 1
            ? q
            : { ...q, sections: q.sections.filter((s) => s.id !== sectionId) },
        );
      },

      patchSection,

      /**
       * The glass decides the section title, the short code, the wastage rule and
       * the polish rate, so all four follow the product in one step.
       */
      setProduct(sectionId: string, product: string) {
        mapSection(sectionId, (s) => {
          const rate = cardRate(product, quote.printUnit);
          return {
            ...s,
            product,
            shortCode: shortCodeFor(product),
            wastageRule: wastageRuleFor(product),
            lines:
              rate === undefined
                ? s.lines
                : s.lines.map((l) => (l.rate === 0 ? { ...l, rate } : l)),
            adjustments: s.adjustments.map((a) =>
              chargeTypeFor(a.label)?.ratePerThicknessMm === undefined
                ? a
                : { ...a, rate: polishRate(product) },
            ),
          };
        });
      },

      addLine(sectionId: string) {
        mapSection(sectionId, (s) => ({ ...s, lines: [...s.lines, newLine(s)] }));
      },

      removeLine(sectionId: string, lineId: string) {
        mapSection(sectionId, (s) =>
          s.lines.length === 1 ? s : { ...s, lines: s.lines.filter((l) => l.id !== lineId) },
        );
      },

      patchLine(sectionId: string, lineId: string, patch: Patch<Line>) {
        mapSection(sectionId, (s) => ({ ...s, lines: replace(s.lines, lineId, patch) }));
      },

      resetLine(sectionId: string, lineId: string) {
        mapSection(sectionId, (s) => ({ ...s, lines: replace(s.lines, lineId, LINE_DEFAULTS) }));
      },

      addCharge(sectionId: string, label?: string) {
        mapSection(sectionId, (s) => ({
          ...s,
          adjustments: [...s.adjustments, newAdjustment(s, label)],
        }));
      },

      removeCharge(sectionId: string, adjustmentId: string) {
        mapSection(sectionId, (s) => ({
          ...s,
          adjustments: s.adjustments.filter((a) => a.id !== adjustmentId),
        }));
      },

      patchCharge(sectionId: string, adjustmentId: string, patch: Patch<Adjustment>) {
        mapSection(sectionId, (s) => ({
          ...s,
          adjustments: replace(s.adjustments, adjustmentId, patch),
        }));
      },

      /** Picking a different charge brings its catalogue defaults with it. */
      setChargeLabel(sectionId: string, adjustmentId: string, label: string) {
        mapSection(sectionId, (s) => {
          const type = chargeTypeFor(label);
          const rate =
            type?.ratePerThicknessMm !== undefined ? polishRate(s.product) : type?.rate;
          return {
            ...s,
            adjustments: replace(s.adjustments, adjustmentId, {
              label,
              basis: type?.basis ?? "flat",
              rate: rate ?? 0,
              amount: null,
              taxable: type?.taxable ?? true,
            }),
          };
        });
      },

      resetSection(sectionId: string) {
        mapSection(sectionId, (s) => ({
          ...s,
          rounded: null,
          lines: s.lines.map((l) => ({ ...l, ...LINE_DEFAULTS })),
          adjustments: s.adjustments.map((a) => ({ ...a, amount: null })),
        }));
      },

      resetAll() {
        setQuote((q) => ({
          ...q,
          sections: q.sections.map((s) => ({
            ...s,
            rounded: null,
            lines: s.lines.map((l) => ({ ...l, ...LINE_DEFAULTS })),
            adjustments: s.adjustments.map((a) => ({ ...a, amount: null })),
          })),
        }));
      },

      startBlank() {
        clearDraft();
        setQuote(newQuote());
      },

      /**
       * The quote has been downloaded, so the crash-recovery copy is no longer
       * worth keeping. The quote stays on screen: a second copy or a correction
       * is a re-download, not a re-typing.
       */
      forget() {
        clearDraft();
      },

      restoreDraft(restored: Quote) {
        setQuote(restored);
      },
    }),
    [mapSection, patchSection, quote.printUnit],
  );

  return {
    quote,
    draft: draftDismissed ? null : draft,
    dismissDraft: () => setDraftDismissed(true),
    ...api,
  };
}
