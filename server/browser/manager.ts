import { chromium, type BrowserContext, type Page } from "playwright";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { homedir } from "node:os";
import { connectors, type BrowserState } from "../../shared/connectors.ts";
import { protectDirectory } from "../security.ts";
export type BrowserConfig = {
  profileName: string;
  homepage: string;
  channel: "chromium" | "chrome";
  brokerPort: number;
  downloadLimitMB: number;
};
export const browserConfigRoot = resolve("browser");
const projectKey = createHash("sha256")
  .update(resolve(".").toLowerCase())
  .digest("hex")
  .slice(0, 12);
export const browserRoot = join(
  process.platform === "win32"
    ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    : join(homedir(), ".local", "share"),
  "FreelanceGrowth",
  "Browser",
  projectKey,
);
export function readBrowserConfig(): BrowserConfig {
  const raw = JSON.parse(
    readFileSync(join(browserConfigRoot, "browser-config.json"), "utf8"),
  );
  const url = new URL(raw.homepage);
  if (
    url.username ||
    url.password ||
    (!(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.protocol === "http:"
    ) &&
      url.protocol !== "https:")
  )
    throw new Error(
      "Project homepage must use HTTPS or loopback HTTP and must not contain credentials.",
    );
  const port = Number(raw.brokerPort || 4312);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Use a broker port between 1024 and 65535.");
  return {
    profileName: "FreelanceGrowth",
    homepage: url.toString(),
    channel: raw.channel === "chrome" ? "chrome" : "chromium",
    brokerPort: port,
    downloadLimitMB: Math.max(
      1,
      Math.min(500, Number(raw.downloadLimitMB) || 250),
    ),
  };
}
export function permittedBrowserUrl(value: string, homepage: string) {
  const url = new URL(value);
  if (url.username || url.password)
    throw new Error("URLs containing credentials are not allowed.");
  if (url.origin === new URL(homepage).origin) return url.toString();
  if (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    ["4007", "3000", "4310"].includes(url.port)
  )
    return url.toString();
  const hosts = new Set([
    ...connectors.map((c) => new URL(c.url).hostname),
    "github.com",
    "accounts.google.com",
    "www.linkedin.com",
    "linkedin.com",
    "www.facebook.com",
    "www.instagram.com",
    "api.x.com",
    "twitter.com",
    "www.pinterest.com",
    "api.pinterest.com",
    "www.tiktok.com",
  ]);
  if (url.protocol !== "https:" || !hosts.has(url.hostname))
    throw new Error("That website is not in the approved connector registry.");
  return url.toString();
}
export const sanitizedUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "about:" ? "about:blank" : `${u.origin}${u.pathname}`;
  } catch {
    return "Unknown page";
  }
};
export class ProjectBrowser {
  private context?: BrowserContext;
  private opening?: Promise<void>;
  private ids = new Map<Page, string>();
  private screenshots = new Map<string, string>();
  private lease?: string;
  takeover = true;
  lastError?: string;
  constructor(
    public root: string,
    public settings: BrowserConfig,
    private headless = false,
  ) {}
  private acquireProfile() {
    const path = join(this.root, "runtime", "profile-owner.lock");
    if (existsSync(path)) {
      let owner: { pid: number };
      try {
        owner = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        throw new Error(
          "Could not open the dedicated browser. Its ownership record needs manual inspection.",
        );
      }
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
      if (alive)
        throw new Error(
          "Could not open the dedicated browser. Another live manager owns this project profile.",
        );
      unlinkSync(path);
    }
    const lease = randomUUID();
    writeFileSync(path, JSON.stringify({ pid: process.pid, lease }), {
      flag: "wx",
      mode: 0o600,
    });
    this.lease = lease;
  }
  private releaseProfile() {
    if (!this.lease) return;
    const path = join(this.root, "runtime", "profile-owner.lock");
    try {
      const current = JSON.parse(readFileSync(path, "utf8"));
      if (current.lease === this.lease) unlinkSync(path);
    } catch {}
    this.lease = undefined;
  }
  log(action: string, detail = "") {
    mkdirSync(join(this.root, "logs"), { recursive: true });
    const line =
      JSON.stringify({
        at: new Date().toISOString(),
        action,
        detail: detail.slice(0, 200),
      }) + "\n";
    const path = join(this.root, "logs", "actions.jsonl");
    if (existsSync(path) && statSync(path).size > 2_000_000)
      writeFileSync(path, "", { mode: 0o600 });
    writeFileSync(path, line, { flag: "a", mode: 0o600 });
  }
  async launch() {
    if (this.context) return;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      protectDirectory(this.root);
      for (const folder of [
        "profile",
        "downloads",
        "screenshots",
        "logs",
        "runtime",
      ])
        mkdirSync(join(this.root, folder), { recursive: true, mode: 0o700 });
      this.acquireProfile();
      const prefs = join(this.root, "profile", "Default", "Preferences");
      if (!existsSync(prefs)) {
        mkdirSync(join(this.root, "profile", "Default"), { recursive: true });
        writeFileSync(
          prefs,
          JSON.stringify({
            profile: { name: "FreelanceGrowth" },
            download: {
              default_directory: join(this.root, "downloads"),
              prompt_for_download: false,
            },
          }),
        );
      }
      try {
        this.context = await chromium.launchPersistentContext(
          join(this.root, "profile"),
          {
            headless: this.headless,
            channel: this.settings.channel === "chrome" ? "chrome" : undefined,
            viewport: null,
            acceptDownloads: true,
            downloadsPath: join(this.root, "runtime"),
            args: ["--no-first-run", "--no-default-browser-check"],
            timeout: 45000,
          },
        );
        this.context.on("page", (page) => this.observe(page));
        this.context.on("close", () => {
          this.context = undefined;
          this.ids.clear();
          this.releaseProfile();
          this.log("browser.closed", "Profile retained.");
        });
        for (const page of this.context.pages()) this.observe(page);
        this.lastError = undefined;
        this.log("browser.opened", "Persistent FreelanceGrowth profile");
        const page = this.context.pages()[0] || (await this.context.newPage());
        await page
          .goto(this.settings.homepage, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          })
          .catch(() => {
            this.lastError =
              "Homepage unavailable. Start the dashboard, then reopen its shortcut.";
          });
      } catch {
        this.releaseProfile();
        this.lastError =
          "Could not open the dedicated browser. Another process may own its profile, or Chromium needs installation. No Chromium profile locks or cookies were removed.";
        throw new Error(this.lastError);
      }
    })();
    try {
      await this.opening;
    } finally {
      this.opening = undefined;
    }
  }
  private observe(page: Page) {
    if (this.ids.has(page)) return;
    this.ids.set(page, randomUUID());
    page.on("close", () => this.ids.delete(page));
    page.on("download", async (download) => {
      const safe =
        basename(download.suggestedFilename())
          .replace(/[^\w .()-]/g, "_")
          .slice(0, 100) || "download";
      const file = join(
        this.root,
        "downloads",
        `${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`,
      );
      try {
        await download.saveAs(file);
        if (statSync(file).size > this.settings.downloadLimitMB * 1024 * 1024) {
          unlinkSync(file);
          this.log("download.rejected", "File exceeded the configured limit.");
        } else
          this.log("download.saved", "Saved to protected project downloads.");
      } catch {
        this.log("download.failed");
      }
    });
  }
  async open(url: string) {
    const target = permittedBrowserUrl(url, this.settings.homepage);
    await this.launch();
    const existing = this.context!.pages().find((p) => p.url() === target);
    const page = existing || (await this.context!.newPage());
    if (!existing)
      await page
        .goto(target, { waitUntil: "domcontentloaded", timeout: 30000 })
        .catch(() => {
          throw new Error(
            "Website did not load. Check the project browser and finish navigation manually.",
          );
        });
    await page.bringToFront();
    this.log("tab.opened", sanitizedUrl(target));
    return { tabId: this.ids.get(page) };
  }
  page(id: string) {
    const page = [...this.ids].find(
      ([page, key]) => key === id && !page.isClosed(),
    )?.[0];
    if (!page) throw new Error("Browser tab is no longer open.");
    return page;
  }
  async tabs(): Promise<BrowserState> {
    return {
      running: Boolean(this.context),
      profileName: "FreelanceGrowth",
      homepage: this.settings.homepage,
      profilePath: join(this.root, "profile"),
      takeover: this.takeover,
      lastError: this.lastError,
      tabs: await Promise.all(
        [...this.ids]
          .filter(([p]) => !p.isClosed())
          .map(async ([p, id]) => ({
            id,
            title: (await p.title().catch(() => "Browser page")).slice(0, 120),
            url: sanitizedUrl(p.url()),
          })),
      ),
    };
  }
  async focus(id: string) {
    await this.page(id).bringToFront();
  }
  async closeTab(id: string) {
    await this.page(id).close();
    this.log("tab.closed");
  }
  async close() {
    await this.context?.close();
  }
  async capture(id: string) {
    const page = this.page(id);
    if (
      /(?:login|signin|sign-in|oauth|authorize|challenge|captcha|verify|verification|auth\/)/i.test(
        page.url(),
      ) ||
      (await page
        .locator('input[type="password"], input[autocomplete="one-time-code"]')
        .count())
    )
      throw new Error(
        "Screenshots of authentication or verification screens are disabled. Finish manual sign-in first.",
      );
    const file = randomUUID() + ".png";
    await page.screenshot({
      path: join(this.root, "screenshots", file),
      fullPage: false,
    });
    this.screenshots.set(file, join(this.root, "screenshots", file));
    this.log("screenshot.saved", "Stored locally; never sent to AI.");
    return { file };
  }
  screenshotPath(file: string) {
    return this.screenshots.get(file);
  }
  async signals(connectorId: string) {
    const connector = connectors.find((c) => c.id === connectorId);
    if (!connector) throw new Error("Unknown connector.");
    const hostname = new URL(connector.url).hostname.replace(/^www\./, "");
    const pages = [...this.ids.keys()].filter((p) => {
      try {
        return new URL(p.url()).hostname.replace(/^www\./, "") === hostname;
      } catch {
        return false;
      }
    });
    if (!pages.length) return { signal: "not_open" };
    for (const page of pages) {
      const url = page.url();
      if (
        /captcha|challenge|two.factor|checkpoint|verify|verification/i.test(
          url,
        ) ||
        (await page.locator('input[autocomplete="one-time-code"]').count())
      )
        return { signal: "verification_required" };
      if (
        /login|signin|sign-in/i.test(url) ||
        (await page.locator('input[type="password"]').count())
      )
        return { signal: "login_required" };
    }
    // Absence of a login form is never proof of authentication.
    return { signal: "unverified" };
  }
}
