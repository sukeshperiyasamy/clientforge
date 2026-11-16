import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { Store } from "../server/store.ts";
import {
  approve,
  editPost,
  hashPost,
  schedule,
  recover,
  now,
} from "../server/domain.ts";
import { createApp, errorHandler } from "../server/app.ts";
import { Worker } from "../server/worker.ts";
import { PostizProvider, ProviderError } from "../server/postiz.ts";
import { config } from "../server/config.ts";
import {
  projectSchema,
  settingsSchema,
  ruleSchema,
  type Project,
  type Post,
  type Job,
  type Generation,
  type Rule,
} from "../shared/model.ts";
import { zonedToIso, nextRuleRun } from "../shared/time.ts";

function fixture() {
  const store = new Store(":memory:");
  const project = store.put<Project>("projects", {
    ...projectSchema.parse({
      title: "Test demo project",
      service: "web",
      problem: "A demonstration business needs a clearer site.",
      solution: "Created a demo website and documented design decisions.",
      permission: true,
    }),
    id: randomUUID(),
    createdAt: now(),
    updatedAt: now(),
  });
  const post = store.put<Post>("posts", {
    id: randomUUID(),
    projectId: project.id,
    platform: "linkedin",
    title: "Demo website walkthrough",
    content:
      "This is a demonstration project showing a clearer website experience.",
    assetIds: [],
    version: 1,
    status: "draft",
    approvedHash: null,
    createdAt: now(),
    updatedAt: now(),
  });
  store.put("accounts", {
    id: "account-1",
    name: "Test account",
    platform: "linkedin",
    disabled: false,
    syncedAt: now(),
  });
  return { store, project, post };
}
const future = () => new Date(Date.now() + 3600000).toISOString();
test("unapproved versions cannot be scheduled", () => {
  const { store, post } = fixture();
  assert.throws(
    () => schedule(store, post.id, "account-1", future()),
    /Approve/,
  );
  store.close();
});
test("editing invalidates approval and cancels pending schedules", () => {
  const { store, post } = fixture();
  approve(store, post.id);
  const job = schedule(store, post.id, "account-1", future());
  const edited = editPost(
    store,
    post.id,
    "Updated evidence-based content",
    post.title,
    [],
  );
  assert.equal(edited.status, "draft");
  assert.equal(edited.approvedHash, null);
  assert.equal(store.require<Job>("jobs", job.id).status, "cancelled");
  assert.throws(
    () => schedule(store, post.id, "account-1", future()),
    /Approve/,
  );
  store.close();
});
test("duplicate approved version cannot be scheduled again at a different time", () => {
  const { store, post } = fixture();
  approve(store, post.id);
  schedule(store, post.id, "account-1", future());
  assert.throws(
    () =>
      schedule(
        store,
        post.id,
        "account-1",
        new Date(Date.now() + 7200000).toISOString(),
      ),
    /already queued/,
  );
  assert.equal(store.all("jobs").length, 1);
  store.close();
});
test("revoked showcase permission blocks approval and scheduling", () => {
  const { store, project, post } = fixture();
  approve(store, post.id);
  store.put("projects", { ...project, permission: false });
  assert.throws(
    () => schedule(store, post.id, "account-1", future()),
    /showcase permission/,
  );
  assert.throws(() => approve(store, post.id), /showcase permission/);
  store.close();
});
test("manual community platforms cannot enter automatic queue", () => {
  const { store, post } = fixture();
  store.put("posts", { ...post, platform: "reddit" });
  approve(store, post.id);
  store.put("accounts", {
    id: "account-1",
    platform: "reddit",
    disabled: false,
  });
  assert.throws(
    () => schedule(store, post.id, "account-1", future()),
    /export-only/,
  );
  store.close();
});
test("restart marks in-flight publishing unknown and never auto-requeues it", () => {
  const { store, post } = fixture();
  approve(store, post.id);
  const job = schedule(store, post.id, "account-1", future());
  store.put("jobs", { ...job, status: "publishing" });
  recover(store);
  assert.equal(store.require<Job>("jobs", job.id).status, "unknown");
  assert.throws(
    () => editPost(store, post.id, "new content", "title", []),
    /Reconcile/,
  );
  store.close();
});
test("approval hash covers platform, media and version", () => {
  const { store, post } = fixture();
  assert.notEqual(
    hashPost(post),
    hashPost({ ...post, assetIds: [randomUUID()] }),
  );
  assert.notEqual(hashPost(post), hashPost({ ...post, version: 2 }));
  assert.notEqual(hashPost(post), hashPost({ ...post, platform: "threads" }));
  store.close();
});
test("nested transactions roll back all related mutations", () => {
  const { store, post } = fixture();
  assert.throws(() =>
    store.transaction(() => {
      editPost(store, post.id, "Changed text", "Title", []);
      throw new Error("rollback");
    }),
  );
  assert.equal(store.require<Post>("posts", post.id).content, post.content);
  store.close();
});
test("timezone conversion handles India and US summer/winter", () => {
  assert.equal(
    zonedToIso("2026-11-17T09:00", "Asia/Kolkata"),
    "2026-11-17T03:30:00.000Z",
  );
  assert.equal(
    zonedToIso("2026-07-01T09:00", "America/New_York"),
    "2026-07-01T13:00:00.000Z",
  );
  assert.equal(
    zonedToIso("2026-12-01T09:00", "America/New_York"),
    "2026-12-01T14:00:00.000Z",
  );
});
test("nonexistent and ambiguous daylight-saving times are rejected", () => {
  assert.throws(
    () => zonedToIso("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
  assert.throws(
    () => zonedToIso("2026-11-01T01:30", "America/New_York"),
    /occurs twice/,
  );
});
test("recurring draft run is deduplicated and advances after restart", () => {
  const { store, project } = fixture();
  const at = new Date("2026-11-16T04:00:00Z");
  const rule: Rule = {
    ...ruleSchema.parse({
      name: "Monday work",
      projectIds: [project.id],
      platforms: ["linkedin"],
      weekdays: [1],
      localTime: "09:00",
      timezone: "Asia/Kolkata",
      enabled: true,
    }),
    id: randomUUID(),
    nextRunAt: "2026-11-16T03:30:00.000Z",
    createdAt: now(),
  };
  store.put("rules", rule);
  const worker = new Worker(store);
  worker.materializeCadence(at);
  worker.materializeCadence(at);
  assert.equal(store.all("generations").length, 1);
  assert.equal(
    store.require<Rule>("rules", rule.id).nextRunAt,
    "2026-11-23T03:30:00.000Z",
  );
  assert.equal(store.all<Post>("posts")[0].status, "draft");
  store.close();
});
test("recurring draft runs skip old backlog and never bypass revoked permission", () => {
  const { store, project } = fixture();
  store.put("projects", { ...project, permission: false });
  const value = ruleSchema.parse({
    name: "Daily work",
    projectIds: [project.id],
    platforms: ["linkedin"],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    localTime: "09:00",
    timezone: "Asia/Kolkata",
    enabled: true,
  });
  const rule: Rule = {
    ...value,
    id: randomUUID(),
    nextRunAt: "2026-11-16T03:30:00.000Z",
    createdAt: now(),
  };
  store.put("rules", rule);
  const worker = new Worker(store);
  worker.materializeCadence(new Date("2026-11-16T04:00:00Z"));
  assert.equal(store.all("generations").length, 0);
  store.put("projects", project);
  store.put("rules", { ...rule, nextRunAt: "2026-11-10T03:30:00.000Z" });
  worker.materializeCadence(new Date("2026-11-16T04:00:00Z"));
  assert.equal(store.all("generations").length, 0);
  assert.equal(
    nextRuleRun(value, new Date("2026-11-16T04:00:00Z")),
    "2026-11-17T03:30:00.000Z",
  );
  store.close();
});
test("generation failure leaves no invented posts", async () => {
  const { store, project } = fixture();
  const generation: Generation = {
    id: randomUUID(),
    projectId: project.id,
    platforms: ["linkedin"],
    status: "queued",
    error: null,
    createdAt: now(),
  };
  store.put("generations", generation);
  const count = store.all("posts").length;
  const worker = new Worker(store, new PostizProvider(), async () => {
    throw new Error("Authentication required");
  });
  await worker.content(generation);
  assert.equal(store.all("posts").length, count);
  assert.equal(
    store.require<Generation>("generations", generation.id).status,
    "failed",
  );
  store.close();
});
test("evidence changes during generation prevent stale drafts being saved", async () => {
  const { store, project } = fixture();
  const generation: Generation = {
    id: randomUUID(),
    projectId: project.id,
    platforms: ["linkedin"],
    status: "queued",
    error: null,
    createdAt: now(),
  };
  store.put("generations", generation);
  const worker = new Worker(store, new PostizProvider(), async () => {
    store.put("projects", { ...project, permission: false });
    return {
      posts: [{ platform: "linkedin", title: "Test", content: "Test draft" }],
    };
  });
  await worker.content(generation);
  assert.equal(store.all("posts").length, 1);
  assert.equal(
    store.require<Generation>("generations", generation.id).status,
    "failed",
  );
  store.close();
});
test("uncertain provider response is never automatically retried", async () => {
  const { store, post } = fixture();
  approve(store, post.id);
  const job = schedule(store, post.id, "account-1", future());
  let calls = 0;
  class Fake extends PostizProvider {
    override async accounts() {
      return [
        {
          id: "account-1",
          name: "Test",
          platform: "linkedin",
          disabled: false,
          syncedAt: now(),
        },
      ];
    }
    override async publish(): Promise<string> {
      calls++;
      throw new ProviderError("Network timeout", true);
    }
  }
  const old = config.publishingEnabled;
  config.publishingEnabled = true;
  store.put("settings", {
    id: "owner",
    ...settingsSchema.parse({ paused: false }),
  });
  try {
    const worker = new Worker(store, new Fake());
    await worker.publish(job);
    assert.equal(store.require<Job>("jobs", job.id).status, "unknown");
    await worker.tick();
    assert.equal(calls, 1);
  } finally {
    config.publishingEnabled = old;
    store.close();
  }
});
test("pause during provider preparation prevents submission", async () => {
  const { store, post } = fixture();
  approve(store, post.id);
  const job = schedule(store, post.id, "account-1", future());
  let calls = 0;
  class Fake extends PostizProvider {
    override async accounts() {
      store.put("settings", {
        id: "owner",
        ...settingsSchema.parse({ paused: true }),
      });
      return [
        {
          id: "account-1",
          name: "Test",
          platform: "linkedin",
          disabled: false,
          syncedAt: now(),
        },
      ];
    }
    override async publish() {
      calls++;
      return "remote";
    }
  }
  const old = config.publishingEnabled;
  config.publishingEnabled = true;
  store.put("settings", {
    id: "owner",
    ...settingsSchema.parse({ paused: false }),
  });
  try {
    await new Worker(store, new Fake()).publish(job);
    assert.equal(calls, 0);
    assert.equal(store.require<Job>("jobs", job.id).status, "scheduled");
  } finally {
    config.publishingEnabled = old;
    store.close();
  }
});
test("provider payload uses documented Postiz contract and keeps submitted distinct from published", async () => {
  const { store, post } = fixture();
  approve(store, post.id);
  const job = schedule(store, post.id, "account-1", future());
  let payload: any;
  class Fake extends PostizProvider {
    override async request(path: string, init: RequestInit = {}) {
      payload = JSON.parse(String(init.body));
      assert.equal(path, "/posts");
      return [{ postId: "remote-1", integration: "account-1" }];
    }
  }
  const id = await new Fake().publish(job, []);
  assert.equal(id, "remote-1");
  assert.equal(payload.type, "now");
  assert.equal(payload.posts[0].settings.__type, "linkedin");
  assert.equal(payload.posts[0].value[0].content, post.content);
  store.close();
});
test("HTTP API blocks unauthenticated, forged-host and cross-origin access; enquiry reaches pipeline", async () => {
  const { store, project } = fixture();
  const app = createApp(store);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + "/api/state")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/session", {
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    const forgedHostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const r = request(
          base + "/api/session",
          { headers: { Host: "attacker.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        r.on("error", reject);
        r.end();
      },
    );
    assert.equal(forgedHostStatus, 403);
    const r = await fetch(base + "/api/session");
    const { csrf } = (await r.json()) as any;
    const headers = {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
      Cookie: `cf_session=${csrf}`,
    };
    assert.equal((await fetch(base + "/api/state", { headers })).status, 200);
    assert.equal(
      (
        await fetch(base + "/api/projects", {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "Invalid" }),
        })
      ).status,
      400,
    );
    const enquiry = await fetch(base + "/public/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test visitor",
        email: "test@example.com",
        service: "data",
        description: "Need a spreadsheet dashboard",
        source: "linkedin / test-campaign",
      }),
    });
    assert.equal(enquiry.status, 201);
    const leads = store.all<import("../shared/model.ts").Lead>("leads");
    assert.equal(leads.length, 1);
    assert.equal(leads[0].source, "linkedin / test-campaign");
    assert.equal(leads[0].status, "new");
    const badUpload = await fetch(base + "/api/assets", {
      method: "POST",
      headers: { ...headers, "Content-Type": "image/png" },
      body: "this is not an image",
    });
    assert.equal(badUpload.status, 400);
    const publicProfile = (await (
      await fetch(base + "/public/profile")
    ).json()) as any;
    assert.equal(publicProfile.projects[0].id, project.id);
    assert.equal(publicProfile.settings, undefined);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
