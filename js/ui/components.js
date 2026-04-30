/* ── 블록 전체화면 ── */

const EXPAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

let sectionNavigator = null;
let fullscreenNavigating = false;
let fullscreenToggleCursor = 0;

export function setBlockFullscreenSectionNavigator(navigator) {
  sectionNavigator = typeof navigator === "function" ? navigator : null;
}

export function attachFocusAffordance(blockEl) {
  blockEl.classList.add("block--focusable");
  const btn = document.createElement("button");
  btn.className = "focus-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "블록 전체화면으로 보기");
  btn.setAttribute("title", "전체화면으로 보기 (ESC로 닫기)");
  btn.innerHTML = EXPAND_ICON;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    openBlockFullscreen(blockEl);
  });
  blockEl.appendChild(btn);
}

export function openBlockFullscreen(originalBlockEl) {
  removeBlockFullscreenNow();

  const allBlocks = [...document.querySelectorAll("#main-content .block--focusable")];
  const currentIdx = allBlocks.indexOf(originalBlockEl);
  if (currentIdx < 0) return;

  const overlay = document.createElement("div");
  overlay.className = "block-fullscreen";
  overlay.id = "block-fullscreen";
  overlay.dataset.blockIdx = currentIdx;

  const closeBtn = document.createElement("button");
  closeBtn.className = "block-fullscreen__close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "전체화면 닫기");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeBlockFullscreen);

  const prevBtn = document.createElement("button");
  prevBtn.className = "block-fullscreen__nav block-fullscreen__nav--prev";
  prevBtn.type = "button";
  prevBtn.setAttribute("aria-label", "이전 블록");
  prevBtn.innerHTML = "&#8249;";
  prevBtn.disabled = currentIdx <= 0 && !canNavigateSection(-1);
  prevBtn.addEventListener("click", () => navigateBlockFullscreen(-1));

  const nextBtn = document.createElement("button");
  nextBtn.className = "block-fullscreen__nav block-fullscreen__nav--next";
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "다음 블록");
  nextBtn.innerHTML = "&#8250;";
  nextBtn.disabled = currentIdx >= allBlocks.length - 1 && !canNavigateSection(1);
  nextBtn.addEventListener("click", () => navigateBlockFullscreen(1));

  const stage = document.createElement("div");
  stage.className = "block-fullscreen__stage";
  overlay.appendChild(closeBtn);
  overlay.appendChild(prevBtn);
  overlay.appendChild(nextBtn);
  overlay.appendChild(stage);

  document.body.appendChild(overlay);
  document.body.classList.add("is-focus-locked");

  renderFullscreenBlock(overlay, originalBlockEl, currentIdx);
  requestAnimationFrame(() => overlay.classList.add("is-open"));
}

export function navigateBlockFullscreen(direction) {
  if (fullscreenNavigating) return;
  const overlay = document.getElementById("block-fullscreen");
  if (!overlay) return;
  fullscreenNavigating = true;
  const allBlocks = [...document.querySelectorAll("#main-content .block--focusable")];
  const nextIdx = parseInt(overlay.dataset.blockIdx ?? "0") + direction;
  if (nextIdx < 0 || nextIdx >= allBlocks.length) {
    navigateFullscreenSectionWithMotion(overlay, direction);
    return;
  }
  renderFullscreenBlock(overlay, allBlocks[nextIdx], nextIdx);
  fullscreenNavigating = false;
}

