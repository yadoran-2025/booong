import { state } from "./state.js";
import { ASSET_UPLOAD_ENDPOINT } from "./constants.js";
import { escapeHtml } from "../utils.js";
import { appendCommonImages, renderEditor } from "./editor.js";
import { insertMarkupAssets } from "./markup-editor.js";
import { clearExternalAssetCache, getAssetTargetLabel, hasMaterialRef, insertUploadedAssetKey, renderAssetResults, splitKeywords, upsertAssetRow } from "./assets.js";
import { refreshOutputs } from "./output.js";
import { getPath, setPath } from "./paths.js";
import { escapeAttr } from "./dom.js";
export function legacyRenderUploadPanel() {
  const panel = document.getElementById("asset-upload-panel");
  if (!panel) return;
  if (state.assetSource !== "upload") {
    panel.innerHTML = "";
    return;
  }
  const upload = state.upload;
  const targetLabel = getAssetTargetLabel();
  const endpointReady = Boolean(ASSET_UPLOAD_ENDPOINT.trim());
  const preview = upload.dataUrl
    ? `<img class="asset-upload__preview-img" src="${escapeAttr(upload.dataUrl)}" alt="">`
    : `<span class="asset-upload__placeholder">이미지를 여기에 붙여넣으세요</span>`;
  panel.innerHTML = `
    <div class="asset-upload" tabindex="0">
      <div class="asset-upload__head">
        <strong>클립보드 새 자료 등록</strong>
        <span>${escapeHtml(targetLabel)}</span>
      </div>
      <div class="asset-upload__drop">
        ${preview}
      </div>
      <div class="asset-upload__grid">
        <label class="field">
          <span class="field__label">Apps Script URL</span>
          <input data-upload-field="endpoint" value="${escapeAttr(upload.endpoint)}" placeholder="https://script.google.com/macros/s/.../exec">
        </label>
        <label class="field">
          <span class="field__label">JSON 키</span>
          <input data-upload-field="key" value="${escapeAttr(upload.key)}" placeholder="asset-key">
        </label>
        <label class="field">
          <span class="field__label">키워드</span>
          <input data-upload-field="keywords" value="${escapeAttr(upload.keywords)}" placeholder="키워드1, 키워드2">
        </label>
        <label class="field">
          <span class="field__label">설명 / 메모</span>
          <input data-upload-field="reason" value="${escapeAttr(upload.reason)}" placeholder="왜 가져왔는지 짧게 메모">
        </label>
      </div>
      <div class="asset-upload__actions">
        <label class="btn btn--sm" for="asset-upload-file">파일 선택</label>
        <input id="asset-upload-file" type="file" accept="image/*" hidden>
        <button class="btn btn--sm btn--primary" type="button" data-action="upload-asset" ${upload.busy ? "disabled" : ""}>업로드</button>
        <button class="btn btn--sm" type="button" data-action="clear-upload-asset">비우기</button>
      </div>
      <div class="asset-upload__status">${escapeHtml(upload.status || "이미지를 붙여넣거나 파일을 선택한 뒤 Drive/Sheets에 등록합니다.")}</div>
    </div>
  `;
}

export function writeUploadField(target) {
  const field = target.dataset.uploadField;
  state.upload[field] = target.value;
}

export function getClipboardImage(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const item = items.find(entry => entry.kind === "file" && entry.type.startsWith("image/"));
  return item?.getAsFile() || null;
}

