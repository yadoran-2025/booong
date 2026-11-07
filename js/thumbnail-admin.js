import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { loadDashboardConfig, buildDashboardCatalog } from "./dashboard-data.js";
import { renderResourceCard } from "./ui/dashboard.js";
import { escapeHtml } from "./utils.js";
import { thumbnailUrl, thumbnailCrop, encodeThumbnail, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY } from "./thumbnail-data.js";

const root = document.querySelector("#admin-root");
let records = {}, resources = [], account, epoch = 0, busy = false, editor;

function setBusy(value) {
  busy = value;
  root.querySelectorAll("button, input").forEach(element => { element.disabled = value || adminAccountId() !== account; });
}

async function readRecords() {
  const currentAccount = account;
  const response = await adminFetch("/api/lesson-thumbnails?admin=1");
  const result = await response.json();
  if (adminAccountId() !== currentAccount) throw new Error("계정이 변경되었습니다. 새로고침해주세요.");
  if (!response.ok || !result.thumbnails || typeof result.thumbnails !== "object") throw new Error(result.error || "썸네일을 불러오지 못했습니다. 다시 시도해주세요.");
  return result.thumbnails;
}

function renderGallery() {
  const gallery = root.querySelector("[data-thumbnail-gallery]");
  gallery.innerHTML = resources.map(item => `<article class="thumbnail-tile" data-thumbnail-id="${escapeHtml(item.id)}">
    <img src="${escapeHtml(thumbnailUrl(item, records[item.id]))}" alt="${escapeHtml(item.title)} 썸네일" loading="lazy" width="800" height="500">
    <div class="thumbnail-tile__content"><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.subjects.join(" · "))}</p>
    <div class="thumbnail-tile__actions"><button class="btn btn--secondary" type="button" data-edit-thumbnail="${escapeHtml(item.id)}">이미지 수정</button>${records[item.id] ? `<button class="btn btn--ghost" type="button" data-restore-thumbnail="${escapeHtml(item.id)}">이전 이미지로 복원</button>` : ""}</div></div>
  </article>`).join("");
  gallery.querySelectorAll("img").forEach(image => image.addEventListener("error", () => { image.src = "/assets/lesson-thumbnails/social-studies-default-v1.jpg"; }, { once: true }));
  filterGallery();
}

function filterGallery() {
  const query = root.querySelector("[data-thumbnail-search]").value.normalize("NFKC").toLowerCase().trim();
  let count = 0;
  root.querySelectorAll("[data-thumbnail-id]").forEach(tile => {
    const item = resources.find(item => item.id === tile.dataset.thumbnailId);
    tile.hidden = !`${item.title} ${item.subjects.join(" ")}`.normalize("NFKC").toLowerCase().includes(query);
    if (!tile.hidden) count++;
  });
  root.querySelector("[data-thumbnail-empty]").hidden = count > 0;
}

async function persist(item, bytes, restore, revision) {
  const currentAccount = account;
  const query = new URLSearchParams({ id: item.id, ...(revision ? { revision } : {}), ...(restore ? { restore: "1" } : {}) });
  const response = await adminFetch(`/api/lesson-thumbnails?${query}`, { method: "POST", headers: bytes ? { "Content-Type": bytes.type } : {}, body: bytes || undefined });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || ([401, 403].includes(response.status) ? "운영자 권한을 다시 확인해주세요." : "저장하지 못했습니다. 다시 시도해주세요."));
    error.status = response.status;
    throw error;
  }
  if (adminAccountId() !== currentAccount || !result.thumbnail?.revision) throw new Error("계정이 변경되었거나 저장 결과를 확인하지 못했습니다. 새로고침해주세요.");
  records[item.id] = result.thumbnail;
}

