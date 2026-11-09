import { adminAccess } from "../api/admin.js";
import { readAnalytics } from "./analytics-storage.js";
import { sendJson } from "./dorms-auth.js";
import { createThumbnailRequestGuard, thumbnailClientIp } from "./thumbnail-reads.js";

const limit = createThumbnailRequestGuard();
let pending;
const count = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value, fallback = "") => typeof value === "string" && value ? value : fallback;

export function buildAnalyticsSummary({ pages, groupClicks, favorites, todayViews, totalViews }, date) {
  return {
    overview: { date, todayViews: count(todayViews), totalViews: count(totalViews) },
    pages: Object.values(pages || {}).filter(item => item && typeof item.key === "string" && item.key).map(item => ({
      key: item.key, title: text(item.title, item.key), path: text(item.path), type: text(item.type, "page"),
      views: count(item.views), visitors: count(item.visitors), updatedAt: count(item.updatedAt),
    })).sort((a, b) => b.visitors - a.visitors || b.views - a.views || a.title.localeCompare(b.title, "ko")),
    groupClicks: Object.values(groupClicks || {}).filter(item => item && typeof item.groupId === "string" && item.groupId).map(item => ({
      groupId: item.groupId, title: text(item.title, item.groupId), type: text(item.type, "group"), views: count(item.views),
      totalClicks: count(item.totalClicks), visitorCount: count(item.visitorCount), lastHref: text(item.lastHref), updatedAt: count(item.updatedAt),
    })).sort((a, b) => b.views - a.views || b.visitorCount - a.visitorCount || a.title.localeCompare(b.title, "ko")),
    favorites: Object.entries(favorites || {}).map(([resourceId, value]) => ({ resourceId, count: count(value?.count) })),
  };
}

async function summary() {
  if (!pending) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    pending = Promise.all([readAnalytics("pages"), readAnalytics("groupClicks"), readAnalytics("favorites"), readAnalytics(`daily/${date}/views`), readAnalytics("totals/views")])
      .then(([pages, groupClicks, favorites, todayViews, totalViews]) => buildAnalyticsSummary({ pages, groupClicks, favorites, todayViews, totalViews }, date))
      .finally(() => { pending = null; });
  }
  return pending;
}

export default async function handler(req, res) {
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  if (req.method !== "GET") return sendJson(res, 405, { reason: "method_not_allowed" });
  const query = new URL(req.url, "https://booong.invalid").searchParams;
  if ([...query.keys()].some(key => key !== "admin" || query.getAll(key).length !== 1) || (query.has("admin") && query.get("admin") !== "1")) return sendJson(res, 400, { reason: "invalid_query" });
  const retry = limit(thumbnailClientIp(req));
  if (retry) { res.setHeader("Retry-After", String(retry)); return sendJson(res, 429, { reason: "too_many_requests" }); }
  if (query.has("admin")) {
    const access = await adminAccess(req);
    if (access.status !== 200) return sendJson(res, access.status, access.body);
    try { return sendJson(res, 200, await readAnalytics() || {}); }
    catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
  }
  try {
    const data = await summary();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("Vercel-CDN-Cache-Control", "max-age=60");
    res.end(JSON.stringify(data));
  } catch { return sendJson(res, 503, { reason: "temporarily_unavailable" }); }
}
