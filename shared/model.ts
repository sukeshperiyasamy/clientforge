import { z } from "zod";

export const services = [
  {
    id: "web",
    name: "Web development & UI/UX",
    audience: "Founders, agencies and small businesses",
    color: "#8b7cf8",
    description: "Websites, web apps, interfaces and design systems.",
  },
  {
    id: "mobile",
    name: "iOS & Android apps",
    audience: "Startups and business owners",
    color: "#57b6ef",
    description: "Mobile applications, prototypes and app experiences.",
  },
  {
    id: "data",
    name: "Excel & data analysis",
    audience: "Operations, finance and business teams",
    color: "#55c9a7",
    description:
      "Spreadsheets, cleanup, formulas, dashboards and data plotting.",
  },
  {
    id: "ai",
    name: "AI video & ComfyUI",
    audience: "Creators, agencies and creative studios",
    color: "#eead6c",
    description: "AI video, local ComfyUI installation and creative workflows.",
  },
] as const;
export const platforms = [
  {
    id: "linkedin",
    name: "LinkedIn",
    limit: 3000,
    mode: "auto",
    media: "optional",
  },
  {
    id: "linkedin-page",
    name: "LinkedIn Page",
    limit: 3000,
    mode: "auto",
    media: "optional",
  },
  {
    id: "instagram",
    name: "Instagram",
    limit: 2200,
    mode: "auto",
    media: "required",
  },
  {
    id: "instagram-standalone",
    name: "Instagram Standalone",
    limit: 2200,
    mode: "auto",
    media: "required",
  },
  {
    id: "facebook",
    name: "Facebook Page",
    limit: 5000,
    mode: "auto",
    media: "optional",
  },
  {
    id: "threads",
    name: "Threads",
    limit: 500,
    mode: "auto",
    media: "optional",
  },
  { id: "x", name: "X", limit: 280, mode: "manual", media: "optional" },
  {
    id: "bluesky",
    name: "Bluesky",
    limit: 300,
    mode: "auto",
    media: "optional",
  },
  {
    id: "mastodon",
    name: "Mastodon",
    limit: 500,
    mode: "auto",
    media: "optional",
  },
  {
    id: "telegram",
    name: "Telegram",
    limit: 1024,
    mode: "auto",
    media: "optional",
  },
  {
    id: "youtube",
    name: "YouTube",
    limit: 5000,
    mode: "manual",
    media: "video",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    limit: 500,
    mode: "manual",
    media: "required",
  },
  {
    id: "devto",
    name: "DEV Community",
    limit: 20000,
    mode: "manual",
    media: "optional",
  },
  {
    id: "reddit",
    name: "Reddit",
    limit: 10000,
    mode: "manual",
    media: "optional",
  },
  {
    id: "quora",
    name: "Quora",
    limit: 10000,
    mode: "manual",
    media: "optional",
  },
] as const;
export type Platform = (typeof platforms)[number]["id"];
export const platformSchema = z.enum(platforms.map((p) => p.id));
export const serviceSchema = z.enum(["web", "mobile", "data", "ai"]);
export const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Use a valid http(s) URL without credentials");
export const projectSchema = z.object({
  title: z.string().trim().min(3).max(160),
  service: serviceSchema,
  problem: z.string().trim().min(10).max(4000),
  solution: z.string().trim().min(10).max(6000),
  results: z.string().trim().max(2000).default(""),
  url: httpUrl.default(""),
  audience: z.string().trim().max(300).default(""),
  demo: z.boolean().default(true),
  permission: z.boolean().default(false),
  assetIds: z.array(z.string().uuid()).max(10).default([]),
});
export type Project = z.infer<typeof projectSchema> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export const settingsSchema = z.object({
  name: z.string().trim().max(100).default(""),
  bio: z.string().trim().max(1200).default(""),
  contact: z.string().trim().max(300).default(""),
  website: httpUrl.default(""),
  audience: z
    .string()
    .trim()
    .max(300)
    .default("International founders, agencies and small businesses"),
  timezone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone")
    .default("Asia/Kolkata"),
  voice: z
    .string()
    .trim()
    .max(1000)
    .default(
      "Clear English, practical, confident and evidence-based. Explain the problem and what was delivered.",
    ),
  paused: z.boolean().default(true),
});
export type Settings = z.infer<typeof settingsSchema>;
export type Asset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
};
export type Account = {
  id: string;
  name: string;
  platform: string;
  disabled: boolean;
  syncedAt: string;
};
export type Post = {
  id: string;
  projectId: string;
  platform: Platform;
  title: string;
  content: string;
  assetIds: string[];
  version: number;
  status: "draft" | "approved";
  approvedHash: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Job = {
  id: string;
  postId: string;
  accountId: string;
  scheduledAt: string;
  status:
    | "scheduled"
    | "publishing"
    | "submitted"
    | "failed"
    | "unknown"
    | "cancelled"
    | "published";
  snapshot: Post;
  attempts: number;
  remoteId: string | null;
  error: string | null;
  createdAt: string;
};
export type Generation = {
  id: string;
  projectId: string;
  platforms: Platform[];
  status: "queued" | "running" | "complete" | "failed";
  error: string | null;
  createdAt: string;
  focus?: string;
};
export const ruleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  projectIds: z.array(z.string().uuid()).min(1).max(20),
  platforms: z.array(platformSchema).min(1).max(8),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone"),
  focus: z
    .string()
    .trim()
    .max(1000)
    .default(
      "Explain one useful lesson from the project, with a relevant project enquiry invitation.",
    ),
  enabled: z.boolean().default(false),
});
export type Rule = z.infer<typeof ruleSchema> & {
  id: string;
  nextRunAt: string;
  createdAt: string;
};
export const leadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  service: serviceSchema,
  description: z.string().trim().min(5).max(4000),
  country: z.string().trim().max(100).default(""),
  budget: z.string().trim().max(100).default(""),
  source: z.string().trim().max(200).default(""),
  status: z
    .enum(["new", "qualified", "call", "proposal", "won", "lost"])
    .default("new"),
  value: z.number().finite().nonnegative().max(1e9).default(0),
  currency: z.enum(["USD", "EUR", "GBP", "AUD", "INR"]).default("USD"),
  notes: z.string().trim().max(4000).default(""),
});
export type Lead = z.infer<typeof leadSchema> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export type Audit = {
  id: string;
  event: string;
  entityId: string;
  detail: string;
  createdAt: string;
};
export type State = {
  settings: Settings;
  projects: Project[];
  posts: Post[];
  jobs: Job[];
  generations: Generation[];
  rules: Rule[];
  leads: Lead[];
  assets: Asset[];
  accounts: Account[];
  audit: Audit[];
  platforms: typeof platforms;
  services: typeof services;
  health: {
    antigravity: boolean;
    postiz: boolean;
    publishingEnabled: boolean;
    database: string;
  };
};
