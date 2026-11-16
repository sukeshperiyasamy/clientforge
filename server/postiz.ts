import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { config } from "./config.ts";
import type { Account, Asset, Job } from "../shared/model.ts";
import { now } from "./domain.ts";

export class ProviderError extends Error {
  constructor(
    message: string,
    public uncertain = false,
    public retryable = false,
    public httpStatus?: number,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}
export class PostizProvider {
  async request(
    path: string,
    init: RequestInit = {},
    mayPublish = false,
  ): Promise<unknown> {
    if (!config.postizKey)
      throw new ProviderError(
        "Postiz is not configured. Add POSTIZ_API_KEY to .env and restart.",
      );
    const u = new URL(config.postizUrl);
    if (
      u.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(u.hostname)
    )
      throw new ProviderError("Use HTTPS for a remote Postiz server.");
    let response: Response;
    try {
      response = await fetch(`${config.postizUrl}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: config.postizKey },
        redirect: "error",
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new ProviderError(
        "Postiz could not be reached. Check its status. Submission outcome may need reconciliation.",
        mayPublish,
        !mayPublish,
      );
    }
    const retryHeader = response.headers.get("retry-after");
    const retryAfter = retryHeader
      ? Math.max(
          0,
          Number.isFinite(Number(retryHeader))
            ? Number(retryHeader) * 1000
            : Date.parse(retryHeader) - Date.now(),
        )
      : undefined;
    if (!response.ok)
      throw new ProviderError(
        `Postiz returned HTTP ${response.status}. Check account permissions and provider settings.`,
        mayPublish && response.status >= 500,
        response.status === 429 && (!retryAfter || retryAfter <= 30 * 86400000),
        response.status,
        retryAfter && Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    try {
      return await response.json();
    } catch {
      throw new ProviderError(
        "Postiz returned an invalid response.",
        mayPublish,
      );
    }
  }
  async accounts(): Promise<Account[]> {
    const data = z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          identifier: z.string(),
          disabled: z.boolean().optional(),
        }),
      )
      .parse(await this.request("/integrations"));
    return data.map((a) => ({
      id: a.id,
      name: a.name,
      platform: a.identifier,
      disabled: a.disabled ?? false,
      syncedAt: now(),
    }));
  }
  async upload(asset: Asset): Promise<{ id: string; path: string }> {
    const bytes = await readFile(join(config.dataDir, "uploads", asset.id));
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: asset.mime }), asset.name);
    form.set("adjust", "false");
    return z
      .object({ id: z.string(), path: z.url() })
      .parse(await this.request("/upload", { method: "POST", body: form }));
  }
  async publish(job: Job, media: { id: string; path: string }[]) {
    const settings: Record<string, unknown> = { __type: job.snapshot.platform };
    if (job.snapshot.platform.startsWith("instagram"))
      settings.post_type = "post";
    const raw = await this.request(
      "/posts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "now",
          date: now(),
          shortLink: false,
          tags: [],
          posts: [
            {
              integration: { id: job.accountId },
              value: [{ content: job.snapshot.content, image: media }],
              settings,
            },
          ],
        }),
      },
      true,
    );
    const parsed = z
      .array(z.object({ postId: z.string().min(1), integration: z.string() }))
      .safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.length !== 1 ||
      parsed.data[0].integration !== job.accountId
    )
      throw new ProviderError(
        "Postiz accepted the request but returned unexpected identifiers. Reconcile before resubmitting.",
        true,
      );
    return parsed.data[0].postId;
  }
  async reconcile(job: Job) {
    const center = Date.parse(job.scheduledAt);
    const start = new Date(
      Math.min(center, Date.parse(job.createdAt)) - 86400000,
    ).toISOString();
    const end = new Date(Math.max(center, Date.now()) + 86400000).toISOString();
    const raw = z
      .object({
        posts: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            state: z.string(),
            releaseURL: z.string().optional().nullable(),
            integration: z.object({ id: z.string() }),
          }),
        ),
      })
      .parse(
        await this.request(
          `/posts?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
        ),
      );
    const matches = raw.posts.filter((p) =>
      job.remoteId
        ? p.id === job.remoteId
        : p.integration.id === job.accountId &&
          p.content === job.snapshot.content,
    );
    if (matches.length !== 1)
      throw new ProviderError(
        "Could not identify exactly one remote post. Inspect Postiz manually; this job will not be resubmitted automatically.",
      );
    const post = matches[0];
    if (post.state === "PUBLISHED")
      return {
        status: "published" as const,
        remoteId: post.id,
        publishedAt: now(),
        publishedUrl:
          post.releaseURL && /^https?:\/\//.test(post.releaseURL)
            ? post.releaseURL
            : undefined,
      };
    if (post.state === "ERROR")
      return { status: "failed" as const, remoteId: post.id };
    return { status: "submitted" as const, remoteId: post.id };
  }
}
