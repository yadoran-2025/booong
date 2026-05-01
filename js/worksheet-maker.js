import { loadExternalAssets } from "./api.js";
import { app } from "./state.js";
import { renderBlock } from "./ui/blocks.js";
import { escapeHtml } from "./utils.js";

const root = document.getElementById("worksheet-maker-root");

const FULLSCREEN_TYPES = new Set([
  "단락",
  "소제목",
  "절",
  "인용",
  "텍스트박스",
  "사례",
  "발문",
  "개념",
  "이미지곁",
  "미디어",
  "기출문제",
]);

const state = {
  mode: "basic",
  lessons: [],
  selectedLessonId: "",
  selectedLesson: null,
  fullscreenUnits: [],
  selectedUnitIds: new Set(),
  lessonsLoading: true,
  lessonLoading: false,
  lessonsError: "",
  lessonError: "",
  title: "새 활동지",
  lesson: "",
  subject: "",
  paper: "A4",
};

init();

async function init() {
  render();
  bindEvents();
  await loadLessons();
}

function bindEvents() {
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "set-mode") {
      state.mode = button.dataset.mode || "basic";
      render();
    } else if (button.dataset.action === "select-all-units") {
      state.selectedUnitIds = new Set(state.fullscreenUnits.map(unit => unit.id));
      render();
      renderStatus(`${state.selectedUnitIds.size}개 단위를 선택했습니다.`);
    } else if (button.dataset.action === "clear-units") {
      state.selectedUnitIds.clear();
      render();
      renderStatus("선택한 단위를 모두 해제했습니다.");
    }
  });

  root.addEventListener("input", event => {
    updateField(event.target);
  });

  root.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "worksheet-lesson-select") {
      selectLesson(target.value);
      return;
    }

    if (target.matches("[data-unit-check]")) {
      toggleUnit(target.value, target.checked);
      return;
    }

    updateField(target);
  });
}

async function loadLessons() {
  state.lessonsLoading = true;
  state.lessonsError = "";
  renderLessonPicker();

  try {
    const res = await fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`lessons/index.json ${res.status}`);
    const config = await res.json();
    state.lessons = flattenLessons(config.groups || []);
    state.lessonsLoading = false;
    renderLessonPicker();
    renderStatus(`${state.lessons.length}개 lesson을 불러왔습니다.`);
  } catch (err) {
    state.lessons = [];
    state.lessonsLoading = false;
    state.lessonsError = err.message;
    renderLessonPicker();
    renderStatus("lesson 목록을 불러오지 못했습니다.");
  }
}

function flattenLessons(groups) {
  return groups.flatMap(group => {
    const lessons = Array.isArray(group.lessons) ? group.lessons : [];
    return lessons.map(lesson => ({
      id: lesson.id || "",
      label: lesson.label || "",
      title: stripHtml(lesson.title || "이름 없는 lesson"),
      desc: stripHtml(lesson.desc || ""),
      groupTitle: stripHtml(group.title || ""),
      subject: stripHtml(group.subject || ""),
      school: stripHtml(group.school || ""),
    })).filter(lesson => lesson.id);
  });
}

async function selectLesson(lessonId) {
  state.selectedLessonId = lessonId;
  state.selectedLesson = null;
  state.fullscreenUnits = [];
  state.selectedUnitIds.clear();
  state.lessonError = "";

  const selected = state.lessons.find(lesson => lesson.id === lessonId);
  if (!selected) {
    render();
    renderStatus("lesson 선택을 해제했습니다.");
    return;
  }

  state.title = selected.title;
  state.lesson = selected.groupTitle || selected.id;
  state.subject = selected.subject;
  state.lessonLoading = true;
  render();
  renderStatus(`${selected.label || selected.id} 데이터를 불러오는 중입니다.`);

  try {
    const res = await fetch(`lessons/${encodeURIComponent(selected.id)}.json?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${selected.id}.json ${res.status}`);
    state.selectedLesson = await res.json();
    app.lesson = state.selectedLesson;
    app.currentIdx = 0;
    await loadExternalAssets();
    state.fullscreenUnits = buildFullscreenUnits(state.selectedLesson);
    state.selectedUnitIds = new Set(state.fullscreenUnits.map(unit => unit.id));
    state.lessonLoading = false;
    render();
    renderStatus(`${state.fullscreenUnits.length}개 전체화면 단위를 불러왔습니다.`);
  } catch (err) {
    state.lessonLoading = false;
    state.lessonError = err.message;
    render();
    renderStatus("lesson 데이터를 불러오지 못했습니다.");
  }
}

