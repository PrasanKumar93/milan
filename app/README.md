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
npm run retype -- 6363         # type one sample into the running app and check the screen
npm run verify                 # build, tests, and every sample retyped through the browser
```

**`npm run verify` is the full check, and it is meant to be run when it is wanted, not after every change.** It takes minutes and needs `npm run dev` in another terminal, so it belongs before a release, after anything touching `src/core/`, `src/export/` or `src/data/`, and after a change to the entry grid's structure. A change to spacing or wording does not need it; `npm test` takes three seconds and covers that.

`sample:pdf` is for looking at the page: it rebuilds one of the parsed samples and writes both the PDF and the workbook, so they can be put beside the original the office sent. The numbers on them are checked by `src/export/layout.test.ts`, which asserts the document reproduces PROFORMA 7178 line for line.

`retype` needs `npm run dev` in another terminal. It opens the app in Chrome, types a sample's sizes, rates and charges as an operator would, and compares every cell the app worked out for itself against the figures on the original PDF — chargeable sizes, areas, amounts, charges, totals, GST and the grand total — then screenshots both tabs and downloads the PDF and the workbook into `/tmp/retype`. The tests prove the arithmetic; this proves the screen is wired to it. `npm run retype -- all` sweeps every sample in one browser and prints only what differs; the quotes that do not come out identical are the documented ones in dev-plan §9 — hand-typed areas, ±₹1 roundings, a missing GST section and two mirror lines charged over the rule.

## Where it runs

The site is static — a folder of files, nothing behind it — so it is published to GitHub Pages at **https://prasankumar93.github.io/milan/**. `.github/workflows/deploy.yml` does that on every push to `main`: lint, tests, build, publish.

The suite it runs is the smaller one. The samples the engine is tested against are the customers' own quotations, kept out of this public repository, so the three test files that read them are skipped where the files are absent and run in full on a machine that has them — which is where the engine gets changed anyway. Run `npm test` before pushing and the difference does not arise; `npm run verify` before a release covers the rest.

There is nothing to set per environment. `vite.config.ts` has `base: "./"` so assets are looked for beside the page rather than at the domain root, which is what a project page needs, and a quote lives in the browser's own storage until it is downloaded, so there is no address for the app to be told about.

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
  marks.ts       the letterhead mark and the stamp, as bytes
```

## One document, three renderings

`export/layout.ts` builds the rows of the proforma — the two-level head, the lines, the totals that sit unlabelled in the same columns, the summary — along with the column widths, which cells are ruled, and the colours the page is printed in. `PrintView` renders those rows as HTML, `pdf.ts` renders them through pdfmake, and `excel.ts` draws them into a worksheet. None of them owns the layout, so "what prints" cannot promise something the download does not deliver. If a column moves, it moves in one file.

The printed page ends on the same four columns as the entry grid — qty, area, rate, amount — which is also the order the office's own sheet has always used. The count is read before the area because it is inside it: the area is the chargeable height by the width by the count, so meeting the area first means meeting a figure whose ingredients have not been shown yet.

A row can also say what each figure *is* — a cell carries a `key` like `line.2.area` or `cgst`. The printed renderers ignore it; the workbook writes a live formula there instead of the number, and finds the cells that formula needs by looking their keys up, so the arithmetic never has to know the shape of the page.

The two say the same thing in different vocabularies — CSS classes on one side, pdfmake's cell properties on the other — and that is where they can drift: the ruled grid once came out of the download unboxed while the preview looked right. So `renderings.test.tsx` asks each renderer to describe the sheet cell by cell — the text, whether it is ruled, whether it is filled — and requires the two descriptions to be the same list. It runs in the normal test suite and it fails on exactly that bug.

The **What prints** tab is the page at true size: 210 mm wide, with the PDF's own margins and 8 pt type, so a heading that wraps on screen wraps on paper. Both renderings carry the sheet's own look — the mark from `public/logo.png`, the stamp from `public/stamp.png` over Authorised Signatory, red headings, a purple title, the note in blue, the boxed blocks and `TOTAL AMOUNT` on yellow — and the colours survive Ctrl-P as well as Download PDF. Replacing either picture is dropping a new PNG into `public/`; `export/marks.ts` fetches them once and hands pdfmake the bytes.

## Nothing is filed away

The app is fill-and-print: no quotation database, no quote list, no backup file. The PDF is the record, as it is today. `draft.ts` mirrors the quote being typed into `localStorage` so a closed tab does not cost twenty minutes of re-keying, and clears it once the quote is downloaded. See dev-plan §5 for why.

## The workbook is how an old quote gets changed

Because nothing is filed away, **Download Excel** is the reopen button. The sheet is the page the PDF prints — same columns, same boxed figures, the mark, the stamp, the total on yellow — but every derived figure is a live formula: change a size, a rate or a quantity and the chargeable size, area, amount, subtotal, GST and totals all follow, using the same rules as the engine. The wastage allowance and the unit rate behind a counted charge are in hidden columns so the formulas have their inputs and the printed page stays the document the customer knows; it is set to A4 and fit to one page wide, so printing from Excel gives the proforma.

