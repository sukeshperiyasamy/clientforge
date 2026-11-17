import { useEffect, useState } from "react";
import { api } from "./api";
import type { State } from "../shared/model";
import type { Campaign, Opportunity, Proposal } from "../shared/acquisition";
export function AcquisitionPage({state}:{state:State}) {
  const [data,setData]=useState<{opportunities:Opportunity[];proposals:Proposal[];campaigns:Campaign[];reminders:any[]}>({opportunities:[],proposals:[],campaigns:[],reminders:[]});
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const [selected,setSelected]=useState<Proposal|null>(null); const [versions,setVersions]=useState<Proposal[]>([]);
  const refresh=async()=>setData(await api("/acquisition"));
  useEffect(()=>{void refresh().catch(e=>setMessage(e.message));},[]);
  async function run(fn:()=>Promise<any>){setBusy(true);setMessage("");try{await fn();await refresh();setMessage("Saved for owner review. No messages or proposals sent.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  const projects=state.projects.filter(p=>p.permission);
  return <section className="panel" style={{padding:24}}>
    <h1>Client acquisition</h1><p>Approved portfolio → campaign → inquiry → proposal review. Imported opportunities remain unverified until reviewed.</p><p role="status">{message}</p>
    <p>{data.opportunities.length} opportunities · {state.leads.length} CRM leads · {data.proposals.filter(p=>!p.approvedHash).length} proposals awaiting review · {data.reminders.length} follow-up reminders</p>
    <h2>Import an opportunity</h2><p>Paste a permitted listing and its description. This does not scrape or visit the URL.</p>
    <details><summary>Import an authorized RSS or Atom export</summary><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>api("/opportunities/import-rss",{source:f.get("source"),xml:f.get("xml"),service:f.get("service"),authorized:f.get("authorized")==="on"}));}}><label>Source name<input name="source" required/></label><label>Service<select name="service">{["web","mobile","data","design","ai","automation"].map(s=><option key={s}>{s}</option>)}</select></label><label>Feed XML<textarea name="xml" rows={6} required/></label><label><input type="checkbox" name="authorized" required/>I am authorized to import this feed</label><button disabled={busy}>Import feed for review</button></form></details>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>api("/opportunities",Object.fromEntries(f)));}}>
      <label>Title<input name="title" required minLength={3}/></label><label>Source<input name="source" required placeholder="Owner supplied listing"/></label><label>Original URL<input name="url" type="url" required/></label>
      <label>Service<select name="service">{["web","mobile","data","design","ai","automation"].map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Requirements<textarea name="description" minLength={10} required rows={5}/></label><label>Budget if supplied<input name="budget"/></label><label>Deadline if supplied<input name="deadline"/></label><label>Country if supplied<input name="country"/></label><button disabled={busy}>Import for review</button>
    </form>
    {data.opportunities.map(o=><article key={o.id} style={{padding:"16px 0",borderBottom:"1px solid #ddd"}}><h3>{o.title}</h3><p>{o.score}/100 provisional relevance · {o.status}</p><p>{o.reasons.join(" ")}</p><a href={o.url} target="_blank" rel="noreferrer">Open original listing</a>{" "}<button disabled={busy} onClick={()=>void run(()=>api(`/opportunities/${o.id}/status`,{status:"saved"},"PUT"))}>Save</button>{" "}<button disabled={busy} onClick={()=>void run(()=>api(`/opportunities/${o.id}/status`,{status:"rejected"},"PUT"))}>Reject</button></article>)}
    <h2>Generate a portfolio-grounded proposal</h2>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const [kind,id]=String(f.get("source")).split(":");void run(()=>api("/proposals",{[kind]:id,projectIds:f.getAll("projectIds")}));}}>
      <label>Client inquiry or opportunity<select name="source" required><option value="">Select source</option>{state.leads.map(l=><option key={l.id} value={`leadId:${l.id}`}>{l.name} — {l.description.slice(0,70)}</option>)}{data.opportunities.map(o=><option key={o.id} value={`opportunityId:${o.id}`}>{o.title}</option>)}</select></label>
      <fieldset><legend>Verified portfolio evidence</legend>{projects.map(p=><label key={p.id}><input type="checkbox" name="projectIds" value={p.id}/>{p.title}{p.demo ? " (demo)" : ""}</label>)}</fieldset><button disabled={busy || !projects.length}>Generate proposal draft</button>
    </form>
    <h2>Proposal queue</h2>{data.proposals.map(p=><p key={p.id}>Version {p.version} · {p.approvedHash ? "Reviewed" : "Needs review"} <button disabled={busy} onClick={()=>{setSelected(p);void api(`/proposals/${p.id}/versions`).then(setVersions).catch(e=>setMessage(e.message));}}>Edit and preview</button></p>)}
    {selected && <form key={selected.id+selected.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const saved=await api(`/proposals/${selected.id}`,Object.fromEntries(f),"PUT");setSelected(saved);setVersions(await api(`/proposals/${selected.id}/versions`));});}}>
      <h3>Edit proposal version {selected.version}</h3><p>History: {versions.map(v=>`v${v.version}`).join(", ")}. Saving changes removes approval.</p>
      {(["short","detailed","scope","deliverables","pricingAssumptions","questions","followUp"] as const).map(key=><label key={key}>{key}<textarea name={key} defaultValue={selected[key]} rows={key==="detailed"?10:4}/></label>)}
      <button disabled={busy}>Save new revision</button>{" "}<button type="button" disabled={busy} onClick={()=>void run(async()=>setSelected(await api(`/proposals/${selected.id}/approve`,{})))}>Approve saved revision</button><h3>Saved preview</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{selected.detailed}</pre>
    </form>}
    <h2>Follow-up reminders</h2><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>api("/reminders",{leadId:f.get("leadId"),note:f.get("note"),dueAt:new Date(String(f.get("dueAt"))).toISOString()}));}}>
      <label>CRM lead<select name="leadId" required>{state.leads.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Due time in your local timezone<input type="datetime-local" name="dueAt" required/></label><label>Next action<input name="note" required/></label><button disabled={busy || !state.leads.length}>Save reminder</button>
    </form>{data.reminders.map(r=><p key={r.id}>{r.dueAt} · {r.note}</p>)}
    <h2>Campaign account assignments</h2>
    <p>Use Content studio to generate platform-specific posts. Create a tracked draft per account below, edit and approve it in Content studio, then schedule its approved version. Campaign preferences never bypass approval.</p>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>api(`/campaigns/${f.get("campaignId")}/posts`,{postId:f.get("postId"),accountId:f.get("accountId")}));}}>
      <label>Campaign<select name="campaignId" required>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Source post<select name="postId" required>{state.posts.map(p=><option key={p.id} value={p.id}>{p.title} · {p.platform}</option>)}</select></label>
      <label>Destination account<select name="accountId" required>{state.accounts.filter(a=>!a.disabled).map(a=><option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</select></label>
      <button disabled={busy || !data.campaigns.length}>Create tracked draft for review</button>
    </form>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>api("/campaigns",{name:f.get("name"),service:f.get("service"),audience:f.get("audience"),countries:String(f.get("countries")).split(",").map(s=>s.trim()).filter(Boolean),projectId:f.get("projectId"),accountIds:f.getAll("accountIds"),frequency:f.get("frequency"),timezone:f.get("timezone"),destination:f.get("destination"),utmCampaign:f.get("utmCampaign")}));}}>
      <label>Name<input name="name" required/></label><label>Service<select name="service">{["web","mobile","data","design","ai","automation"].map(s=><option key={s}>{s}</option>)}</select></label><label>Target audience<input name="audience" required minLength={3}/></label><label>Target countries separated by commas<input name="countries"/></label>
      <label>Portfolio project<select name="projectId" required>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
      <fieldset><legend>Eligible accounts</legend>{state.accounts.filter(a=>!a.disabled).map(a=><label key={a.id}><input name="accountIds" type="checkbox" value={a.id}/>{a.name} · {a.platform}</label>)}</fieldset>
      <label>Frequency plan<select name="frequency"><option>manual</option><option>daily</option><option>weekly</option></select></label><p>Frequency is a planning preference. Posts are explicitly reviewed and scheduled below; no automatic recurring publication is enabled.</p>
      <label>Timezone<input name="timezone" defaultValue="UTC" required/></label><label>Portfolio destination<input name="destination" type="url" required/></label><label>UTM campaign identifier<input name="utmCampaign" required pattern="[a-zA-Z0-9_-]+"/></label><button disabled={busy}>Save campaign</button>
    </form>
    {data.campaigns.map(c=><article key={c.id}><h3>{c.name}</h3><p>{c.countries.join(", ")} · {c.timezone} · Owner review required</p><p>Destination: {c.destination} · UTM {c.utmCampaign}</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>api(`/campaigns/${c.id}/schedule`,{postId:f.get("postId"),accountId:f.get("accountId"),localTime:String(f.get("scheduledAt"))}));}}><label>Approved post<select name="postId" required>{state.posts.filter(p=>p.projectId===c.projectId&&p.status==="approved").map(p=><option key={p.id} value={p.id}>{p.title} · {p.platform}</option>)}</select></label><label>Assigned account<select name="accountId" required>{state.accounts.filter(a=>c.accountIds.includes(a.id)&&!a.disabled).map(a=><option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}</select></label><label>Publication time in campaign timezone<input name="scheduledAt" type="datetime-local" required/></label><button disabled={busy}>Schedule reviewed post</button></form></article>)}
  </section>;
}
