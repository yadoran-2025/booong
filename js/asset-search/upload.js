import { ASSET_UPLOAD_ENDPOINT } from "../asset-config.js";
import { state } from "./state.js";
import { copyText, upsertUploadedRow } from "./assets.js";
import { escapeAttr, renderMain } from "./render.js";

export function renderUploadPanel() {
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

export async function prepareUploadFile(file) {
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

export async function uploadAsset() {
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

export function clearUpload() {
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

export function setUploadStatus(message) {
  state.upload.status = message;
  renderMain();
}

export function getClipboardImage(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const item = items.find(entry => entry.kind === "file" && entry.type.startsWith("image/"));
  return item?.getAsFile() || null;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function createAssetKey(file) {
  const base = "asset-search";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = (file.type.split("/")[1] || "image").replace("jpeg", "jpg");
  return `${base}-${stamp}.${ext}`;
}

export function copyUploadPair() {
  return copyText(`${state.upload.lastKey}\t${state.upload.lastUrl}`, "업로드한 키와 링크를 복사했습니다.");
}
