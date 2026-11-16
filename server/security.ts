import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import type { Request, Response } from "express";
import { Store, HttpError } from "./store.ts";

export function projectVaultDirectory(dataDirectory: string) {
  const identity = createHash("sha256")
    .update(resolve(dataDirectory).toLowerCase())
    .digest("hex")
    .slice(0, 12);
  const base =
    process.platform === "win32"
      ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
      : join(homedir(), ".local", "share");
  return join(base, "FreelanceGrowth", "Security", identity);
}

export function protectDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const script = `$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd(); $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($sid); foreach($s in @($sid,(New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')))){ $r=New-Object System.Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($r) }; [System.IO.Directory]::SetAccessControl($p,$acl)`;
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        input: resolve(path),
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Windows could not secure private project storage at ${resolve(path)}. Existing files were retained. Use a directory owned by your Windows user.`,
      );
  } else chmodSync(path, 0o700);
}
function dpapi(input: Buffer, unprotect = false) {
  const action = unprotect ? "Unprotect" : "Protect";
  const script = `Add-Type -AssemblyName System.Security; $v=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[System.Security.Cryptography.ProtectedData]::${action}($v,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      input: input.toString("base64"),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    },
  );
  if (result.status !== 0 || !result.stdout)
    throw new Error(
      "Windows could not unlock the local credential vault for this user.",
    );
  return Buffer.from(result.stdout.trim(), "base64");
}
export class Vault {
  private key: Buffer;
  constructor(
    private store: Store,
    directory: string,
    legacyDirectory?: string,
  ) {
    protectDirectory(directory);
    const file = join(
      directory,
      process.platform === "win32" ? "vault-key.dpapi" : "vault-key.bin",
    );
    if (!existsSync(file)) {
      const legacyFile = legacyDirectory
        ? join(
            legacyDirectory,
            process.platform === "win32" ? "vault-key.dpapi" : "vault-key.bin",
          )
        : undefined;
      const inherited =
        legacyFile && existsSync(legacyFile)
          ? readFileSync(legacyFile)
          : undefined;
      if (!inherited && this.store.all("vault").length)
        throw new Error(
          "Encrypted connections exist but their vault key is missing. Restore the original key; no replacement key was generated.",
        );
      const key = inherited
        ? process.platform === "win32"
          ? dpapi(inherited, true)
          : inherited
        : randomBytes(32);
      if (key.length !== 32)
        throw new Error(
          "The existing vault key is invalid. It was not replaced.",
        );
      // Verify the legacy key before migrating its protected envelope. Never re-key existing records.
      if (inherited) {
        this.key = key;
        for (const record of this.store.all<{ id: string }>("vault"))
          this.get(record.id);
      }
      writeFileSync(
        file,
        inherited || (process.platform === "win32" ? dpapi(key) : key),
        {
          mode: 0o600,
          flag: "wx",
        },
      );
    }
    const bytes = readFileSync(file);
    this.key = process.platform === "win32" ? dpapi(bytes, true) : bytes;
    if (this.key.length !== 32) throw new Error("Invalid vault key.");
    for (const record of this.store.all<{ id: string }>("vault"))
      this.get(record.id);
  }
  set(id: string, value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    this.store.put("vault", {
      id,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      encrypted: encrypted.toString("base64"),
    });
  }
  get<T>(id: string): T | undefined {
    const data = this.store.get<{ iv: string; tag: string; encrypted: string }>(
      "vault",
      id,
    );
    if (!data) return;
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(data.iv, "base64"),
    );
    cipher.setAAD(Buffer.from(id));
    cipher.setAuthTag(Buffer.from(data.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(data.encrypted, "base64")),
        cipher.final(),
      ]).toString("utf8"),
    );
  }
  remove(id: string) {
    this.store.remove("vault", id);
  }
}
type Owner = { id: string; salt: string; hash: string };
type Session = { id: string; csrf: string; expires: number };
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
export class OwnerAuth {
  private attempts = new Map<string, { count: number; start: number }>();
  constructor(private store: Store) {}
  configured() {
    return Boolean(this.store.get("auth_owner", "owner"));
  }
  setup(password: string) {
    if (this.configured())
      throw new HttpError(409, "Owner login is already configured.");
    this.validate(password);
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 32, {
      N: 32768,
      maxmem: 64 * 1024 * 1024,
    }).toString("hex");
    this.store.put("auth_owner", { id: "owner", salt, hash });
    this.store.audit("owner.setup");
  }
  validate(password: unknown): asserts password is string {
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 256
    )
      throw new HttpError(
        400,
        "Use a dashboard password between 12 and 256 characters.",
      );
  }
  login(password: string, address: string) {
    const at = Date.now();
    const old = this.attempts.get(address);
    const attempt =
      old && at - old.start < 15 * 60e3 ? old : { count: 0, start: at };
    this.attempts.set(address, attempt);
    if (attempt.count >= 5)
      throw new HttpError(429, "Too many login attempts. Wait 15 minutes.");
    attempt.count++;
    const owner = this.store.get<Owner>("auth_owner", "owner");
    if (!owner) throw new HttpError(409, "Set up your dashboard login first.");
    this.validate(password);
    const candidate = scryptSync(password, owner.salt, 32, {
      N: 32768,
      maxmem: 64 * 1024 * 1024,
    });
    if (!timingSafeEqual(candidate, Buffer.from(owner.hash, "hex")))
      throw new HttpError(401, "Invalid dashboard password.");
    this.attempts.delete(address);
    const token = randomBytes(32).toString("hex");
    const session = {
      id: digest(token),
      csrf: randomBytes(32).toString("hex"),
      expires: at + 12 * 3600000,
    };
    this.store.put("owner_sessions", session);
    for (const old of this.store.all<Session>("owner_sessions"))
      if (old.expires < at) this.store.remove("owner_sessions", old.id);
    return { token, session };
  }
  session(req: Request) {
    const token = req
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("fg_session="))
      ?.slice(11);
    if (!token) return;
    const session = this.store.get<Session>("owner_sessions", digest(token));
    if (session && session.expires > Date.now()) return session;
  }
  require(req: Request) {
    const s = this.session(req);
    if (!s || req.get("x-csrf-token") !== s.csrf)
      throw new HttpError(401, "Sign in to your local dashboard.");
    return s;
  }
  cookie(res: Response, token: string) {
    res.cookie("fg_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 3600000,
    });
  }
  logout(req: Request, res: Response) {
    const s = this.session(req);
    if (s) this.store.remove("owner_sessions", s.id);
    res.clearCookie("fg_session", { path: "/" });
  }
}
