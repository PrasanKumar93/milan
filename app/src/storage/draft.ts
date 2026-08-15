import type { Quote } from "../core/types";

/**
 * Crash protection for the quote being typed — not a database.
 *
 * The app is fill-and-print: the PDF is the record, and nothing is filed away
 * (dev-plan §5). The one thing worth protecting against is a closed tab halfway
 * through a thirty-line quote, so the current quote is mirrored into
 * localStorage on every change and offered back on the next load. It is cleared
 * once the quote has been downloaded or abandoned, so there is never a list of
 * old drafts to manage.
 */

const KEY = "milan.draft.v1";

export interface Draft {
  quote: Quote;
  savedAt: string;
}

export function saveDraft(quote: Quote): void {
  try {
    const draft: Draft = { quote, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // A full or disabled localStorage must never interrupt data entry.
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft.quote && Array.isArray(draft.quote.sections) ? draft : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the draft is disposable by definition.
  }
}

/** True when the draft holds something the operator would mind losing. */
export function isWorthRestoring(draft: Draft): boolean {
  const q = draft.quote;
  if (q.customerName.trim() !== "" || q.proformaNo.trim() !== "") return true;
  return q.sections.some((s) => s.lines.some((l) => l.actualH > 0 || l.actualW > 0));
}
