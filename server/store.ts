import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { settingsSchema, type Settings } from "../shared/model.ts";

export class Store {
  db: DatabaseSync;
  private depth = 0;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS dedup (key TEXT PRIMARY KEY, job_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
      PRAGMA user_version=1;`);
    if (!this.get("settings", "owner"))
      this.put("settings", { id: "owner", ...settingsSchema.parse({}) });
  }
  all<T>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid DESC")
        .all(kind) as { body: string }[]
    ).map((r) => JSON.parse(r.body));
  }
  get<T>(kind: string, id: string): T | undefined {
    const r = this.db
      .prepare("SELECT body FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { body: string } | undefined;
    return r ? JSON.parse(r.body) : undefined;
  }
  require<T>(kind: string, id: string): T {
    const v = this.get<T>(kind, id);
    if (!v) throw new HttpError(404, `${kind} not found`);
    return v;
  }
  put<T extends { id: string }>(kind: string, value: T): T {
    this.db
      .prepare(
        "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      )
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  remove(kind: string, id: string) {
    this.db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  }
  transaction<T>(fn: () => T): T {
    const level = this.depth++;
    const savepoint = `nested_${level}`;
    this.db.exec(level ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec(level ? `RELEASE ${savepoint}` : "COMMIT");
      return value;
    } catch (e) {
      this.db.exec(level ? `ROLLBACK TO ${savepoint}` : "ROLLBACK");
      if (level) this.db.exec(`RELEASE ${savepoint}`);
      throw e;
    } finally {
      this.depth--;
    }
  }
  settings(): Settings {
    return this.require<Settings>("settings", "owner");
  }
  audit(event: string, entityId = "", detail = "") {
    this.put("audit", {
      id: randomUUID(),
      event,
      entityId,
      detail,
      createdAt: new Date().toISOString(),
    });
  }
  close() {
    this.db.close();
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
