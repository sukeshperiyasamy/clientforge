import { createHash, randomUUID } from "node:crypto";
import {
  platforms,
  type Post,
  type Project,
  type Job,
  type Account,
  type Asset,
} from "../shared/model.ts";
import { Store, HttpError } from "./store.ts";
import { assertAccountAllowed } from "./account-policies.ts";

export const now = () => new Date().toISOString();
export const hashPost = (post: Post) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        projectId: post.projectId,
        platform: post.platform,
        content: post.content,
        title: post.title,
        assetIds: post.assetIds,
        version: post.version,
      }),
    )
    .digest("hex");
export function validatePost(
  store: Store,
  post: Post,
  publishing = false,
): string[] {
  const errors: string[] = [];
  const platform = platforms.find((p) => p.id === post.platform)!;
  const project = store.get<Project>("projects", post.projectId);
  if (!project) errors.push("The source project no longer exists.");
  else if (!project.permission)
    errors.push("Confirm showcase permission on the source project.");
  if (!post.content.trim()) errors.push("Add content before approval.");
  if ([...post.content].length > platform.limit)
    errors.push(
      `Content exceeds the ${platform.limit} character application limit.`,
    );
  if (platform.media !== "optional" && post.assetIds.length === 0)
    errors.push("Attach media for this platform.");
  if (post.assetIds.some((id) => !store.get("assets", id)))
    errors.push("An attachment is missing.");
  if (publishing) {
    if (platform.mode !== "auto")
      errors.push(
        "This platform is export-only in this release. Publish manually.",
      );
    if (post.assetIds.length > 1)
      errors.push(
        "Automatic publishing currently supports one attachment. Export carousels manually.",
      );
    if (
      post.platform === "bluesky" &&
      post.assetIds.some(
        (id) => store.get<Asset>("assets", id)?.mime === "video/mp4",
      )
    )
      errors.push("Bluesky video publishing is not enabled in this release.");
    if (post.status !== "approved" || post.approvedHash !== hashPost(post))
      errors.push("Approve the current version before scheduling.");
  }
  return errors;
}
export function approve(store: Store, id: string) {
  return store.transaction(() => {
    const post = store.require<Post>("posts", id);
    const errors = validatePost(store, post);
    if (errors.length) throw new HttpError(400, errors.join(" "));
    const updated: Post = {
      ...post,
      status: "approved",
      approvedHash: hashPost(post),
      updatedAt: now(),
    };
    store.put("posts", updated);
    store.audit("post.approved", id, `Version ${post.version}`);
    return updated;
  });
}
export function editPost(
  store: Store,
  id: string,
  content: string,
  title: string,
  assetIds: string[],
) {
  return store.transaction(() => {
    const post = store.require<Post>("posts", id);
    if (
      store
        .all<Job>("jobs")
        .some(
          (j) =>
            j.postId === id && ["publishing", "unknown"].includes(j.status),
        )
    )
      throw new HttpError(
        409,
        "Reconcile the active publishing job before editing.",
      );
    for (const job of store
      .all<Job>("jobs")
      .filter((j) => j.postId === id && j.status === "scheduled"))
      store.put("jobs", {
        ...job,
        status: "cancelled",
        error: "Cancelled because the content changed.",
      });
    const updated: Post = {
      ...post,
      content,
      title,
      assetIds,
      version: post.version + 1,
      status: "draft",
      approvedHash: null,
      updatedAt: now(),
    };
    store.put("posts", updated);
    store.audit(
      "post.edited",
      id,
      "Approval reset; pending schedules cancelled.",
    );
    return updated;
  });
}
export function schedule(
  store: Store,
  postId: string,
  accountId: string,
  scheduledAt: string,
) {
  return store.transaction(() => {
    const post = store.require<Post>("posts", postId);
    const account = store.require<Account>("accounts", accountId);
    assertAccountAllowed(store, accountId);
    const errors = validatePost(store, post, true);
    if (account.disabled || account.platform !== post.platform)
      errors.push("Select an active account for this platform.");
    const timestamp = Date.parse(scheduledAt);
    if (!Number.isFinite(timestamp) || timestamp < Date.now() + 15000)
      errors.push("Choose a time at least 15 seconds in the future.");
    if (errors.length) throw new HttpError(400, errors.join(" "));
    const key = createHash("sha256")
      .update(`${hashPost(post)}:${accountId}`)
      .digest("hex");
    const previous = store.db
      .prepare("SELECT job_id FROM dedup WHERE key=?")
      .get(key) as { job_id: string } | undefined;
    if (previous) {
      const existing = store.require<Job>("jobs", previous.job_id);
      if (existing.status !== "cancelled")
        throw new HttpError(
          409,
          "This exact version is already queued or submitted for this account.",
        );
      store.db.prepare("DELETE FROM dedup WHERE key=?").run(key);
    }
    const job: Job = {
      id: randomUUID(),
      postId,
      accountId,
      workspaceId: account.workspaceId,
      scheduledAt: new Date(timestamp).toISOString(),
      status: "scheduled",
      snapshot: post,
      attempts: 0,
      remoteId: null,
      error: null,
      createdAt: now(),
    };
    store.put("jobs", job);
    store.db
      .prepare("INSERT INTO dedup(key,job_id) VALUES(?,?)")
      .run(key, job.id);
    store.audit("job.scheduled", job.id, job.scheduledAt);
    return job;
  });
}
export function recover(store: Store) {
  store.transaction(() => {
    for (const job of store
      .all<Job>("jobs")
      .filter((j) => j.status === "publishing"))
      store.put("jobs", {
        ...job,
        status: "unknown",
        error:
          "Worker stopped during submission. Check Postiz before retrying.",
      });
    for (const job of store
      .all<{ id: string; status: string }>("generations")
      .filter((j) => j.status === "running"))
      store.put("generations", {
        ...job,
        status: "failed",
        error:
          "Generation interrupted by restart. Create a new generation request.",
      });
  });
}
