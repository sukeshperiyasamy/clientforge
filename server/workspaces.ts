import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store, HttpError } from "./store.ts";
import type { Vault } from "./security.ts";
import { PostizProvider } from "./postiz.ts";
import type { Job } from "../shared/model.ts";
import { syncProviderAccounts } from "./account-policies.ts";
export type Workspace = { id: string; name: string; url: string; disabled: boolean };
export class Workspaces {
  constructor(public store: Store, public vault: Vault, public legacy = new PostizProvider()) {}
  list() { return this.store.all<Workspace>("publishing_workspaces"); }
  disable(id: string, disabled: boolean) {
    return this.store.transaction(() => {
      const w=this.store.require<Workspace>("publishing_workspaces",id);
      this.store.put("publishing_workspaces",{...w,disabled});
      if(disabled) for(const job of this.store.all<Job>("jobs").filter(j=>j.workspaceId===id&&j.status==="scheduled"))
        this.store.put("jobs",{...job,status:"cancelled",error:"Publishing workspace disabled locally."});
      this.store.audit("workspace.state_changed",id,disabled ? "disabled" : "enabled");
      return {...w,disabled};
    });
  }
  add(input: unknown) {
    const value = z.object({ name: z.string().trim().min(1).max(100), url: z.url(), key: z.string().min(10).max(4096) }).parse(input);
    const url = new URL(value.url);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
      throw new HttpError(400, "Use HTTPS or a loopback HTTP Postiz API URL without embedded credentials.");
    return this.store.transaction(() => {
      const id = randomUUID();
      this.vault.set(`workspace:${id}`, { key: value.key });
      const record = this.store.put("publishing_workspaces", { id, name: value.name, url: value.url.replace(/\/$/, ""), disabled: false });
      this.store.audit("workspace.created", id);
      return record;
    });
  }
  client(id?: string) {
    if (!id) return this.legacy;
    const w = this.store.require<Workspace>("publishing_workspaces", id);
    if (w.disabled) throw new HttpError(400, "Publishing workspace disabled.");
    const key = this.vault.get<{ key: string }>(`workspace:${id}`)?.key;
    if (!key) throw new HttpError(400, "Workspace credentials unavailable.");
    return new PostizProvider({ id, key, url: w.url });
  }
  forJob(job: Job) { return this.client(job.workspaceId); }
  async sync(id: string) {
    const accounts = await this.client(id).accounts();
    syncProviderAccounts(this.store, accounts, id);
    return accounts;
  }
}
