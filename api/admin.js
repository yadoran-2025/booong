import { createRemoteJWKSet, jwtVerify } from "jose";
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

function adminEmails() {
  const emails = (process.env.BOOONG_ADMIN_EMAILS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!emails.length || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("admin_not_configured");
  return new Set(emails);
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
    const allowed = adminEmails().has(email);
    return { status: allowed ? 200 : 403, body: allowed ? { email } : { reason: "access_denied" } };
  } catch (error) {
    return { status: 503, body: { reason: error.message === "admin_not_configured" ? "admin_not_configured" : "temporarily_unavailable" } };
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url || "/api/admin", "https://booong.invalid");
  if (url.pathname === "/api/analytics" || url.searchParams.has("analytics") || req.query?.analytics === "1") {
    if (url.searchParams.getAll("analytics").length > 1 || (url.searchParams.has("analytics") && url.searchParams.get("analytics") !== "1")) return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
    url.searchParams.delete("analytics");
    req.url = `/api/analytics${url.search}`;
    return (await import("../lib/analytics-api.js")).default(req, res);
  }
  if (url.pathname === "/api/members" || url.searchParams.has("members") || req.query?.members === "1") {
    if (url.searchParams.getAll("members").length > 1 || (url.searchParams.has("members") && url.searchParams.get("members") !== "1")) return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
    url.searchParams.delete("members");
    req.url = `/api/members${url.search}`;
    return (await import("../lib/member-profile-api.js")).default(req, res);
  }
  if (url.pathname === "/api/lesson-catalog" || url.searchParams.has("catalog") || req.query?.catalog === "1") {
    if (url.searchParams.getAll("catalog").length > 1 || (url.searchParams.has("catalog") && url.searchParams.get("catalog") !== "1")) return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
    url.searchParams.delete("catalog");
    req.url = `/api/lesson-catalog${url.search}`;
    return (await import("../lib/lesson-catalog-api.js")).default(req, res);
  }
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
