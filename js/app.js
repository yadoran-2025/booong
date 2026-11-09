import { app } from "./state.js";
import { loadExternalAssets } from "./api.js";
import { isJsonLessonUrl, loadDashboardConfig } from "./dashboard-data.js";
import { showCommentNotice } from "./ui/home-comment-notice.js";
import { escapeHtml } from "./utils.js";
import { trackCurrentPage } from "./visitor-analytics.js";

/* ====================================================================
   진입점
   ==================================================================== */
async function init() {
  const params = new URLSearchParams(location.search);
  const lessonId = params.get("lesson");

  if (!lessonId) {
    trackCurrentPage();
    const { showDashboard } = await import("./ui/dashboard.js");
    await showDashboard();
    if (!params.get("view")) showCommentNotice();
    return;
  }

  let lessonSource = `lessons/${lessonId}.json`;
  try {
    const dashboardConfig = await loadDashboardConfig();
    lessonSource = getLessonFetchSource(lessonId, dashboardConfig);
    const lessonRes = await fetch(withCacheBust(lessonSource), { cache: "no-store" });
    if (!lessonRes.ok) throw new Error(`${lessonRes.status}`);
    app.lesson = await lessonRes.json();
    applyLessonMetadata(lessonId, dashboardConfig);
    trackCurrentPage({ lessonId, title: app.lesson.title });

    await loadExternalAssets();
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding:3rem;font-family:sans-serif;">
        <h1>수업 자료를 불러오지 못했습니다</h1>
        <p>파일: <code>${escapeHtml(lessonSource)}</code></p>
        <p>오류: ${err.message}</p>
      </div>`;
    return;
  }

  if (app.lesson.kind === "guide-gallery") {
    const { renderGuideGallery } = await import("./ui/guide-gallery.js");
    renderGuideGallery();
    return;
  }

  const { startLesson } = await import("./ui/lesson.js");
  startLesson();
}

function applyLessonMetadata(lessonId, config) {
  const meta = findLessonMetadata(lessonId, config);
  app.lesson = {
    ...app.lesson,
    id: lessonId,
    title: meta?.lesson?.title || app.lesson.title || lessonId,
    subtitle: app.lesson.subtitle || "",
    lessonGroup: meta?.group?.title || app.lesson.lessonGroup || "",
    prev: meta?.prev ? getLessonTargetId(meta.prev) : app.lesson.prev || "",
    next: meta?.next ? getLessonTargetId(meta.next) : app.lesson.next || "",
  };
}

function getLessonFetchSource(lessonId, config) {
  const meta = findLessonMetadata(lessonId, config);
  const sourceUrl = meta?.lesson?.sourceUrl || "";
  if (sourceUrl) return sourceUrl;
  const legacyJsonPath = meta?.lesson?.jsonPath || "";
  if (isJsonLessonUrl(legacyJsonPath)) return legacyJsonPath;
  return `lessons/${encodeURIComponent(lessonId)}.json`;
}

function withCacheBust(url) {
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

function findLessonMetadata(lessonId, config) {
  const groups = Array.isArray(config?.groups) ? config.groups : [];
  for (const group of groups) {
    const lessons = Array.isArray(group.lessons) ? group.lessons : [];
    const index = lessons.findIndex(lesson => getLessonTargetId(lesson) === lessonId);
    if (index >= 0) {
      return {
        group,
        lesson: lessons[index],
        prev: lessons[index - 1] || null,
        next: lessons[index + 1] || null,
      };
    }
  }
  return null;
}

function getLessonTargetId(lesson) {
  if (lesson.link) {
    const match = String(lesson.link).match(/[?&]lesson=([^&#]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  if (lesson.jsonPath) {
    const match = String(lesson.jsonPath).match(/(?:^|\/)([^/]+)\.json$/i);
    if (match) return match[1];
  }
  return lesson.id || "";
}

// 시작
init();
