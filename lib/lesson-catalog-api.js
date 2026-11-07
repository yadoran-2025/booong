import { resolve } from "node:path";
import { adminAccess } from "../api/admin.js";
import { isLoopbackRequest } from "./local-admin.js";
import { sendJson, siteOrigin } from "./dorms-auth.js";
import { buildDashboardCatalog } from "../js/dashboard-data.js";
import { CatalogError, createLessonCatalogStore } from "./lesson-catalog-store.js";
import { createThumbnailRequestGuard, thumbnailClientIp } from "./thumbnail-reads.js";

const localStore = createLessonCatalogStore({ directory: resolve(".data/lesson-catalog") });
let cloudStore;
const limit = createThumbnailRequestGuard();
const caches = new WeakMap();

export function createCatalogReadCache(store, now = Date.now) {
  let value, until = 0, pending, generation = 0;
  return { clear() { value = pending = undefined; until = 0; generation++; }, async read() {
    if (now() < until && value) return value;
    if (!pending) {
      const version = generation;
      pending = store.load().then(({ state }) => {
        const result = state ? { active: true, catalog: buildDashboardCatalog(state.rows, state.unitRows) } : { active: false };
        if (version === generation) { value = result; until = now() + 30000; }
        return result;
      }).catch(error => {
        if (version === generation) { value = { error: true }; until = now() + 10000; }
        throw error;
      }).finally(() => { if (version === generation) pending = undefined; });
    }
    return pending;
  } };
}

export default async function handler(req, res) {
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  const retry = limit(thumbnailClientIp(req));
  if (retry) { res.setHeader("Retry-After", String(retry)); return sendJson(res, 429, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }); }
  if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, { error: "Method not allowed" });
  const query = new URL(req.url, "https://booong.invalid").searchParams;
  if ([...query.keys()].some(key => key !== "admin" || query.getAll(key).length !== 1) || (query.has("admin") && query.get("admin") !== "1") || (req.method === "POST" && query.size)) return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
  const manage = req.method === "POST" || query.has("admin");
  if (manage) {
    const access = await adminAccess(req);
    if (access.status !== 200) return sendJson(res, access.status, access.body);
  }
  const local = isLoopbackRequest(req);
  const store = local ? localStore : cloudStore ||= createLessonCatalogStore({ token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!caches.has(store)) caches.set(store, createCatalogReadCache(store));
  const cache = caches.get(store);
  try {
    if (req.method === "GET") {
      if (manage) return sendJson(res, 200, { state: (await store.load()).state });
      const result = await cache.read();
      if (result.error) throw new Error("Catalog unavailable");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("Vercel-CDN-Cache-Control", "max-age=30");
      res.statusCode = 200; res.end(JSON.stringify(result)); return;
    }
    if (req.headers.origin !== (local ? `http://${req.headers.host}` : siteOrigin())) return sendJson(res, 403, { error: "Forbidden" });
    if (req.headers["content-type"] !== "application/json") return sendJson(res, 415, { error: "JSON 요청을 사용해주세요." });
    let size = 0; const chunks = [];
    if (Number(req.headers["content-length"]) > 64 * 1024) throw new CatalogError(413, "입력 내용이 너무 깁니다.");
    if (Buffer.isBuffer(req.body)) { size = req.body.length; chunks.push(req.body); }
    else for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw new CatalogError(413, "입력 내용이 너무 깁니다."); chunks.push(chunk); }
    if (size > 64 * 1024) throw new CatalogError(413, "입력 내용이 너무 깁니다.");
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CatalogError(400, "입력 내용을 확인해주세요."); }
    if (!input || typeof input !== "object" || !["import", "save"].includes(input.action) || !(input.revision === null || typeof input.revision === "string" && /^[0-9a-f-]{36}$/.test(input.revision))) throw new CatalogError(400, "수정 버전을 확인해주세요.");
    const state = await store.mutate(input);
    cache.clear();
    return sendJson(res, 200, { state });
  } catch (error) {
    return sendJson(res, error.status || 503, { error: error instanceof CatalogError ? error.message : "수업 저장소에 연결하지 못했습니다. 다시 시도해주세요." });
  }
}
