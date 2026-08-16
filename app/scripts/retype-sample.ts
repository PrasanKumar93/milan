/**
 * Type one of the sample quotations into the running app, the way an operator
 * would, and check what the screen shows against the PDF the office sent.
 *
 *   npm run dev                                   # in another terminal
 *   npm run retype -- 7123 http://localhost:5175
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
import type { Locator } from "playwright-core";
import { chromium } from "playwright-core";
import type { PrintUnit } from "../src/core/types";
import { areaOf } from "../src/core/units";
import { inferUnit, sample } from "../src/test/corpus";

const [proformaNo = "7123", url = "http://localhost:5175", outDir = "/tmp/retype"] =
  process.argv.slice(2);

const parsed = sample(proformaNo);
const sections = parsed.sections.filter((s) => s.lines.length > 0);
mkdirSync(outDir, { recursive: true });

const checks: Array<[string, string, string]> = [];
const notes: string[] = [];

function check(what: string, onScreen: string | number, onPdf: string | number) {
  checks.push([what, String(onScreen), String(onPdf)]);
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(url);
await page.evaluate(() => localStorage.clear()); // a leftover draft would be offered back
await page.reload();

await type(page.getByPlaceholder("7178"), parsed.proforma_no);
await type(page.getByPlaceholder("dd/mm/yyyy"), parsed.date);
await type(page.getByPlaceholder("M/S ..."), parsed.customer);
const inputUnit = inferUnit(sections[0], sections[0].lines[0]);

// The printed unit is taken from the figures rather than from the column
// heading, because one sample heads the column SQMT over square feet.
const first = sections[0].lines[0];
const gapIn = (unit: PrintUnit) =>
  areaOf(inputUnit, unit, first.ch, first.cw, first.qty).minus(first.area).abs();
const printUnit: PrintUnit = gapIn("SQFT").lte(gapIn("SQMT")) ? "SQFT" : "SQMT";
if (printUnit !== sections[0].out_unit) {
  notes.push(`the sheet heads that column ${sections[0].out_unit}, but the figures are ${printUnit}`);
}

await page.getByRole("button", { name: inputUnit, exact: true }).click();
await page.getByRole("button", { name: printUnit, exact: true }).click();

const gst = parsed.sections.find((s) => s.gst_pct !== null)?.gst_pct ?? null;
await page
  .getByRole("button", { name: gst === null ? "Not applied" : "Applied", exact: true })
  .click();

for (const [si, section] of sections.entries()) {
  if (si > 0) await page.getByRole("button", { name: "Add section" }).click();
  const card = page.locator("section.card").filter({ hasText: `Section ${si + 1}` });

  const [thickness, ...rest] = section.product.split(" ");
  await card.locator("select").first().selectOption(thickness);
  await card.locator("select").nth(1).selectOption(rest.join(" "));

  // The allowance is a setting, not a formula: 50 is the house standard but
  // plenty of quotes are cut at 30. Read what this sheet used, and set it.
  const perLine = section.lines.map((l) => (l.ch - l.ah === l.cw - l.aw ? l.ch - l.ah : NaN));
  const fixed = perLine.every((a) => a > 0 && a <= 150);
  const allowance = fixed ? mode(perLine) : 0;

  if (!fixed) {
    await card.getByRole("button", { name: "Foot to foot" }).click();
    notes.push(`S${si + 1}: sizes go up to the next foot rather than a fixed allowance`);
  } else if (allowance !== 50) {
    await type(card.locator("input.input--num").first(), allowance);
    notes.push(`S${si + 1}: cut at ${allowance} ${inputUnit}, not the standard 50`);
  }

  for (const [li, line] of section.lines.entries()) {
    if (li > 0) await card.getByRole("button", { name: "Add line" }).click();
    const row = card.locator("table.grid").first().locator("tbody tr").nth(li);
    // #, shape, actual H, actual W, wastage, chargeable H, chargeable W, qty,
    // area, rate, amount.
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
    await type(col(9), line.rate);

    // Nothing below was typed: the row filled these in.
    const seen = `S${si + 1} L${li + 1}`;
    check(`${seen} chargeable H`, await col(5).inputValue(), line.ch);
    check(`${seen} chargeable W`, await col(6).inputValue(), line.cw);
    check(`${seen} area`, await col(8).inputValue(), line.area);
    check(`${seen} amount`, await col(10).inputValue(), line.amount);
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

    const perUnit = extra.qty !== null;
    await row.locator("select").nth(1).selectOption(perUnit ? "per_unit" : "flat");

    // charge, basis, qty, rate, amount.
    const col = (n: number) => row.locator("td").nth(n).locator("input.input--num").first();
    if (perUnit) {
      await type(col(2), extra.qty as number);
      await type(col(3), extra.amount / (extra.qty as number));
    } else {
      await type(col(3), extra.amount);
    }

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
    notes.push(`S${si + 1}: the sheet rounds after the charges, so it prints no rounded subtotal`);
  } else {
    check(`S${si + 1} rounded`, ours, printedRounded);
    // Rounding a subtotal is an operator entry, not a formula: where the office
    // went the other way, copy theirs so the rest of the tail is comparable.
    if (ours !== printedRounded) {
      notes.push(`S${si + 1}: the office wrote ${printedRounded} where rounding gives ${ours}; typed theirs`);
      await type(rounded, printedRounded);
    }
  }

  // A single-section quote prints its total once, as the grand total.
  const printedTotal =
    section.post_tax_labels[0]?.amount ?? (sections.length === 1 ? parsed.grand_total : null);
  check(`S${si + 1} section total`, await rowValue(totals, "Section total"), printedTotal ?? "—");
}

await page.screenshot({ path: resolve(outDir, `${proformaNo}-entry.png`), fullPage: true });
await page.getByRole("tab", { name: "What prints" }).click();
await page.screenshot({ path: resolve(outDir, `${proformaNo}-print.png`), fullPage: true });

// And press the buttons an operator presses, so the files themselves are here
// to be opened rather than only the screen they were made from.
for (const button of ["Download PDF", "Download Excel"]) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: button }).click(),
  ]);
  await download.saveAs(resolve(outDir, `${proformaNo}${button.endsWith("PDF") ? ".pdf" : ".xlsx"}`));
}

const shown = (await page.locator(".topbar .strong.num").textContent()) ?? "";
check("Grand total", shown.replace(/[^0-9.]/g, ""), parsed.grand_total ?? "—");

// ---- report ----

/**
 * The sheet prints seven significant figures where the entry grid shows two
 * decimals, so a figure counts as the same when it survives to the last place
 * both of them show.
 */
