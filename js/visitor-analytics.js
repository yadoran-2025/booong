import { db, get, ref, remove, runTransaction, serverTimestamp, set, update } from "./firebase-config.js";
import { summarizeVisitorJourneys, summarizeWeeklyLessonClicks } from "./visitor-journeys.js";

const ANALYTICS_ROOT = "analytics";
const VISITOR_ID_KEY = "booong-visitor-id-v1";
const SESSION_VIEW_PREFIX = "booong-seen-v1:";
const DAILY_TIME_ZONE = "Asia/Seoul";

let publicSummaryRequest, publicSummaryUntil = 0;

function loadPublicSummary() {
  if (!publicSummaryRequest || Date.now() >= publicSummaryUntil) {
    const request = fetch("/api/analytics", { credentials: "omit", signal: AbortSignal.timeout(8000) }).then(async response => {
      if (!response.ok) throw new Error("Analytics summary unavailable");
      const data = await response.json();
      if (!data?.overview || typeof data.overview.date !== "string" || !Number.isFinite(data.overview.todayViews) || !Number.isFinite(data.overview.totalViews)
        || !Array.isArray(data.pages) || !Array.isArray(data.groupClicks) || !Array.isArray(data.favorites)) throw new Error("Invalid analytics summary");
      return data;
    }).catch(error => { if (publicSummaryRequest === request) publicSummaryRequest = null; throw error; });
    publicSummaryRequest = request;
    publicSummaryUntil = Date.now() + 15000;
  }
  return publicSummaryRequest;
}

const PAGE_LABELS = {
  dashboard: "대시보드",
  about: "소개",
  "asset-search": "수업자료 검색",
  author: "BNG LANG 에디터",
  print: "인쇄 페이지",
  select: "문제 선택",
  "worksheet-maker": "활동지 메이커",
};

export async function trackCurrentPage(extra = {}) {
  return trackPage(getCurrentPageInfo(extra));
}

export async function trackPage(page) {
  const normalized = normalizePage(page);
  if (!normalized.key) return null;

  const visitorId = getVisitorId();
  const pageRef = ref(db, `${ANALYTICS_ROOT}/pages/${normalized.key}`);
  const visitorRef = ref(db, `${ANALYTICS_ROOT}/pageVisitors/${normalized.key}/${visitorId}`);
  const isFirstViewInSession = markSessionView(normalized.key);

  try {
    await update(pageRef, {
      key: normalized.key,
      title: normalized.title,
      path: normalized.path,
      type: normalized.type,
      updatedAt: serverTimestamp(),
    });

    if (isFirstViewInSession) {
      const today = getDayKey();
      await Promise.all([
        runTransaction(ref(db, `${ANALYTICS_ROOT}/pages/${normalized.key}/views`), value => (Number(value) || 0) + 1),
        runTransaction(ref(db, `${ANALYTICS_ROOT}/daily/${today}/views`), value => (Number(value) || 0) + 1),
        runTransaction(ref(db, `${ANALYTICS_ROOT}/daily/${today}/pages/${normalized.key}`), value => (Number(value) || 0) + 1),
        runTransaction(ref(db, `${ANALYTICS_ROOT}/totals/views`), value => (Number(value) || 0) + 1),
      ]);
    }

    const existingVisitor = await get(visitorRef);
    if (!existingVisitor.exists()) {
      await set(visitorRef, { firstSeenAt: serverTimestamp() });
      await runTransaction(ref(db, `${ANALYTICS_ROOT}/pages/${normalized.key}/visitors`), value => (Number(value) || 0) + 1);
    }
  } catch (err) {
    console.warn("Visitor analytics update failed:", err);
  }

  return normalized;
}

