import { parseCSV } from "../api.js";
import { escapeHtml } from "../utils.js";

const DASHBOARD_SHEET_URLS = {
  groups: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1091433397&single=true&output=csv",
  lessons: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=0&single=true&output=csv",
};

const SUBJECT_COLOR_PALETTE = [
  "#1B6BFF",
  "#FF8C1B",
  "#2E7D4F",
  "#8B5CF6",
  "#5A6372",
  "#C2410C",
  "#0F766E",
  "#BE185D",
];

const TYPE_COLORS = {
  lesson: { label: "수업", color: "#1B6BFF", bg: "#E6EEFF", text: "#0A2E7A" },
  game: { label: "게임", color: "#FF8C1B", bg: "#FFF3E6", text: "#7A3A0A" },
  tool: { label: "도구", color: "#5A6372", bg: "#F4F6FA", text: "#3A4455" },
  notice: { label: "공지", color: "#2E7D4F", bg: "#EAF5EE", text: "#16402A" },
};

const SCHOOL_ORDER = ["초등학교", "중학교", "고등학교", "대학교", "기타"];

/**
 * 대시보드 메인 화면 렌더링
 */
export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.background = "";

  const config = await loadDashboardConfig();

  const state = {
    noticeIndex: 0,
    openPanels: new Set(),
      filters: {
      kind: "",
      school: "",
      subject: "",
    },
  };

  const container = document.createElement("div");
  container.className = "dashboard";
  container.innerHTML = `
    <div class="dashboard__top-nav">
      <a class="dashboard__ds-link" href="https://yadoran-2025.github.io/booong-design-system/" target="_blank" rel="noopener">DESIGN SYSTEM</a>
      <a class="dashboard__about-link" href="about.html">ABOUT US</a>
    </div>
  `;

  const inner = document.createElement("div");
  inner.className = "dashboard__inner";
  container.appendChild(inner);
  document.body.appendChild(container);

  initializeOpenPanels(config, state);
  renderDashboard(inner, config, state);
}

export async function loadDashboardConfig() {
  let config = { dashboard: {}, groups: [], games: [], tools: [], notices: [] };

  try {
    const res = await fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" });
    if (res.ok) config = await res.json();
  } catch (err) {
    console.error("대시보드 설정 로드 실패:", err);
  }

  try {
    const sheetGroups = await loadSheetLessonGroups();
    if (sheetGroups.length) {
      config = {
        ...config,
        groups: sheetGroups,
        games: [],
      };
    }
  } catch (err) {
    console.warn("구글 시트 수업 목록 로드 실패, lessons/index.json을 사용합니다:", err);
  }

  return config;
}

async function loadSheetLessonGroups() {
  const [groupText, lessonText] = await Promise.all([
    fetchSheetText(DASHBOARD_SHEET_URLS.groups),
    fetchSheetText(DASHBOARD_SHEET_URLS.lessons),
  ]);
  const groupRows = csvToObjects(groupText);
  const lessonRows = csvToObjects(lessonText);
  return buildLessonGroups(groupRows, lessonRows);
}

