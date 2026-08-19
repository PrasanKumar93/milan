# Milan Toughened Glass — Billing Software Dev Plan

Status: Draft v3 — rules verified against **47 unique proforma invoices / 57 sections / 284 line items**, plus 5 pages of handwritten rate notes, one competitor proforma, and the 8-page sales brochure (`data/GlassFactorySalesBrochure.pdf`).

v3 folds in two things v2 did not have: the **foot-to-foot wastage rule** the customer described (§2.2), which retro-explains the mirror and fluted sizes v2 had written off as one-offs, and the **product catalogue from the brochure** (§3.2), which is far wider than anything the quotes use.

A clickable mockup of the entry screen and the printed output exists as a Cursor canvas (`quotation-entry-mockup.canvas.tsx`). It is seeded with PROFORMA 7178 and reproduces that quote's totals exactly. Treat it as the UI reference for Phase 3.

Verification harness lives in `scripts/` (`parse.py` → `analyze.py` / `checks.py` / `verify.py`). Re-run it any time the rules change.

| Check                                        | Result                                             |
| -------------------------------------------- | -------------------------------------------------- |
| Line amount = area × rate                    | **284 / 284**                                      |
| Printed area = formula(chargeable size, qty) | **271 / 284** (13 exceptions, all explained below) |
| Whole quote reproduced end-to-end            | **42 / 45** (3 exceptions, listed below)           |

The three quotes the engine does not reproduce are all deliberate. ASHRAF KOLAR 7161 carried `1350.5557` down as `1350`, a ₹1 operator override. BHOOTH SINGH 6613 absorbed a ₹1,238 discount into its rounded subtotal (§2.9). SAI GLASS 6374 is missing GST on one of its three sections, and the app will not reproduce that because GST is a quote-level flag precisely so the omission becomes impossible (§9). The Python harness scores 43/45 because it applies GST per section and so faithfully reproduces the error; the TypeScript engine scores 42 and is the more correct of the two.

---

## 1. What the business does today

Milan Toughened Glass LLP (Bengaluru, GSTIN `29ABXFM7834Q1ZU`) prepares **Proforma Invoices** in Excel and prints them to PDF. Customers send hand-drawn sketches over WhatsApp (`data/more-quotations/glasses and mirrors.pdf` is one); an operator keys the sizes into a sheet and sends back a PDF.

There is no customer master, no rate master, and no numbering beyond a manually incremented `PROFORMA NO`. Each quote is a separate workbook copied from the last one — which is the direct cause of the data errors documented in §9.

### Document anatomy

```
Header      Company name, address, GSTIN, phone, logo
Meta        DATE, PROFORMA NO, ORDER NO, NAME, ADDRESS, GSTIN
            PROJECT REMARK, REF PERSON, PARTY NO, DOC NO, DISPATCH TO
Section×N   One block per glass type (e.g. "6MM CLEAR MIRROR", HSN 7007)
              Line items table
              Subtotal row (total qty, total area, total amount)
              Rounded subtotal
              Extra charges (holes, cutouts, template, document, ...)
              CGST 9% / SGST 9%   (only on GST quotes)
              Section total
Summary     Section totals repeated, then TOTAL AMOUNT
Footer      Bank details, terms, notes, signature blocks
```

Quotes carry 1–3 sections (38 quotes have 1, eight have 2, one has 3). Each section has its own glass type, rate, extras and **its own GST calculation** — tax is per section, not on the grand total.

---

## 2. The calculation engine

### 2.1 Input unit and printed unit are independent

This is the single most important correction to make versus a naive reading of the samples. The **input unit** (millimetres or inches) and the **printed area unit** (SQFT or SQMT) are two separate choices, and all four combinations appear in real quotes:

| Input  | Printed as | Lines | Formula                          |
| ------ | ---------- | ----- | -------------------------------- |
| Inches | SQFT       | 116   | `H × W ÷ 144 × qty`              |
| Inches | SQMT       | 21    | `H × W ÷ 144 ÷ 10.764 × qty`     |
| MM     | SQFT       | 58    | `H/1000 × W/1000 × 10.764 × qty` |
| MM     | SQMT       | 89    | `H/1000 × W/1000 × qty`          |

These are exactly the four formulas in the handwritten note. The conversion factor is **10.764 exactly** — confirmed on all 79 lines where a conversion occurs; it is not the more precise 10.7639.

Input unit is inferred from magnitude (2-digit = inches, 3–4-digit = mm) and confirmed by notation: **fractions only ever appear on inch inputs** (96 of 137 inch lines use them, no mm line ever does). Inch entry must accept eighths — `33 1/4`, `34 5/8`, `38 3/8`, `52 7/8` all occur.

**All three settings are quote-level, not per-section or per-line.** Verified across all 47 quotes:

| Setting | Uniform within a quote |
|---|---|
| Input unit (mm / inch) | **47 / 47** |
| Printed unit (SQFT / SQMT) | **47 / 47** |
| GST applicable | 46 / 47 (the exception is an error, §9) |

Not a single quote mixes millimetres and inches, and none mixes SQFT and SQMT — including the nine multi-section quotes. So the operator picks input unit, printed unit and GST **once per quote**, and every section and line follows. That is a real simplification for the entry screen: three toggles in the quote header, nothing per row.

The three are still independent of each other — all four unit combinations occur (21 quotes inch→SQFT, 13 mm→SQMT, 8 mm→SQFT, 5 inch→SQMT), and SQMT quotes appear both with and without GST. Do not couple them.

### 2.2 Chargeable size (wastage allowance)

There are **two wastage rules**, and which one applies depends on the glass:

```
Fixed          chargeable = actual + wastage        (same wastage on both sides)
Foot to foot   chargeable = each side rounded up to a whole foot
```

First stated by the customer as *"For clear toughened glass 50 mm or 2 inch wastage. Black, brown fluted, extra clear and mirror are all feet to feet"*, and then narrowed by them: **mirror is the foot-to-foot glass, and everything else takes the fixed allowance.** The masters follow the narrower answer — only the two mirror entries in `products.json` start a section on foot to foot — because it is the later word and because the wider list rested on one fluted line and one extra-clear line, neither of which the rule fits well (§2.7). The rule is a section setting either way, so a fluted job that does turn out to be measured foot to foot is one click, not a code change.

**Only the overhang moves the size up: 8.2 ft becomes 9 ft, and 8 ft stays 8 ft.** Confirmed with the customer, and it applies to both sides independently. This is `ceil`, not "always add a foot" — a piece that already lands on an exact foot is charged as it is.

In millimetres the result is then nudged up to a whole 5 mm, which is how 8 ft prints as 2440 rather than 2438.4, 3 ft as 915 rather than 914.4, and 12 ft as 3660 rather than 3657.6.

Testing the rule against every mirror, fluted and extra-clear line in the samples:

| Quote | Actual | Charged | Rule gives | |
|---|---|---|---|---|
| G FOCUSS 7178 · 6 MM mirror | 2290 × 340 | 2440 × 610 | 2440 × 610 | exact — 8 ft × 2 ft |
| G FOCUSS 7178 · 6 MM mirror | 2917 × 628 | 3660 × 915 | 3050 × 915 | width exact, height charged at 12 ft not 10 |
| G FOCUSS 7178 · 6 MM mirror | 2920 × 630 | 3660 × 915 | 3050 × 915 | same |
| AD GLASS 7176 · 10 MM fluted | 84 × 30 in | 96 × 30 in | 84 × 36 in | neither side (§2.7) |
| SVM GLASS 7120 · 5 MM mirror | 18 × 24 in | 18 × 24 in | 24 × 24 in | width exact, height charged as-is |

One line lands exactly, three were charged larger than the rule gives, and one matches neither. That is enough to ship the rule as the computed default: the office is negotiating one dimension on an occasional large piece, not re-entering the quote.

