import { escapeHtml } from "../utils.js";
import { state } from "./state.js";
import { getRow } from "./assets.js";
import { escapeAttr, renderStatus } from "./render.js";

export function renderPreviewOverlay() {
  const mount = document.getElementById("asset-preview-root");
  if (!mount) return;
  const preview = state.preview;
  if (!preview) {
    mount.innerHTML = "";
    return;
  }
  mount.innerHTML = preview.type === "text" ? `
    <div class="asset-preview" role="dialog" aria-modal="true" aria-label="${escapeAttr(preview.title)}">
      <button class="asset-preview__backdrop" type="button" data-action="close-preview" aria-label="미리보기 닫기"></button>
      <article class="asset-preview__frame asset-preview__frame--text">
        <button class="asset-preview__close" type="button" data-action="close-preview">닫기</button>
        <span class="asset-preview__eyebrow">텍스트 자료</span>
        <h2>${escapeHtml(preview.title)}</h2>
        <div class="asset-preview__text-body">${escapeHtml(preview.body || "본문이 없습니다.")}</div>
        ${preview.source ? `<p class="asset-preview__source">${escapeHtml(preview.source)}</p>` : ""}
        ${preview.key ? `<code class="asset-preview__key">${escapeHtml(preview.key)}</code>` : ""}
      </article>
    </div>
  ` : preview.src ? `
    <div class="asset-preview" role="dialog" aria-modal="true" aria-label="${escapeAttr(preview.title)}">
      <button class="asset-preview__backdrop" type="button" data-action="close-preview" aria-label="미리보기 닫기"></button>
      <figure class="asset-preview__frame">
        <button class="asset-preview__close" type="button" data-action="close-preview">닫기</button>
        <img src="${escapeAttr(preview.src)}" alt="${escapeAttr(preview.title)}">
        <figcaption>${escapeHtml(preview.title)}</figcaption>
      </figure>
    </div>
  ` : "";
}

export function closePreview() {
  state.preview = null;
  renderPreviewOverlay();
}