export async function legacyPrepareUploadFile(file) {
  if (!file.type.startsWith("image/")) {
    setUploadStatus("Only image files can be uploaded.");
    return;
  }
  state.upload.file = file;
  state.upload.dataUrl = await readFileAsDataUrl(file);
  if (!state.upload.key) state.upload.key = createAssetKey(file);
  state.upload.status = `${file.type || "image"} ready (${Math.round(file.size / 1024)} KB).`;
  renderUploadPanel();
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function legacyCreateAssetKey(file) {
  const base = (state.lesson.id || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = (file.type.split("/")[1] || "image").replace("jpeg", "jpg");
  return `${base}-${stamp}.${ext}`;
}

export async function legacyUploadClipboardAsset() {
  const upload = state.upload;
  const endpoint = upload.endpoint.trim();
  const key = upload.key.trim();
  if (!endpoint) return setUploadStatus("Set the Apps Script Web App URL first.");
  if (!upload.file || !upload.dataUrl) return setUploadStatus("Paste or choose an image first.");
  if (!key) return setUploadStatus("Enter a JSON key first.");

  upload.busy = true;
  setUploadStatus("Uploading image...");
  try {
    const imageBase64 = upload.dataUrl.split(",")[1] || "";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        imageBase64,
        mimeType: upload.file.type || "image/png",
        keywords: upload.keywords.trim(),
        reason: upload.reason.trim(),
      }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "Upload endpoint returned a non-JSON response.");
    }
    if (!response.ok || !data.ok) throw new Error(data.error || `Upload failed (${response.status}).`);
    const driveUrl = data.driveUrl || data.url;
    if (!driveUrl) throw new Error("Upload response did not include driveUrl.");
    upsertAssetRow({
      key: data.key || key,
      url: driveUrl,
      keywords: splitKeywords(upload.keywords),
      reason: upload.reason.trim(),
    });
    clearExternalAssetCache();
    insertUploadedAssetKey(data.key || key);
    upload.key = "";
    upload.keywords = "";
    upload.reason = "";
    upload.file = null;
    upload.dataUrl = "";
    setUploadStatus("Uploaded and added to the selected field.");
    renderEditor();
    refreshOutputs();
    renderAssetResults();
  } catch (err) {
    setUploadStatus(err.message || "Upload failed.");
  } finally {
    upload.busy = false;
    renderUploadPanel();
  }
}

export function legacyClearUploadAsset() {
  state.upload.file = null;
  state.upload.dataUrl = "";
  state.upload.key = "";
  state.upload.keywords = "";
  state.upload.reason = "";
  state.upload.status = "";
}

export function setUploadStatus(message) {
  state.upload.status = message;
  renderUploadPanel();
}

export function renderUploadPanel() {
  const panel = document.getElementById("asset-upload-panel");
  if (!panel) return;
  if (state.assetSource !== "upload") {
    panel.innerHTML = "";
    return;
  }

  const upload = state.upload;
  const endpointReady = Boolean(ASSET_UPLOAD_ENDPOINT.trim());
  const preview = upload.dataUrl
    ? `<img class="asset-upload__preview-img" src="${escapeAttr(upload.dataUrl)}" alt="">`
    : `<span class="asset-upload__placeholder">이미지를 여기에 붙여넣으세요</span>`;
  const status = upload.status || (
    endpointReady
      ? "이미지를 붙여넣고 JSON KEY를 확인한 뒤 확인을 누르세요."
      : "관리자 설정 필요: asset-config.js의 ASSET_UPLOAD_ENDPOINT에 Apps Script /exec URL을 넣어주세요."
  );
  const uploadedLink = upload.lastUrl ? `
    <div class="asset-upload__link">
      <span class="asset-upload__link-label">Drive link</span>
      <a href="${escapeAttr(upload.lastUrl)}" target="_blank" rel="noopener">${escapeHtml(upload.lastUrl)}</a>
      <div class="asset-upload__link-actions">
        <button class="btn btn--sm" type="button" data-action="copy-upload-url">링크 복사</button>
        <button class="btn btn--sm" type="button" data-action="insert-upload-url">현재 칸에 링크 넣기</button>
      </div>
    </div>
  ` : "";

  panel.innerHTML = `
    <div class="asset-upload" tabindex="0">
      <div class="asset-upload__head">
        <strong>클립보드 새자료</strong>
        <span>${escapeHtml(getAssetTargetLabel())}</span>
      </div>
      <div class="asset-upload__drop">
        ${preview}
      </div>
      <div class="asset-upload__grid">
        <label class="field">
          <span class="field__label">JSON KEY</span>
          <input data-upload-field="key" value="${escapeAttr(upload.key)}" placeholder="asset-key">
        </label>
      </div>
      <div class="asset-upload__actions">
        <button class="btn btn--sm btn--primary" type="button" data-action="upload-asset" ${upload.busy ? "disabled" : ""}>확인</button>
        <button class="btn btn--sm" type="button" data-action="clear-upload-asset">초기화</button>
      </div>
      <div class="asset-upload__status">${escapeHtml(status)}</div>
      ${uploadedLink}
    </div>
  `;
}

