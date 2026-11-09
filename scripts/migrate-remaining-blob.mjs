import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { list, get } from "@vercel/blob";
import { contentStorage, ContentConflictError } from "../lib/booong-content-storage.js";
import { thumbnailImages } from "../lib/thumbnail-image-storage.js";

const [directory, mode] = process.argv.slice(2);
if (!directory || !["--backup", "--copy", "--verify"].includes(mode)) throw new Error("Usage: node --env-file=.env.local scripts/migrate-remaining-blob.mjs BACKUP_DIRECTORY --backup|--copy|--verify");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sources = [{ name: "booong", token: process.env.BLOB_READ_WRITE_TOKEN }, { name: "workshop", token: process.env.RICE_BASKET_BLOB_READ_WRITE_TOKEN }];
const manifestFile = resolve(directory, "blob-backup-manifest.json");
async function sourceBytes(source, pathname) {
  const result = await get(pathname, { token: source.token, access: "private", useCache: false, headers: { "accept-encoding": "identity" } });
  assert.equal(result?.statusCode, 200, `Source unavailable: ${pathname}`);
  return { bytes: Buffer.from(await new Response(result.stream).arrayBuffer()), etag: result.blob.etag };
}
if (mode === "--backup") {
  const files = [];
  for (const source of sources) {
    assert.ok(source.token, `Missing ${source.name} source token`);
    let cursor;
    do {
      const page = await list({ token: source.token, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const blob of page.blobs) {
        assert.ok(source.name === "workshop" ? blob.pathname === "workshop/store.json"
          : /^(?:booong-lessons\/catalog\.json|booong-members\/profiles\.json|booong-thumbnails\/manifest\.json|booong-thumbnails\/images\/[0-9a-f-]{36}\.(?:png|webp))$/.test(blob.pathname), "Unexpected source path");
        const { bytes, etag } = await sourceBytes(source, blob.pathname);
        assert.equal(bytes.length, blob.size);
        const file = `${source.name}/${blob.pathname}`;
        await mkdir(dirname(resolve(directory, file)), { recursive: true });
        await writeFile(resolve(directory, file), bytes, { flag: "wx", mode: 0o600 });
        files.push({ source: source.name, path: blob.pathname, file, etag, bytes: bytes.length, sha256: hash(bytes) });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  await writeFile(manifestFile, JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ backupFiles: files.length, bytes: files.reduce((n, file) => n + file.bytes, 0) }));
} else {
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const records = new Map();
  for (const file of manifest.files) {
    assert.ok(!file.file.includes("..") && !file.file.startsWith("/"));
    const bytes = await readFile(resolve(directory, file.file));
    assert.equal(hash(bytes), file.sha256, `Backup changed: ${file.path}`);
    const source = sources.find(source => source.name === file.source);
    const current = await sourceBytes(source, file.path);
    assert.equal(current.etag, file.etag, `Source changed since backup: ${file.path}`);
    assert.equal(hash(current.bytes), file.sha256);
    if (file.path === "workshop/store.json") records.set("workshop", JSON.parse(bytes));
    if (file.path === "booong-thumbnails/manifest.json") records.set("thumbnails", JSON.parse(bytes));
    if (file.path.startsWith("booong-thumbnails/images/")) {
      const name = file.path.split("/").at(-1);
      if (mode === "--copy") {
        try { await thumbnailImages.write(name, bytes); }
        catch (error) { if (!(error instanceof ContentConflictError)) throw error; }
      }
      assert.deepEqual(await thumbnailImages.read(name), bytes, `Firebase image differs: ${name}`);
    }
  }
  assert.equal(records.size, 2);
  assert.equal(records.get("workshop").schemaVersion, 3);
  for (const record of Object.values(records.get("thumbnails"))) {
    for (const url of [record.url, record.previousUrl].filter(Boolean)) {
      const name = new URL(url, "https://booong.vercel.app").searchParams.get("image");
      assert.ok(manifest.files.some(file => file.path === `booong-thumbnails/images/${name}`), "Referenced thumbnail missing");
    }
  }
  for (const [name, data] of records) {
    const target = await contentStorage.read(name);
    if (target.data !== null) assert.deepEqual(target.data, data, `Existing Firebase ${name} differs; refusing to overwrite`);
    else if (mode === "--copy") await contentStorage.write(name, data, "null_etag");
    assert.deepEqual((await contentStorage.read(name)).data, data, `Firebase ${name} differs`);
  }
  console.log(JSON.stringify({ verifiedFiles: manifest.files.length, firebaseRecords: [...records.keys()], mode }));
}
