import { app } from "../state.js";
import { renderBlock } from "../ui/blocks/index.js";
import { escapeHtml } from "../utils.js";

export function renderPreviewUnit(unit) {
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

export function getBlockTitle(block, blockIndex) {
  if (block.title) return stripHtml(block.title);
  if (block.type === "발문") return firstPrompt(block) || `발문 ${blockIndex + 1}`;
  if (block.type === "미디어") return `미디어 ${countItems(block.items)}개`;
  if (block.type === "기출문제") return `기출문제 ${countItems(block.items)}개`;
  if (block.text) return truncate(stripHtml(block.text), 36);
  if (block.body) return truncate(stripHtml(block.body), 36);
  return `${block.type || "블록"} ${blockIndex + 1}`;
}

export function getBlockSummary(block) {
  if (!block) return "";
  if (block.type === "발문") return truncate((block.prompts || []).map(prompt => stripHtml(prompt.q || "")).join(" / "), 84);
  if (block.type === "미디어") return truncate((block.items || []).map(describeMaterial).join(" / "), 84);
  if (block.type === "기출문제") return `${countItems(block.items)}개 문항`;
  if (Array.isArray(block.bullets)) return truncate(block.bullets.join(" / "), 84);
  return truncate(stripHtml(block.body || block.text || block.footer || ""), 84);
}

export function firstPrompt(block) {
  const prompt = Array.isArray(block.prompts) ? block.prompts[0] : null;
  return prompt ? truncate(stripHtml(prompt.q || prompt.body || ""), 36) : "";
}

export function describeMaterial(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return item.title || item.caption || item.ref || item.body || item.source || item.image || item.kind || "자료";
}

export function formatLessonOption(lesson) {
  return [lesson.label, lesson.groupTitle, lesson.title].filter(Boolean).join(" · ");
}

export function countItems(items) {
  return Array.isArray(items) ? items.length : 0;
}

export function truncate(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

export function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function slugify(value) {
  return String(value || "block").replace(/[^a-zA-Z0-9가-힣_-]+/g, "-");
}

export function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
