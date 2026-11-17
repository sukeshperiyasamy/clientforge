import { z } from "zod";
export const acquisitionServices = ["web", "mobile", "data", "design", "ai", "automation"] as const;
export const opportunitySchema = z.object({
  title: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(12000),
  source: z.string().trim().min(1).max(100), url: z.url().refine(v => /^https?:\/\//.test(v)),
  service: z.enum(acquisitionServices), country: z.string().max(100).default(""),
  budget: z.string().max(200).default(""), deadline: z.string().max(100).default(""),
  skills: z.array(z.string().max(100)).max(30).default([]),
});
export type Opportunity = z.infer<typeof opportunitySchema> & { id: string; createdAt: string; score: number; reasons: string[]; status: "new" | "saved" | "rejected" | "contacted" };
export const proposalOutputSchema = z.object({
  short: z.string().min(1).max(6000), detailed: z.string().min(1).max(20000),
  scope: z.string().max(6000), deliverables: z.string().max(6000),
  pricingAssumptions: z.string().max(4000), questions: z.string().max(4000), followUp: z.string().max(4000),
});
export type Proposal = z.infer<typeof proposalOutputSchema> & { id: string; leadId: string | null; opportunityId: string | null; projectIds: string[]; version: number; approvedHash: string | null; createdAt: string; updatedAt: string; evidenceHash: string };
export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(100), service: z.enum(acquisitionServices),
  audience: z.string().trim().min(3).max(1000), countries: z.array(z.string().max(100)).max(30),
  accountIds: z.array(z.string().min(1)).min(1).max(30), projectId: z.string().uuid(),
  frequency: z.enum(["manual", "daily", "weekly"]), timezone: z.string().refine(v => { try { new Intl.DateTimeFormat("en", { timeZone:v }); return true; } catch { return false; } }),
  destination: z.url().refine(v => /^https?:\/\//.test(v)), utmCampaign: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), approvalMode: z.literal("review").default("review"),
});
export type Campaign = z.infer<typeof campaignSchema> & { id: string; createdAt: string };
