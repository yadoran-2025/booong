import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportJWK, exportPKCS8, SignJWT, jwtVerify } from "jose";
import { sheetLedger, ERP_SPREADSHEET_ID, ERP_SERVICE_ACCOUNT, ERP_LOCK_ID } from "../lib/research-erp-sheets.js";
import { MEMBER_PROFILE_SHEET_URL } from "../js/member-data.js";

// All Google/OAuth requests are mocked. Generated signing keys live only in this process.
const columns = ["id", "date", "category", "amount", "title", "counterparty", "memo", "voided", "revision", "created_at", "updated_at", "updated_by"];
const history = ["event_id", "entry_id", "revision", "recorded_at", "actor", "action", "before_json", "after_json"];
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: "sheets-test", alg: "RS256", use: "sig" };
const credentials = { type: "service_account", project_id: "yadoran-2025", client_email: ERP_SERVICE_ACCOUNT, private_key: await exportPKCS8(privateKey) };
const originalFetch = globalThis.fetch;
const envKeys = ["RESEARCH_ERP_STORAGE", "FIREBASE_BUNGMO_SERVER", "DORMS_SITE_URL"];
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
process.env.RESEARCH_ERP_STORAGE = "google_sheets";
process.env.FIREBASE_BUNGMO_SERVER = Buffer.from(JSON.stringify(credentials)).toString("base64");
process.env.DORMS_SITE_URL = "https://booong.vercel.app";
let grid, audit, capacity, metadata = new Map(), oauthCalls = 0, sheetsCalls = 0, commits = 0;
let rejectCommit = false, loseReply = false, rejectUnknownCommit = false, loseAcquire = false, rejectUnlock = false;
let readGate = null, seenRead = null, badRangeResponse = false;
const reset = () => { grid = [columns, ...Array.from({ length: 1000 }, () => ["", "", "", "", "", "", "", false])]; audit = [history]; capacity = 1001; metadata.clear(); };
reset();
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.hostname === "www.googleapis.com") return Response.json({ keys: [jwk] });
  if (url.origin === new URL(MEMBER_PROFILE_SHEET_URL).origin) return new Response("id,name,admin\nDo,운영자,admin@example.com\n");
  assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
  if (url.origin === "https://oauth2.googleapis.com") {
    oauthCalls++;
    assert.equal(url.pathname, "/token");
    const form = new URLSearchParams(options.body);
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    const { payload } = await jwtVerify(form.get("assertion"), publicKey, { issuer: ERP_SERVICE_ACCOUNT, audience: "https://oauth2.googleapis.com/token" });
    assert.equal(payload.scope, "https://www.googleapis.com/auth/spreadsheets");
    assert.equal(payload.sub, undefined, "No user impersonation or domain delegation");
    return Response.json({ access_token: "mock-short-lived-access", token_type: "Bearer", expires_in: 3600 });
  }
  assert.equal(url.origin, "https://sheets.googleapis.com");
  assert.equal(url.pathname.startsWith(`/v4/spreadsheets/${ERP_SPREADSHEET_ID}`), true, "Every request is fixed to the approved workbook");
  assert.equal(options.headers.Authorization, "Bearer mock-short-lived-access");
  sheetsCalls++;
  if (url.pathname.endsWith(`/developerMetadata/${ERP_LOCK_ID}`)) {
    return metadata.has(ERP_LOCK_ID) ? Response.json(metadata.get(ERP_LOCK_ID)) : Response.json({}, { status: 404 });
  }
  if (url.pathname.endsWith("/values:batchGet")) {
    assert.equal(metadata.has(ERP_LOCK_ID), true, "Read is protected across server instances");
    assert.deepEqual(url.searchParams.getAll("ranges"), [`'거래원장'!A1:L${capacity}`, "'변경이력'!A1:H1"]);
    assert.equal(url.searchParams.get("valueRenderOption"), "UNFORMATTED_VALUE");
    if (seenRead) { const notify = seenRead; seenRead = null; notify(); await readGate; }
    return Response.json({ valueRanges: badRangeResponse ? [] : [{ values: structuredClone(grid) }, { values: [audit[0]] }] });
  }
  if (!url.pathname.endsWith(":batchUpdate")) {
    assert.equal(metadata.has(ERP_LOCK_ID), true);
    return Response.json({ sheets: [{ properties: { sheetId: 77402507, title: "거래원장", gridProperties: { rowCount: capacity } } }, { properties: { sheetId: 297913949, title: "변경이력", gridProperties: { rowCount: 1001 } } }] });
  }
  const body = JSON.parse(options.body);
  const isCommit = body.requests.some(r => r.updateCells);
  if (isCommit && rejectCommit) return Response.json({}, { status: 400 });
  if (isCommit && rejectUnknownCommit) return Response.json({}, { status: 503 });
  if (rejectUnlock && body.requests.length === 1 && body.requests[0].deleteDeveloperMetadata) return Response.json({}, { status: 503 });
  // Apply every request to a copy, then commit together, matching Sheets batchUpdate atomicity.
  const nextGrid = structuredClone(grid), nextAudit = structuredClone(audit), nextMetadata = new Map(metadata);
  let nextCapacity = capacity;
  for (const request of body.requests) {
    if (request.createDeveloperMetadata) {
      const value = request.createDeveloperMetadata.developerMetadata;
      assert.equal(value.metadataId, ERP_LOCK_ID); assert.equal(value.location.spreadsheet, true); assert.equal(value.visibility, "DOCUMENT");
      if (nextMetadata.has(value.metadataId)) return Response.json({}, { status: 400 });
      nextMetadata.set(value.metadataId, value); continue;
    }
    if (request.deleteDeveloperMetadata) {
      const lookup = request.deleteDeveloperMetadata.dataFilter.developerMetadataLookup;
      assert.equal(lookup.metadataId, ERP_LOCK_ID); assert.equal(lookup.metadataKey, "booong_erp_writer_v1");
      const existing = nextMetadata.get(ERP_LOCK_ID);
      if (existing && Object.entries(lookup).every(([key, value]) => existing[key] === value)) nextMetadata.delete(ERP_LOCK_ID);
      continue;
    }
    assert.equal(nextMetadata.has(ERP_LOCK_ID), true, "No financial writes without the distributed lock");
    if (request.appendDimension) { nextCapacity++; continue; }
    const update = request.updateCells || request.appendCells;
    assert.equal(update.fields, "userEnteredValue");
    const values = update.rows[0].values.map(cell => {
      assert.equal(Object.hasOwn(cell.userEnteredValue, "formulaValue"), false);
      return Object.values(cell.userEnteredValue)[0];
    });
    if (request.updateCells) { assert.equal(update.start.sheetId, 77402507); nextGrid[update.start.rowIndex] = values; }
    else { assert.equal(update.sheetId, 297913949); nextAudit.push(values); }
  }
  grid = nextGrid; audit = nextAudit; metadata = nextMetadata; capacity = nextCapacity;
  if (isCommit) { commits++; if (loseReply) throw new Error("Response lost after atomic commit"); }
  if (loseAcquire && body.requests[0].createDeveloperMetadata) { loseAcquire = false; throw new Error("Lost lock creation response"); }
  return Response.json({ replies: body.requests.map(() => ({})) });
};
try {
  const { default: handler } = await import("../api/research-erp.js");
  const token = email => new SignJWT({ email, email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: "google.com" } }).setProtectedHeader({ alg: "RS256", kid: "sheets-test" }).setSubject("erp-admin").setAudience("yadoran-2025").setIssuer("https://securetoken.google.com/yadoran-2025").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const admin = await token("admin@example.com"), member = await token("member@example.com");
  async function request(method = "GET", body, authorization = admin, month = "2026-11", origin = "https://booong.vercel.app") {
    const headers = new Map();
    const response = { setHeader: (k, v) => headers.set(k.toLowerCase(), v), end(value) { this.body = JSON.parse(value); } };
    await handler({ method, body, url: `/api/research-erp?month=${month}`, headers: { authorization: authorization ? `Bearer ${authorization}` : "", origin, host: "booong.vercel.app" } }, response);
    assert.equal(headers.get("cache-control"), "no-store"); return response;
  }
  const entry = { id: randomUUID(), date: "2026-11-04", category: "coffee", amount: 4500, title: '=HYPERLINK("x")', counterparty: "카페", memo: "", voided: false, updated_by: "spoof@example.com" };
  for (const method of ["GET", "POST", "PATCH"]) {
    assert.equal((await request(method, entry, null)).statusCode, 401);
    assert.equal((await request(method, entry, member)).statusCode, 403);
  }
  assert.equal((await request("POST", entry, admin, "2026-11", "https://evil.invalid")).statusCode, 403);
  assert.equal((await request("POST", { ...entry, amount: "1e4" })).statusCode, 400);
  assert.equal(oauthCalls + sheetsCalls, 0);
  const validCredentials = process.env.FIREBASE_BUNGMO_SERVER;
  delete process.env.FIREBASE_BUNGMO_SERVER;
  assert.equal((await request()).body.reason, "sheets_not_configured");
  process.env.FIREBASE_BUNGMO_SERVER = Buffer.from(JSON.stringify({ ...credentials, client_email: "wrong@example.com" })).toString("base64");
  assert.equal((await request()).body.reason, "sheets_not_configured");
  process.env.FIREBASE_BUNGMO_SERVER = validCredentials;
  assert.deepEqual((await request()).body, { entries: [], storage: "google_sheets" });
  assert.equal(metadata.size, 0, "Reading releases metadata without touching cell values");
  loseAcquire = true; assert.equal((await request()).statusCode, 200, "An uncertain acquisition proves its owner before reading");
  assert.equal((await request("POST", entry)).statusCode, 201);
  assert.equal(grid[1][0], entry.id); assert.equal(grid[1][4], entry.title);
  assert.equal(audit.length, 2); assert.equal(audit[1][5], "create");
  assert.equal(JSON.parse(audit[1][7]).updated_by, "admin@example.com");
  assert.equal(metadata.size, 0, "Ledger, audit and unlock commit atomically");
  assert.equal((await request("POST", entry)).statusCode, 200);
  assert.equal((await request("POST", { ...entry, id: entry.id.toUpperCase() })).statusCode, 200);
  assert.equal(audit.length, 2);
  assert.equal((await request("POST", { ...entry, amount: 5000 })).statusCode, 409);
  let saved = (await request()).body.entries[0];
  const original = saved;
  assert.equal((await request("PATCH", { ...saved, amount: 5000 })).statusCode, 200);
  assert.equal((await request("PATCH", { ...original, amount: 6000 })).statusCode, 409);
  saved = (await request()).body.entries[0]; assert.equal(saved.amount, 5000); assert.equal(saved.revision, 2);
  await request("PATCH", { ...saved, voided: true }); saved = (await request()).body.entries[0];
  assert.equal(saved.voided, true); assert.equal(audit.at(-1)[5], "void");
  await request("PATCH", { ...saved, voided: false }); saved = (await request()).body.entries[0];
  assert.equal(saved.voided, false); assert.equal(audit.at(-1)[5], "restore");
  const snapshot = JSON.stringify({ grid, audit }); rejectCommit = true;
  assert.equal((await request("PATCH", { ...saved, amount: 9000 })).statusCode, 503);
  assert.equal(JSON.stringify({ grid, audit }), snapshot); assert.equal(metadata.size, 0); rejectCommit = false;
  const second = { ...entry, id: randomUUID(), category: "revenue", amount: 100000 };
  loseReply = true; assert.equal((await request("POST", second)).statusCode, 503); loseReply = false;
  const afterLost = commits;
  assert.equal((await request("POST", second)).statusCode, 200); assert.equal(commits, afterLost);
  // Two independently imported modules model separate serverless processes sharing only the sheet lock.
  const clientB = (await import("../lib/research-erp-sheets.js?cold-instance-b")).sheetLedger;
  let resume; readGate = new Promise(resolve => { resume = resolve; });
  const observed = new Promise(resolve => { seenRead = resolve; });
  const pending = request("PATCH", { ...saved, amount: 7000 }); await observed;
  assert.equal((await clientB("list", "admin@example.com", { month: "2026-11" })).body.reason, "ledger_busy");
  resume(); assert.equal((await pending).statusCode, 200);
  assert.equal((await clientB("update", "admin@example.com", { entry: { ...saved, amount: 8000 } })).status, 409);
  saved = (await request()).body.entries.find(e => e.id === saved.id);
  assert.equal(saved.amount, 7000);
  assert.equal(oauthCalls, 2, "One short-lived token cache per instance");
  // An indeterminate write does not relinquish or steal its lock, preventing a late overwrite.
  rejectUnknownCommit = true;
  assert.equal((await request("PATCH", { ...saved, amount: 9000 })).statusCode, 503);
  assert.equal(metadata.size, 1);
  assert.equal((await clientB("list", "admin@example.com", { month: "2026-11" })).body.reason, "ledger_busy");
  rejectUnknownCommit = false; metadata.clear(); // Test fixture recovery after the mocked request is known to be finished.
  grid[1][1] = Math.round(Date.parse("2026-11-04T00:00:00Z") / 86400000) + 25569;
  assert.equal((await request()).body.entries.find(e => e.id === saved.id).date, "2026-11-04");
  assert.equal((await request("PATCH", { ...saved, date: "2026-10-01" })).statusCode, 200);
  assert.equal((await request()).body.entries.length, 1);
  const oldHeader = grid[0][2]; grid[0][2] = "bad";
  assert.equal((await request()).body.reason, "ledger_invalid"); grid[0][2] = oldHeader;
  grid[3][4] = "manual row without id";
  assert.equal((await request()).body.reason, "ledger_invalid"); grid[3][4] = "";
  grid[3] = structuredClone(grid[1]); assert.equal((await request()).body.reason, "ledger_invalid"); grid[3] = [];
  badRangeResponse = true; assert.equal((await request()).body.reason, "ledger_invalid"); badRangeResponse = false;
  rejectUnlock = true; assert.equal((await request()).body.reason, "ledger_busy"); rejectUnlock = false; metadata.clear();
  reset();
  const full = { ...saved, date: "2026-11-01" };
  const makeRow = i => columns.map(key => ({ ...full, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })[key]);
  grid = [columns, ...Array.from({ length: 5000 }, (_, i) => makeRow(i + 1))]; capacity = grid.length;
  assert.equal((await request()).body.entries.length, 5000);
  assert.equal((await request("POST", { ...entry, id: randomUUID() })).statusCode, 422);
  grid.push(makeRow(5001)); capacity++;
  assert.equal((await request()).statusCode, 422); assert.equal(metadata.size, 0);
  reset(); grid = [columns]; capacity = 1;
  assert.equal((await request("POST", { ...entry, id: randomUUID() })).statusCode, 201); assert.equal(capacity, 2);
  console.log("Service-account Sheets ERP: fixed identity/scope/file, auth/origin, token cache, reserved rows/dates, atomic ledger/audit/unlock, cross-instance exclusion, revision conflict, lost replies, uncertain-write lock retention, literal strings, cancellation/restore, complete totals and safe failures passed. No live services used.");
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
