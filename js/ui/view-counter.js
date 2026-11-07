import { packIcon } from "./lesson-packs.js";
import { loadGroupClickStats, loadOverviewStats, loadPageVisitStats } from "../visitor-analytics.js";

const EMPTY_MARK = "–";

export function renderViewCounter() {
  return `
    <div class="curation-topbar__views" data-view-counter aria-live="polite">
      <span>today <b data-view-today>${EMPTY_MARK}</b></span>
      <span>total <b data-view-total>${EMPTY_MARK}</b></span>
    </div>
  `;
}

export function renderResourceCount(viewKey, clickId, compact = false) {
  if (compact) return `<span class="lesson-pack__stat" data-resource-count data-compact-count data-view-key="${viewKey}" data-click-id="${clickId}" aria-label="조회수 불러오는 중">${packIcon("view")}<span data-resource-count-value>–</span></span>`;
  return `<span class="bundle-card__count" data-resource-count data-view-key="${viewKey}" data-click-id="${clickId}">조회수 0</span>`;
}

export async function hydrateViewCounts(root) {
  await Promise.all([hydrateTopbar(root), hydrateResources(root)]);
}

async function hydrateTopbar(root) {
  const counter = root.querySelector("[data-view-counter]");
  if (!counter) return;

  const stats = await loadOverviewStats();
  if (!stats || !counter.isConnected) return;

  counter.querySelector("[data-view-today]").textContent = formatCount(stats.todayViews);
  counter.querySelector("[data-view-total]").textContent = formatCount(stats.totalViews);
}

async function hydrateResources(root) {
  const slots = [...root.querySelectorAll("[data-resource-count]")];
  if (!slots.length) return;

  let pages, clicks;
  try { [pages, clicks] = await Promise.all([loadPageVisitStats({ throwOnError: true }), loadGroupClickStats({ throwOnError: true })]); } catch { return; }

  const viewsByKey = new Map(pages.map(page => [page.key, page.views]));
  const clicksById = new Map(clicks.map(click => [click.groupId, click.views]));

  slots.forEach(slot => {
    if (!slot.isConnected) return;
    const viewKey = slot.dataset.viewKey;
    if (viewKey) {
      updateResourceCount(slot, viewsByKey.get(viewKey) || 0);
      slot.title = "booong 안에서 이 수업을 연 횟수";
      return;
    }
    updateResourceCount(slot, clicksById.get(slot.dataset.clickId) || 0);
    slot.title = "이 자료의 링크를 누른 횟수 (외부 사이트라 실제 조회수는 셀 수 없습니다)";
  });
}

function updateResourceCount(slot, value) {
  slot.dataset.viewCount = Number(value || 0);
  const label = `조회수 ${formatNumber(value)}`;
  const number = slot.querySelector?.("[data-resource-count-value]");
  if (number) { number.textContent = formatNumber(value); slot.setAttribute("aria-label", label); }
  else slot.textContent = label;
}

function formatCount(value) {
  return `${formatNumber(value)}회`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}
