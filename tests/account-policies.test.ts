import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { createApp, errorHandler } from "../server/app.ts";
import { PostizProvider } from "../server/postiz.ts";
import { policyFor, updateAccountPolicy, syncProviderAccounts, assertAccountAllowed } from "../server/account-policies.ts";

const accounts = ["one", "two"].map(id => ({ id, name: id, platform: "linkedin", disabled: false, syncedAt: new Date().toISOString() }));
test("account disable cancels only its future jobs and survives provider sync and restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "cf-accounts-"));
  const path = join(dir, "test.sqlite");
  let s = new Store(path);
  try {
    syncProviderAccounts(s, accounts);
    for (const [id, accountId, status] of [["a", "one", "scheduled"], ["b", "two", "scheduled"], ["c", "one", "submitted"]])
      s.put("jobs", { id, accountId, status });
    updateAccountPolicy(s, "one", { disabled: true });
    assert.equal(s.require<any>("jobs", "a").status, "cancelled");
    assert.equal(s.require<any>("jobs", "b").status, "scheduled");
    assert.equal(s.require<any>("jobs", "c").status, "submitted");
    syncProviderAccounts(s, accounts);
    assert.throws(() => assertAccountAllowed(s, "one"));
    assert.doesNotThrow(() => assertAccountAllowed(s, "two"));
    s.close(); s = new Store(path);
    assert.equal(policyFor(s, "one").disabled, true);
    assert.throws(() => assertAccountAllowed(s, "one"));
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("defaults are unique per platform and invalid account policies are rejected atomically", () => {
  const s = new Store(":memory:");
  try {
    syncProviderAccounts(s, accounts);
    updateAccountPolicy(s, "one", { isDefault: true });
    updateAccountPolicy(s, "two", { isDefault: true, timezone: "America/New_York" });
    assert.equal(policyFor(s, "one").isDefault, false);
    assert.equal(policyFor(s, "two").isDefault, true);
    assert.throws(() => updateAccountPolicy(s, "two", { isDefault: true, disabled: true }));
    assert.equal(policyFor(s, "two").disabled, false);
    assert.throws(() => updateAccountPolicy(s, "one", { timezone: "invalid" }));
    assert.throws(() => updateAccountPolicy(s, "one", { dailyLimit: 100 }));
    syncProviderAccounts(s, [accounts[0]]);
    assert.throws(() => assertAccountAllowed(s, "two"));
  } finally { s.close(); }
});
test("account API requires owner authentication and CSRF and persists policy edits", async () => {
  const s = new Store(":memory:");
  syncProviderAccounts(s, accounts);
  class Fake extends PostizProvider { override async accounts() { return accounts; } }
  const app = createApp(s, new Fake()); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    assert.equal((await fetch(url + "/api/account-connections")).status, 401);
    const login = await fetch(url + "/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "synthetic-account-test-password" }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const session = await login.json() as any;
    const path = url + "/api/account-connections/one";
    assert.equal((await fetch(path, { method: "PUT", headers: { cookie, "Content-Type": "application/json" }, body: "{}" })).status, 401);
    const response = await fetch(path, { method: "PUT", headers: { cookie, "Content-Type": "application/json", "x-csrf-token": session.csrf }, body: JSON.stringify({ disabled: true }) });
    assert.equal(response.status, 200);
    assert.equal(policyFor(s, "one").disabled, true);
    assert.equal(policyFor(s, "two").disabled, false);
  } finally { await new Promise<void>(r => server.close(() => r())); s.close(); }
});
