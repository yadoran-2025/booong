import { randomUUID } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { UUID, validateEntry, validMonth, validDate } from "../js/research-erp-data.js";

export const ERP_SPREADSHEET_ID = "1ZQvVTUhDZPrizJvkKiFAPz_jI1o0NRkEWAijGHVdd2U";
export const ERP_SERVICE_ACCOUNT = "booong-bungmo-server@yadoran-2025.iam.gserviceaccount.com";
export const ERP_LOCK_ID = 198614320;
export const erpStorage = () => process.env.RESEARCH_ERP_STORAGE || "google_sheets";
const LOCK_KEY = "booong_erp_writer_v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = `https://sheets.googleapis.com/v4/spreadsheets/${ERP_SPREADSHEET_ID}`;
const COLUMNS = ["id", "date", "category", "amount", "title", "counterparty", "memo", "voided", "revision", "created_at", "updated_at", "updated_by"];
const HISTORY = ["event_id", "entry_id", "revision", "recorded_at", "actor", "action", "before_json", "after_json"];
const MAX_ROWS = 50000;
let session, signingIn;

function failure(reason = "temporarily_unavailable", status) { return Object.assign(new Error(reason), { reason, status }); }
async function jsonResponse(response) {
  if (!response.ok) throw failure("temporarily_unavailable", response.status);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 32_000_000) throw failure();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function accessToken() {
  const source = process.env.FIREBASE_BUNGMO_SERVER || "";
  if (session?.source === source && session.expires > Date.now()) return session.token;
  if (signingIn?.source === source) return signingIn.promise;
  const current = { source };
  current.promise = (async () => {
    let credentials, key;
    try {
      credentials = JSON.parse(Buffer.from(source, "base64").toString("utf8"));
      if (credentials.type !== "service_account" || credentials.project_id !== "yadoran-2025" || credentials.client_email !== ERP_SERVICE_ACCOUNT) throw new Error();
      key = await importPKCS8(credentials.private_key, "RS256");
    } catch { throw failure("sheets_not_configured"); }
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
      .setProtectedHeader({ alg: "RS256" }).setIssuer(ERP_SERVICE_ACCOUNT).setAudience(TOKEN_URL)
      .setIssuedAt().setExpirationTime("5m").sign(key);
    const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    const result = await jsonResponse(response);
    if (typeof result.access_token !== "string" || !result.access_token || result.token_type?.toLowerCase() !== "bearer" || !(Number(result.expires_in) > 60)) throw failure();
    session = { source, token: result.access_token, expires: Date.now() + (Math.min(Number(result.expires_in), 3600) - 60) * 1000 };
    return session.token;
  })();
  signingIn = current;
  try { return await current.promise; }
  finally { if (signingIn === current) signingIn = null; }
}
async function google(path, body) {
  const response = await fetch(API + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (response.status === 401) session = null;
  return jsonResponse(response);
}
const unlockRequest = owner => ({ deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataId: ERP_LOCK_ID, metadataKey: LOCK_KEY, metadataValue: owner, visibility: "DOCUMENT" } } } });
async function acquire(owner) {
  try {
    await google(":batchUpdate", { requests: [{ createDeveloperMetadata: { developerMetadata: { metadataId: ERP_LOCK_ID, metadataKey: LOCK_KEY, metadataValue: owner, location: { spreadsheet: true }, visibility: "DOCUMENT" } } }] });
  } catch (error) {
    if ([401, 403, 404].includes(error.status) || error.reason === "sheets_not_configured") throw error;
    let lock;
    // A lost creation response may still have acquired our lock. Prove ownership first.
    try { lock = await google(`/developerMetadata/${ERP_LOCK_ID}`); }
    catch { throw failure("ledger_busy"); }
    if (lock.metadataKey !== LOCK_KEY) throw failure("ledger_invalid");
    if (lock.metadataValue !== owner) throw failure("ledger_busy");
  }
}
function header(row, names) {
  if (!Array.isArray(row) || names.some((name, i) => row[i] !== name)) throw failure("ledger_invalid");
}
function readEntry(row) {
  const input = Object.fromEntries(COLUMNS.map((name, i) => [name, row[i] ?? ""]));
  if (typeof input.date === "number" && Number.isInteger(input.date)) input.date = new Date((input.date - 25569) * 86400000).toISOString().slice(0, 10);
  if (!UUID.test(input.id) || typeof input.voided !== "boolean" || !Number.isInteger(input.revision) || input.revision < 1 || input.revision > 2147483647
    || ![input.created_at, input.updated_at].every(v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)))
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.updated_by)) throw failure("ledger_invalid");
  try { return { ...input, ...validateEntry(input), id: input.id.toLowerCase() }; }
  catch { throw failure("ledger_invalid"); }
}
async function readLedger() {
  const params = new URLSearchParams({ fields: "sheets(properties(sheetId,title,gridProperties(rowCount)))" });
  const metadata = await google(`?${params}`);
  const ledger = metadata.sheets?.find(s => s.properties?.sheetId === 77402507 && s.properties.title === "거래원장")?.properties;
  const history = metadata.sheets?.find(s => s.properties?.sheetId === 297913949 && s.properties.title === "변경이력")?.properties;
  if (!ledger || !history || !Number.isInteger(ledger.gridProperties?.rowCount) || ledger.gridProperties.rowCount < 1 || ledger.gridProperties.rowCount > MAX_ROWS) throw failure("ledger_invalid");
  const query = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
  query.append("ranges", `'거래원장'!A1:L${ledger.gridProperties.rowCount}`);
  query.append("ranges", "'변경이력'!A1:H1");
  const response = await google(`/values:batchGet?${query}`);
  if (response.valueRanges?.length !== 2) throw failure("ledger_invalid");
  const grid = response.valueRanges[0].values || [];
  header(grid[0], COLUMNS); header(response.valueRanges[1].values?.[0], HISTORY);
  const rows = [], ids = new Set(); let free = -1;
  for (let index = 1; index < grid.length; index++) {
    const row = grid[index];
    if (!row[0]) {
      if (row.some((value, i) => value !== "" && value != null && !(i === 7 && value === false))) throw failure("ledger_invalid");
      if (free < 0) free = index;
      continue;
    }
    const entry = readEntry(row);
    if (ids.has(entry.id)) throw failure("ledger_invalid");
    ids.add(entry.id); rows.push({ row: index, entry });
  }
  return { ledger, history, rows, free: free < 0 ? grid.length : free };
}
const cell = value => ({ userEnteredValue: typeof value === "boolean" ? { boolValue: value } : typeof value === "number" ? { numberValue: value } : { stringValue: String(value) } });
function resultFor(error) {
  const reason = ["sheets_not_configured", "ledger_invalid", "ledger_busy", "entry_changed", "month_too_large"].includes(error.reason) ? error.reason : "temporarily_unavailable";
  return { status: reason === "entry_changed" ? 409 : reason === "month_too_large" ? 422 : 503, body: { reason } };
}

