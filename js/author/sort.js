import { state } from "./state.js";
import { renderEditor } from "./editor.js";
import { refreshOutputs } from "./output.js";
export function startBlockSort(event, handle) {
  if (event.button != null && event.button !== 0) return;
  const card = handle.closest(".block-card[data-block]");
  const blockList = card?.parentElement;
  if (!card || !blockList?.matches(".section-card__blocks[data-section]")) return;

  event.preventDefault();
  event.stopPropagation();

  cancelBlockSort();
  const marker = document.createElement("div");
  marker.className = "block-drop-marker";

  state.blockSort = {
    pointerId: event.pointerId,
    handle,
    blockList,
    source: card,
    sectionIdx: Number(card.dataset.section),
    fromIdx: Number(card.dataset.block),
    insertIdx: Number(card.dataset.block),
    marker,
  };

  card.classList.add("is-sort-source");
  blockList.classList.add("is-sorting");
  document.body.classList.add("is-sorting-block");
  handle.setPointerCapture?.(event.pointerId);
  updateBlockSort(event);
}

export function updateBlockSort(event) {
  const sort = state.blockSort;
  if (!sort || event.pointerId !== sort.pointerId) return;
  event.preventDefault();
  sort.insertIdx = getPointerBlockInsertIndex(event.clientY, sort.blockList, sort.fromIdx);
  placeBlockSortMarker(sort.blockList, sort.marker, sort.insertIdx);
}

export function finishBlockSort(event) {
  const sort = state.blockSort;
  if (!sort || event.pointerId !== sort.pointerId) return;
  event.preventDefault();
  const { sectionIdx, fromIdx, insertIdx, handle } = sort;
  cleanupBlockSort();
  handle.releasePointerCapture?.(event.pointerId);
  if (moveBlockTo(sectionIdx, fromIdx, insertIdx)) {
    renderEditor();
    refreshOutputs();
  }
}

export function cancelBlockSort(event) {
  const sort = state.blockSort;
  if (!sort) return;
  if (event?.pointerId != null && event.pointerId !== sort.pointerId) return;
  cleanupBlockSort();
}

export function cleanupBlockSort() {
  const sort = state.blockSort;
  if (!sort) return;
  sort.source.classList.remove("is-sort-source");
  sort.blockList.classList.remove("is-sorting");
  sort.marker.remove();
  document.body.classList.remove("is-sorting-block");
  state.blockSort = null;
}

export function getSortableBlockCards(blockList) {
  return [...blockList.children].filter(el => el.matches?.(".block-card[data-block]"));
}

export function getPointerBlockInsertIndex(clientY, blockList, fromIdx) {
  const cards = getSortableBlockCards(blockList).filter(card => Number(card.dataset.block) !== fromIdx);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return Number(card.dataset.block);
  }
  return getSortableBlockCards(blockList).length;
}

export function placeBlockSortMarker(blockList, marker, insertIdx) {
  const cards = getSortableBlockCards(blockList).filter(card => !card.classList.contains("is-sort-source"));
  const beforeCard = cards.find(card => Number(card.dataset.block) >= insertIdx);
  blockList.insertBefore(marker, beforeCard || null);
}

export function moveBlockTo(sectionIdx, fromIdx, insertIdx) {
  const blocks = state.lesson.sections[sectionIdx]?.blocks;
  if (!Array.isArray(blocks) || fromIdx < 0 || fromIdx >= blocks.length) return false;
  insertIdx = Math.max(0, Math.min(insertIdx, blocks.length));
  if (fromIdx < insertIdx) insertIdx -= 1;
  if (fromIdx === insertIdx) return false;
  const [item] = blocks.splice(fromIdx, 1);
  blocks.splice(insertIdx, 0, item);
  return true;
}
