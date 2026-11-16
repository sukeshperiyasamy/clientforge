import express from "express";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { Store } from "./store.ts";
import { config } from "./config.ts";
import { createApp, errorHandler } from "./app.ts";
import { Worker } from "./worker.ts";
import type { ConnectionRecord } from "../shared/connectors.ts";

const store = new Store(join(config.dataDir, "clientforge.sqlite"));
const app = createApp(store);
if (process.argv.includes("--production")) {
  if (!existsSync("dist/index.html"))
    throw new Error("Build the dashboard first: npm run build");
  app.use(express.static("dist"));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(join(process.cwd(), "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(errorHandler);
const worker = new Worker(store);
let checkingConnections = false;
const connectionTimer = setInterval(async () => {
  if (checkingConnections) return;
  if (store.get<{ active: boolean }>("runtime", "emergency-stop")?.active)
    return;
  const due = store
    .all<ConnectionRecord>("connections")
    .find(
      (c) =>
        !c.disabled &&
        c.lastAuth &&
        (!c.lastCheck || Date.now() - Date.parse(c.lastCheck) > 30 * 60000),
    );
  if (!due) return;
  checkingConnections = true;
  try {
    await app.locals.connections().check(due.id);
  } catch {
    store.audit("connection.background_check_failed", due.id);
  } finally {
    checkingConnections = false;
  }
}, 60000);
const servers: ReturnType<typeof app.listen>[] = [];
const server = app.listen(config.port, "127.0.0.1", () => {
  worker.start();
  console.log(
    `ClientForge: http://127.0.0.1:${config.port}\nLocal owner application · real publishing ${config.publishingEnabled ? "enabled" : "disabled"}`,
  );
});
servers.push(server);
if (config.port === 3000) {
  const legacy = app.listen(4310, "127.0.0.1");
  legacy.on("error", () =>
    console.warn("Legacy port 4310 is unavailable; use localhost:3000."),
  );
  servers.push(legacy);
}
function shutdown() {
  worker.stop();
  clearInterval(connectionTimer);
  let remaining = servers.length;
  for (const item of servers)
    item.close(() => {
      if (--remaining === 0) {
        store.close();
        process.exit(0);
      }
    });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
