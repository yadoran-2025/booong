import { cookie, DormsAuthError, finishLogin, FLOW_COOKIE, parseFlow, readCookie, sendJson, SESSION_COOKIE, siteOriginForHost } from "../../../lib/dorms-auth.js";

function denied(res, reason, next = "/") {
  res.statusCode = 302;
  res.setHeader("Location", `/dorms-denied.html?reason=${reason}&next=${encodeURIComponent(next)}`);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { reason: "method_not_allowed" });
  const params = new URL(req.url, "https://booong.invalid").searchParams;
  const flow = parseFlow(readCookie(req, FLOW_COOKIE));
  res.setHeader("Set-Cookie", cookie(FLOW_COOKIE, "", 0));
  if (!flow || params.get("state") !== flow.state) return denied(res, "authentication_required");
  if (params.has("error")) return denied(res, params.get("error") === "temporarily_unavailable" ? "temporarily_unavailable" : "access_denied", flow.next);
  const code = params.get("code");
  if (!code) return denied(res, "authentication_required", flow.next);
  try {
    const session = await finishLogin(code, flow, req.headers.host);
    res.statusCode = 302;
    res.setHeader("Location", new URL(flow.next, siteOriginForHost(req.headers.host)).toString());
    res.setHeader("Set-Cookie", [cookie(FLOW_COOKIE, "", 0), cookie(SESSION_COOKIE, session.token, session.maxAge)]);
    res.setHeader("Cache-Control", "no-store");
    res.end();
  } catch (error) {
    denied(res, error instanceof DormsAuthError ? error.reason : "temporarily_unavailable", flow.next);
  }
}
