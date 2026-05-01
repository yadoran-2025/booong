import { state, root, uiIds, getNextUiId } from "./state.js";
import { escapeHtml } from "../utils.js";
export function focusPendingField() {
  if (!state.focusPath) return;
  const path = state.focusPath;
  state.focusPath = "";
  requestAnimationFrame(() => {
    const field = root.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (!field) return;
    field.focus();
    if (typeof field.setSelectionRange === "function") {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
  });
}

export function resizeTextareas() {
  root.querySelectorAll("textarea[data-path]").forEach(resizeTextarea);
}

export function resizeTextarea(textarea) {
  if (textarea.classList.contains("markup-source")) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

export function getDetailState(item, prefix) {
  const id = getUiId(item, prefix);
  if (!state.openDetails.has(id)) state.openDetails.set(id, true);
  return { id, open: state.openDetails.get(id) };
}

export function getUiId(item, prefix) {
  if (!item || typeof item !== "object") return `${prefix}-unknown`;
  if (!uiIds.has(item)) uiIds.set(item, getNextUiId(prefix));
  return uiIds.get(item);
}

export function uniqueSectionId(base) {
  const ids = new Set(state.lesson.sections.map(section => section.id));
  let i = 2;
  let next = `${base}-${i}`;
  while (ids.has(next)) {
    i += 1;
    next = `${base}-${i}`;
  }
  return next;
}

export function numberOrNull(value) {
  return value == null ? null : Number(value);
}

export function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}

export function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
