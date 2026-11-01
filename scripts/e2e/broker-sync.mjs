import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const authFile = "scripts/e2e/.auth/user.json";
const token = process.env.BROKER_TEST_TOKEN ?? "";

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL)) {
  console.error("Refusing a non-local E2E_BASE_URL; this smoke writes real sync data.");
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
page.on("console", (message) => {
  if (message.type() === "error") console.warn(`[console] ${message.text()}`);
});

const finish = async (code) => {
  if (failures.length > 0) console.error(failures.join("\n"));
  await browser.close();
  process.exit(code || (failures.length > 0 ? 1 : 0));
};

await page.goto(baseURL);
await page.getByRole("button", { name: "Portfolio", exact: true }).click();
await page.getByRole("heading", { name: "INDmoney sync" }).waitFor();

await page
  .getByText("Checking the broker connection…")
  .waitFor({ state: "hidden", timeout: 15000 })
  .catch(() => {});

const tokenInput = page.getByLabel("INDstocks API token");
// Shared by the unlinked and already-linked paths, so it lives outside both.
const disabledAlert = page.getByRole("alert").filter({ hasText: /not configured/i });
if (await tokenInput.count()) {
  if (!token) {
    console.log("Not linked and no BROKER_TEST_TOKEN was provided; the unlinked card rendered correctly.");
    await page.screenshot({ path: "scripts/e2e/.auth/broker-unlinked.png", fullPage: true });
    await finish(0);
  }

  await tokenInput.fill(token);
  await page.getByRole("button", { name: "Link account" }).click();

  // The card learns `disabled` only from a `BROKER_DISABLED` response, and that
  // response also sets the error, so a fresh load never reaches the neutral
  // "not configured" notice (it renders only when `disabled` is set without an
  // error). A disabled deployment therefore shows the text in the alert, and
  // this branch is driven by that alert. The post-link state is raced: the
  // linked card, or the disabled alert.
  const preview = page.getByRole("button", { name: "Preview sync" });
  const settle = (target, label) =>
    target.waitFor({ timeout: 45000 }).then(() => label).catch(() => null);
  const outcome = await Promise.race([settle(preview, "linked"), settle(disabledAlert, "disabled")]);

  if (outcome === "disabled") {
    console.log("Broker routes are disabled (expected until the probe and environment are complete).");
    await page.screenshot({ path: "scripts/e2e/.auth/broker-disabled.png", fullPage: true });
    await finish(0);
  }
  if (outcome !== "linked") {
    console.error("The card neither linked nor reported a disabled deployment within 45 s.");
    await page.screenshot({ path: "scripts/e2e/.auth/broker-link-failure.png", fullPage: true });
    await finish(1);
  }
}

await page.getByRole("button", { name: "Preview sync" }).click();
const apply = page.getByRole("button", { name: "Apply changes" });
// An already-linked session on a disabled deployment learns it only from the
// preview response, so the apply button never appears: race it with the alert.
await Promise.race([
  apply.waitFor({ timeout: 45000 }).catch(() => null),
  disabledAlert.waitFor({ timeout: 45000 }).catch(() => null),
]);
if (await disabledAlert.count()) {
  console.log("Broker routes are disabled (expected until the probe and environment are complete).");
  await page.screenshot({ path: "scripts/e2e/.auth/broker-disabled.png", fullPage: true });
  await finish(0);
}
// A real `isDisabled()` check would throw an opaque timeout here instead of
// naming the failure.
if ((await apply.count()) === 0) {
  console.error("The preview neither offered Apply nor reported a disabled deployment within 45 s.");
  await page.screenshot({ path: "scripts/e2e/.auth/broker-preview-failure.png", fullPage: true });
  await finish(1);
}

if (await apply.isDisabled()) {
  console.log("The preview is blocked (conflict, limit, or required confirmation); no apply attempted.");
} else {
  await apply.click();
  await page.getByRole("status").filter({ hasText: /Synced \d+ open/ }).waitFor({ timeout: 45000 });
  console.log("Apply completed and the dashboard reloaded.");
}

await page.screenshot({ path: "scripts/e2e/.auth/broker-sync.png", fullPage: true });
await finish(0);
