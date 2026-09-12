import { loadAnalyticsSnapshot, loadDailyLessonClickStats, loadDailyViewStats, loadOverviewStats, loadVisitorJourneyStats, loadWeeklyLessonClickStats } from "./visitor-analytics.js";
import { loadDashboardConfig } from "./dashboard-data.js";
import { summarizeAnalyticsInsights } from "./visitor-journeys.js";

const root = document.querySelector("#analytics-root");
const ANALYSIS_DESCRIPTIONS = {
  1: "각 자료를 한 번 이상 연 고유 브라우저 수입니다. 상위 3개 비율은 모든 자료별 고유 브라우저 합계에서 상위 3개가 차지하는 몫입니다.",
  2: "자료를 클릭한 브라우저마다 서로 다른 자료 수를 세어, 한 개만 연 경우와 두 개 이상 연 경우를 비교합니다.",
  3: "같은 브라우저가 누적으로 함께 클릭한 두 자료의 조합입니다. 클릭 순서나 같은 수업에서 사용했다는 뜻은 아닙니다.",
  4: "브라우저별로 기록된 최초 클릭 시각이 가장 빠른 자료를 집계합니다.",
  5: "대시보드 최초 방문 시각부터 첫 자료 클릭 시각까지의 중앙값입니다. 두 기록이 연결되는 브라우저만 포함합니다.",
  6: "같은 자료를 두 번 이상 클릭한 브라우저 수입니다. 구·신 자료 ID는 제목 기준으로 합칩니다.",
  7: "오늘을 제외한 최근 완료 3일의 클릭 수와 직전 3일의 클릭 수 차이입니다.",
  8: "수집된 날짜를 요일별로 묶어 하루 평균 열람 횟수를 비교합니다.",
  9: "클릭한 자료의 교육과정 과목·단원 태그를 기준으로 고유 브라우저를 집계합니다. 한 자료가 여러 과목에 포함될 수 있습니다.",
  10: "클릭한 자료를 게임과 수업 유형으로 나누고 각 유형의 고유 브라우저 수를 셉니다.",
  11: "대시보드 외 각 페이지를 한 번 이상 본 고유 브라우저 수입니다.",
  12: "제작자별 담당 자료를 하나 이상 연 고유 브라우저 수입니다. 공동 제작 자료는 해당 제작자 모두에 포함됩니다.",
};

async function render() {
  root.innerHTML = shell("데이터를 불러오는 중입니다.");
  try {
    const [overview, daily, dailyLessons, journey, weeklyLessons, catalogConfig, analytics] = await Promise.all([
      loadOverviewStats(), loadDailyViewStats(14), loadDailyLessonClickStats(14), loadVisitorJourneyStats(), loadWeeklyLessonClickStats(), loadDashboardConfig(), loadAnalyticsSnapshot(),
    ]);
    const catalog = catalogConfig.catalog?.resources || [];
    root.innerHTML = shell(renderDashboard({
      overview,
      daily,
      dailyLessons,
      journey,
      weeklyLessons,
      insights: summarizeAnalyticsInsights(analytics, catalog),
      makersByTitle: new Map(catalog.map(item => [item.title, item.makers || []])),
    }));
    root.querySelector("[data-refresh]")?.addEventListener("click", render);
    root.querySelectorAll("[data-daily-point]").forEach(button => button.addEventListener("click", () => showDailyLessons(root, dailyLessons[Number(button.dataset.dailyPoint)])));
    root.querySelector("[data-close-daily-dialog]")?.addEventListener("click", () => root.querySelector("[data-daily-dialog]")?.close());
  } catch (err) {
    root.innerHTML = shell(`<p class="analytics__notice">분석 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>`);
  }
}

function shell(content) {
  return `
    <div class="analytics__inner">
      <nav class="analytics__nav" aria-label="분석 페이지 이동">
        <a class="analytics__brand" href="about.html">BOOONG <small>VISITOR ANALYTICS</small></a>
        <a class="analytics__back" href="index.html">← 대시보드</a>
      </nav>
      ${content}
    </div>
  `;
}

