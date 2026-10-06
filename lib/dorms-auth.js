// DoRms v0.2.0 protocol, adapted for this site's Vercel functions.
// https://github.com/shinnanchanguk/dorms-login/blob/v0.2.0/docs/PROTOCOL.md
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://dorms.school";
const DEV_ORIGIN = process.env.NODE_ENV !== "production" && /^http:\/\/localhost(?::\d+)?$/.test(process.env.DORMS_API_ORIGIN_DEV || "")
  ? process.env.DORMS_API_ORIGIN_DEV : null;
const API_ORIGIN = DEV_ORIGIN || ISSUER;
const jwks = createRemoteJWKSet(new URL(`${API_ORIGIN}/api/sso/jwks`));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLOW_SECONDS = 600;
export const FLOW_COOKIE = "dorms_flow";
export const SESSION_COOKIE = "dorms_session";

export class DormsAuthError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
    this.status = reason === "authentication_required" ? 401 : reason === "access_denied" ? 403 : 503;
  }
}

function clientId() {
  const id = process.env.DORMS_CLIENT_ID?.trim() || "";
  if (!UUID.test(id)) throw new DormsAuthError("temporarily_unavailable");
  return id;
}

export function siteOrigin() {
  try {
    const url = new URL(process.env.DORMS_SITE_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid site URL");
    return url.origin;
  } catch { throw new DormsAuthError("temporarily_unavailable"); }
}

export const siteOriginForHost = (host = "") => process.env.NODE_ENV !== "production" && host === "localhost:3000" ? "http://localhost:3000" : siteOrigin();
export const callbackUrl = (host = "") => `${siteOriginForHost(host)}/api/auth/dorms/callback`;
export function configured() {
  try { clientId(); siteOrigin(); return true; }
  catch { return false; }
}
const random = () => randomBytes(32).toString("base64url");

export function safeNext(raw) {
  if (!raw || raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//") || /[\u0000-\u0020\u007f\\]/.test(raw)) return "/";
  try {
    const url = new URL(raw, "https://booong.invalid");
    const next = `${url.pathname}${url.search}${url.hash}`;
    return url.origin === "https://booong.invalid" && !url.pathname.startsWith("//") && next.length <= 512 ? next : "/";
  } catch { return "/"; }
}

function failure(status, body, fallback) {
  if (status === 429 || status >= 500 || body.reason === "temporarily_unavailable") return new DormsAuthError("temporarily_unavailable");
  if (status === 403 || body.reason === "access_denied") return new DormsAuthError("access_denied");
  if (status === 401 || body.reason === "authentication_required") return new DormsAuthError("authentication_required");
  return new DormsAuthError(fallback);
}

async function requestJson(url, init = {}, fallback = "access_denied") {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => null);
    const object = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    if (!response.ok) throw failure(response.status, object, fallback);
    if (object !== body) throw new DormsAuthError("temporarily_unavailable");
    return object;
  } catch (error) {
    if (error instanceof DormsAuthError) throw error;
    throw new DormsAuthError("temporarily_unavailable");
  }
}

export async function beginLogin(next, host = "") {
  const id = clientId();
  const configUrl = new URL(`${API_ORIGIN}/api/sso/clients/${id}/configuration`);
  configUrl.searchParams.set("redirect_uri", callbackUrl(host));
  const config = await requestJson(configUrl);
  if (config.active !== true) throw new DormsAuthError("access_denied");
  if (!Array.isArray(config.scopes) || !config.scopes.includes("openid") || !config.scopes.includes("profile") || !config.scopes.every(scope => ["openid", "profile"].includes(scope))) {
    throw new DormsAuthError("temporarily_unavailable");
  }
  const flow = { version: 2, state: random(), verifier: random(), nonce: random(), next: safeNext(next), createdAt: Math.floor(Date.now() / 1000) };
  const url = new URL(`${API_ORIGIN}/api/sso/authorize`);
  for (const [key, value] of Object.entries({
    response_type: "code", client_id: id, redirect_uri: callbackUrl(host), scope: [...new Set(config.scopes)].join(" "),
    state: flow.state, nonce: flow.nonce, code_challenge: createHash("sha256").update(flow.verifier, "ascii").digest("base64url"), code_challenge_method: "S256",
  })) url.searchParams.set(key, value);
  return { url: url.toString(), flow: Buffer.from(JSON.stringify(flow)).toString("base64url") };
}

