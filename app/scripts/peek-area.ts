import { chromium } from "playwright-core";

/**
 * A look at the two area columns on the entry screen: the glass as measured
 * beside the glass as billed, and the wastage the pair of them shows.
 *
 *   npm run dev -- --port 5199 --strictPort
 *   npx vite-node scripts/peek-area.ts
 */

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });

await page.goto("http://localhost:5199");
await page.evaluate(() => localStorage.clear());
await page.reload();

const card = page.locator("section.card").filter({ hasText: "Section 1" });
const grid = card.locator("table.grid").first();

for (const [h, w, qty] of [
  ["2290", "340", "1"],
  ["2000", "1000", "2"],
]) {
  const row = grid.locator("tbody tr").last();
  const typed = row.locator("input:not([disabled])");

  await typed.nth(0).fill(h);
  await typed.nth(1).fill(w);
  await typed.nth(3).fill(qty);
  await typed.nth(4).fill("1323");
  await page.keyboard.press("Enter");
}

await card.screenshot({ path: "/tmp/entry-areas.png" });

await page.getByRole("tab", { name: "Preview" }).click();
await page.locator(".print").first().screenshot({ path: "/tmp/preview-areas.png" });

await browser.close();
