import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Acquisition } from "./acquisition.ts";
import { Store } from "./store.ts";
import { now, schedule } from "./domain.ts";
import { assertAccountAllowed } from "./account-policies.ts";
import type { Campaign, Opportunity } from "../shared/acquisition.ts";
import type { Post } from "../shared/model.ts";
import { RssImportSource } from "./opportunity-sources.ts";
import { acquisitionServices } from "../shared/acquisition.ts";
import { zonedToIso } from "../shared/time.ts";
export function acquisitionRoutes(store: Store, service = new Acquisition(store)) {
  const router = Router();
  router.get("/acquisition", (_req, res) => res.json({ opportunities: store.all("opportunities"), proposals: store.all("proposals"), campaigns: store.all("campaigns"), reminders: store.all("reminders") }));
  router.post("/opportunities", (req, res) => res.status(201).json(service.import(req.body)));
  router.post("/opportunities/import-rss", async(req,res)=>{
    const input=z.object({source:z.string().trim().min(1).max(100),xml:z.string().min(1).max(150000),service:z.enum(acquisitionServices),authorized:z.literal(true)}).parse(req.body);
    res.status(201).json(await service.discover(new RssImportSource(input.source,input.xml,input.service)));
  });
  router.put("/opportunities/:id/status", (req, res) => {
    const { status } = z.object({ status: z.enum(["new", "saved", "rejected", "contacted"]) }).parse(req.body);
    const old = store.require<Opportunity>("opportunities", req.params.id);
    res.json(store.put("opportunities", { ...old, status }));
  });
  router.post("/campaigns", (req, res) => res.status(201).json(service.campaign(req.body)));
  router.post("/campaigns/:id/posts", (req, res) => {
    const c = store.require<Campaign>("campaigns", req.params.id);
    const value = z.object({ postId:z.string().uuid(), accountId:z.string() }).parse(req.body);
    if (!c.accountIds.includes(value.accountId)) return void res.status(400).json({error:"Account is not assigned to this campaign."});
    assertAccountAllowed(store,value.accountId);
    const original=store.require<Post>("posts",value.postId);
    if(original.projectId!==c.projectId) return void res.status(400).json({error:"Use the campaign portfolio project."});
    const account=store.require<import("../shared/model.ts").Account>("accounts",value.accountId);
    if(account.platform!==original.platform) return void res.status(400).json({error:"Account and post platform must match."});
    const url=new URL(c.destination);url.searchParams.set("utm_source",original.platform);url.searchParams.set("utm_medium","social");url.searchParams.set("utm_campaign",c.utmCampaign);url.searchParams.set("utm_content",value.accountId);
    res.status(201).json(store.put("posts",{...original,id:randomUUID(),content:`${original.content}\n\n${url.toString()}`,title:`${c.name}: ${original.title}`.slice(0,200),status:"draft",approvedHash:null,version:1,createdAt:now(),updatedAt:now()}));
  });
  router.post("/campaigns/:id/schedule", (req, res) => {
    const c = store.require<Campaign>("campaigns", req.params.id);
    const value = z.object({ postId: z.string().uuid(), accountId: z.string(), scheduledAt: z.iso.datetime({offset:true}).optional(), localTime:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional() }).refine(v=>!!v.scheduledAt !== !!v.localTime,"Supply one publication time.").parse(req.body);
    if (!c.accountIds.includes(value.accountId)) return void res.status(400).json({ error: "Account is not assigned to this campaign." });
    assertAccountAllowed(store, value.accountId);
    const post = store.require<Post>("posts", value.postId);
    if (post.projectId !== c.projectId) return void res.status(400).json({ error: "Post must use this campaign's portfolio project." });
    res.status(201).json(store.transaction(() => {
      const job = schedule(store, value.postId, value.accountId, value.localTime ? zonedToIso(value.localTime,c.timezone) : value.scheduledAt!);
      return store.put("jobs", { ...job, campaignId: c.id });
    }));
  });
  router.post("/proposals", async (req, res) => res.status(201).json(await service.propose(req.body)));
  router.put("/proposals/:id", (req, res) => res.json(service.edit(req.params.id, req.body)));
  router.post("/proposals/:id/approve", (req, res) => res.json(service.approve(req.params.id)));
  router.get("/proposals/:id/versions", (req, res) => {
    store.require("proposals", req.params.id);
    res.json(store.all<{ proposalId: string }>("proposal_versions").filter(p => p.proposalId === req.params.id));
  });
  router.post("/reminders", (req, res) => {
    const value = z.object({ leadId: z.string().uuid(), dueAt: z.iso.datetime({offset:true}), note: z.string().trim().min(1).max(2000) }).parse(req.body);
    store.require("leads", value.leadId);
    res.status(201).json(store.put("reminders", { ...value, id: randomUUID(), createdAt: now(), status: "pending" }));
  });
  return router;
}