export async function prepareUploadFile(file) {
  if (!file.type.startsWith("image/")) {
    setUploadStatus("이미지 파일만 업로드할 수 있습니다.");
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
  renderUploadPanel();
}

export function createAssetKey(file) {
  const base = (state.lesson.id || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = (file.type.split("/")[1] || "image").replace("jpeg", "jpg");
  return `${base}-${stamp}.${ext}`;
}

export async function uploadClipboardAsset() {
  const endpoint = ASSET_UPLOAD_ENDPOINT.trim();
  const upload = state.upload;
  const key = upload.key.trim();
  if (!endpoint) return setUploadStatus("관리자 설정 필요: ASSET_UPLOAD_ENDPOINT에 Apps Script /exec URL을 넣어주세요.");
  if (!upload.file || !upload.dataUrl) return setUploadStatus("이미지를 먼저 붙여넣으세요.");
  if (!key) return setUploadStatus("JSON KEY를 입력하세요.");

  upload.busy = true;
  setUploadStatus("구글 드라이브에 올리는 중입니다...");
  try {
    const imageBase64 = upload.dataUrl.split(",")[1] || "";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        imageBase64,
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
    const driveUrl = data.driveUrl || data.url;
    if (!driveUrl) throw new Error("업로드 응답에 driveUrl이 없습니다.");

    upsertAssetRow({
      key: data.key || key,
      url: driveUrl,
      keywords: [],
      reason: "",
    });
    clearExternalAssetCache();
    const uploadedKey = data.key || key;
    insertUploadedAssetKey(uploadedKey);
    clearUploadAsset();
    state.upload.lastKey = uploadedKey;
    state.upload.lastUrl = driveUrl;
    state.upload.status = "업로드했고 현재 입력칸에 JSON KEY를 넣었습니다. 아래 Drive 링크도 바로 사용할 수 있습니다.";
    renderEditor();
    refreshOutputs();
    renderAssetResults();
  } catch (err) {
    setUploadStatus(err.message || "업로드에 실패했습니다.");
  } finally {
    upload.busy = false;
    renderUploadPanel();
  }
}

export function clearUploadAsset() {
  state.upload.file = null;
  state.upload.dataUrl = "";
  state.upload.key = "";
  state.upload.lastKey = "";
  state.upload.lastUrl = "";
  state.upload.status = "";
}

export function copyUploadedAssetUrl() {
  const url = state.upload.lastUrl;
  if (!url) return setUploadStatus("복사할 Drive 링크가 없습니다.");
  navigator.clipboard?.writeText(url)
    .then(() => setUploadStatus("Drive 링크를 복사했습니다."))
    .catch(() => setUploadStatus("브라우저가 클립보드 복사를 막았습니다. 링크를 직접 선택해서 복사하세요."));
}

export function insertUploadedAssetUrl() {
  const url = state.upload.lastUrl;
  if (!url) return setUploadStatus("넣을 Drive 링크가 없습니다.");
  insertUploadedAssetValue(url);
  state.upload.status = "현재 입력칸에 Drive 링크를 넣었습니다.";
  renderEditor();
  refreshOutputs();
  renderAssetResults();
}

export function insertUploadedAssetValue(value) {
  if (!state.assetTarget) return;
  if (state.assetTarget === "__markup__") {
    insertMarkupAssets([value]);
  } else if (state.assetTarget.endsWith(".__commonImages")) {
    appendCommonImages(state.assetTarget.replace(/\.__commonImages$/, ""), [value]);
  } else if (/\.materials$|\.items$/.test(state.assetTarget)) {
    const current = Array.isArray(getPath(state.assetTarget)) ? getPath(state.assetTarget) : [];
    if (!hasMaterialRef(current, value)) current.push(value);
    setPath(state.assetTarget, current);
  } else if (Array.isArray(getPath(state.assetTarget))) {
    const current = getPath(state.assetTarget);
    if (!current.includes(value)) current.push(value);
  } else {
    setPath(state.assetTarget, value);
  }
}