**Decided: the app charges to the next foot, and a sheet that charged something else is left as it is.** G FOCUSS 7178 bills a 2920 mm mirror at 3660 — twelve feet on a piece that is 9.6, and a full mirror sheet, so it may be full-sheet billing or it may be a mistake. Since the cut size is now shown rather than typed (§2.8), and a foot-to-foot row has no wastage box either — the rule ignores the allowance, so the column reads "to next foot" — the app cannot produce that figure at all. Confirmed with the team that this is the right outcome: some old bills carry mistakes, and the app is not required to reproduce them. Two lines in roughly 600. If full-sheet billing turns out to be a real rule, it comes back as a rule rather than as a typed-over cell.

**Wastage is entirely a section-level setting — both the rule and the allowance.** Confirmed with the customer: mirrors are foot to foot, other glass is fixed, and a quote can carry both. PROFORMA 7178 is exactly that — a 10 MM section on a flat 50 mm alongside a 6 MM mirror section on foot to foot.

The allowance sits beside the rule rather than in quote settings, even though it is uniform within a quote in 46 of 47 samples. A number in the header that only applies to some sections is worse than no number at all: the operator has to remember which sections it governs. One place to look, next to the control it belongs with.

Since the rule follows the glass, each section starts with the right one already selected, taken from the glass type in the product master. The operator changes it only when a job is unusual, and the change is marked and resettable like any other override (§2.8). In practice picking `6MM CLEAR MIRROR` from the dropdown is the same action as choosing foot to foot.

So the entry screen splits cleanly: quote settings carry sizes-in, printed-as and GST — the three things verified uniform across all 47 samples — and each section header carries its own wastage. Switching the quote between mm and inches still refills every section's allowance with 50 or 2, since that is a unit change rather than a pricing decision.

**Under the fixed rule the allowance is a setting, not a constant.** It is uniform within a quote in 46 of 47 samples:

| Wastage     | Quotes | Note                                                 |
| ----------- | ------ | ---------------------------------------------------- |
| +2 inches   | 22     | default for inch entry                               |
| +50 mm      | 14     | default for mm entry                                 |
| +30 mm      | 6      | CITY GLASS, DEV ASSOCIATES, MOKSH, PUSHPA, SJ CRAFTS |
| +1.5 inches | 1      | CITY GLASS                                           |
| +0          | 2      | mirror / black — foot to foot, already on a foot (§2.6) |
| +12 H, +0 W | 1      | fluted — foot to foot on the height (§2.7)           |

Confirmed with the team: **the standard is 50 mm (2 inches), and 30 mm is a concession given to specific customers.** The single +1.5 inch quote is the inch-side equivalent of the same concession (1.5 in ≈ 38 mm), so treat the reduced allowance as a per-customer setting expressed in whichever unit that customer is quoted in.

Confirmed that **the biller decides the wastage on each job** rather than it being tied to a customer record. So: a field on each section pre-filled with 50 mm (or 2 in), freely editable. No customer-level wastage table is needed.

**Wastage is a single column in the entry grid, holding one number that applies to both height and width.** Confirmed with the team: the allowance is never deliberately different on the two sides. This makes the allowance visible at a glance instead of being implied by the difference between two numbers, and correcting it is one edit rather than two.

```
   ACTUAL SIZE        WASTAGE      CHARGEABLE
   HEIGHT  WIDTH                   HEIGHT  WIDTH    ← derived, greyed
   2922    832        50           2972    882
```

The apparent asymmetric allowances in the samples are not asymmetric wastage at all — they are foot-to-foot rounding landing differently on each side, which is why that rule (above) removes the need for a two-part wastage column.

**Under foot to foot the column reads the row in feet.** There is no allowance to type, so it is headed `IN FEET` and shows `7.51 → 8 ft` over `1.12 → 2 ft` — where each side stands and the foot it is charged at, in the order of the boxes either side of it. The customer asked for this: the column used to say "to next foot", which told an operator the rule was in force but never what it did to the piece in front of them, and the rule is the one place on the screen where a size grows by a foot without anyone typing a number. The heading's own note steps the conversion out in full — `2290 ÷ 304.8 = 7.51 ft`, `up to the next foot = 8 ft`, `8 × 304.8 = 2438.4`, `up to the next 5 mm = 2440` — and each side of a row repeats those steps on hover, so a queried piece can be explained from the screen it was priced on.

**The cut size is shown, not typed** (§2.8). v2 kept it editable so that a large mirror could be entered as "charge it as 3660 × 915" rather than as an allowance; the team asked for it to be locked, on the grounds that a cut size which disagrees with the sizes beside it is unexplainable when the piece is queried. A row that has to be cut differently sets its own wastage, and both sides move together.

A line carrying a wastage different from its section's is flagged with a dot, so a stray allowance is visible without opening anything.

**Entry grid header follows the sheet's two-level layout** — a group heading `ACTUAL SIZE (mm)` spanning `HEIGHT` and `WIDTH` sub-labels, each sitting directly over its own box, and the same for `CHARGEABLE`. This is the layout the operators already read every day. The header is sticky so it stays visible on long quotes.

**The count comes before the area, on screen and on paper.** The area is worked out from the count — chargeable height by width by count — and a figure that goes into another one is read before it, or the reader meets a total whose ingredients are still to come. This is also the order the office's own sheet has always used, so the printed document is untouched (§2.10) and an operator checking a page against the screen reads the columns in the same order on both.

**The charges table leaves the area column empty.** It sits in the same card under the same column widths, and its count, rate and amount have to land under the glass's count, rate and amount — otherwise the money in a section is written in two places and added in a third. A charge has no area, so the column simply stands empty in those rows, which is the truth about a charge rather than a gap to be closed. The charge name takes the whole run to its left and stands at the right of it, against the count.

**Kaccha (raw, untoughened) glass carries wastage too** — it is not a toughened-only rule, since the offcut is lost either way. The data agrees: all 27 kaccha lines use the standard +2 in. "Kaccha" is the raw sheet; toughened is the finished, processed product.

### 2.3 Amount and rounding

```
line_amount      = area × rate                    -- not rounded, printed as-is
section_subtotal = Σ line_amount                   -- printed unrounded
rounded          = round(section_subtotal)         -- OPERATOR-EDITABLE
taxable          = rounded + Σ extra_charges
CGST = SGST      = taxable × 9%
section_total    = taxable + CGST + SGST
grand_total      = Σ section_total
```

Extras are **taxed** — they go in before GST, all of them, with no per-charge choice (§2.9). Verified on all 20 GST sections.

The rounding step is genuinely manual. Across 50 sections: 38 round to nearest, 3 truncate down, several round up (`3943.212 → 3944`, `6795.371 → 6796`, `1773.389 → 1774`), 2 leave the exact paise, and one is a customer discount booked as a round-off (BHOOTH SINGH: `45942.623 → 44705`, ₹1,238). So this is an **editable field pre-filled with round-to-nearest** (§2.8), and real discounts get their own adjustment line (§2.9). The two quotes the engine does not reproduce exactly are precisely these two operator overrides.

Use decimal arithmetic throughout, never floats.

**How the numbers are printed.** Every one of the 1,086 figures across the 47 samples — areas, rates, line amounts, subtotals, GST, section and grand totals — carries **seven significant figures and never more**, with trailing zeros and thousands separators dropped. That is Excel's General format in a standard-width column, and it is why an area prints as `10.38806`, a line amount as `1969.153`, GST as `974.7`, and why a total above a lakh loses its paise (`261803.1`, sample 6344). The document reproduces this exactly, so an app-made PDF sits beside an old one without looking different. The entry screen is not bound by it and shows full rupees and paise with Indian grouping.

### 2.4 GST

Always CGST 9% + SGST 9%, applied per section on the taxable base. No IGST anywhere in the sample, so every customer so far is inside Karnataka. Rounded to 2 decimals, half-up.

### 2.5 Rates

Rates are **per line and freely edited**; the rate card is only a default. Observed spread:

