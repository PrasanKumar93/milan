import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto("http://localhost:5199");
await page.evaluate(() => localStorage.clear());
await page.reload();

const card = page.locator("section.card").filter({ hasText: "Section 1" });
const grid = card.locator("table.grid").first();

const row = grid.locator("tbody tr").last();
await row.locator("input:not([disabled])").nth(0).fill("2000");
await row.locator("input:not([disabled])").nth(1).fill("1000");
await page.keyboard.press("Enter");

const where = () => page.evaluate(() => document.activeElement?.tagName);
console.log("after Enter, cursor is on:", await where());

await page.getByRole("button", { name: "Add charge" }).click();
console.log("after Add charge, cursor is on:", await where());

await page.getByRole("button", { name: "Add line" }).click();
console.log("after Add line, cursor is on:", await where());

await card.screenshot({ path: "/tmp/enter-rows.png" });
await browser.close();
