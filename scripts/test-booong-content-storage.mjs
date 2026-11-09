import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { importSPKI, jwtVerify } from "jose";
import { createContentStorage, ContentConflictError, BOOONG_CONTENT_ACCOUNT, BOOONG_CONTENT_DATABASE } from "../lib/booong-content-storage.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = { type: "service_account", project_id: "yadoran-2025", client_email: BOOONG_CONTENT_ACCOUNT, private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
const credentials = Buffer.from(JSON.stringify(account)).toString("base64");
const key = await importSPKI(publicKey.export({ type: "spki", format: "pem" }), "RS256");
const records = { catalog: { rows: [{ resource_id: "same-id", "열.이름": "보존" }], unitRows: [], empty: [], none: null }, members: { members: [] }, thumbnails: {}, workshop: { schemaVersion: 3, pages: [], sessions: [] } };
let authCalls = 0, reads = 0, revision = '"one"', failStatus = 0, invalidBody, missingEtag = false;
const storage = createContentStorage({ credentials, fetcher: async (url, options) => {
  url = new URL(url);
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  if (url.hostname === "identitytoolkit.googleapis.com") {
    authCalls++;
    const { payload } = await jwtVerify(JSON.parse(options.body).token, key, { issuer: BOOONG_CONTENT_ACCOUNT, subject: BOOONG_CONTENT_ACCOUNT, audience: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" });
    assert.equal(payload.uid, "booong-content-server");
    assert.deepEqual(payload.claims, { booongContent: true });
    return Response.json({ idToken: "server-id-token", expiresIn: "3600" });
  }
  assert.equal(url.origin, BOOONG_CONTENT_DATABASE);
  assert.equal(url.searchParams.get("auth"), "server-id-token");
  assert.equal(options.headers["X-Firebase-ETag"], "true");
  const name = url.pathname.match(/^\/content\/(catalog|members|thumbnails|workshop)\.json$/)?.[1];
  assert.ok(name);
  if (failStatus) return new Response("unavailable", { status: failStatus });
  if (options.method === "PUT") {
    if (options.headers["if-match"] !== revision) return new Response("conflict", { status: 412 });
    records[name] = JSON.parse(JSON.parse(options.body));
    revision = '"two"';
  } else reads++;
  return Response.json(invalidBody === undefined ? JSON.stringify(records[name]) : invalidBody, { headers: missingEtag ? {} : { etag: revision } });
} });
const original = structuredClone(records.catalog);
assert.deepEqual(await storage.read("catalog"), { data: original, etag: '"one"' });
assert.deepEqual(await storage.write("catalog", original, '"one"'), { etag: '"two"' });
assert.deepEqual((await storage.read("catalog")).data, original, "Empty arrays, nulls, IDs and original keys survive round trip");
await assert.rejects(storage.write("catalog", { rows: [] }, '"one"'), ContentConflictError);
assert.deepEqual(records.catalog, original, "A stale writer cannot overwrite current content");
assert.equal(authCalls, 1);
await Promise.all([storage.read("catalog"), storage.read("members"), storage.read("thumbnails"), storage.read("workshop")]);
assert.equal(authCalls, 1);
for (const name of ["../watcha", "analytics", "catalog/child", "", "toString"]) await assert.rejects(storage.read(name), /Invalid BOOONG/);
for (const etag of [null, undefined, "", "bad\r\nheader"]) await assert.rejects(storage.write("catalog", {}, etag), /revision required/);
await assert.rejects(storage.write("catalog", "x".repeat(8 * 1024 * 1024), revision), /too large/);
assert.equal(reads, 6, "Rejected paths and writes do not contact the database");
invalidBody = {}; await assert.rejects(storage.read("catalog"), /Invalid BOOONG content format/);
invalidBody = "broken"; await assert.rejects(storage.read("catalog"), SyntaxError);
invalidBody = null; assert.equal((await storage.read("catalog")).data, null);
invalidBody = undefined; missingEtag = true; await assert.rejects(storage.read("catalog"), /revision unavailable/); missingEtag = false;
failStatus = 401; await assert.rejects(storage.read("members"), /storage unavailable/);
failStatus = 0; await storage.read("members"); assert.equal(authCalls, 2, "Expired authentication is refreshed on retry");
failStatus = 503; await assert.rejects(storage.write("catalog", original, revision), /storage unavailable/);
for (const change of [{ project_id: "other-project" }, { client_email: "watcha-cache@yadoran-2025.iam.gserviceaccount.com" }]) {
  const invalid = createContentStorage({ credentials: Buffer.from(JSON.stringify({ ...account, ...change })).toString("base64"), fetcher: () => { assert.fail("Wrong credentials must not reach the network"); } });
  await assert.rejects(invalid.read("catalog"), /Wrong BOOONG content credentials/);
}
const { rules } = JSON.parse(await readFile(new URL("../booong-content.database.rules.json", import.meta.url)));
assert.equal(rules[".read"], false); assert.equal(rules[".write"], false);
assert.match(rules.content.$record[".write"], /booongContent.*catalog.*members.*thumbnails.*workshop.*newData.exists/);
console.log("BOOONG content isolation, custom authentication, lossless JSON, conditional writes and failures passed.");