| Product      | Rates seen                                                          |
| ------------ | ------------------------------------------------------------------- |
| 10 MM clear  | 1170 (×40), 1232 (×20), 1230 (×5), 1300 · SQFT 135 (×40), 130 (×13) |
| 8 MM clear   | 1049 · SQFT 115                                                     |
| 12 MM clear  | 1380, 1414, 1430 · SQFT 155                                         |
| 6 MM clear   | 867, 866                                                            |
| 5 MM clear   | 700, 730 · SQFT 85                                                  |
| 12 MM kaccha | SQFT 85, 130                                                        |
| 8 MM kaccha  | SQFT 95                                                             |
| 6 MM mirror  | 1323                                                                |
| 5 MM mirror  | SQFT 135                                                            |
| 8 MM black   | SQFT 170                                                            |
| 10 MM fluted | SQFT 350                                                            |

**Rate lives on the line, defaulted from the section.** In 56 of 57 sections every line shares one rate, so the section header carries a rate that fills down and a "apply to all lines" control. The single exception is real — SHYAM LAL 7154's kaccha section mixes ₹85 and ₹130 — so the per-line field must stay editable rather than being collapsed into a section-only value.

The rate card from the notes still holds as the default, and the SQFT/SQMT relationship `sqft_rate = sqmt_rate × 1.18 ÷ 10.764` reproduces it to within a rupee:

| Thickness         | SQMT | Implied SQFT | Card |
| ----------------- | ---- | ------------ | ---- |
| 5 MM              | 775  | 84.96        | 85   |
| 6 MM              | 867  | 95.04        | 95   |
| 8 MM              | 1044 | 114.45       | 115  |
| 10 MM             | 1238 | 135.70       | 135  |
| 12 MM             | 1414 | 155.00       | 155  |
| 8 MM brown/black  | 1550 | 169.90       | 170  |
| 10 MM brown/black | 1733 | 189.96       | 190  |
| 12 MM brown/black | 2007 | 219.98       | 220  |

So the SQFT rate is the GST-inclusive equivalent of the SQMT rate, rounded to a tidy number. Rate cards need an effective date; the sample card is dated 14/8/26.

**The card says which of its columns has tax in it.** That relationship is not a rounding curiosity, it is the whole reason every SQFT sample prints no tax line while every SQMT one prints two: ₹1414 the square metre is a price before GST and ₹155 the square foot is the same price after it. The card carries `sqmtIncludesGst: false` and `sqftIncludesGst: true` rather than the app inferring it from the unit, so a card that one day prices both columns the same way only has to say so.

Two settings decide which of those the operator ends up with — the printed unit and the GST switch — and they are set independently, so a quote can tax a taxed price or print a pre-tax price with no tax on it. Neither looks wrong on the page. So the section header shows the card figure with what it includes, coloured, beside the glass it prices: **₹1,414 / SQMT · GST to be added**. §7 carries the two warnings for the mismatches.

**The card is quoted and never applied.** An earlier build filled the rate in from the card and left the operator to correct it — the card figure is the one that was billed in 33 of the 41 sample sections that have a card price, so it was right far more often than not. It is still the wrong default, for the same reason a default glass is: a rate that appears on its own is a rate nobody checked, and the one it is wrong for is a negotiated price the customer will argue about. The figure is shown and the rate is typed. Nothing rewrites it either, not even switching the printed unit — that turns a square-metre rate into a square-foot quote, and warning (2) already says so.

**The card covers toughened glass and nothing else** (confirmed with the customer). Mirror, fluted, kaccha, laminated, DGU and the rest have no default: the rate is typed on the line, and the §7 check that catches a SQFT rate in a SQMT quote has nothing to compare against on those sections. Extending the card is a JSON edit whenever the office writes the other prices down.

**Brown and black share a price but stay two products.** The card prices them together — "8MM BROWN & BLACK 170" — and it would be one row less to name the product `BLACK / BROWN TOUGHENED GLASS`. That name would then print on the customer's proforma, which is a document naming glass that was actually cut: the customer bought brown or they bought black. So the catalogue lists both and the card carries both, with the same figures. It also costs nothing the day the two prices diverge.

### 2.6 Mirror — foot to foot (revised in v3)

v2 recorded this as "a rare large-mirror job with hand-typed sizes, no rule to find". The customer has since named the rule: **mirror is foot to foot** (§2.2). That reading is better than the v2 one because it explains where the numbers came from rather than declaring them arbitrary — 2440 × 610 is exactly 8 ft × 2 ft, and 3660 × 915 is exactly 12 ft × 3 ft. Two of the three G FOCUSS lines were still charged a further two feet over what the rule gives, and the app no longer reproduces those (§9).

For the record, the four mirror lines in the sample:

| Quote                        | Input  | Actual     | Charged    | Wastage    |
| ---------------------------- | ------ | ---------- | ---------- | ---------- |
| SVM GLASS 7120 (5 MM mirror) | inches | 18 × 24    | 18 × 24    | none       |
| G FOCUSS 7178 (6 MM mirror)  | mm     | 2290 × 340 | 2440 × 610 | +150, +270 |
| G FOCUSS 7178                | mm     | 2917 × 628 | 3660 × 915 | +743, +287 |
| G FOCUSS 7178                | mm     | 2920 × 630 | 3660 × 915 | +740, +285 |

The SVM line is the one that does not fit: 18 × 24 inches is 1.5 ft × 2 ft and was charged as-is, where the rule makes it 24 × 24. It is a small mirror, and both of the lines that contradict foot to foot are small pieces already sized in whole or half feet — consistent with the rule being about not being able to sell the offcut of a large sheet. Not worth encoding on one sample: a small mirror charged as measured is a section switched to the fixed allowance at zero, which is two clicks.

The 8 MM black line is now explained rather than exceptional: FAREED BHAI's 24 × 24 stays 24 × 24 because both sides are already on a whole foot, which is what the confirmed rule does.

### 2.7 Fluted glass — foot to foot (revised in v3)

The customer names black, brown fluted and extra clear as foot-to-foot glasses along with mirror. The single fluted line in the samples is the one that fits the rule least well: AD GLASS 7176, `84 × 30 → 96 × 30` in at ₹350/sqft. The height went from exactly 7 ft to 8 ft, which the confirmed rule does not do, and the width stayed at 30 in (2.5 ft) rather than going to 36.

Both deviations point the same way: fluted stock comes in fixed-width planks cut only to length, so the width is whatever the plank is and the length is charged generously. That is a plausible product-specific rule but it rests on one line, and inventing it would mean a second rounding rule to maintain.

**Fluted therefore starts on the fixed allowance**, with mirror the only glass that starts foot to foot (§2.2). The customer's later answer and the evidence agree here: the one fluted line in 47 quotes does not follow foot to foot on either side, so defaulting it to that rule would have put a warning on the section every time it was quoted correctly. If fluted becomes common, this is the first thing to revisit.

### 2.8 Design principle — decisions are typed, consequences are worked out

**Decided: what was measured or agreed is typed; what follows from it is shown.** The v2 rule was the opposite — every derived cell was editable and an override was merely flagged — and the team asked, cell by cell, for the derived ones to be locked. The line where they drew it is a good one, so it is now the rule:

| Typed                                                              | Worked out and greyed                        |
| ------------------------------------------------------------------ | -------------------------------------------- |
| actual height and width, wastage, count, rate                      | chargeable height and width, area, amount    |
| charge name, count and rate                                        | charge amount                                |
| the rounded subtotal — the one figure the office genuinely decides | the subtotal, the taxable base, GST, totals  |

Each of the locked cells keeps the tooltip that says where its number came from — "Actual + 50", "Chargeable H x W x qty", "Qty x rate" — so nothing becomes unexplained by being locked.

**Why this way round.** A derived cell that disagrees with the numbers beside it is how a wrong bill gets printed: SHYAM LAL 7154 has eleven typed-over area cells that overcharge by 6–15% (§9), and every one of them still shows the sizes it does not match. Locking them removes that failure entirely rather than reporting it after the fact. The generality is not lost either, because every one of those cells has a typed input behind it: a piece that must be cut differently changes its **wastage**, a price that must come out differently changes its **rate**, and a bill that must come out differently changes its **rounded subtotal**. Each of those is the number that was actually decided, which is also the number to look at when the customer queries the piece.

