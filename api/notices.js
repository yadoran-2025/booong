import { adminAccess } from "./admin.js";
import { sendJson, siteOrigin } from "../lib/dorms-auth.js";
import { validateNoticeInput } from "../js/notices.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = "id,title,body,link,published,created_at,updated_at";

async function store(method, filters = {}, body) {
  const base = new URL(process.env.SUPABASE_URL || "");
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.hostname === "localhost")) throw new Error("Invalid database URL");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing database key");
  const url = new URL("/rest/v1/booong_notices", base);
  url.searchParams.set("select", COLUMNS);
  for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
  if (method === "GET") {
    url.searchParams.set("order", "created_at.desc,id.desc");
    // ponytail: the most recent 100 notices; add pagination when the archive grows beyond that.
    url.searchParams.set("limit", "100");
  }
  const response = await fetch(url, {
    method, headers: { apikey: key, Accept: "application/json", Prefer: "return=representation", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Notice database unavailable");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid database response");
  return rows;
}

async function inputBody(req) {
  if (req.body !== undefined) {
    if (JSON.stringify(req.body).length > 32000) throw new Error("Body too large");
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32000) throw new Error("Body too large");
  }
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) return sendJson(res, 405, { reason: "method_not_allowed" });
  if (req.method === "GET") {
    const manage = new URL(req.url, "https://booong.invalid").searchParams.get("admin") === "1";
    if (manage) {
      const access = await adminAccess(req);
      if (access.status !== 200) return sendJson(res, access.status, access.body);
    }
    try { return sendJson(res, 200, { notices: await store("GET", manage ? {} : { published: "eq.true" }) }); }
    catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
  }
  const access = await adminAccess(req);
  if (access.status !== 200) return sendJson(res, access.status, access.body);
  try {
    const host = req.headers.host;
    const local = process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1):\d+$/.test(host || "");
    if (req.headers.origin !== (local ? `http://${host}` : siteOrigin())) return sendJson(res, 403, { reason: "forbidden" });
  } catch { return sendJson(res, 403, { reason: "forbidden" }); }

  let input, value;
  try {
    input = await inputBody(req);
    if (req.method !== "POST" && (!UUID.test(input?.id || "") || typeof input?.updated_at !== "string" || !Number.isFinite(Date.parse(input.updated_at)))) throw new Error("Invalid notice");
    value = validateNoticeInput(input);
    if (input.published !== undefined) {
      if (typeof input.published !== "boolean") throw new Error("Invalid publication state");
      value.published = input.published;
    }
  } catch { return sendJson(res, 400, { reason: "invalid_notice" }); }

  try {
    // Every edit must advance the version, even when two requests arrive in the same millisecond.
    const now = new Date(Math.max(Date.now(), (Date.parse(input.updated_at) || 0) + 1)).toISOString();
    if (req.method === "POST") {
      const rows = await store("POST", {}, { ...value, updated_at: now });
      if (rows.length !== 1) throw new Error("Invalid inserted notice");
      return sendJson(res, 201, { notice: rows[0] });
    }
    const rows = await store("PATCH", { id: `eq.${input.id}`, updated_at: `eq.${input.updated_at}` }, { ...value, updated_at: now });
    if (!rows.length) return sendJson(res, 409, { reason: "notice_changed" });
    return sendJson(res, 200, { notice: rows[0] });
  } catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
}