function navigateFullscreenSectionWithMotion(overlay, direction) {
  const stage = overlay.querySelector(".block-fullscreen__stage");
  if (!stage || !navigateSection(direction)) {
    fullscreenNavigating = false;
    return;
  }

  const leaveClass = direction > 0 ? "is-section-leaving-next" : "is-section-leaving-prev";
  const enterClass = direction > 0 ? "is-section-entering-next" : "is-section-entering-prev";
  stage.classList.add(leaveClass);

  window.setTimeout(() => {
    requestAnimationFrame(() => {
      const nextBlocks = [...document.querySelectorAll("#main-content .block--focusable")];
      const target = direction > 0 ? nextBlocks[0] : nextBlocks[nextBlocks.length - 1];
      if (!target) {
        fullscreenNavigating = false;
        return;
      }

      renderFullscreenBlock(overlay, target, direction > 0 ? 0 : nextBlocks.length - 1);
      stage.classList.remove(leaveClass);
      stage.classList.add(enterClass);
      stage.getBoundingClientRect();
      requestAnimationFrame(() => {
        stage.classList.remove(enterClass);
        window.setTimeout(() => {
          fullscreenNavigating = false;
        }, 180);
      });
    });
  }, 150);
}

function renderFullscreenBlock(overlay, originalBlockEl, currentIdx) {
  const allBlocks = [...document.querySelectorAll("#main-content .block--focusable")];
  const stage = overlay.querySelector(".block-fullscreen__stage");
  const prevBtn = overlay.querySelector(".block-fullscreen__nav--prev");
  const nextBtn = overlay.querySelector(".block-fullscreen__nav--next");
  if (!stage || !originalBlockEl) return;

  overlay.dataset.blockIdx = currentIdx;
  overlay.dataset.toggleCursor = "0";
  fullscreenToggleCursor = 0;
  if (prevBtn) prevBtn.disabled = currentIdx <= 0 && !canNavigateSection(-1);
  if (nextBtn) nextBtn.disabled = currentIdx >= allBlocks.length - 1 && !canNavigateSection(1);

  const clone = originalBlockEl.cloneNode(true);
  clone.classList.add("block--fullscreen");
  clone.classList.remove("block--focusable");
  clone.querySelectorAll(".focus-btn").forEach(el => el.remove());
  clone.style.width = originalBlockEl.offsetWidth + "px";
  clone.style.transformOrigin = "center center";

  rewireToggles(clone);
  clone.querySelectorAll(".comment-section").forEach(cs => {
    const toggle = cs.querySelector(".comment-section__toggle");
    if (toggle) toggle.addEventListener("click", () => cs.classList.toggle("is-open"));
  });
  clone.querySelectorAll(".quiz-accordion__item").forEach(item => {
    const summary = item.querySelector(".quiz-accordion__summary");
    if (summary) summary.addEventListener("click", () => item.classList.toggle("is-open"));
  });
  clone.querySelectorAll(".answer__toggle, .expandable__summary, .comment-section__toggle, .quiz-accordion__summary").forEach(control => {
    control.addEventListener("click", () => requestAnimationFrame(() => updateFullscreenLayout(stage, clone)));
  });

  stage.replaceChildren(clone);
  stage.classList.remove("is-scrollable");
  stage.scrollTop = 0;
  requestAnimationFrame(() => updateFullscreenLayout(stage, clone));
}

function updateFullscreenLayout(stage, clone) {
  const elW = clone.offsetWidth;
  const elH = clone.offsetHeight;
  if (elW <= 0 || elH <= 0) return;

  const stageStyle = getComputedStyle(stage);
  const stagePaddingX = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const stagePaddingY = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
  const availableWidth = stage.clientWidth - stagePaddingX;
  const availableHeight = stage.clientHeight - stagePaddingY;
  const maxScaleX = availableWidth / elW;
  const maxScaleY = availableHeight / elH;
  const previousScale = Number(clone.dataset.fullscreenScale) || 0;
  const scale = previousScale
    ? Math.min(previousScale, maxScaleX)
    : Math.min(maxScaleX, maxScaleY);

  const shouldScroll = elH * scale > availableHeight;
  clone.style.transformOrigin = shouldScroll ? "top center" : "center center";
  clone.style.transform = `scale(${scale})`;
  clone.style.marginBottom = shouldScroll ? `${Math.max(0, elH * scale - elH)}px` : "";
  clone.dataset.fullscreenScale = String(scale);

  stage.classList.toggle("is-scrollable", shouldScroll);
  if (!shouldScroll) stage.scrollTop = 0;
}

function canNavigateSection(direction) {
  return sectionNavigator?.(direction, { dryRun: true }) === true;
}