**The engine still carries overrides, and the badge still exists.** The sample quotations contain typed-over cut sizes and areas, the exported workbook can be edited and reprinted (§6.3), and a draft saved by an earlier build may hold one. Such a value keeps its dot and is listed in the override summary with the formula's figure beside it, and one click puts it back. What has gone is the screen's ability to create one.

**What can still be typed over, and is still flagged:** a row cut at an allowance other than the section's, and the rounded subtotal (§2.9). Both are listed in the pre-download summary with a reset for the whole quote. Per-section reset has gone with the rest — with three typed cells per row there was nothing for it to do that its neighbours did not, and "Reset section" left the operator guessing what it would take back.

### 2.9 Charges, discounts and adjustments — one generic list

Extras, discounts and round-off collapse into a single ordered list of adjustments per section, so a new charge type never needs code:

```
Adjustment {
  label      picked from the charge catalogue, or free text via "Others"
  qty        how many. 0 means the charge is not counted
  rate       rupees for one, or the whole charge where there is no count
  amount     qty x rate, or the rate alone — worked out, not typed (§2.8)
}
```

**There is no taxable flag either.** v2 gave each charge one, defaulting to true. Every charge in all 47 samples is taxed, and the team confirmed the rule as they think of it: GST is decided once for the quote, and a quote with GST charges it on the glass and on the holes alike. A per-row switch offered a combination that has never been quoted and that nobody could explain on the printed document, so the column is gone and the charges go into the taxable base with the glass.

**There is no basis field.** v2 had one — per-unit, flat, and a percent that was dropped early — and the team then asked for the flat option to go too: every charge is a count and a rate, and a one-off charge is simply a rate with nothing to count. Removing the column removed a decision that was already implied by what was typed in the two boxes beside it.

**The count decides how the line prints**, which is what keeps the document identical (§2.10). The sheet prints `HOLES 6 180` where something was counted and `DOCUMENT CHARGE 100` where it was not — 49 charge lines with a count and 34 without, across the samples. Five of the counted ones are counts of exactly 1 (`L CUT OUT 1 150`), so neither always printing the count nor suppressing a count of one would reproduce the sheet. An empty count does, and it also reads correctly: nothing to count, so nothing is printed.

**Every adjustment prints.** v2 gave adjustments a print flag; confirmed with the team that a charge added to a quote is a charge shown on the quote, so the flag is gone and the column with it. Print flags still exist elsewhere (§2.10) — just not here.

**Every adjustment is optional and nothing is pre-added.** A section starts with an empty list; the operator clicks **Add charge**, and the row arrives with nothing chosen and nothing charged — the catalogue names a charge but no longer prices one (§3.1). **12 of 47 quotes carry no adjustments at all**, so anything auto-added would be wrong more often than right.

**The charges table keeps its heading with nothing under it, and Add charge sits below it** — the same shape as the grid and its Add line button above. An empty section then says what a charge would be made of before one exists, and the two buttons read down the card in the order the work happens: sizes, then extras.

**The charge name is a dropdown over the catalogue in §3.1, opening on `— Select —`, with an `Others…` entry that reveals a free-text box.** It is the same three states as the glass (§3.2) and for the same reason: nothing is named for the operator, the list is there so the office's own spelling is picked rather than retyped, and a charge the list has never heard of is never a blocked quote. v2 proposed one-click chips for the three most common charges; that was replaced because it splits the interaction in two — a chip for some charges and a dropdown for the rest — where a single Add-charge button matched to the Add-line button beside it is one thing to learn.

What the samples charged, and how often, is in the table in §3.1.

Confirmed with the team that **specific customers get discounts**, which explains the one quote the engine could not reproduce (BHOOTH SINGH, `45942.623 → 44705`, a ₹1,238 reduction booked as a rounding adjustment).

**A discount does not print as its own line, and is not an adjustment.** Today it is absorbed into the rounded subtotal, and the PDF must keep looking exactly as it does now (§2.10). Since adjustments now always print, a discount is instead recorded by **overriding the rounded subtotal**, which is already an editable field (§2.3) with an override badge and a reset. The screen shows the computed subtotal beside the typed one so the gap is explicit; the PDF shows only the typed figure. This reproduces BHOOTH SINGH exactly — the sheet shows `44705` with no explanation — while the operator now sees _why_ it is 44705.

**A rounding is not a discount, and is not reported as one.** Rounding to the rupee always moves the figure by less than a rupee, so the "Discount given" line only appears once the gap is more than that — `95.40` written as `95` says nothing, `95.40` written as `90` says ₹5.40. A line that appeared on every quote was a line nobody read. `ROUNDING_GAP` in `core/engine.ts` is the one place that threshold lives, and the §7 warning uses the same one.

### 2.10 Transparent on screen, unchanged on paper

The governing rule for the whole product:

> **The PDF keeps the exact format and content it has today. All the new transparency lives on screen.**

Customers already receive this document and recognise it; changing it creates questions the business does not want to answer. So the screen gains formulas, working, charge breakdowns, discounts, wastage and override badges — and the print output gains nothing.

What stays on screen only: the wastage column, override badges and the override summary, formula tooltips, the computed-vs-typed rounded subtotal (§2.9), and cost/margin if it is added later. Everything the operator adds as a charge prints (§2.9). The quote-level internal note from v2 is dropped for v1 — the team asked for it to be removed rather than hidden, and a note nobody can see on paper is a note nobody writes.

**The print preview is a full replica of the PDF**, not a table of numbers: company header and GSTIN, all the meta fields, section blocks, summary lines, bank details, terms, notes and signature blocks. Anything less means the operator is checking one document and sending another. This is now enforced rather than promised: `export/layout.ts` describes the document once, and the preview and the PDF are two renderings of the same rows. The PDF is rebuilt from that description by pdfmake rather than converted from the HTML — a static site has no headless browser to print with, and rasterising the page would put a picture of the numbers in front of the customer instead of the numbers. The cost of rebuilding is that the two renderers can draw the same row differently, so `renderings.test.tsx` has each of them describe the sheet cell by cell — text, ruled, filled — and requires the two descriptions to match.

**The preview is the page, at the size it leaves the printer.** It is 210 mm wide with the PDF's own margins (40 pt at the sides, 30 pt top and bottom) and its 8 pt type, laid on the desk of the app with the paper edges showing, so a line that wraps on screen is a line that wraps on paper. The document's own look is described once as well, in `layout.ts`: the letterhead mark from `public/logo.png`, the company stamp from `public/stamp.png` standing over Authorised Signatory as it does on the signed copies, the sheet's red headings and purple title, the note in blue, `TOTAL AMOUNT` on the sheet's yellow, and the boxed blocks — order details, section head, bank and terms, note, acceptance — that the office's own sheet is built from. Below the lines only the figures are ruled, each in a box of its own, which is how the existing sheet separates a charge from the empty width beside it. Every `LABEL : value` line on the page — the order details, the bank block, the terms, the four names at the foot — is held as a `Field` with the two parts apart, because the label is printed bold and the value is not; a page of headings and blanks is read label first. Nothing sits against a rule: what is under a heading is inset from it. The colours print: `print-color-adjust: exact`, so Ctrl-P from the preview and Download PDF put the same page in front of the customer. The sides and the top of the first page are the document's own padding rather than the page's, because the print dialog's **Margins: None** throws away everything `@page` asks for, and a letterhead starting at the edge of the paper is the failure worth ruling out; `@page :first` drops the page's own top margin so the two are never added together, and a second page takes its margins from `@page` as usual — padding on one long block is only applied at its ends.

One typo is corrected on the way: the column head reads ACTUAL SIZE, not `ACTAUL SIZE`. It is on the list in §8, and a heading is the safest place in the document to fix one.

