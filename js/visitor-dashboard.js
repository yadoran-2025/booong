import { loadAnalyticsSnapshot } from "./visitor-analytics.js";
import { requireAdmin } from "./admin.js";
import { loadDashboardConfig } from "./dashboard-data.js";
import { summarizeDecisionAnalytics, summarizeResourceViewTrends, summarizeVisitorJourneys } from "./visitor-journeys.js";

const root = document.querySelector("#analytics-root");
const filters = { maker: "", type: "" };
let snapshot, catalog, stats, loadedAt;
let selectedKey = "";
let grouping = "subjects";
let sortBy = "visitors";

root.addEventListener("click", event => {
  if (event.target.closest("[data-refresh]")) render();
  const selection = event.target.closest("[data-select-resource]");
  if (selection) {
    selectResource(Number(selection.dataset.selectResource));
    if (selection.classList.contains("analytics__text-button")) {
      const title = root.querySelector(".analytics__selection-title h3");
      title?.focus({ preventScroll: true });
      title?.scrollIntoView({ block: "center" });
    }
  }
});
root.addEventListener("change", event => {
  if (event.target.matches("[data-filter]")) {
    filters[event.target.dataset.filter] = event.target.value;
    draw();
  }
  if (event.target.matches("[data-decision-resource]")) selectResource(Number(event.target.value));
  if (event.target.matches("[data-grouping]")) {
    grouping = event.target.value;
    root.querySelector("[data-curriculum-table]").innerHTML = renderCurriculumTable();
  }
  if (event.target.matches("[data-sort]")) {
    sortBy = event.target.value;
    root.querySelector("[data-resource-table]").innerHTML = renderResourceTable();
  }
});

async function render() {
  if (root.getAttribute("aria-busy") === "true") return;
  if (!await requireAdmin(root)) return;
  root.setAttribute("aria-busy", "true");
  if (!snapshot) root.innerHTML = shell('<p class="analytics__empty" role="status">자료의 흐름을 불러오는 중입니다.</p>');
  try {
    const [analytics, config] = await Promise.all([loadAnalyticsSnapshot(), loadDashboardConfig()]);
    snapshot = analytics;
    catalog = config.catalog?.resources || [];
    loadedAt = new Date();
    stats = summarizeDecisionAnalytics(snapshot, catalog, loadedAt.getTime(), filters);
    root.innerHTML = shell(`
      <header class="analytics__hero">
        <div><p class="analytics__eyebrow">BOOONG / RESOURCE INSIGHTS</p><h1>다음 자료를 위한<br><em>작은 단서들.</em></h1>
        <p class="analytics__intro">어떤 자료를 더 알리고, 다듬고, 새로 만들까요?</p></div>
        <button class="btn btn--secondary" type="button" data-refresh>새로고침 ↻</button>
      </header>
      <div class="analytics__filters">
        ${filterSelect("maker", "제작자", stats.options.makers)}
        ${filterSelect("type", "자료 유형", stats.options.types)}
        <p>필터는 아래 모든 핵심 분석에 적용됩니다.<br>도달·재열람은 누적, 클릭 변화는 완료된 7일 기준입니다.</p>
      </div>
      <div data-decisions></div>
      <details class="analytics__supplement"><summary>전체 서비스 방문 · 기존 장기 추이</summary>${renderSupplement()}</details>
      <details class="analytics__supplement"><summary>집계 기준과 읽는 방법</summary>
        <ul class="analytics__method">
          <li>고유 브라우저는 사람 수가 아닙니다. 같은 사람도 기기나 브라우저가 다르면 따로 집계됩니다.</li>
          <li>클릭은 자료 링크를 누른 기록입니다. 실제 수업 활용, 만족도, 카드 노출 대비 클릭률을 뜻하지 않습니다.</li>
          <li>재열람 비율은 누적 도달 브라우저 중 최초·최근 클릭의 한국 날짜가 다른 비율입니다. 공개 기간이 짧은 자료는 재열람 기회도 적습니다.</li>
          <li>최근 비교는 오늘을 제외한 한국 시간 7일과 그 직전 7일입니다. 날짜 전체 기록이 없으면 미확인으로 두고 해당 기간 합계와 증감을 표시하지 않습니다.</li>
          <li>자료 클릭 수집이 처음 확인된 날짜 이후, 페이지 기록은 있지만 자료 클릭이 없는 날짜는 0으로 간주합니다. 수집 장애까지 구분할 수는 없습니다.</li>
          <li>클릭 수는 탭 세션에서 자료별 첫 클릭을 합산합니다. 한 세션을 여러 날짜에 걸쳐 유지하면 첫 클릭 날짜에만 집계될 수 있습니다.</li>
          <li>구·신 자료 ID는 카탈로그와 제목으로 연결합니다. 동일 제목의 서로 다른 자료는 합쳐질 수 있습니다.</li>
          <li>함께 찾는 비율은 선택 자료를 연 브라우저를 분모로 계산합니다. 같은 방문에서의 이동 순서나 추천 효과를 의미하지 않습니다.</li>
        </ul>
      </details>
      <p class="analytics__updated">불러온 시각 · ${escape(loadedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))} KST</p>
    `);
    draw();
    const series = summarizeResourceViewTrends(snapshot);
    setupResourceTrend(root, series);
    setupLineChartPointer(root);
  } catch (error) {
    console.warn("Analytics dashboard load failed:", error);
    root.innerHTML = shell('<p class="analytics__notice" role="alert">분석 데이터를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.</p><button class="btn btn--secondary" type="button" data-refresh>다시 시도</button>');
  } finally {
    root.removeAttribute("aria-busy");
  }
}