function buildFullscreenUnits(lesson) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  return sections.flatMap((section, sectionIndex) => {
    const sectionId = section.id || `${sectionIndex + 1}`;
    const sectionTitle = stripHtml(section.title || `섹션 ${sectionIndex + 1}`);
    const headerUnit = {
      id: `${sectionId}:header`,
      kind: "section",
      type: "섹션",
      sectionId,
      sectionTitle,
      sectionIndex,
      title: sectionTitle,
      summary: stripHtml(lesson.title || ""),
    };

    const blockUnits = (section.blocks || [])
      .map((block, blockIndex) => ({ block, blockIndex }))
      .filter(({ block }) => FULLSCREEN_TYPES.has(block.type))
      .map(({ block, blockIndex }) => ({
        id: `${sectionId}:block:${blockIndex}`,
        kind: "block",
        type: block.type,
        sectionId,
        sectionTitle,
        sectionIndex,
        block,
        blockIndex,
        title: getBlockTitle(block, blockIndex),
        summary: getBlockSummary(block),
      }));

    return [headerUnit, ...blockUnits];
  });
}

function toggleUnit(unitId, checked) {
  if (checked) state.selectedUnitIds.add(unitId);
  else state.selectedUnitIds.delete(unitId);
  renderPreview();
  renderUnitCount();
}

function updateField(target) {
  const field = target.dataset.field;
  if (!field || !(field in state)) return;
  state[field] = target.value;
  renderPreview();
  renderStatus("미리보기를 갱신했습니다.");
}

function render() {
  root.innerHTML = `
    <main class="worksheet-maker">
      <div class="worksheet-maker__inner">
        <div class="worksheet-maker__topbar">
          <a class="worksheet-maker__back" href="index.html">대시보드로 돌아가기</a>
          <div class="worksheet-maker__status" id="worksheet-status" aria-live="polite"></div>
        </div>

        <section class="worksheet-maker__hero">
          <h1 class="worksheet-maker__title">활동지 메이커</h1>
          <p class="worksheet-maker__intro">수업 흐름, 자료, 질문을 한곳에서 조립해 바로 출력 가능한 활동지로 다듬는 도구 자리입니다.</p>
        </section>

        <section id="worksheet-lesson-picker-root"></section>

        <section class="worksheet-maker__toolbar" aria-label="활동지 도구">
          <div class="worksheet-maker__tabs" role="tablist" aria-label="작성 모드">
            ${renderModeTab("basic", "기본")}
            ${renderModeTab("materials", "자료")}
            ${renderModeTab("print", "출력")}
          </div>
          <div class="worksheet-maker__actions">
            <button class="worksheet-maker__button" type="button" disabled>불러오기</button>
            <button class="worksheet-maker__button worksheet-maker__button--primary" type="button" disabled>내보내기</button>
          </div>
        </section>

        <section class="worksheet-maker__workspace">
          ${renderEditorPanel()}
          <section class="worksheet-maker__preview" aria-label="활동지 미리보기">
            <div id="worksheet-preview"></div>
          </section>
        </section>
      </div>
    </main>
  `;

  renderLessonPicker();
  renderPreview();
}

function renderLessonPicker() {
  const picker = document.getElementById("worksheet-lesson-picker-root");
  if (!picker) return;

  const selected = state.lessons.find(lesson => lesson.id === state.selectedLessonId);
  picker.innerHTML = `
    <section class="worksheet-lesson-picker" aria-label="lesson 선택">
      <label class="worksheet-lesson-picker__field" for="worksheet-lesson-select">
        <span class="worksheet-lesson-picker__label">lesson 목록</span>
        <select id="worksheet-lesson-select" class="worksheet-lesson-picker__select" ${state.lessonsLoading ? "disabled" : ""}>
          <option value="">${state.lessonsLoading ? "lesson을 불러오는 중..." : "lesson을 선택하세요"}</option>
          ${state.lessons.map(lesson => `
            <option value="${escapeAttr(lesson.id)}" ${state.selectedLessonId === lesson.id ? "selected" : ""}>
              ${escapeHtml(formatLessonOption(lesson))}
            </option>
          `).join("")}
        </select>
      </label>
      <div class="worksheet-lesson-picker__summary">
        ${state.lessonsError ? `<span class="worksheet-lesson-picker__error">목록 로드 실패: ${escapeHtml(state.lessonsError)}</span>` : renderSelectedLessonSummary(selected)}
      </div>
    </section>
  `;
}

