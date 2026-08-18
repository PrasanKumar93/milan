import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto("http://localhost:5175");
await page.evaluate(() => localStorage.clear());
await page.reload();

const credit = page.getByText("Developed by Lakshman Rajpurohit");
await credit.scrollIntoViewIfNeeded();
await page.screenshot({
  path: "dist/credit.png",
  clip: { ...(await credit.boundingBox())!, x: 0, width: 1440, height: 90 },
});

await page.getByText("What prints").click();
console.log("shown on the print tab:", await credit.count());
await browser.close();