function shell(content) {
  return `<div class="analytics__inner"><nav class="analytics__nav" aria-label="분석 페이지 이동"><a class="analytics__brand" href="index.html">BOOONG <small>방문 통계</small></a><a class="analytics__back" href="admin.html">← 관리자 메뉴</a></nav>${content}</div>`;
}

function filterSelect(key, label, options) {
  return `<label>${label}<select class="field__input" data-filter="${key}"><option value="">전체 ${label}</option>${options.map(value => `<option value="${escape(value)}"${filters[key] === value ? " selected" : ""}>${escape(key === "type" ? typeLabel(value) : value)}</option>`).join("")}</select></label>`;
}

function draw() {
  stats = summarizeDecisionAnalytics(snapshot, catalog, loadedAt.getTime(), filters);
  if (!stats.resources.some(item => item.key === selectedKey)) selectedKey = stats.resources[0]?.key || "";
  const { period, totals } = stats;
  root.querySelector("[data-decisions]").innerHTML = `
    <div class="analytics__period"><strong>${escape(period.currentLabel)}</strong><span>비교 ${escape(period.previousLabel)} · 오늘 제외 · KST</span></div>
    ${period.complete ? "" : `<p class="analytics__notice">14일 중 ${period.missingDates.length}일의 자료 클릭 수집을 확인할 수 없어 일부 합계·증감을 표시하지 않습니다. <span>미확인: ${period.missingDates.map(date => escape(date.slice(5))).join(", ")}</span></p>`}
    <section class="analytics__kpis" aria-label="선택 범위 요약">
      ${metric("최근 7일 자료 클릭", format(totals.current), "탭 세션에서 자료별 첫 클릭 합계")}
      ${metric("직전 7일 대비", signed(totals.change), "같은 길이의 완료 기간 비교")}
      ${metric("자료 도달 · 누적", format(totals.visitors), `고유 브라우저 · 자료 ${format(totals.resourceCount)}개`)}
    </section>
    <section class="analytics__highlights" aria-label="눈여겨볼 단서">${stats.highlights.length ? stats.highlights.map(item => `<article><h2>${escape(item.title)}</h2><p>${escape(item.body)}</p></article>`).join("") : '<p class="analytics__empty">아직 판단할 근거가 충분하지 않습니다. 자료별 기록을 먼저 살펴보세요.</p>'}</section>
    <section class="analytics__panel" aria-labelledby="map-title">
      ${heading("01 / REACH & RETURN", "더 알려볼 자료, 다시 찾는 자료", "map-title", "점 하나가 자료 하나입니다. 선택하면 최근 추이와 함께 찾는 자료를 볼 수 있습니다.")}
      <div class="analytics__map-layout">${renderScatter()}<aside class="analytics__map-guide"><h3>이렇게 읽어보세요</h3><p><strong>오른쪽으로 갈수록</strong><br>더 많은 브라우저에 도달했습니다.</p><p><strong>위로 갈수록</strong><br>다른 날짜에 다시 연 비율이 높습니다.</p><p>도달은 작아도 재열람 비율이 높은 자료는 더 소개해볼 후보입니다. 비율 옆 실제 브라우저 수도 함께 확인하세요.</p><p class="analytics__muted">점이 겹치면 아래 목록에서 선택할 수 있습니다. 누적 도달 0인 자료는 표에만 표시합니다.</p></aside></div>
      <label class="analytics__resource-picker">자세히 볼 자료<select class="field__input" data-decision-resource>${stats.resources.map((item, index) => `<option value="${index}"${item.key === selectedKey ? " selected" : ""}>${escape(item.title)} · ${format(item.visitors)} 브라우저</option>`).join("") || '<option value="">해당 자료 없음</option>'}</select></label>
      <div data-resource-detail aria-live="polite">${renderResourceDetail()}</div>
    </section>
    <div class="analytics__grid">
      <section class="analytics__panel" aria-labelledby="change-title">${heading("02 / MOMENTUM", "최근 관심은 어디로", "change-title", "클릭 수 변화와 전체 클릭에서 차지하는 비중을 함께 봅니다.")}${renderChanges()}</section>
      <section class="analytics__panel" aria-labelledby="explore-title">${heading("03 / EXPLORATION", "하나에서 다음 자료로", "explore-title", "선택 범위 안에서 한 브라우저가 누적으로 연 서로 다른 자료 수입니다.")}${renderExploration()}</section>
    </div>
    <section class="analytics__panel" aria-labelledby="curriculum-title">${heading("05 / CURRICULUM", "자료의 공급과 관심을 나란히", "curriculum-title", "자료가 적어도 관심이 있는 주제인지, 자료 수와 클릭을 함께 살펴봅니다.")}
      <label class="analytics__compact-control">분류<select class="field__input" data-grouping><option value="subjects"${grouping === "subjects" ? " selected" : ""}>과목별</option><option value="units"${grouping === "units" ? " selected" : ""}>단원별</option></select></label>
      <div data-curriculum-table>${renderCurriculumTable()}</div>
      <p class="analytics__chart-note">현재 카탈로그에 등록된 자료 기준. 여러 과목·단원에 속한 자료는 각각 포함됩니다. 노출량·공개 기간을 보정한 수요나 공급 부족을 뜻하지 않습니다.</p>
    </section>
    <section class="analytics__panel" aria-labelledby="table-title">${heading("RESOURCE INDEX", "모든 자료, 한눈에", "table-title", "자료명을 누르면 위의 상세 분석이 바뀝니다. — 는 미확인 또는 분모 없음입니다.")}
      <label class="analytics__compact-control">정렬<select class="field__input" data-sort>${[["visitors","누적 도달순"],["current","최근 클릭순"],["repeatRate","재열람 비율순"]].map(([value,label]) => `<option value="${value}"${sortBy === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
      <div data-resource-table>${renderResourceTable()}</div>
    </section>`;
}

function heading(kicker, title, id, note) {
  return `<header><span class="analytics__eyebrow">${kicker}</span><h2 id="${id}">${title}</h2><p>${note}</p></header>`;
}

function metric(label, value, note) {
  return `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function renderScatter() {
  const plotted = stats.resources.filter(item => item.visitors > 0);
  if (!plotted.length) return '<p class="analytics__empty">선택 범위에 자료 클릭 기록이 없습니다.</p>';
  const max = Math.max(...plotted.map(item => item.visitors), 1);
  return `<div class="analytics__scatter-wrap"><p class="analytics__axis-title">다른 날짜 재열람 비율 ↑</p><div class="analytics__scatter">
    ${[0, 50, 100].map(value => `<span class="analytics__y-tick" style="bottom:${value}%">${value}%</span>`).join("")}
    ${stats.resources.map((item, index) => item.visitors ? `<button type="button" class="analytics__dot" style="left:${item.visitors / max * 100}%;bottom:${item.repeatRate * 100}%" data-select-resource="${index}" aria-pressed="${item.key === selectedKey}" aria-label="${escape(item.title)}: ${format(item.visitors)} 브라우저, 다른 날짜 재열람 ${format(item.crossDayVisitors)}, 비율 ${formatRate(item.repeatRate)}" title="${escape(item.title)} · ${format(item.visitors)} 브라우저 · ${formatRate(item.repeatRate)}"><i></i></button>` : "").join("")}
    </div><div class="analytics__x-ticks"><span>0</span><span>${format(max / 2)}</span><span>${format(max)}</span></div><p class="analytics__axis-title analytics__axis-title--x">누적 도달 · 고유 브라우저 →</p></div>`;
}

function selectResource(index) {
  if (!stats.resources[index]) return;
  selectedKey = stats.resources[index].key;
  root.querySelector("[data-decision-resource]").value = String(index);
  root.querySelectorAll(".analytics__dot").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.selectResource) === index)));
  root.querySelector("[data-resource-detail]").innerHTML = renderResourceDetail();
}

