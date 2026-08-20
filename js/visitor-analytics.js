import { db, get, ref, runTransaction, serverTimestamp, set, update } from "./firebase-config.js";

const ANALYTICS_ROOT = "analytics";
const VISITOR_ID_KEY = "booong-visitor-id-v1";
const SESSION_VIEW_PREFIX = "booong-seen-v1:";
const DAILY_TIME_ZONE = "Asia/Seoul";

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
        ? [runTransaction(ref(db, `${ANALYTICS_ROOT}/groupClicks/${normalized.groupId}/views`), value => (Number(value) || 0) + 1)]
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

export async function loadTodayStats() {
  const today = getDayKey();
  try {
    const snapshot = await get(ref(db, `${ANALYTICS_ROOT}/daily/${today}/views`));
    return { date: today, views: Number(snapshot.val()) || 0 };
  } catch (err) {
    console.warn("Today stats load failed:", err);
    return { date: today, views: 0 };
  }
}

export async function loadOverviewStats() {
  const today = getDayKey();
  try {
    const [todaySnapshot, totalSnapshot] = await Promise.all([
      get(ref(db, `${ANALYTICS_ROOT}/daily/${today}/views`)),
      get(ref(db, `${ANALYTICS_ROOT}/totals/views`)),
    ]);
    return {
      date: today,
      todayViews: Number(todaySnapshot.val()) || 0,
      totalViews: Number(totalSnapshot.val()) || 0,
    };
  } catch (err) {
    console.warn("Overview stats load failed:", err);
    return null;
  }
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

export async function loadTodayPageStats() {
  const today = getDayKey();
  try {
    const [dailySnapshot, pageSnapshot] = await Promise.all([
      get(ref(db, `${ANALYTICS_ROOT}/daily/${today}/pages`)),
      get(ref(db, `${ANALYTICS_ROOT}/pages`)),
    ]);
    const dailyValue = dailySnapshot.val() || {};
    const pageValue = pageSnapshot.val() || {};

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

export async function loadPageVisitStats() {
  try {
    const snapshot = await get(ref(db, `${ANALYTICS_ROOT}/pages`));
    const value = snapshot.val() || {};
    return Object.values(value)
      .filter(item => item && item.key)
      .map(item => ({
        key: item.key,
        title: item.title || item.key,
        path: item.path || "",
        type: item.type || "page",
        views: Number(item.views) || 0,
        visitors: Number(item.visitors) || 0,
        updatedAt: item.updatedAt || 0,
      }))
      .sort((a, b) => b.visitors - a.visitors || b.views - a.views || a.title.localeCompare(b.title, "ko"));
  } catch (err) {
    console.warn("Visitor analytics load failed:", err);
    return [];
  }
}

export async function loadGroupClickStats() {
  try {
    const snapshot = await get(ref(db, `${ANALYTICS_ROOT}/groupClicks`));
    const value = snapshot.val() || {};
    return Object.values(value)
      .filter(item => item && item.groupId)
      .map(item => ({
        groupId: item.groupId,
        title: item.title || item.groupId,
        type: item.type || "group",
        views: Number(item.views) || 0,
        totalClicks: Number(item.totalClicks) || 0,
        visitorCount: Number(item.visitorCount) || 0,
        lastHref: item.lastHref || "",
        updatedAt: item.updatedAt || 0,
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks || b.visitorCount - a.visitorCount || a.title.localeCompare(b.title, "ko"));
  } catch (err) {
    console.warn("Group click analytics load failed:", err);
    return [];
  }
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
