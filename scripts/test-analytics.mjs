import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, exportJWK, importPKCS8, importSPKI, jwtVerify } from "jose";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const verifyKey = await importSPKI(publicKey.export({ type: "spki", format: "pem" }), "RS256");
const signingKey = await importPKCS8(pem, "RS256");
const names = ["FIREBASE_BOOONG_ANALYTICS_READER", "BOOONG_ADMIN_EMAILS", "NODE_ENV"];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]])), savedFetch = globalThis.fetch;
const account = { type: "service_account", project_id: "yadoran-2025", client_email: "booong-analytics-reader@yadoran-2025.iam.gserviceaccount.com", private_key: pem };
const fixture = {
  pages: { home: { key: "dashboard", title: "홈", path: "index.html", type: "page", views: 14, visitors: 8, updatedAt: 10, private: "must-not-leak" } },
  groupClicks: { one: { groupId: "one", title: "수업", views: 7, totalClicks: 12, visitorCount: 4, private: "must-not-leak" } },
  favorites: { one: { count: 2, private: "must-not-leak" } },
  totals: { views: 30 }, daily: {}, pageVisitors: { home: { "must-not-leak": { firstSeenAt: 123 } } }, groupClickVisitors: { one: { "must-not-leak": { count: 5 } } },
};
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
fixture.daily[day] = { views: 5 };
let authCalls = 0, databaseReads = [], fail = 0;
Object.assign(process.env, { BOOONG_ADMIN_EMAILS: "admin@example.com", NODE_ENV: "production" });
try {
  process.env.FIREBASE_BOOONG_ANALYTICS_READER = Buffer.from(JSON.stringify({ ...account, project_id: "other" })).toString("base64");
  globalThis.fetch = () => { assert.fail("Wrong credentials must never contact the network"); };
  const { readAnalytics } = await import("../lib/analytics-storage.js");
  await assert.rejects(readAnalytics("pages"), /Wrong BOOONG analytics reader/);
  for (const path of ["../comments", "pageVisitors", "/", "daily/not-a-date/views"]) await assert.rejects(readAnalytics(path), /Invalid analytics path/);
  process.env.FIREBASE_BOOONG_ANALYTICS_READER = Buffer.from(JSON.stringify(account)).toString("base64");
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "www.googleapis.com") return Response.json({ keys: [{ ...await exportJWK(verifyKey), kid: "analytics-test", use: "sig", alg: "RS256" }] });
    if (url.hostname === "identitytoolkit.googleapis.com") {
      authCalls++;
      const { payload } = await jwtVerify(JSON.parse(options.body).token, verifyKey, { issuer: account.client_email, subject: account.client_email, audience: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" });
      assert.equal(payload.uid, "booong-analytics-reader"); assert.deepEqual(payload.claims, { booongAnalyticsRead: true });
      return Response.json({ idToken: "reader-id-token", expiresIn: "3600" });
    }
    assert.equal(url.origin, "https://yadoran-2025-default-rtdb.firebaseio.com");
    assert.ok(url.pathname.startsWith("/analytics"));
    assert.equal(url.searchParams.get("auth"), "reader-id-token");
    assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
    assert.equal(options.method, undefined, "The reader never writes");
    databaseReads.push(url.pathname);
    if (fail) return Response.json({}, { status: fail });
    const path = url.pathname.replace(/^\/analytics\/?/, "").replace(/\.json$/, "");
    return Response.json(path ? path.split("/").reduce((v, key) => v?.[key], fixture) ?? null : fixture);
  };
  const { default: route } = await import("../api/admin.js");
  async function request(url = "/api/analytics", method = "GET", token) {
    const headers = new Map(), res = { setHeader(name, value) { headers.set(name.toLowerCase(), value); }, end(value) { this.body = JSON.parse(value); } };
    await route({ url, method, headers: token ? { authorization: `Bearer ${token}` } : {}, socket: { remoteAddress: "127.0.0.1" } }, res);
    return { status: res.statusCode, body: res.body, headers };
  }
  assert.equal((await request("/api/analytics?admin=1")).status, 401);
  assert.equal((await request("/api/admin?analytics=1&admin=1")).status, 401);
  assert.equal(databaseReads.length, 0);
  for (const url of ["/api/analytics?nonce=1", "/api/analytics?admin=0", "/api/analytics?admin=1&admin=1", "/api/admin?analytics=0", "/api/admin?analytics=1&analytics=1", "/api/admin?analytics=1&members=1"]) assert.equal((await request(url)).status, 400);
  assert.equal((await request("/api/analytics", "POST")).status, 405);
  const responses = await Promise.all(Array.from({ length: 50 }, () => request()));
  assert.equal(databaseReads.length, 5, "Concurrent CDN misses share one aggregate read"); assert.equal(authCalls, 1);
  const summary = responses[0].body;
  assert.equal(summary.overview.totalViews, 30); assert.equal(summary.overview.todayViews, 5);
  assert.equal(summary.pages[0].views, 14); assert.equal(summary.groupClicks[0].totalClicks, 12); assert.equal(summary.favorites[0].count, 2);
  assert.ok(!JSON.stringify(summary).includes("must-not-leak"));
  assert.ok(!databaseReads.includes("/analytics.json"), "Public summaries do not read visitor history");
  for (const res of responses) { assert.equal(res.status, 200); assert.equal(res.headers.get("vercel-cdn-cache-control"), "max-age=60"); }
  const token = await new SignJWT({ email: "admin@example.com", email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "google.com" } })
    .setProtectedHeader({ alg: "RS256", kid: "analytics-test" }).setSubject("admin-user").setAudience("yadoran-2025").setIssuer("https://securetoken.google.com/yadoran-2025").setIssuedAt().setExpirationTime("5m").sign(signingKey);
  const privateResponse = await request("/api/analytics?admin=1", "GET", token);
  assert.equal(privateResponse.status, 200); assert.deepEqual(privateResponse.body, fixture);
  assert.equal(privateResponse.headers.get("cache-control"), "no-store"); assert.equal(privateResponse.headers.get("vercel-cdn-cache-control"), "no-store");
  fail = 401;
  const unavailable = await request(); assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get("vercel-cdn-cache-control"), "no-store");
  fail = 0; assert.equal((await request()).status, 200); assert.equal(authCalls, 2);

  const source = (await readFile(new URL("../js/visitor-analytics.js", import.meta.url), "utf8")).replace(/^import .+;$/gm, "").replace(/^export /gm, "");
  const data = {}, local = new Map([["booong-visitor-id-v1", "browser-one"]]), session = new Map();
  const storage = map => ({ getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) });
  const read = path => path.split("/").reduce((v, key) => v?.[key], data);
  const write = (path, value) => { const keys = path.split("/"), key = keys.pop(); let node = data; for (const part of keys) node = node[part] ||= {}; if (value === null) delete node[key]; else node[key] = value; };
  const snap = path => ({ val: () => read(path), exists: () => read(path) !== undefined });
  let clientRequests = 0, clock = Date.now(), clientFailure = false;
  class TestDate extends Date { static now() { return clock; } }
  const context = vm.createContext({ console: { warn() {} }, Date: TestDate, Intl, URLSearchParams, AbortSignal, localStorage: storage(local), sessionStorage: storage(session), db: {}, ref: (_, path) => path,
    get: async path => snap(path), set: async (path, value) => write(path, value), remove: async path => write(path, null), update: async (path, value) => { for (const [key, v] of Object.entries(value)) write(`${path}/${key}`, v); },
    serverTimestamp: () => clock, runTransaction: async (path, mutate) => { write(path, mutate(read(path))); return { snapshot: snap(path) }; },
    fetch: async (url, options) => { clientRequests++; assert.equal(url, "/api/analytics"); assert.equal(options.credentials, "omit"); return clientFailure ? Response.json({}, { status: 503 }) : Response.json(summary); },
  });
  vm.runInContext(`${source}\nthis.api = {loadOverviewStats,loadPageVisitStats,loadGroupClickStats,loadFavoriteStats,trackPage,trackGroupClick,setFavoriteState};`, context);
  const api = context.api;
  await Promise.all([api.loadOverviewStats(), api.loadPageVisitStats(), api.loadGroupClickStats(), api.loadFavoriteStats()]); assert.equal(clientRequests, 1);
  clock += 15001; clientFailure = true; await assert.rejects(api.loadPageVisitStats({ throwOnError: true })); assert.equal(await api.loadOverviewStats(), null);
  clientFailure = false; assert.equal((await api.loadOverviewStats()).totalViews, 30, "A failed read is not cached as zero");
  const page = { key: "dashboard", title: "홈", path: "index.html", type: "page" }, group = { groupId: "one", title: "수업", type: "lesson", href: "https://example.com", actionKey: "teacher" };
  await api.trackPage(page); await api.trackPage(page);
  assert.equal(read("analytics/pages/dashboard/views"), 1); assert.equal(read("analytics/pages/dashboard/visitors"), 1); assert.equal(read("analytics/totals/views"), 1);
  await api.trackGroupClick(group); await api.trackGroupClick(group);
  assert.equal(read("analytics/groupClicks/one/totalClicks"), 2); assert.equal(read("analytics/groupClicks/one/views"), 1); assert.equal(read("analytics/groupClicks/one/visitorCount"), 1); assert.equal(read("analytics/groupClickVisitors/one/browser-one/count"), 2);
  session.clear(); await api.trackPage(page); assert.equal(read("analytics/pages/dashboard/views"), 2); assert.equal(read("analytics/pages/dashboard/visitors"), 1);
  assert.equal(await api.setFavoriteState("one", true), 1); assert.equal(await api.setFavoriteState("one", true), null);
  assert.equal(await api.setFavoriteState("one", false), 0); assert.equal(await api.setFavoriteState("one", false), null);
  let releaseFavoriteRead;
  const favoriteReads = [];
  const originalGet = context.get;
  context.get = async path => {
    favoriteReads.push(path);
    if (favoriteReads.length === 1) await new Promise(resolve => { releaseFavoriteRead = resolve; });
    return originalGet(path);
  };
  const repeatedFavorites = [api.setFavoriteState("one", true), api.setFavoriteState("one", false), api.setFavoriteState("one", true)];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(favoriteReads.length, 1, "Repeated changes for one lesson must read and write in order");
  releaseFavoriteRead();
  assert.deepEqual(await Promise.all(repeatedFavorites), [1, 0, 1]);
  assert.equal(read("analytics/favorites/one/count"), 1);
  assert.ok(read("analytics/favoriteVisitors/one/browser-one"));
  let failFavoriteRead = true;
  context.get = async path => { if (failFavoriteRead) { failFavoriteRead = false; throw Error("offline"); } return originalGet(path); };
  assert.deepEqual(await Promise.all([api.setFavoriteState("one", false), api.setFavoriteState("one", false)]), [null, 0], "A failed statistic request must not block the next change");
  context.get = originalGet;
  console.log("Analytics: private identity/path isolation, aggregate field filtering/cache/coalescing, failures, tracking/session counts, repeat clicks and favorite toggles passed.");
} finally {
  globalThis.fetch = savedFetch;
  for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
