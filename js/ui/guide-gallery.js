import { app } from "../state.js";
import { renderBlock } from "./blocks/index.js";
import { escapeHtml } from "../utils.js";

const LEVEL_LABELS = {
  block: "BLOCK",
  object: "OBJECT",
  text: "TEXT",
};

export function renderGuideGallery() {
  const sections = Array.isArray(app.lesson.guideSections) ? app.lesson.guideSections : [];
  app.lesson.sections = sections.map(section => ({
    id: section.id,
    title: section.title,
    blocks: [],
  }));
  app.currentIdx = 0;

  document.body.innerHTML = "";
  document.body.style.cssText = "";
  document.title = app.lesson.title || "BNG LANG 설명서";

  const page = document.createElement("div");
  page.className = "guide-gallery";
  page.appendChild(renderHero(sections));
  page.appendChild(renderTabs(sections));

  const main = document.createElement("main");
  main.className = "guide-gallery__main";
  sections.forEach((section, sectionIdx) => {
    main.appendChild(renderSection(section, sectionIdx));
  });
  page.appendChild(main);
  document.body.appendChild(page);
  bindCopyButtons(page);
}

function renderHero(sections) {
  const header = document.createElement("header");
  header.className = "guide-hero";
  header.innerHTML = `
    <a class="guide-hero__back" href="index.html" aria-label="대시보드로 이동">←</a>
    <div class="guide-hero__copy">
      <div class="guide-hero__eyebrow">BNG LANG(붕랭) 문법</div>
      <h1>${escapeHtml(app.lesson.title || "BNG LANG 설명서")}</h1>
      <p>${escapeHtml(app.lesson.subtitle || "블록, 객체, 텍스트문법을 예시와 함께 확인합니다.")}</p>
    </div>
    <div class="guide-hero__stats" aria-label="가이드 요약">
      ${sections.map(section => `
        <a class="guide-hero__stat" href="#${escapeHtml(section.id)}">
          <strong>${section.items?.length || 0}</strong>
          <span>${escapeHtml(section.title)}</span>
        </a>
      `).join("")}
    </div>
  `;
  return header;
}

function renderTabs(sections) {
  const nav = document.createElement("nav");
  nav.className = "guide-level-tabs";
  nav.setAttribute("aria-label", "BNG LANG 설명서 섹션");
  sections.forEach(section => {
    const a = document.createElement("a");
    a.href = `#${section.id}`;
    a.textContent = section.title;
    nav.appendChild(a);
  });
  return nav;
}

function renderSection(section, sectionIdx) {
  const wrap = document.createElement("section");
  wrap.className = "guide-section";
  wrap.id = section.id;
  wrap.innerHTML = `
    <div class="guide-section__head">
      <span class="guide-section__index">${String(sectionIdx + 1).padStart(2, "0")}</span>
      <div>
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.intro || "")}</p>
      </div>
    </div>
  `;

  const grid = document.createElement("div");
  grid.className = "guide-card-list";
  (section.items || []).forEach((item, itemIdx) => {
    grid.appendChild(renderGuideCard(item, itemIdx));
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderGuideCard(item, itemIdx) {
  const card = document.createElement("article");
  card.className = `guide-card guide-card--${item.level || "block"}`;

  const head = document.createElement("div");
  head.className = "guide-card__head";
  head.innerHTML = `
    <span class="guide-card__badge">${escapeHtml(LEVEL_LABELS[item.level] || "GUIDE")}</span>
    <div>
      <h3>${escapeHtml(item.label || `항목 ${itemIdx + 1}`)}</h3>
      <p>${escapeHtml(item.purpose || "")}</p>
    </div>
  `;
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "guide-card__body";
  body.appendChild(renderPreview(item.previewBlock));
  body.appendChild(renderSyntax(item.syntax || ""));
  card.appendChild(body);

  if (Array.isArray(item.notes) && item.notes.length) {
    const notes = document.createElement("ul");
    notes.className = "guide-card__notes";
    item.notes.forEach(note => {
      const li = document.createElement("li");
      li.textContent = note;
      notes.appendChild(li);
    });
    card.appendChild(notes);
  }

  return card;
}

function renderPreview(previewBlock) {
  const preview = document.createElement("div");
  preview.className = "guide-preview";
  const title = document.createElement("div");
  title.className = "guide-panel-title";
  title.textContent = "화면 예시";
  preview.appendChild(title);

  const stage = document.createElement("div");
  stage.className = "guide-preview__stage";
  try {
    const block = structuredClone(previewBlock || { type: "단락", text: "예시가 없습니다." });
    const rendered = renderBlock(block, 0);
    if (rendered) stage.appendChild(rendered);
  } catch (err) {
    const error = document.createElement("p");
    error.className = "guide-preview__error";
    error.textContent = `미리보기 오류: ${err.message}`;
    stage.appendChild(error);
  }
  preview.appendChild(stage);
  return preview;
}

function renderSyntax(syntax) {
  const panel = document.createElement("div");
  panel.className = "guide-code";

  const top = document.createElement("div");
  top.className = "guide-code__top";
  const title = document.createElement("div");
  title.className = "guide-panel-title";
  title.textContent = "구체 문법";
  const button = document.createElement("button");
  button.className = "guide-copy";
  button.type = "button";
  button.textContent = "문법 복사";
  button.dataset.copySyntax = syntax;
  top.appendChild(title);
  top.appendChild(button);

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = syntax;
  pre.appendChild(code);

  panel.appendChild(top);
  panel.appendChild(pre);
  return panel;
}

function bindCopyButtons(root) {
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-copy-syntax]");
    if (!button) return;
    copyText(button.dataset.copySyntax || "")
      .then(() => {
        button.textContent = "복사됨";
        window.setTimeout(() => { button.textContent = "문법 복사"; }, 1200);
      })
      .catch(() => {
        button.textContent = "복사 실패";
        window.setTimeout(() => { button.textContent = "문법 복사"; }, 1200);
      });
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (_) {
      // Fall through to the textarea path for local HTTP or embedded browsers.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy command was rejected.");
}