function renderResourceDetail() {
  const item = stats.resources.find(resource => resource.key === selectedKey);
  if (!item) return '<p class="analytics__empty">필터에 맞는 자료가 없습니다.</p>';
  return `<div class="analytics__selection"><div class="analytics__selection-title"><span>${escape(typeLabel(item.type))} · ${escape(item.makers.join(", ") || "제작자 미분류")}</span><h3 tabindex="-1">${escape(item.title)}</h3></div>
    <div class="analytics__selection-stats"><span>누적 도달 <b>${format(item.visitors)}</b> 브라우저</span><span>다른 날짜 재열람 <b>${format(item.crossDayVisitors)} / ${format(item.visitors)}</b> · ${formatRate(item.repeatRate)}</span></div>
    <p class="analytics__chart-note">${item.visitors < 10 ? "표본 10 미만 · 비율로 자료의 우열을 판단하기에는 기록이 적습니다. " : ""}재열람은 누적 관찰값이며 공개 기간과 노출량을 보정하지 않았습니다.</p>
    <div class="analytics__detail-grid"><div><h4>최근 14일 클릭</h4>${renderDailyBars(item.daily)}<p class="analytics__chart-note">주말 포함 · 막대 선택 시 날짜별 수치 · ?는 수집 미확인</p></div>
      <div><span class="analytics__eyebrow">04 / TOGETHER</span><h4>이 자료와 함께 찾는 자료</h4>${item.pairs.length ? `<ol class="analytics__pairs">${item.pairs.slice(0, 5).map(pair => `<li><span>${escape(pair.title)}</span><strong>${formatRate(pair.rate)} <small>${format(pair.count)} / ${format(item.visitors)} 브라우저</small></strong></li>`).join("")}</ol>` : '<p class="analytics__empty">함께 클릭한 다른 자료가 없습니다.</p>'}<p class="analytics__chart-note">선택 자료를 연 브라우저 중 함께 연 비율입니다. 누적 공통 클릭이며 이동 순서나 추천 효과는 아닙니다.</p></div></div></div>`;
}

