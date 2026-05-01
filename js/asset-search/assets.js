import { ASSET_SHEET_URLS, normalizeAssetColumns, parseCSV } from "../api.js";
import { state } from "./state.js";
import { render, renderMain, renderStatus } from "./render.js";

export async function loadRows() {
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

export function getAssetColumn(row) {
  if (row.kind === "image") return "image";
  if (row.kind === "video") return "video";
  return "text";
}

export function getKindLabel(kind) {
  if (kind === "image") return "이미지";
  if (kind === "video") return "영상";
  if (kind === "text") return "텍스트";
  return "자료";
}

export function getPurposeText(row) {
  return row.reason
    || row.caption
    || row.source
    || row.keywords?.join(", ")
    || row.body
    || row.title
    || row.headline
    || "활용 메모 없음";
}

export function getFilteredRows() {
  const query = state.query.toLowerCase().trim();
  const sourceRows = state.rows[state.source] || [];
  if (!query) return sourceRows;
  return sourceRows.filter(row => getSearchText(row).includes(query));
}

export function getSearchText(row) {
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

export function getRow(key) {
  return [...state.rows.media, ...state.rows.exam].find(row => row.key === key) || null;
}

export function getSelectedRows() {
  return [...state.selected].map(getRow).filter(Boolean);
}

export function toggleRow(key) {
  if (!key) return;
  if (state.selected.has(key)) state.selected.delete(key);
  else state.selected.add(key);
  renderMain();
}

export function formatPair(row) {
  if (!row) return "";
  return `${row.key}\t${row.rawLink || ""}`;
}

export function upsertUploadedRow(key, link) {
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

export function getPreviewImageUrl(url) {
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

export function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1);
    const match = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (match) return match[1];
  } catch {}
  return "";
}

export async function copyText(value, message) {
  const text = String(value || "");
  if (!text) return renderStatus("복사할 값이 없습니다.");
  try {
    await navigator.clipboard.writeText(text);
    renderStatus(message);
  } catch {
    renderStatus("브라우저가 클립보드 복사를 막았습니다. 값을 직접 선택해서 복사하세요.");
  }
}
