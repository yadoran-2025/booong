import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { validateEntry, validDate, summarize, entriesCsv, monthBounds, seoulDate } from "../js/research-erp-data.js";

const example = { date: "2026-11-04", category: "coffee", amount: "4500", title: " 커피 ", counterparty: " 카페 ", memo: "" };
assert.deepEqual(validateEntry(example), { ...example, amount: 4500, title: "커피", counterparty: "카페" });
for (const amount of [0, -1, 1.5, "01", "1e3", "4,500", " 4500", "NaN", "1000000000000", null]) assert.throws(() => validateEntry({ ...example, amount }));
for (const date of ["2026-02-29", "2026-13-01", "2026-04-31", "2026-00-10", "1999-12-31", "2100-01-01", "2026-1-01", null]) assert.equal(validDate(date), false, `${date}`);
assert.equal(validDate("2028-02-29"), true);
for (const override of [{ category: "__proto__" }, { title: " " }, { title: "a".repeat(121) }, { memo: "a".repeat(1001) }, { counterparty: null }]) assert.throws(() => validateEntry({ ...example, ...override }));
assert.deepEqual(monthBounds("2026-12"), ["2026-12-01", "2027-01-01"]);
assert.throws(() => monthBounds("2026-13"));
assert.equal(seoulDate(new Date("2026-11-03T15:01:00Z")), "2026-11-04");
const summary = summarize([{ category: "revenue", amount: 1000000 }, { category: "other_income", amount: 300000 }, { category: "coffee", amount: 4500 }, { category: "meal", amount: 30000 }, { category: "rent", amount: 500000 }, { category: "rent", amount: 500000, voided: true }]);
assert.equal(summary.difference, 465500); assert.equal(summary.cashChange, 765500);
assert.equal(summary.expenses, 534500);
assert.equal(summarize([]).difference, 0);
assert.ok(Number.isSafeInteger(summarize(Array.from({ length: 5000 }, () => ({ category: "revenue", amount: 999999999999 }))).revenue));
const csv = entriesCsv([{ ...validateEntry(example), title: '=HYPERLINK("x")', memo: 'line 1\nline 2', counterparty: "  +cmd" }]);
assert.ok(csv.startsWith("\uFEFF")); assert.match(csv, /'=HYPERLINK/); assert.match(csv, /'  \+cmd/); assert.match(csv, /line 1\nline 2/);

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const key = { ...await exportJWK(publicKey), kid: "erp-test", alg: "RS256", use: "sig" };
const originalFetch = globalThis.fetch;
const previousEnv = { BOOONG_ADMIN_EMAILS: process.env.BOOONG_ADMIN_EMAILS, RESEARCH_ERP_STORAGE: process.env.RESEARCH_ERP_STORAGE, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, DORMS_SITE_URL: process.env.DORMS_SITE_URL };
process.env.BOOONG_ADMIN_EMAILS = "admin@example.com";
process.env.RESEARCH_ERP_STORAGE = "supabase";
process.env.SUPABASE_URL = "https://erp-test.invalid"; process.env.SUPABASE_SECRET_KEY = "test-secret"; process.env.DORMS_SITE_URL = "https://booong.vercel.app";
let rows = [], calls = 0, unavailable = false, injectedPage = null, offsets = [], expectedCount = 2005;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.hostname === "www.googleapis.com") return Response.json({ keys: [key] });
  assert.equal(url.origin, "https://erp-test.invalid");
  assert.equal(url.pathname, "/rest/v1/booong_research_entries");
  assert.equal(options.headers.apikey, "test-secret");
  assert.equal(options.cache, "no-store");
  calls++;
  if (unavailable) return new Response("down", { status: 503 });
  if (options.method === "GET") {
    if (url.searchParams.has("id")) return Response.json(rows.filter(e => `eq.${e.id}` === url.searchParams.get("id")), { headers: { "Content-Range": `0-0/${rows.length}` } });
    assert.equal(url.searchParams.get("and"), "(date.gte.2026-11-01,date.lt.2026-12-01)");
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    if (injectedPage) return Response.json(injectedPage(offset), { headers: { "Content-Range": `*/${expectedCount}` } });
    return Response.json(rows, { headers: { "Content-Range": `*/${rows.length}` } });
  }
  const body = JSON.parse(options.body);
  assert.equal(body.updated_by, "admin@example.com");
  assert.equal(Object.hasOwn(body, "created_at"), false);
  if (options.method === "POST") {
    if (rows.some(e => e.id === body.id)) return Response.json({}, { status: 409 });
    const row = { ...body, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; rows.push(row); return Response.json([row]);
  }
  assert.equal(options.method, "PATCH");
  const existing = rows.find(e => `eq.${e.id}` === url.searchParams.get("id") && `eq.${e.revision}` === url.searchParams.get("revision"));
  if (!existing) return Response.json([]);
  Object.assign(existing, body); return Response.json([existing]);
};
try {
  const { default: handler } = await import("../api/research-erp.js");
  async function token(email = "admin@example.com") { return new SignJWT({ email, email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "google.com" } }).setProtectedHeader({ alg: "RS256", kid: "erp-test" }).setSubject("erp-admin").setAudience("yadoran-2025").setIssuer("https://securetoken.google.com/yadoran-2025").setIssuedAt().setExpirationTime("5m").sign(privateKey); }
  const valid = await token(), other = await token("member@example.com");
  async function request(method = "GET", body, auth = valid, query = "?month=2026-11", origin = "https://booong.vercel.app") {
    const headers = new Map();
    const res = { setHeader(k, v) { headers.set(k.toLowerCase(), v); }, end(value) { this.body = JSON.parse(value); } };
    await handler({ method, body, url: `/api/research-erp${query}`, headers: { authorization: auth ? `Bearer ${auth}` : "", origin, host: "booong.vercel.app" } }, res);
    assert.equal(headers.get("cache-control"), "no-store"); return res;
  }
  for (const method of ["GET", "POST", "PATCH"]) {
    assert.equal((await request(method, example, null)).statusCode, 401);
    assert.equal((await request(method, example, "forged")).statusCode, 401);
    assert.equal((await request(method, example, other)).statusCode, 403);
  }
  assert.equal(calls, 0);
  assert.equal((await request("DELETE")).statusCode, 405);
  assert.equal((await request("GET", null, valid, "?month=2026-13")).statusCode, 400);
  assert.equal((await request("POST", example, valid, "", "https://evil.invalid")).statusCode, 403);
  const id = "04c0a688-0b12-4da3-8c49-fc5850093b87";
  const entry = { ...example, id, voided: false, updated_by: "attacker@example.com" };
  assert.equal((await request("POST", { ...entry, amount: "1e4" })).statusCode, 400);
  assert.equal((await request("POST", { ...entry, id: "bad" })).statusCode, 400);
  assert.equal((await request("POST", { ...entry, voided: true })).statusCode, 400);
  assert.equal((await request("POST", "a".repeat(12001))).statusCode, 400);
  assert.equal((await request("POST", entry)).statusCode, 201);
  assert.equal((await request("POST", entry)).statusCode, 200, "Retry returns the same record");
  assert.equal(rows.length, 1);
  assert.equal((await request("POST", { ...entry, amount: "5000" })).statusCode, 409);
  assert.equal((await request("GET")).body.entries.length, 1);
  const original = structuredClone(rows[0]);
  assert.equal((await request("PATCH", { ...original, amount: 5000 })).statusCode, 200);
  assert.equal(rows[0].revision, 2);
  assert.equal((await request("PATCH", { ...original, amount: 6000 })).statusCode, 409);
  assert.equal(rows[0].amount, 5000);
  assert.equal((await request("PATCH", { ...rows[0], voided: true })).statusCode, 200);
  assert.equal(summarize(rows).expenses, 0);
  assert.equal((await request("PATCH", { ...rows[0], voided: false })).statusCode, 200);
  assert.equal(summarize(rows).expenses, 5000);
  injectedPage = offset => Array.from({ length: offset < 2000 ? 1000 : 5 }, () => rows[0]); offsets = [];
  assert.equal((await request("GET")).body.entries.length, 2005);
  assert.deepEqual(offsets, [0, 1000, 2000]);
  injectedPage = offset => Array.from({ length: offset < 2000 ? 100 : 5 }, () => rows[0]); offsets = [];
  assert.equal((await request("GET")).body.entries.length, 2005, "A lower database row cap cannot truncate totals");
  assert.equal(offsets[1], 100);
  expectedCount = 6000;
  injectedPage = () => Array.from({ length: 1000 }, () => rows[0]);
  assert.equal((await request("GET")).statusCode, 422, "Never show silently truncated totals");
  injectedPage = null; unavailable = true;
  assert.equal((await request("GET")).statusCode, 503);
  assert.equal((await request("POST", { ...entry, id: "14c0a688-0b12-4da3-8c49-fc5850093b87" })).statusCode, 503);
  console.log("ERP: exact KRW/date validation, monthly totals, CSV safety, real Google token/admin checks, origin enforcement, retry deduplication, optimistic editing, void/restore, pagination and failure checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
