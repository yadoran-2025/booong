import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { loadDashboardConfig, buildDashboardCatalog } from "./dashboard-data.js";
import { escapeHtml } from "./utils.js";
import { thumbnailUrl } from "./thumbnail-data.js";
import { readThumbnailRecords, saveThumbnail, openThumbnailEditor } from "./thumbnail-editor.js";

const root = document.querySelector("#admin-root");
let records = {}, resources = [], account, epoch = 0, busy = false, editor;

function setBusy(value) {
  busy = value;
  root.querySelectorAll("button, input").forEach(element => { element.disabled = value || adminAccountId() !== account; });
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

function openEditor(item, opener) {
  editor = openThumbnailEditor({ root, item, opener, account, record: records[item.id],
    onSaved(record) {
      records[item.id] = record; renderGallery();
      root.querySelector("[data-thumbnail-status]").textContent = "저장했습니다. 수업 목록에는 약 1분 이내에 반영됩니다.";
    },
    onRefreshed(latest) { records = latest; renderGallery(); },
    onClose() { editor = null; },
  });
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
    try { const latest = await readThumbnailRecords(account); if (account !== adminAccountId()) return; records = latest; renderGallery(); status.textContent = ""; }
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
    try { records[item.id] = await saveThumbnail(item.id, null, true, records[item.id]?.revision || null, account); renderGallery(); status.textContent = "이전 이미지로 복원했습니다."; }
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