function renderDashboard({ overview, daily, dailyLessons, journey, weeklyLessons, insights, makersByTitle }) {
  const dashboardVisitors = journey?.dashboardVisitors || 0;
  const clickedVisitors = journey?.dashboardClickVisitors || 0;
  return `
    <header class="analytics__hero">
      <div><p>BOOONG · LIVE READER MAP</p><h1>방문이 어디로<br><em>이어지는지</em></h1></div>
      <button type="button" data-refresh>새로고침 ↻</button>
    </header>

    <section class="analytics__kpis" aria-label="방문 요약">
      ${metric("전체 방문", journey?.uniqueVisitors || 0, "브라우저 기준 고유 방문")}
      ${metric("오늘 열람", overview?.todayViews || 0, "세션당 첫 페이지 열람")}
      ${metric("자료 클릭", clickedVisitors, `대시보드 방문 이력 중 ${formatRate(journey?.conversionRate)}`)}
      ${metric("누적 열람", overview?.totalViews || 0, "모든 페이지 세션 열람")}
    </section>

    <section class="analytics__flow" aria-labelledby="flow-title">
      <header><span>VISITOR FLOW</span><h2 id="flow-title">대시보드 방문 뒤, 자료를 여는 흐름</h2></header>
      <div class="analytics__steps">
        <div><b>01 · VISIT</b><strong>${format(dashboardVisitors)}</strong><span>대시보드를 본 방문자</span></div>
        <div><b>02 · OPEN</b><strong>${format(clickedVisitors)}</strong><span>자료를 연 브라우저</span></div>
        <div><b>03 · CONNECT</b><strong>${formatRate(journey?.conversionRate)}</strong><span>방문·자료 클릭 기록의 교집합</span></div>
      </div>
      <p>같은 브라우저가 대시보드를 방문한 뒤 수업 링크를 누른 경우만 연결합니다. 개인 식별값은 표시하지 않습니다.</p>
    </section>

    <div class="analytics__grid">
      <section class="analytics__panel" aria-labelledby="resource-title">
        <header><span>CLICKED LESSONS</span><h2 id="resource-title">ALL TIME</h2></header>
        ${renderResources(journey?.resources || [], makersByTitle)}
      </section>
      <section class="analytics__panel" aria-labelledby="weekly-lesson-title">
        <header><span>CLICKED LESSONS</span><h2 id="weekly-lesson-title">THIS WEEK</h2></header>
        ${renderWeeklyLessons(weeklyLessons, makersByTitle)}
      </section>
    </div>

    <section class="analytics__panel analytics__trend" aria-labelledby="trend-title">
      <header><span>14-DAY PULSE</span><h2 id="trend-title">최근 14일 열람</h2></header>
      ${renderLineChart(daily)}
    </section>
    ${renderAnalyses(insights, dashboardVisitors)}
    <dialog class="analytics__dialog" data-daily-dialog><button type="button" data-close-daily-dialog aria-label="닫기">×</button><div data-daily-dialog-content></div></dialog>
    <p class="analytics__updated">Firebase Realtime Database에서 실시간 집계 · ${new Date().toLocaleString("ko-KR")}</p>
  `;
}

