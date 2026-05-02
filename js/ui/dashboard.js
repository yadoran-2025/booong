import { loadDashboardConfig as loadSharedDashboardConfig } from "../dashboard-data.js";
import { escapeHtml } from "../utils.js";

const SUBJECT_COLOR_PALETTE = [
  "#639922",
  "#1D9E75",
  "#534AB7",
  "#D85A30",
  "#185FA5",
  "#9A5B12",
  "#0F766E",
  "#BE185D",
];

const SCHOOL_ORDER = ["초등학교", "중학교", "고등학교", "대학교", "기타"];
const RECENT_STORAGE_KEY = "booong-dashboard-recent-v1";
const MAX_RECENT_ITEMS = 12;

const TOOL_LABELS = {
  "asset-search": "수업자료 검색",
  "print-mode": "기출문제 테스트 생성",
  "worksheet-maker": "학습지 메이커",
  "block-guide": "BNG LANG 설명서",
  "lesson-author": "BNG LANG 에디터",
};

export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.background = "";

  const config = await loadDashboardConfig();
  const state = {
    section: "all",
    kind: "",
    school: "",
    subject: "",
    query: "",
    viewMode: "list",
  };

  const container = document.createElement("div");
  container.className = "dashboard";
  document.body.appendChild(container);

  renderDashboard(container, config, state);
}

export async function loadDashboardConfig() {
  return loadSharedDashboardConfig();
}

function renderDashboard(root, config, state) {
  const items = createLibraryItems(config);
  normalizeState(items, state);

  const filteredItems = getFilteredItems(items, state);
  root.innerHTML = `
    <div class="dashboard-shell">
      ${renderSidebar(config, items, state)}
      <main class="dashboard-main">
        ${renderMainHeader(config)}
        ${renderSearchAndFilters(items, filteredItems, state)}
        ${renderResults(filteredItems, state)}
      </main>
    </div>
  `;

  bindDashboardEvents(root, config, state);
}

function renderSidebar(config, items, state) {
  const tools = Array.isArray(config.tools) ? config.tools : [];
  const lessonCount = items.filter(item => item.kind === "lesson-group").length;
  const gameCount = items.filter(item => item.kind === "game").length;
  const recentCount = getRecentItems(items).length;

  return `
    <aside class="dashboard-sidebar" aria-label="대시보드 탐색">
      <div class="dashboard-brand">
        <span class="dashboard-brand__mark" aria-hidden="true">
          ${renderScooterPictogram()}
        </span>
        <span class="dashboard-brand__copy">
          <span class="dashboard-brand__eyebrow">사회교육공동체</span>
          <span class="dashboard-brand__name">BOOONG</span>
        </span>
      </div>

      <nav class="dashboard-nav" aria-label="탐색">
        <span class="dashboard-nav__label">탐색</span>
        ${renderNavButton({ section: "all", label: "모든 수업", count: items.length, state })}
        ${renderNavButton({ section: "lesson", label: "수업", count: lessonCount, state })}
        ${renderNavButton({ section: "game", label: "게임", count: gameCount, state })}
        ${renderNavButton({ section: "recent", label: "최근 본 항목", count: recentCount || "", state })}
      </nav>

      <nav class="dashboard-nav" aria-label="도구">
        <span class="dashboard-nav__label">도구</span>
        ${tools.map(renderToolLink).join("")}
      </nav>

      <div class="dashboard-sidebar__footer">
        <span class="dashboard-sidebar__footer-label">새 수업 등록</span>
        <a href="author.html">+ 자료 추가하기</a>
      </div>
    </aside>
  `;
}

function renderScooterPictogram() {
  return `
    <svg viewBox="0 0 64 48" role="img" focusable="false">
      <path d="M18 30h20c6.7 0 12.4-4.7 13.7-11.2l1.1-5.6" />
      <path d="M36 30l5-12h12" />
      <path d="M19 19h15l7 11" />
      <path d="M12 30h7" />
      <circle cx="18" cy="34" r="6" />
      <circle cx="47" cy="34" r="6" />
      <path d="M27 14h8" />
      <path d="M14 24c2.4-4.8 7.2-7 13.5-7" />
    </svg>
  `;
}

function renderNavButton({ section, label, count, state }) {
  const selected = state.section === section;
  return `
    <button
      class="dashboard-nav__item ${selected ? "is-active" : ""}"
      type="button"
      data-section="${escapeAttr(section)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span>${escapeHtml(label)}</span>
      ${count !== "" ? `<span class="dashboard-nav__count">${escapeHtml(count)}</span>` : ""}
    </button>
  `;
}

