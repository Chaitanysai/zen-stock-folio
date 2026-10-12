// Browser smoke check for a deployed ZenFolio build.
// Usage: PREVIEW_URL=<url> VERCEL_BYPASS=<token> node scripts/verify-preview.mjs
import { chromium } from "playwright";

const base = process.env.PREVIEW_URL;
const bypass = process.env.VERCEL_BYPASS;
if (!base) throw new Error("PREVIEW_URL is required");

const url = new URL(base);
if (bypass) {
  url.searchParams.set("x-vercel-protection-bypass", bypass);
  url.searchParams.set("x-vercel-set-bypass-cookie", "true");
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
const failedRequests = [];

page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText}`));

await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

const title = await page.title();
const bodyText = (await page.innerText("body")).slice(0, 4000);
const hasCanvas = (await page.locator("canvas").count()) > 0;
const hasChartContainer = (await page.locator("div[style*='height: 220px'], div[style*='height:220px']").count()) > 0;

const result = {
  title,
  hasCanvas,
  hasChartContainer,
  bodyHasDashboardText: /portfolio|holdings|overview/i.test(bodyText),
  consoleErrors: consoleErrors.slice(0, 10),
  failedRequests: failedRequests.slice(0, 10),
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
