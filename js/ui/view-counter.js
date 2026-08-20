import { loadGroupClickStats, loadOverviewStats, loadPageVisitStats } from "../visitor-analytics.js";

const EMPTY_MARK = "–";

export function renderViewCounter() {
  return `
    <div class="curation-topbar__views" data-view-counter aria-live="polite">
      <span>오늘 <b data-view-today>${EMPTY_MARK}</b></span>
      <span>누적 <b data-view-total>${EMPTY_MARK}</b></span>
    </div>
  `;
}

export function renderResourceCount(viewKey, clickId) {
  return `<span class="bundle-card__count" data-resource-count data-view-key="${viewKey}" data-click-id="${clickId}">${EMPTY_MARK}</span>`;
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

  const [pages, clicks] = await Promise.all([loadPageVisitStats(), loadGroupClickStats()]);
  if (!pages.length && !clicks.length) return;

  const viewsByKey = new Map(pages.map(page => [page.key, page.views]));
  const clicksById = new Map(clicks.map(click => [click.groupId, click.totalClicks]));

  slots.forEach(slot => {
    if (!slot.isConnected) return;
    const viewKey = slot.dataset.viewKey;
    if (viewKey) {
      slot.textContent = `조회수 ${formatNumber(viewsByKey.get(viewKey) || 0)}`;
      slot.title = "booong 안에서 이 수업을 연 횟수";
      return;
    }
    slot.textContent = `조회수 ${formatNumber(clicksById.get(slot.dataset.clickId) || 0)}`;
    slot.title = "이 자료의 링크를 누른 횟수 (외부 사이트라 실제 조회수는 셀 수 없습니다)";
  });
}

function formatCount(value) {
  return `${formatNumber(value)}회`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}
