import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

if (existsSync(".env")) {
  const values = parseEnv(readFileSync(".env", "utf8"));
  for (const [key, value] of Object.entries(values))
    if (process.env[key] === undefined) process.env[key] = value;
}
export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: resolve(process.env.DATA_DIR || "data"),
  agy: process.env.AGY_PATH || "agy",
  postizUrl: (
    process.env.POSTIZ_URL || "http://localhost:4007/api/public/v1"
  ).replace(/\/$/, ""),
  postizKey: process.env.POSTIZ_API_KEY || "",
  publishingEnabled: process.env.PUBLISHING_ENABLED === "true",
};
export function safeError(e: unknown): string {
  let message = e instanceof Error ? e.message : "Operation failed";
  for (const secret of [config.postizKey,process.env.GITHUB_CLIENT_SECRET,process.env.GOOGLE_CLIENT_SECRET])
    if (secret) message = message.split(secret).join("[redacted]");
  return message.replace(/(Bearer\s+)[\w.\-]+/gi,'$1[redacted]').replace(/((?:access_token|refresh_token|client_secret|code_verifier|password)["'=:\s]+)[^\s,;"}]+/gi,'$1[redacted]').slice(0, 1000);
}
