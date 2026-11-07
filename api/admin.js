import { createRemoteJWKSet, jwtVerify } from "jose";
import { parseCSV } from "../js/api.js";
import { MEMBER_PROFILE_SHEET_URL } from "../js/member-data.js";
import { sendJson } from "../lib/dorms-auth.js";
import { localAdminAccess } from "../lib/local-admin.js";

const PROJECT_ID = "yadoran-2025";
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export async function verifiedGoogleEmail(token) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["RS256"], issuer: `https://securetoken.google.com/${PROJECT_ID}`, audience: PROJECT_ID,
    requiredClaims: ["sub", "iat", "exp", "auth_time"],
  });
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128
    || typeof payload.iat !== "number" || payload.iat > now || typeof payload.auth_time !== "number" || payload.auth_time > now
    || payload.email_verified !== true || payload.firebase?.sign_in_provider !== "google.com"
    || typeof payload.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error("Invalid Google identity");
  return payload.email.trim().toLowerCase();
}

// ponytail: a per-instance 30-second allowlist cache; expired data is never used after a failed refresh.
let allowlist, pendingAllowlist;
async function adminEmails() {
  if (allowlist?.expires > Date.now()) return allowlist.emails;
  pendingAllowlist ||= (async () => {
    const response = await fetch(`${MEMBER_PROFILE_SHEET_URL}&_=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Member sheet unavailable");
    const rows = parseCSV(await response.text());
    const headers = (rows.shift() || []).map(value => value.replace(/^\uFEFF/, "").trim().toLowerCase());
    const column = headers.indexOf("admin");
    if (column < 0) throw new Error("admin_not_configured");
    const emails = new Set(rows.map(row => row[column]?.trim().toLowerCase()).filter(Boolean));
    allowlist = { emails, expires: Date.now() + 30_000 };
    return emails;
  })();
  try { return await pendingAllowlist; }
  finally { pendingAllowlist = null; }
}

export async function adminAccess(req) {
  const local = localAdminAccess(req);
  if (local) return local;
  const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || "")?.[1];
  if (!token || token.length > 16000) return { status: 401, body: { reason: "authentication_required" } };
  let email;
  try { email = await verifiedGoogleEmail(token); }
  catch { return { status: 401, body: { reason: "authentication_required" } }; }
  try {
    const allowed = (await adminEmails()).has(email);
    return { status: allowed ? 200 : 403, body: allowed ? { email } : { reason: "access_denied" } };
  } catch (error) {
    return { status: 503, body: { reason: error.message === "admin_not_configured" ? "admin_not_configured" : "temporarily_unavailable" } };
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url || "/api/admin", "https://booong.invalid");
  if (url.pathname === "/api/lesson-thumbnails" || url.searchParams.has("thumbnail") || req.query?.thumbnail === "1") {
    if (url.searchParams.getAll("thumbnail").length > 1 || (url.searchParams.has("thumbnail") && url.searchParams.get("thumbnail") !== "1")) return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
    url.searchParams.delete("thumbnail");
    req.url = `/api/lesson-thumbnails${url.search}`;
    return (await import("../lib/thumbnail-api.js")).default(req, res);
  }
  if (req.method !== "GET") return sendJson(res, 405, { reason: "method_not_allowed" });
  const { status, body } = await adminAccess(req);
  return sendJson(res, status, body);
}

export const config = { api: { bodyParser: false } };
