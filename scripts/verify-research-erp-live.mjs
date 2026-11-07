import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { sheetLedger, ERP_SPREADSHEET_ID, ERP_SERVICE_ACCOUNT, ERP_LOCK_ID } from "../lib/research-erp-sheets.js";
import { seoulDate } from "../js/research-erp-data.js";

if (process.env.ERP_LIVE_VERIFY !== "1") throw new Error("Explicit ERP_LIVE_VERIFY=1 is required. This verification writes only temporary lock metadata, never cells.");
const originalFetch = globalThis.fetch;
const api = `https://sheets.googleapis.com/v4/spreadsheets/${ERP_SPREADSHEET_ID}`;
const lockKey = "booong_erp_writer_v1";
const owners = new Set();
let token, googleCalls = 0, phase = "credentials", before;
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  return value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
}
const digest = value => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(options.redirect, "error");
  if (url.href === "https://oauth2.googleapis.com/token") return originalFetch(input, options);
  assert.equal(url.origin, "https://sheets.googleapis.com");
  assert.equal(url.pathname === `/v4/spreadsheets/${ERP_SPREADSHEET_ID}` || url.pathname.startsWith(`/v4/spreadsheets/${ERP_SPREADSHEET_ID}/`) || url.pathname === `/v4/spreadsheets/${ERP_SPREADSHEET_ID}:batchUpdate`, true);
  if (options.method === "POST") {
    assert.equal(url.href, `${api}:batchUpdate`);
    const body = JSON.parse(options.body);
    for (const request of body.requests) {
      const create = request.createDeveloperMetadata?.developerMetadata;
      const remove = request.deleteDeveloperMetadata?.dataFilter?.developerMetadataLookup;
      assert.equal(Object.keys(request).length, 1);
      assert.equal(Boolean(create || remove), true, "Live verification blocks every financial/cell/format write");
      const item = create || remove;
      assert.equal(item.metadataId, ERP_LOCK_ID); assert.equal(item.metadataKey, lockKey); assert.equal(item.visibility, "DOCUMENT");
      if (create) { assert.equal(create.location.spreadsheet, true); owners.add(create.metadataValue); }
      if (remove) assert.equal(owners.has(remove.metadataValue), true, "Never remove another request's lock");
    }
  } else assert.equal(options.method || "GET", "GET");
  googleCalls++;
  return originalFetch(input, options);
};
async function google(path = "", body) {
  const response = await fetch(api + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error("Google request failed"), { status: response.status, safeReason: result.error?.details?.find(d => d.reason)?.reason || result.error?.status || "unknown" });
  return result;
}
const remove = owner => ({ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataId: ERP_LOCK_ID, metadataKey: lockKey, metadataValue: owner, visibility: "DOCUMENT" } } } });
async function snapshot() {
  const fields = "sheets(properties(sheetId,title,gridProperties),data(startRow,startColumn,rowData(values(userEnteredValue)))),developerMetadata";
  return google(`?${new URLSearchParams({ includeGridData: "true", fields })}`);
}
let final;
try {
  const credentials = JSON.parse(Buffer.from(process.env.FIREBASE_BUNGMO_SERVER || "", "base64").toString("utf8"));
  assert.equal(credentials.client_email, ERP_SERVICE_ACCOUNT); assert.equal(credentials.project_id, "yadoran-2025"); assert.equal(credentials.type, "service_account");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" }).setProtectedHeader({ alg: "RS256" }).setIssuer(ERP_SERVICE_ACCOUNT).setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("5m").sign(await importPKCS8(credentials.private_key, "RS256"));
  phase = "oauth";
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  const auth = await response.json();
  if (!response.ok || typeof auth.access_token !== "string") throw Object.assign(new Error("Existing service account authentication failed"), { status: response.status, safeReason: auth.error || "invalid_token_response" });
  token = auth.access_token;
  phase = "snapshot_before"; before = await snapshot();
  assert.equal((before.developerMetadata || []).some(m => m.metadataId === ERP_LOCK_ID), false, "An existing lock must be investigated, never removed by this test");
  const heldOwner = JSON.stringify({ request: randomUUID(), started_at: new Date().toISOString() });
  phase = "lock_contention";
  await google(":batchUpdate", { requests: [{ createDeveloperMetadata: { developerMetadata: { metadataId: ERP_LOCK_ID, metadataKey: lockKey, metadataValue: heldOwner, location: { spreadsheet: true }, visibility: "DOCUMENT" } } }] });
  const denied = await sheetLedger("list", "integration-check@booong.invalid", { month: seoulDate().slice(0, 7) });
  assert.equal(denied.body.reason, "ledger_busy", "Google rejects a second lock with the same metadata ID");
  await google(":batchUpdate", { requests: [remove(heldOwner)] });
  phase = "authenticated_ledger_read";
  const result = await sheetLedger("list", "integration-check@booong.invalid", { month: seoulDate().slice(0, 7) });
  assert.equal(result.status, 200, `Ledger read failed: ${result.body.reason || "unknown"}`);
  final = { ok: true, account: ERP_SERVICE_ACCOUNT, spreadsheet_id: ERP_SPREADSHEET_ID, month: seoulDate().slice(0, 7), entries: result.body.entries.length, lockContentionBlocked: true, realCellWrites: 0, newLongLivedCredentials: false, deployed: false };
} catch (error) {
  final = { ok: false, phase, status: error.status || null, reason: error.safeReason || (error.code === "ERR_ASSERTION" ? error.message.split("\n")[0] : "verification_failed") };
  process.exitCode = 1;
} finally {
  if (token) {
    try {
      phase = "cleanup";
      for (const owner of owners) await google(":batchUpdate", { requests: [remove(owner)] });
      if (before) {
        const after = await snapshot();
        assert.equal(digest(after), digest(before), "Workbook values, dimensions and metadata must match their original snapshot");
        final.cellsAndMetadataUnchanged = true;
        final.snapshotSha256 = digest(after);
      }
    } catch (error) {
      final = { ...final, ok: false, cleanupOrPreservationCheckFailed: true, status: error.status || null, reason: error.safeReason || "verification_failed" };
      process.exitCode = 1;
    }
  }
  globalThis.fetch = originalFetch;
  console.log(JSON.stringify({ ...final, googleCalls }, null, 2));
}
