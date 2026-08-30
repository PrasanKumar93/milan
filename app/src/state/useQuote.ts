import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { polishRate } from "../core/products";
import type { Adjustment, InputUnit, Line, PrintUnit, Quote, Section } from "../core/types";
import { chargeTypeFor, shortCodeFor, wastageRuleFor } from "../data/masters";
import { clearDraft, isWorthRestoring, loadDraft, saveDraft } from "../storage/draft";
import {
  newAdjustment,
  newLine,
  newQuote,
  newSection,
  settingsOf,
  switchInputUnit,
} from "./factory";

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

      setInputUnit(sectionId: string, unit: InputUnit) {
        mapSection(sectionId, (s) => (s.inputUnit === unit ? s : switchInputUnit(s, unit)));
      },

      /**
       * Changing the printed unit changes what a rate means, and the rates are
       * left exactly as they are. Every one of them was typed by someone who had
       * read the card figure beside the glass, so rewriting them would be the app
       * overruling a price; the §7 warning says a square-metre rate is now in a
       * square-foot section, and the operator decides what it should be.
       */
      setPrintUnit(sectionId: string, printUnit: PrintUnit) {
        mapSection(sectionId, (s) => (s.printUnit === printUnit ? s : { ...s, printUnit }));
      },

      /** A new section carries down the units and tax of the one above it (§2.1). */
      addSection() {
        setQuote((q) => ({
          ...q,
          sections: [...q.sections, newSection(settingsOf(q.sections[q.sections.length - 1]))],
        }));
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
       *
       * The rate is not one of them. The card is a list price and the price on a
       * job is negotiated, so the figure is shown beside the glass and typed on
       * the row — a rate that appeared on its own is a rate nobody checked.
       */
      setProduct(sectionId: string, product: string) {
        mapSection(sectionId, (s) => ({
          ...s,
          product,
          shortCode: shortCodeFor(product),
          wastageRule: wastageRuleFor(product),
          adjustments: s.adjustments.map((a) => {
            const perMm = chargeTypeFor(a.label)?.ratePerThicknessMm;
            return perMm === undefined ? a : { ...a, rate: polishRate(product, perMm) };
          }),
        }));
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
            type?.ratePerThicknessMm !== undefined
              ? polishRate(s.product, type.ratePerThicknessMm)
              : type?.rate;
          return {
            ...s,
            adjustments: replace(s.adjustments, adjustmentId, {
              label,
              qty: type?.basis === "per_unit" ? 1 : 0,
              rate: rate ?? 0,
              amount: null,
            }),
          };
        });
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
    [mapSection, patchSection],
  );

  return {
    quote,
    draft: draftDismissed ? null : draft,
    dismissDraft: () => setDraftDismissed(true),
    ...api,
  };
}
