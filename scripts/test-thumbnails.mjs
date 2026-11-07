import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { thumbnailCrop, thumbnailUrl, encodeThumbnail, THUMBNAIL_MAX_BYTES } from "../js/thumbnail-data.js";
import { createThumbnailStore, validThumbnailId, validateThumbnailWebp } from "../lib/thumbnail-store.js";
import { withLocalAdmin } from "../lib/local-admin.js";
import { createThumbnailReadCache, createThumbnailRequestGuard, thumbnailClientIp, THUMBNAIL_CACHE_SECONDS, THUMBNAIL_REQUESTS_PER_MINUTE } from "../lib/thumbnail-reads.js";

let time = 1000, manifestReads = 0, imageReads = 0;
const imageName = "11111111-1111-4111-8111-111111111111.webp";
const imageUrl = `/api/lesson-thumbnails?image=${imageName}`;
let stored = { lesson: { url: imageUrl, previousUrl: null, revision: "private-revision" } };
let release;
const cachedReads = createThumbnailReadCache({
  load() { manifestReads++; const snapshot = stored; return new Promise(resolve => { release = () => resolve({ thumbnails: snapshot }); }); },
  async image() { imageReads++; return Buffer.from("immutable-image"); },
}, () => time);
const concurrentLists = Array.from({ length: 25 }, () => cachedReads.list());
assert.equal(manifestReads, 1, "Concurrent public requests share one storage read");
release();
const lists = await Promise.all(concurrentLists);
assert.deepEqual(lists[0], { lesson: { url: imageUrl } }, "Public cache never contains private revision or previous URL fields");
await cachedReads.list(); assert.equal(manifestReads, 1);
await Promise.all(Array.from({ length: 25 }, () => cachedReads.image(imageName)));
assert.equal(imageReads, 1, "Concurrent and subsequent image requests share immutable bytes");
await cachedReads.image(imageName); assert.equal(imageReads, 1);
await assert.rejects(cachedReads.image("22222222-2222-4222-8222-222222222222.webp"), { status: 404 });
assert.equal(imageReads, 1, "Guessed image IDs never reach storage");
time += THUMBNAIL_CACHE_SECONDS * 1000 + 1;
const expiredList = cachedReads.list(); assert.equal(manifestReads, 2); release(); await expiredList;
stored = { lesson: { url: null, previousUrl: imageUrl, revision: "new-revision" } };
cachedReads.clear();
const updatedList = cachedReads.list(); release(); assert.equal((await updatedList).lesson.url, null);
await cachedReads.image(imageName); assert.equal(imageReads, 1, "A previous image remains readable for existing cards");
let failures = 0;
const failingCache = createThumbnailReadCache({ async load() { failures++; throw new Error("offline"); } }, () => time);
await assert.rejects(failingCache.list()); await assert.rejects(failingCache.list());
assert.equal(failures, 1, "Storage failures use a short retry cooldown");
time += 10_001; await assert.rejects(failingCache.list()); assert.equal(failures, 2);
const waitingReads = [];
const racingCache = createThumbnailReadCache({ load: () => new Promise(resolve => waitingReads.push(resolve)) }, () => time);
const beforeWrite = racingCache.list(); racingCache.clear(); const afterWrite = racingCache.list();
waitingReads[0]({ thumbnails: { lesson: { url: "old" } } });
waitingReads[1]({ thumbnails: { lesson: { url: "new" } } });
assert.equal((await beforeWrite).lesson.url, "new");
assert.equal((await afterWrite).lesson.url, "new", "An old in-flight read cannot overwrite a cache invalidation");
const cacheNames = Array.from({ length: 17 }, (_, index) => `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111.webp`);
let largeImageReads = 0;
const boundedImages = createThumbnailReadCache({
  async load() { return { thumbnails: Object.fromEntries(cacheNames.map((name, index) => [index, { url: `/api/lesson-thumbnails?image=${name}` }])) }; },
  async image() { largeImageReads++; return Buffer.alloc(2 * 1024 * 1024); },
}, () => time);
for (const name of cacheNames) await boundedImages.image(name);
await boundedImages.image(cacheNames[0]);
assert.equal(largeImageReads, 18, "The image cache evicts old bytes instead of growing beyond 32MB");
const limit = createThumbnailRequestGuard(() => time);
for (let i = 0; i < THUMBNAIL_REQUESTS_PER_MINUTE; i++) assert.equal(limit("192.0.2.1"), 0);
assert.equal(limit("192.0.2.1"), 60);
assert.equal(limit("192.0.2.2"), 0, "A different client keeps its budget");
time += 30_000; assert.equal(limit("192.0.2.1"), 30);
time += 30_001; assert.equal(limit("192.0.2.1"), 0);
const vercelEnvironment = process.env.VERCEL;
try {
  delete process.env.VERCEL;
  const request = { headers: { "x-forwarded-for": "192.0.2.8", "x-vercel-forwarded-for": "192.0.2.9" }, socket: { remoteAddress: "127.0.0.1" } };
  assert.equal(thumbnailClientIp(request), "127.0.0.1", "Local callers cannot rotate their key with a spoofed proxy header");
  process.env.VERCEL = "1";
  assert.equal(thumbnailClientIp(request), "192.0.2.9", "Production uses the Vercel-supplied client IP");
} finally { if (vercelEnvironment === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercelEnvironment; }

assert.deepEqual(thumbnailCrop(1600, 1000), { sx: 0, sy: 0, sw: 1600, sh: 1000 });
assert.deepEqual(thumbnailCrop(1000, 1000), { sx: 0, sy: 187.5, sw: 1000, sh: 625 });
assert.deepEqual(thumbnailCrop(1600, 1000, 2, 0, 1), { sx: 0, sy: 500, sw: 800, sh: 500 });
assert.deepEqual(thumbnailCrop(1600, 1000, 9, -1, 2), thumbnailCrop(1600, 1000, 4, 0, 1));
assert.throws(() => thumbnailCrop(0, 10));
assert.throws(() => thumbnailCrop(10, NaN));
assert.equal(thumbnailUrl({ id: "group-2", thumbnailUrl: "/sheet.jpg" }, { url: "/managed.webp" }), "/managed.webp");
assert.equal(thumbnailUrl({ id: "group-2", thumbnailUrl: "/sheet.jpg" }, { url: null }), "/sheet.jpg");
assert.equal(thumbnailUrl({ id: "group-2" }), "/assets/lesson-thumbnails/apps/group-2.jpg");
assert.ok(validThumbnailId("resource-한글-수업-1"));
for (const id of ["../secret", "__proto__", "constructor", "", "x".repeat(241), null]) assert.equal(validThumbnailId(id), false);

// Container fixtures exercise header validation; the browser check covers actual encoding.
function webpFixture(type = 'VP8 ', width = 800, height = 500) {
  const payload = Buffer.alloc(type === 'VP8L' ? 9 : 10);
  if (type === 'VP8L') {
    payload[0] = 0x2f; payload.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  } else {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(payload, 3); payload.writeUInt16LE(width, 6); payload.writeUInt16LE(height, 8);
  }
  const bytes = Buffer.alloc(20 + payload.length + payload.length % 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WEBP', 8);
  bytes.write(type, 12); bytes.writeUInt32LE(payload.length, 16); payload.copy(bytes, 20);
  return bytes;
}
function extendedWebp(width = 800, flags = 0) {
  const chunk = Buffer.alloc(18); chunk.write('VP8X'); chunk.writeUInt32LE(10, 4);
  chunk[8] = flags; chunk.writeUIntLE(width - 1, 12, 3); chunk.writeUIntLE(499, 15, 3);
  const base = webpFixture(); const bytes = Buffer.concat([base.subarray(0, 12), chunk, base.subarray(12)]);
  bytes.writeUInt32LE(bytes.length - 8, 4); return bytes;
}
const webp = webpFixture();
for (const bytes of [webp, webpFixture('VP8L'), extendedWebp()]) validateThumbnailWebp(bytes);
for (const value of [Buffer.from('<svg/>'), Buffer.alloc(0), Buffer.alloc(THUMBNAIL_MAX_BYTES + 1), webpFixture('VP8 ', 799), extendedWebp(1600), extendedWebp(800, 2), webp.subarray(0, -1)]) assert.throws(() => validateThumbnailWebp(value));
const malformed = Buffer.from(webp); malformed.writeUInt32LE(99999, 16); assert.throws(() => validateThumbnailWebp(malformed));
const duplicates = Buffer.concat([webp, webp.subarray(12)]); duplicates.writeUInt32LE(duplicates.length - 8, 4); assert.throws(() => validateThumbnailWebp(duplicates));
const encoded = await encodeThumbnail({ toBlob(callback, type, quality) { assert.equal(type, 'image/webp'); assert.equal(quality, 0.85); callback(new Blob(['webp'], { type })); } });
assert.equal(encoded.type, 'image/webp');
for (const image of [null, new Blob(['png'], { type: 'image/png' }), new Blob([new Uint8Array(THUMBNAIL_MAX_BYTES + 1)], { type: 'image/webp' })]) await assert.rejects(encodeThumbnail({ toBlob: callback => callback(image) }));
const legacyName = '33333333-3333-4333-8333-333333333333.png';
const legacyUrl = `/api/lesson-thumbnails?image=${legacyName}`;
const legacyPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const directory = await mkdtemp(join(tmpdir(), "booong-thumbnails-"));
const cwd = process.cwd(), environment = process.env.NODE_ENV;
try {
  const store = createThumbnailStore({ directory: join(directory, "store") });
  assert.deepEqual((await store.load()).thumbnails, {});
  const first = await store.save("group-2", null, webp);
  assert.ok(first.url.startsWith("/api/lesson-thumbnails?image="));
  assert.ok(first.url.endsWith(".webp"));
  assert.equal(first.previousUrl, null);
  const file = new URL(first.url, "http://localhost").searchParams.get("image");
  assert.deepEqual(await store.image(file), webp);
  await assert.rejects(store.image("../manifest.json"), { status: 404 });
  await assert.rejects(store.save("group-2", null, webp), { status: 409 });
  await assert.rejects(store.save("group-3", null, undefined, true), { status: 400 });
  const restored = await store.save("group-2", first.revision, undefined, true);
  assert.equal(restored.url, null);
  assert.equal(restored.previousUrl, first.url);
  const redo = await store.save("group-2", restored.revision, undefined, true);
  assert.equal(redo.url, first.url);
  const concurrent = await Promise.allSettled([store.save("group-2", redo.revision, webp), store.save("group-2", redo.revision, webp)]);
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.find(result => result.status === "rejected").reason.status, 409);
  assert.equal(Object.keys((await createThumbnailStore({ directory: join(directory, "store") }).load()).thumbnails).length, 1, "Saved state survives a process restart");
  const legacyRevision = "33333333-3333-4333-8333-333333333333";
  const state = await store.load();
  state.thumbnails.legacy = { url: legacyUrl, previousUrl: null, revision: legacyRevision };
  await writeFile(join(directory, "store", legacyName), legacyPng);
  await writeFile(join(directory, "store", "manifest.json"), JSON.stringify(state.thumbnails));
  const migrated = await store.save("legacy", legacyRevision, webp);
  assert.ok(migrated.url.endsWith(".webp"));
  assert.equal(migrated.previousUrl, legacyUrl);
  const oldImage = await store.save("legacy", migrated.revision, undefined, true);
  assert.equal(oldImage.url, legacyUrl);
  assert.deepEqual(await store.image(legacyName), legacyPng);

  process.chdir(directory); process.env.NODE_ENV = "development";
  await mkdir(join(directory, ".data/lesson-thumbnails"), { recursive: true });
  await writeFile(join(directory, ".data/lesson-thumbnails", legacyName), legacyPng);
  await writeFile(join(directory, ".data/lesson-thumbnails/manifest.json"), JSON.stringify({ legacy: { url: legacyUrl, previousUrl: null, revision: legacyRevision } }));
  const { default: handler } = await import(`../api/admin.js?test=${Date.now()}`);
  async function request(url, { method = "GET", authorized = false, origin = "http://127.0.0.1:8765", bytes, contentType = "image/webp" } = {}) {
    const req = Readable.from(bytes ? [bytes] : []);
    Object.assign(req, { method, url, headers: { host: "127.0.0.1:8765", origin, ...(bytes ? { "content-type": contentType, "content-length": String(bytes.length) } : {}) }, socket: { remoteAddress: "127.0.0.1" } });
    const headers = {};
    const res = { setHeader(name, value) { headers[name.toLowerCase()] = value; }, end(value) { this.raw = value; this.body = Buffer.isBuffer(value) ? value : JSON.parse(value); } };
    if (authorized) await withLocalAdmin(req, () => handler(req, res)); else await handler(req, res);
    return { ...res, headers };
  }
  assert.equal((await request("/api/lesson-thumbnails?admin=1")).statusCode, 401);
  assert.equal((await request("/api/admin?thumbnail=1")).statusCode, 200, "The deployed rewrite shares the existing admin function");
  assert.equal((await request("/api/admin?thumbnail=1&admin=1")).statusCode, 401);
  assert.equal((await request("/api/admin?thumbnail=1&nonce=1")).statusCode, 400);
  assert.equal((await request("/api/admin?thumbnail=1&thumbnail=0")).statusCode, 400);
  assert.equal((await request("/api/admin?thumbnail=0")).statusCode, 400);
  assert.equal((await request(legacyUrl)).headers["content-type"], "image/png");
  assert.equal((await request("/api/lesson-thumbnails?id=group-2", { method: "POST", bytes: webp })).statusCode, 401);
  assert.equal((await request("/api/lesson-thumbnails", { method: "DELETE" })).statusCode, 405);
  assert.equal((await request("/api/lesson-thumbnails?id=group-2", { method: "POST", authorized: true, origin: "https://evil.example", bytes: webp })).statusCode, 401);
  const uploaded = await request("/api/lesson-thumbnails?id=group-2", { method: "POST", authorized: true, bytes: webp });
  assert.equal(uploaded.statusCode, 200);
  assert.equal(uploaded.headers["cache-control"], "no-store");
  const publicList = await request("/api/lesson-thumbnails");
  assert.deepEqual(Object.keys(publicList.body.thumbnails["group-2"]), ["url"]);
  assert.equal(publicList.headers["vercel-cdn-cache-control"], "max-age=30");
  const adminList = await request("/api/lesson-thumbnails?admin=1", { authorized: true });
  assert.equal(adminList.headers["cache-control"], "no-store");
  assert.equal(adminList.headers["vercel-cdn-cache-control"], "no-store");
  for (const query of ["?nonce=1", "?admin=0", "?admin=1&image=x", "?image=x&image=y", "?image=x&nonce=1"]) {
    const rejected = await request(`/api/lesson-thumbnails${query}`);
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.headers["vercel-cdn-cache-control"], "no-store");
  }
  assert.equal((await request(uploaded.body.thumbnail.url)).headers["content-type"], "image/webp");
  assert.equal((await request("/api/lesson-thumbnails?image=../manifest.json")).statusCode, 404);
  assert.equal((await request("/api/lesson-thumbnails?id=__proto__", { method: "POST", authorized: true, bytes: webp })).statusCode, 400);
  assert.equal((await request("/api/lesson-thumbnails?id=group-3", { method: "POST", authorized: true, bytes: webp, contentType: "image/svg+xml" })).statusCode, 415);
  assert.equal((await request("/api/lesson-thumbnails?id=group-3", { method: "POST", authorized: true, bytes: webp, contentType: "image/png" })).statusCode, 415);
  assert.equal((await request("/api/lesson-thumbnails?id=group-3", { method: "POST", authorized: true, bytes: legacyPng })).statusCode, 400);
  assert.equal((await request("/api/lesson-thumbnails?id=group-3", { method: "POST", authorized: true, bytes: Buffer.alloc(THUMBNAIL_MAX_BYTES + 1) })).statusCode, 413);
  assert.equal((await request("/api/lesson-thumbnails?id=group-2", { method: "POST", authorized: true, bytes: webp })).statusCode, 409);
  const revision = uploaded.body.thumbnail.revision;
  assert.equal((await request(`/api/lesson-thumbnails?id=group-2&revision=${revision}&restore=1`, { method: "POST", authorized: true })).body.thumbnail.url, null);
  assert.equal((await request("/api/lesson-thumbnails")).body.thumbnails["group-2"].url, null, "Writes invalidate the public server cache");
  assert.ok((await readFile(join(directory, ".data/lesson-thumbnails/manifest.json"), "utf8")).includes("group-2"));
  let blocked;
  for (let index = 0; index <= THUMBNAIL_REQUESTS_PER_MINUTE; index++) {
    blocked = await request("/api/lesson-thumbnails");
    if (blocked.statusCode === 429) break;
  }
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  assert.equal(blocked.headers["cache-control"], "no-store");
  assert.equal(blocked.headers["vercel-cdn-cache-control"], "no-store");
} finally {
  process.chdir(cwd);
  if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment;
  await rm(directory, { recursive: true, force: true });
}
console.log("Thumbnails: crop/WebP validation, auth/origin isolation, conflicts, persistence, restore, cache TTL/invalidation/coalescing, image allowlist, failure cooldown, query rejection and request limits passed.");