function renderDailyBars(days) {
  const max = Math.max(1, ...days.map(day => day.views || 0));
  return `<div class="analytics__daily-bars" aria-label="최근 14일 자료 클릭">${days.map(day => `<div class="analytics__daily-slot"><span tabindex="0" class="analytics__daily-bar${day.available ? "" : " is-missing"}" style="--height:${day.available ? day.views / max * 100 : 100}%" role="img" aria-label="${day.date} · ${day.available ? `${format(day.views)}회` : "수집 미확인"}" title="${day.date} · ${day.available ? `${format(day.views)}회` : "수집 미확인"}"><i>${day.available ? "" : "?"}</i><b>${day.available ? format(day.views) : "?"}</b></span><small>${day.date.slice(5).replace("-", "/")}</small></div>`).join("")}</div>`;
}

function renderChanges() {
  if (!stats.period.complete) return '<p class="analytics__empty">두 기간의 14일 기록이 모두 확인되면 비교를 표시합니다.</p>';
  const items = [...stats.resources].sort((a,b) => Math.abs(b.change) - Math.abs(a.change) || b.current - a.current).slice(0, 6);
  if (!items.length) return '<p class="analytics__empty">비교할 자료가 없습니다.</p>';
  return table(["자료", "직전 → 최근", "변화", "비중 변화"], items.map(item => `<tr><th scope="row">${escape(item.title)}</th><td>${format(item.previous)} → ${format(item.current)}</td><td>${signed(item.change)}</td><td>${percentagePoints(item.shareChange)}</td></tr>`), "최근 7일과 직전 7일의 자료별 클릭 변화") + '<p class="analytics__chart-note">변화 절댓값 상위 6개 · 비중 분모는 필터 범위의 전체 자료 클릭 합계입니다. +%p는 클릭 비중의 증가입니다.</p>';
}