function same(a: string, b: string) {
  if (a === b) return true;
  const [x, y] = [Number(a), Number(b)];
  if (!isFinite(x) || !isFinite(y)) return false;
  return Math.abs(x - y) <= 0.0051 || Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 2e-7;
}
const bad = checks.filter(([, a, b]) => !same(a, b));

console.log(`\nPROFORMA ${parsed.proforma_no} — ${parsed.customer}, ${parsed.date}`);
console.log(
  `typed: ${sections.length} section(s), ${sections.reduce((n, s) => n + s.lines.length, 0)} sizes and rates, ` +
    `${sections.reduce((n, s) => n + s.extras.length, 0)} charges, GST ${gst === null ? "not applied" : `${gst}%`}\n`,
);
console.log(`${"what".padEnd(28)}${"on screen".padStart(14)}${"on the PDF".padStart(14)}`);
for (const [what, a, b] of checks) {
  console.log(`${what.padEnd(28)}${a.padStart(14)}${b.padStart(14)}  ${same(a, b) ? "" : "  <-- differs"}`);
}
console.log(`\n${checks.length - bad.length} of ${checks.length} cells match the printed quotation`);
for (const note of notes) console.log(`note: ${note}`);
console.log(`screenshots: ${outDir}/${proformaNo}-entry.png and -print.png`);

await browser.close();
process.exit(bad.length === 0 ? 0 : 1);

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
      Array.from(el.querySelectorAll(".totals__row")).find(
        (row) => row.querySelector(".totals__label")?.textContent?.trim() === wanted,
      )?.querySelector(".totals__value")?.textContent ?? "",
    label,
  );
  return found.replace(/[^0-9.]/g, "");
}
