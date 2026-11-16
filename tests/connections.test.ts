import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../server/store.ts";
import { OwnerAuth, Vault, projectVaultDirectory } from "../server/security.ts";
import { Connections, type Tokens } from "../server/connections.ts";
import { BrowserClient } from "../server/browser/client.ts";
import { connectors } from "../shared/connectors.ts";
import {
  permittedBrowserUrl,
  sanitizedUrl,
} from "../server/browser/manager.ts";
import { PostizProvider, ProviderError } from "../server/postiz.ts";

const root = mkdtempSync(join(tmpdir(), "freelancegrowth-security-"));
const securityDir = join(root, "security");
class FakeBrowser extends BrowserClient {
  opened: string[] = [];
  override async open(url: string) {
    this.opened.push(url);
    return { tabId: "test-tab" };
  }
  override async request<T = any>() {
    return { signal: "unverified" } as T;
  }
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function fixture() {
  const store = new Store(":memory:");
  const vault = new Vault(store, securityDir);
  const browser = new FakeBrowser();
  return { store, vault, browser };
}
test("all requested platforms exist exactly once and manual entries have no enabled API actions", () => {
  const ids = [
    "linkedin",
    "facebook",
    "instagram",
    "threads",
    "x",
    "bluesky",
    "mastodon",
    "youtube",
    "tiktok",
    "pinterest",
    "telegram",
    "discord",
    "upwork",
    "fiverr",
    "freelancer",
    "peopleperhour",
    "guru",
    "contra",
    "toptal",
    "github",
    "gitlab",
    "devto",
    "hashnode",
    "medium",
    "behance",
    "dribbble",
    "codepen",
    "huggingface",
    "reddit",
    "quora",
    "indiehackers",
    "hackernews",
    "producthunt",
    "stackoverflow",
    "buffer",
    "wordpress",
    "substack",
    "ghost",
    "googlebusiness",
    "gmail",
    "outlook",
    "hubspot",
    "googlesheets",
  ];
  assert.equal(connectors.length, ids.length);
  assert.equal(new Set(connectors.map((c) => c.id)).size, ids.length);
  for (const id of ids)
    assert(
      connectors.some((c) => c.id === id),
      id,
    );
  for (const c of connectors.filter((c) => c.adapter === "manual"))
    assert.deepEqual(c.actions, ["Open website", "Prepare manual content"]);
});
test("vault ciphertext survives reload and cannot be substituted between connectors", () => {
  const { store, vault } = fixture();
  const secret = "synthetic-token-for-encryption-test";
  vault.set("tokens:github", { accessToken: secret });
  const raw = store.require<any>("vault", "tokens:github");
  assert(!JSON.stringify(raw).includes(secret));
  assert.equal(
    new Vault(store, securityDir).get<Tokens>("tokens:github")?.accessToken,
    secret,
  );
  store.put("vault", { ...raw, id: "tokens:buffer" });
  assert.throws(() => vault.get("tokens:buffer"));
  assert(
    !readFileSync(
      join(
        securityDir,
        process.platform === "win32" ? "vault-key.dpapi" : "vault-key.bin",
      ),
    ).includes(Buffer.from(secret)),
  );
  store.close();
});
test("vault key migrates from legacy storage without changing ciphertext or touching the original key", () => {
  const store = new Store(":memory:");
  const legacy = join(root, "legacy-vault");
  const old = new Vault(store, legacy);
  old.set("tokens:github", { accessToken: "synthetic-migration-token" });
  const ciphertext = store.require<any>("vault", "tokens:github");
  const keyName =
    process.platform === "win32" ? "vault-key.dpapi" : "vault-key.bin";
  const envelope = readFileSync(join(legacy, keyName));
  const destination = join(root, "migrated-vault");
  const migrated = new Vault(store, destination, legacy);
  assert.equal(
    migrated.get<Tokens>("tokens:github")?.accessToken,
    "synthetic-migration-token",
  );
  assert.deepEqual(store.require("vault", "tokens:github"), ciphertext);
  assert.deepEqual(readFileSync(join(destination, keyName)), envelope);
  assert.deepEqual(readFileSync(join(legacy, keyName)), envelope);
  assert(
    !projectVaultDirectory("C:/workspace/data").startsWith("C:/workspace"),
  );
  store.close();
});
test("missing vault key never silently replaces encryption for existing records", () => {
  const store = new Store(":memory:");
  store.put("vault", { id: "tokens:github", encrypted: "fixture" });
  const location = join(root, "missing-key");
  assert.throws(() => new Vault(store, location), /no replacement key/);
  assert.equal(
    existsSync(
      join(
        location,
        process.platform === "win32" ? "vault-key.dpapi" : "vault-key.bin",
      ),
    ),
    false,
  );
  store.close();
});
test("owner password is hashed and owner sessions recover after backend restart", () => {
  const db = join(root, "owner.sqlite");
  let store = new Store(db);
  let auth = new OwnerAuth(store);
  const password = "synthetic-owner-passphrase";
  auth.setup(password);
  assert(!JSON.stringify(store.all("auth_owner")).includes(password));
  const login = auth.login(password, "fixture");
  store.close();
  store = new Store(db);
  auth = new OwnerAuth(store);
  const request = {
    get: (name: string) =>
      name === "cookie"
        ? `fg_session=${login.token}`
        : name === "x-csrf-token"
          ? login.session.csrf
          : undefined,
  } as any;
  assert.equal(auth.require(request).id, login.session.id);
  assert.throws(
    () => auth.login("wrong-but-long-password", "fixture"),
    /Invalid dashboard/,
  );
  store.close();
});
test("manual browser signal never proves an authenticated account", async () => {
  const { store, vault, browser } = fixture();
  const service = new Connections(store, vault, browser);
  const record = await service.check("upwork");
  assert.equal(record.status, "Manual Only");
  assert.equal(record.lastAuth, null);
  assert.equal(record.checkedVia?.includes("no credentials read"), true);
  store.close();
});
test("GitHub connection is only verified after authenticated identity API success", async () => {
  const { store, vault, browser } = fixture();
  vault.set("tokens:github", { accessToken: "synthetic-fixture-token" });
  let checked = false;
  const service = new Connections(
    store,
    vault,
    browser,
    new PostizProvider(),
    (async (url, options) => {
      assert.equal(url, "https://api.github.com/user");
      assert.equal(
        (options?.headers as any).Authorization,
        "Bearer synthetic-fixture-token",
      );
      checked = true;
      return response({ id: 42, login: "fixture-user" });
    }) as typeof fetch,
  );
  assert.equal(service.record("github").status, "Not Connected");
  const record = await service.check("github");
  assert(checked);
  assert.equal(record.status, "Connected");
  assert.equal(record.accountName, "fixture-user");
  assert(record.lastAuth);
  store.close();
});
test("expired identity credentials create an auth notification and are not Connected", async () => {
  const { store, vault, browser } = fixture();
  vault.set("tokens:github", { accessToken: "fixture-expired" });
  const service = new Connections(
    store,
    vault,
    browser,
    new PostizProvider(),
    (async () => response({ message: "bad credentials" }, 401)) as typeof fetch,
  );
  assert.equal((await service.check("github")).status, "Expired");
  assert.equal(store.all("notifications").length, 1);
  await service.check("github");
  assert.equal(store.all("notifications").length, 1);
  store.close();
});
test("Buffer GraphQL errors cannot fabricate a successful connection", async () => {
  const { store, vault, browser } = fixture();
  const service = new Connections(
    store,
    vault,
    browser,
    new PostizProvider(),
    (async () =>
      response({ errors: [{ message: "No API access" }] })) as typeof fetch,
  );
  const record = await service.setBufferKey("synthetic-buffer-key");
  assert.equal(record.status, "Verification Required");
  assert.equal(record.lastAuth, null);
  store.close();
});
test("OAuth works across the dedicated browser and survives backend recreation; replay and wrong browser fail", async () => {
  const db = join(root, "oauth.sqlite");
  let store = new Store(db);
  let vault = new Vault(store, securityDir);
  const browser = new FakeBrowser();
  const auth = new OwnerAuth(store);
  auth.setup("synthetic-oauth-passphrase");
  const login = auth.login("synthetic-oauth-passphrase", "oauth-fixture");
  const before = {
    id: process.env.GITHUB_CLIENT_ID,
    secret: process.env.GITHUB_CLIENT_SECRET,
  };
  process.env.GITHUB_CLIENT_ID = "fixture-client";
  process.env.GITHUB_CLIENT_SECRET = "fixture-secret";
  const network = (async (url, options) => {
    if (String(url).includes("access_token")) {
      assert((options?.body as URLSearchParams).get("code_verifier"));
      return response({ access_token: "synthetic-oauth-token" });
    }
    return response({ id: 42, login: "fixture-oauth-user" });
  }) as typeof fetch;
  try {
    let service = new Connections(
      store,
      vault,
      browser,
      new PostizProvider(),
      network,
    );
    await service.connect("github", login.session.id, "http://localhost:3000");
    const link = new URL(browser.opened[0]);
    assert.equal(link.pathname, "/auth/github/start");
    const start = service.startOAuth(
      "github",
      link.searchParams.get("ticket")!,
    );
    assert.throws(
      () => service.startOAuth("github", link.searchParams.get("ticket")!),
      /expired/,
    );
    const authUrl = new URL(start.url);
    assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authUrl.searchParams.get("scope"), "");
    const state = authUrl.searchParams.get("state")!;
    await assert.rejects(
      () => service.callback("github", "wrong-browser", state, "fixture-code"),
      /invalid/,
    );
    store.close();
    store = new Store(db);
    vault = new Vault(store, securityDir);
    service = new Connections(
      store,
      vault,
      browser,
      new PostizProvider(),
      network,
    );
    assert.equal(
      (await service.callback("github", start.binding, state, "fixture-code"))
        .status,
      "Connected",
    );
    await assert.rejects(
      () => service.callback("github", start.binding, state, "fixture-code"),
      /invalid/,
    );
    assert(
      !JSON.stringify(store.all("vault")).includes("synthetic-oauth-token"),
    );
  } finally {
    store.close();
    for (const [key, value] of [
      ["GITHUB_CLIENT_ID", before.id],
      ["GITHUB_CLIENT_SECRET", before.secret],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  }
});
test("disconnect during verification cannot resurrect an account", async () => {
  const { store, vault, browser } = fixture();
  vault.set("tokens:buffer", { accessToken: "synthetic-token" });
  let finish!: (r: Response) => void;
  const waiting = new Promise<Response>((resolve) => (finish = resolve));
  const service = new Connections(
    store,
    vault,
    browser,
    new PostizProvider(),
    (() => waiting) as typeof fetch,
  );
  const checking = service.check("buffer");
  await new Promise((resolve) => setImmediate(resolve));
  await service.disconnect("buffer");
  finish(
    response({ data: { account: { organizations: [{ id: "fixture-org" }] } } }),
  );
  const result = await checking;
  assert.equal(result.status, "Not Connected");
  assert(result.disabled);
  assert.equal(vault.get("tokens:buffer"), undefined);
  store.close();
});
test("provider authorization errors are classified as expired rather than connected", async () => {
  const { store, vault, browser } = fixture();
  class ExpiredProvider extends PostizProvider {
    override async accounts(): Promise<never> {
      throw new ProviderError("Unauthorized", false, false, 401);
    }
  }
  const service = new Connections(store, vault, browser, new ExpiredProvider());
  const record = await service.check("linkedin");
  assert.equal(record.status, "Expired");
  assert.equal(record.lastAuth, null);
  store.close();
});
test("browser launch URLs are allowlisted and logs strip query/fragment credentials", () => {
  assert.equal(
    permittedBrowserUrl(
      "https://github.com/login",
      "http://localhost:3000/connections",
    ),
    "https://github.com/login",
  );
  assert.throws(() =>
    permittedBrowserUrl("file:///C:/Users/private", "http://localhost:3000"),
  );
  assert.throws(() =>
    permittedBrowserUrl(
      "https://unregistered.example/",
      "http://localhost:3000",
    ),
  );
  assert.throws(() =>
    permittedBrowserUrl(
      "https://user:secret@github.com/",
      "http://localhost:3000",
    ),
  );
  assert.equal(
    sanitizedUrl("https://github.com/callback?code=private#token"),
    "https://github.com/callback",
  );
});