function renderAnalyses(insights, dashboardVisitors) {
  const topPair = insights.pairs[0];
  const topFirst = insights.firstResources[0];
  const topRecent = insights.recent.resources[0];
  const topWeekday = insights.weekdays[0];
  const topSubject = insights.subjects[0];
  const topUnit = insights.units[0];
  const topPage = insights.pages[0];
  const topMaker = insights.makers[0];
  const observationDays = insights.weekdays.reduce((total, item) => total + item.days, 0);
  return `
    <section class="analytics__analysis" aria-labelledby="analysis-title">
      <header class="analytics__analysis-heading">
        <div><span>12 ANALYSES</span><h2 id="analysis-title">지금 데이터로 읽는 사용자 행동</h2></div>
        <p>브라우저 식별자 기준 · 동일 제목의 구·신 자료 ID 통합 · 인과관계가 아닌 관찰값</p>
      </header>
      <div class="analytics__analysis-grid">
        ${analysisCard(1, "자료별 도달과 집중도", formatRate(insights.concentrationRate), "상위 3개 자료 집중도", "자료별 고유 브라우저 합계를 분모로 계산", renderBars(insights.reach.slice(0, 5), item => item.title, item => item.visitors, value => `${format(value)}명`))}
        ${analysisCard(2, "사용자별 탐색 범위", formatRate(rate(insights.exploration.single, insights.exploration.visitors)), "한 자료만 연 브라우저", `평균 ${insights.exploration.average.toFixed(1)}개 · 2개 이상 ${format(insights.exploration.multiple)}명`, renderSplit("1개", insights.exploration.single, "2개 이상", insights.exploration.multiple))}
        ${analysisCard(3, "함께 연 자료", topPair ? `${format(topPair.count)}명` : "—", "가장 큰 공통 이용자", "누적 공통 클릭이며 이용 순서는 알 수 없음", renderBars(insights.pairs.slice(0, 5), item => `${item.first} + ${item.second}`, item => item.count, value => `${format(value)}명`))}
        ${analysisCard(4, "첫 클릭 자료", topFirst ? `${format(topFirst.visitors)}명` : "—", topFirst?.title || "첫 클릭 기록 없음", "각 브라우저의 가장 이른 자료 클릭 기준", renderBars(insights.firstResources.slice(0, 5), item => item.title, item => item.visitors, value => `${format(value)}명`))}
        ${analysisCard(5, "첫 방문에서 첫 클릭까지", formatDuration(insights.leadTime.medianMs), "소요 시간 중앙값", `연결 가능한 ${format(insights.leadTime.visitors)}명 중 당일 클릭 ${formatRate(insights.leadTime.sameDayRate)}`, renderSplit("당일", Math.round(insights.leadTime.visitors * insights.leadTime.sameDayRate), "이후", insights.leadTime.visitors - Math.round(insights.leadTime.visitors * insights.leadTime.sameDayRate)))}
        ${analysisCard(6, "반복 관심 자료", `${format(insights.repeat.visitors)}명`, "같은 자료를 두 번 이상 클릭", `다른 날짜에도 연 흔적 ${format(insights.repeat.crossDayVisitors)}명`, renderBars(insights.repeat.resources.slice(0, 5), item => item.title, item => item.repeated, value => `${format(value)}명`))}
        ${analysisCard(7, "최근 관심 변화", topRecent ? signed(topRecent.change) : "—", "최근 완료 3일 − 이전 3일", "일별 자료 클릭은 2026-09-04부터 수집", renderBars(insights.recent.resources.slice(0, 5), item => item.title, item => Math.abs(item.change), (_, item) => `${signed(item.change)}회`))}
        ${analysisCard(8, "요일별 활동", topWeekday ? `${topWeekday.weekday} ${topWeekday.average.toFixed(1)}회` : "—", "하루 평균 열람이 높은 요일", `${format(observationDays)}일의 관찰값이며 계절성 판단에는 짧음`, renderBars(insights.weekdays, item => `${item.weekday}요일`, item => item.average, value => `${value.toFixed(1)}회`))}
        ${analysisCard(9, "과목·단원별 관심", topSubject ? `${format(topSubject.visitors)}명` : "—", topSubject ? `${topSubject.label} 자료 도달` : "분류 없음", topUnit ? `상위 단원: ${topUnit.label.replace("::", " · ")} · ${format(topUnit.visitors)}명` : "단원 분류 없음", renderBars(insights.subjects.slice(0, 5), item => item.label, item => item.visitors, value => `${format(value)}명`))}
        ${analysisCard(10, "자료 유형별 관심", `${format(insights.types[0]?.visitors || 0)}명`, `${insights.types[0]?.label || "자료"} 유형 도달`, "한 브라우저가 여러 유형에 포함될 수 있음", renderBars(insights.types, item => item.label, item => item.visitors, value => `${format(value)}명`))}
        ${analysisCard(11, "페이지·도구 도달", topPage ? `${format(topPage.visitors)}명` : "—", topPage?.title || "페이지 기록 없음", `대시보드 방문 기록 ${format(dashboardVisitors)}명을 기준으로 비교`, renderBars(insights.pages.slice(0, 6), item => item.title, item => item.visitors, value => `${format(value)}명`))}
        ${analysisCard(12, "제작자별 도달", topMaker ? `${format(topMaker.visitors)}명` : "—", topMaker ? `${topMaker.label.toUpperCase()} 제작 자료` : "제작자 분류 없음", "공동 제작 포함, 제작자 안에서는 브라우저 중복 제거", renderBars(insights.makers.slice(0, 6), item => item.label.toUpperCase(), item => item.visitors, value => `${format(value)}명`))}
      </div>
    </section>
  `;
}

