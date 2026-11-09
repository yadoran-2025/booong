import { app } from "../state.js";
import { escapeHtml } from "../utils.js";
import { buildAppShell, renderSidebar, renderNavFooter, bindKeyboard, toggleFirstVisibleAnswer } from "./layout.js";
import { attachFocusAffordance, closeImageLightbox, closeFocusOverlay, closeBlockFullscreen, navigateBlockFullscreen, setBlockFullscreenSectionNavigator, expandNextFullscreenToggle, scrollBlockFullscreen } from "./components.js";
import { renderBlock, renderBlockSeparator } from "./blocks/index.js";

/* ====================================================================
   수업 시작 및 섹션 이동
   ==================================================================== */
export function startLesson() {
  document.body.innerHTML = "";
  document.body.style.cssText = "";

  buildAppShell();
  renderSidebar(goTo);
  renderNavFooter(goTo);
  setBlockFullscreenSectionNavigator(navigateFullscreenSection);

  const hash = location.hash.replace("#", "");
  const idx = app.lesson.sections.findIndex(s => s.id === hash);
  goTo(idx >= 0 ? idx : 0);

  bindKeyboard({
    goToIdx: goTo,
    toggleFirstVisibleAnswer,
    closeImageLightbox,
    closeFocusOverlay,
    closeBlockFullscreen,
    navigateBlockFullscreen,
    expandNextFullscreenToggle,
    scrollBlockFullscreen
  });

  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    const i = app.lesson.sections.findIndex(s => s.id === h);
    if (i >= 0 && i !== app.currentIdx) goTo(i);
  });

  document.title = `${app.lesson.title} — ${app.lesson.lessonGroup || "수업 자료"}`;
}

function goTo(idx) {
  if (idx < 0 || idx >= app.lesson.sections.length) return;
  app.currentIdx = idx;
  const sec = app.lesson.sections[idx];

  document.querySelectorAll(".sidebar__section").forEach(el => {
    el.classList.toggle("is-active", Number(el.dataset.idx) === idx);
  });
  renderSection(sec);
  renderNavFooter(goTo);
  history.replaceState(null, "", `#${sec.id}`);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderSection(sec) {
  const main = document.getElementById("main-content");
  if (!main) return;
  main.innerHTML = "";

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
    <div class="section-header__id">${escapeHtml(sec.id)} · ${escapeHtml(app.lesson.title)}</div>
    <h1 class="section-header__title">${escapeHtml(sec.title)}</h1>
  `;
  attachFocusAffordance(header);
  main.appendChild(header);

  let previousBlockType = null;
  sec.blocks.forEach((block, idx) => {
    const el = renderBlock(block, idx);
    if (el) {
      if (previousBlockType && previousBlockType !== "구분선" && block.type !== "구분선") {
        main.appendChild(renderBlockSeparator());
      }
      main.appendChild(el);
      previousBlockType = block.type;
    }
  });
}

function navigateFullscreenSection(direction, options = {}) {
  const nextIdx = app.currentIdx + direction;
  if (nextIdx < 0 || nextIdx >= app.lesson.sections.length) return false;
  if (!options.dryRun) goTo(nextIdx);
  return true;
}
