import { createHash, sign } from "node:crypto";

export const TEXTBOOK_BUCKET = "yadoran-2025.firebasestorage.app";
const READER = "booong-textbook-reader@yadoran-2025.iam.gserviceaccount.com";
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const hash = value => createHash("sha256").update(value).digest("hex");

// Google Cloud's V4 signing algorithm; no permanent Firebase download tokens.
export function signedTextbookUrl(path, now = new Date()) {
  if (!/^booong\/textbooks\/[a-z0-9-]+\/[a-z0-9-]+\.pdf$/.test(path)) throw new Error("Invalid textbook path");
  const credentials = JSON.parse(Buffer.from(process.env.FIREBASE_TEXTBOOK_READER || "", "base64").toString("utf8"));
  if (credentials.project_id !== "yadoran-2025" || credentials.client_email !== READER || credentials.type !== "service_account") throw new Error("Wrong textbook reader");
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const scope = `${timestamp.slice(0, 8)}/auto/storage/goog4_request`;
  const uri = `/${TEXTBOOK_BUCKET}/${path.split("/").map(encode).join("/")}`;
  const query = Object.entries({
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256", "X-Goog-Credential": `${READER}/${scope}`,
    "X-Goog-Date": timestamp, "X-Goog-Expires": "300", "X-Goog-SignedHeaders": "host",
  }).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&");
  const canonical = ["GET", uri, query, "host:storage.googleapis.com\n", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const signature = sign("RSA-SHA256", Buffer.from(["GOOG4-RSA-SHA256", timestamp, scope, hash(canonical)].join("\n")), credentials.private_key).toString("hex");
  return `https://storage.googleapis.com${uri}?${query}&X-Goog-Signature=${signature}`;
}
