import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const output = "scripts/e2e/.auth/user.json";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(baseURL);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
await prompt.question(
  "Sign in in the opened browser, wait for the dashboard, then press Enter here… ",
);
await mkdir("scripts/e2e/.auth", { recursive: true });
// Firebase Auth persists in IndexedDB, so cookies + localStorage alone are not
// enough to restore the session.
await context.storageState({ path: output, indexedDB: true });
console.log(`Saved the signed-in browser state to ${output}.`);

await prompt.close();
await browser.close();