function analysisCard(number, title, value, label, note, body) {
  return `
    <article class="analytics__analysis-card" aria-labelledby="analysis-${number}">
      <header>
        <span>${String(number).padStart(2, "0")}</span><h3 id="analysis-${number}">${escape(title)}</h3>
        <button type="button" class="analytics__help" aria-label="${escape(title)} 통계 설명">
          <span aria-hidden="true">ⓘ</span><span role="tooltip">${escape(ANALYSIS_DESCRIPTIONS[number])}</span>
        </button>
      </header>
      <div class="analytics__analysis-lead"><strong>${escape(value)}</strong><span>${escape(label)}</span></div>
      ${body || ""}
      <p>${escape(note)}</p>
    </article>
  `;
}

function renderBars(items, getLabel, getValue, getDisplay) {
  if (!items.length) return "<p class=\"analytics__empty\">표시할 기록이 없습니다.</p>";
  const max = Math.max(...items.map(getValue), 1);
  return `<ol class="analytics__bars">${items.map(item => {
    const value = getValue(item);
    const label = escape(getLabel(item));
    return `<li><span class="analytics__bar-label" tabindex="0" data-label="${label}"><span>${label}</span></span><i aria-hidden="true"><b style="width:${Math.max(2, value / max * 100)}%"></b></i><strong>${escape(getDisplay(value, item))}</strong></li>`;
  }).join("")}</ol>`;
}

function renderSplit(firstLabel, firstValue, secondLabel, secondValue) {
  const total = firstValue + secondValue;
  return `<div class="analytics__split"><span style="width:${rate(firstValue, total) * 100}%">${escape(firstLabel)} ${format(firstValue)}</span><span>${escape(secondLabel)} ${format(secondValue)}</span></div>`;
}

function metric(label, value, note) {
  return `<article><span>${label}</span><strong>${format(value)}</strong><small>${note}</small></article>`;
}

