import { randomUUID } from "node:crypto";
import type { Store } from "./store.ts";
import { now, hashPost, validatePost, recover } from "./domain.ts";
import type {
  Generation,
  Job,
  Post,
  Project,
  Asset,
  Rule,
} from "../shared/model.ts";
import { nextRuleRun } from "../shared/time.ts";
import { generate } from "./antigravity.ts";
import { PostizProvider, ProviderError } from "./postiz.ts";
import { config, safeError } from "./config.ts";
import { assertAccountAllowed, policyFor } from "./account-policies.ts";
import { notify } from "./connections.ts";
import { connectors, type ConnectionRecord } from "../shared/connectors.ts";

export class Worker {
  busy = false;
  timer?: NodeJS.Timeout;
  constructor(
    public store: Store,
    public provider = new PostizProvider(),
    public generator = generate,
  ) {}
  start() {
    recover(this.store);
    this.timer = setInterval(() => {
      void this.tick().catch((e) =>
        this.store.audit("worker.error", "", safeError(e)),
      );
    }, 3000);
  }
  stop() {
    clearInterval(this.timer);
  }
  async tick() {
    if (this.busy) return;
    if (
      this.store.get<{ active: boolean }>("runtime", "emergency-stop")?.active
    )
      return;
    this.busy = true;
    try {
      this.materializeCadence();
      // Due publishing jobs take priority over generating additional drafts.
      if (config.publishingEnabled && !this.store.settings().paused) {
        const job = this.store
          .all<Job>("jobs")
          .filter(
            (j) =>
              j.status === "scheduled" &&
              j.scheduledAt <= now() &&
              (!j.nextAttemptAt || j.nextAttemptAt <= now()),
          )
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
        if (job) {
          await this.publish(job);
          return;
        }
      }
      const poll = this.store.get<{ id: string; at: number }>(
        "runtime",
        "provider-poll",
      );
      const pending = this.store
        .all<Job>("jobs")
        .find((j) => j.status === "submitted");
      if (pending && (!poll || Date.now() - poll.at > 300000)) {
        this.store.put("runtime", { id: "provider-poll", at: Date.now() });
        try {
          const result = await this.provider.reconcile(pending);
          this.store.put("jobs", { ...pending, ...result });
          if (result.status === "published") {
            for (const connection of this.store
              .all<ConnectionRecord>("connections")
              .filter((c) => c.remoteIds.includes(pending.accountId)))
              this.store.put("connections", {
                ...connection,
                lastPublished: result.publishedAt,
              });
            notify(
              this.store,
              "publishing",
              "Publication confirmed",
              pending.snapshot.title,
              pending.id,
            );
          } else if (result.status === "failed")
            notify(
              this.store,
              "publishing",
              "Publication failed",
              "The provider reported a failure. Review the job in Postiz.",
              pending.id,
            );
        } catch {
          /* A read-only check can be retried later without resubmission. */
        }
      }
      const generation = this.store
        .all<Generation>("generations")
        .filter((g) => g.status === "queued")
        .at(-1);
      if (generation) await this.content(generation);
    } finally {
      this.busy = false;
    }
  }
  materializeCadence(at = new Date()) {
    if (
      this.store.get<{ active: boolean }>("runtime", "emergency-stop")?.active
    )
      return;
    if (
      this.store
        .all<Generation>("generations")
        .filter((g) => ["queued", "running"].includes(g.status)).length >= 5
    )
      return;
    for (const rule of this.store
      .all<Rule>("rules")
      .filter((r) => r.enabled && r.nextRunAt <= at.toISOString())) {
      this.store.transaction(() => {
        const occurrence = `${rule.id}:${rule.nextRunAt}`;
        if (!this.store.get("occurrences", occurrence)) {
          // No backlog flood after downtime: runs more than a day old are skipped.
          if (at.getTime() - Date.parse(rule.nextRunAt) < 86400000) {
            const sequence = this.store
              .all<{ id: string; ruleId: string }>("occurrences")
              .filter((o) => o.ruleId === rule.id).length;
            const projectId =
              rule.projectIds[sequence % rule.projectIds.length];
            const project = this.store.get<Project>("projects", projectId);
            if (project?.permission) {
              this.store.put<Generation>("generations", {
                id: randomUUID(),
                projectId,
                platforms: rule.platforms,
                focus: rule.focus,
                status: "queued",
                error: null,
                createdAt: at.toISOString(),
              });
              this.store.audit(
                "cadence.queued",
                rule.id,
                `Draft batch for ${rule.name}; approval still required.`,
              );
            } else
              this.store.audit(
                "cadence.skipped",
                rule.id,
                "Source project missing or showcase permission revoked.",
              );
          } else
            this.store.audit(
              "cadence.skipped",
              rule.id,
              "Missed run skipped after downtime.",
            );
          this.store.put("occurrences", { id: occurrence, ruleId: rule.id });
        }
        this.store.put("rules", { ...rule, nextRunAt: nextRuleRun(rule, at) });
      });
      break;
    }
  }
  async content(job: Generation) {
    this.store.put("generations", { ...job, status: "running" });
    try {
      const project = this.store.require<Project>("projects", job.projectId);
      if (!project.permission)
        throw new Error(
          "Confirm project showcase permission before generation.",
        );
      const result = await this.generator(
        project,
        job.platforms,
        this.store.settings(),
        job.focus,
      );
      this.store.transaction(() => {
        const latest = this.store.require<Project>("projects", project.id);
        if (
          this.store.get<{ active: boolean }>("runtime", "emergency-stop")
            ?.active
        )
          throw new Error(
            "Generation stopped by the emergency control. No drafts were saved.",
          );
        if (!latest.permission || latest.updatedAt !== project.updatedAt)
          throw new Error(
            "Project evidence or permission changed during generation. Generate again using the updated project.",
          );
        const previous = this.store.all<Post>("posts");
        const normalize = (text: string) =>
          text.toLowerCase().replace(/\s+/g, " ").trim();
        if (
          result.posts.some((draft) =>
            previous.some(
              (p) =>
                p.platform === draft.platform &&
                normalize(p.content) === normalize(draft.content),
            ),
          )
        )
          throw new Error(
            "Generation repeated an existing post. Change the editorial focus and try again.",
          );
        for (const draft of result.posts)
          this.store.put<Post>("posts", {
            id: randomUUID(),
            projectId: project.id,
            ...draft,
            assetIds: project.assetIds.slice(0, 1),
            version: 1,
            status: "draft",
            approvedHash: null,
            createdAt: now(),
            updatedAt: now(),
          });
        this.store.put("generations", { ...job, status: "complete" });
        this.store.audit(
          "generation.completed",
          job.id,
          `${result.posts.length} drafts created`,
        );
      });
    } catch (e) {
      this.store.put("generations", {
        ...job,
        status: "failed",
        error: safeError(e),
      });
      this.store.audit("generation.failed", job.id, safeError(e));
    }
  }
  async publish(job: Job) {
    try {
      assertAccountAllowed(this.store, job.accountId);
      const policy = policyFor(this.store, job.accountId);
      const count = this.store.all<Job>("jobs").filter(j => j.accountId === job.accountId &&
        ["publishing", "submitted", "published", "unknown"].includes(j.status) &&
        Date.parse(j.lastAttemptAt || j.createdAt) > Date.now() - 86400000).length;
      if (count >= policy.dailyLimit) throw new Error("Account daily publishing limit reached.");
      const connector = connectors.find((c) =>
        c.providerIds.includes(job.snapshot.platform),
      );
      const connection = connector
        ? this.store.get<ConnectionRecord>("connections", connector.id)
        : undefined;
      if (
        connection &&
        (connection.disabled ||
          connection.mode === "manual" ||
          connection.status !== "Connected")
      )
        throw new Error(
          "This connection is disabled, manual-only or needs a successful authentication check.",
        );
      if (connector) {
        const since = Date.now() - 86400000;
        const recent = this.store
          .all<Job>("jobs")
          .filter(
            (j) =>
              connector.providerIds.includes(j.snapshot.platform) &&
              ["publishing", "submitted", "published", "unknown"].includes(
                j.status,
              ) &&
              Date.parse(j.lastAttemptAt || j.createdAt) > since,
          );
        if (recent.length >= connector.dailyLimit)
          throw new Error(
            "The configured platform publishing limit has been reached. Review the next posting time.",
          );
      }
      const current = this.store.require<Post>("posts", job.postId);
      const errors = validatePost(this.store, current, true);
      if (hashPost(current) !== hashPost(job.snapshot))
        errors.push("The approved content changed.");
      if (errors.length) throw new Error(errors.join(" "));
      // Live account check prevents publishing against stale or disabled connections.
      const account = (await this.provider.accounts()).find(
        (a) =>
          a.id === job.accountId &&
          !a.disabled &&
          a.platform === current.platform,
      );
      if (!account)
        throw new Error(
          "Connected account is unavailable or no longer eligible.",
        );
      const media = [];
      for (const id of job.snapshot.assetIds)
        media.push(
          await this.provider.upload(this.store.require<Asset>("assets", id)),
        );
      // Re-read immediately before the side effect after network awaits.
      const latest = this.store.require<Job>("jobs", job.id);
      if (
        latest.status !== "scheduled" ||
        this.store.get<{ active: boolean }>("runtime", "emergency-stop")
          ?.active ||
        this.store.settings().paused ||
        !config.publishingEnabled
      )
        return;
      const newest = this.store.require<Post>("posts", job.postId);
      assertAccountAllowed(this.store, job.accountId);
      const currentConnection = connector
        ? this.store.get<ConnectionRecord>("connections", connector.id)
        : undefined;
      if (
        currentConnection &&
        (currentConnection.disabled ||
          currentConnection.mode === "manual" ||
          currentConnection.status !== "Connected")
      )
        throw new Error("Connection permission changed during preparation.");
      if (
        hashPost(newest) !== hashPost(job.snapshot) ||
        validatePost(this.store, newest, true).length
      )
        throw new Error(
          "Approval changed during preparation. Schedule the reviewed version again.",
        );
      const active: Job = {
        ...job,
        status: "publishing",
        lastAttemptAt: now(),
        attempts: job.attempts + 1,
      };
      this.store.put("jobs", active);
      const remoteId = await this.provider.publish(active, media);
      this.store.put("jobs", { ...active, status: "submitted", remoteId });
      this.store.audit(
        "job.submitted",
        job.id,
        `Postiz accepted ${remoteId}; publication is not yet confirmed.`,
      );
      notify(
        this.store,
        "publishing",
        "Post submitted",
        `${job.snapshot.title} was accepted by Postiz. Publication confirmation is pending.`,
        job.id,
      );
    } catch (e) {
      const latest = this.store.require<Job>("jobs", job.id);
      if (latest.status === "cancelled") return;
      const attempts =
        latest.status === "publishing" ? latest.attempts : job.attempts + 1;
      const retry =
        e instanceof ProviderError &&
        e.retryable &&
        !e.uncertain &&
        attempts < 3;
      this.store.put("jobs", {
        ...latest,
        attempts,
        status:
          e instanceof ProviderError && e.uncertain
            ? "unknown"
            : retry
              ? "scheduled"
              : "failed",
        nextAttemptAt: retry
          ? new Date(
              Date.now() +
                Math.max(
                  30000 * 2 ** attempts,
                  e instanceof ProviderError ? e.retryAfterMs || 0 : 0,
                ),
            ).toISOString()
          : undefined,
        error: safeError(e),
      });
      this.store.audit("job.failed", job.id, safeError(e));
      notify(
        this.store,
        "publishing",
        retry
          ? "Temporary publishing failure; retry scheduled"
          : "Publishing needs attention",
        safeError(e),
        job.id,
      );
    }
  }
}
