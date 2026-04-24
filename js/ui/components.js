/* ── 포커스 오버레이 ── */

export function attachFocusAffordance(blockEl) {
  blockEl.classList.add("block--focusable");
  const btn = document.createElement("button");
  btn.className = "focus-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "이 블록 화면 포커스");
  btn.setAttribute("title", "이 블록에 집중 (ESC로 닫기)");
  btn.textContent = "📺";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    openFocusOverlay(blockEl);
  });
  blockEl.appendChild(btn);
}

export function openFocusOverlay(originalBlockEl) {
  closeFocusOverlay();
  const overlay = document.createElement("div");
  overlay.className = "focus-overlay";
  overlay.id = "focus-overlay";
  const stage = document.createElement("div");
  stage.className = "focus-overlay__stage";
  const closeBtn = document.createElement("button");
  closeBtn.className = "focus-overlay__close";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", e => {
    e.stopPropagation();
    closeFocusOverlay();
  });

  const clone = originalBlockEl.cloneNode(true);
  clone.classList.add("block--focused");
  clone.querySelectorAll(".focus-btn, .comment-section").forEach(b => b.remove());

  rewireToggles(clone);

  stage.appendChild(closeBtn);
  stage.appendChild(clone);
  overlay.appendChild(stage);

  overlay.addEventListener("click", e => {
    if (e.target === overlay) closeFocusOverlay();
  });
  stage.addEventListener("click", e => e.stopPropagation());

  document.body.appendChild(overlay);
  document.body.classList.add("is-focus-locked");
  requestAnimationFrame(() => overlay.classList.add("is-open"));
}

export function closeFocusOverlay() {
  const overlay = document.getElementById("focus-overlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  document.body.classList.remove("is-focus-locked");
  setTimeout(() => overlay.remove(), 200);
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