function openEditor(item, opener) {
  const dialog = document.createElement("dialog");
  editor = dialog;
  dialog.className = "thumbnail-editor";
  dialog.setAttribute("aria-labelledby", "thumbnail-editor-title");
  dialog.innerHTML = `<header><h2 id="thumbnail-editor-title">${escapeHtml(item.title)}</h2><form method="dialog"><button class="btn btn--ghost" aria-label="닫기">닫기 ×</button></form></header>
    <div class="thumbnail-editor__body"><section class="thumbnail-editor__tools" aria-label="이미지 편집">
      <div class="thumbnail-drop" data-thumbnail-drop><canvas width="800" height="500" aria-label="이미지 위치 조절. 드래그하거나 아래 위치 조절 막대를 사용하세요."></canvas></div>
      <div class="thumbnail-file-actions"><button class="btn btn--secondary" type="button" data-choose-image>이미지 선택</button><button class="btn btn--secondary" type="button" data-paste-image>붙여넣기</button><input type="file" accept="image/png,image/jpeg,image/webp" data-thumbnail-file hidden><button class="btn btn--ghost" type="button" data-reset-crop>화면 맞춤</button></div>
      <p class="thumbnail-status">이미지를 드래그하거나 캡처를 붙여넣을 수 있습니다.</p>
      <div class="thumbnail-sliders"><label>확대<input aria-label="이미지 확대" type="range" min="1" max="4" step="0.05" value="1" data-crop="zoom"></label><label>가로 위치<input aria-label="가로 위치" type="range" min="0" max="1" step="0.01" value="0.5" data-crop="x"></label><label>세로 위치<input aria-label="세로 위치" type="range" min="0" max="1" step="0.01" value="0.5" data-crop="y"></label></div>
    </section><section class="thumbnail-editor__preview" aria-label="카드 미리보기"><h3>카드 미리보기</h3><div class="curation-app thumbnail-preview" inert>${renderResourceCard({ ...item, thumbnailUrl: thumbnailUrl(item, records[item.id]) })}</div></section></div>
    <footer><p class="thumbnail-status" data-editor-status role="status" aria-live="polite"></p><button class="btn btn--secondary" type="button" data-editor-refresh hidden>최신 정보 불러오기</button><button class="btn btn--ghost" type="button" data-editor-cancel>취소</button><button class="btn btn--primary" type="button" data-save-thumbnail disabled>저장</button></footer>`;
  root.appendChild(dialog);
  const canvas = dialog.querySelector("canvas"), context = canvas.getContext("2d");
  const status = dialog.querySelector("[data-editor-status]"), save = dialog.querySelector("[data-save-thumbnail]");
  const preview = dialog.querySelector(".bundle-card__cover img");
  const fileInput = dialog.querySelector("[data-thumbnail-file]");
  const crop = { zoom: 1, x: 0.5, y: 0.5 };
  let image, dirty = false, imageRequest = 0, revision = records[item.id]?.revision || null, drag;
  const active = () => dialog.isConnected && adminAccountId() === account;

  function draw(changed = false) {
    if (!image || !active()) return;
    const { sx, sy, sw, sh } = thumbnailCrop(image.naturalWidth, image.naturalHeight, crop.zoom, crop.x, crop.y);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    preview.src = canvas.toDataURL(THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY);
    dirty ||= changed;
    save.disabled = busy || !dirty;
    dialog.querySelectorAll("[data-crop]").forEach(input => { input.value = crop[input.dataset.crop]; });
  }

  async function loadImage(url, changed) {
    const request = ++imageRequest;
    image = null; dirty = false;
    save.disabled = true;
    status.textContent = "이미지를 준비하고 있습니다…";
    try {
      const next = new Image(); next.crossOrigin = "anonymous";
      next.src = url;
      await next.decode();
      if (!active() || request !== imageRequest) return;
      if (next.naturalWidth * next.naturalHeight > 40_000_000) throw new Error("이미지가 너무 큽니다. 크기를 줄여 다시 선택해주세요.");
      image = next;
      Object.assign(crop, { zoom: 1, x: 0.5, y: 0.5 });
      draw(changed);
      status.textContent = "";
    } catch (error) {
      if (!active() || request !== imageRequest) return;
      image = null; save.disabled = true;
      status.textContent = error.message.includes("너무 큽니다") ? error.message : "이미지를 편집할 수 없습니다. 파일을 선택하거나 캡처를 붙여넣어주세요.";
    }
  }

  async function chooseFile(file) {
    if (busy || !file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
      status.textContent = "15MB 이하의 PNG·JPG·WebP 이미지를 선택해주세요."; return;
    }
    const url = URL.createObjectURL(file);
    try { await loadImage(url, true); }
    finally { URL.revokeObjectURL(url); fileInput.value = ""; }
  }

  dialog.querySelector("[data-choose-image]").addEventListener("click", () => fileInput.click());
  dialog.querySelector("[data-paste-image]").addEventListener("click", async () => {
    if (busy || !active()) return;
    try {
      if (!navigator.clipboard?.read) throw new Error("clipboard_unavailable");
      const items = await navigator.clipboard.read();
      if (!active()) return;
      for (const item of items) {
        const type = item.types.find(type => ["image/png", "image/jpeg", "image/webp"].includes(type));
        if (!type) continue;
        await chooseFile(await item.getType(type));
        return;
      }
      status.textContent = "클립보드에 이미지가 없습니다. 캡처나 이미지를 복사한 뒤 다시 붙여넣어주세요.";
    } catch {
      if (active()) status.textContent = "이 창에서 Ctrl+V(맥은 ⌘V)를 눌러 이미지를 붙여넣어주세요.";
    }
  });
  fileInput.addEventListener("change", () => chooseFile(fileInput.files[0]));
  dialog.querySelector("[data-editor-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-reset-crop]").addEventListener("click", () => { if (busy) return; Object.assign(crop, { zoom: 1, x: 0.5, y: 0.5 }); draw(true); });
  dialog.querySelectorAll("[data-crop]").forEach(input => input.addEventListener("input", () => { if (busy) return; crop[input.dataset.crop] = Number(input.value); draw(true); }));
  dialog.addEventListener("paste", event => {
    const file = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith("image/"))?.getAsFile();
    if (file) { event.preventDefault(); chooseFile(file); }
  });
  const drop = dialog.querySelector("[data-thumbnail-drop]");
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("is-dragging"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-dragging"));
  drop.addEventListener("drop", event => { event.preventDefault(); drop.classList.remove("is-dragging"); chooseFile(event.dataTransfer.files[0]); });
  canvas.addEventListener("pointerdown", event => {
    if (!image || busy) return;
    drag = { x: event.clientX, y: event.clientY, crop: { ...crop } };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || !image || busy) return;
    const bounds = canvas.getBoundingClientRect();
    const rect = thumbnailCrop(image.naturalWidth, image.naturalHeight, crop.zoom, crop.x, crop.y);
    const move = (delta, size, visible, total, value) => Math.max(0, Math.min(1, value - delta / size * visible / (total - visible || 1)));
    crop.x = move(event.clientX - drag.x, bounds.width, rect.sw, image.naturalWidth, drag.crop.x);
    crop.y = move(event.clientY - drag.y, bounds.height, rect.sh, image.naturalHeight, drag.crop.y);
    draw(true);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, () => { drag = null; });
  dialog.querySelector("[data-editor-refresh]").addEventListener("click", async event => {
    setBusy(true);
    try {
      const latest = await readRecords();
      if (!active()) return;
      records = latest; revision = records[item.id]?.revision || null;
      renderGallery(); event.target.hidden = true;
      status.textContent = "최신 정보를 불러왔습니다. 현재 편집한 이미지는 유지됩니다. 저장하면 최신 썸네일을 교체합니다.";
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); save.disabled = !image || !dirty; }
  });
  save.addEventListener("click", async () => {
    if (!image || !dirty || busy || !active()) return;
    setBusy(true); status.textContent = "저장하고 있습니다…";
    try {
      const bytes = await encodeThumbnail(canvas);
      await persist(item, bytes, false, revision);
      if (!active()) return;
      renderGallery(); dialog.close();
      root.querySelector("[data-thumbnail-status]").textContent = "저장했습니다. 수업 목록에는 약 1분 이내에 반영됩니다.";
    } catch (error) {
      if (!active()) return;
      status.textContent = error.message;
      dialog.querySelector("[data-editor-refresh]").hidden = error.status !== 409;
    } finally { setBusy(false); save.disabled = !image || !dirty; }
  });
  dialog.addEventListener("close", () => { imageRequest++; image = null; dialog.remove(); if (editor === dialog) editor = null; if (opener.isConnected) opener.focus(); }, { once: true });
  dialog.showModal();
  loadImage(thumbnailUrl(item, records[item.id]), false);
}

