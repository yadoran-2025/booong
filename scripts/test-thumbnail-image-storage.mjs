import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { createThumbnailImages, THUMBNAIL_BUCKET, THUMBNAIL_PREFIX } from "../lib/thumbnail-image-storage.js";
import { createThumbnailStore } from "../lib/thumbnail-store.js";
import { BOOONG_CONTENT_ACCOUNT, ContentConflictError } from "../lib/booong-content-storage.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = { type: "service_account", project_id: "yadoran-2025", client_email: BOOONG_CONTENT_ACCOUNT, private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
const credentials = Buffer.from(JSON.stringify(account)).toString("base64");
const key = await importSPKI(publicKey.export({ type: "spki", format: "pem" }), "RS256");
const name = "11111111-1111-4111-8111-111111111111.webp", bytes = Buffer.from("image-bytes");
let authCalls = 0, requests = 0, status = 200;
const images = createThumbnailImages({ credentials, fetcher: async (input, options) => {
  const url = new URL(input);
  assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
  if (url.hostname === "oauth2.googleapis.com") {
    authCalls++;
    const form = new URLSearchParams(options.body);
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    const { payload } = await jwtVerify(form.get("assertion"), key, { issuer: BOOONG_CONTENT_ACCOUNT, audience: "https://oauth2.googleapis.com/token" });
    assert.equal(payload.scope, "https://www.googleapis.com/auth/devstorage.read_write");
    return Response.json({ access_token: "private-token", expires_in: 3600 });
  }
  requests++;
  assert.equal(options.headers.Authorization, "Bearer private-token");
  assert.equal(url.origin, "https://storage.googleapis.com");
  if (status !== 200) return new Response("error", { status });
  if (options.method === "POST") {
    assert.equal(url.pathname, `/upload/storage/v1/b/${THUMBNAIL_BUCKET}/o`);
    assert.equal(url.searchParams.get("ifGenerationMatch"), "0", "Immutable images cannot overwrite existing objects");
    assert.equal(url.searchParams.get("uploadType"), "multipart");
    const body = options.body.toString();
    assert.ok(body.includes(`"name":"${THUMBNAIL_PREFIX + name}"`));
    assert.ok(body.includes('"cacheControl":"private, no-store"'));
    assert.ok(!body.includes("firebaseStorageDownloadTokens"));
    assert.ok(options.body.includes(bytes));
    return Response.json({ name: THUMBNAIL_PREFIX + name, generation: "1" });
  }
  assert.equal(decodeURIComponent(url.pathname), `/storage/v1/b/${THUMBNAIL_BUCKET}/o/${THUMBNAIL_PREFIX + name}`);
  assert.equal(url.searchParams.get("alt"), "media");
  return new Response(bytes);
} });
await Promise.all([images.write(name, bytes), images.read(name)]);
assert.equal(authCalls, 1, "Concurrent requests share authentication");
assert.deepEqual(await images.read(name), bytes);
for (const invalid of ["../textbooks/other.pdf", "image.svg", "", null]) await assert.rejects(images.read(invalid), /Invalid thumbnail/);
await assert.rejects(images.write(name, Buffer.alloc(2 * 1024 * 1024 + 1)), /Invalid thumbnail/);
assert.equal(requests, 3, "Rejected paths and bytes never contact storage");
status = 404; assert.equal(await images.read(name), null);
status = 412; await assert.rejects(images.write(name, bytes), ContentConflictError);
status = 401; await assert.rejects(images.read(name), /storage unavailable/);
status = 200; await images.read(name); assert.equal(authCalls, 2);
for (const invalid of [{ project_id: "other" }, { client_email: "other@example.com" }]) {
  const storage = createThumbnailImages({ credentials: Buffer.from(JSON.stringify({ ...account, ...invalid })).toString("base64"), fetcher: () => assert.fail("Wrong identity must not reach network") });
  await assert.rejects(storage.read(name), /Wrong BOOONG/);
}

let revision = "one", state = { lesson: { url: `/api/lesson-thumbnails?image=${name}`, previousUrl: null, revision: "old" } };
const storage = {
  async read(record) { assert.equal(record, "thumbnails"); return { data: structuredClone(state), etag: revision }; },
  async write(record, value, etag) {
    assert.equal(record, "thumbnails"); assert.equal(etag, "one");
    if (revision !== etag) throw new ContentConflictError();
    state = structuredClone(value); revision = "two";
  },
};
const store = createThumbnailStore({ storage, images });
assert.deepEqual(await store.image(name), bytes);
assert.equal((await store.save("lesson", "old", undefined, true)).url, null);
revision = "stale";
const stale = createThumbnailStore({ storage: { ...storage, read: async () => ({ data: structuredClone(state), etag: "one" }) }, images });
await assert.rejects(stale.save("lesson", state.lesson.revision, undefined, true), { status: 409 });
await assert.rejects(createThumbnailStore({ storage: { read: async () => ({ data: null }) } }).load(), /unavailable/);
console.log("Firebase thumbnail image isolation, immutable uploads, private objects, authentication, manifest conflicts and failures passed.");