function renderToolLink(tool) {
  const label = TOOL_LABELS[tool.id] || tool.title || "도구";
  const href = tool.link || "#";
  return `
    <a class="dashboard-nav__item dashboard-nav__link" href="${escapeAttr(href)}">
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

function renderMainHeader(config) {
  const dashboard = config.dashboard || {};
  const notices = Array.isArray(config.notices) ? config.notices : [];
  const notice = notices[0] || null;

  return `
    <header class="dashboard-main__header">
      <div class="dashboard-quote">
        <p>${formatDashboardText(dashboard.subtitle || "스마트 수업 프리젠터")}</p>
        ${dashboard.source ? `<span>${escapeHtml(dashboard.source)}</span>` : ""}
      </div>
      <div class="dashboard-header-actions">
        <a class="btn btn--secondary btn--sm" href="https://yadoran-2025.github.io/booong-design-system/" target="_blank" rel="noopener">디자인 시스템</a>
        <a class="btn btn--secondary btn--sm" href="about.html">소개</a>
      </div>
      ${notice ? `
        <a class="dashboard-notice" href="${escapeAttr(notice.link || "#")}" ${notice.link ? "" : "aria-disabled=\"true\""}>
          <span class="dashboard-notice__tag">공지</span>
          <span class="dashboard-notice__title">${escapeHtml(notice.title || "공지사항")}</span>
          ${notice.desc ? `<span class="dashboard-notice__desc">${escapeHtml(notice.desc)}</span>` : ""}
        </a>
      ` : ""}
    </header>
  `;
}

function renderSearchAndFilters(items, filteredItems, state) {
  const sectionItems = getSectionItems(items, state.section);
  const kindScope = state.kind
    ? sectionItems.filter(item => item.kind === state.kind)
    : sectionItems;
  const schoolScope = state.school
    ? kindScope.filter(item => item.schools.includes(state.school))
    : kindScope;

  return `
    <section class="dashboard-controls" aria-label="라이브러리 필터">
      <div class="dashboard-search">
        <label class="field dashboard-search__field">
          <span class="field__label field__label--muted">검색</span>
          <input
            class="field__input"
            type="search"
            value="${escapeAttr(state.query)}"
            placeholder="수업 제목, 단원, 키워드로 검색"
            data-query-input
          >
        </label>
        <a class="btn btn--secondary btn--sm dashboard-new-link" href="author.html">+ 새 수업</a>
      </div>

      <div class="dashboard-filterbar">
        ${renderFilterGroup({
          label: "유형",
          key: "kind",
          values: getKindOptions(sectionItems),
          selected: state.kind,
          allLabel: "전체",
          labelForValue: getKindLabel,
        })}
        ${renderFilterGroup({
          label: "학교급",
          key: "school",
          values: getSchools(kindScope, false),
          selected: state.school,
          allLabel: "전체",
        })}
        ${renderFilterGroup({
          label: "과목",
          key: "subject",
          values: getSubjects(schoolScope, false),
          selected: state.subject,
          allLabel: "전체",
        })}
      </div>

      <div class="dashboard-results-head">
        <span>${escapeHtml(getResultLabel(state, filteredItems.length))}</span>
        <div class="dashboard-view-toggle" role="group" aria-label="보기 방식">
          <button class="${state.viewMode === "list" ? "is-active" : ""}" type="button" data-view-mode="list">리스트</button>
          <button class="${state.viewMode === "card" ? "is-active" : ""}" type="button" data-view-mode="card">카드</button>
        </div>
      </div>
    </section>
  `;
}

function renderFilterGroup({ label, key, values, selected, allLabel, labelForValue = value => value }) {
  const buttons = [
    renderFilterButton({ key, value: "", label: allLabel, selected: !selected }),
    ...values.map(value => renderFilterButton({
      key,
      value,
      label: labelForValue(value),
      selected: value === selected,
    })),
  ].join("");

  return `
    <div class="dashboard-filterbar__group">
      <span class="dashboard-filterbar__label">${escapeHtml(label)}</span>
      <div class="dashboard-filterbar__buttons">
        ${buttons}
      </div>
    </div>
  `;
}

function renderFilterButton({ key, value, label, selected }) {
  return `
    <button
      class="dashboard-filterbar__button ${selected ? "is-active" : ""}"
      type="button"
      data-filter="${escapeAttr(key)}"
      data-filter-value="${escapeAttr(value)}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderResults(items, state) {
  if (!items.length) {
    return `
      <div class="empty-state dashboard-empty-state">
        <div class="empty-state__icon empty-state__icon--search" aria-hidden="true">?</div>
        <div class="empty-state__title">조건에 맞는 항목이 없습니다.</div>
        <div class="empty-state__desc">검색어나 필터를 조금 넓혀 다시 찾아보세요.</div>
      </div>
    `;
  }

  if (state.viewMode === "card") {
    return `
      <section class="dashboard-card-grid" aria-label="수업 카드">
        ${items.map(renderResultCard).join("")}
      </section>
    `;
  }

  return `
    <section class="dashboard-result-list" aria-label="수업 목록">
      ${items.map(renderResultRow).join("")}
    </section>
  `;
}

