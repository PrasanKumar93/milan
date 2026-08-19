# The checks, in full

Every check the app makes on a quote is listed here. All of them are advice:
nothing on this page can stop a download, refuse a figure or change a number by
itself. The operator is holding the phone and the app is not (dev-plan §7).

Nine of them are built in one place, `app/src/core/validate.ts`, by one function
`warningsFor(computed)`. There is no validation anywhere else in the app. They
are recalculated on every keystroke and shown twice — under the Entry tab and
above the print preview — as **"3 things to check"**, each line opening with a
tag so the list can be read at a glance.

Two more notices come from the engine rather than from the checks, and are
listed separately at the end.

---

## What each one says, and when

| Tag | Fires when |
| --- | ---------- |
| `No glass` | A section has sizes typed in it but no glass chosen |
| `GST twice` | A row sits on the card price, that price already includes GST, and the quote adds GST on top |
| `GST missing` | A row sits on the card price, that price is before GST, and the quote adds none |
| `Wastage rule` | The section's wastage rule is not the one its glass normally uses |
| `No rate` | A row with a size has no rate |
| `Rate unit` | A row's rate is more than five times off the card, which reads as the wrong unit |
| `No quantity` | A row with a size has no quantity |
| `Rounding` | The rounded total differs from the calculated one by more than ₹1 |
| `Discount` | The same, and by more than 5% of the section |

**Nothing unfinished is ever flagged.** A row with no size typed is the next row
rather than a mistake, and is skipped by every row check; a section nobody has
started is not asked which glass it is. This is why the count climbs as a quote
is typed and settles when it is complete.

---

## The three numbers behind them

All three are named constants at the top of `validate.ts`, alone in the file
with the rules they serve.

### `ON_THE_CARD` — 2%, "is this our list price?"

Used only by `GST twice` and `GST missing`. Both warnings claim something about
what a price includes, and that claim only holds while the price is the card's
own. 10 MM clear toughened is ₹1,232 per SQMT, so anything from about ₹1,207 to
₹1,257 is taken to be that figure and is checked for the GST clash.

Type ₹1,150 because that is what was agreed, and both warnings go quiet: a
negotiated figure was decided by somebody who knew what it included, and the app
has nothing left to compare against. The window is narrow for that reason — it
is an identity test, not a judgement about the price.

### `RATE_FACTOR` — five times, "is this even the right unit?"

Used by `Rate unit`. The card carries two columns for the same glass, about
eleven times apart: 10 MM clear toughened is ₹1,232 per SQMT and ₹135 per SQFT.
Reading the wrong column is the error this catches — ₹135 typed into a
square-metre quote prices the glass at a ninth of what was meant, and every
amount below it follows.

The band is deliberately enormous, five times either way: below ₹246 or above
₹6,160 for that glass. Negotiation moves a rate by ten or twenty percent, never
by five times, so a haggled price never trips it while a wrong-unit entry always
does. A wide band is what makes the warning worth reading when it does appear.

### `DISCOUNT_WARN_PCT` — 5%, "was that a rounding or a decision?"

The rounded subtotal is where a reduction is meant to land (§2.9), so this names
the amount rather than objecting to it. Beyond `ROUNDING_GAP` (₹1, in
`engine.ts`) a gap is more than the rounding itself could explain, and the notice
appears as `Rounding`. Past 5% of the section it is called `Discount` and the
sentence adds "larger than a rounding".

---

## What the checks read

Two of them are decided by data rather than by logic, so changing the data
changes the rule:

- **The GST pair** reads `sqmtIncludesGst` and `sqftIncludesGst` in
  `rateCard.json`. The square-foot column is GST-inclusive and the square-metre
  column is not (§2.5), which is the whole reason those two warnings exist.
- **`Wastage rule`** reads `wastageRuleFor`, which returns the `wastageRule` on
  the glass in `products.json` — mirror foot to foot, every other glass on a
  fixed allowance (§2.2), and a fixed allowance for a name typed in by hand.
  Changing which glasses are measured which way is an edit to that file, and
  nothing in the code has an opinion of its own to contradict it.
- **`Rate unit`** and the GST pair both need the glass to be on the rate card at
  all. Mirror, fluted, kaccha and laminated are not, so they are never checked
  against a price.

---

## The two notices that are not checks

These come from the engine, are shown by `OverrideSummary`, and are listed here
so that the full set is in one place:

1. **A value typed over its formula** — a cut size, an area or an amount that no
   longer matches what the formula gives. Restoring a draft or reopening an
   edited workbook can bring these in. Each is shown with the figure the formula
   would give, and one button puts them all back (§2.8).
2. **A row cut to a different allowance** from the rest of its section — the one
   per-row decision the grid still allows, marked on the row itself with a dot.

---

## Changing them

A threshold is a one-line change in `validate.ts`; a new check is a push into
the array in `warningsFor`, with a tag of two or three words and a sentence that
names the figure it is objecting to. `validate.test.ts` pins each rule, both
that it fires when it should and that it stays quiet otherwise — the second
half matters more, since a check that cries wolf is one the office learns to
scroll past.

Section 7 of the dev plan records why each rule exists; most of them are errors
found in the 47 sample quotations, listed in §9.

---

## Where a rule's answer comes from

Three of the checks above ask a master rather than deciding for themselves, and
that is deliberate: the customer's answers change, and a rule that keeps its own
copy of one goes on giving the old answer long after the file has been
corrected. `Wastage rule` reads the `wastageRule` on the glass in
`products.json`; `GST twice` and `GST missing` read the `sqmtIncludesGst` and
`sqftIncludesGst` flags in `rateCard.json`; `Rate unit` and both GST checks
measure against that card's own price.

`engine.test.ts` holds the app to those files under **"what the masters say is
what the app does"** — it walks every glass, every card entry and every charge
and asks whether the app agrees with the catalogue. Editing a master is
therefore enough: nothing in the code has an opinion of its own left to
contradict it, and a test fails if one is ever added.