Three details worth knowing. A figure that was typed over in the app is written as that number rather than a formula, with a note recording what the formula gives — a revision must not quietly undo a deliberate override. Every formula is written with its answer cached beside it, so the file reads correctly in Google Sheets or on a phone, which never recalculate. And an inch quote is written in a fraction format: the page reads `35 1/4` while the cell holds 35.25, so the sizes look printed and still multiply. `excel.test.ts` recalculates the workbook the way Excel would, checks it agrees with the engine, and then checks the page it draws — the workbook is the one rendering nobody looks at until weeks later.

## What is typed, and what is worked out

Typed: the actual sizes, the wastage, the count, the rate, the charges, and the rounded subtotal. Worked out and shown greyed: the chargeable size, the area, the line amount, every charge amount, and everything under them. Each greyed cell carries the sentence that made it in its tooltip — "Actual + 50", "Chargeable H x W x qty", "Qty x rate".

A section on foot to foot has no allowance to type, so that column reads the row in feet instead — `7.51 → 8 ft` over `1.12 → 2 ft` — and hovering either line steps the conversion out: divide by the foot, up to the next whole one, back into millimetres, up to the next 5 mm. It is the one rule that grows a size without anyone typing a number, so it shows its working (dev-plan §2.2).

Each of those three columns is also marked with an `i` in its heading, and hovering it opens a bubble with the rule in full and the section's own first row put through it — `2000 + 50 = 2050`, `((2050 ÷ 1000) × (1050 ÷ 1000)) × 2 = 4.305`. The brackets are there even where precedence would hold without them, so the order of the steps is not something the reader has to remember. The wording comes from `components/formulas.ts`, which builds it from the same section the engine calculated, so a section on foot to foot or a quote typed in inches explains itself in its own terms rather than a general one.

The split is deliberate, and it is the one v2 got backwards. A derived cell that disagrees with the numbers beside it is unexplainable when the customer queries the piece, and it is how SHYAM LAL 7154 came to overcharge by 6–15% on eleven rows. Nothing is lost by locking them, because each has a typed input behind it: cut a piece differently by changing its **wastage**, price it differently by changing its **rate**, bill differently by changing the **rounded subtotal** — which is where a discount goes (dev-plan §2.8).

The engine still understands a figure that differs from its formula — the samples contain them, a workbook can be edited and reprinted, and an old draft may hold one. Such a value keeps its dot, is listed before the quote is printed, and resets in one click. The screen simply no longer creates one.

Number fields take numbers only, in the loose way an entry grid needs: "2." and "33 1/" survive on the way to a value, and a letter is refused as it is typed.

## The card has two prices, and only one of them has tax in it

₹1,232 the square metre and ₹135 the square foot are the same 10 mm glass: the square-foot figure is the square-metre one with GST already in it, which is how the office quotes and why no SQFT sample prints a tax line. `rateCard.json` says which is which (`sqmtIncludesGst`, `sqftIncludesGst`) rather than the app inferring it from the unit.

The section heading therefore never shows a price without saying what it includes — `₹1,232 / SQMT · GST to be added`, coloured, beside the glass it prices. It is shown and never applied: no rate is filled in from it, nothing rewrites a rate, and switching the printed unit leaves every rate alone. The card is a list price, the price on a job is negotiated, and a rate that appeared on its own is a rate nobody checked.

The printed unit and the GST switch are set separately, so the two ways of getting the tax wrong — taxing a taxed price, printing a pre-tax price with no tax — are each a click away and neither looks wrong on the page. `validate.ts` names them, with the pre-tax figure worked out so the correction is a copy rather than a calculation. Both go quiet once the rate is more than 2% off the card: a figure typed to something else was decided by someone who knew what it included.

Nothing else is chosen for the operator either. Both product dropdowns open on `— Select —`, because the glass is the line the proforma prints as the description of what was sold; a section that has been typed into with no glass on it is a warning, not a silent default.

## Two things to know before changing the engine

**All arithmetic goes through `decimal.js`.** Areas print to six decimal places and rupees to two, on a document a customer receives. Float drift is visible.

**The samples are the specification.** `npm test` replays all 47 parsed quotations from `../scripts/parsed.json` and asserts the engine reproduces 284 line amounts, 271 printed areas and 42 quote totals. The gaps are known and documented in the test itself — if a count changes, the rules changed, and that needs to be deliberate.

**Printed numbers carry seven significant figures.** Not a style choice: all 1,086 figures across the samples do, and none carries more, which is what Excel's General format gives in a standard-width column. It is why GST prints as `974.7` and why a total above a lakh loses its paise. `formatSheet` in `core/money.ts` is the one place that decides this.

## Masters are provisional

Everything in `src/data/` — product names, charge names, default rates — is derived from the sample quotes and the sales brochure and has not yet been confirmed by the business. Correcting one is a JSON edit and a commit, which is also the version history.

`chargeTypes.json` is the one that has been through that already: it keeps all sixteen names and no longer carries a single rate. The customer read the figures taken off the samples and asked for the prices to go and the names to stay, which is the split that matters — the names are the office's own and are worth picking rather than spelling, while the price is decided per job, and `CORNER ROUND` was billed anywhere from ₹50 to ₹200. So a charge row opens on `— Select —` at ₹0. `POLISH (JOB WORK)` is the exception, being a rule rather than a price: ₹1 per mm of glass thickness per running foot, worked out from the section's glass. The name says which polish it bills — polish on glass sold from here is already inside the glass rate, which is why no sample shows a polish line. What each charge was actually billed at is kept in dev-plan §3.1 for whoever wants a default back.
