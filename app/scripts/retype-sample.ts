/**
 * Type the sample quotations into the running app, the way an operator would,
 * and check what the screen shows against the PDFs the office sent.
 *
 *   npm run dev                                   # in another terminal
 *   npm run retype -- 7123                        # one quotation, in detail
 *   npm run retype -- all                         # every sample, as a tally
 *
 * The unit tests prove the arithmetic. This proves the screen is wired to it:
 * that a size typed into a box reaches the engine, that the cells fill
 * themselves, and that the totals and the print tab show the computed figures.
 * Screenshots of both tabs are written beside the report so the page can be
 * looked at rather than trusted.
 *
 * Only sizes and rates are typed. Everything else — chargeable size, area,
 * amount, charges total, GST, section total — has to appear on its own, and is
 * then compared with the printed document cell by cell.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Locator, Page } from "playwright-core";
import { chromium } from "playwright-core";
import type { PrintUnit } from "../src/core/types";
import { areaOf } from "../src/core/units";
import { corpus, inferUnit, sample } from "../src/test/corpus";

const [target = "7123", url = "http://localhost:5175", outDir = "/tmp/retype"] =
  process.argv.slice(2);

const sweep = target === "all";
const wanted = sweep
  ? [
      ...new Set(
        corpus.filter((q) => q.sections.some((s) => s.lines.length > 0)).map((q) => q.proforma_no),
      ),
    ]
  : [target];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

let matched = 0;
let compared = 0;

for (const proformaNo of wanted) {
  const { checks, notes } = await retype(page, proformaNo);
  const bad = checks.filter(([, a, b]) => !same(a, b));
  matched += checks.length - bad.length;
  compared += checks.length;

  if (sweep) report(proformaNo, bad, notes, checks.length);
  else reportInFull(proformaNo, checks, notes);
}

if (sweep) {
  console.log(
    `\n${matched} of ${compared} printed figures across ${wanted.length} quotations come out of the app identical`,
  );
}

await browser.close();
process.exit(matched === compared ? 0 : 1);

/** One quotation, typed in from nothing and read back off the screen. */
async function retype(page: Page, proformaNo: string) {
  const parsed = sample(proformaNo);
  const sections = parsed.sections.filter((s) => s.lines.length > 0);

  const checks: Array<[string, string, string]> = [];
  const notes: string[] = [];
  const check = (what: string, onScreen: string | number, onPdf: string | number) =>
    checks.push([what, String(onScreen), String(onPdf)]);

  await page.goto(url);
  await page.evaluate(() => localStorage.clear()); // a leftover draft would be offered back
  await page.reload();

  await type(page.getByLabel("Proforma no"), parsed.proforma_no);
  await type(page.getByPlaceholder("dd/mm/yyyy"), parsed.date);
  await type(page.getByPlaceholder("M/S ..."), parsed.customer);

  for (const [si, section] of sections.entries()) {
    if (si > 0) await page.getByRole("button", { name: "Add section" }).click();
    const card = page.locator("section.card").filter({ hasText: `Section ${si + 1}` });

    // Units and tax are the section's own, so they are read off this section
    // and set on its own line (§2.1).
    const inputUnit = inferUnit(section, section.lines[0]);

    // The printed unit is taken from the figures rather than from the column
    // heading, because one sample heads the column SQMT over square feet.
    const first = section.lines[0];
    const gapIn = (unit: PrintUnit) =>
      areaOf(inputUnit, unit, first.ch, first.cw, first.qty).minus(first.area).abs();
    const printUnit: PrintUnit = gapIn("SQFT").lte(gapIn("SQMT")) ? "SQFT" : "SQMT";
    if (printUnit !== section.out_unit) {
      notes.push(`S${si + 1}: the sheet heads that column ${section.out_unit}, but the figures are ${printUnit}`);
    }

    await card.getByRole("button", { name: inputUnit, exact: true }).click();
    await card.getByRole("button", { name: printUnit, exact: true }).click();
    await card
      .getByRole("button", { name: section.cgst === null ? "Not applied" : "Applied", exact: true })
      .click();

    // Some sheets name the glass with a typo — "TOUGEHENED" — which is the whole
    // reason the dropdown exists. Type those in as an "other" and carry on.
    const [thickness, ...rest] = section.product.split(" ");
    await card.locator("select").first().selectOption(thickness);
    const glass = card.locator("select").nth(1);
    try {
      await glass.selectOption(rest.join(" "), { timeout: 2000 });
    } catch {
      await glass.selectOption({ label: "Other — type it" });
      await type(card.getByPlaceholder("Glass name as it should print"), section.product);
      notes.push(`S${si + 1}: ${section.product} is not in the glass list, typed as an "other"`);
    }

    // The allowance is a setting, not a formula: 50 is the house standard but
    // plenty of quotes are cut at 30. Read what this sheet used, and set it.
    const perLine = section.lines.map((l) => (l.ch - l.ah === l.cw - l.aw ? l.ch - l.ah : NaN));
    const fixed = perLine.every((a) => a > 0 && a <= 150);
    const allowance = fixed ? mode(perLine) : 0;

    if (!fixed) {
      await card.getByRole("button", { name: "Foot to foot" }).click();
      notes.push(`S${si + 1}: sizes go up to the next foot rather than a fixed allowance`);
    } else if (allowance !== 50) {
      // Named rather than counted: the settings line ahead of it has a number
      // box of its own, and "the first box in the card" is now the GST rate.
      await type(card.locator('input[title^="Added to both sides"]'), allowance);
      notes.push(`S${si + 1}: cut at ${allowance} ${inputUnit}, not the standard 50`);
    }

    for (const [li, line] of section.lines.entries()) {
      if (li > 0) await card.getByRole("button", { name: "Add line" }).click();
      const row = card.locator("table.grid").first().locator("tbody tr").nth(li);
      // #, shape, actual H, actual W, wastage, chargeable H, chargeable W, qty,
      // area as measured, chargeable area, rate, amount — the count before both
      // areas, since each is worked out from it (see components/columns.tsx).
      const col = (n: number) => row.locator("td").nth(n).locator("input").first();

      await row
        .locator("select")
        .selectOption(line.shape)
        .catch(() => notes.push(`shape ${line.shape} is not in the list`));
      await type(col(2), line.ah);
      await type(col(3), line.aw);
      if (fixed && perLine[li] !== allowance) {
        await type(col(4), perLine[li]);
        notes.push(`S${si + 1} L${li + 1}: this row alone was cut at ${perLine[li]}`);
      }
      await type(col(7), line.qty);
      await type(col(10), line.rate);

      // Nothing below was typed: the row filled these in. The area compared is
      // the chargeable one — the sheet has never printed the measured area, so
      // there is nothing on the PDF to hold the new column against.
      const seen = `S${si + 1} L${li + 1}`;
      check(`${seen} chargeable H`, await col(5).inputValue(), line.ch);
      check(`${seen} chargeable W`, await col(6).inputValue(), line.cw);
      check(`${seen} area`, await col(9).inputValue(), line.area);
      check(`${seen} amount`, await col(11).inputValue(), line.amount);
    }

    for (const [ei, extra] of section.extras.entries()) {
      await card.getByRole("button", { name: "Add charge" }).click();
      const row = card.locator("table.grid").nth(1).locator("tbody tr").nth(ei);
      const label = row.locator("select").first();

      if ((await label.locator("option").allTextContents()).includes(extra.name)) {
        await label.selectOption({ label: extra.name });
      } else {
        await label.selectOption({ label: "Other — type it" });
        await type(row.getByPlaceholder("Charge as it should print"), extra.name);
        notes.push(`${extra.name} is not in the charge list, typed as an "other"`);
      }

      // charge, qty, the empty area column, rate, amount. A charge the sheet
      // printed without a count is typed without one, and the rate is then the
      // whole charge.
      const col = (n: number) => row.locator("td").nth(n).locator("input.input--num").first();
      await type(col(1), extra.qty ?? 0);
      await type(col(3), extra.qty ? extra.amount / extra.qty : extra.amount);

      check(`S${si + 1} ${extra.name}`, await col(4).inputValue(), extra.amount);
    }

    const totals = card.locator(".totals");
    const rounded = totals.locator("input.input--num");
    const ours = Number(await rounded.inputValue());

    // Which bare figure on the sheet is the rounded subtotal? The one beside it.
    // Sheets that add the charges in before rounding have no such figure, and
    // there is nothing to compare — their grand total still has to agree.
    const printedRounded = section.bare_amounts.filter((b) => Math.abs(b - ours) <= 1.5).at(-1);

    if (section.subtotal !== null) {
      check(`S${si + 1} total`, await rowValue(totals, "Total"), section.subtotal);
    }

    if (printedRounded === undefined) {
      notes.push(
        `S${si + 1}: the sheet rounds after the charges, so it prints no rounded subtotal`,
      );
    } else {
      check(`S${si + 1} rounded`, ours, printedRounded);
      // Rounding a subtotal is an operator entry, not a formula: where the office
      // went the other way, copy theirs so the rest of the tail is comparable.
      if (ours !== printedRounded) {
        notes.push(
          `S${si + 1}: the office wrote ${printedRounded} where rounding gives ${ours}; typed theirs`,
        );
        await type(rounded, printedRounded);
      }
    }

    // A single-section quote prints its total once, as the grand total. Where
    // the sheet printed no such figure there is nothing to be right or wrong
    // about, so it is said as a note rather than counted as a miss.
    const printedTotal =
      section.post_tax_labels[0]?.amount ?? (sections.length === 1 ? parsed.grand_total : null);

    if (printedTotal === null) {
      notes.push(`S${si + 1}: the sheet prints no total of its own for this section`);
    } else {
      check(`S${si + 1} section total`, await rowValue(totals, "Section total"), printedTotal);
    }
  }

  await page.screenshot({ path: resolve(outDir, `${proformaNo}-entry.png`), fullPage: true });
  await page.getByRole("tab", { name: "Preview" }).click();
  await page.screenshot({ path: resolve(outDir, `${proformaNo}-print.png`), fullPage: true });

  // And press the buttons an operator presses, so the files themselves are here
  // to be opened rather than only the screen they were made from.
  for (const button of ["Download PDF", "Download Excel"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: button }).click(),
    ]);
    // Saved under the name the browser was offered, so the name the office ends
    // up filing the job under is visible here too.
    await download.saveAs(resolve(outDir, download.suggestedFilename()));
    notes.push(`downloaded ${download.suggestedFilename()}`);
  }

  const shown = (await page.locator(".topbar .strong.num").textContent()) ?? "";
  if (parsed.grand_total === null) {
    notes.push("the sheet prints no grand total");
  } else {
    check("Grand total", shown.replace(/[^0-9.]/g, ""), parsed.grand_total);
  }

  return { checks, notes };
}