async function fetchSheetText(url) {
  const res = await fetch(`${url}&_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function csvToObjects(text) {
  const rows = parseCSV(text).filter(row => row.some(cell => String(cell || "").trim()));
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map(row => {
    const out = {};
    headers.forEach((header, index) => {
      if (!header) return;
      out[header] = normalizeSheetText(row[index] || "");
    });
    return out;
  });
}

function buildLessonGroups(groupRows, lessonRows) {
  const publishedLessons = lessonRows
    .filter(row => row.lesson_id && row.group_id && isPublished(row.published))
    .sort(compareByOrder)
    .map(row => ({
      id: row.lesson_id,
      groupId: row.group_id,
      label: row.label || "차시",
      title: row.lesson_title || "수업",
      desc: row.desc || "",
      jsonPath: row.json_path || "",
      order: parseOrder(row.order),
    }));

  const lessonsByGroup = publishedLessons.reduce((acc, lesson) => {
    if (!acc[lesson.groupId]) acc[lesson.groupId] = [];
    return acc;
  }, {});

  publishedLessons.forEach(lesson => {
    if (!lessonsByGroup[lesson.groupId]) lessonsByGroup[lesson.groupId] = [];
    lessonsByGroup[lesson.groupId].push(pruneEmpty({
      id: lesson.id,
      label: lesson.label,
      title: lesson.title,
      desc: lesson.desc,
      link: getLessonLink(lesson),
      jsonPath: lesson.jsonPath,
    }));
  });

  return groupRows
    .filter(row => row.group_id && isPublished(row.published))
    .sort(compareByOrder)
    .map(row => {
      const kind = normalizeKind(row.kind);
      const lessons = lessonsByGroup[row.group_id] || [];
      return pruneEmpty({
        id: row.group_id,
        kind,
        discipline: row.discipline,
        subject: row.subject,
        school: row.school,
        title: row.group_title || (kind === "game" ? "게임" : "수업"),
        desc: row.desc || "",
        tag: kind === "game" ? "게임" : "",
        link: row.game_link || row.main_link || "",
        worksheet: row.worksheet_link || "",
        zeroSession: kind === "lesson" ? {
          label: "0차시",
          title: "지도안 및 심화자료",
          desc: "수업 지도안과 확장 읽기 자료",
          link: row.teacher_link || "",
        } : null,
        lessons: kind === "lesson" ? lessons : [],
      });
    });
}

function getLessonLink(lesson) {
  if (!lesson.jsonPath) return "";
  const match = lesson.jsonPath.match(/(?:^|\/)([^/]+)\.json$/i);
  return match ? `?lesson=${encodeURIComponent(match[1])}` : "";
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeSheetText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function isPublished(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !["false", "0", "no", "n", "hidden", "draft", "비공개"].includes(normalized);
}

function compareByOrder(a, b) {
  return parseOrder(a.order) - parseOrder(b.order);
}

function parseOrder(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function pruneEmpty(value) {
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    if (child === "" || child == null) return;
    if (Array.isArray(child) && !child.length) return;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const pruned = pruneEmpty(child);
      if (Object.keys(pruned).length) out[key] = pruned;
      return;
    }
    out[key] = child;
  });
  return out;
}

function initializeOpenPanels(config, state) {
  getSchools(config.groups || [], false).forEach(school => state.openPanels.add(`lesson:${school}`));
  getSchools(config.games || [], true).forEach(school => state.openPanels.add(`game:${school}`));
}

function renderDashboard(root, config, state) {
  root.innerHTML = "";
  root.appendChild(renderHeader(config.dashboard || {}));

  const notices = Array.isArray(config.notices) ? config.notices : [];
  root.appendChild(renderNoticeBanner(notices, state));

  const tools = Array.isArray(config.tools) ? config.tools : [];
  if (tools.length) root.appendChild(renderTools(tools));

  const items = mergeDashboardItems(config.groups, config.games);
  normalizeFilterState(items, state);
  if (items.length) {
    const filteredItems = getFilteredDashboardItems(items, state.filters);
    root.appendChild(renderPanelSection({
      title: "수업",
      type: "content",
      accent: TYPE_COLORS.lesson.color,
      items: filteredItems,
      disciplines: getDisciplineOrder(items, true),
      schools: getSchools(filteredItems, true),
      state,
      controls: renderContentFilterbar(items, filteredItems, state.filters),
      empty: "조건에 맞는 항목이 없습니다.",
    }));
  }

  bindDashboardEvents(root, config, state);
}

function mergeDashboardItems(groups = [], games = []) {
  const normalizedGroups = Array.isArray(groups) ? groups.map(item => ({
    ...item,
    kind: normalizeKind(item.kind),
  })) : [];
  const groupIds = new Set(normalizedGroups.map(item => item.id).filter(Boolean));
  const legacyGames = (Array.isArray(games) ? games : [])
    .filter(game => game.id && !groupIds.has(game.id))
    .map(game => pruneEmpty({
      ...game,
      kind: "game",
      school: game.school || "기타",
      subject: game.subject || "미분류",
      discipline: game.discipline || game.subject || "미분류",
    }));
  return [...normalizedGroups, ...legacyGames];
}

function normalizeFilterState(items, state) {
  const kinds = getKinds(items);
  if (state.filters.kind && !kinds.includes(state.filters.kind)) state.filters.kind = "";

  const kindScope = state.filters.kind
    ? items.filter(item => normalizeKind(item.kind) === state.filters.kind)
    : items;
  const schools = getSchools(kindScope, true);
  if (state.filters.school && !schools.includes(state.filters.school)) state.filters.school = "";

  const subjectScope = kindScope.filter(item => {
    if (state.filters.school && !getItemSchools(item, true).includes(state.filters.school)) return false;
    return true;
  });
  const subjects = getSubjectOrder(subjectScope, true);
  if (state.filters.subject && !subjects.includes(state.filters.subject)) state.filters.subject = "";
}

function renderHeader(dashboard) {
  const header = document.createElement("header");
  header.className = "dashboard__header";
  header.innerHTML = `
    <div class="dashboard__logo" aria-hidden="true">${getLogoHTML(dashboard.logo)}</div>
    <div class="dashboard__header-copy">
      <h1 class="dashboard__title">${escapeHtml(dashboard.title || "사회교육공동체 BOOONG")}</h1>
      <p class="dashboard__subtitle">${formatDashboardText(dashboard.subtitle || "스마트 수업 프리젠터")}</p>
      ${dashboard.source ? `<p class="dashboard__source">— ${escapeHtml(dashboard.source)}</p>` : ""}
    </div>
  `;
  return header;
}

function renderNoticeBanner(notices, state) {
  const current = notices[Math.min(state.noticeIndex, notices.length - 1)] || {
    title: "등록된 공지사항이 없습니다.",
    desc: "새 소식이 생기면 이곳에 표시됩니다.",
  };
  const href = current.link ? escapeAttr(current.link) : "";
  const banner = document.createElement("div");
  banner.className = "dashboard-notice";
  const body = `
    <span class="dashboard-notice__title">${escapeHtml(current.title || "공지")}</span>
    ${current.desc ? `<span class="dashboard-notice__desc">${escapeHtml(current.desc)}</span>` : ""}
  `;
  banner.innerHTML = `
    <span class="dashboard-notice__tag">공지사항</span>
    ${href ? `<a class="dashboard-notice__body" href="${href}">${body}</a>` : `<span class="dashboard-notice__body">${body}</span>`}
    ${notices.length > 1 ? `
      <span class="dashboard-notice__dots" aria-label="공지 선택">
        ${notices.map((_, index) => `
          <button
            type="button"
            class="dashboard-notice__dot ${index === state.noticeIndex ? "is-active" : ""}"
            data-notice-index="${index}"
            aria-label="${index + 1}번째 공지 보기"
          ></button>
        `).join("")}
      </span>
    ` : ""}
  `;
  return banner;
}

function renderTools(tools) {
  const bngTools = tools.filter(tool => ["block-guide", "lesson-author"].includes(tool.id));
  const visibleTools = tools.filter(tool => !["block-guide", "lesson-author"].includes(tool.id));
  const toolCards = [
    ...visibleTools.slice(0, 1).map(renderToolCard),
    bngTools.length ? renderToolGroup(bngTools) : "",
    ...visibleTools.slice(1).map(renderToolCard),
  ].filter(Boolean);

  const section = document.createElement("section");
  section.className = "dashboard__section dashboard__section--tools";
  section.innerHTML = `
    ${renderSectionTitle("도구", TYPE_COLORS.tool.color)}
    <div class="dashboard-tools">
      ${toolCards.join("")}
    </div>
  `;
  return section;
}

function renderContentFilterbar(items, filteredItems, filters) {
  const kindScope = filters.kind
    ? items.filter(item => normalizeKind(item.kind) === filters.kind)
    : items;
  const schools = getSchools(kindScope, true);
  const subjectScope = kindScope.filter(item => {
    if (filters.school && !getItemSchools(item, true).includes(filters.school)) return false;
    return true;
  });
  const subjects = getSubjectOrder(subjectScope, true);

  const kindButtons = renderFilterButtons({
    values: getKinds(items),
    selected: filters.kind,
    filter: "kind",
    allLabel: "전체",
    labelForValue: getKindLabel,
  });
  const schoolButtons = renderFilterButtons({
    values: schools,
    selected: filters.school,
    filter: "school",
    allLabel: "전체",
  });
  const subjectButtons = renderFilterButtons({
    values: subjects,
    selected: filters.subject,
    filter: "subject",
    allLabel: "전체",
  });
  const countText = `${filteredItems.length}개`;

  return `
    <div class="dashboard-filterbar">
      <div class="dashboard-filterbar__field">
        <span class="dashboard-filterbar__label">유형</span>
        <div class="dashboard-filterbar__buttons" role="group" aria-label="유형">
          ${kindButtons}
        </div>
      </div>
      <div class="dashboard-filterbar__field">
        <span class="dashboard-filterbar__label">학교급</span>
        <div class="dashboard-filterbar__buttons" role="group" aria-label="학교급">
          ${schoolButtons}
       </div>
      </div>
      <div class="dashboard-filterbar__field">
        <span class="dashboard-filterbar__label">과목</span>
        <div class="dashboard-filterbar__buttons" role="group" aria-label="과목">
          ${subjectButtons}
        </div>
      </div>
      <span class="dashboard-filterbar__count">${escapeHtml(countText)}</span>
    </div>
  `;
}

function renderFilterButtons({ values, selected, filter, allLabel, labelForValue = value => value }) {
  return [
    renderFilterButton({ label: allLabel, value: "", selected: !selected, filter }),
    ...values.map(value => renderFilterButton({ label: labelForValue(value), value, selected: value === selected, filter })),
  ].join("");
}

function renderFilterButton({ label, value, selected, filter }) {
  return `
    <button
      class="dashboard-filterbar__button ${selected ? "is-active" : ""}"
      type="button"
      data-filter="${escapeAttr(filter)}"
      data-filter-value="${escapeAttr(value)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function getFilteredDashboardItems(items, filters) {
  return items.filter(item => {
    const kind = normalizeKind(item.kind);
    const schools = getItemSchools(item, true);
    const subject = normalizeSubject(item.subject, true);
    if (filters.kind && kind !== filters.kind) return false;
    if (filters.school && !schools.includes(filters.school)) return false;
    if (filters.subject && subject !== filters.subject) return false;
    return true;
  });
}

function renderToolCard(tool) {
  return `
    <a class="dashboard-tool" href="${escapeAttr(tool.link || "#")}">
      <span class="dashboard-tool__body">
        <span class="dashboard-tool__title">${escapeHtml(tool.title || "도구")}</span>
        <span class="dashboard-tool__desc">${escapeHtml(tool.desc || "")}</span>
      </span>
      <span class="dashboard-tool__arrow" aria-hidden="true">→</span>
    </a>
  `;
}

function renderToolGroup(tools) {
  return `
    <article class="dashboard-tool dashboard-tool--group">
      <div class="dashboard-tool__summary">
        <span class="dashboard-tool__body">
          <span class="dashboard-tool__title">BNG LANG</span>
          <span class="dashboard-tool__desc">설명서와 슬라이드 에디터를 한 곳에서 엽니다.</span>
        </span>
        <span class="dashboard-tool__arrow dashboard-tool__arrow--dropdown" aria-hidden="true">⌄</span>
      </div>
      <div class="dash-card__links dashboard-tool__links">
        ${tools.map(tool => `
          <a class="lesson-sub-card dashboard-tool-sub-card" href="${escapeAttr(tool.link || "#")}">
            <span class="lesson-sub-card__label">${escapeHtml(tool.tag || "도구")}</span>
            <span class="lesson-sub-card__title">${escapeHtml(getToolGroupTitle(tool))}</span>
            <span class="lesson-sub-card__arrow" aria-hidden="true">→</span>
          </a>
        `).join("")}
      </div>
    </article>
  `;
}

function getToolGroupTitle(tool) {
  if (tool.id === "block-guide") return "붕랭 설명서";
  if (tool.id === "lesson-author") return "슬라이드 에디터";
  return tool.title || "BNG LANG";
}

function renderPanelSection({ title, type, accent, items, disciplines, schools, state, controls = "", empty = "" }) {
  const section = document.createElement("section");
  section.className = `dashboard__section dashboard__section--${type}`;
  section.innerHTML = `
    <div class="dashboard-section-head">
      ${renderSectionTitle(title, accent)}
      ${controls}
    </div>
    ${items.length ? `
      <div class="dashboard-panels">
        ${schools.map(school => renderSchoolPanel({ type, school, disciplines, items, state })).join("")}
      </div>
    ` : `<div class="dashboard-empty-results">${escapeHtml(empty || "표시할 항목이 없습니다.")}</div>`}
  `;
  return section;
}

function renderSchoolPanel({ type, school, disciplines, items, state }) {
  const panelKey = `${type}:${school}`;
  const isOpen = state.openPanels.has(panelKey);
  const schoolItems = items.filter(item => getItemSchools(item, true).includes(school));
  const disciplineMap = disciplines.reduce((acc, discipline) => {
    acc[discipline] = schoolItems.filter(item => normalizeDiscipline(item.discipline, true) === discipline);
    return acc;
  }, {});

  return `
    <article class="dashboard-panel ${isOpen ? "is-open" : ""}" data-panel-key="${escapeAttr(panelKey)}">
      <button class="dashboard-panel__toggle" type="button" data-panel-toggle="${escapeAttr(panelKey)}" aria-expanded="${isOpen ? "true" : "false"}">
        <span class="dashboard-panel__school">${escapeHtml(school)}</span>
        <span class="dashboard-panel__count">${schoolItems.length}개</span>
        <span class="dashboard-panel__chevron" aria-hidden="true">▾</span>
      </button>
      <div class="dashboard-panel__body" ${isOpen ? "" : "hidden"}>
        <div class="dashboard-discipline-grid" style="--discipline-count: ${disciplines.length};">
          ${disciplines.map((discipline, index) => renderDisciplineBlock(discipline, disciplineMap[discipline] || [], type, index)).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderDisciplineBlock(discipline, items, type, index) {
  return `
    <div class="dashboard-discipline">
      ${renderDisciplineHeader(discipline, items.length, index)}
      ${renderDisciplineColumn(discipline, items, type)}
    </div>
  `;
}

function renderDisciplineHeader(discipline, count, index) {
  const color = getDisciplineColor(index);
  return `
    <div class="dashboard-discipline-head">
      <span class="dashboard-discipline-head__dot" style="--discipline-color: ${escapeAttr(color)};"></span>
      <span class="dashboard-discipline-head__label">${escapeHtml(discipline)}</span>
      <span class="dashboard-discipline-head__count">${count}</span>
    </div>
  `;
}

function renderDisciplineColumn(discipline, items, type) {
  return `
    <div class="dashboard-discipline-column ${items.length ? "" : "is-empty"}" aria-label="${escapeAttr(discipline)} 항목">
      ${items.length ? items.map(renderDashboardItemCard).join("") : `<span class="dashboard-empty">—</span>`}
    </div>
  `;
}

function renderDashboardItemCard(item) {
  return normalizeKind(item.kind) === "game" ? renderGameCard(item) : renderLessonGroup(item);
}

function renderLessonGroup(group) {
  const lessons = Array.isArray(group.lessons) ? group.lessons : [];
  const zeroSession = normalizeZeroSession(group.zeroSession);
  const lessonLinks = [zeroSession, ...lessons];
  return `
    <article class="dash-card dash-card--lesson">
      <div class="dash-card__meta">
        <span class="dash-tag">${escapeHtml(group.school || "학교급")}</span>
        ${group.subject ? `<span class="dash-tag dash-tag--soft">${escapeHtml(group.subject)}</span>` : ""}
        <span class="dash-tag dash-tag--soft">${lessons.length}차시</span>
      </div>
      <h3 class="dash-card__title">${formatDashboardText(group.title || "수업")}</h3>
      <p class="dash-card__desc">${formatDashboardText(group.desc || "")}</p>
      <div class="dash-card__links">
        ${lessonLinks.map(renderLessonSubCard).join("")}
      </div>
    </article>
  `;
}

function normalizeZeroSession(zeroSession) {
  return {
    label: zeroSession?.label || "0차시",
    title: zeroSession?.title || "지도안 및 심화자료",
    desc: zeroSession?.desc || "수업 지도안과 확장 읽기 자료",
    link: zeroSession?.link || "",
    isZeroSession: true,
  };
}

function renderLessonSubCard(lesson) {
  const href = lesson.link || (lesson.id ? `?lesson=${encodeURIComponent(lesson.id)}` : "");
  const isDisabled = !href;
  const isExternal = /^https?:\/\//i.test(href);
  const classes = [
    "lesson-sub-card",
    lesson.isZeroSession ? "lesson-sub-card--zero" : "",
    isDisabled ? "is-disabled" : "",
  ].filter(Boolean).join(" ");
  const label = escapeHtml(lesson.label || "차시");
  const title = formatDashboardText(lesson.title || "수업 열기");
  const status = isDisabled ? `<span class="lesson-sub-card__status">준비 중</span>` : `<span class="lesson-sub-card__arrow" aria-hidden="true">→</span>`;
  const attrs = [
    `class="${classes}"`,
    isDisabled ? `aria-disabled="true"` : `href="${escapeAttr(href)}"`,
    isExternal ? `target="_blank" rel="noopener"` : "",
  ].filter(Boolean).join(" ");

  return `
    <a ${attrs}>
      <span class="lesson-sub-card__label">${label}</span>
      <span class="lesson-sub-card__title">${title}</span>
      ${status}
    </a>
  `;
}

function renderGameCard(game) {
  const href = game.link || "";
  const worksheetHref = getGameWorksheetHref(game);
  const hasWorksheet = Boolean(game.worksheet || game.worksheetLink);
  const gameLinkAttrs = href
    ? `href="${escapeAttr(href)}" target="_blank" rel="noopener"`
    : `aria-disabled="true"`;
  return `
    <article class="dash-card dash-card--game">
      <div class="dash-card__meta">
        <span class="dash-tag dash-tag--game">${escapeHtml(game.tag || "게임")}</span>
        ${game.school ? `<span class="dash-tag">${escapeHtml(game.school)}</span>` : ""}
        ${game.subject ? `<span class="dash-tag dash-tag--soft">${escapeHtml(game.subject)}</span>` : ""}
        ${hasWorksheet ? `<span class="dash-tag dash-tag--soft">학습지</span>` : ""}
      </div>
      <h3 class="dash-card__title">${formatDashboardText(game.title || "게임")}</h3>
      <p class="dash-card__desc">${formatDashboardText(game.desc || "")}</p>
      <span class="dash-card__footer">게임 도구 <span class="dash-card__arrow" aria-hidden="true">→</span></span>
      <div class="dash-card__links dash-card__links--game">
        <a class="lesson-sub-card dashboard-game-sub-card ${href ? "" : "is-disabled"}" ${gameLinkAttrs}>
          <span class="lesson-sub-card__label">게임</span>
          <span class="lesson-sub-card__title">게임 열기</span>
          ${href ? `<span class="lesson-sub-card__arrow" aria-hidden="true">→</span>` : `<span class="lesson-sub-card__status">준비 중</span>`}
        </a>
        ${hasWorksheet ? `<a class="lesson-sub-card dashboard-game-sub-card lesson-sub-card--zero" href="${escapeAttr(worksheetHref)}">
          <span class="lesson-sub-card__label">학습지</span>
          <span class="lesson-sub-card__title">학습지 열기</span>
          <span class="lesson-sub-card__arrow" aria-hidden="true">→</span>
        </a>` : ""}
      </div>
    </article>
  `;
}

function getDisciplineColor(index) {
  return SUBJECT_COLOR_PALETTE[index % SUBJECT_COLOR_PALETTE.length];
}

function getGameWorksheetHref(game) {
  if (game.worksheetLink) return game.worksheetLink;
  if (game.worksheet && /^https?:\/\//i.test(game.worksheet)) return game.worksheet;
  const params = new URLSearchParams();
  params.set("game", game.id || "");
  if (game.worksheet) params.set("worksheet", game.worksheet);
  return `worksheet-maker.html?${params.toString()}`;
}

function bindDashboardEvents(root, config, state) {
  root.querySelectorAll("[data-filter]").forEach(control => {
    control.addEventListener("click", () => {
      const key = control.dataset.filter;
      if (!key) return;
      state.filters[key] = control.dataset.filterValue || "";
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-panel-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.panelToggle;
      if (!key) return;
      if (state.openPanels.has(key)) state.openPanels.delete(key);
      else state.openPanels.add(key);
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-notice-index]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      state.noticeIndex = Number(button.dataset.noticeIndex) || 0;
      renderDashboard(root, config, state);
    });
  });
}

function renderSectionTitle(label, color) {
  return `
    <h2 class="dashboard__section-title" style="--section-color: ${escapeAttr(color)};">
      ${escapeHtml(label)}
    </h2>
  `;
}

function getLogoHTML(logo) {
  if (logo && logo !== "scooter-pictogram") return escapeHtml(logo);
  return `
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="6" cy="18" r="2.5"></circle>
      <circle cx="18" cy="18" r="2.5"></circle>
      <path d="M6 15.5V11l2-2h3.5l1.5 1.5v5"></path>
      <path d="M10 9V5h3"></path>
    </svg>
  `;
}

function getSubjectOrder(items = [], useFallback) {
  const discovered = items.map(item => normalizeSubject(item.subject, useFallback));
  return unique(discovered).filter(Boolean);
}

function getDisciplineOrder(items = [], useFallback) {
  const discovered = items.map(item => normalizeDiscipline(item.discipline, useFallback));
  return unique(discovered).filter(Boolean);
}

function getKinds(items = []) {
  return unique(items.map(item => normalizeKind(item.kind))).filter(Boolean);
}

function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return value === "game" ? "game" : "lesson";
}

function getKindLabel(kind) {
  return normalizeKind(kind) === "game" ? "게임" : "수업";
}

function getSchools(items = [], useFallback) {
  return sortSchools(unique(items.flatMap(item => getItemSchools(item, useFallback))).filter(Boolean));
}

function sortSchools(schools) {
  return [...schools].sort((a, b) => {
    const aIndex = SCHOOL_ORDER.indexOf(a);
    const bIndex = SCHOOL_ORDER.indexOf(b);
    const aKnown = aIndex >= 0;
    const bKnown = bIndex >= 0;
    if (aKnown && bKnown) return aIndex - bIndex;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return a.localeCompare(b, "ko");
  });
}

function getItemSchools(item, useFallback) {
  const schools = splitList(item?.school).map(value => normalizeSchool(value, false)).filter(Boolean);
  if (schools.length) return schools;
  const fallback = normalizeSchool("", useFallback);
  return fallback ? [fallback] : [];
}

function normalizeSchool(school, useFallback) {
  const value = String(school || "").trim();
  return value || (useFallback ? "기타" : "");
}

function normalizeSubject(subject, useFallback) {
  const value = String(subject || "").trim();
  return value || (useFallback ? "미분류" : "");
}

function normalizeDiscipline(discipline, useFallback) {
  const value = String(discipline || "").trim();
  return value || (useFallback ? "미분류" : "");
}

function splitList(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function formatDashboardText(value) {
  return escapeHtml(String(value ?? ""))
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\r?\n/g, "<br>");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
