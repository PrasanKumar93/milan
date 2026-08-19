import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

await page.goto("http://localhost:5199");
await page.evaluate(() => localStorage.clear());
await page.reload();

const card = page.locator("section.card").filter({ hasText: "Section 1" });
const grid = card.locator("table.grid").first();

const sizes = [
  ["2290", "340"],
  ["2917", "628"],
  ["2920", "630"],
];

for (const [h, w] of sizes) {
  const row = grid.locator("tbody tr").last();
  await row.locator("input:not([disabled])").nth(0).fill(h);
  await row.locator("input:not([disabled])").nth(1).fill(w);
  await row.locator("input:not([disabled])").nth(3).fill("1323");
  await page.keyboard.press("Enter");
}

await page.getByRole("tab", { name: "What prints" }).click();
await page.locator(".print-table").first().screenshot({ path: "/tmp/print-grid.png" });

await browser.close();
