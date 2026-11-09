import { resolve } from "node:path";
import { adminAccess } from "../api/admin.js";
import { isLoopbackRequest } from "./local-admin.js";
import { sendJson, siteOrigin } from "./dorms-auth.js";
import { createThumbnailStore, validThumbnailId, ThumbnailError } from "./thumbnail-store.js";
import { THUMBNAIL_MAX_BYTES, THUMBNAIL_MIME_TYPE } from "../js/thumbnail-data.js";
import { createThumbnailReadCache, createThumbnailRequestGuard, thumbnailClientIp } from "./thumbnail-reads.js";
import { cachePublicList, refreshPublicList, THUMBNAIL_LIST_CACHE_TAG } from "./public-list-cache.js";

const localStore = createThumbnailStore({ directory: resolve(".data/lesson-thumbnails") });
let cloudStore;
const publicCaches = new WeakMap();
const limitRequest = createThumbnailRequestGuard();

export default async function handler(req, res) {
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  const retryAfter = limitRequest(thumbnailClientIp(req));
  if (retryAfter) {
    res.setHeader("Retry-After", String(retryAfter));
    return sendJson(res, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  }
  if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, { error: "Method not allowed" });
  const query = new URL(req.url, "https://booong.invalid").searchParams;
  const allowed = req.method === "POST" ? ["id", "revision", "restore"] : query.has("image") ? ["image"] : query.has("admin") ? ["admin"] : [];
  if ([...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)
    || (query.has("admin") && query.get("admin") !== "1") || (query.has("restore") && query.get("restore") !== "1")) {
    return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
  }
  const local = isLoopbackRequest(req);
  const store = local ? localStore : cloudStore ||= createThumbnailStore();
  if (!publicCaches.has(store)) publicCaches.set(store, createThumbnailReadCache(store));
  const publicReads = publicCaches.get(store);
  try {
    if (req.method === "GET" && query.has("image")) {
      const image = await publicReads.image(query.get("image"));
      res.setHeader("Content-Type", query.get("image").endsWith(".webp") ? THUMBNAIL_MIME_TYPE : "image/png");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Vercel-CDN-Cache-Control", "max-age=31536000");
      res.statusCode = 200; res.end(image); return;
    }
    const manage = query.get("admin") === "1";
    if (manage || req.method === "POST") {
      const access = await adminAccess(req);
      if (access.status !== 200) return sendJson(res, access.status, access.body);
    }
    if (req.method === "GET") {
      if (manage) return sendJson(res, 200, { thumbnails: (await store.load()).thumbnails });
      const thumbnails = await publicReads.list(!local);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      cachePublicList(res, THUMBNAIL_LIST_CACHE_TAG, local);
      res.statusCode = 200; res.end(JSON.stringify({ thumbnails })); return;
    }
    if (req.headers.origin !== (local ? `http://${req.headers.host}` : siteOrigin())) return sendJson(res, 403, { error: "Forbidden" });
    const id = query.get("id"), revision = query.get("revision") || null;
    if (!validThumbnailId(id) || (revision && !/^[0-9a-f-]{36}$/.test(revision))) throw new ThumbnailError(400, "수업 ID와 수정 버전을 확인해주세요.");
    const restore = query.get("restore") === "1";
    let bytes;
    if (!restore) {
      if (req.headers["content-type"] !== THUMBNAIL_MIME_TYPE) throw new ThumbnailError(415, "WebP 이미지만 저장할 수 있습니다. 페이지를 새로고침한 뒤 다시 저장해주세요.");
      if (Number(req.headers["content-length"]) > THUMBNAIL_MAX_BYTES) throw new ThumbnailError(413, "이미지가 2MB를 넘습니다.");
      if (Buffer.isBuffer(req.body)) bytes = req.body;
      else {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > THUMBNAIL_MAX_BYTES) throw new ThumbnailError(413, "이미지가 2MB를 넘습니다.");
          chunks.push(chunk);
        }
        bytes = Buffer.concat(chunks);
      }
    }
    const thumbnail = await store.save(id, revision, bytes, restore);
    publicReads.clear();
    const warning = await refreshPublicList(THUMBNAIL_LIST_CACHE_TAG, local);
    return sendJson(res, 200, { thumbnail, ...(warning ? { warning } : {}) });
  } catch (error) {
    return sendJson(res, error.status || 503, { error: error instanceof ThumbnailError ? error.message : "썸네일 저장소에 연결하지 못했습니다. 다시 시도해주세요." });
  }
}