function renderResultRow(item) {
  return `
    <article class="dashboard-result-row" data-item-key="${escapeAttr(item.key)}">
      <span class="dashboard-result-row__dot" style="--item-color: ${escapeAttr(item.color)};" aria-hidden="true"></span>
      <span class="dashboard-result-row__body">
        <span class="dashboard-result-row__title">${formatDashboardText(item.title)}</span>
        <span class="dashboard-result-row__taxonomy">
          <span class="dashboard-result-row__meta">${escapeHtml(item.meta.join(" · "))}</span>
          ${item.schools.slice(0, 2).map(value => `<span class="chip chip--gray">${escapeHtml(value)}</span>`).join("")}
          ${item.subject ? `<span class="chip">${escapeHtml(item.subject)}</span>` : ""}
        </span>
        ${item.desc ? `<span class="dashboard-result-row__desc">${formatDashboardText(item.desc)}</span>` : ""}
      </span>
      ${renderLessonPanel(item)}
    </article>
  `;
}

function renderResultCard(item) {
  return `
    <article class="dashboard-library-card" data-item-key="${escapeAttr(item.key)}">
      <span class="dashboard-library-card__thumb" style="--item-color: ${escapeAttr(item.color)};">
        <span>${escapeHtml(item.discipline || item.subject || getKindLabel(item.kind))}</span>
        ${item.kind === "game" ? `<b>게임</b>` : ""}
      </span>
      <span class="dashboard-library-card__body">
        <span class="dashboard-library-card__title">${formatDashboardText(item.title)}</span>
        <span class="dashboard-library-card__meta">${escapeHtml(item.meta.join(" · "))}</span>
        <span class="dashboard-library-card__tags">
          ${item.schools.slice(0, 2).map(value => `<span class="chip chip--gray">${escapeHtml(value)}</span>`).join("")}
          ${item.subject ? `<span class="chip">${escapeHtml(item.subject)}</span>` : ""}
        </span>
        ${item.desc ? `<span class="dashboard-library-card__desc">${formatDashboardText(item.desc)}</span>` : ""}
      </span>
      ${renderLessonPanel(item)}
    </article>
  `;
}

function renderLessonPanel(item) {
  const actions = item.actions || [];
  return `
    <div class="dashboard-lesson-panel" aria-label="${escapeAttr(item.title)} 하위 항목">
      ${actions.length ? actions.map(action => renderLessonAction(action)).join("") : `
        <span class="dashboard-lesson-link is-disabled">
          <span class="dashboard-lesson-link__label">준비 중</span>
          <span class="dashboard-lesson-link__title">연결된 항목이 없습니다.</span>
        </span>
      `}
    </div>
  `;
}

function renderLessonAction(action) {
  const classes = ["dashboard-lesson-link", action.disabled ? "is-disabled" : ""].filter(Boolean).join(" ");
  const attrs = action.disabled
    ? `aria-disabled="true"`
    : `href="${escapeAttr(action.href)}" ${action.external ? `target="_blank" rel="noopener"` : ""} data-action-key="${escapeAttr(action.key)}"`;
  const tag = action.disabled ? "span" : "a";
  return `
    <${tag} class="${classes}" ${attrs}>
      <span class="dashboard-lesson-link__label">${escapeHtml(action.label || "항목")}</span>
      <span class="dashboard-lesson-link__title">${formatDashboardText(action.title || "열기")}</span>
      <span class="dashboard-lesson-link__arrow" aria-hidden="true">${action.disabled ? "준비 중" : "→"}</span>
    </${tag}>
  `;
}

