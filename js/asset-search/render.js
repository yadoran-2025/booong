import { escapeHtml } from "../utils.js";
import { SOURCE_LABELS, state, root } from "./state.js";
import { getAssetColumn, getFilteredRows, getKindLabel, getPreviewImageUrl, getPurposeText } from "./assets.js";
import { renderPreviewOverlay } from "./preview.js";
import { renderUploadPanel } from "./upload.js";

export function render() {
  root.innerHTML = `
    <main class="asset-tool">
      <div class="asset-tool__inner">
        <div class="asset-tool__topbar">
          <a class="asset-tool__back" href="index.html">대시보드로 돌아가기</a>
          <div class="asset-tool__status" id="asset-status" aria-live="polite"></div>
        </div>
        <section class="asset-tool__hero">
          <h1 class="asset-tool__title">수업자료 서치</h1>
          <p class="asset-tool__intro">적재적소에 필요한 이미지/영상/텍스트 자료. 키워드로 찾아보세요. ex) 기회비용, 청구권 검색</p>
        </section>
        ${renderControls()}
        <section id="asset-main" class="asset-tool__main"></section>
      </div>
      <div id="asset-preview-root"></div>
    </main>
  `;
  renderMain();
  renderPreviewOverlay();
}

export function renderControls() {
  const hidden = state.source === "upload" ? "hidden" : "";
  return `
    <section class="asset-tool__controls">
      <input id="asset-query" class="asset-tool__search" type="search" value="${escapeAttr(state.query)}" placeholder="키, 제목, 설명, 키워드, 링크 검색" autocomplete="off" ${hidden}>
      <div class="asset-tool__tabs" aria-label="자료 종류">
        ${Object.entries(SOURCE_LABELS).map(([source, label]) => `
          <button class="asset-tool__tab ${state.source === source ? "is-active" : ""}" type="button" data-action="choose-source" data-source="${escapeAttr(source)}">${escapeHtml(label)}</button>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderMain() {
  const main = document.getElementById("asset-main");
  if (!main) return;
  main.innerHTML = state.source === "upload" ? renderUploadPanel() : `
    <section class="asset-tool__selection">
      <span>${state.selected.size}개 선택됨</span>
      <div class="asset-tool__selection-actions">
        <button class="asset-btn" type="button" data-action="copy-selected-keys" ${state.selected.size ? "" : "disabled"}>선택한 키 복사</button>
        <button class="asset-btn" type="button" data-action="copy-selected-pairs" ${state.selected.size ? "" : "disabled"}>선택한 키+링크 복사</button>
        <button class="asset-btn" type="button" data-action="clear-selection" ${state.selected.size ? "" : "disabled"}>선택 해제</button>
      </div>
    </section>
    <section id="asset-results" class="asset-tool__main"></section>
  `;
  if (state.source !== "upload") renderResults();
}

export function renderResults() {
  const box = document.getElementById("asset-results");
  if (!box) return;
  if (state.loading) {
    box.innerHTML = `<p class="asset-empty">자료 목록을 불러오는 중입니다.</p>`;
    return;
  }
  const rows = getFilteredRows();
  if (!rows.length) {
    box.innerHTML = `<p class="asset-empty">검색 결과가 없습니다.</p>`;
    return;
  }
  box.innerHTML = renderGroupedRows(rows);
}

export function renderGroupedRows(rows) {
  const groups = [
    { id: "image", label: "사진", rows: [] },
    { id: "video", label: "영상", rows: [] },
    { id: "text", label: "텍스트", rows: [] },
  ];
  rows.forEach(row => {
    const target = groups.find(group => group.id === getAssetColumn(row)) || groups[2];
    target.rows.push(row);
  });
  return groups.map(group => `
    <section class="asset-column asset-column--${group.id}">
      <div class="asset-column__head">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.rows.length}개</span>
      </div>
      <div class="asset-column__list">
        ${group.rows.length ? group.rows.map(renderRow).join("") : `<p class="asset-column__empty">해당 자료 없음</p>`}
      </div>
    </section>
  `).join("");
}

export function renderRow(row) {
  const title = row.title || row.headline || row.key;
  const purpose = getPurposeText(row);
  const selected = state.selected.has(row.key);
  return `
    <article class="asset-card ${selected ? "is-selected" : ""}">
      <div class="asset-card__media">
        <span class="asset-card__thumb">${renderThumb(row)}</span>
      </div>
      <div class="asset-card__body">
        <div class="asset-card__head">
          <div class="asset-card__title-wrap">
            <span class="asset-card__kind">${escapeHtml(getKindLabel(row.kind))}</span>
            <h2 class="asset-card__title">${escapeHtml(title)}</h2>
          </div>
          <label class="asset-card__select-check" aria-label="${escapeAttr(title)} 선택">
            <input type="checkbox" data-row-check value="${escapeAttr(row.key)}" ${selected ? "checked" : ""}>
          </label>
        </div>
        <p class="asset-card__purpose"><span>활용</span>${escapeHtml(purpose)}</p>
        <div class="asset-card__actions">
          <button class="asset-btn" type="button" data-action="copy-key" data-key="${escapeAttr(row.key)}">키 복사</button>
          <button class="asset-btn" type="button" data-action="copy-link" data-key="${escapeAttr(row.key)}" ${row.rawLink ? "" : "disabled"}>링크 복사</button>
          ${renderOpenAction(row)}
        </div>
      </div>
    </article>
  `;
}

export function renderOpenAction(row) {
  if (row.kind === "text") {
    return `<button class="asset-btn asset-btn--link" type="button" data-action="open-text-preview" data-key="${escapeAttr(row.key)}">기사 미리보기</button>`;
  }
  return row.rawLink
    ? `<a class="asset-btn asset-btn--link" href="${escapeAttr(row.rawLink)}" target="_blank" rel="noopener">링크 바로가기</a>`
    : "";
}

export function renderThumb(row) {
  if (row.kind === "text") return `<span>텍스트</span>`;
  const src = getPreviewImageUrl(row.url || row.rawLink);
  if (!src) return `<span>자료</span>`;
  const title = row.title || row.headline || row.key || "자료 미리보기";
  return `
    <button class="asset-card__thumb-button" type="button" data-action="open-preview" data-src="${escapeAttr(src)}" data-title="${escapeAttr(title)}" aria-label="${escapeAttr(title)} 크게 보기">
      <img src="${escapeAttr(src)}" alt="" loading="lazy" onerror="this.closest('button').replaceWith(Object.assign(document.createElement('span'), { textContent: '자료' }))">
    </button>
  `;
}

export function renderStatus(message) {
  const el = document.getElementById("asset-status");
  if (el) el.textContent = message || "";
}

export function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