export async function sheetLedger(action, actor, input) {
  const owner = JSON.stringify({ request: randomUUID(), started_at: new Date().toISOString() });
  let locked = false, commitUncertain = false, result;
  try {
    if (!["list", "create", "update"].includes(action) || typeof actor !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor)) throw failure("ledger_invalid");
    if (action === "list" && !validMonth(input?.month)) throw failure("ledger_invalid");
    let value;
    if (action !== "list") {
      if (!UUID.test(input?.entry?.id || "") || typeof input.entry.voided !== "boolean" || !validDate(input.entry.date)) throw failure("ledger_invalid");
      value = { ...validateEntry(input.entry), id: input.entry.id.toLowerCase(), voided: input.entry.voided };
      if (action === "create" && value.voided || action === "update" && (!Number.isInteger(input.entry.revision) || input.entry.revision < 1 || input.entry.revision >= 2147483647)) throw failure("ledger_invalid");
    }
    await acquire(owner); locked = true;
    const { ledger, history, rows, free } = await readLedger();
    if (action === "list") {
      const entries = rows.map(item => item.entry).filter(e => e.date.slice(0, 7) === input.month);
      if (entries.length > 5000) throw failure("month_too_large");
      entries.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      result = { status: 200, body: { entries, storage: "google_sheets" } };
    } else {
      const existing = rows.find(item => item.entry.id === value.id);
      if (action === "create" && existing) {
        if (!Object.entries(value).every(([key, v]) => existing.entry[key] === v) || existing.entry.updated_by !== actor) throw failure("entry_changed");
        result = { status: 200, body: { entry: existing.entry, storage: "google_sheets" } };
      } else {
        if (action === "update" && (!existing || existing.entry.revision !== input.entry.revision)) throw failure("entry_changed");
        if (rows.filter(item => item.entry.id !== value.id && item.entry.date.slice(0, 7) === value.date.slice(0, 7)).length >= 5000) throw failure("month_too_large");
        const now = new Date().toISOString();
        const saved = { ...value, revision: existing ? existing.entry.revision + 1 : 1, created_at: existing ? existing.entry.created_at : now, updated_at: now, updated_by: actor };
        const rowIndex = existing ? existing.row : free;
        if (rowIndex >= MAX_ROWS) throw failure("ledger_invalid");
        const requests = [];
        if (rowIndex >= ledger.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: ledger.sheetId, dimension: "ROWS", length: 1 } });
        requests.push({ updateCells: { start: { sheetId: ledger.sheetId, rowIndex, columnIndex: 0 }, rows: [{ values: COLUMNS.map(key => cell(saved[key])) }], fields: "userEnteredValue" } });
        const operation = !existing ? "create" : existing.entry.voided !== saved.voided ? saved.voided ? "void" : "restore" : "update";
        requests.push({ appendCells: { sheetId: history.sheetId, rows: [{ values: [randomUUID(), saved.id, saved.revision, now, actor, operation, existing ? JSON.stringify(existing.entry) : "", JSON.stringify(saved)].map(cell) }], fields: "userEnteredValue" } });
        requests.push(unlockRequest(owner));
        // Release the lock in the same atomic batch as the ledger and history writes.
        commitUncertain = true;
        try { await google(":batchUpdate", { requests }); }
        catch (error) {
          if ([400, 401, 403, 404].includes(error.status)) commitUncertain = false;
          throw error;
        }
        locked = false; commitUncertain = false;
        result = { status: existing ? 200 : 201, body: { entry: saved, storage: "google_sheets" } };
      }
    }
  } catch (error) { result = resultFor(error); }
  finally {
    if (locked && !commitUncertain) {
      try { await google(":batchUpdate", { requests: [unlockRequest(owner)] }); }
      catch { result = resultFor(failure("ledger_busy")); }
    }
    // Never expire or steal a lock after an unknown commit outcome: a late write could overwrite a newer one.
  }
  return result;
}
