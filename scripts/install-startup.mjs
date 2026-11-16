import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.platform !== "win32")
  throw new Error("This installer is for Windows Task Scheduler.");
const root = fileURLToPath(new URL("../", import.meta.url));
const taskName = "FreelanceGrowth Local Dashboard";
const existing = spawnSync(
  "schtasks.exe",
  ["/Query", "/TN", taskName, "/XML"],
  { encoding: "utf8", windowsHide: true },
);
if (
  existing.status === 0 &&
  (!existing.stdout.includes("start-background.vbs") ||
    !existing.stdout
      .toLowerCase()
      .includes(root.replace(/&/g, "&amp;").toLowerCase()))
)
  throw new Error(
    "A different scheduled task uses this name. It was not overwritten.",
  );
const identity = spawnSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
  encoding: "utf8",
  windowsHide: true,
});
const sid = identity.stdout.match(/S-1-5-21-[\d-]+/)?.[0];
if (!sid) throw new Error("Could not resolve the current Windows user SID.");
const escape = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const xml = `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>Start the local FreelanceGrowth dashboard and approved-content worker. No browser login or publication permission is implied.</Description></RegistrationInfo><Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${sid}</UserId></LogonTrigger></Triggers><Principals><Principal id="Owner"><UserId>${sid}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><Hidden>true</Hidden><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings><Actions Context="Owner"><Exec><Command>${escape(join(process.env.SystemRoot, "System32", "wscript.exe"))}</Command><Arguments>"${escape(join(root, "start-background.vbs"))}"</Arguments><WorkingDirectory>${escape(root)}</WorkingDirectory></Exec></Actions></Task>`;
const directory = join(root, "data", "runtime");
mkdirSync(directory, { recursive: true });
const path = join(directory, "startup-task.xml");
writeFileSync(path, "\uFEFF" + xml, { encoding: "utf16le", mode: 0o600 });
const result = spawnSync(
  "schtasks.exe",
  ["/Create", "/TN", taskName, "/XML", path, "/F"],
  { encoding: "utf8", windowsHide: true },
);
if (result.status !== 0) {
  console.error(
    "Windows did not allow a least-privilege startup task. No administrator escalation or execution-policy change was attempted. Use the desktop shortcut or start-background.vbs manually.",
  );
  process.exitCode = 1;
} else console.log("Installed least-privilege user-logon task: " + taskName);
