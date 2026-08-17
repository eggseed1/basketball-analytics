import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://127.0.0.1:3000/history?season=2023-24", {
  waitUntil: "commit",
  timeout: 45000,
});
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("h2,h3,p,span,div")].find((e) =>
    /DRBL\/100|DRBL leaders|validated ability/i.test(e.textContent || "")
  );
  if (el) el.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(800);
await page.screenshot({
  path: "reports/product_completeness_v1_1/screenshots/history-2023-24-drbl-leaders.png",
  fullPage: true,
});
const body = await page.locator("body").innerText();
const hits = body.match(/DRBL[^\n]{0,80}/gi) || [];
console.log(JSON.stringify(hits.slice(0, 10)));
await browser.close();
