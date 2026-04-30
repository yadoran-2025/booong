import { ASSET_SHEET_URLS, parseCSV, normalizeAssetColumns } from "./api.js";
import { escapeHtml } from "./utils.js";

const ASSET_UPLOAD_ENDPOINT = "https://script.google.com/macros/s/AKfycbw_DJp0xMarEDwnQnpO0nEcQMhWygsMiBf_HGgnauh_ViU-KLmI1pG8ZI_CdNMNOi8P/exec";

const state = {
  source: "media",
  query: "",
  rows: { media: [], exam: [] },
  selected: new Set(),
  loading: true,
  preview: null,
  upload: {
    file: null,
    dataUrl: "",
    key: "",
    busy: false,
    status: "",
    lastKey: "",
    lastUrl: "",
  },
};

const SOURCE_LABELS = {
  media: "자료 DB",
  exam: "기출문제 DB",
  upload: "새자료 등록",
};

const root = document.getElementById("asset-search-root");

init();

function init() {
  render();
  bindEvents();
  loadRows();
}

function bindEvents() {
  root.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const key = button.dataset.key || "";
    if (action === "choose-source") {
      state.source = button.dataset.source || "media";
      state.selected.clear();
      render();
    } else if (action === "toggle-row") {
      toggleRow(key);
    } else if (action === "copy-key") {
      copyText(key, "JSON KEY를 복사했습니다.");
    } else if (action === "copy-link") {
      copyText(getRow(key)?.rawLink || "", "B열 링크를 복사했습니다.");
    } else if (action === "copy-pair") {
      copyText(formatPair(getRow(key)), "JSON KEY와 B열 링크를 복사했습니다.");
    } else if (action === "copy-selected-keys") {
      copyText(getSelectedRows().map(row => row.key).join("\n"), "선택한 JSON KEY를 복사했습니다.");
    } else if (action === "copy-selected-pairs") {
      copyText(getSelectedRows().map(formatPair).join("\n"), "선택한 키+링크를 복사했습니다.");
    } else if (action === "clear-selection") {
      state.selected.clear();
      render();
    } else if (action === "upload-asset") {
      uploadAsset();
    } else if (action === "clear-upload") {
      clearUpload();
      render();
    } else if (action === "copy-upload-key") {
      copyText(state.upload.lastKey, "업로드한 JSON KEY를 복사했습니다.");
    } else if (action === "copy-upload-link") {
      copyText(state.upload.lastUrl, "업로드한 링크를 복사했습니다.");
    } else if (action === "copy-upload-pair") {
      copyText(`${state.upload.lastKey}\t${state.upload.lastUrl}`, "업로드한 키+링크를 복사했습니다.");
    } else if (action === "open-preview") {
      state.preview = {
        type: "image",
        src: button.dataset.src || "",
        title: button.dataset.title || "자료 미리보기",
      };
      renderPreviewOverlay();
    } else if (action === "open-text-preview") {
      const row = getRow(key);
      if (!row) return renderStatus("미리 볼 텍스트를 찾지 못했습니다.");
      state.preview = {
        type: "text",
        title: row.headline || row.title || row.key || "텍스트 자료",
        body: row.body || row.reason || "",
        source: row.source || "",
        key: row.key || "",
      };
      renderPreviewOverlay();
    } else if (action === "close-preview") {
      state.preview = null;
      renderPreviewOverlay();
    }
  });

  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.preview) {
      state.preview = null;
      renderPreviewOverlay();
    }
  });

  root.addEventListener("input", event => {
    const target = event.target;
    if (target.id === "asset-query") {
      state.query = target.value;
      renderResults();
    } else if (target.dataset.uploadField === "key") {
      state.upload.key = target.value;
    }
  });

  root.addEventListener("change", event => {
    const target = event.target;
    if (target.matches("[data-row-check]")) {
      toggleRow(target.value);
    } else if (target.id === "upload-file") {
      const file = target.files?.[0];
      if (file) prepareUploadFile(file);
    }
  });

  root.addEventListener("paste", event => {
    const zone = event.target.closest(".asset-upload-tool");
    if (!zone) return;
    const file = getClipboardImage(event.clipboardData);
    if (!file) {
      setUploadStatus("클립보드에서 이미지를 찾지 못했습니다.");
      return;
    }
    event.preventDefault();
    prepareUploadFile(file);
  });
}

