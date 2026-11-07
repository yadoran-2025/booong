import { decodeJwt, importPKCS8, SignJWT } from "jose";
import { adminAccess } from "./admin.js";
import { sendJson } from "../lib/dorms-auth.js";

const account = "booong-bungmo-server@yadoran-2025.iam.gserviceaccount.com";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { reason: "method_not_allowed" });
  const access = await adminAccess(req);
  if (access.status !== 200) return sendJson(res, access.status, access.body);
  try {
    const credentials = JSON.parse(Buffer.from(process.env.FIREBASE_BUNGMO_SERVER || "", "base64").toString("utf8"));
    if (credentials.project_id !== "yadoran-2025" || credentials.client_email !== account || credentials.type !== "service_account") throw new Error("Wrong Bungmo signer");
    // Local sessions reuse the configured existing UID; production uses the verified Google token.
    const uid = access.body.local ? access.body.uid : decodeJwt(req.headers.authorization.slice(7)).sub;
    if (typeof uid !== 'string' || !uid || uid.length > 128) throw new Error('Missing operator UID');
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const token = await new SignJWT({ uid, claims: { bungmoOperator: true, bungmoEmail: access.body.email, bungmoUntil: expiresAt } })
      .setProtectedHeader({ alg: "RS256" }).setIssuer(account).setSubject(account)
      .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
      .setIssuedAt().setExpirationTime("60s").sign(await importPKCS8(credentials.private_key, "RS256"));
    return sendJson(res, 200, { token, expiresAt });
  } catch {
    return sendJson(res, 503, { reason: "bungmo_not_configured" });
  }
}
