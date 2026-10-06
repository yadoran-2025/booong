import { configured, currentUser, DormsAuthError, readCookie, sendJson, SESSION_COOKIE } from "../../../lib/dorms-auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { reason: "method_not_allowed" });
  if (!configured()) return sendJson(res, 503, { reason: "not_configured" });
  try {
    const user = await currentUser(readCookie(req, SESSION_COOKIE));
    sendJson(res, 200, user);
  } catch (error) {
    sendJson(res, error instanceof DormsAuthError ? error.status : 503, {
      reason: error instanceof DormsAuthError ? error.reason : "temporarily_unavailable",
    });
  }
}
