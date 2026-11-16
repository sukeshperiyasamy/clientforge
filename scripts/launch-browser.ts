import { spawn } from "node:child_process";
import { openSync, closeSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BrowserClient } from "../server/browser/client.ts";
import { config } from "../server/config.ts";
async function launch() {
  const origin = `http://127.0.0.1:${config.port}`;
  let ready = false;
  try {
    ready = (
      await fetch(`${origin}/api/auth/status`, {
        signal: AbortSignal.timeout(1500),
      })
    ).ok;
  } catch {}
  if (!ready) {
    if (!existsSync("dist/index.html"))
      throw new Error(
        "Build the app before opening its browser. Run start.ps1.",
      );
    mkdirSync(join(config.dataDir, "logs"), { recursive: true });
    const log = openSync(join(config.dataDir, "logs", "server.log"), "a");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", resolve("server/index.ts"), "--production"],
      {
        cwd: process.cwd(),
        detached: true,
        windowsHide: true,
        stdio: ["ignore", log, log],
      },
    );
    child.unref();
    closeSync(log);
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        if (
          (
            await fetch(`${origin}/api/auth/status`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        ) {
          ready = true;
          break;
        }
      } catch {}
    }
  }
  if (!ready)
    throw new Error("The dashboard did not start. See data/logs/server.log.");
  await new BrowserClient().launch();
  console.log("FreelanceGrowth Browser opened.");
}
launch().catch(() => {
  console.error(
    "Could not open FreelanceGrowth Browser. Start the dashboard and inspect the protected broker log under LocalAppData/FreelanceGrowth/Browser/<project-id>/logs.",
  );
  process.exitCode = 1;
});
