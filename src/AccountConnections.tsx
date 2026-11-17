import { useEffect, useState } from "react";
import { api } from "./api";
import type { Account } from "../shared/model";
import type { AccountPolicy } from "../server/account-policies";
type Row = Account & { policy: AccountPolicy; health: string; authMethod: string; tokenExpiry: null };
export function AccountConnections() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => setRows(await api("/account-connections"));
  useEffect(() => { void refresh().catch(e => setMessage(e.message)); }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); await refresh(); setMessage("Account records updated."); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" style={{ padding: 20, marginBottom: 24 }}>
    <h2>Independent publishing accounts</h2>
    <p>Connect additional accounts in Postiz, then sync. Local controls apply to each account separately. OAuth identity connections below still use one account per platform.</p>
    <button disabled={busy} onClick={() => void run(() => api("/accounts/sync", {}))}>Sync accounts from Postiz</button>
    <p role="status">{message}</p>
    {!rows.length && <p>No provider accounts synced. Configure Postiz and link your accounts first.</p>}
    {rows.map(row => <form key={row.id + JSON.stringify(row.policy)} style={{ borderTop: "1px solid #ddd", padding: "16px 0" }} onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const disabled = f.get("disabled") === "on";
      if (disabled && !window.confirm("Disable this account and cancel its queued local posts? Submitted posts remain in Postiz.")) return;
      void run(() => api(`/account-connections/${encodeURIComponent(row.id)}`, {
        workspace: f.get("workspace"), timezone: f.get("timezone"), dailyLimit: Number(f.get("dailyLimit")),
        disabled, publishingEnabled: f.get("publishingEnabled") === "on", mode: f.get("mode"),
        isDefault: f.get("isDefault") === "on",
      }, "PUT"));
    }}>
      <h3>{row.name} · {row.platform}</h3>
      <p>{row.health} · Last verification {row.syncedAt} · Token expiry managed by Postiz</p>
      <p>Account ID: {row.id} · Permission: reviewed publication through supported adapters</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label>Workspace <input name="workspace" defaultValue={row.policy.workspace} required maxLength={100}/></label>
        <label>Timezone <input name="timezone" defaultValue={row.policy.timezone} required/></label>
        <label>Daily limit <input name="dailyLimit" type="number" min={1} max={5} defaultValue={row.policy.dailyLimit}/></label>
        <label>Mode <select name="mode" defaultValue={row.policy.mode}><option value="approval">Approved API content</option><option value="manual">Manual</option></select></label>
        <label><input name="disabled" type="checkbox" defaultChecked={row.policy.disabled}/>Disabled</label>
        <label><input name="publishingEnabled" type="checkbox" defaultChecked={row.policy.publishingEnabled}/>Publishing allowed</label>
        <label><input name="isDefault" type="checkbox" defaultChecked={row.policy.isDefault}/>Default for platform</label>
      </div>
      <button disabled={busy} type="submit">Save account settings</button>{" "}
      <button disabled={busy} type="button" onClick={() => void run(() => api(`/account-connections/${encodeURIComponent(row.id)}/test`, {}))}>Test connection</button>
    </form>)}
  </section>;
}
