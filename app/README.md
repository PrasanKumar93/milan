# Milan Toughened Glass — Quotation App

Browser app for preparing proforma invoices and downloading them as PDF or as a working Excel sheet. No server and no database: the operator fills a form, clicks download, and the file is the record.

Rules and reasoning live in [`../docs/dev-plan.md`](../docs/dev-plan.md). Section numbers referenced in code comments (§2.2, §3.1, …) point there.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine regression against the 47 sample quotations, plus the screen
npm run build

npm run sample:pdf 7178 /tmp   # render a sample quotation through the exporters
npm run retype -- 6363         # type a sample into the running app and check the screen
```

`sample:pdf` is for looking at the page: it rebuilds one of the parsed samples and writes both the PDF and the workbook, so they can be put beside the original the office sent. The numbers on them are checked by `src/export/layout.test.ts`, which asserts the document reproduces PROFORMA 7178 line for line.

`retype` needs `npm run dev` in another terminal. It opens the app in Chrome, types a sample's sizes, rates and charges as an operator would, and compares every cell the app worked out for itself against the figures on the original PDF — chargeable sizes, areas, amounts, charges, totals, GST and the grand total — then screenshots both tabs and downloads the PDF and the workbook into `/tmp/retype`. The tests prove the arithmetic; this proves the screen is wired to it. Across the 17 samples whose sizes follow a wastage rule, 535 of 540 printed figures come out identical, the five being ±₹1 rounded subtotals a person typed by hand.

## Layout

```
src/core/        the calculation engine — pure functions, no React
  types.ts       the stored quote model
  units.ts       inch fractions, mm/inch to SQFT/SQMT, foot-to-foot rounding
  money.ts       Decimal setup and formatting
  products.ts    thickness, wastage rule and polish rate, read off the product name
  engine.ts      chargeable size, area, amounts, rounding, GST, override tracking
  validate.ts    the warnings — advice only, nothing here blocks a download
src/data/        masters as JSON — company, products, charge types, rate card
  masters.ts     typed access to those files
src/state/
  factory.ts     a new quote, section, line or charge with its defaults filled in
  useQuote.ts    the only place the quote is edited
src/storage/
  draft.ts       crash recovery for the quote in progress — the whole of storage
src/ui/          form controls, including the fields that accept "33 1/4"
src/components/  the entry screen, and PrintView — the document on screen
src/export/
  layout.ts      the printed document, described once: rows, columns, formats
  pdf.ts         that layout through pdfmake
  excel.ts       the same page as a working sheet, with the formulas left in
```

## One document, two renderings

`export/layout.ts` builds the rows of the proforma — the two-level head, the lines, the totals that sit unlabelled in the same columns, the summary. `PrintView` renders those rows as HTML and `pdf.ts` renders them through pdfmake. Neither owns the layout, so "what prints" cannot promise something the download does not deliver. If a column moves, it moves in one file.

## Nothing is filed away

The app is fill-and-print: no quotation database, no quote list, no backup file. The PDF is the record, as it is today. `draft.ts` mirrors the quote being typed into `localStorage` so a closed tab does not cost twenty minutes of re-keying, and clears it once the quote is downloaded. See dev-plan §5 for why.

## The workbook is how an old quote gets changed

Because nothing is filed away, **Download Excel** is the reopen button. The sheet is the same page as the PDF, but every derived figure is a live formula: change a size, a rate or a quantity and the chargeable size, area, amount, subtotal, GST and totals all follow, using the same rules as the engine. The wastage allowance and the unit rate behind a per-unit charge are in hidden columns so the formulas have their inputs and the printed page stays the document the customer knows; it is set to A4 and fit to one page wide, so printing from Excel gives the proforma.

Two details worth knowing. A figure that was typed over in the app is written as that number rather than a formula, with a note recording what the formula gives — a revision must not quietly undo a deliberate override. And every formula is written with its answer cached beside it, so the file reads correctly in Google Sheets or on a phone, which never recalculate. `excel.test.ts` recalculates the workbook the way Excel would and checks it agrees with the engine.

## Nothing on screen is read-only

Every derived cell — chargeable size, area, amount, the rounded subtotal — is an input pre-filled by the formula. Typing over one is an override: it is stored as an explicit number, marked in the cell, listed before the quote is printed, and reset with one click. The formula that filled it in is in the cell's tooltip. This is deliberate; the operators have always been able to fudge a figure in Excel and the app is not the place to start refusing (dev-plan §2.8).

## Two things to know before changing the engine

**All arithmetic goes through `decimal.js`.** Areas print to six decimal places and rupees to two, on a document a customer receives. Float drift is visible.

**The samples are the specification.** `npm test` replays all 47 parsed quotations from `../scripts/parsed.json` and asserts the engine reproduces 284 line amounts, 271 printed areas and 42 quote totals. The gaps are known and documented in the test itself — if a count changes, the rules changed, and that needs to be deliberate.

**Printed numbers carry seven significant figures.** Not a style choice: all 1,086 figures across the samples do, and none carries more, which is what Excel's General format gives in a standard-width column. It is why GST prints as `974.7` and why a total above a lakh loses its paise. `formatSheet` in `core/money.ts` is the one place that decides this.

## Masters are provisional

Everything in `src/data/` — product names, charge names, default rates — is derived from the sample quotes and the sales brochure and has not yet been confirmed by the business. Correcting one is a JSON edit and a commit, which is also the version history.
