import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { contentStorage } from "../lib/booong-content-storage.js";
import { normalizeMemberProfiles } from "../js/member-data.js";
import { importCatalogRows } from "../lib/lesson-catalog-store.js";

const [directory, ...args] = process.argv.slice(2);
if (!directory || args.some(arg => arg !== "--write")) throw new Error("Usage: node --env-file=.env.local scripts/migrate-booong-content.mjs BACKUP_DIRECTORY [--write]");
const manifest = JSON.parse(await readFile(resolve(directory, "blob-backup-manifest.json"), "utf8"));
const records = [];
for (const [name, file, path] of [["catalog", "catalog.json", "booong-lessons/catalog.json"], ["members", "profiles.json", "booong-members/profiles.json"]]) {
  const backup = manifest.files.find(item => item.file === file && item.path === path);
  assert.ok(backup, `Backup manifest missing ${file}`);
  const bytes = await readFile(resolve(directory, file));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), backup.sha256, `Backup checksum mismatch: ${file}`);
  const data = JSON.parse(bytes);
  if (name === "catalog") assert.deepEqual(importCatalogRows(data.rows, data.unitRows), { rows: data.rows, unitRows: data.unitRows });
  else { assert.ok(data.members.length); assert.deepEqual(normalizeMemberProfiles(data), data.members); }
  const source = await get(path, { access: "private", useCache: false, headers: { "accept-encoding": "identity" } });
  assert.equal(source?.statusCode, 200);
  assert.equal(source.blob.etag, backup.etag, `Blob changed since backup: ${path}`);
  assert.equal(createHash("sha256").update(Buffer.from(await new Response(source.stream).arrayBuffer())).digest("hex"), backup.sha256);
  const target = await contentStorage.read(name);
  if (target.data !== null) assert.deepEqual(target.data, data, `Existing Firebase ${name} differs; refusing to overwrite`);
  records.push({ name, data, target });
}
for (const { name, data, target } of records) {
  if (args.includes("--write") && target.data === null) await contentStorage.write(name, data, "null_etag");
  if (args.includes("--write") || target.data !== null) assert.deepEqual((await contentStorage.read(name)).data, data);
  console.log(`${name}: backup and Blob verified; ${args.includes("--write") ? "Firebase copy verified" : "dry run (no writes)"}`);
}
