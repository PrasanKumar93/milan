import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto("http://localhost:5199");
await page.evaluate(() => localStorage.clear());
await page.reload();

// The section from the screenshot: 10 MM brown, one piece 123 x 345.
const card = page.locator("section.card").filter({ hasText: "Section 1" });
const [thickness, glass] = await card.locator(".card__head select").all();
await glass.selectOption("BROWN TOUGHENED GLASS");
await thickness.selectOption("10MM");

const line = card.locator("table.grid").first().locator("tbody tr").first();
await line.locator("input:not([disabled])").nth(0).fill("123");
await line.locator("input:not([disabled])").nth(1).fill("345");
await line.locator("input:not([disabled])").nth(4).fill("1733");

await page.getByRole("button", { name: "Add charge" }).click();
const charges = card.locator(".grid-wrap").nth(1);
const row = charges.locator("tbody tr").first();
await row.locator("select").selectOption("POLISH (JOB WORK)");
await row.getByRole("button", { name: /Use .* rft/ }).click();

await row.locator(".info").hover();
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/polish-tip.png" });

await browser.close();
