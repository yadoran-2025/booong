/* ── 블록 전체화면 ── */

const EXPAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

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
  closeBlockFullscreen();

  const allBlocks = [...document.querySelectorAll("#main-content .block--focusable")];
  const currentIdx = allBlocks.indexOf(originalBlockEl);
  const origWidth = originalBlockEl.offsetWidth;

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
  prevBtn.disabled = currentIdx <= 0;
  prevBtn.addEventListener("click", () => navigateBlockFullscreen(-1));

  const nextBtn = document.createElement("button");
  nextBtn.className = "block-fullscreen__nav block-fullscreen__nav--next";
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "다음 블록");
  nextBtn.innerHTML = "&#8250;";
  nextBtn.disabled = currentIdx >= allBlocks.length - 1;
  nextBtn.addEventListener("click", () => navigateBlockFullscreen(1));

  const stage = document.createElement("div");
  stage.className = "block-fullscreen__stage";

  const clone = originalBlockEl.cloneNode(true);
  clone.classList.add("block--fullscreen");
  clone.classList.remove("block--focusable");
  clone.querySelectorAll(".focus-btn").forEach(el => el.remove());
  clone.style.width = origWidth + "px";
  clone.style.transformOrigin = "center center";

  rewireToggles(clone);
  clone.querySelectorAll(".comment-section").forEach(cs => {
    const toggle = cs.querySelector(".comment-section__toggle");
    if (toggle) toggle.addEventListener("click", () => cs.classList.toggle("is-open"));
  });

  stage.appendChild(clone);
  overlay.appendChild(closeBtn);
  overlay.appendChild(prevBtn);
  overlay.appendChild(nextBtn);
  overlay.appendChild(stage);

  document.body.appendChild(overlay);
  document.body.classList.add("is-focus-locked");

  // 레이아웃 완료 후 scale 계산
  requestAnimationFrame(() => {
    const elW = clone.offsetWidth;
    const elH = clone.offsetHeight;
    if (elW > 0 && elH > 0) {
      const scale = Math.min(
        (window.innerWidth - 120) / elW,   // 좌우 nav 버튼 60px씩
        (window.innerHeight - 80) / elH    // 상단 close 버튼 + 여백
      );
      clone.style.transform = `scale(${scale})`;
    }
    overlay.classList.add("is-open");
  });
}

export function navigateBlockFullscreen(direction) {
  const overlay = document.getElementById("block-fullscreen");
  if (!overlay) return;
  const allBlocks = [...document.querySelectorAll("#main-content .block--focusable")];
  const nextIdx = parseInt(overlay.dataset.blockIdx ?? "0") + direction;
  if (nextIdx < 0 || nextIdx >= allBlocks.length) return;
  openBlockFullscreen(allBlocks[nextIdx]);
}

export function closeBlockFullscreen() {
  const overlay = document.getElementById("block-fullscreen");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.body.classList.remove("is-focus-locked");
  setTimeout(() => overlay.remove(), 200);
}

export function closeFocusOverlay() {
  closeBlockFullscreen();
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