function renderExploration() {
  const exploration = stats.exploration;
  if (!exploration.visitors) return '<p class="analytics__empty">탐색 범위를 계산할 클릭 기록이 없습니다.</p>';
  return `<p class="analytics__exploration-summary"><strong>${formatRate(exploration.multiple / exploration.visitors)}</strong>가 2개 이상 탐색<span>${format(exploration.multiple)} / ${format(exploration.visitors)} 브라우저 · 평균 ${exploration.average.toFixed(1)}개</span></p>
    <ol class="analytics__distribution">${exploration.distribution.map(item => `<li><span>${escape(item.label)}</span><i><b style="width:${item.visitors / exploration.visitors * 100}%"></b></i><strong>${format(item.visitors)}</strong></li>`).join("")}</ol><p class="analytics__chart-note">한 번의 방문에서 둘러본 개수가 아닌 누적 탐색 범위입니다. 클릭하지 않은 방문자는 포함하지 않습니다.</p>`;
}

function renderCurriculumTable() {
  return table([grouping === "units" ? "단원" : "과목", "자료 수", "최근 7일 클릭", "직전 대비"], stats[grouping].map(item => `<tr><th scope="row">${escape(item.label.replaceAll("::", " · "))}</th><td>${format(item.resourceCount)}</td><td>${format(item.current)}</td><td>${signed(item.change)}</td></tr>`), "과목·단원별 자료 공급과 클릭 관심");
}

function renderResourceTable() {
  const sorted = [...stats.resources].sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1) || a.title.localeCompare(b.title, "ko"));
  return table(["자료", "누적 도달", "다른 날짜 재열람", "최근 7일", "비중", "직전 대비"], sorted.map(item => `<tr><th scope="row"><button type="button" class="analytics__text-button" data-select-resource="${stats.resources.indexOf(item)}">${escape(item.title)}</button><small>${escape(typeLabel(item.type))} · ${escape(item.makers.join(", ") || "미분류")}</small></th><td>${format(item.visitors)}</td><td>${formatRate(item.repeatRate)}<small>${format(item.crossDayVisitors)} / ${format(item.visitors)} 브라우저</small></td><td>${format(item.current)}</td><td>${formatRate(item.currentShare)}</td><td>${signed(item.change)}</td></tr>`), "모든 자료 분석", "analytics__resource-table");
}

