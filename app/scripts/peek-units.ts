import { chromium } from "playwright-core";

/**
 * A quote with one section measured in millimetres and priced by the square
 * metre, and a second measured in inches, priced by the square foot and not
 * taxed — the mix the settings moved onto the section for (§2.1).
 *
 *   npm run dev -- --port 5199 --strictPort
 *   npx vite-node scripts/peek-units.ts
 */

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1680, height: 1400 } });

await page.goto("http://localhost:5199");
await page.evaluate(() => localStorage.clear());
await page.reload();

const cardFor = (n: number) =>
  page.locator("section.card").filter({ hasText: `Section ${n}` });

/** Height, width, count and rate, then Enter for the row after it. */
async function fill(n: number, rows: string[][]) {
  const grid = cardFor(n).locator("table.grid").first();

  for (const [h, w, qty, rate] of rows) {
    const typed = grid.locator("tbody tr").last().locator("input:not([disabled])");
    // The count and the rate are the last two boxes either way. A section on
    // foot to foot has no allowance to type, so the row is one box shorter.
    const boxes = await typed.count();

    await typed.nth(0).fill(h);
    await typed.nth(1).fill(w);
    await typed.nth(boxes - 2).fill(qty);
    await typed.nth(boxes - 1).fill(rate);
    await page.keyboard.press("Enter");
  }
}

const pick = async (n: number, thickness: string, glass: string) => {
  const card = cardFor(n);
  await card.locator("select").first().selectOption(thickness);
  await card.locator("select").nth(1).selectOption(glass);
};

await pick(1, "10MM", "CLEAR TOUGHENED GLASS");
await fill(1, [
  ["2290", "340", "1", "1232"],
  ["2000", "1000", "2", "1232"],
]);

await page.getByRole("button", { name: "Add section" }).click();
const second = cardFor(2);

// The second section is measured and priced the other way, and carries no tax.
await second.getByRole("button", { name: "inch", exact: true }).click();
await second.getByRole("button", { name: "SQFT", exact: true }).click();
await second.getByRole("button", { name: "Not applied", exact: true }).click();
await pick(2, "6MM", "CLEAR MIRROR");
await fill(2, [
  ["42 3/4", "10 3/4", "1", "155"],
  ["48", "12", "2", "155"],
]);

await page.locator(".panel").screenshot({ path: "/tmp/units-entry.png" });
await cardFor(2).screenshot({ path: "/tmp/units-section.png" });

await page.getByRole("tab", { name: "Preview" }).click();
await page.locator(".print").first().screenshot({ path: "/tmp/units-preview.png" });

// The download the operator actually gets, both of them, off the same page.
for (const [button, file] of [
  ["Download PDF", "/tmp/units.pdf"],
  ["Download Excel", "/tmp/units.xlsx"],
] as const) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: button }).click();
  await (await download).saveAs(file);
}

await browser.close();
