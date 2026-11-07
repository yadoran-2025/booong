import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { MEMBER_PROFILE_SHEET_URL } from "../js/member-data.js";

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const key = { ...await exportJWK(publicKey), kid: "test-admin", alg: "RS256", use: "sig" };
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
// Keep the fake clock behind real time to catch token timestamps that ignore it.
let now = originalNow() - 1500;
Date.now = () => now;
let sheet = "id,name,admin\nDo,관리자, Admin@Example.com \nOther,일반 멤버,\n";
let sheetAvailable = true, sheetReads = 0;
globalThis.fetch = async input => {
  const url = String(input);
  if (url === "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com") {
    return new Response(JSON.stringify({ keys: [key] }), { headers: { "content-type": "application/json" } });
  }
  const sheetUrl = new URL(url);
  assert.match(sheetUrl.searchParams.get("_") || "", /^\d+$/);
  sheetUrl.searchParams.delete("_");
  assert.equal(sheetUrl.href, MEMBER_PROFILE_SHEET_URL);
  sheetReads++;
  return new Response(sheet, { status: sheetAvailable ? 200 : 503 });
};

try {
  const { default: admin } = await import("../api/admin.js");
  async function token(overrides = {}, audience = "yadoran-2025", issuer = "https://securetoken.google.com/yadoran-2025", expiry = "5m") {
    return new SignJWT({ email: "admin@example.com", email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "google.com" }, ...overrides })
      .setProtectedHeader({ alg: "RS256", kid: "test-admin" }).setSubject("google-user")
      .setAudience(audience).setIssuer(issuer).setIssuedAt(Math.floor(Date.now() / 1000)).setExpirationTime(expiry).sign(privateKey);
  }
  async function request(value, method = "GET") {
    const headers = new Map();
    const res = { setHeader(name, value) { headers.set(name, value); }, end(body) { this.body = JSON.parse(body); } };
    await admin({ method, headers: value ? { authorization: `Bearer ${value}` } : {} }, res);
    assert.equal(headers.get("Cache-Control"), "no-store");
    return res;
  }

  assert.equal((await request()).statusCode, 401);
  assert.equal((await request("forged")).statusCode, 401);
  assert.equal(sheetReads, 0);
  const valid = await token();
  assert.equal((await request(valid)).statusCode, 200);
  assert.equal((await request(await token({ email: "other@example.com" }))).statusCode, 403);
  assert.equal((await request(await token({ email_verified: false }))).statusCode, 401);
  assert.equal((await request(await token({ firebase: { sign_in_provider: "password" } }))).statusCode, 401);
  assert.equal((await request(await token({}, "other-project"))).statusCode, 401);
  assert.equal((await request(await token({}, "yadoran-2025", "https://evil.example"))).statusCode, 401);
  assert.equal((await request(await token({}, "yadoran-2025", "https://securetoken.google.com/yadoran-2025", "-1s"))).statusCode, 401);
  assert.equal((await request(valid, "POST")).statusCode, 405);

  const { default: textbookApi } = await import("../api/textbooks.js");
  const textbookQuery = `/api/textbooks?${new URLSearchParams({ book: "visang-social2-2015", unit: "사회2[15개정]::VIII. 사람이 만든 삶터, 도시", chapter: "2" })}`;
  const textbookRequest = { method: "GET", url: textbookQuery, headers: { authorization: `Bearer ${valid}` } };
  function response() {
    const headers = new Map();
    return { headers, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, end(body = "") { this.body = body; } };
  }
  for (const value of [null, "forged", await token({ email_verified: false }), await token({ firebase: { sign_in_provider: "password" } }), await token({}, "other-project"), await token({ email: "other@example.com" })]) {
    for (const url of [textbookQuery, "/api/textbooks?catalog=1"]) {
      const denied = response();
      await textbookApi({ method: "GET", url, headers: value ? { authorization: `Bearer ${value}` } : {} }, denied);
      assert.ok([401, 403].includes(denied.statusCode));
      assert.equal(denied.headers.has("location"), false);
      assert.equal(denied.headers.get("cache-control"), "no-store");
    }
  }
  const catalog = response();
  await textbookApi({ ...textbookRequest, url: "/api/textbooks?catalog=1" }, catalog);
  assert.equal(catalog.statusCode, 200);
  const textbookCatalog = JSON.parse(await readFile(new URL("../data/textbooks.json", import.meta.url), "utf8"));
  assert.deepEqual(JSON.parse(catalog.body).books.map(book => book.id), textbookCatalog.books.map(book => book.id));
  const { privateKey: readerKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.FIREBASE_TEXTBOOK_READER = Buffer.from(JSON.stringify({
    type: "service_account", project_id: "yadoran-2025",
    client_email: "booong-textbook-reader@yadoran-2025.iam.gserviceaccount.com", private_key: await exportPKCS8(readerKey),
  })).toString("base64");
  const verifiedBook = response();
  await textbookApi(textbookRequest, verifiedBook);
  assert.equal(verifiedBook.statusCode, 307);
  const download = new URL(verifiedBook.headers.get("location"));
  assert.equal(download.pathname, "/yadoran-2025.firebasestorage.app/booong/textbooks/visang-social2-2015/unit-08-chapter-03.pdf");
  assert.equal(download.searchParams.get("X-Goog-Expires"), "300");
  assert.equal(verifiedBook.headers.get("cache-control"), "private, no-store");
  const viewerLink = response();
  await textbookApi({ ...textbookRequest, url: textbookQuery + "&format=json" }, viewerLink);
  assert.equal(viewerLink.statusCode, 200);
  assert.equal(viewerLink.headers.get("cache-control"), "no-store");
  assert.equal(new URL(JSON.parse(viewerLink.body).url).pathname, download.pathname);
  const pdfSource = JSON.parse(viewerLink.body);
  assert.ok(Number.isSafeInteger(pdfSource.bytes) && pdfSource.bytes > 0);
  assert.match(pdfSource.sha256, /^[a-f0-9]{64}$/);
  assert.ok(pdfSource.expiresAt > Date.now() && pdfSource.expiresAt <= Date.now() + 300_000);
  for (const format of [null, "json"]) {
    const majorUrl = new URL(textbookQuery, "https://booong.invalid");
    majorUrl.searchParams.delete("chapter");
    if (format) majorUrl.searchParams.set("format", format);
    const major = response();
    await textbookApi({ ...textbookRequest, url: majorUrl.pathname + majorUrl.search }, major);
    assert.equal(major.statusCode, 400, "A major unit alone must never issue a PDF URL");
    assert.equal(JSON.parse(major.body).reason, "chapter_required");
    assert.equal(major.headers.has("location"), false);
  }
  for (const suffix of ["&chapter=99", "&chapter=-1", "&chapter=1e0", "&chapter=", "&book=../../characters/private"]) {
    const invalid = response();
    // Replace the original parameter, rather than relying on duplicate-key ordering.
    const invalidUrl = new URL(textbookQuery, "https://booong.invalid");
    const [name, value] = suffix.slice(1).split("=");
    invalidUrl.searchParams.set(name, value);
    await textbookApi({ ...textbookRequest, url: invalidUrl.pathname + invalidUrl.search }, invalid);
    assert.ok([400, 404].includes(invalid.statusCode));
    assert.equal(invalid.headers.has("location"), false);
  }
  const savedEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.BOOONG_TEXTBOOK_PREVIEW = "1";
  const fakePreview = response();
  await textbookApi({ method: "GET", url: textbookQuery + "&preview=1", headers: { host: "127.0.0.1:8765" } }, fakePreview);
  assert.equal(fakePreview.statusCode, 401, "Production must reject the localhost preview bypass");
  if (savedEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnvironment;
  delete process.env.BOOONG_TEXTBOOK_PREVIEW;
  delete process.env.FIREBASE_TEXTBOOK_READER;

  assert.equal(sheetReads, 1, "Admin, catalog and PDF requests reuse the trusted list while tokens are checked on every request");
  now += 30_001;
  assert.deepEqual((await Promise.all([request(valid), request(valid), request(valid)])).map(result => result.statusCode), [200, 200, 200]);
  assert.equal(sheetReads, 2, "Concurrent refreshes share one sheet request");
  sheet = "id,admin\nDo,\n";
  now += 30_001;
  assert.equal((await request(valid)).statusCode, 403, "Removing an email removes access after the 30-second list cache expires");
  const removedBook = response();
  await textbookApi(textbookRequest, removedBook);
  assert.equal(removedBook.statusCode, 403, "Revoked admin cannot obtain textbook access after cache expiry");
  now += 30_001;
  sheetAvailable = false;
  assert.equal((await request(valid)).statusCode, 503, "Expired allowlist must not grant access during an outage");
  sheetAvailable = true;
  sheet = "id,name\nDo,관리자\n";
  const missingColumn = await request(valid);
  assert.equal(missingColumn.statusCode, 503);
  assert.equal(missingColumn.body.reason, "admin_not_configured");
  sheetAvailable = false;
  assert.equal((await request(valid)).statusCode, 503);

  const source = (await readFile(new URL("../js/admin.js", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "").replace(/^export /gm, "")
    .replace(/^if \(root[^\n]*\) renderAdmin\(\);$/m, "await renderAdmin();");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const render = new AsyncFunction("document", "getAuth", "firebaseApp", "fetch", "escapeHtml", "location", source);
  const fakeAuth = { currentUser: { uid: "google-user", email: "admin@example.com", getIdToken: async () => "signed-token" }, authStateReady: async () => {} };
  const container = { innerHTML: "", dataset: {}, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], querySelector: () => ({ addEventListener() {} }) };
  const document = { querySelector: () => container };
  await render(document, () => fakeAuth, {}, async () => new Response("{}"), String, { origin: "https://booong.vercel.app" });
  assert.match(container.innerHTML, /href="analytics.html"/);
  assert.match(container.innerHTML, /href="textbook-analysis.html"/);
  assert.match(container.innerHTML, /href="watcha-library.html"/);
  assert.match(container.innerHTML, /href="notice-admin.html"/);
  assert.match(container.innerHTML, /href="bungmo\/"/);
  const folderLink = /<a class="admin-tool" href="https:\/\/drive\.google\.com\/drive\/folders\/1DJk3fA986d_FmoRrOW0HFJc_cg7rMPcp" target="_blank" rel="noopener noreferrer">/;
  assert.match(container.innerHTML, folderLink);
  await render(document, () => fakeAuth, {}, async () => new Response('{"reason":"access_denied"}', { status: 403 }), String, { origin: "https://booong.vercel.app" });
  assert.doesNotMatch(container.innerHTML, /admin-cards|href="analytics.html"/);
  assert.doesNotMatch(container.innerHTML, folderLink);
  const fetchSource = source.replace("await renderAdmin();", "return adminFetch;");
  let fetched;
  const fetchFactory = new AsyncFunction("document", "getAuth", "firebaseApp", "fetch", "escapeHtml", "location", fetchSource);
  const adminFetch = await fetchFactory(document, () => fakeAuth, {}, async (url, options) => { fetched = { url, options }; return new Response("{}"); }, String, { origin: "https://booong.vercel.app" });
  await adminFetch("/api/textbooks?catalog=1");
  assert.equal(fetched.options.headers.get("Authorization"), "Bearer signed-token");
  assert.equal(fetched.options.cache, "no-store");
  await assert.rejects(adminFetch("https://evil.example/api/textbooks"), /Invalid admin API URL/);
  const gateFactory = new AsyncFunction("document", "getAuth", "firebaseApp", "fetch", "escapeHtml", "location", source.replace("await renderAdmin();", "return requireAdmin;"));
  let gateReads = 0, finishGate;
  const gateUrls = [];
  const gate = await gateFactory(document, () => fakeAuth, {}, async url => {
    gateReads++;
    gateUrls.push(new URL(url).pathname);
    return new Promise(resolve => { finishGate = resolve; });
  }, String, { origin: "https://booong.vercel.app" });
  const workingScreen = "<div class=analytics__inner>기존 통계</div>";
  container.innerHTML = workingScreen;
  const concurrentChecks = [gate(container), gate(container)];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(gateReads, 1, "Concurrent UI checks share one request");
  assert.equal(container.innerHTML, workingScreen, "Revalidation keeps the current screen visible");
  finishGate(new Response('{"email":"admin@example.com"}'));
  const checks = await Promise.all(concurrentChecks);
  for (const result of checks) assert.equal((await result.json()).email, "admin@example.com", "Each caller gets an independently readable response");
  assert.equal((await gate(container)).ok, true);
  assert.equal(gateReads, 1, "Same account reuses a successful UI check for 30 seconds");
  fakeAuth.currentUser.uid = "another-google-user";
  const switched = gate(container);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(gateReads, 2, "Switching accounts does not reuse the old check");
  finishGate(new Response('{}'));
  assert.equal((await switched).ok, true);
  now += 30_001;
  const expired = gate(container);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(container.innerHTML, workingScreen);
  finishGate(new Response('{"reason":"temporarily_unavailable"}', { status: 503 }));
  assert.equal(await expired, false, "Expired UI checks do not authorize on failure");
  const recovered = gate(container);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(gateReads, 4, "Failed checks are not cached");
  finishGate(new Response('{}'));
  assert.equal((await recovered).ok, true);
  const protectedCatalog = gate(container, "/api/textbooks?catalog=1");
  await new Promise(resolve => setImmediate(resolve));
  finishGate(new Response('{"books":[]}'));
  assert.deepEqual(await (await protectedCatalog).json(), { books: [] });
  assert.deepEqual(gateUrls, ["/api/admin", "/api/admin", "/api/admin", "/api/admin", "/api/textbooks"], "Catalog verifies access directly without a second admin request");
  const changedDuringRequest = gate(container, "/api/textbooks?catalog=1");
  await new Promise(resolve => setImmediate(resolve));
  fakeAuth.currentUser.uid = "third-google-user";
  finishGate(new Response('{"books":[]}'));
  assert.equal(await changedDuringRequest, false, "An in-flight response for the previous account must not authorize the new account");
  fakeAuth.currentUser = null;
  await assert.rejects(adminFetch("/api/textbooks"), /Google/);
  await render(document, () => fakeAuth, {}, async () => { throw new Error("Anonymous users must not fetch protected content"); }, String, { origin: "https://booong.vercel.app" });
  assert.match(container.innerHTML, /Google로 로그인/);
  assert.doesNotMatch(container.innerHTML, folderLink);
  console.log("Admin Google identity and member-sheet access checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
