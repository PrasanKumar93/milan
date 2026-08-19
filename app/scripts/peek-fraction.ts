import { chromium } from "playwright-core";

/**
 * Sizes typed in inches, key by key, at the speed they are typed on the day.
 * Every row here is one an operator has written on a real quotation, plus the
 * sixteenths that used to make the box rewrite itself mid-fraction.
 */

const url = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();

await page.getByRole("button", { name: "inch", exact: true }).click();

const card = page.locator("section.card").filter({ hasText: "Section 1" });
await card.locator("select").first().selectOption("10MM");
await card.locator("select").nth(1).selectOption("CLEAR TOUGHENED GLASS");

const rows = card.locator("table.grid").first().locator("tbody tr");
const cell = (r: number, n: number) => rows.nth(r).locator("td").nth(n).locator("input").first();

const jobs = [
  ["42 3/4", "9 1/8", 60],
  ["44 1/2", "10 3/4", 0],
  ["48 1/4", "11 7/8", 0],
  ["42 11/16", "9 3/16", 30],
] as const;

for (const [i, [h, w, delay]] of jobs.entries()) {
  if (i > 0) await card.getByRole("button", { name: "Add line" }).click();
  for (const [box, text] of [
    [cell(i, 2), h],
    [cell(i, 3), w],
  ] as const) {
    await box.click();
    await box.pressSequentially(text, { delay });
  }
  await cell(i, 9).click();
  await cell(i, 9).pressSequentially("155");
}
await page.keyboard.press("Tab");

const read = async (r: number, n: number) => (await cell(r, n).inputValue()).trim();
const inches = (t: string) => {
  const [whole, frac] = t.split(" ");
  const [n, d] = frac?.split("/") ?? ["0", "1"];
  return Number(whole) + Number(n) / Number(d);
};

console.log("typed              in the box         charged            does the row multiply out?");
for (const [i, [h, w]] of jobs.entries()) {
  const [sh, sw, ch, cw, qty, area] = await Promise.all([
    read(i, 2),
    read(i, 3),
    read(i, 5),
    read(i, 6),
    read(i, 7),
    read(i, 8),
  ]);

  // The area the sizes on screen give, worked out here: inches to square metres.
  const byHand = (inches(ch) * inches(cw) * Number(qty)) / 144 / 10.764;
  const agrees = Math.abs(byHand - Number(area)) < 5e-6;

  console.log(
    `${`${h} x ${w}`.padEnd(19)}${`${sh} x ${sw}`.padEnd(19)}${`${ch} x ${cw}`.padEnd(19)}${
      agrees ? `yes, ${area}` : `NO — the sizes shown give ${byHand.toFixed(6)}, the row says ${area}`
    }`,
  );
}

await browser.close();
