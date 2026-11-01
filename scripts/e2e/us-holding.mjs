import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const authFile = "scripts/e2e/.auth/user.json";
const ticker = "AAPL";
// Run-unique name so the smoke can never select a pre-existing AAPL row.
const stockName = `Apple Inc E2E ${Date.now()}`;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL)) {
  console.error("Refusing a non-local E2E_BASE_URL; this smoke writes a manual position.");
  process.exit(1);
}
if (!existsSync(authFile)) {
  console.error("No saved session. Run `npm run e2e:save-auth` first.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const context = await browser.newContext({ storageState: authFile });
const page = await context.newPage();
const failures = [];
page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));

const screenshot = (name) =>
  page.screenshot({ path: `scripts/e2e/.auth/${name}.png`, fullPage: true }).catch(() => {});

let added = false;
let row = null;

/** Remove one row through its own Actions menu. */
const deleteRow = async (target) => {
  await target.getByRole("button", { name: `Actions for ${ticker}` }).click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await target.waitFor({ state: "detached", timeout: 15000 });
};

let exitCode = 0;
try {
  await page.goto(baseURL);
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await page.getByRole("button", { name: /Add Trade/ }).first().click();

  // Every field is scoped to the dialog: page-level placeholder matching would
  // also hit the dashboard's own inputs.
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 15000 });

  // Market is the first combobox in the dialog; Trade Status is the second.
  await dialog.getByRole("combobox").first().click();
  await dialog.getByRole("option", { name: /US · United States/ }).click();

  await dialog.getByPlaceholder("e.g. RELIANCE").fill(ticker);
  await dialog.getByPlaceholder("e.g. Reliance Industries").fill(stockName);
  // The entry price placeholder is "$0.00" once the market is US; only one such
  // input exists while the trade status is Active.
  await dialog.getByPlaceholder("$0.00").fill("100");
  await dialog.getByPlaceholder("0", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: /Add Trade to Portfolio/ }).click();
  added = true;

  row = page.locator("tr").filter({ hasText: stockName }).first();
  await row.waitFor({ timeout: 15000 });
  // Native price stays USD and keeps 2 decimals; the badge names market + currency.
  await row.getByText("$100.00", { exact: true }).first().waitFor();
  await row.getByText("US · USD", { exact: true }).waitFor();
  await screenshot("us-holding");

  // Leave the portfolio as it was: remove the row this smoke added.
  await deleteRow(row);
  added = false;

  console.log("U.S. holding rendered with a native USD price and was removed again.");
} catch (error) {
  console.error(error);
  await screenshot("us-holding-failure");
  exitCode = 1;
} finally {
  // A failure after the row was added must not leave it behind.
  if (added && row) {
    try {
      await deleteRow(row);
      console.log("Removed the temporary U.S. holding after the failure.");
    } catch (cleanupError) {
      console.error("Could not remove the temporary U.S. holding; delete it by hand.", cleanupError);
    }
  }
  await browser.close();
}

if (failures.length > 0) console.error(failures.join("\n"));
process.exit(exitCode || (failures.length > 0 ? 1 : 0));
