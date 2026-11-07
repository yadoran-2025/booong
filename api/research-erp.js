import { adminAccess } from "./admin.js";
import { sendJson, siteOrigin } from "../lib/dorms-auth.js";
import { validateEntry, UUID, monthBounds } from "../js/research-erp-data.js";
import { erpStorage, sheetLedger } from "../lib/research-erp-sheets.js";

const COLUMNS = "id,date,category,amount,title,counterparty,memo,voided,revision,created_at,updated_at,updated_by";
const MAX_ROWS = 5000;
async function store(method, filters, body, offset = 0) {
  const base = new URL(process.env.SUPABASE_URL || "");
  if (base.protocol !== "https:") throw new Error("Invalid database URL");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing database key");
  const url = new URL("/rest/v1/booong_research_entries", base);
  url.searchParams.set("select", COLUMNS);
  for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
  if (method === "GET") {
    url.searchParams.set("order", "date.desc,id.desc");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
  }
  const response = await fetch(url, { method, headers: { apikey: key, Accept: "application/json", Prefer: method === "GET" ? "count=exact" : "return=representation", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    if (response.status === 409) throw new Error("duplicate_id");
    throw new Error("Database unavailable");
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid database response");
  if (method === "GET") {
    const count = /\/(\d+)$/.exec(response.headers.get("content-range") || "")?.[1];
    if (count === undefined) throw new Error("Missing complete record count");
    rows.total = Number(count);
  }
  return rows;
}
async function readBody(req) {
  if (req.body !== undefined) {
    if (JSON.stringify(req.body).length > 12000) throw new Error("Body too large");
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw new Error("Body too large"); }
  return JSON.parse(raw);
}
export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) return sendJson(res, 405, { reason: "method_not_allowed" });
  const access = await adminAccess(req);
  if (access.status !== 200) return sendJson(res, access.status, access.body);
  const storage = erpStorage();
  if (!["google_sheets", "supabase"].includes(storage)) return sendJson(res, 503, { reason: "storage_not_configured" });
  if (req.method === "GET") {
    let start, end;
    try { [start, end] = monthBounds(new URL(req.url, "https://booong.invalid").searchParams.get("month")); }
    catch { return sendJson(res, 400, { reason: "invalid_month" }); }
    if (storage === "google_sheets") return sheetsResponse(res, "list", access.body.email, { month: start.slice(0, 7) });
    try {
      const entries = [];
      let total;
      for (let offset = 0; offset <= MAX_ROWS;) {
        const page = await store("GET", { and: `(date.gte.${start},date.lt.${end})` }, undefined, offset);
        if (total !== undefined && page.total !== total) return sendJson(res, 409, { reason: "ledger_changed" });
        total = page.total;
        if (total > MAX_ROWS) return sendJson(res, 422, { reason: "month_too_large" });
        entries.push(...page);
        if (entries.length === total) return sendJson(res, 200, { entries });
        if (!page.length || entries.length > total) throw new Error("Incomplete ledger");
        // Respect a database row cap smaller than the requested page size.
        offset += page.length;
      }
    } catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
  }
  try {
    const host = req.headers.host;
    const local = process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1):\d+$/.test(host || "");
    if (req.headers.origin !== (local ? `http://${host}` : siteOrigin())) throw new Error("Invalid origin");
  } catch { return sendJson(res, 403, { reason: "forbidden" }); }
  let input, value;
  try {
    input = await readBody(req);
    if (!UUID.test(input?.id || "")) throw new Error("Invalid ID");
    input.id = input.id.toLowerCase();
    value = validateEntry(input);
    if (typeof input.voided !== "boolean") throw new Error("Invalid state");
    if (req.method === "POST" && input.voided) throw new Error("Invalid initial state");
    if (req.method === "PATCH" && (!Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision >= 2147483647)) throw new Error("Invalid revision");
  } catch { return sendJson(res, 400, { reason: "invalid_entry" }); }
  if (storage === "google_sheets") return sheetsResponse(res, req.method === "POST" ? "create" : "update", access.body.email, {
    entry: { ...value, id: input.id, voided: input.voided, ...(req.method === "PATCH" ? { revision: input.revision } : {}) },
  });
  try {
    const values = { ...value, voided: input.voided, updated_by: access.body.email };
    if (req.method === "POST") {
      // A client-generated ID survives retries after a lost response; never upsert a financial record.
      try {
        const rows = await store("POST", {}, { ...values, id: input.id });
        if (rows.length !== 1) throw new Error("Invalid insertion");
        return sendJson(res, 201, { entry: rows[0] });
      } catch (error) {
        if (error.message !== "duplicate_id") throw error;
        const [existing] = await store("GET", { id: `eq.${input.id}` });
        if (existing && Object.entries(values).every(([key, value]) => existing[key] === value)) return sendJson(res, 200, { entry: existing });
        return sendJson(res, 409, { reason: "entry_changed" });
      }
    }
    const rows = await store("PATCH", { id: `eq.${input.id}`, revision: `eq.${input.revision}` }, { ...values, revision: input.revision + 1 });
    if (!rows.length) return sendJson(res, 409, { reason: "entry_changed" });
    return sendJson(res, 200, { entry: rows[0] });
  } catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
}

async function sheetsResponse(res, action, actor, input) {
  try {
    const result = await sheetLedger(action, actor, input);
    return sendJson(res, result.status, result.body);
  } catch (error) {
    return sendJson(res, 503, { reason: error.message === "sheets_not_configured" ? "sheets_not_configured" : "temporarily_unavailable" });
  }
}
