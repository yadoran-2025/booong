import { readFile } from "node:fs/promises";
import { sendJson } from "../lib/dorms-auth.js";
import { adminAccess } from "./admin.js";
import { signedTextbookUrl } from "../lib/textbook-storage.js";
import { getTextbookSection } from "../js/textbook-library.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { reason: "method_not_allowed" });
  const url = new URL(req.url, "https://booong.invalid");
  // ponytail: localhost preview needs an explicit server flag; production never bypasses Google admin verification.
  const preview = process.env.NODE_ENV !== "production" && process.env.BOOONG_TEXTBOOK_PREVIEW === "1"
    && ["127.0.0.1:8765", "localhost:8765"].includes(req.headers.host) && url.searchParams.get("preview") === "1";
  try {
    if (!preview) {
      const { status, body } = await adminAccess(req);
      if (status !== 200) return sendJson(res, status, body);
    }
    const library = JSON.parse(await readFile(new URL("../data/textbooks.json", import.meta.url), "utf8"));
    if (url.searchParams.get("catalog") === "1") return sendJson(res, 200, library);
    const rawChapter = url.searchParams.get("chapter");
    if (rawChapter === null) return sendJson(res, 400, { reason: "chapter_required" });
    if (!/^(0|[1-9]\d?)$/.test(rawChapter)) return sendJson(res, 400, { reason: "invalid_chapter" });
    const selected = getTextbookSection(library, url.searchParams.get("book"), url.searchParams.get("unit"), Number(rawChapter));
    if (!selected) return sendJson(res, 404, { reason: "not_found" });
    const download = signedTextbookUrl(selected.section.path);
    if (url.searchParams.get("format") === "json") return sendJson(res, 200, {
      url: download, bytes: selected.section.bytes, sha256: selected.section.sha256, expiresAt: Date.now() + 300_000,
    });
    res.statusCode = 307;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Location", download);
    res.end();
  } catch {
    return sendJson(res, 503, { reason: "temporarily_unavailable" });
  }
}