async function loadRows() {
  state.loading = true;
  renderStatus("자료 목록을 불러오는 중입니다...");
  const entries = Object.entries(ASSET_SHEET_URLS);
  const results = await Promise.allSettled(entries.map(([, url]) => fetch(url, { cache: "no-store" }).then(res => res.text())));
  const nextRows = { media: [], exam: [] };
  results.forEach((result, resultIdx) => {
    if (result.status !== "fulfilled") return;
    const source = entries[resultIdx][0];
    parseCSV(result.value).forEach((columns, index) => {
      if (index === 0 || columns.length < 2) return;
      const material = normalizeAssetColumns(columns);
      if (!material) return;
      const key = String(columns[0] || material.key || "").trim();
      const rawLink = String(columns[1] || "").trim();
      if (!key) return;
      nextRows[source].push({
        ...material,
        key,
        rawLink,
        rawColumns: columns,
        assetSource: source,
      });
    });
  });
  state.rows = nextRows;
  state.loading = false;
  render();
  renderStatus(`${nextRows.media.length + nextRows.exam.length}개 자료를 불러왔습니다.`);
}

function render() {
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

function renderControls() {
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

function renderMain() {
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

function renderResults() {
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

function renderGroupedRows(rows) {
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

function getAssetColumn(row) {
  if (row.kind === "image") return "image";
  if (row.kind === "video") return "video";
  return "text";
}

function getKindLabel(kind) {
  if (kind === "image") return "이미지";
  if (kind === "video") return "영상";
  if (kind === "text") return "텍스트";
  return "자료";
}

function renderRow(row) {
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

function renderOpenAction(row) {
  if (row.kind === "text") {
    return `<button class="asset-btn asset-btn--link" type="button" data-action="open-text-preview" data-key="${escapeAttr(row.key)}">기사 미리보기</button>`;
  }
  return row.rawLink
    ? `<a class="asset-btn asset-btn--link" href="${escapeAttr(row.rawLink)}" target="_blank" rel="noopener">링크 바로가기</a>`
    : "";
}

function getPurposeText(row) {
  return row.reason
    || row.caption
    || row.source
    || row.keywords?.join(", ")
    || row.body
    || row.title
    || row.headline
    || "활용 메모 없음";
}

function renderThumb(row) {
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

function renderPreviewOverlay() {
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

function renderUploadPanel() {
  const upload = state.upload;
  const preview = upload.dataUrl
    ? `<img src="${escapeAttr(upload.dataUrl)}" alt="">`
    : `<span>이미지를 이 영역에 붙여넣거나 파일을 선택하세요.</span>`;
  const result = upload.lastKey || upload.lastUrl ? `
    <div class="asset-upload-tool__result">
      <strong>등록 결과</strong>
      <code>${escapeHtml(upload.lastKey)}</code>
      ${upload.lastUrl ? `<a href="${escapeAttr(upload.lastUrl)}" target="_blank" rel="noopener">${escapeHtml(upload.lastUrl)}</a>` : ""}
      <div class="asset-upload-tool__result-actions">
        <button class="asset-btn" type="button" data-action="copy-upload-key" ${upload.lastKey ? "" : "disabled"}>키 복사</button>
        <button class="asset-btn" type="button" data-action="copy-upload-link" ${upload.lastUrl ? "" : "disabled"}>링크 복사</button>
        <button class="asset-btn asset-btn--primary" type="button" data-action="copy-upload-pair" ${upload.lastKey && upload.lastUrl ? "" : "disabled"}>키+링크 복사</button>
      </div>
    </div>
  ` : "";
  return `
    <section class="asset-upload-tool" tabindex="0">
      <div class="asset-upload-tool__drop">${preview}</div>
      <div class="asset-upload-tool__grid">
        <label>
          JSON KEY
          <input data-upload-field="key" value="${escapeAttr(upload.key)}" placeholder="asset-key">
        </label>
        <label>
          이미지 파일
          <input id="upload-file" type="file" accept="image/*">
        </label>
      </div>
      <div class="asset-upload-tool__actions">
        <button class="asset-btn asset-btn--primary" type="button" data-action="upload-asset" ${upload.busy ? "disabled" : ""}>확인</button>
        <button class="asset-btn" type="button" data-action="clear-upload">초기화</button>
      </div>
      <p class="asset-card__meta">${escapeHtml(upload.status || "이미지를 준비한 뒤 JSON KEY를 확인하고 확인을 누르세요.")}</p>
      ${result}
    </section>
  `;
}

function getFilteredRows() {
  const query = state.query.toLowerCase().trim();
  const sourceRows = state.rows[state.source] || [];
  if (!query) return sourceRows;
  return sourceRows.filter(row => getSearchText(row).includes(query));
}

function getSearchText(row) {
  return [
    row.key,
    row.rawLink,
    row.title,
    row.headline,
    row.caption,
    row.source,
    row.reason,
    row.body,
    row.keywords?.join(" "),
    row.rawColumns?.join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function getRow(key) {
  return [...state.rows.media, ...state.rows.exam].find(row => row.key === key) || null;
}

function getSelectedRows() {
  return [...state.selected].map(getRow).filter(Boolean);
}

function toggleRow(key) {
  if (!key) return;
  if (state.selected.has(key)) state.selected.delete(key);
  else state.selected.add(key);
  renderMain();
}

function formatPair(row) {
  if (!row) return "";
  return `${row.key}\t${row.rawLink || ""}`;
}

async function prepareUploadFile(file) {
  if (!file.type.startsWith("image/")) {
    setUploadStatus("이미지 파일만 등록할 수 있습니다.");
    return;
  }
  state.upload.file = file;
  try {
    state.upload.dataUrl = await readFileAsDataUrl(file);
    if (!state.upload.key) state.upload.key = createAssetKey(file);
    state.upload.status = `${file.type || "image"} 준비됨 (${Math.round(file.size / 1024)} KB).`;
  } catch (err) {
    state.upload.file = null;
    state.upload.dataUrl = "";
    state.upload.status = err?.message || "이미지를 읽지 못했습니다.";
  }
  renderMain();
}

async function uploadAsset() {
  const upload = state.upload;
  const key = upload.key.trim();
  if (!ASSET_UPLOAD_ENDPOINT.trim()) return setUploadStatus("업로드 엔드포인트가 설정되지 않았습니다.");
  if (!upload.file || !upload.dataUrl) return setUploadStatus("이미지를 먼저 붙여넣거나 선택하세요.");
  if (!key) return setUploadStatus("JSON KEY를 입력하세요.");

  upload.busy = true;
  setUploadStatus("구글 드라이브에 올리는 중입니다...");
  renderMain();
  try {
    const response = await fetch(ASSET_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        imageBase64: upload.dataUrl.split(",")[1] || "",
        mimeType: upload.file.type || "image/png",
      }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "업로드 응답을 읽지 못했습니다.");
    }
    if (!response.ok || !data.ok) throw new Error(data.error || `업로드 실패 (${response.status}).`);
    const driveUrl = data.driveUrl || data.url || "";
    if (!driveUrl) throw new Error("업로드 응답에 driveUrl이 없습니다.");
    const uploadedKey = data.key || key;
    upload.lastKey = uploadedKey;
    upload.lastUrl = driveUrl;
    upload.status = "업로드했습니다. 아래에서 JSON KEY와 링크를 복사할 수 있습니다.";
    upsertUploadedRow(uploadedKey, driveUrl);
  } catch (err) {
    upload.status = err.message || "업로드에 실패했습니다.";
  } finally {
    upload.busy = false;
    renderMain();
  }
}

function upsertUploadedRow(key, link) {
  const row = {
    key,
    rawLink: link,
    rawColumns: [key, link],
    assetSource: "media",
    kind: "image",
    title: key,
    url: link,
    keywords: [],
  };
  state.rows.media = [row, ...state.rows.media.filter(item => item.key !== key)];
}

function clearUpload() {
  state.upload = {
    file: null,
    dataUrl: "",
    key: "",
    busy: false,
    status: "",
    lastKey: "",
    lastUrl: "",
  };
}

function setUploadStatus(message) {
  state.upload.status = message;
  renderMain();
}

function getClipboardImage(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const item = items.find(entry => entry.kind === "file" && entry.type.startsWith("image/"));
  return item?.getAsFile() || null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function createAssetKey(file) {
  const base = "asset-search";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = (file.type.split("/")[1] || "image").replace("jpeg", "jpg");
  return `${base}-${stamp}.${ext}`;
}

function getPreviewImageUrl(url) {
  if (!url) return "";
  const videoId = extractYoutubeId(url);
  if (videoId) return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  if (url.includes("drive.google.com")) {
    const match = url.match(/\/d\/([^/]+)/) || url.match(/id=([^&]+)/);
    if (match?.[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url)) return url;
  if (/^https?:\/\/[^ ]+$/i.test(url)) return url;
  return "";
}

function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1);
    const match = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (match) return match[1];
  } catch {}
  return "";
}

async function copyText(value, message) {
  const text = String(value || "");
  if (!text) return renderStatus("복사할 값이 없습니다.");
  try {
    await navigator.clipboard.writeText(text);
    renderStatus(message);
  } catch {
    renderStatus("브라우저가 클립보드 복사를 막았습니다. 값을 직접 선택해서 복사하세요.");
  }
}

function renderStatus(message) {
  const el = document.getElementById("asset-status");
  if (el) el.textContent = message || "";
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