function table(headers, rows, label, className = "") {
  if (!rows.length) return '<p class="analytics__empty">표시할 자료가 없습니다.</p>';
  return `<div class="analytics__table-scroll" tabindex="0" role="region" aria-label="${label}"><table class="analytics__table ${className}"><caption class="sr-only">${label}</caption><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderSupplement() {
  const journey = summarizeVisitorJourneys(snapshot.pageVisitors, snapshot.groupClicks, snapshot.groupClickVisitors);
  return `<p class="analytics__chart-note">이 영역은 위 필터와 무관한 전체 서비스 기록입니다.</p><div class="analytics__supplement-metrics">${metric("누적 고유 브라우저", format(journey.uniqueVisitors), "페이지 방문·자료 클릭 기록의 합집합")}${metric("누적 페이지 열람", format(snapshot.totals?.views ?? 0), "페이지별 탭 세션 첫 열람 합계")}</div>${renderResourceTrend(summarizeResourceViewTrends(snapshot))}`;
}

function format(value) { return value == null ? "—" : Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 }); }
function formatRate(value) { return value == null ? "—" : `${(value * 100).toFixed(1)}%`; }
function signed(value) { return value == null ? "—" : `${value > 0 ? "+" : ""}${format(value)}`; }
function percentagePoints(value) { return value == null ? "—" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%p`; }
function typeLabel(value) { return value === "game" ? "게임" : "수업"; }
function escape(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function renderResourceTrend(series) {
  return `
    <section class="analytics__panel analytics__trend analytics__resource-trend" aria-labelledby="resource-trend-title">
      <header><span>RESOURCE VIEWS</span><h2 id="resource-trend-title">자료별 열람 추이</h2></header>
      <div class="analytics__trend-controls">
        <label>자료<select class="field__input" data-resource-select>${series.map((item, index) => `<option value="${index}">${escape(item.title)}</option>`).join("")}</select></label>
        <div role="group" aria-label="집계 단위">
          <button type="button" data-resource-grain="daily" aria-pressed="true">일별</button>
          <button type="button" data-resource-grain="weekly" aria-pressed="false">주별</button>
          <button type="button" data-resource-grain="monthly" aria-pressed="false">월별</button>
        </div>
      </div>
      <div data-resource-chart>${renderResourceLineChart(series[0])}</div>
      <p class="analytics__chart-note">자료를 연 세션의 첫 클릭을 집계합니다. 같은 제목의 구·신 자료 ID를 합칩니다. 일별은 기록된 평일만 표시하며, 누락 날짜는 연결됩니다. 이 보조 그래프로 기간 증감을 판단하지 마세요.</p>
    </section>
  `;
}

function setupResourceTrend(root, series) {
  const select = root.querySelector("[data-resource-select]");
  const chart = root.querySelector("[data-resource-chart]");
  const buttons = [...root.querySelectorAll("[data-resource-grain]")];
  if (!select || !chart) return;
  const updateChart = grain => {
    buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.resourceGrain === grain)));
    chart.innerHTML = renderResourceLineChart(series[Number(select.value)] || series[0], grain);
  };
  select.addEventListener("change", () => updateChart(buttons.find(button => button.getAttribute("aria-pressed") === "true")?.dataset.resourceGrain || "daily"));
  buttons.forEach(button => button.addEventListener("click", () => updateChart(button.dataset.resourceGrain)));
}

function setupLineChartPointer(root) {
  if (root.dataset.lineChartPointerReady) return;
  root.dataset.lineChartPointerReady = "true";
  const clear = () => root.querySelectorAll("[data-chart-point].is-active").forEach(point => point.classList.remove("is-active"));
  const activate = event => {
    const chart = event.target.closest(".analytics__line-chart");
    if (!chart) return;
    clear();
    const points = [...chart.querySelectorAll("[data-chart-point]")];
    if (!points.length) return;
    const first = points[0].getBoundingClientRect();
    const last = points.at(-1).getBoundingClientRect();
    const start = first.left + first.width / 2;
    const end = last.left + last.width / 2;
    const progress = end === start ? 0 : Math.max(0, Math.min(1, (event.clientX - start) / (end - start)));
    points[Math.round(progress * (points.length - 1))].classList.add("is-active");
  };

  root.addEventListener("pointermove", activate);
  root.addEventListener("pointerdown", event => event.target.closest(".analytics__line-chart") ? activate(event) : clear());
  root.addEventListener("pointerout", event => {
    const chart = event.target.closest(".analytics__line-chart");
    if (event.pointerType !== "touch" && chart && !chart.contains(event.relatedTarget)) {
      chart.querySelector("[data-chart-point].is-active")?.classList.remove("is-active");
    }
  });
}

