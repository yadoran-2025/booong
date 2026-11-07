import { isIP } from "node:net";
import { validImageId, ThumbnailError } from "./thumbnail-store.js";

export const THUMBNAIL_CACHE_SECONDS = 30;
export const THUMBNAIL_REQUESTS_PER_MINUTE = 600;

export function thumbnailClientIp(req) {
  const forwarded = process.env.VERCEL === "1" ? req.headers["x-vercel-forwarded-for"] : null;
  const candidate = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return isIP(candidate) ? candidate : req.socket?.remoteAddress || "unknown";
}

export function createThumbnailRequestGuard(now = Date.now) {
  const clients = new Map();
  // shortcut: this is a per-instance fallback; the Vercel WAF rule enforces the deployed limit at the edge.
  return ip => {
    const time = now();
    if (clients.size >= 1024) for (const [key, entry] of clients) if (entry.until <= time) clients.delete(key);
    const key = clients.has(ip) || clients.size < 1024 ? ip : "overflow";
    let entry = clients.get(key);
    if (!entry || entry.until <= time) { entry = { count: 0, until: time + 60_000 }; clients.set(key, entry); }
    return ++entry.count > THUMBNAIL_REQUESTS_PER_MINUTE ? Math.max(1, Math.ceil((entry.until - time) / 1000)) : 0;
  };
}

export function createThumbnailReadCache(store, now = Date.now) {
  let records, expires = 0, pending, generation = 0, failureUntil = 0;
  let imageBytes = 0;
  const images = new Map(), pendingImages = new Map();
  async function current() {
    if (records && now() < expires) return records;
    if (now() < failureUntil) throw new ThumbnailError(503, "썸네일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    if (!pending) {
      const version = generation;
      pending = store.load().then(state => {
        if (version === generation) { records = state.thumbnails; expires = now() + THUMBNAIL_CACHE_SECONDS * 1000; }
        return version === generation ? records : current();
      }).catch(error => { if (version === generation) failureUntil = now() + 10_000; throw error; })
        .finally(() => { if (version === generation) pending = null; });
    }
    return pending;
  }
  return {
    clear() { generation++; records = undefined; expires = failureUntil = 0; pending = null; },
    async list() {
      return Object.fromEntries(Object.entries(await current()).map(([id, record]) => [id, { url: record.url }]));
    },
    async image(name) {
      if (!validImageId(name)) throw new ThumbnailError(404, "이미지를 찾지 못했습니다.");
      const url = `/api/lesson-thumbnails?image=${name}`;
      if (!Object.values(await current()).some(record => record.url === url || record.previousUrl === url)) throw new ThumbnailError(404, "이미지를 찾지 못했습니다.");
      if (images.has(name)) {
        const bytes = images.get(name); images.delete(name); images.set(name, bytes);
        return bytes;
      }
      if (!pendingImages.has(name)) {
        const request = store.image(name).then(bytes => {
          while (images.size && imageBytes + bytes.length > 32 * 1024 * 1024) {
            const oldest = images.keys().next().value;
            imageBytes -= images.get(oldest).length; images.delete(oldest);
          }
          if (bytes.length <= 32 * 1024 * 1024) { images.set(name, bytes); imageBytes += bytes.length; }
          return bytes;
        }).finally(() => pendingImages.delete(name));
        pendingImages.set(name, request);
      }
      return pendingImages.get(name);
    },
  };
}
