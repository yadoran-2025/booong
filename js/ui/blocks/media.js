import { app } from "../../state.js";
import { escapeHtml, extractYouTubeId, formatInline } from "../../utils.js";
import { openImageLightbox } from "../components.js";
import { buildMaterial, buildMaterials, buildTextCutout, resolveMaterial } from "./materials.js";
export function renderFigure(block) {
  const div = document.createElement("div");
  div.className = "block figure-row";

  const left = document.createElement("div");
  left.className = "figure-row__image-wrap";
  left.appendChild(buildImage(block.image, block.caption));
  if (block.caption) {
    const cap = document.createElement("div");
    cap.className = "figure-row__caption";
    cap.textContent = block.caption;
    left.appendChild(cap);
  }

  const right = document.createElement("div");
  const kind = block.kind ?? (block.title ? "concept" : "quote");
  if (kind === "concept") {
    right.className = "callout concept";
    right.style.margin = "0";
    right.innerHTML = `
      <div class="concept__title">${escapeHtml(block.title || "")}</div>
      <div class="concept__body">${formatInline(block.body || "")}</div>
    `;
  } else {
    const q = document.createElement("div");
    q.className = "figure-row__quote";
    q.innerHTML = formatInline(block.body || "");
    right.appendChild(q);
    if (block.note) {
      const n = document.createElement("div");
      n.className = "figure-row__note";
      n.innerHTML = formatInline(block.note);
      right.appendChild(n);
    }
  }

  div.appendChild(left);
  div.appendChild(right);
  return div;
}

/* ── 미디어 ── */

/**
 * media — 이미지·영상·텍스트 자료 통합 블록
 *
 * kind: "row"   — 이미지 여러 장 가로 나열 (구 image-row)
 * kind: "image" — 캡션 있는 단독 이미지
 * kind: "video" — 유튜브 썸네일 링크 (구 video-link)
 * kind: "text"  — 신문기사 스타일 텍스트 자료 (구 text: 접두사)
 *                 추가 필드: headline?, body, source?
 */

export function renderMedia(block) {
  if (block.item || block.items || block.materials) {
    return buildMaterials(block.items || block.materials || block.item, block.layout || block.kind || "stack");
  }

  if (block.kind === "row") {
    const div = document.createElement("div");
    div.className = "block image-row";
    block.images.forEach(src => {
      const wrap = document.createElement("div");
      wrap.className = "image-row__item";
      wrap.appendChild(buildImage(src));
      div.appendChild(wrap);
    });
    return div;
  }

  if (block.kind === "text" || block.style === "news") {
    const tc = buildTextCutout(block);
    tc.classList.add("block");
    return tc;
  }

  const div = document.createElement("div");
  div.className = "block media";

  if (block.kind === "image") {
    div.classList.add("media--image");
    div.appendChild(buildImage(block.src, block.caption || ""));
    if (block.caption) {
      const cap = document.createElement("div");
      cap.className = "media__caption";
      cap.textContent = block.caption;
      div.appendChild(cap);
    }
  } else if (block.kind === "video") {
    div.classList.add("media--video");
    const videoId = extractYouTubeId(block.url);
    const link = document.createElement("a");
    link.href = block.url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.className = "media__thumb-link";
    link.setAttribute("aria-label", block.caption || "영상 보기");
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "media__thumb-wrap";
    if (videoId) {
      const img = document.createElement("img");
      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      img.alt = block.caption || "YouTube 썸네일"; img.loading = "lazy";
      img.onerror = () => {
        const ph = document.createElement("div");
        ph.className = "image-placeholder"; ph.textContent = "썸네일 없음";
        img.replaceWith(ph);
      };
      thumbWrap.appendChild(img);
    }
    const play = document.createElement("div");
    play.className = "media__play-icon"; play.setAttribute("aria-hidden", "true"); play.textContent = "▶";
    thumbWrap.appendChild(play); link.appendChild(thumbWrap); div.appendChild(link);
    if (block.caption) {
      const cap = document.createElement("div");
      cap.className = "media__caption"; cap.textContent = block.caption; div.appendChild(cap);
    }
  }

  return div;
}

export function buildImagePair(paths) {
  const pair = document.createElement("div");
  pair.className = "image-pair";
  paths.forEach(p => pair.appendChild(buildImage(p)));
  return pair;
}

export function buildImage(key, alt = "") {
  const material = resolveMaterial(key, alt, "image");
  if (material.kind === "text") return buildMaterial(material);
  if (material.kind === "video") return buildVideoThumb(material.url || material.src || material.value || key, alt || material.caption || material.title || "");

  let resolved = material.url || material.src || material.value || key;

  if (typeof resolved === "string" && resolved.includes("drive.google.com")) {
    const m = resolved.match(/\/d\/([^/]+)/) || resolved.match(/id=([^&]+)/);
    if (m?.[1]) resolved = `https://lh3.googleusercontent.com/d/${m[1]}`;
  }

  const videoId = extractYouTubeId(resolved);
  if (videoId) {
    return buildVideoThumb(resolved, alt);
  }

  const src = /^https?:\/\//.test(resolved) ? resolved : app.lesson.imageBase + resolved;
  const img = document.createElement("img");
  img.src = src; img.alt = alt; img.loading = "lazy";
  img.addEventListener("click", () => openImageLightbox(src));
  img.onerror = () => {
    const ph = document.createElement("div");
    ph.className = "image-placeholder"; ph.textContent = `이미지: ${key}`;
    img.replaceWith(ph);
  };
  return img;
}

export function buildVideoThumb(url, alt = "") {
  const videoId = extractYouTubeId(url);
  const wrap = document.createElement("div"); wrap.className = "media__thumb-wrap";
  const link = document.createElement("a");
  link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
  link.className = "media__thumb-link"; link.setAttribute("aria-label", alt || "YouTube 영상 보기");
  if (videoId) {
    const thumb = document.createElement("img");
    thumb.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    thumb.alt = alt || "YouTube 썸네일"; thumb.loading = "lazy";
    thumb.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "image-placeholder"; ph.textContent = "썸네일 없음";
      thumb.replaceWith(ph);
    };
    link.appendChild(thumb);
  }
  const play = document.createElement("div");
  play.className = "media__play-icon"; play.setAttribute("aria-hidden", "true"); play.textContent = "▶";
  link.appendChild(play); wrap.appendChild(link);
  return wrap;
}
