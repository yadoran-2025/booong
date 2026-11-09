import { SignJWT, importPKCS8 } from "jose";

export const ANALYTICS_DATABASE = "https://yadoran-2025-default-rtdb.firebaseio.com";
export const ANALYTICS_READER = "booong-analytics-reader@yadoran-2025.iam.gserviceaccount.com";
let session, signingIn;

async function idToken() {
  if (session?.expires > Date.now()) return session.token;
  signingIn ||= (async () => {
    const account = JSON.parse(Buffer.from(process.env.FIREBASE_BOOONG_ANALYTICS_READER || "", "base64").toString("utf8"));
    if (account.type !== "service_account" || account.project_id !== "yadoran-2025" || account.client_email !== ANALYTICS_READER) throw new Error("Wrong BOOONG analytics reader");
    const token = await new SignJWT({ uid: "booong-analytics-reader", claims: { booongAnalyticsRead: true } })
      .setProtectedHeader({ alg: "RS256" }).setIssuer(ANALYTICS_READER).setSubject(ANALYTICS_READER)
      .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
      .setIssuedAt().setExpirationTime("1h").sign(await importPKCS8(account.private_key, "RS256"));
    const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyB_wsXQ_THiDLIvlaQAKEJCzIlz5M5dbDY", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
      signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok || typeof body.idToken !== "string" || !body.idToken || !(Number(body.expiresIn) > 60)) throw new Error("Analytics authentication unavailable");
    session = { token: body.idToken, expires: Date.now() + (Math.min(Number(body.expiresIn), 3600) - 60) * 1000 };
    return session.token;
  })();
  try { return await signingIn; }
  finally { signingIn = null; }
}

export async function readAnalytics(path = "") {
  if (!["", "pages", "groupClicks", "favorites", "totals/views"].includes(path) && !/^daily\/\d{4}-\d{2}-\d{2}\/views$/.test(path)) throw new Error("Invalid analytics path");
  const url = new URL(`${ANALYTICS_DATABASE}/analytics${path ? `/${path}` : ""}.json`);
  url.searchParams.set("auth", await idToken());
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
  if (!response.ok) { if (response.status === 401) session = null; throw new Error("Analytics storage unavailable"); }
  return response.json();
}