function bindDashboardEvents(root, config, state) {
  root.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section || "all";
      state.kind = "";
      state.school = "";
      state.subject = "";
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.filter;
      if (!key) return;
      state[key] = button.dataset.filterValue || "";
      if (key === "kind") {
        state.school = "";
        state.subject = "";
      }
      if (key === "school") state.subject = "";
      renderDashboard(root, config, state);
    });
  });

  root.querySelectorAll("[data-view-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.viewMode === "card" ? "card" : "list";
      renderDashboard(root, config, state);
    });
  });

  const queryInput = root.querySelector("[data-query-input]");
  if (queryInput) {
    queryInput.addEventListener("input", event => {
      state.query = event.target.value || "";
      renderDashboard(root, config, state);
      const nextInput = root.querySelector("[data-query-input]");
      if (nextInput) {
        nextInput.focus();
        const length = nextInput.value.length;
        nextInput.setSelectionRange(length, length);
      }
    });
  }

  root.querySelectorAll("[data-action-key]").forEach(link => {
    link.addEventListener("click", () => {
      saveRecentKey(link.dataset.actionKey || "");
    });
  });
}

function createLibraryItems(config) {
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const games = Array.isArray(config.games) ? config.games : [];
  const knownGroupIds = new Set(groups.map(group => group.id).filter(Boolean));
  const items = groups.map(createGroupItem);

  games
    .filter(game => game.id && !knownGroupIds.has(game.id))
    .forEach((game, index) => items.push(createGameItem(game, groups.length + index)));

  return items;
}

function createGroupItem(group, index = 0) {
  if (normalizeKind(group.kind) === "game") return createGameItem(group, index);

  const lessons = Array.isArray(group.lessons) ? group.lessons : [];
  const zeroSession = normalizeZeroSession(group.zeroSession);
  const actions = [
    createLessonAction(zeroSession, group, 0, true),
    ...lessons.map((lesson, lessonIndex) => createLessonAction(lesson, group, lessonIndex + 1, false)),
  ].filter(Boolean);
  const schools = getItemSchools(group, true);
  const subject = normalizeSubject(group.subject, true);
  const discipline = normalizeDiscipline(group.discipline || group.subject, true);

  return {
    key: `group:${group.id || index}`,
    groupId: group.id || "",
    kind: "lesson-group",
    title: group.title || "수업",
    desc: group.desc || "",
    href: actions.find(action => !action.disabled)?.href || "",
    schools,
    subject,
    discipline,
    color: getSubjectColor(discipline, index),
    actions,
    meta: [discipline, `${lessons.length}차시`, zeroSession.href ? "지도안" : ""].filter(Boolean),
    searchText: buildSearchText([
      group.title,
      group.desc,
      subject,
      discipline,
      schools.join(" "),
      ...actions.flatMap(action => [action.title, action.label, action.desc]),
    ]),
  };
}

function createGameItem(game, index = 0) {
  const href = game.link || "";
  const schools = getItemSchools(game, true);
  const subject = normalizeSubject(game.subject, true);
  const discipline = normalizeDiscipline(game.discipline || game.subject, true);
  const actions = [
    {
      key: `game:${game.id || index}:open`,
      label: game.tag || "게임",
      title: "게임 열기",
      href,
      external: /^https?:\/\//i.test(href),
      disabled: !href,
    },
  ];
  const worksheetHref = getGameWorksheetHref(game);
  if (worksheetHref) {
    actions.push({
      key: `game:${game.id || index}:worksheet`,
      label: "학습지",
      title: "학습지 열기",
      href: worksheetHref,
      external: /^https?:\/\//i.test(worksheetHref),
      disabled: false,
    });
  }

  return {
    key: `game:${game.id || index}`,
    groupId: game.id || "",
    kind: "game",
    title: game.title || "게임",
    desc: game.desc || "",
    href,
    schools,
    subject,
    discipline,
    color: getSubjectColor(discipline, index),
    actions,
    meta: [discipline, "게임"].filter(Boolean),
    searchText: buildSearchText([game.title, game.desc, subject, discipline, schools.join(" "), "게임"]),
  };
}

function createLessonAction(lesson, group, index, isZeroSession) {
  if (!lesson) return null;
  const href = lesson.link || lesson.href || (!isZeroSession && lesson.id ? `?lesson=${encodeURIComponent(lesson.id)}` : "");
  const label = lesson.label || (isZeroSession ? "0차시" : `${index}차시`);
  return {
    key: `lesson:${group.id || "group"}:${lesson.id || label}:${index}`,
    label,
    title: lesson.title || "수업 열기",
    desc: lesson.desc || "",
    href,
    external: /^https?:\/\//i.test(href),
    disabled: !href,
  };
}

