import { SignJWT, importPKCS8 } from "jose";

export const BOOONG_CONTENT_DATABASE = "https://yadoran-2025-booong-content.asia-southeast1.firebasedatabase.app";
export const BOOONG_CONTENT_ACCOUNT = "booong-content-server@yadoran-2025.iam.gserviceaccount.com";
const apiKey = "AIzaSyB_wsXQ_THiDLIvlaQAKEJCzIlz5M5dbDY";

export class ContentConflictError extends Error {}

export function contentCredentials(credentials) {
  const account = JSON.parse(Buffer.from(credentials || "", "base64").toString("utf8"));
  if (account.type !== "service_account" || account.project_id !== "yadoran-2025" || account.client_email !== BOOONG_CONTENT_ACCOUNT) throw new Error("Wrong BOOONG content credentials");
  return account;
}

export function createContentStorage({ credentials = process.env.FIREBASE_BOOONG_CONTENT_SERVER, fetcher = fetch } = {}) {
  let session, signingIn;
  async function idToken() {
    if (session?.expires > Date.now()) return session.token;
    signingIn ||= (async () => {
      const account = contentCredentials(credentials);
      const token = await new SignJWT({ uid: "booong-content-server", claims: { booongContent: true } })
        .setProtectedHeader({ alg: "RS256" }).setIssuer(BOOONG_CONTENT_ACCOUNT).setSubject(BOOONG_CONTENT_ACCOUNT)
        .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
        .setIssuedAt().setExpirationTime("1h").sign(await importPKCS8(account.private_key, "RS256"));
      const response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }),
        signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || typeof body.idToken !== "string" || !body.idToken || !(Number(body.expiresIn) > 60)) throw new Error("BOOONG content authentication unavailable");
      session = { token: body.idToken, expires: Date.now() + (Math.min(Number(body.expiresIn), 3600) - 60) * 1000 };
      return session.token;
    })();
    try { return await signingIn; }
    finally { signingIn = null; }
  }
  async function request(name, method, data, etag) {
    if (!["catalog", "members", "thumbnails", "workshop"].includes(name)) throw new Error("Invalid BOOONG content record");
    if (method === "PUT" && (typeof etag !== "string" || !etag || /[\r\n]/.test(etag))) throw new Error("Content revision required");
    // JSON strings preserve empty arrays, nulls and sheet column names exactly.
    const serialized = method === "PUT" ? JSON.stringify(data) : undefined;
    if (method === "PUT" && (typeof serialized !== "string" || Buffer.byteLength(serialized) > 8 * 1024 * 1024)) throw new Error("Content record too large or invalid");
    const url = new URL(`${BOOONG_CONTENT_DATABASE}/content/${name}.json`);
    url.searchParams.set("auth", await idToken());
    const response = await fetcher(url, {
      method, headers: { "Content-Type": "application/json", "X-Firebase-ETag": "true", ...(method === "PUT" ? { "if-match": etag } : {}) },
      ...(method === "PUT" ? { body: JSON.stringify(serialized) } : {}),
      signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store",
    });
    if (response.status === 412) throw new ContentConflictError("BOOONG content changed");
    if (!response.ok) { if (response.status === 401) session = null; throw new Error("BOOONG content storage unavailable"); }
    const revision = response.headers.get("etag");
    if (!revision) throw new Error("BOOONG content revision unavailable");
    if (method === "PUT") return { etag: revision };
    const value = await response.json();
    if (value !== null && typeof value !== "string") throw new Error("Invalid BOOONG content format");
    return { data: value === null ? null : JSON.parse(value), etag: revision };
  }
  return {
    read: name => request(name, "GET"),
    write: (name, data, etag) => request(name, "PUT", data, etag),
  };
}

export const contentStorage = createContentStorage();
