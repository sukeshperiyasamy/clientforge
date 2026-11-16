import { register } from "tsx/esm/api";
import { fileURLToPath } from "node:url";
import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
register();
mkdirSync(join(root, "data", "logs"), { recursive: true });
const log = join(root, "data", "logs", "server.log");
process.stdout.write = (chunk, ...args) => {
  appendFileSync(log, String(chunk));
  const callback = args.find((arg) => typeof arg === "function");
  callback?.();
  return true;
};
process.stderr.write = process.stdout.write;
if (!process.argv.includes("--production")) process.argv.push("--production");
await import("../server/index.ts");
