let token = "";
export class AuthRequired extends Error {
  constructor(public needsSetup: boolean) {
    super("Sign in to your dashboard.");
  }
}
export async function session() {
  const r = await fetch("/api/session");
  const data = await r.json();
  if (r.status === 401) throw new AuthRequired(Boolean(data.needsSetup));
  if (!r.ok) throw new Error("Could not start a local session.");
  token = data.csrf;
}
export async function signIn(password: string, setup = false) {
  const r = await fetch(`/api/auth/${setup ? "setup" : "login"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Sign-in failed.");
  token = data.csrf;
}
export async function screenshotFile(file: string) {
  const r = await fetch(
    `/api/browser/screenshots/${encodeURIComponent(file)}`,
    { headers: { "x-csrf-token": token } },
  );
  if (!r.ok) throw new Error("Screenshot is unavailable.");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: {
      "x-csrf-token": token,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status === 401)
    window.dispatchEvent(new Event("owner-session-expired"));
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
export async function upload(file: File) {
  const response = await fetch("/api/assets", {
    method: "POST",
    headers: {
      "x-csrf-token": token,
      "Content-Type": file.type,
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed");
  return result;
}
export async function exportData() {
  const data = await api("/export");
  download(
    "clientforge-export.json",
    JSON.stringify(data, null, 2),
    "application/json",
  );
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
