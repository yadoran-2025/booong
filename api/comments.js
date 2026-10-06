import { currentUser, DormsAuthError, readCookie, sendJson, SESSION_COOKIE, siteOriginForHost } from "../lib/dorms-auth.js";

const RESOURCE_ID = /^[\p{L}\p{N}_-]{1,120}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = "id,author_sub,author_name,author_picture,body,parent_id,created_at,edited_at,deleted_at";

async function store(method, filters = {}, body) {
  const base = new URL(process.env.SUPABASE_URL || "");
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.hostname === "localhost")) throw new Error("Invalid database URL");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing database key");
  const url = new URL("/rest/v1/lesson_comments", base);
  if (method !== "HEAD") url.searchParams.set("select", COLUMNS);
  for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
  if (method === "GET") {
    url.searchParams.set("order", "created_at.desc,id.desc");
    url.searchParams.set("limit", "100");
  }
  const response = await fetch(url, {
    method,
    headers: { apikey: key, Accept: "application/json", Prefer: method === "GET" || method === "HEAD" ? "count=exact" : "return=representation", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Database returned ${response.status}`);
  const total = Number(response.headers.get("content-range")?.split("/")[1]);
  if (method === "HEAD") return Number.isSafeInteger(total) && total >= 0 ? total : 0;
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid database response");
  return rows;
}

function publicComment(row, viewerId) {
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id, parentId: row.parent_id,
    name: deleted ? "삭제된 댓글" : row.author_name,
    picture: deleted ? null : row.author_picture,
    text: deleted ? "" : row.body,
    createdAt: row.created_at, editedAt: deleted ? null : row.edited_at,
    deleted, mine: !deleted && Boolean(viewerId) && row.author_sub === viewerId,
  };
}

async function inputBody(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2048) throw new Error("Body too large");
  }
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) return sendJson(res, 405, { reason: "method_not_allowed" });
  if (req.method === "GET") {
    const url = new URL(req.url, "https://booong.invalid");
    const resourceId = url.searchParams.get("resourceId");
    if (!RESOURCE_ID.test(resourceId || "")) return sendJson(res, 400, { reason: "invalid_resource" });
    if (url.searchParams.get("countOnly") === "1") {
      try { return sendJson(res, 200, { count: await store("HEAD", { resource_id: `eq.${resourceId}`, deleted_at: "is.null" }) }); }
      catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
    }
    let viewer = null;
    let viewerError = null;
    if (url.searchParams.get("viewer") === "1") {
      try { viewer = await currentUser(readCookie(req, SESSION_COOKIE)); }
      catch (error) { viewerError = error instanceof DormsAuthError ? error.reason : "temporarily_unavailable"; }
    }
    try {
      const filters = { resource_id: `eq.${resourceId}` };
      const [rows, count] = await Promise.all([
        store("GET", filters), store("HEAD", { ...filters, deleted_at: "is.null" }),
      ]);
      return sendJson(res, 200, {
        comments: rows.map(row => publicComment(row, viewer?.id)), count,
        ...(url.searchParams.get("viewer") === "1" ? { viewer, viewerError } : {}),
      });
    } catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
  }

  let origin;
  try { origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : ""); }
  catch { return sendJson(res, 403, { reason: "forbidden" }); }
  try { if (origin !== siteOriginForHost(req.headers.host)) return sendJson(res, 403, { reason: "forbidden" }); }
  catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }

  let input;
  try { input = await inputBody(req); }
  catch { return sendJson(res, 400, { reason: "invalid_comment" }); }
  const resourceId = input?.resourceId;
  const commentId = input?.commentId;
  const parentId = input?.parentId ?? null;
  const body = typeof input?.text === "string" ? input.text.trim() : "";
  if (!RESOURCE_ID.test(resourceId || "") || (req.method !== "POST" && !UUID.test(commentId || "")) ||
      (req.method === "POST" && parentId !== null && !UUID.test(parentId)) ||
      (req.method !== "DELETE" && (body.length < 1 || body.length > 500))) {
    return sendJson(res, 400, { reason: "invalid_comment" });
  }

  try {
    const user = await currentUser(readCookie(req, SESSION_COOKIE));
    let rows;
    if (req.method === "POST") {
      if (parentId) {
        const parents = await store("GET", { id: `eq.${parentId}`, resource_id: `eq.${resourceId}`, parent_id: "is.null", deleted_at: "is.null" });
        if (parents.length !== 1) return sendJson(res, 400, { reason: "invalid_parent" });
      }
      rows = await store("POST", {}, {
        resource_id: resourceId, author_sub: user.id, author_name: (user.name?.trim() || "도름스 회원").slice(0, 100),
        author_picture: user.picture, kind: "comment", body, parent_id: parentId,
      });
      if (rows.length !== 1) throw new Error("Invalid inserted row");
      return sendJson(res, 201, { comment: publicComment(rows[0], user.id) });
    }
    rows = await store("PATCH", { id: `eq.${commentId}`, resource_id: `eq.${resourceId}`, author_sub: `eq.${user.id}`, deleted_at: "is.null" },
      req.method === "DELETE"
        ? { body: "삭제된 댓글", author_name: "삭제된 댓글", author_picture: null, deleted_at: new Date().toISOString() }
        : { body, edited_at: new Date().toISOString() });
    if (!rows.length) return sendJson(res, 404, { reason: "not_found" });
    return sendJson(res, 200, { comment: publicComment(rows[0], user.id) });
  } catch (error) {
    return sendJson(res, error instanceof DormsAuthError ? error.status : 503, {
      reason: error instanceof DormsAuthError ? error.reason : "temporarily_unavailable",
    });
  }
}