**The sheet never says a figure twice**, and three habits follow from that. Each was read off all 47 samples, and each is now a rule in `export/layout.ts`:

| The sheet prints | When | Samples |
|---|---|---|
| the qty / area / subtotal row above the rounding | only where the section has more than one line | 21 one-line sections, none with the row |
| the taxable base as a bare figure under the charges | only where GST is worked out on it | 11 of 11 with GST, 27 of 29 without |
| a section total labelled with the glass, and the summary block repeating them | only where the quote has more than one section | 38 one-section quotes, none labelled |

A one-section quote therefore ends: rounded subtotal, charges, GST if any, `TOTAL AMOUNT`. Nothing between them. This was found by typing RAJU 6363 into the app and putting the result beside the original — the preview was three rows longer than the sheet.

A useful consequence: because the PDF is fixed, the four sample quotations double as regression tests — any change that alters their output is a bug.

## 3. Catalogues

Both catalogues below ship as JSON in `src/data/` and are the source for the two dropdowns in the entry screen. **Every name and rate in them is provisional** — they are derived from the samples and the brochure, and the customer will re-verify them. Because they are JSON rather than code, correcting one is an edit and a commit, not a release.

### 3.1 Charge catalogue — the names, without the prices

**The catalogue keeps every name and carries no rate.** A charge row arrives unnamed, uncounted and at ₹0; the name is picked off the list and the price is typed. The customer asked for the rates to go and the names to stay, which splits the two things the catalogue was doing: the names are the office's own and are worth picking rather than spelling — the samples carry `HOLE` and `HOLES`, `CUT OUT` and `CUTOUT`, `FORSTARTE` and `FROSTARTE CHARGE` — while the price is a judgement made per job, and a default price is a price nobody re-reads. Polish is the exception, and it is a rule rather than a price: ₹1 per mm of glass thickness per running foot (§3.3), filled in from the section's glass because it is a calculation, not a quote.

The list still says **how** each charge is billed, since that is the office's own practice and not a number to negotiate: `HOLES 6 180` prints a count and `DOCUMENT CHARGE 100` does not, which is the `basis` field, and all it now decides is whether the row opens at one or at none.

What each was billed at across the 47 samples is kept here as evidence rather than as a default. Restoring any of it is a `"rate"` back on a line of `chargeTypes.json`:

| Charge           | Counted?          | Rates billed          | In quotes |
| ---------------- | ----------------- | --------------------- | --------- |
| HOLES            | always            | ₹30 throughout        | 22        |
| CUTOUT           | always            | ₹100 throughout       | 18        |
| DOCUMENT CHARGE  | never             | ₹100 throughout       | 12        |
| CORNER ROUND     | never             | 50 ×2, 100, 150, 200  | 5         |
| 50MM HOLE        | never             | 100 ×3, 200           | 4         |
| TEMPLATE CHARGE  | never             | 400, 300, 1500        | 3         |
| L CUTOUT         | always            | ₹150 throughout       | 3         |
| CROSS CHARGE     | never             | ₹100 throughout       | 2         |
| U CUTOUT         | always            | 150, then 250         | 2         |
| FROSTING CHARGE  | never             | 610, 2100             | 2         |
| TRANSPORT CHARGE | never             | ₹500                  | 1         |
| DESIGN CHARGE    | never             | ₹1350                 | 1         |
| SHAPE CHARGE     | never             | ₹100                  | 1         |
| BIG CUTOUT       | never             | ₹400                  | 1         |
| PAINT CHARGE     | never             | ₹800                  | 1         |
| POLISH           | always            | ₹1/mm per rft         | 0 — from the customer, not the samples |

One note on that table for whoever restores a figure from it: these are what was billed, not what was quoted off a list. `HOLES` at ₹30 and `CUTOUT` at ₹100 never move across the whole corpus and would be safe defaults; `CORNER ROUND` runs from ₹50 to ₹200 and `TEMPLATE CHARGE` from ₹300 to ₹1500 on jobs weeks apart, which is the customer's point about typing the price.

**L and U cutouts are shape cuts, not hole sizes** — the glass is cut to an L or U profile, which is slower and riskier than a plain rectangle, hence the higher rate. `BIG CUTOUT`, `CORNER ROUND` and `SHAPE CHARGE` belong to the same family.

### 3.2 Product catalogue (from the brochure)

The brochure sells far more than the quotes bill. Products are built from two dropdowns — **thickness × glass type** — which covers the catalogue without enumerating every combination, plus a free-text option for anything else.

```
Thickness    4, 5, 6, 8, 10, 12 MM
             4+4, 5+5, 6+6, 8+8, 10+10 MM   (laminated build-ups)
Glass type   Clear Toughened · Extra Clear Toughened · Black Toughened
             Clear / Black / Brown Fluted Toughened
             Frosted · Acid Wash · Colour Etched
             Clear Mirror · Mirror
             Laminated · DGU · Kaccha
```

Only clear, kaccha, mirror, black and fluted appear on any quote. Frosted, acid wash, colour etched, laminated and DGU are brochure-only. Confirmed with the team that these need no special handling: a finish or a treatment is priced by **adding a charge with its own unit price, or a flat amount** (§2.9), which the charge row already supports. So frosting billed at ₹20 per sqft is a count of sqft at ₹20, and frosting billed as ₹610 for the job is ₹610 with nothing counted — the same row either way, and no per-sqft basis or product-specific rule is needed.

Two things stay attached to the product: the **wastage rule** it defaults to (§2.2) and the **short code that prints in the summary block** (`10MM CTG` for 10 MM clear toughened). The summary codes in the samples are abbreviations of the section title, not the title itself, so the master carries both.

**Neither dropdown starts on anything.** Both open on `— Select —`, so a section has no glass until somebody picks one. 10 MM clear toughened would be right on a good half of the quotes and was the default until the customer asked for this, and they are right: the product line is what the proforma prints as the description of what was sold, and a default that is usually correct is one nobody reads on the quote where it is not. The half-chosen state that follows is real — a thickness with no glass yet — and is treated as no glass rather than as a glass named "12MM", which is also what §7 (10) warns about once sizes are typed.

### 3.3 Polish

**Polish is an ordinary charge, not a rule in the engine.** It sits in the catalogue as a per-unit charge billed in running feet:

```
rate = thickness_mm × ₹1        -- so 10 MM glass polishes at ₹10 per running foot
qty  = (H + W) × 2 ÷ 12 × pieces        -- inch input, perimeter in running feet
     = (H + W) × 2 ÷ 304.8 × pieces     -- mm input
```

Confirmed with the customer: **₹1 per mm of thickness**, not the ₹1 raw / ₹2 toughened split v2 read into the handwritten notes.

Both figures arrive filled in when polish is added to a section — the rate from the glass, the quantity from the perimeter of the pieces in that section — and both are ordinary editable fields. That is the point: the arithmetic nobody wants to do by hand is done, and a negotiated polish price is one edit rather than an argument with the software. No quote in the sample carries a polish charge, so these are defaults rather than verified figures, which is exactly the case for making them editable and leaving them in JSON.

Frosting ₹20/sqft and design ₹40/sqft come from the same notes and work the same way — a per-unit charge with the quantity in sqft.

**Jobwork is out of scope.** Confirmed it is always separate hand work and does not belong on the proforma, so the ₹15/16/20/24 per sqft rates and the ₹1-per-mm hole rates are recorded here for reference only.

---

## 4. Data model

