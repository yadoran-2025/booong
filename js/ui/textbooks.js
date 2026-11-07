import { escapeHtml } from "../utils.js";

const bindings = new WeakMap();

export function renderTextbookButton(unit, middle = "") {
  return `<button type="button" class="btn btn--ghost curriculum-action" data-textbook-unit="${escapeHtml(unit.key)}" data-textbook-middle="${escapeHtml(middle)}" data-textbook-title="${escapeHtml(middle || unit.title)}" aria-haspopup="dialog" aria-label="${escapeHtml(middle || unit.title)} 교과서 분석" hidden>교과서 <span aria-hidden="true">↗</span></button>`;
}

export async function bindTextbooks(root) {
  bindings.get(root)?.unsubscribe?.();
  const binding = {};
  bindings.set(root, binding);
  const buttons = [...root.querySelectorAll("[data-textbook-unit]")];
  if (!buttons.length) return;
  let allowed = false, dialog, revision = 0;
  const current = () => root.isConnected && bindings.get(root) === binding;
  buttons.forEach(button => button.addEventListener("click", () => {
    if (!allowed || !current()) return;
    const url = new URL("/textbook-analysis.html", location.href);
    url.searchParams.set("unitKey", button.dataset.textbookUnit);
    if (button.dataset.textbookMiddle) url.searchParams.set("middle", button.dataset.textbookMiddle);
    dialog = document.createElement("dialog");
    dialog.className = "standards-dialog textbook-dialog";
    dialog.setAttribute("aria-labelledby", "textbook-dialog-title");
    dialog.innerHTML = `<div class="standards-frame"><header class="standards-head"><div><small>운영자 전용 · 교과서 분석</small><h2 id="textbook-dialog-title">${escapeHtml(button.dataset.textbookTitle)}</h2></div><form method="dialog"><button class="btn btn--ghost curriculum-action" autofocus>닫기 <span aria-hidden="true">×</span></button></form></header><iframe title="${escapeHtml(button.dataset.textbookTitle)} 교과서 분석" src="${escapeHtml(url.href)}"></iframe></div>`;
    root.appendChild(dialog);
    const popup = dialog;
    popup.addEventListener("close", () => { popup.remove(); if (button.isConnected) button.focus(); }, { once: true });
    const frame = popup.querySelector("iframe");
    frame.addEventListener("load", () => frame.contentDocument?.addEventListener("keydown", event => {
      if (event.key === "Escape" && !event.defaultPrevented && !frame.contentDocument.querySelector("dialog[open]")) popup.close();
    }));
    popup.showModal();
  }));
  try {
    const { adminFetch, adminAccountId, onAdminAccountChange } = await import("../admin.js");
    if (!current()) return;
    binding.unsubscribe = onAdminAccountChange(async uid => {
      const version = ++revision;
      allowed = false;
      buttons.forEach(button => { button.hidden = true; });
      dialog?.close();
      if (!uid || !current()) return;
      try {
        const response = await adminFetch("/api/admin");
        if (!current() || version !== revision || adminAccountId() !== uid) return;
        allowed = response.ok;
        buttons.forEach(button => { button.hidden = !allowed; });
      } catch (error) { console.warn("Textbook access unavailable:", error); }
    });
  } catch (error) { console.warn("Textbook access unavailable:", error); }
}
