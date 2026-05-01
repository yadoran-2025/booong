import { escapeHtml } from "../utils.js";
import { state, root } from "./state.js";
import { escapeAttr, formatLessonOption, renderPreviewUnit, slugify } from "./preview.js";

export function render() {
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

export function renderLessonPicker() {
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

export function renderSelectedLessonSummary(lesson) {
  if (!lesson) return `<span>선택한 lesson의 전체화면 단위를 가져와 활동지 재료로 고릅니다.</span>`;
  const parts = [lesson.school, lesson.subject, lesson.groupTitle].filter(Boolean);
  return `
    <strong>${escapeHtml(lesson.title)}</strong>
    <span>${escapeHtml(parts.join(" · ") || lesson.id)}</span>
  `;
}

export function renderEditorPanel() {
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

export function renderUnitSelector() {
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

export function renderUnitOption(unit) {
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

export function renderPreview() {
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

export function renderPreviewEmpty() {
  return `
    <section class="worksheet-page__block">
      <h2>선택한 단위가 없습니다</h2>
      <p>왼쪽 전체화면 단위 목록에서 활동지에 넣을 항목을 선택하세요.</p>
    </section>
  `;
}

export function renderUnitCount() {
  const count = document.getElementById("worksheet-unit-count");
  if (count) count.textContent = `${state.selectedUnitIds.size}/${state.fullscreenUnits.length}개 선택`;
}

export function renderModeTab(mode, label) {
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

export function renderStatus(message) {
  const status = document.getElementById("worksheet-status");
  if (!status) return;
  status.textContent = message;
}