```
Company            issuer details, GSTIN, bank details, logo, terms text
Customer           name, addresses, GSTIN, phone, default discount_pct
                   (created on the fly by typing a name; autocompletes from
                    names used before — no master list to seed)
Product            thickness, type (Clear Toughened | Kaccha | Mirror |
                   Black | Fluted | ...), section title, short_code,
                   wastage_rule (fixed | foot_to_foot)
RateCard           effective_from
RateCardItem       product_id, sqmt_rate, sqft_rate
ChargeType         name, basis (per_unit | flat — only sets the starting
                   count on a new row, §2.9), default_rate,
                   rate_per_thickness_mm    (polish only, §3.3)
Shape              BLOCK, DRW, TEMPLATE, MIRROR
Quotation          number, date, customer_id, input_unit, print_unit,
                   gst_applicable, project_remark,
                   ref_person, party_no, doc_no, order_no, dispatch_to,
                   status
QuotationSection   quotation_id, product_id, rate, rounded, sort_order,
                   wastage_rule,            (defaults from the glass, §2.2)
                   wastage                  (allowance under the fixed rule)
QuotationLine      section_id, sl_no, shape, actual_h, actual_w,
                   wastage,                 (one value, both sides, not printed)
                   chargeable_h, chargeable_w,   (derived, shown not typed)
                   qty, area, rate, amount
Adjustment         section_id, sort_order, label, qty, rate, amount
                   (qty 0 means not counted — the rate is the charge, §2.9)
```

Every derived field is stored as `{ value, source: 'auto' | 'manual' }` so a figure that came from somewhere else keeps its badge and its reset (§2.8). Fields that carry this: `chargeable_h`, `chargeable_w`, `area`, `amount`, `rounded`, and each adjustment's `amount`. Only `rounded` — and a line's `wastage`, against the section's — is set that way from the screen.

**HSN is not in the model.** Every section of all 47 samples prints `7007`, so it is one value in the company master rather than a column on the product and a copy on every section. If a product ever needs a different code, it goes back on the product — but duplicating a constant in three places to prepare for that is how the codes drift apart.

Changes from v2: wastage is one value rather than `wastage_h` / `wastage_w` (§2.2); **both** `wastage_rule` and `wastage` sit on the section, defaulted from the product and the input unit; adjustments lose `sign`, `base`, `print`, and now `basis` and `taxable` too (§2.9); both `internal_note` fields are gone (§2.10); `hsn_code` is gone from the product and the section; products gain `short_code` for the summary block and `wastage_rule` as the source of the section default.

Store dimensions in the unit they were entered, with the unit recorded. Persist computed `area` and `amount` on the row so reprinting an old quote never changes if a rate card is edited later.

Shapes observed: `BLOCK` (167), `DRW` (92), `TEMPLATE` (21), `MIRROR` (3). Products: clear toughened 5/6/8/10/12 mm, kaccha (untoughened) 8/12 mm, mirror 5/6 mm, black 8 mm, fluted 10 mm.

---

## 5. Stack — static single-page app, no backend

Decided: **React + Vite + TypeScript**, deployed to **GitHub Pages**. No server, no database.

The product in one sentence: **the operator fills a form in the browser and clicks Download PDF or Download Excel.**

- **Decimal.js** for all money and area math.
- **Masters as JSON files** in `src/data/`: company, products, rate cards, charge types, shapes, terms. Editing a rate becomes a commit, which gives free version history.
- **Grid entry component** with Excel-like tab/enter navigation, paste-from-Excel, inch-fraction parsing, and auto-filled chargeable size. This is where operator speed lives and deserves the most attention of any UI work.
- **No quotation storage.** Fill the form, download the PDF, done.

### Why nothing is filed away

An earlier draft of this plan put quotations in IndexedDB with a recent-quotes list and a JSON backup. That has been removed. The app stores no quotations at all.

The reasoning is that the PDF already is the record — the business keeps them today and has done for years — so a second copy in a browser database is a second source of truth that can disagree with the first, needs a list UI to navigate, needs export/import so a new laptop does not lose it, and needs a schema version so an old copy still opens. That is a lot of machinery in service of a question the business has not asked.

The samples back this up. Of 62 sample PDFs, 15 are duplicates, and 14 of those are byte-identical re-downloads of the same document. **Exactly one is a genuine revision** — BHOOTH SINGH 6613, where a ₹1,238 discount moved out of the round-off and into the line rates. So reopening a quote to change it happens about once in 47 jobs, and re-keying it is a rare cost rather than a daily one.

What is kept is **crash protection, not filing**: the quote being typed is mirrored into `localStorage` on every keystroke and offered back if the tab is closed or the browser crashes. A thirty-line quote is twenty minutes of typing, and losing it to a stray tab close is the one failure that would make an operator distrust the tool. It is a single key, cleared once the PDF is downloaded, so there is never a pile of old drafts to manage.

If revisions later turn out to matter more than the samples suggest, the smallest thing that solves it is a **Save quote file** button producing a small JSON next to the PDF, and an **Open quote file** to load it back — one file per quote, which is exactly the workbook-per-quote habit the business already has. That needs no database either.

**Download PDF** via **pdfmake** — one click, controlled filename (`PROFORMA-7178.pdf`, or `PROFORMA.pdf` while the number is still blank, and the workbook takes the same name), vector text. The layout is a fixed bordered grid that maps cleanly onto pdfmake's table model. Keep `window.print()` as a secondary Print button; avoid `html2canvas` + `jsPDF`, which produces blurry raster output.

**Download Excel** via **ExcelJS**, not SheetJS — SheetJS's free build cannot write cell styling, so borders and merged cells would be lost. ExcelJS handles merged cells, borders, column widths, number formats and live formulas.

**The workbook carries live formulas.** An earlier draft of this plan argued for a values-only export, on the grounds that the PDF is the customer's document and a formula-bound sheet would create a second source of truth. That was decided the other way, and for a good reason: **nothing is filed away, so the workbook is the only way an old quote can be changed.** Re-keying a thirty-line quote to correct one size is the cost the values-only export would have imposed, every time. The three objections are answered rather than ignored:

- _Two sources of truth._ There already is only one, and it is the last file downloaded. What the workbook removes is the re-keying, not the discipline.
- _Typed-over cells (the SHYAM LAL 7154 bug, §9)._ The sheet computes; the operator does not. Every chargeable size, area, amount, subtotal, tax and total is a formula, so the one way to get a wrong figure is to type over it deliberately — and where the app already did that, the cell holds the typed number and a note saying what the formula gives.
- _Blank previews._ Every formula is written with its answer cached beside it, and the workbook is marked to recalculate on open, so it reads correctly in Google Sheets, in Preview and on a phone without ever being opened in Excel.

**The workbook is drawn from the same rows as the PDF.** `layout.ts` describes the printed page once, and all three renderers — the preview, the PDF and the workbook — draw that description, so the sheet an operator opens is the proforma: the same ten columns in the same proportions, the same two-level head on grey, the same boxed figures under the lines with the width beside them left bare, the red letterhead, the purple title, the blue note, the total on yellow, the mark on the top left and the stamp over the last signature.

What the printed page has no column for lives in two columns beside it, **hidden**: the wastage allowance a chargeable size is built from, and the rate behind a counted charge. The sheet is set to A4, fit to one page wide, with the print area ending at the signatures, so `Ctrl+P` from Excel gives the proforma.

A cell in `layout.ts` can carry a `key` — `line.2.area`, `rounded`, `cgst` — naming what figure it is. The printed renderers ignore it; the workbook writes the formula for that figure there instead of the number, and finds the cells the formula needs by looking their keys up. That is what keeps the formulas from having to know the shape of the page, which is what they used to know and what made the workbook drift away from the document.

One deliberate difference from the PDF: the workbook shows figures at full precision where the document prints seven significant figures (§2.3), because a working copy that hides digits is worse than one that shows them. Sizes are the exception — an inch quote is written in a fraction format, so the page still reads `35 1/4` while the cell holds 35.25 for the formulas.

Both exporters read the same computed quotation object, so the PDF and Excel cannot disagree.

Because the deliverable is a downloaded file, there is nothing in the browser worth backing up.

---

## 6. Phases

**Phase 0 — Clickable mockup. Done.** `quotation-entry-mockup.canvas.tsx`: entry grid, per-section wastage rules, multi-section, charges, formula tooltips, override badges and a full print replica. Seeded with both sections of PROFORMA 7178 — 10 MM clear on fixed wastage and 6 MM mirror on foot to foot — so the mixed-rule case is the default view. It is the specification for Phase 3, not throwaway — the layout and the calculation both port over.

