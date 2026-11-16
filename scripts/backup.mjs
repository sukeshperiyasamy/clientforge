import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const source = resolve(process.env.DATA_DIR || "data");
const destination = join(
  source,
  "backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(destination, { recursive: true });
const live = new DatabaseSync(join(source, "clientforge.sqlite"), {
  readOnly: true,
});
await backup(live, join(destination, "clientforge.sqlite"));
live.close();
const snapshot = new DatabaseSync(join(destination, "clientforge.sqlite"), {
  readOnly: true,
});
const assets = snapshot
  .prepare("SELECT body FROM records WHERE kind='assets'")
  .all();
mkdirSync(join(destination, "uploads"), { recursive: true });
for (const row of assets) {
  const asset = JSON.parse(row.body);
  cpSync(
    join(source, "uploads", asset.id),
    join(destination, "uploads", asset.id),
  );
}
snapshot.close();
writeFileSync(
  join(destination, "README.txt"),
  "ClientForge consistent database and media snapshot. Stop ClientForge before restoring. Copy clientforge.sqlite and uploads into DATA_DIR. Preserve .env separately. Postiz Docker volumes require separate backups.\n",
);
console.log(`Backup saved: ${destination}`);
