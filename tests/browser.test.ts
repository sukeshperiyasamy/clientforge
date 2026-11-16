import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ProjectBrowser,
  type BrowserConfig,
} from "../server/browser/manager.ts";
test("persistent project browser retains cookies/local storage across a close and reopen without sharing a writable profile", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/download") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Disposition": 'attachment; filename="fixture-download.txt"',
      });
      res.end("synthetic test download");
    } else if (req.url === "/login") {
      res.end(
        '<!doctype html><title>Fixture login</title><input type="password">',
      );
    } else {
      res.end(
        '<!doctype html><title>Persistent fixture</title><h1>Local persistence test</h1><a href="/download">Download fixture</a>',
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port;
  const home = `http://127.0.0.1:${port}/fixture`;
  const root = mkdtempSync(join(tmpdir(), "freelancegrowth-browser-test-"));
  const cfg: BrowserConfig = {
    profileName: "FreelanceGrowth",
    homepage: home,
    channel: "chromium",
    brokerPort: 4312,
    downloadLimitMB: 1,
  };
  const manager = new ProjectBrowser(root, cfg, true);
  const rival = new ProjectBrowser(root, cfg, true);
  try {
    await manager.launch();
    const initial = await manager.tabs();
    assert(initial.running);
    assert.equal(initial.profileName, "FreelanceGrowth");
    const page = manager.page(initial.tabs[0].id);
    await page.context().addCookies([
      {
        url: home,
        name: "fixture-session",
        value: "synthetic-session",
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);
    await page.evaluate(() =>
      localStorage.setItem("fixture-marker", "synthetic-persisted-value"),
    );
    await assert.rejects(
      () => rival.launch(),
      /Could not open the dedicated browser/,
    );
    const screenshot = await manager.capture(initial.tabs[0].id);
    assert(
      readFileSync(join(root, "screenshots", screenshot.file)).length > 100,
    );
    const waiting = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download fixture" }).click();
    await waiting;
    for (let i = 0; i < 40 && !readdirSync(join(root, "downloads")).length; i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.equal(readdirSync(join(root, "downloads")).length, 1);
    await manager.close();
    const reopened = new ProjectBrowser(root, cfg, true);
    try {
      await reopened.launch();
      const state = await reopened.tabs();
      const restored = reopened.page(state.tabs[0].id);
      assert.equal(
        (await restored.context().cookies()).find(
          (c) => c.name === "fixture-session",
        )?.value,
        "synthetic-session",
      );
      assert.equal(
        await restored.evaluate(() => localStorage.getItem("fixture-marker")),
        "synthetic-persisted-value",
      );
      await reopened.open(`http://127.0.0.1:${port}/login`);
      const login = (await reopened.tabs()).tabs.find((t) =>
        t.url.endsWith("/login"),
      )!;
      assert.equal((await reopened.signals("github")).signal, "not_open");
      await assert.rejects(() => reopened.capture(login.id), /authentication/);
    } finally {
      await reopened.close();
    }
    const prefs = JSON.parse(
      readFileSync(join(root, "profile", "Default", "Preferences"), "utf8"),
    );
    assert.equal(prefs.profile.name, "FreelanceGrowth");
    assert(
      !readFileSync(join(root, "logs", "actions.jsonl"), "utf8").includes(
        "synthetic-session",
      ),
    );
  } finally {
    await manager.close();
    await rival.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