**Phase 1 — Calculation core (no UI). Done.** `app/src/core/`: units and inch fractions, both wastage rules, area, amounts, rounding, GST and override tracking, all on Decimal. `npm test` replays `scripts/parsed.json` and holds the three counts in the table at the top of this document, plus foot-to-foot cases for the four lines in §2.2.

**Phase 2 — Masters as JSON. Done.** `app/src/data/` holds company, products (§3.2), charge types (§3.1) and the rate card, behind a typed loader. `app/src/state/factory.ts` builds a new quote, section, line or charge with every default already filled in — which is also the only place those defaults are decided. `app/src/storage/draft.ts` is crash protection for the quote in progress, and is the whole of storage (§5).

**Phase 3 — Quotation entry. Done.** `app/src/components/` and `app/src/ui/`: the mockup as a working screen. Multi-section editor, the grid with its two-level header, independent input-unit / print-unit / GST settings, the per-section wastage rule and allowance, inch fractions typed as `33 1/4`, the charge table with its catalogue and free-text escape hatch, and the split from §2.8 — decisions typed into fields that take numbers only, consequences worked out and greyed with their formula in the tooltip, and a badge and a reset behind any figure that arrives disagreeing with its formula. `PrintView` is the document itself, so "what prints" is the same component the PDF will be built from. The §7 warnings are in `core/validate.ts` and are gathered beside the override list. `App.test.tsx` types a quote the way an operator would and checks the numbers on screen.

**Phase 4 — Download PDF. Done.** `app/src/export/`: `layout.ts` describes the document once — rows, columns, spans and number formats — and both the preview and the PDF are built from it, so they cannot drift apart. `pdf.ts` renders it through pdfmake at A4 (the sheet exports at US Letter, which is scaled at the printer anyway) and hands it to a download. A share-to-WhatsApp button was built and then dropped: the office already sends the downloaded file the way it always has, and a second button that behaves differently on desktop and on a phone was clutter on the one screen that has to stay fast. `layout.test.ts` asserts the document reproduces PROFORMA 7178 line for line against the text of the original PDF; `npm run sample:pdf 7178` renders any sample so the two pages can be put side by side. Downloading clears the draft (§5). **The app is usable day to day from here.**

**Phase 5 — Download Excel. Done.** `app/src/export/excel.ts` writes the quote as a working sheet: the same page as the PDF — drawn from the same `layout.ts` rows, down to the colours, the boxed figures, the mark and the stamp — with live formulas behind every derived figure, the wastage allowance and charge rates in hidden columns, and A4 print setup so it prints as the proforma. `excel.test.ts` recalculates the workbook the way Excel would and checks it lands on the same totals as the engine — including after a size is changed, which is the whole point of the export — and then checks the page it draws, because the workbook is the one renderer nobody looks at until weeks later. `npm run sample:pdf 7178 out/` writes both files for putting side by side.

**Phase 5a — Retyping the samples through the screen. Done.** The tests prove the arithmetic; they do not prove the screen is wired to it. `npm run retype -- 6363` drives the running app in Chrome, types a sample's sizes, rates and charges the way an operator would, and compares every cell the app filled in for itself — chargeable sizes, areas, amounts, charge amounts, totals, GST and the grand total — against the figures on the original PDF, then screenshots both tabs and downloads the PDF and the workbook. Across the 17 samples that can be retyped from their inputs, **535 of 540 printed figures come out identical**; the five are the ±₹1 rounded subtotals an operator typed by hand (§2.3). It is also how the three printing habits in §2.10 were found.

`npm run retype -- all` sweeps every sample in one browser and prints only the cells that differ, and `npm run verify` is build, tests and that sweep together. **It is a command to run, not a habit.** It takes minutes and needs the dev server up, so it belongs before a release and after anything touching `core/`, `export/` or `data/`; a change to spacing or wording is covered by `npm test` in three seconds. Nothing is gained by re-proving the arithmetic after moving a button, and the waiting is paid for by the person watching.

**Phase 6 — Save and reopen a quote file.** Only if revisions turn out to matter: a JSON download beside the PDF and an Open button to load it back (§5). Not planned for v1.

**Out of scope for v1** (confirmed): stored quotations and any quote list, tax invoices, payments, production tracking, GSTR-1, cutting-list optimisation.

---

## 7. Validation — warnings only, never blocks

Validation advises and never prevents — the operator is holding the phone, and the app is not. Warnings appear inline and are collected into a pre-download summary the operator can dismiss. **Each one opens with a tag** — `GST missing`, `Wastage rule`, `No rate`, `Discount` — held in a column down the left of the list, because the list is read while somebody is waiting: the tag is what has to land in a glance, and the sentence is there for the operator who then asks why. Built in `core/validate.ts`, except (1) and (4), which the engine already tracks and `OverrideSummary` lists:

1. Any value that differs from its formula — from a restored draft or an edited workbook (§2.8) — listed with the figure the formula gives.
2. A rate that looks like a SQFT rate in a SQMT section, or vice versa. Judged against the rate card rather than a fixed threshold: five times off in either direction is a unit mistake, not a deal.
3. A rounded subtotal more than ₹1 from the computed subtotal, shown with the difference — this is where discounts live (§2.9), so the warning names the amount rather than objecting to it.
4. Wastage on a line differing from the section allowance — the one per-row decision the screen still takes.
5. A row with no rate, or no quantity. A row with no sizes typed yet is the next row, not a mistake, and is left alone.
6. A section whose wastage rule differs from the one its glass type implies (§2.2).
7. A discount above `DISCOUNT_WARN_PCT` of the subtotal, which reads as "larger than a rounding" on the warning.
8. A GST-inclusive card price being taxed again — a SQFT quote with GST on, still at the card rate. The warning names the pre-tax figure so the correction is a copy rather than a calculation.
9. A pre-tax card price on a quote that adds no tax — a SQMT quote at the card rate with GST off.
10. A section that has been typed into with no glass chosen (§3.2). It is the line the proforma prints as the description of what was sold, and nothing fills it in.

(8) and (9) only fire while the rate is within 2% of the card's: a rate typed to some other figure was decided by someone who knew what it included, and the app has nothing left to compare against.

---

## 8. Free-text inconsistencies to replace with lookups

The current sheet is typed by hand, so the same thing is spelled many ways: `CUTOUT` / `CUT OUT`, `HOLE` / `HOLES`, `L CUTOUT` / `L CUT OUT`, `10MM CTG` / `10MMCTG`, `TEMPLATE CHARGE` / `TEMPLATR CHARGE`, `FROSTARTE` / `FORSTARTE CHARGE`, `DESIGN CAHRGE`, `CGTS` for CGST, `BLCOK` for BLOCK, `TOUGEHENED` for TOUGHENED, `CITY GLASS AMND CO`. Dropdowns backed by master tables remove this entire class of problem and make reporting possible later.

---

## 9. Errors found in the existing quotations

Worth raising with the team — these are real money.

**SHYAM LAL JI CARPENTAR 7154.** Eleven of thirty lines print an area that does not match their own dimensions, always **too high by 6–15%**. For example line 2: `35.25 × 13 in, qty 40` is 127.29 sqft, but the sheet prints 135.4612 sqft, and the amount follows the printed figure. The pattern (some rows correct, others not, all overstated) is consistent with area cells that hold **typed-in numbers left over from a copied workbook** rather than live formulas. Estimated overcharge on this one quote is roughly ₹2,000 of a ₹126,363 total. It also explains the only quote the engine cannot reproduce end-to-end.

**RAJU 6363.** The column header reads SQMT but the values are SQFT (mm input converted with ×10.764) and the rate is the ₹135 SQFT rate. The money is right; only the header is wrong.