function navigateSection(direction) {
  return sectionNavigator?.(direction) === true;
}

export function closeBlockFullscreen() {
  const overlay = document.getElementById("block-fullscreen");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.body.classList.remove("is-focus-locked");
  setTimeout(() => overlay.remove(), 200);
}

function removeBlockFullscreenNow() {
  document.querySelectorAll("#block-fullscreen").forEach(overlay => overlay.remove());
  document.body.classList.remove("is-focus-locked");
}

export function closeFocusOverlay() {
  closeBlockFullscreen();
}

export function expandNextFullscreenToggle() {
  const overlay = document.getElementById("block-fullscreen");
  const stage = overlay?.querySelector(".block-fullscreen__stage");
  const clone = stage?.querySelector(".block--fullscreen");
  if (!stage || !clone) return false;

  const controls = [...clone.querySelectorAll(
    ".answer__toggle, .expandable__summary, .comment-section__toggle, .quiz-accordion__summary"
  )];
  if (!controls.length) return false;

  fullscreenToggleCursor = normalizeToggleCursor(overlay, controls.length);
  const control = controls[fullscreenToggleCursor];
  const wrap = getToggleWrap(control);
  if (!wrap) return false;

  const wasOpen = wrap.classList.contains("is-open");
  control.click();
  if (wasOpen) {
    fullscreenToggleCursor = (fullscreenToggleCursor + 1) % controls.length;
    overlay.dataset.toggleCursor = String(fullscreenToggleCursor);
  }

  requestAnimationFrame(() => updateFullscreenLayout(stage, clone));
  return true;
}

export function scrollBlockFullscreen(direction) {
  const stage = document.querySelector("#block-fullscreen .block-fullscreen__stage");
  if (!stage) return false;
  const amount = Math.max(72, Math.round(stage.clientHeight * 0.14));
  stage.scrollBy({ top: direction * amount, behavior: "smooth" });
  return true;
}

function normalizeToggleCursor(overlay, controlCount) {
  const value = Number.parseInt(overlay.dataset.toggleCursor ?? String(fullscreenToggleCursor), 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value % controlCount;
}

function getToggleWrap(control) {
  if (control.classList.contains("answer__toggle")) return control.closest(".answer");
  if (control.classList.contains("expandable__summary")) return control.closest(".expandable");
  if (control.classList.contains("comment-section__toggle")) return control.closest(".comment-section");
  if (control.classList.contains("quiz-accordion__summary")) return control.closest(".quiz-accordion__item");
  return null;
}

export function rewireToggles(root) {
  root.querySelectorAll(".answer").forEach(ans => {
    const t = ans.querySelector(".answer__toggle");
    if (t) t.addEventListener("click", () => ans.classList.toggle("is-open"));
  });
  root.querySelectorAll(".expandable").forEach(exp => {
    const s = exp.querySelector(".expandable__summary");
    if (s) s.addEventListener("click", () => exp.classList.toggle("is-open"));
  });
}

/* ── 이미지 라이트박스 ── */

export function openImageLightbox(src) {
  closeImageLightbox();
  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.id = "image-lightbox";

  const img = document.createElement("img");
  img.src = src;
  img.className = "image-lightbox__img";

  const closeBtn = document.createElement("button");
  closeBtn.className = "image-lightbox__close";
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeImageLightbox();
  });

  lightbox.appendChild(img);
  lightbox.appendChild(closeBtn);

  lightbox.addEventListener("click", () => closeImageLightbox());
  img.addEventListener("click", (e) => e.stopPropagation());

  document.body.appendChild(lightbox);
  document.body.classList.add("is-focus-locked");

  requestAnimationFrame(() => lightbox.classList.add("is-open"));
}

export function closeImageLightbox() {
  const lightbox = document.getElementById("image-lightbox");
  if (!lightbox) return;
  lightbox.classList.remove("is-open");
  document.body.classList.remove("is-focus-locked");
  setTimeout(() => lightbox.remove(), 250);
}
