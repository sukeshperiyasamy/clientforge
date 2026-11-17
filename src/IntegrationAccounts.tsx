import { useEffect, useState } from "react";
import { api } from "./api";
import type { ConnectionRecord } from "../shared/connectors";
type Workspace = { id: string; name: string; url: string; disabled:boolean };
export function IntegrationAccounts() {
  const [slots, setSlots] = useState<(ConnectionRecord & {expiresAt:number|null;scopes:string})[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const [connections, w] = await Promise.all([api("/connections"), api("/publishing-workspaces")]);
    setSlots(connections.slots); setWorkspaces(w);
  }
  useEffect(() => { void refresh().catch(e => setMessage(e.message)); }, []);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    try { const r = await fn(); await refresh(); setMessage(r?.nextAction || r?.message || "Saved."); }
    catch(e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel" style={{ padding: 20, marginBottom: 24 }}>
    <h2>Independent API connections</h2>
    <p>GitHub and YouTube verify identity only. Buffer verifies workspace access. Reconnect retains the original provider identity; add another slot for a different account.</p>
    <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => api("/connection-slots", { platform: f.get("platform"), label: f.get("label") })); }}>
      <label>Platform <select name="platform" aria-label="Account platform"><option>github</option><option>youtube</option><option>buffer</option></select></label>{" "}
      <label>Connection name <input name="label" required maxLength={100}/></label>{" "}<button disabled={busy}>Add account slot</button>
    </form>
    <p role="status">{message}</p>
    {slots.map(s => <div key={s.id} style={{ padding: "12px 0", borderTop: "1px solid #ddd", overflowWrap: "anywhere" }}>
      <strong>{s.label} · {s.platform}</strong><p>{s.accountName || "Unverified"} · {s.status}</p>
      <p>Connection {s.id} · Scopes: {s.scopes || "No additional scopes reported"} · Expiry: {s.expiresAt ? new Date(s.expiresAt).toLocaleString() : "Not reported"}</p>
      <p>{s.nextAction}</p>
      <button disabled={busy} onClick={() => void run(() => api(`/connections/${s.id}/connect`, {}))}>Reconnect {s.label}</button>{" "}
      <button disabled={busy} onClick={() => void run(() => api(`/connections/${s.id}/test`, {}))}>Verify {s.label}</button>{" "}
      <button disabled={busy} onClick={() => { if(window.confirm("Disconnect only this local connection? Provider revocation may require manual action.")) void run(() => api(`/connections/${s.id}/disconnect`, { confirm: true })); }}>Disconnect {s.label}</button>
      {s.platform === "buffer" && <form onSubmit={e => { e.preventDefault(); const f=new FormData(e.currentTarget); const key=f.get("key"); e.currentTarget.reset(); void run(() => api(`/connection-slots/${s.id}/key`, { key })); }}>
        <label>Buffer API key <input name="key" type="password" required autoComplete="off"/></label><button disabled={busy}>Save encrypted key and verify</button>
      </form>}
    </div>)}
    <h2>Publishing workspaces</h2>
    <p>The original environment-configured Postiz workspace keeps its existing account IDs and publication history. New workspaces have separate encrypted keys and account identities.</p>
    <form onSubmit={e => { e.preventDefault(); const f=new FormData(e.currentTarget); const body={ name:f.get("name"), url:f.get("url"), key:f.get("key") }; e.currentTarget.reset(); void run(() => api("/publishing-workspaces", body)); }}>
      <label>Workspace name <input name="name" required/></label>{" "}
      <label>Postiz API URL <input name="url" type="url" placeholder="https://api.postiz.com/public/v1" required/></label>{" "}
      <label>Workspace API key <input name="key" type="password" required autoComplete="off"/></label>{" "}
      <button disabled={busy}>Save publishing workspace</button>
    </form>
    {workspaces.map(w => <p key={w.id}>{w.name} · {w.disabled ? "Disabled" : "Enabled"} <button disabled={busy || w.disabled} onClick={() => void run(() => api(`/publishing-workspaces/${w.id}/sync`, {}))}>Verify and sync {w.name}</button>{" "}<button disabled={busy} onClick={()=>{if(window.confirm(w.disabled ? "Enable this workspace? Cancelled jobs stay cancelled." : "Disable this workspace and cancel queued local jobs? Submitted history is retained.")) void run(()=>api(`/publishing-workspaces/${w.id}`,{disabled:!w.disabled,confirm:true},"PUT"));}}>{w.disabled ? "Enable" : "Disable"} {w.name}</button></p>)}
  </section>;
}
