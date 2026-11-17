import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../server/store.ts";
import { Acquisition } from "../server/acquisition.ts";
import { createPublicSite } from "../server/public-site.ts";
import { approve, schedule, now, editPost } from "../server/domain.ts";
import { Worker } from "../server/worker.ts";
import { PostizProvider } from "../server/postiz.ts";
import { config } from "../server/config.ts";
import { projectSchema, settingsSchema, type Post, type Generation, type Job, type Lead } from "../shared/model.ts";
import { chromium } from "playwright";
import { RssImportSource } from "../server/opportunity-sources.ts";
import { createApp, errorHandler } from "../server/app.ts";
const output={short:"A draft based on the selected demo.",detailed:"Proposed review and implementation of your requirements. Demo evidence only.",scope:"Confirm requirements first.",deliverables:"Implementation and documentation subject to scope.",pricingAssumptions:"Budget and timeline require discussion; no commitment.",questions:"What is the acceptance criteria?",followUp:"Would you like to clarify the scope?"};
function fixture() {
  const store=new Store(":memory:");
  const project=store.put("projects",{...projectSchema.parse({title:"Verified demo website",service:"web",problem:"A business needs a clear contact workflow.",solution:"A demo site with an inquiry form.",permission:true}),id:randomUUID(),createdAt:now(),updatedAt:now()});
  return {store,project};
}
test("mocked acquisition pipeline publishes approved work, captures attributed inquiry and stores editable proposal revisions",async()=>{
  const {store,project}=fixture();
  let submissions=0;
  class Fake extends PostizProvider {
    override async accounts(){return [{id:"test-account",name:"Fixture",platform:"linkedin",disabled:false,syncedAt:now()}];}
    override async publish(){submissions++;return "fixture-post";}
    override async reconcile(){return {status:"published" as const,remoteId:"fixture-post",publishedAt:now(),publishedUrl:"https://example.com/mock-post"};}
  }
  const provider=new Fake();store.put("accounts",(await provider.accounts())[0]);
  const generation:Generation={id:randomUUID(),projectId:project.id,platforms:["linkedin"],status:"queued",error:null,createdAt:now()};
  const worker=new Worker(store,provider,async()=>({posts:[{platform:"linkedin",title:"Demo project",content:"A demonstration of a clear business inquiry workflow."}]}));
  const previous=config.publishingEnabled;config.publishingEnabled=true;store.put("settings",{id:"owner",...settingsSchema.parse({paused:false})});
  const server=createPublicSite(store,"http://localhost:3001").listen(0,"127.0.0.1"); await new Promise<void>(r=>server.once("listening",r));
  const url=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    await worker.content(generation); const post=store.all<Post>("posts")[0]; approve(store,post.id);
    const job=schedule(store,post.id,"test-account",new Date(Date.now()+60000).toISOString());
    await worker.publish(job);assert.equal(submissions,1);assert.equal(store.require<Job>("jobs",job.id).status,"submitted");
    await worker.tick();assert.equal(store.require<Job>("jobs",job.id).publishedUrl,"https://example.com/mock-post");
    for(const route of ["/","/services","/services/web","/services/mobile","/services/data","/services/design","/services/ai","/services/automation","/portfolio",`/case-studies/${project.id}`,"/contact","/sitemap.xml"])
      assert.equal((await fetch(url+route)).status,200,route);
    assert.equal((await fetch(url+"/api/state")).status,404);
    assert.equal((await fetch(url+"/api/connections")).status,404);
    const landing=await fetch(url+"/services/web?utm_source=linkedin&utm_campaign=tracked-browse");
    const cookie=landing.headers.get("set-cookie")!.split(";")[0];
    const contact=await fetch(url+"/contact",{headers:{cookie}});
    assert((await contact.text()).includes('name="utm_campaign" value="tracked-browse"'));
    assert.equal((await fetch(url+"/inquiries",{method:"POST",headers:{origin:"https://unrelated.example","Content-Type":"application/json"},body:"{}"})).status,403);
    const reply=await fetch(url+"/inquiries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Test prospect",email:"prospect@example.com",description:"Please build a business website.",requestedService:"web",country:"Canada",timezone:"America/Toronto",utm_source:"linkedin",utm_campaign:"demo-case-study"})});
    assert.equal(reply.status,201);const lead=store.all<Lead & {attribution:{campaign:string}}>("leads")[0];
    assert.equal(lead.attribution.campaign,"demo-case-study"); assert.equal(store.all("notifications").length>0,true);
    const service=new Acquisition(store,(async()=>output) as any);
    const proposal=await service.propose({leadId:lead.id,projectIds:[project.id]});assert.equal(proposal.leadId,lead.id);
    assert(service.approve(proposal.id).approvedHash);
    const edited=service.edit(proposal.id,{...output,short:"Revised proposal for review."});assert.equal(edited.version,2);assert.equal(edited.approvedHash,null);assert.equal(store.all("proposal_versions").length,2);
    store.put("reminders",{id:randomUUID(),leadId:lead.id,dueAt:new Date(Date.now()+86400000).toISOString(),note:"Review draft and ask clarifying questions",status:"pending"});
    editPost(store,post.id,"Revised demo",post.title,[]);assert.equal(store.require<Post>("posts",post.id).approvedHash,null);
  }finally{config.publishingEnabled=previous;await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
test("opportunity imports deduplicate tracking URLs and proposals reject revoked or changing evidence",async()=>{
  const {store,project}=fixture();const service=new Acquisition(store,(async()=>output) as any);
  try {
    const one=service.import({title:"Build website",description:"A clear project request for a business website",service:"web",source:"Manual",url:"https://example.com/jobs/1?utm_source=a"});
    const two=service.import({title:"Build website",description:"Same listing",service:"web",source:"Other",url:"https://example.com/jobs/1"});assert.equal(one.id,two.id);assert(one.reasons.some(r=>r.includes("Budget unknown")));
    const proposal=await service.propose({opportunityId:one.id,projectIds:[project.id]});
    store.put("projects",{...project,permission:false});assert.throws(()=>service.approve(proposal.id),/permission/);
    await assert.rejects(service.propose({opportunityId:one.id,projectIds:[project.id]}),/permission/);
  }finally{store.close();}
});
test("public portfolio is responsive and safely escapes project content",async()=>{
  const {store,project}=fixture();store.put("projects",{...project,title:"<script>alert(1)</script> demo"});
  const server=createPublicSite(store,"http://localhost:3001").listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:390,height:844}});
  try {
    await page.goto(`http://127.0.0.1:${(server.address() as any).port}/services/web`);
    assert.equal(await page.locator("script").count(),0);
    assert(await page.getByRole("link",{name:"Request a web development quote"}).isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.getByRole("link",{name:"Request a web development quote"}).click();await page.getByLabel("Email",{exact:true}).waitFor();
  }finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
test("authorized RSS imports are bounded, atomic, deduplicated and reject entity declarations",async()=>{
  const {store}=fixture();const service=new Acquisition(store);
  try {
    const xml='<rss><channel><item><title>Website request</title><description>A business needs a new website.</description><link>https://example.com/jobs/rss</link></item></channel></rss>';
    assert.equal((await service.discover(new RssImportSource("Owner authorized feed",xml,"web"))).length,1);
    await service.discover(new RssImportSource("Owner authorized feed",xml,"web"));assert.equal(store.all("opportunities").length,1);
    await assert.rejects(service.discover(new RssImportSource("Blocked",'<!DOCTYPE rss [<!ENTITY x "secret">]><rss/>',"web")),/entity/);
    const invalid=xml.replace("https://example.com/jobs/rss","file:///private");
    await assert.rejects(service.discover(new RssImportSource("Invalid URL",invalid,"web")));
    assert.equal(store.all("opportunities").length,1);
  }finally{store.close();}
});
test("campaign API creates tracked unapproved drafts and schedules only assigned accounts in campaign timezone",async()=>{
  const {store,project}=fixture();
  store.put("accounts",{id:"account",name:"Test",platform:"linkedin",disabled:false,syncedAt:now()});
  const post=store.put<Post>("posts",{id:randomUUID(),projectId:project.id,platform:"linkedin",title:"Demo",content:"A helpful demonstration project.",assetIds:[],version:1,status:"draft",approvedHash:null,createdAt:now(),updatedAt:now()});
  const app=createApp(store);app.use(errorHandler);const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const url=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const login=await fetch(url+"/api/auth/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:"synthetic-campaign-test-password"})});const session=await login.json() as any;const cookie=login.headers.get("set-cookie")!.split(";")[0];
    const call=async(path:string,body:unknown)=>fetch(url+"/api"+path,{method:"POST",headers:{cookie,"x-csrf-token":session.csrf,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const response=await call("/campaigns",{name:"Case study campaign",service:"web",audience:"Small businesses",countries:["Canada"],accountIds:["account"],projectId:project.id,frequency:"weekly",timezone:"America/New_York",destination:"https://example.com/services/web",utmCampaign:"web-case-study"});assert.equal(response.status,201);const campaign=await response.json() as any;
    const trackedResponse=await call(`/campaigns/${campaign.id}/posts`,{postId:post.id,accountId:"account"});assert.equal(trackedResponse.status,201);const tracked=await trackedResponse.json() as Post;
    assert.equal(tracked.approvedHash,null);assert(tracked.content.includes("utm_campaign=web-case-study"));
    assert.equal((await call(`/campaigns/${campaign.id}/schedule`,{postId:tracked.id,accountId:"account",localTime:"2050-07-01T10:00"})).status,400);
    approve(store,tracked.id);
    const scheduled=await call(`/campaigns/${campaign.id}/schedule`,{postId:tracked.id,accountId:"account",localTime:"2050-07-01T10:00"});assert.equal(scheduled.status,201);
    const job=await scheduled.json() as any;assert.equal(job.scheduledAt,"2050-07-01T14:00:00.000Z");assert.equal(job.campaignId,campaign.id);
    assert.equal((await call(`/campaigns/${campaign.id}/schedule`,{postId:tracked.id,accountId:"unassigned",localTime:"2050-07-01T10:00"})).status,400);
  }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
