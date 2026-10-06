import { beginLogin, cookie, DormsAuthError, FLOW_COOKIE, safeNext, sendJson } from "../../../lib/dorms-auth.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, { reason: "method_not_allowed" });
  const next = safeNext(new URL(req.url, "https://booong.invalid").searchParams.get("next"));
  try {
    const login = await beginLogin(next, req.headers.host);
    res.statusCode = 302;
    res.setHeader("Location", login.url);
    res.setHeader("Set-Cookie", cookie(FLOW_COOKIE, login.flow, 600));
    res.setHeader("Cache-Control", "no-store");
    res.end();
  } catch (error) {
    res.setHeader("Set-Cookie", cookie(FLOW_COOKIE, "", 0));
    const reason = error instanceof DormsAuthError ? error.reason : "temporarily_unavailable";
    res.statusCode = 302;
    res.setHeader("Location", `/dorms-denied.html?reason=${reason}&next=${encodeURIComponent(next)}`);
    res.setHeader("Cache-Control", "no-store");
    res.end();
  }
}