export function parseFlow(value) {
  if (!value || value.length > 3500 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) return null;
    const flow = JSON.parse(bytes.toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (flow?.version !== 2 || ![flow.state, flow.verifier, flow.nonce].every(part => typeof part === "string" && /^[A-Za-z0-9_-]{43}$/.test(part))) return null;
    if (!Number.isInteger(flow.createdAt) || flow.createdAt > now + 30 || now - flow.createdAt > FLOW_SECONDS || typeof flow.next !== "string" || flow.next.length > 512) return null;
    return { ...flow, next: safeNext(flow.next) };
  } catch { return null; }
}

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER, audience: clientId(), algorithms: ["EdDSA"],
      requiredClaims: ["sub", "iat", "exp", "jti", "grant_version"],
    });
    if (!UUID.test(String(payload.sub)) || !UUID.test(String(payload.grant_version))) throw new DormsAuthError("authentication_required");
    return payload;
  } catch (error) {
    if (error instanceof DormsAuthError) throw error;
    if (String(error?.code || "").startsWith("ERR_JWT_") || String(error?.code || "").startsWith("ERR_JWS_") || ["ERR_JOSE_ALG_NOT_ALLOWED", "ERR_JWKS_NO_MATCHING_KEY"].includes(error?.code)) {
      throw new DormsAuthError("authentication_required");
    }
    throw new DormsAuthError("temporarily_unavailable");
  }
}

export async function finishLogin(code, flow, host = "") {
  const body = await requestJson(`${API_ORIGIN}/api/sso/token`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, code_verifier: flow.verifier, client_id: clientId(), redirect_uri: callbackUrl(host) }),
  }, "authentication_required");
  if (typeof body.id_token !== "string" || body.id_token.length > 3800) throw new DormsAuthError("temporarily_unavailable");
  const payload = await verifyToken(body.id_token);
  if (payload.nonce !== flow.nonce) throw new DormsAuthError("authentication_required");
  return { token: body.id_token, maxAge: Math.max(0, Number(payload.exp) - Math.floor(Date.now() / 1000)) };
}

export async function currentUser(token, { requireTeacher = false } = {}) {
  if (!token) throw new DormsAuthError("authentication_required");
  const payload = await verifyToken(token);
  const body = await requestJson(`${API_ORIGIN}/api/sso/userinfo`, { headers: { Authorization: `Bearer ${token}` } }, "authentication_required");
  if (body.sub !== payload.sub || typeof body.teacher_verified !== "boolean" || typeof body.dorms !== "number" || !Number.isFinite(body.dorms) || body.dorms < 0) {
    throw new DormsAuthError("temporarily_unavailable");
  }
  if (requireTeacher && body.teacher_verified !== true) throw new DormsAuthError("access_denied");
  let picture = null;
  if (typeof body.picture === "string" && body.picture.length <= 2048) {
    try {
      const url = new URL(body.picture);
      if (url.protocol === "https:" && !url.username && !url.password && url.href.length <= 2048) picture = url.href;
    } catch { /* Missing or invalid profile photo; use the name fallback. */ }
  }
  return { id: String(body.sub), name: typeof body.name === "string" ? body.name : null, picture };
}

export function readCookie(req, name) {
  return readCookieHeader(req.headers.cookie, name);
}

function readCookieHeader(header, name) {
  const entry = String(header || "").split(/;\s*/).find(part => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) || "";
}

export function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
