import { state, root } from "./state.js";
import { renderPreviewOverlay } from "./preview.js";
import { clearUpload, getClipboardImage, prepareUploadFile, setUploadStatus, uploadAsset } from "./upload.js";
import { copyText, formatPair, getRow, getSelectedRows, toggleRow } from "./assets.js";
import { render, renderMain, renderResults, renderStatus } from "./render.js";

export function bindEvents() {
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
