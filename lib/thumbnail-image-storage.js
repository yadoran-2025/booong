import { SignJWT, importPKCS8 } from "jose";
import { randomUUID } from "node:crypto";
import { contentCredentials, ContentConflictError } from "./booong-content-storage.js";

export const THUMBNAIL_BUCKET = "yadoran-2025.firebasestorage.app";
export const THUMBNAIL_PREFIX = "booong/managed-content/thumbnails/images/";

export function createThumbnailImages({ credentials = process.env.FIREBASE_BOOONG_CONTENT_SERVER, fetcher = fetch } = {}) {
  let session, signingIn;
  async function accessToken() {
    if (session?.expires > Date.now()) return session.token;
    signingIn ||= (async () => {
      const account = contentCredentials(credentials);
      const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/devstorage.read_write" })
        .setProtectedHeader({ alg: "RS256" }).setIssuer(account.client_email)
        .setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h")
        .sign(await importPKCS8(account.private_key, "RS256"));
      const response = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
        signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok || typeof body.access_token !== "string" || !body.access_token || !(Number(body.expires_in) > 60)) throw new Error("Thumbnail authentication unavailable");
      session = { token: body.access_token, expires: Date.now() + (Math.min(Number(body.expires_in), 3600) - 60) * 1000 };
      return session.token;
    })();
    try { return await signingIn; } finally { signingIn = null; }
  }
  async function request(name, bytes) {
    if (!/^[0-9a-f-]{36}\.(?:png|webp)$/.test(name)) throw new Error("Invalid thumbnail image name");
    const upload = bytes !== undefined;
    if (upload && (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 2 * 1024 * 1024)) throw new Error("Invalid thumbnail image bytes");
    const object = THUMBNAIL_PREFIX + name;
    const url = upload ? new URL(`https://storage.googleapis.com/upload/storage/v1/b/${THUMBNAIL_BUCKET}/o`)
      : new URL(`https://storage.googleapis.com/storage/v1/b/${THUMBNAIL_BUCKET}/o/${encodeURIComponent(object)}`);
    if (upload) {
      url.searchParams.set("uploadType", "multipart");
      url.searchParams.set("ifGenerationMatch", "0");
    } else url.searchParams.set("alt", "media");
    const boundary = `booong-${randomUUID()}`;
    const contentType = name.endsWith(".webp") ? "image/webp" : "image/png";
    const body = upload ? Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: object, contentType, cacheControl: "private, no-store" })}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]) : undefined;
    const response = await fetcher(url, {
      method: upload ? "POST" : "GET", headers: { Authorization: `Bearer ${await accessToken()}`, ...(upload ? { "Content-Type": `multipart/related; boundary=${boundary}` } : {}) },
      ...(upload ? { body } : {}), signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store",
    });
    if (response.status === 412) throw new ContentConflictError("Thumbnail image already exists");
    if (!upload && response.status === 404) return null;
    if (!response.ok) { if (response.status === 401) session = null; throw new Error("Thumbnail image storage unavailable"); }
    return upload ? response.json() : Buffer.from(await response.arrayBuffer());
  }
  return { read: name => request(name), write: (name, bytes) => request(name, bytes) };
}

export const thumbnailImages = createThumbnailImages();
