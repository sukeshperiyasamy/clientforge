import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { Store, HttpError } from "./store.ts";
import { config, safeError } from "./config.ts";
import { approve, editPost, schedule, now, validatePost } from "./domain.ts";
import { PostizProvider } from "./postiz.ts";
import {
  projectSchema,
  settingsSchema,
  leadSchema,
  ruleSchema,
  platformSchema,
  platforms,
  services,
  type Project,
  type Post,
  type Job,
  type Generation,
  type Account,
  type Asset,
  type Lead,
  type State,
  type Audit,
  type Rule,
} from "../shared/model.ts";
import { nextRuleRun } from "../shared/time.ts";
import { OwnerAuth } from "./security.ts";
import { connectionRoutes } from "./connection-routes.ts";
import { accountViews, updateAccountPolicy, syncProviderAccounts } from "./account-policies.ts";
import { Workspaces } from "./workspaces.ts";
import { acquisitionRoutes } from "./acquisition-routes.ts";

export function createApp(store: Store, provider = new PostizProvider()) {
  const app = express();
  app.disable("x-powered-by");
  const auth = new OwnerAuth(store);
  const availableAgy =
    spawnSync(config.agy, ["--version"], { windowsHide: true, timeout: 10000 })
      .status === 0;
  const limits = new Map<string, { start: number; count: number }>();
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
      return res.status(403).json({ error: "This application is local-only." });
    const origin = req.get("origin");
    const callback =
      /^\/auth\/(github|youtube)\/callback$/.test(req.path) &&
      req.method === "GET";
    if (!callback && origin && origin !== `http://${req.get("host")}`)
      return res
        .status(403)
        .json({ error: "Cross-origin access is not allowed." });
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-store",
    });
    // Reject cross-site fetches, including attempts to bootstrap a local session.
    if (!callback && req.get("sec-fetch-site") === "cross-site")
      return res
        .status(403)
        .json({ error: "Cross-site requests are blocked." });
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/auth/status", (_req, res) =>
    res.json({ needsSetup: !auth.configured() }),
  );
  app.post("/api/auth/setup", (req, res) => {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    auth.setup(password);
    const login = auth.login(password, req.socket.remoteAddress || "local");
    auth.cookie(res, login.token);
    res.json({ csrf: login.session.csrf });
  });
  app.post("/api/auth/login", (req, res) => {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    const login = auth.login(password, req.socket.remoteAddress || "local");
    auth.cookie(res, login.token);
    res.json({ csrf: login.session.csrf });
  });
  app.get("/api/session", (req, res) => {
    const session = auth.session(req);
    if (!session)
      return res.status(401).json({
        error: "Sign in to your local dashboard.",
        needsSetup: !auth.configured(),
      });
    res.json({ csrf: session.csrf });
  });
  const connection = connectionRoutes(store, auth);
  app.locals.connections = connection.service;
  const workspaces = () => new Workspaces(store, connection.service().vault, provider);
  app.locals.providerForJob = (job: Job) => workspaces().forJob(job);
  app.get("/auth/:id/callback", connection.callback);
  app.get("/auth/:id/start", connection.start);
  app.use("/api", (req, res, next) => {
    auth.require(req);
    next();
  });
  app.post("/api/auth/logout", (req, res) => {
    auth.logout(req, res);
    res.json({ ok: true });
  });
  app.use("/api", connection.router);
  app.use("/api", acquisitionRoutes(store));
  app.get("/api/state", (_req, res) => {
    const state: State = {
      settings: store.settings(),
      projects: store.all("projects"),
      posts: store.all("posts"),
      jobs: store.all("jobs"),
      generations: store.all("generations"),
      rules: store.all("rules"),
      leads: store.all("leads"),
      accounts: accountViews(store).map(a => ({ ...a, isDefault: a.policy.isDefault,
        disabled: a.disabled || a.policy.disabled || !a.policy.publishingEnabled || a.policy.mode === "manual" })),
      assets: store.all("assets"),
      audit: store.all<Audit>("audit").slice(0, 100),
      platforms,
      services,
      health: {
        antigravity: availableAgy,
        postiz: Boolean(config.postizKey),
        publishingEnabled: config.publishingEnabled,
        database: "SQLite · WAL",
      },
    };
    res.json(state);
  });
  app.put("/api/settings", (req, res) => {
    const settings = settingsSchema.parse(req.body);
    store.put("settings", { id: "owner", ...settings });
    store.audit("settings.updated", "owner");
    res.json(settings);
  });
  function projectAssets(ids: string[]) {
    for (const id of ids) store.require("assets", id);
  }
  app.post("/api/projects", (req, res) => {
    const value = projectSchema.parse(req.body);
    projectAssets(value.assetIds);
    const project = store.put("projects", {
      id: randomUUID(),
      ...value,
      createdAt: now(),
      updatedAt: now(),
    });
    store.audit("project.created", project.id);
    res.status(201).json(project);
  });
  app.put("/api/projects/:id", (req, res) => {
    const value = projectSchema.parse(req.body);
    projectAssets(value.assetIds);
    const previous = store.require<Project>("projects", req.params.id);
    if (
      store
        .all<Job>("jobs")
        .some(
          (j) =>
            j.snapshot.projectId === previous.id &&
            ["publishing", "unknown"].includes(j.status),
        )
    )
      throw new HttpError(
        409,
        "Reconcile active publication before changing project evidence.",
      );
    const project = store.transaction(() => {
      const updated = store.put("projects", {
        ...previous,
        ...value,
        updatedAt: now(),
      });
      for (const post of store
        .all<Post>("posts")
        .filter((p) => p.projectId === previous.id))
        editPost(store, post.id, post.content, post.title, post.assetIds);
      for (const proposal of store.all<import("../shared/acquisition.ts").Proposal>("proposals").filter(p=>p.projectIds.includes(previous.id)))
        store.put("proposals",{...proposal,approvedHash:null,updatedAt:now()});
      return updated;
    });
    store.audit(
      "project.updated",
      project.id,
      "Dependent approvals invalidated.",
    );
    res.json(project);
  });
  app.delete("/api/projects/:id", (req, res) => {
    const id = req.params.id;
    if (
      store.all<Post>("posts").some((p) => p.projectId === id) ||
      store.all<Generation>("generations").some((g) => g.projectId === id)
    )
      throw new HttpError(
        409,
        "This project has content history. Revoke showcase permission instead of deleting it.",
      );
    store.remove("projects", id);
    res.json({ ok: true });
  });
  app.post("/api/projects/example", (_req, res) => {
    const existing = store
      .all<Project>("projects")
      .find((p) => p.title === "ClientForge — development demo");
    if (existing) return res.json(existing);
    const project = store.put<Project>("projects", {
      id: randomUUID(),
      title: "ClientForge — development demo",
      service: "web",
      problem:
        "Freelancers need a repeatable way to turn portfolio work into relevant social content and track project enquiries.",
      solution:
        "A local dashboard organizes projects, reviews content drafts, queues approved posts through a publishing provider and tracks a lead pipeline. This is a development demonstration, not a client engagement.",
      results: "No client acquisition or revenue results have been measured.",
      url: "",
      audience: "Independent professionals and small agencies",
      demo: true,
      permission: true,
      assetIds: [],
      createdAt: now(),
      updatedAt: now(),
    });
    store.audit("project.example_added", project.id);
    res.status(201).json(project);
  });
  app.post(
    "/api/assets",
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp", "video/mp4"],
      limit: "50mb",
    }),
    (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length < 12)
        throw new HttpError(400, "Upload a PNG, JPEG, WebP or MP4 file.");
      const bytes: Buffer = req.body;
      const mime = req.get("content-type")!.split(";")[0];
      const valid =
        mime === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mime === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : mime === "image/webp"
              ? bytes.toString("ascii", 0, 4) === "RIFF" &&
                bytes.toString("ascii", 8, 12) === "WEBP"
              : mime === "video/mp4" &&
                bytes.toString("ascii", 4, 8) === "ftyp";
      if (!valid)
        throw new HttpError(
          400,
          "The file content does not match its media type.",
        );
      let name: string;
      try {
        name = decodeURIComponent(req.get("x-file-name") || "attachment");
      } catch {
        throw new HttpError(400, "Invalid file name.");
      }
      name = name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 160);
      const asset: Asset = {
        id: randomUUID(),
        name,
        mime,
        size: bytes.length,
        createdAt: now(),
      };
      mkdirSync(join(config.dataDir, "uploads"), { recursive: true });
      writeFileSync(join(config.dataDir, "uploads", asset.id), bytes, {
        flag: "wx",
      });
      store.put("assets", asset);
      res.status(201).json(asset);
    },
  );
  app.get("/api/assets/:id", (req, res) => {
    const asset = store.require<Asset>("assets", req.params.id);
    res.type(asset.mime).sendFile(resolve(config.dataDir, "uploads", asset.id));
  });
  app.post("/api/generations", (req, res) => {
    const input = z
      .object({
        projectId: z.string().uuid(),
        platforms: z.array(platformSchema).min(1).max(8),
      })
      .parse(req.body);
    if (new Set(input.platforms).size !== input.platforms.length)
      throw new HttpError(400, "Choose each platform once.");
    const project = store.require<Project>("projects", input.projectId);
    if (!project.permission)
      throw new HttpError(
        400,
        "Confirm permission to showcase this project first.",
      );
    if (!availableAgy)
      throw new HttpError(
        503,
        "Antigravity CLI is unavailable. Configure AGY_PATH and restart.",
      );
    if (
      store
        .all<Generation>("generations")
        .filter((j) => ["queued", "running"].includes(j.status)).length >= 5
    )
      throw new HttpError(
        429,
        "Five generation jobs are already pending. Wait for the queue to finish.",
      );
    const generation = store.put<Generation>("generations", {
      id: randomUUID(),
      ...input,
      status: "queued",
      error: null,
      createdAt: now(),
    });
    store.audit("generation.queued", generation.id);
    res.status(202).json(generation);
  });
  function parseRule(body: unknown) {
    const value = ruleSchema.parse(body);
    if (
      new Set(value.platforms).size !== value.platforms.length ||
      new Set(value.weekdays).size !== value.weekdays.length ||
      new Set(value.projectIds).size !== value.projectIds.length
    )
      throw new HttpError(
        400,
        "Choose each platform, day and project only once.",
      );
    for (const id of value.projectIds) store.require("projects", id);
    return value;
  }
  app.post("/api/rules", (req, res) => {
    const value = parseRule(req.body);
    const rule = store.put<Rule>("rules", {
      ...value,
      id: randomUUID(),
      createdAt: now(),
      nextRunAt: nextRuleRun(value),
    });
    store.audit("cadence.created", rule.id);
    res.status(201).json(rule);
  });
  app.put("/api/rules/:id", (req, res) => {
    const previous = store.require<Rule>("rules", req.params.id);
    const value = parseRule(req.body);
    const rule = store.put<Rule>("rules", {
      ...previous,
      ...value,
      nextRunAt: nextRuleRun(value),
    });
    store.audit("cadence.updated", rule.id);
    res.json(rule);
  });
  app.post("/api/posts", (req, res) => {
    const input = z
      .object({
        projectId: z.string().uuid(),
        platform: platformSchema,
        title: z.string().max(200),
        content: z.string().max(20000),
        assetIds: z.array(z.string().uuid()).max(10).default([]),
      })
      .parse(req.body);
    store.require("projects", input.projectId);
    projectAssets(input.assetIds);
    res.status(201).json(
      store.put<Post>("posts", {
        ...input,
        id: randomUUID(),
        version: 1,
        status: "draft",
        approvedHash: null,
        createdAt: now(),
        updatedAt: now(),
      }),
    );
  });
  app.put("/api/posts/:id", (req, res) => {
    const input = z
      .object({
        content: z.string().max(20000),
        title: z.string().max(200),
        assetIds: z.array(z.string().uuid()).max(10),
      })
      .parse(req.body);
    projectAssets(input.assetIds);
    res.json(
      editPost(
        store,
        req.params.id,
        input.content,
        input.title,
        input.assetIds,
      ),
    );
  });
  app.post("/api/posts/:id/approve", (req, res) =>
    res.json(approve(store, req.params.id)),
  );
  app.get("/api/posts/:id/validation", (req, res) =>
    res.json({
      errors: validatePost(store, store.require("posts", req.params.id)),
    }),
  );
  app.post("/api/jobs", (req, res) => {
    const input = z
      .object({
        postId: z.string().uuid(),
        accountId: z.string().min(1),
        scheduledAt: z.iso.datetime({ offset: true }),
      })
      .parse(req.body);
    res
      .status(201)
      .json(schedule(store, input.postId, input.accountId, input.scheduledAt));
  });
  app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = store.require<Job>("jobs", req.params.id);
    if (job.status !== "scheduled")
      throw new HttpError(
        409,
        "Only local scheduled jobs can be cancelled here. Submitted posts must be managed in Postiz.",
      );
    store.put("jobs", { ...job, status: "cancelled" });
    store.audit("job.cancelled", job.id);
    res.json({ ok: true });
  });
  app.post("/api/jobs/:id/reconcile", async (req, res) => {
    const job = store.require<Job>("jobs", req.params.id);
    if (!["unknown", "submitted"].includes(job.status))
      throw new HttpError(400, "This job does not need remote reconciliation.");
    const result = await workspaces().forJob(job).reconcile(job);
    store.put("jobs", {
      ...job,
      ...result,
      error:
        result.status === "failed"
          ? "Provider reported publication failure. Review in Postiz."
          : null,
    });
    store.audit("job.reconciled", job.id, result.status);
    if (result.status === "published") {
      for (const linked of store
        .all<import("../shared/connectors.ts").ConnectionRecord>("connections")
        .filter((c) => c.remoteIds.includes(job.accountId)))
        store.put("connections", {
          ...linked,
          lastPublished: result.publishedAt,
        });
    }
    res.json(result);
  });
  app.post("/api/accounts/sync", async (_req, res) => {
    const accounts = await provider.accounts();
    syncProviderAccounts(store, accounts);
    res.json(accounts);
  });
  app.get("/api/account-connections", (_req, res) => res.json(accountViews(store)));
  app.get("/api/publishing-workspaces", (_req, res) => res.json(workspaces().list()));
  app.post("/api/publishing-workspaces", (req, res) => res.status(201).json(workspaces().add(req.body)));
  app.put("/api/publishing-workspaces/:id", (req,res)=>{
    const {disabled}=z.object({disabled:z.boolean(),confirm:z.literal(true)}).parse(req.body);
    res.json(workspaces().disable(req.params.id,disabled));
  });
  app.post("/api/publishing-workspaces/:id/sync", async (req, res) => res.json(await workspaces().sync(req.params.id)));
  app.put("/api/account-connections/:id", (req, res) => {
    res.json(updateAccountPolicy(store, req.params.id, req.body));
  });
  app.post("/api/account-connections/:id/test", async (req, res) => {
    const account = store.require<Account>("accounts", req.params.id);
    const accounts = await workspaces().client(account.workspaceId).accounts();
    syncProviderAccounts(store, accounts, account.workspaceId);
    res.json(accountViews(store).find(a => a.id === req.params.id));
  });
  app.post("/api/leads", (req, res) => {
    const lead = store.put<Lead>("leads", {
      id: randomUUID(),
      ...leadSchema.parse(req.body),
      createdAt: now(),
      updatedAt: now(),
    });
    store.audit("lead.created", lead.id);
    res.status(201).json(lead);
  });
  app.put("/api/leads/:id", (req, res) => {
    const old = store.require<Lead>("leads", req.params.id);
    const lead = store.put("leads", {
      ...old,
      ...leadSchema.parse(req.body),
      updatedAt: now(),
    });
    store.audit("lead.updated", lead.id, lead.status);
    res.json(lead);
  });
  app.get("/api/export", (_req, res) => {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="clientforge-export.json"',
    );
    res.json({
      exportedAt: now(),
      connections: store.all("connections"),
      notifications: store.all("notifications"),
      assistedWorkflows: store.all("assisted_workflows"),
      settings: store.settings(),
      projects: store.all("projects"),
      posts: store.all("posts"),
      jobs: store.all("jobs"),
      rules: store.all("rules"),
      generations: store.all("generations"),
      leads: store.all("leads"),
      assets: store.all("assets"),
      audit: store.all("audit"),
    });
  });
  app.get("/public/profile", (_req, res) => {
    const s = store.settings();
    res.json({
      name: s.name,
      bio: s.bio,
      contact: s.contact,
      website: s.website,
      services,
      projects: store
        .all<Project>("projects")
        .filter((p) => p.permission)
        .map(
          ({ id, title, service, problem, solution, results, url, demo }) => ({
            id,
            title,
            service,
            problem,
            solution,
            results,
            url,
            demo,
          }),
        ),
    });
  });
  app.post("/public/enquiry", (req, res) => {
    const key = req.socket.remoteAddress || "local";
    const previous = limits.get(key);
    const window =
      previous && Date.now() - previous.start < 3600000
        ? previous
        : { start: Date.now(), count: 0 };
    limits.set(key, window);
    if (++window.count > 10)
      throw new HttpError(429, "Too many enquiries. Please try later.");
    const input = z
      .object({
        name: z.string(),
        email: z.string(),
        service: z.string(),
        description: z.string(),
        country: z.string().optional(),
        budget: z.string().optional(),
        source: z.string().max(200).optional(),
        website: z.string().max(200).optional(),
      })
      .parse(req.body);
    if (input.website) return res.status(201).json({ ok: true });
    const value = leadSchema.parse({
      ...input,
      status: "new",
      value: 0,
      notes: "",
    });
    const lead = store.put("leads", {
      ...value,
      id: randomUUID(),
      createdAt: now(),
      updatedAt: now(),
    });
    store.audit("enquiry.received", lead.id);
    res.status(201).json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found" }),
  );
  app.use("/public", (_req, res) =>
    res.status(404).json({ error: "Route not found" }),
  );
  return app;
}
export const errorHandler: express.ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof z.ZodError)
    return void res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  const status =
    error instanceof HttpError
      ? error.status
      : error?.type === "entity.too.large"
        ? 413
        : 500;
  res.status(status).json({ error: safeError(error) });
};