async function start() {
  const run = ++epoch;
  const response = await requireAdmin(root, "/api/lesson-thumbnails?admin=1");
  if (!response || run !== epoch) return;
  account = adminAccountId();
  records = (await response.json()).thumbnails;
  const catalogResponse = await adminFetch("/api/lesson-catalog?admin=1");
  if (!catalogResponse.ok) throw new Error("수업 목록을 불러오지 못했습니다.");
  const managed = (await catalogResponse.json()).state;
  const config = managed ? { catalog: buildDashboardCatalog(managed.rows.map(row => ({ ...row, published: "TRUE" })), managed.unitRows) } : await loadDashboardConfig();
  if (run !== epoch || account !== adminAccountId()) return;
  resources = config.catalog.resources;
  root.innerHTML = `<div class="admin-shell"><nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="admin.html">BOOONG</a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav>
    <header class="admin-home__hero"><div><h1>썸네일 관리<span>.</span></h1></div><a class="btn btn--secondary" href="index.html#lesson-library">수업 목록 보기 ↗</a></header>
    <div class="thumbnail-toolbar"><input class="field__input" type="search" placeholder="수업 제목이나 과목으로 찾기" aria-label="썸네일 검색" data-thumbnail-search><button class="btn btn--ghost" type="button" data-thumbnail-refresh>새로고침</button></div>
    <p class="thumbnail-status" role="status" aria-live="polite" data-thumbnail-status></p><div class="thumbnail-gallery" data-thumbnail-gallery></div><p class="analytics__empty" data-thumbnail-empty hidden>조건에 맞는 수업이 없습니다.</p></div>`;
  root.querySelector("[data-thumbnail-search]").addEventListener("input", filterGallery);
  root.querySelector("[data-thumbnail-refresh]").addEventListener("click", async () => {
    setBusy(true);
    const status = root.querySelector("[data-thumbnail-status]");
    try { const latest = await readRecords(); if (account !== adminAccountId()) return; records = latest; renderGallery(); status.textContent = ""; }
    catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  });
  root.querySelector("[data-thumbnail-gallery]").addEventListener("click", async event => {
    const edit = event.target.closest("[data-edit-thumbnail]"), restore = event.target.closest("[data-restore-thumbnail]");
    if (busy || (!edit && !restore) || account !== adminAccountId()) return;
    const item = resources.find(item => item.id === (edit?.dataset.editThumbnail || restore.dataset.restoreThumbnail));
    if (edit) return openEditor(item, edit);
    const status = root.querySelector("[data-thumbnail-status]");
    setBusy(true);
    try { await persist(item, null, true, records[item.id]?.revision || null); renderGallery(); status.textContent = "이전 이미지로 복원했습니다."; }
    catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  });
  renderGallery();
  const target = resources.find(item => item.id === new URLSearchParams(location.search).get("lesson"));
  if (target) openEditor(target, root.querySelector(`[data-edit-thumbnail="${CSS.escape(target.id)}"]`));
}

onAdminAccountChange(id => {
  if (account === undefined || id === account) return;
  epoch++; editor?.close(); root.replaceChildren(); records = {}; resources = [];
  account = id; start().catch(showError);
});
function showError() { root.innerHTML = '<p class="analytics__empty" role="alert">썸네일을 불러오지 못했습니다. <button class="btn btn--secondary" type="button" data-retry-thumbnails>다시 시도</button></p>'; root.querySelector("button").addEventListener("click", () => start().catch(showError)); }
start().catch(showError);
