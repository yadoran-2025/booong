import { formatInline } from "../../utils.js";
import { buildObjectGroup } from "./callouts.js";
import { buildAnswer } from "./quiz.js";
import { appendAsides } from "./shared.js";
export function renderParagraph(block) {
  const wrap = document.createElement("div");
  wrap.className = "block paragraph";
  if (block.text) {
    const p = document.createElement("p");
    p.innerHTML = formatInline(block.text);
    wrap.appendChild(p);
  }
  appendAsides(wrap, block.asides);
  return wrap;
}

export function renderHeading(block) {
  const h = document.createElement("h2");
  h.className = "block section-sub-heading";
  h.innerHTML = formatInline(block.text || "");
  return h;
}

export function renderSubsection(block) {
  const h = document.createElement("h3");
  h.className = "block section-sub-section";
  h.innerHTML = formatInline(block.text || "");
  return h;
}

export function renderQuote(block) {
  const div = document.createElement("blockquote");
  div.className = "block quote-block";
  div.innerHTML = formatInline(block.body || block.text || "");
  appendAsides(div, block.asides);
  return div;
}

export function renderTextBox(block) {
  const div = document.createElement("div");
  div.className = "block text-cutout";
  const body = document.createElement("div");
  body.className = "text-cutout__body";
  body.innerHTML = formatInline(block.body || block.text || "");
  div.appendChild(body);
  return div;
}

export function renderGroup(block) {
  return buildObjectGroup(block.items || [], block.layout || "row", "block");
}

export function renderToggle(block) {
  const div = document.createElement("div");
  div.className = "block toggle-block";
  div.appendChild(buildAnswer(block.body || block.text || block.answer || "", block.label || "내용 보기"));
  return div;
}

export function renderDivider() {
  const hr = document.createElement("hr");
  hr.className = "block divider";
  return hr;
}

export function renderBlockSeparator() {
  const hr = document.createElement("hr");
  hr.className = "block-separator";
  return hr;
}

/* ── 콜아웃 (사례·개념·news 통합 렌더러) ── */

/**
 * [P1] 통합 콜아웃 렌더러
 * style: "case" | "concept" | "news"
 * 필드: title(=label), body(=text), footer(=sub/source)
 */