function renderSelectedLessonSummary(lesson) {
  if (!lesson) return `<span>선택한 lesson의 전체화면 단위를 가져와 활동지 재료로 고릅니다.</span>`;
  const parts = [lesson.school, lesson.subject, lesson.groupTitle].filter(Boolean);
  return `
    <strong>${escapeHtml(lesson.title)}</strong>
    <span>${escapeHtml(parts.join(" · ") || lesson.id)}</span>
  `;
}

function renderEditorPanel() {
  return `
    <aside class="worksheet-maker__panel" aria-label="활동지 설정">
      <label class="worksheet-maker__field">
        <span class="worksheet-maker__label">활동지 제목</span>
        <input class="worksheet-maker__input" type="text" value="${escapeAttr(state.title)}" data-field="title">
      </label>

      <div class="worksheet-maker__field-row">
        <label class="worksheet-maker__field">
          <span class="worksheet-maker__label">수업</span>
          <input class="worksheet-maker__input" type="text" value="${escapeAttr(state.lesson)}" data-field="lesson" placeholder="예: 차별금지">
        </label>
        <label class="worksheet-maker__field">
          <span class="worksheet-maker__label">과목</span>
          <input class="worksheet-maker__input" type="text" value="${escapeAttr(state.subject)}" data-field="subject" placeholder="예: 법과 사회">
        </label>
      </div>

      <label class="worksheet-maker__field">
        <span class="worksheet-maker__label">용지</span>
        <select class="worksheet-maker__select" data-field="paper">
          ${["A4", "B4", "Letter"].map(paper => `<option value="${paper}" ${state.paper === paper ? "selected" : ""}>${paper}</option>`).join("")}
        </select>
      </label>

      ${renderUnitSelector()}
    </aside>
  `;
}

function renderUnitSelector() {
  if (state.lessonLoading) {
    return `<section class="worksheet-units"><p class="worksheet-units__empty">전체화면 단위를 불러오는 중입니다.</p></section>`;
  }

  if (state.lessonError) {
    return `<section class="worksheet-units"><p class="worksheet-units__error">lesson 로드 실패: ${escapeHtml(state.lessonError)}</p></section>`;
  }

  if (!state.selectedLessonId) {
    return `<section class="worksheet-units"><p class="worksheet-units__empty">먼저 lesson을 선택하세요.</p></section>`;
  }

  if (!state.fullscreenUnits.length) {
    return `<section class="worksheet-units"><p class="worksheet-units__empty">이 lesson에는 선택할 전체화면 단위가 없습니다.</p></section>`;
  }

  return `
    <section class="worksheet-units" aria-label="전체화면 단위 선택">
      <div class="worksheet-units__head">
        <div>
          <h2>전체화면 단위</h2>
          <p id="worksheet-unit-count">${state.selectedUnitIds.size}/${state.fullscreenUnits.length}개 선택</p>
        </div>
        <div class="worksheet-units__actions">
          <button class="worksheet-maker__button" type="button" data-action="select-all-units">전체</button>
          <button class="worksheet-maker__button" type="button" data-action="clear-units">해제</button>
        </div>
      </div>
      <div class="worksheet-units__list">
        ${state.fullscreenUnits.map(renderUnitOption).join("")}
      </div>
    </section>
  `;
}

function renderUnitOption(unit) {
  return `
    <label class="worksheet-unit ${state.selectedUnitIds.has(unit.id) ? "is-selected" : ""}">
      <input type="checkbox" value="${escapeAttr(unit.id)}" data-unit-check ${state.selectedUnitIds.has(unit.id) ? "checked" : ""}>
      <span class="worksheet-unit__body">
        <span class="worksheet-unit__meta">${escapeHtml(unit.sectionId)} · ${escapeHtml(unit.type)}</span>
        <strong>${escapeHtml(unit.title)}</strong>
        ${unit.summary ? `<span>${escapeHtml(unit.summary)}</span>` : ""}
      </span>
    </label>
  `;
}

function renderPreview() {
  const preview = document.getElementById("worksheet-preview");
  if (!preview) return;

  const selectedUnits = state.fullscreenUnits.filter(unit => state.selectedUnitIds.has(unit.id));
  preview.innerHTML = `
    <article class="worksheet-page">
      <header class="worksheet-page__head">
        <span class="worksheet-page__kicker">${escapeHtml(state.paper)} WORKSHEET</span>
        <h1 class="worksheet-page__title">${escapeHtml(state.title || "새 활동지")}</h1>
        <div class="worksheet-page__meta">
          <span>수업 ${escapeHtml(state.lesson || "")}</span>
          <span>과목 ${escapeHtml(state.subject || "")}</span>
          <span>이름</span>
        </div>
      </header>
      <div class="worksheet-page__body" id="worksheet-preview-body"></div>
    </article>
  `;

  const body = document.getElementById("worksheet-preview-body");
  if (!body) return;

  if (!selectedUnits.length) {
    body.innerHTML = renderPreviewEmpty();
    return;
  }

  selectedUnits.forEach(unit => {
    body.appendChild(renderPreviewUnit(unit));
  });
}

