import { cookie, FLOW_COOKIE, sendJson, SESSION_COOKIE, siteOriginForHost } from "../../../lib/dorms-auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { reason: "method_not_allowed" });
  let from;
  try { from = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : ""); }
  catch { return sendJson(res, 403, { reason: "forbidden" }); }
  const fetchSite = req.headers["sec-fetch-site"];
  let origin;
  try { origin = siteOriginForHost(req.headers.host); }
  catch { return sendJson(res, 503, { reason: "not_configured" }); }
  if (from !== origin || (fetchSite && !["same-origin", "none"].includes(fetchSite))) return sendJson(res, 403, { reason: "forbidden" });
  res.setHeader("Set-Cookie", [cookie(SESSION_COOKIE, "", 0), cookie(FLOW_COOKIE, "", 0)]);
  sendJson(res, 200, { ok: true });
}
