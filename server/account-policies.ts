import { z } from "zod";
import { Store, HttpError } from "./store.ts";
import type { Account, Job } from "../shared/model.ts";
import { platforms } from "../shared/model.ts";

export const accountPolicySchema = z.object({
  workspace: z.string().trim().max(100).default("Owner"),
  timezone: z.string().max(100).refine(v => {
    try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; }
  }, "Invalid timezone").default("UTC"),
  disabled: z.boolean().default(false),
  publishingEnabled: z.boolean().default(true),
  mode: z.enum(["approval", "manual"]).default("approval"),
  dailyLimit: z.number().int().min(1).max(5).default(5),
  isDefault: z.boolean().default(false),
});
export type AccountPolicy = z.infer<typeof accountPolicySchema> & { id: string };
export function policyFor(store: Store, id: string): AccountPolicy {
  return store.get<AccountPolicy>("account_policies", id) || { id, ...accountPolicySchema.parse({}) };
}
export function assertAccountAllowed(store: Store, id: string) {
  const account = store.require<Account>("accounts", id);
  const p = policyFor(store, id);
  if (account.disabled || p.disabled || !p.publishingEnabled || p.mode === "manual")
    throw new HttpError(400, "This account is disabled or manual-only. Review its account permissions.");
}
export function updateAccountPolicy(store: Store, id: string, input: unknown) {
  const account = store.require<Account>("accounts", id);
  const p = accountPolicySchema.parse(input);
  return store.transaction(() => {
    if (p.isDefault && (p.disabled || !p.publishingEnabled || p.mode === "manual" || account.disabled))
      throw new HttpError(400, "Choose an active publishing account as default.");
    if (p.isDefault) for (const other of store.all<Account>("accounts")) {
      if (other.platform === account.platform && other.id !== id)
        store.put("account_policies", { ...policyFor(store, other.id), isDefault: false });
    }
    const saved = store.put("account_policies", { ...p, id });
    if (p.disabled || !p.publishingEnabled || p.mode === "manual") {
      for (const job of store.all<Job>("jobs")) if (job.accountId === id && job.status === "scheduled")
        store.put("jobs", { ...job, status: "cancelled", error: "Account publishing disabled locally." });
    }
    store.audit("account.policy_updated", id, "Local account permissions updated; provider authorization unchanged.");
    return saved;
  });
}
export function syncProviderAccounts(store: Store, accounts: Account[]) {
  store.transaction(() => {
    for (const old of store.all<Account>("accounts")) store.put("accounts", { ...old, disabled: true });
    for (const account of accounts) store.put("accounts", account);
    store.audit("accounts.synced", "", `${accounts.length} provider accounts`);
  });
}
export function accountViews(store: Store) {
  return store.all<Account>("accounts").map(a => ({ ...a, policy: policyFor(store, a.id),
    authMethod: "Postiz provider-managed", permissions: platforms.some(p => p.id === a.platform && p.mode === "auto") ? ["approved_publication_via_provider"] : [],
    tokenExpiry: null, health: a.disabled ? "Unavailable" : "Provider verified at last sync",
    activity: store.all<{ entityId: string }>("audit").filter(e => e.entityId === a.id).slice(0, 20),
  }));
}