function renderResourceLineChart(series, grain = "daily") {
  const points = (grain === "monthly" ? series.monthly : grain === "weekly" ? series.weekly : series.weekdays)
    .slice(grain === "monthly" ? -12 : grain === "weekly" ? -26 : -31);
  const range = points.length === 1 ? points[0].period : points.length ? `${points[0].period} – ${points.at(-1).period}` : "수집 기록 없음";
  return renderLineChart(points, {
    fillId: "resource-trend-fill",
    period: item => item.period,
    periodLabel: item => grain === "monthly" ? item.period : item.period.slice(5),
    pointLabel: item => `${series.title}, ${item.period}${grain === "weekly" ? " 시작 주" : ""}, 열람 ${format(item.views)}회`,
    tooltipLabel: item => `${item.period}${grain === "weekly" ? " 시작 주" : ""} · ${format(item.views)}회`,
    range,
    total: series.total,
    averageLabel: grain === "monthly" ? "월평균" : grain === "weekly" ? "주평균" : "일평균",
  });
}

function renderLineChart(daily, options = {}) {
  if (!daily.length) return "<p class=\"analytics__empty\">표시할 열람 기록이 없습니다.</p>";
  const period = options.period || (item => item.date);
  const periodLabel = options.periodLabel || (item => item.date.slice(5));
  const fillId = options.fillId || "trend-fill";
  const max = Math.max(1, ...daily.map(item => item.views));
  const roundedMax = Math.ceil(max / 4) * 4;
  const points = daily.map((item, index) => {
    const x = 72 + (daily.length === 1 ? .5 : index / (daily.length - 1)) * 918;
    const y = 216 - item.views / roundedMax * 200;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round(roundedMax * (4 - index) / 4));
  const average = Math.round(daily.reduce((sum, item) => sum + item.views, 0) / daily.length);
  const markers = daily.map((item, index) => {
    const x = daily.length === 1 ? .5 : index / (daily.length - 1);
    const label = options.pointLabel?.(item) || `${period(item)} 열람 ${format(item.views)}회, 수업 클릭 상세 보기`;
    const tooltip = options.tooltipLabel?.(item) || `${period(item)} · ${format(item.views)}회`;
    const common = `data-chart-point data-tooltip="${escape(tooltip)}" style="--x:${x};--y:${1 - item.views / roundedMax}" aria-label="${escape(label)}" title="${escape(label)}"`;
    return options.pointLabel
      ? `<span ${common} role="img" tabindex="0"><i aria-hidden="true"></i></span>`
      : `<button type="button" data-daily-point="${index}" ${common}><i aria-hidden="true"></i></button>`;
  }).join("");
  return `
    <div class="analytics__chart-meta">
      <span>${escape(options.range || "열람 횟수")}</span>
      <dl>${options.total === undefined ? "" : `<div><dt>누적</dt><dd>${format(options.total)}회</dd></div>`}<div><dt>${escape(options.averageLabel || "일평균")}</dt><dd>${format(average)}회</dd></div><div><dt>최고</dt><dd>${format(max)}회</dd></div></dl>
    </div>
    <div class="analytics__line-chart">
      <svg viewBox="0 0 1000 216" aria-hidden="true" preserveAspectRatio="none">
        <defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".14"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
        ${ticks.map(value => { const y = 216 - value / roundedMax * 200; return `<line x1="72" x2="990" y1="${y}" y2="${y}"/><text x="0" y="${y + 4}">${format(value)}</text>`; }).join("")}
        ${daily.length > 1 ? `<polygon style="fill:url(#${fillId})" points="72,216 ${points} 990,216" />` : ""}
        <polyline points="${points}" />
      </svg>
      ${markers}
      <div class="analytics__line-labels">${daily.map((item, index) => `<small class="${daily.length > 16 && index > 0 && index < daily.length - 1 && index % Math.ceil((daily.length - 1) / 6) ? "is-skipped" : ""}">${escape(periodLabel(item))}</small>`).join("")}</div>
    </div>
  `;
}


render();