**SAI GLASS 6374 — GST missing from one section.** The quote has three sections. The 10 MM and 6 MM sections both carry CGST 9% + SGST 9%, but the 8 MM section jumps straight from `1564 + 120 holes = 1684` to the section total with no tax rows, and the grand total of `15943.12` accepts it. Since GST applies to the whole invoice or not at all, this is an operator omission, not a business rule — roughly **₹303 of GST was not charged** and would still be owed. Making the GST flag a quote-level setting (§2.1) makes this error structurally impossible.

**G FOCUSS 7178 — two mirror lines charged past the next foot.** A 2920 mm piece is billed at 3660, two feet over what foot to foot gives (§2.2). It may be deliberate — 3660 × 915 is a full mirror sheet — and it may be a slip. Either way the app charges to the next foot and does not reproduce it.

None of the first three errors is possible once areas and taxes are computed rather than typed, and the fourth is now visible as a difference rather than hidden in a cell.

---

## 10. Decisions made

- Scope v1: **quotations / proforma only**, matching the current Excel output.
- Platform: **React + Vite static site on GitHub Pages**, no backend, masters in JSON.
- **Nothing is filed away.** Fill the form, download the PDF; the PDF is the record. The only storage is a crash-recovery copy of the quote being typed (§5).
- **Generic over rule-based**: masters in JSON, computed defaults, formula tooltips, a badge and a reset behind any figure that differs from its formula (§2.8).
- **Decisions are typed, consequences are shown.** Sizes, wastage, counts, rates and the rounded subtotal are typed; cut size, area and every amount are worked out and greyed. A row cut differently changes its wastage; a price that must come out differently changes its rate or the rounded total (§2.8).
- **A number field takes numbers only** — a letter is refused as it is typed, rather than sitting on screen beside a figure it no longer matches (§2.8).
- **A rounding under ₹1 is not called a discount** on screen or in the warnings (§2.9).
- Charges are **one adjustments list** — a count and a rate, with no basis and no taxable flag to choose — and **every charge prints, and every charge is taxed** with the glass wherever GST applies (§2.9).
- **An empty count means the charge is not counted**: the rate is the whole charge, and the printed line carries no count, as the sheet has always written a document charge (§2.9).
- **Two wastage rules: fixed and foot to foot**, set **per section** and defaulted from the glass type (§2.2). Revises the v2 position that mirror and fluted were unexplainable one-offs.
- **Foot to foot rounds by the overhang** — 8.2 ft becomes 9 ft, 8 ft stays 8 ft (§2.2).
- **A sample the rule cannot reproduce is not a rule to add.** Two mirror lines were billed two feet over the next foot; the app charges to the next foot and leaves those alone, because some of the old bills are simply wrong (§2.2).
- **Wastage is entirely section-level**, rule and allowance together, with nothing left in quote settings (§2.2).
- **Mirror is the only glass that starts foot to foot; everything else starts on the fixed allowance** (§2.2). Narrows the customer's first answer, on their own later word.
- **HSN 7007 is one constant** in the company master, not a field on products, sections or lines (§4).
- **Finishes and treatments are charges, not products** — a rate, counted or not, on the same row (§2.9). Polish included, at ₹1 per mm of thickness per running foot (§3.3).
- **The proforma number is typed**, not generated.
- **The PDF does not change.** Same format, same content as today; all transparency is on screen (§2.10).
- **The preview is A4 at true size**, with the PDF's margins and type, so what wraps on screen wraps on paper (§2.10).
- **The PDF is rebuilt, not converted** — pdfmake from the shared description, because a static site cannot print HTML and a rasterised page is a picture of the numbers rather than the numbers. A test holds the two renderings to the same rules and fills (§2.10).
- **The document keeps the sheet's own look** — letterhead mark, the stamp over Authorised Signatory, red headings, purple title, blue note, boxed blocks and `TOTAL AMOUNT` on yellow — described once in `layout.ts` for both renderings, and printed in colour (§2.10).
- **A quote of one section says each figure once** — no subtotal row over a single line, no taxable base without GST, no section total and no summary block (§2.10).
- **Rounding a subtotal is the operator's, not the app's.** The office rounds up on some sheets and down on others (4 up, 5 down, 39 that cannot tell them apart), so the app rounds to the nearest rupee, shows the exact figure beside it, and lets the field be typed over (§2.3, §2.9).
- **Standard fixed wastage is 50 mm / 2 in; 30 mm is a per-customer concession.** Editable at quote and line level.
- **Wastage is one number for both sides** — never deliberately different per dimension (§2.2).
- **Kaccha (raw) glass carries wastage too**, same as toughened.
- **Discounts do not print** — recorded by overriding the rounded subtotal, visible on screen with the computed figure beside it (§2.9).
- **L / U cutouts are shape cuts**, priced per unit from the master and editable.
- **Reset is per row and per quote**, not per section: with three typed cells to a row, "Reset section" said less than it seemed to (§2.8).
- **Products come from two dropdowns** (thickness × glass type) over the brochure catalogue, with free text for anything else (§3.2).
- **All masters are JSON** and provisional until the customer re-verifies names and rates.
- **Date and proforma number are editable** free-text fields; no auto-numbering in v1 (§11).
- **PDF is the deliverable; the Excel workbook is the working copy** and carries live formulas, because it is the only way to revise an old quote when nothing is filed away (§5).
- Extra charge rates: fixed defaults, editable per quote.
- Unit inference: 2-digit = inches, 3–4-digit = mm.
- **Input unit, printed unit and GST are set once per quote** — verified uniform across all 47 samples (§2.1).
- **Wastage is decided by the biller per section**, default 50 mm / 2 in. No customer-level table.
- **Jobwork is out of scope** — always separate hand work.
- **No IGST** — CGST + SGST only. Keep the field but hide it until a non-Karnataka customer appears.
- **No customer master to seed** — the biller types the customer name, with autocomplete from names used before.
- **Discount**: per-quote by default, with an optional saved percentage per customer, editable either way.
- **Wastage is a single visible column** in the entry grid, and the cut size follows from it (§2.2).
- **Adjustments are all optional**, never pre-added, pre-filled from the charge master when added (§2.9).
- **Rate sits on the line**, defaulted from the section header (§2.5).

## 11. Open questions

Nothing here blocks the build. **Every name, rate and default lives in JSON under `app/src/data/` and every one of them is editable on screen**, so a wrong value is a correction rather than a rewrite — which is why the questions below are worth asking but not worth waiting on.

**Answered since v3 was drafted:**

- **Foot to foot rounds by the overhang.** 8.2 ft becomes 9 ft, 8 ft stays 8 ft, both sides independently (§2.2). Implemented.
- **Wastage is per section**, rule and allowance both, defaulted from the glass type (§2.2). Implemented.
- **Which glasses are foot to foot:** mirror, and only mirror. Fluted, extra clear and black all start on the fixed allowance (§2.2). Implemented.
- **HSN is a single constant**, 7007, held once in the company master (§4). Implemented.
- **Treatments and finishes are charges, not products.** Any chargeable item takes a rate, counted or not, on the same row (§2.9). This covers frosting, acid wash, colour etched and polish, so no per-sqft basis is needed.
- **Polish is ₹1 per mm of thickness** per running foot, filled in as an editable default (§3.3).
- **Proforma numbers are typed by the operator.** No auto-numbering.
- **All catalogue values are provisional and will be confirmed with the customer later**, which is what makes JSON masters the right call rather than a compromise.

**Still open, none of them blocking:**

1. **Fluted may be a plank product** — AD GLASS's single line fits "fixed width, length rounded generously" better than the general rule (§2.7). One more fluted quote would settle it.
3. **Laminated and DGU** — is a `6+6` laminated panel billed on its area once, and does a DGU need its air gap recorded? Both are brochure-only so far.
4. **The polish quantity** — the app fills in the perimeter of every piece in the section. If only some edges are polished, that default is too high and the operator has to correct it each time; knowing which is normal would set a better default.

Recorded but deliberately not pursued for v1: the rate card values, since rates are negotiated and edited per quote anyway.