function renderResources(resources, makersByTitle) {
  if (!resources.length) return "<p class=\"analytics__empty\">아직 수업 클릭 데이터가 없습니다.</p>";
  return `<ol class="analytics__list">${resources.slice(0, 6).map((item, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b><span><strong>${escape(item.title)}</strong><small class="analytics__makers">${renderMakers(item.title, makersByTitle)}</small></span><em>${format(item.visitors)}<small>명</small></em></li>`).join("")}</ol>`;
}

function renderWeeklyLessons(lessons, makersByTitle) {
  if (!lessons.length) return "<p class=\"analytics__empty\">이번 주 수업을 연 방문자가 없습니다.</p>";
  return `<ol class="analytics__list">${lessons.slice(0, 6).map((item, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b><span><strong>${escape(item.title)}</strong><small class="analytics__makers">${renderMakers(item.title, makersByTitle)}</small></span><em>${format(item.visitors)}<small>명</small></em></li>`).join("")}</ol>`;
}

function renderMakers(title, makersByTitle) {
  const makers = makersByTitle.get(title) || [];
  return makers.length ? `MADE BY ${makers.map(maker => `<b>${escape(maker)}</b>`).join("")}` : "MADE BY —";
}

function renderLineChart(daily) {
  if (!daily.length) return "<p class=\"analytics__empty\">표시할 열람 기록이 없습니다.</p>";
  const max = Math.max(1, ...daily.map(item => item.views));
  const roundedMax = Math.ceil(max / 4) * 4;
  const points = daily.map((item, index) => {
    const x = 72 + (index / Math.max(1, daily.length - 1)) * 918;
    const y = 216 - item.views / roundedMax * 200;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round(roundedMax * (4 - index) / 4));
  const average = Math.round(daily.reduce((sum, item) => sum + item.views, 0) / daily.length);
  return `
    <div class="analytics__chart-meta">
      <span>열람 횟수</span>
      <dl><div><dt>일평균</dt><dd>${format(average)}회</dd></div><div><dt>최고</dt><dd>${format(max)}회</dd></div></dl>
    </div>
    <div class="analytics__line-chart">
      <svg viewBox="0 0 1000 216" aria-hidden="true" preserveAspectRatio="none">
        <defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".14"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
        ${ticks.map(value => { const y = 216 - value / roundedMax * 200; return `<line x1="72" x2="990" y1="${y}" y2="${y}"/><text x="0" y="${y + 4}">${format(value)}</text>`; }).join("")}
        <polygon points="72,216 ${points} 990,216" />
        <polyline points="${points}" />
      </svg>
      ${daily.map((item, index) => `<button type="button" data-daily-point="${index}" style="--x:${index / Math.max(1, daily.length - 1)};--y:${1 - item.views / roundedMax}" aria-label="${escape(item.date)} 열람 ${format(item.views)}회, 수업 클릭 상세 보기" title="${escape(item.date)} · ${format(item.views)}회"></button>`).join("")}
      <div class="analytics__line-labels">${daily.map(item => `<small>${item.date.slice(5)}</small>`).join("")}</div>
    </div>
  `;
}

function showDailyLessons(root, daily) {
  const dialog = root.querySelector("[data-daily-dialog]");
  const content = root.querySelector("[data-daily-dialog-content]");
  if (!dialog || !content || !daily) return;
  const lessons = [...daily.lessons.reduce((map, item) => map.set(item.title, (map.get(item.title) || 0) + item.views), new Map())]
    .map(([title, views]) => ({ title, views }))
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title, "ko"));
  content.innerHTML = `
    <span>DAILY LESSON CLICKS</span><h2>${escape(daily.date)} 수업 클릭</h2>
    ${lessons.length ? `<ol>${lessons.slice(0, 5).map((item, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b><strong>${escape(item.title)}</strong><em>${format(item.views)}회</em></li>`).join("")}</ol>` : "<p>이 날짜의 수업별 클릭 기록은 없습니다.<br>일자별 기록은 2026-09-04부터 수집합니다.</p>"}
  `;
  dialog.showModal();
}

function format(value) { return Number(value || 0).toLocaleString("ko-KR"); }
function formatRate(value) { return `${Math.round((Number(value) || 0) * 100)}%`; }
function rate(value, total) { return total ? value / total : 0; }
function signed(value) { return `${value > 0 ? "+" : ""}${format(value)}`; }
function formatDuration(milliseconds) {
  if (!milliseconds) return "즉시";
  const minutes = milliseconds / 60000;
  if (minutes < 1) return "1분 이내";
  if (minutes < 60) return `${Math.round(minutes)}분`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}시간`;
  return `${(hours / 24).toFixed(1)}일`;
}
function escape(value) { return String(value || "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

render();