function normalizeState(items, state) {
  if (!["all", "lesson", "game", "recent"].includes(state.section)) state.section = "all";
  const sectionItems = getSectionItems(items, state.section);
  const kinds = getKindOptions(sectionItems);
  if (state.kind && !kinds.includes(state.kind)) state.kind = "";

  const kindScope = state.kind ? sectionItems.filter(item => item.kind === state.kind) : sectionItems;
  const schools = getSchools(kindScope, false);
  if (state.school && !schools.includes(state.school)) state.school = "";

  const schoolScope = state.school ? kindScope.filter(item => item.schools.includes(state.school)) : kindScope;
  const subjects = getSubjects(schoolScope, false);
  if (state.subject && !subjects.includes(state.subject)) state.subject = "";
}

function getFilteredItems(items, state) {
  const query = normalizeSearchQuery(state.query);
  return getSectionItems(items, state.section).filter(item => {
    if (state.kind && item.kind !== state.kind) return false;
    if (state.school && !item.schools.includes(state.school)) return false;
    if (state.subject && item.subject !== state.subject) return false;
    if (query && !item.searchText.includes(query)) return false;
    return true;
  });
}

function getSectionItems(items, section) {
  if (section === "lesson") return items.filter(item => item.kind === "lesson-group");
  if (section === "game") return items.filter(item => item.kind === "game");
  if (section === "recent") return getRecentItems(items);
  return items;
}

function getRecentItems(items) {
  const recentKeys = getRecentKeys();
  const groupIds = unique(recentKeys.map(key => parseRecentGroupId(key)).filter(Boolean));
  return groupIds
    .map(groupId => items.find(item => item.groupId === groupId || item.key === groupId))
    .filter(Boolean);
}

function parseRecentGroupId(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "lesson" && parts[1]) return parts[1];
  if (parts[0] === "game" && parts[1]) return parts[1];
  if (parts[0] === "group" && parts[1]) return parts[1];
  return "";
}

function getResultLabel(state, count) {
  const sectionLabel = {
    all: "모든 수업",
    lesson: "수업",
    game: "게임",
    recent: "최근 본 항목",
  }[state.section] || "모든 수업";
  return `${sectionLabel} · ${count}개`;
}

function getKindOptions(items) {
  return unique(items.map(item => item.kind)).filter(Boolean);
}

function getKindLabel(kind) {
  return kind === "game" ? "게임" : "수업";
}

function getSchools(items = [], useFallback) {
  return sortSchools(unique(items.flatMap(item => {
    if (Array.isArray(item.schools)) return item.schools;
    return getItemSchools(item, useFallback);
  })).filter(Boolean));
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

function getSubjects(items = [], useFallback) {
  return unique(items.map(item => normalizeSubject(item.subject, useFallback))).filter(Boolean);
}

function getItemSchools(item, useFallback) {
  const schools = splitList(item?.school).map(value => normalizeSchool(value, false)).filter(Boolean);
  if (schools.length) return schools;
  const fallback = normalizeSchool("", useFallback);
  return fallback ? [fallback] : [];
}

function normalizeZeroSession(zeroSession) {
  return {
    id: zeroSession?.id || "zero-session",
    label: zeroSession?.label || "0차시",
    title: zeroSession?.title || "지도안 및 수업자료",
    desc: zeroSession?.desc || "수업 지도안과 확장 읽기 자료",
    link: zeroSession?.link || "",
    href: zeroSession?.link || "",
  };
}

function getGameWorksheetHref(game) {
  if (game.worksheetLink) return game.worksheetLink;
  if (game.worksheet && /^https?:\/\//i.test(game.worksheet)) return game.worksheet;
  if (!game.worksheet) return "";
  const params = new URLSearchParams();
  params.set("game", game.id || "");
  params.set("worksheet", game.worksheet);
  return `worksheet-maker.html?${params.toString()}`;
}

function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return value === "game" ? "game" : "lesson";
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

function getSubjectColor(value, index = 0) {
  const normalized = normalizeDiscipline(value, true);
  const hash = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), index);
  return SUBJECT_COLOR_PALETTE[Math.abs(hash) % SUBJECT_COLOR_PALETTE.length];
}

function buildSearchText(values) {
  return normalizeSearchQuery(values.filter(Boolean).map(stripHtml).join(" "));
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDashboardText(value) {
  return escapeHtml(String(value ?? ""))
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\r?\n/g, "<br>");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}

function unique(values) {
  return [...new Set(values)];
}

function getRecentKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveRecentKey(key) {
  if (!key) return;
  try {
    const next = [key, ...getRecentKeys().filter(value => value !== key)].slice(0, MAX_RECENT_ITEMS);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}