export async function trackGroupClick(group) {
  const normalized = normalizeGroupClick(group);
  if (!normalized.groupId) return null;

  const visitorId = getVisitorId();
  const groupRef = ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}`);
  const visitorRef = ref(db, `${ANALYTICS_ROOT}/groupClickVisitors/${normalized.groupId}/${visitorId}`);
  const isFirstClickInSession = markSessionView(`group-${normalized.groupId}`);

  try {
    await Promise.all([
      runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}/totalClicks`), value => (Number(value) || 0) + 1),
      ...(isFirstClickInSession
        ? [
          runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}/views`), value => (Number(value) || 0) + 1),
          runTransaction(ref(db, `${ANALYTICS_ROOT}/daily/${getDayKey()}/groupClicks/${normalized.groupId}`), value => (Number(value) || 0) + 1),
        ]
        : []),
      update(groupRef, {
        groupId: normalized.groupId,
        title: normalized.title,
        type: normalized.type,
        lastHref: normalized.href,
        lastActionKey: normalized.actionKey,
        updatedAt: serverTimestamp(),
      }),
    ]);

    const existingVisitor = await get(visitorRef);
    if (existingVisitor.exists()) {
      await Promise.all([
        runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClickVisitors/${normalized.groupId}/${visitorId}/count`), value => (Number(value) || 0) + 1),
        update(visitorRef, {
          lastClickedAt: serverTimestamp(),
          lastActionKey: normalized.actionKey,
          lastHref: normalized.href,
        }),
      ]);
    } else {
      await Promise.all([
        set(visitorRef, {
          count: 1,
          firstClickedAt: serverTimestamp(),
          lastClickedAt: serverTimestamp(),
          lastActionKey: normalized.actionKey,
          lastHref: normalized.href,
        }),
        runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}/visitorCount`), value => (Number(value) || 0) + 1),
      ]);
    }
  } catch (err) {
    console.warn("Group click analytics update failed:", err);
  }

  return normalized;
}

const favoriteStateRequests = new Map();

export function setFavoriteState(resourceId, isFavorite) {
  const id = slugify(resourceId).slice(0, 96);
  if (!id) return Promise.resolve(null);
  const previous = favoriteStateRequests.get(id) || Promise.resolve();
  const request = previous.catch(() => null).then(() => writeFavoriteState(id, Boolean(isFavorite)));
  favoriteStateRequests.set(id, request);
  const cleanup = () => { if (favoriteStateRequests.get(id) === request) favoriteStateRequests.delete(id); };
  request.then(cleanup, cleanup);
  return request;
}

async function writeFavoriteState(id, isFavorite) {
  const visitorId = getVisitorId();
  const favoriteRef = ref(db, `${ANALYTICS_ROOT}/favorites/${id}`);
  const visitorRef = ref(db, `${ANALYTICS_ROOT}/favoriteVisitors/${id}/${visitorId}`);

  try {
    const existing = await get(visitorRef);
    if (existing.exists() === Boolean(isFavorite)) return null;

    const [, count] = await Promise.all([
      isFavorite ? set(visitorRef, { savedAt: serverTimestamp() }) : remove(visitorRef),
      runTransaction(ref(db, `${ANALYTICS_ROOT}/favorites/${id}/count`), value => {
        const current = Number(value) || 0;
        return isFavorite ? current + 1 : Math.max(0, current - 1);
      }),
      update(favoriteRef, { updatedAt: serverTimestamp() }),
    ]);
    return Number(count.snapshot.val()) || 0;
  } catch (err) {
    console.warn("Favorite analytics update failed:", err);
    return null;
  }
}

export async function loadFavoriteStats(options = {}) {
  try {
    return (await loadPublicSummary()).favorites;
  } catch (err) {
    if (options.throwOnError) throw err;
    console.warn("Favorite analytics load failed:", err);
    return [];
  }
}

export async function loadTodayStats() {
  try {
    const stats = (await loadPublicSummary()).overview;
    return { date: stats.date, views: stats.todayViews };
  } catch (err) {
    console.warn("Today stats load failed:", err);
    return { date: getDayKey(), views: 0 };
  }
}

export async function loadOverviewStats() {
  try { return (await loadPublicSummary()).overview; }
  catch (err) { console.warn("Overview stats load failed:", err); return null; }
}

export async function loadDailyViewStats(days = 7) {
  const wanted = getRecentDayKeys(days);
  return Promise.all(wanted.map(async date => {
    try {
      const snapshot = await get(ref(db, `${ANALYTICS_ROOT}/daily/${date}/views`));
      return { date, views: Number(snapshot.val()) || 0 };
    } catch (err) {
      console.warn("Daily view stats load failed:", err);
      return { date, views: 0 };
    }
  }));
}

export async function loadDailyLessonClickStats(days = 14) {
  const dates = getRecentDayKeys(days);
  try {
    const analytics = await loadAnalyticsSnapshot();
    const groups = analytics.groupClicks || {};
    return dates.map(date => ({
      date,
      lessons: Object.entries(analytics.daily?.[date]?.groupClicks || {})
        .map(([groupId, views]) => ({
          groupId,
          title: groups[groupId]?.title || groupId,
          views: Number(views) || 0,
        }))
        .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title, "ko")),
    }));
  } catch (err) {
    console.warn("Daily lesson click analytics load failed:", err);
    return dates.map(date => ({ date, lessons: [] }));
  }
}

export async function loadTodayPageStats() {
  const today = getDayKey();
  try {
    const analytics = await loadAnalyticsSnapshot();
    const dailyValue = analytics.daily?.[today]?.pages || {};
    const pageValue = analytics.pages || {};

    return Object.entries(dailyValue)
      .map(([key, views]) => {
        const meta = pageValue[key] || {};
        return {
          key,
          title: meta.title || key,
          path: meta.path || "",
          type: meta.type || "page",
          views: Number(views) || 0,
          totalViews: Number(meta.views) || 0,
        };
      })
      .filter(item => item.views > 0)
      .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title, "ko"));
  } catch (err) {
    console.warn("Today page stats load failed:", err);
    return [];
  }
}

export async function loadPageVisitStats(options = {}) {
  try {
    return (await loadPublicSummary()).pages;
  } catch (err) {
    if (options.throwOnError) throw err;
    console.warn("Visitor analytics load failed:", err);
    return [];
  }
}

export async function loadGroupClickStats(options = {}) {
  try {
    return (await loadPublicSummary()).groupClicks;
  } catch (err) {
    if (options.throwOnError) throw err;
    console.warn("Group click analytics load failed:", err);
    return [];
  }
}

export async function loadVisitorJourneyStats() {
  try {
    const analytics = await loadAnalyticsSnapshot();
    return summarizeVisitorJourneys(analytics.pageVisitors, analytics.groupClicks, analytics.groupClickVisitors);
  } catch (err) {
    console.warn("Visitor journey analytics load failed:", err);
    return null;
  }
}

export async function loadWeeklyLessonClickStats() {
  try {
    const analytics = await loadAnalyticsSnapshot();
    return summarizeWeeklyLessonClicks(analytics.groupClicks, analytics.groupClickVisitors, getWeekStartTimestamp());
  } catch (err) {
    console.warn("Weekly lesson click analytics load failed:", err);
    return [];
  }
}

export async function loadAnalyticsSnapshot() {
  const { adminFetch } = await import("./admin.js");
  const response = await adminFetch("/api/analytics?admin=1");
  if (!response.ok) throw new Error("Private analytics unavailable");
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid private analytics");
  return data;
}

export function getCurrentPageInfo(extra = {}) {
  const params = new URLSearchParams(location.search);
  const lessonId = extra.lessonId || params.get("lesson") || "";
  if (lessonId) {
    return {
      key: `lesson-${slugify(lessonId)}`,
      title: extra.title || document.title || lessonId,
      path: `index.html?lesson=${lessonId}`,
      type: "lesson",
    };
  }

  const fileName = getPageFileName();
  const id = fileName.replace(/\.html$/i, "") || "dashboard";
  const key = id === "index" ? "dashboard" : id;

  return {
    key,
    title: extra.title || PAGE_LABELS[key] || document.title || key,
    path: fileName || "index.html",
    type: key === "dashboard" ? "dashboard" : "page",
  };
}

function normalizePage(page = {}) {
  return {
    key: slugify(page.key).slice(0, 96),
    title: String(page.title || page.key || "").trim(),
    path: String(page.path || "").trim(),
    type: String(page.type || "page").trim(),
  };
}

function normalizeGroupClick(group = {}) {
  return {
    groupId: slugify(group.groupId || group.id).slice(0, 96),
    title: String(group.title || group.groupId || group.id || "").trim(),
    type: String(group.type || "group").trim(),
    href: String(group.href || "").trim(),
    actionKey: String(group.actionKey || "").trim(),
  };
}

export function getLessonPageKey(lessonId) {
  const slug = slugify(lessonId);
  return slug ? `lesson-${slug}`.slice(0, 96) : "";
}

export function getDayKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DAILY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getRecentDayKeys(days) {
  const count = Math.max(1, Math.min(Number(days) || 1, 90));
  const today = new Date();
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(getDayKey(new Date(today.getTime() - offset * 86400000)));
  }
  return keys;
}

function getWeekStartTimestamp() {
  const weekdays = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: DAILY_TIME_ZONE, weekday: "short" }).format(new Date());
  return new Date(`${getDayKey()}T00:00:00+09:00`).getTime() - (weekdays[weekday] || 0) * 86400000;
}

function markSessionView(key) {
  const storageKey = `${SESSION_VIEW_PREFIX}${key}`;
  try {
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, "1");
    return true;
  } catch {
    return true;
  }
}

function getVisitorId() {
  try {
    const stored = localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;
    const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getPageFileName() {
  const last = location.pathname.split("/").filter(Boolean).pop() || "index.html";
  return last.includes(".") ? last : "index.html";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}
