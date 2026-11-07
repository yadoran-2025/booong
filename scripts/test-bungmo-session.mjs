import assert from "node:assert/strict";
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { MEMBER_PROFILE_SHEET_URL } from "../js/member-data.js";
import handler from "../api/bungmo-session.js";

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: "bungmo-test", alg: "RS256", use: "sig" };
const originalFetch = globalThis.fetch;
let now = Date.now();
const originalNow = Date.now;
Date.now = () => now;
let list = "id,admin\n1,operator@example.com\n2,second@example.com\n";
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes("securetoken@system.gserviceaccount.com")) return new Response(JSON.stringify({ keys: [jwk] }));
  assert.ok(url.startsWith(MEMBER_PROFILE_SHEET_URL));
  return new Response(list);
};
const credentials = { type: "service_account", project_id: "yadoran-2025", client_email: "booong-bungmo-server@yadoran-2025.iam.gserviceaccount.com", private_key: await exportPKCS8(privateKey) };
const response = async (token, method = "POST") => {
  const result = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler({ method, headers: { authorization: token ? `Bearer ${token}` : "" } }, result);
  return result;
};
const identity = (email, claims = {}) => new SignJWT({ email, email_verified: true, auth_time: Math.floor(now / 1000), firebase: { sign_in_provider: "google.com" }, ...claims })
  .setProtectedHeader({ alg: "RS256", kid: "bungmo-test" }).setSubject("original-google-uid")
  .setIssuer("https://securetoken.google.com/yadoran-2025").setAudience("yadoran-2025").setIssuedAt(Math.floor(now / 1000)).setExpirationTime("1h").sign(privateKey);
try {
  assert.equal((await response(null)).statusCode, 401);
  assert.equal((await response("forged")).statusCode, 401);
  assert.equal((await response(await identity("guest@example.com"))).statusCode, 403);
  assert.equal((await response(await identity("operator@example.com", { email_verified: false }))).statusCode, 401);
  assert.equal((await response(await identity("operator@example.com", { firebase: { sign_in_provider: "custom" } }))).statusCode, 401);
  assert.equal((await response(null, "GET")).statusCode, 405);
  const google = await identity("operator@example.com");
  assert.equal((await response(google)).statusCode, 503);
  process.env.FIREBASE_BUNGMO_SERVER = Buffer.from(JSON.stringify(credentials)).toString("base64");
  for (const email of ["operator@example.com", "second@example.com"]) {
    const result = await response(await identity(email));
    assert.equal(result.statusCode, 200);
    const { payload } = await jwtVerify(result.body.token, publicKey, { issuer: credentials.client_email, subject: credentials.client_email, audience: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" });
    assert.equal(payload.uid, "original-google-uid", "Preserve existing participant IDs");
    assert.deepEqual(payload.claims, { bungmoOperator: true, bungmoEmail: email, bungmoUntil: Math.floor(now / 1000) + 120 });
    assert.ok(payload.exp - payload.iat <= 60);
  }
  process.env.FIREBASE_BUNGMO_SERVER = Buffer.from(JSON.stringify({ ...credentials, project_id: "other-app" })).toString("base64");
  assert.equal((await response(google)).statusCode, 503);
  list = "id,admin\n1,second@example.com\n";
  now += 31000;
  assert.equal((await response(google)).statusCode, 403, "Removed operators cannot renew a data session");
  console.log("Bungmo operator sessions, guest denial, signing scope and revocation passed.");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  delete process.env.FIREBASE_BUNGMO_SERVER;
}