function renderPreviewUnit(unit) {
  if (unit.kind === "section") {
    const section = document.createElement("section");
    section.className = "worksheet-page__section-title";
    section.innerHTML = `
      <span>${escapeHtml(unit.sectionId)}</span>
      <h2>${escapeHtml(unit.title)}</h2>
    `;
    return section;
  }

  const wrap = document.createElement("section");
  wrap.className = `worksheet-page__block worksheet-page__block--rendered worksheet-page__block--${slugify(unit.type)}`;
  wrap.innerHTML = `<div class="worksheet-page__block-meta">${escapeHtml(unit.sectionId)} · ${escapeHtml(unit.type)}</div>`;

  const previousIdx = app.currentIdx;
  app.currentIdx = unit.sectionIndex || 0;
  const rendered = renderBlock(unit.block, unit.blockIndex);
  app.currentIdx = previousIdx;

  if (rendered) {
    rendered.classList.remove("block--focusable");
    rendered.querySelectorAll(".focus-btn").forEach(button => button.remove());
    wrap.appendChild(rendered);
  } else {
    const fallback = document.createElement("pre");
    fallback.className = "worksheet-page__raw-json";
    fallback.textContent = JSON.stringify(unit.block, null, 2);
    wrap.appendChild(fallback);
  }

  return wrap;
}

function renderPreviewEmpty() {
  return `
    <section class="worksheet-page__block">
      <h2>선택한 단위가 없습니다</h2>
      <p>왼쪽 전체화면 단위 목록에서 활동지에 넣을 항목을 선택하세요.</p>
    </section>
  `;
}

function getBlockTitle(block, blockIndex) {
  if (block.title) return stripHtml(block.title);
  if (block.type === "발문") return firstPrompt(block) || `발문 ${blockIndex + 1}`;
  if (block.type === "미디어") return `미디어 ${countItems(block.items)}개`;
  if (block.type === "기출문제") return `기출문제 ${countItems(block.items)}개`;
  if (block.text) return truncate(stripHtml(block.text), 36);
  if (block.body) return truncate(stripHtml(block.body), 36);
  return `${block.type || "블록"} ${blockIndex + 1}`;
}

function getBlockSummary(block) {
  if (!block) return "";
  if (block.type === "발문") return truncate((block.prompts || []).map(prompt => stripHtml(prompt.q || "")).join(" / "), 84);
  if (block.type === "미디어") return truncate((block.items || []).map(describeMaterial).join(" / "), 84);
  if (block.type === "기출문제") return `${countItems(block.items)}개 문항`;
  if (Array.isArray(block.bullets)) return truncate(block.bullets.join(" / "), 84);
  return truncate(stripHtml(block.body || block.text || block.footer || ""), 84);
}

function firstPrompt(block) {
  const prompt = Array.isArray(block.prompts) ? block.prompts[0] : null;
  return prompt ? truncate(stripHtml(prompt.q || prompt.body || ""), 36) : "";
}

function describeMaterial(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return item.title || item.caption || item.ref || item.body || item.source || item.image || item.kind || "자료";
}

function renderUnitCount() {
  const count = document.getElementById("worksheet-unit-count");
  if (count) count.textContent = `${state.selectedUnitIds.size}/${state.fullscreenUnits.length}개 선택`;
}

function renderModeTab(mode, label) {
  return `
    <button
      class="worksheet-maker__tab ${state.mode === mode ? "is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${state.mode === mode ? "true" : "false"}"
      data-action="set-mode"
      data-mode="${escapeAttr(mode)}"
    >${escapeHtml(label)}</button>
  `;
}

function formatLessonOption(lesson) {
  return [lesson.label, lesson.groupTitle, lesson.title].filter(Boolean).join(" · ");
}

function renderStatus(message) {
  const status = document.getElementById("worksheet-status");
  if (!status) return;
  status.textContent = message;
}

function countItems(items) {
  return Array.isArray(items) ? items.length : 0;
}

function truncate(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value || "block").replace(/[^a-zA-Z0-9가-힣_-]+/g, "-");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
