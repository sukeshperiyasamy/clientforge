import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { chromium } from "playwright";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store.ts";
import { createApp, errorHandler } from "../server/app.ts";
import { config } from "../server/config.ts";
test("owner setup, connections dashboard, search, setup instructions and responsive layout work in a real browser", async () => {
  assert(existsSync("dist/index.html"), "Build before running UI tests.");
  const previous = config.dataDir;
  config.dataDir = mkdtempSync(join(tmpdir(), "freelancegrowth-ui-test-"));
  const store = new Store(":memory:");
  const app = createApp(store);
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/connections");
    await page
      .getByRole("heading", { name: "Secure your workspace" })
      .waitFor();
    const password = "synthetic-ui-" + randomUUID();
    await page.getByLabel("Dashboard password", { exact: true }).fill(password);
    await page
      .getByLabel("Confirm dashboard password", { exact: true })
      .fill(password);
    await page
      .getByRole("button", { name: "Create owner login", exact: true })
      .click();
    await page.getByRole("heading", { name: "Account connections." }).waitFor();
    await page
      .getByRole("heading", { name: "LinkedIn", exact: true })
      .waitFor();
    assert.equal(await page.locator(".connection-card").count(), 43);
    assert.equal(
      (await page.getByText("0", { exact: true }).count()) >= 1,
      true,
    );
    await page
      .getByRole("textbox", { name: "Search platforms" })
      .fill("Fiverr");
    assert.equal(await page.locator(".connection-card").count(), 1);
    assert(
      await page
        .getByRole("heading", { name: "Fiverr", exact: true })
        .isVisible(),
    );
    await page
      .getByRole("textbox", { name: "Search platforms" })
      .fill("GitHub");
    await page
      .getByRole("button", { name: "Setup & limits", exact: true })
      .click();
    await page.getByRole("dialog", { name: "GitHub setup" }).waitFor();
    assert(
      (await page.getByRole("dialog").innerText()).includes(
        "GITHUB_CLIENT_ID=<set locally in .env>",
      ),
    );
    await page.getByRole("button", { name: "Close setup" }).click();
    await page.getByRole("textbox", { name: "Search platforms" }).fill("");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    mkdirSync("docs", { recursive: true });
    await page.screenshot({ path: "docs/connections.jpg" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page
      .getByRole("heading", { name: "LinkedIn", exact: true })
      .waitFor();
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    assert(
      widths.page <= widths.viewport + 1,
      `Mobile overflow: ${JSON.stringify(widths)}`,
    );
    await page.screenshot({ path: "docs/connections-mobile.jpg" });
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page
      .getByRole("button", { name: "Sign out of dashboard", exact: true })
      .click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    config.dataDir = previous;
  }
});