// ---- report ----

/**
 * A quote typed in inches shows its sizes in eighths — `37 1/4` — because that
 * is how the shop floor reads a tape, while the parsed sheet holds 37.25. The
 * two are the same measurement, so the fraction is worked out before comparing.
 */
function value(text: string): number {
  const m = /^\s*(-?\d+)\s+(\d+)\/(\d+)\s*$/.exec(text);
  return m ? Number(m[1]) + Number(m[2]) / Number(m[3]) : Number(text);
}

/**
 * The sheet prints seven significant figures where the entry grid shows two
 * decimals, so a figure counts as the same when it survives to the last place
 * both of them show.
 */
function same(a: string, b: string) {
  if (a === b) return true;
  const [x, y] = [value(a), value(b)];
  if (!isFinite(x) || !isFinite(y)) return false;
  return Math.abs(x - y) <= 0.0051 || Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 2e-7;
}

/** One quotation, cell by cell — what a single run is for. */
function reportInFull(
  proformaNo: string,
  checks: Array<[string, string, string]>,
  notes: string[],
) {
  const parsed = sample(proformaNo);
  const bad = checks.filter(([, a, b]) => !same(a, b));

  console.log(`\nPROFORMA ${parsed.proforma_no} — ${parsed.customer}, ${parsed.date}`);
  console.log(`${"what".padEnd(28)}${"on screen".padStart(14)}${"on the PDF".padStart(14)}`);
  for (const [what, a, b] of checks) {
    console.log(
      `${what.padEnd(28)}${a.padStart(14)}${b.padStart(14)}  ${same(a, b) ? "" : "  <-- differs"}`,
    );
  }
  console.log(
    `\n${checks.length - bad.length} of ${checks.length} cells match the printed quotation`,
  );
  for (const note of notes) console.log(`note: ${note}`);
  console.log(`screenshots: ${outDir}/${proformaNo}-entry.png and -print.png`);
}

/** A sweep says only what did not come out right, and where. */
function report(
  proformaNo: string,
  bad: Array<[string, string, string]>,
  notes: string[],
  total: number,
) {
  console.log(
    `${proformaNo}  ${String(total - bad.length).padStart(3)} of ${String(total).padEnd(3)}`,
  );
  for (const [what, a, b] of bad) console.log(`        ${what.padEnd(26)}${a} vs ${b} on the PDF`);
  for (const note of notes) console.log(`        note: ${note}`);
}

/** The allowance most of the rows were cut at. */
function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

async function type(locator: Locator, value: string | number) {
  await locator.fill(String(value));
  await locator.blur();
}

/** A tail row read by its exact label, so "Total" does not find "Section total". */
async function rowValue(totals: Locator, label: string) {
  const found = await totals.evaluate(
    (el, wanted) =>
      Array.from(el.querySelectorAll(".totals__row"))
        .find((row) => row.querySelector(".totals__label")?.textContent?.trim() === wanted)
        ?.querySelector(".totals__value")?.textContent ?? "",
    label,
  );
  return found.replace(/[^0-9.]/g, "");
}
