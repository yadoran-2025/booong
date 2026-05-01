import { formatInline } from "../../utils.js";
export function hasFlowAnswer(flow) {
  return Array.isArray(flow) && flow.some(item => item?.type === "answer");
}

export function hasFlowComment(flow) {
  return Array.isArray(flow) && flow.some(item => item?.type === "comment");
}

export function buildTextElement(tag, className, html, alreadyFormatted = true) {
  const el = document.createElement(tag);
  el.className = className;
  if (alreadyFormatted) el.innerHTML = html;
  else el.textContent = html;
  return el;
}

export function appendAsides(parent, asides) {
  const items = asArray(asides).map(item => String(item || "").trim()).filter(Boolean);
  if (!items.length) return;
  const wrap = document.createElement("div");
  wrap.className = "soft-asides";
  wrap.innerHTML = items.map(item => `<div class="soft-aside">${formatInline(item)}</div>`).join("");
  parent.appendChild(wrap);
}

export function renderAsideHtml(asides, className = "soft-aside") {
  return asArray(asides)
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .map(item => `<div class="${className}">${formatInline(item)}</div>`)
    .join("");
}

/* ── 레이아웃 ── */

/**
 * figure — 이미지(왼쪽) + 텍스트(오른쪽) 좌우 배치
 *
 * title 있음 → 오른쪽이 concept 박스 스타일  (구 figure-concept)
 * title 없음 → 오른쪽이 인용문 스타일         (구 figure-quote)
 *
 * 필드: image, caption?, title?, body, note?
 */

export function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

export function normalizeLayout(layout) {
  if (layout === "row" || layout === "grid") return "row";
  if (layout === "figure") return "figure";
  return "stack";
}
