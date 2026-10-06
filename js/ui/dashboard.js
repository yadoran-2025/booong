import { loadDashboardConfig as loadSharedDashboardConfig } from "../dashboard-data.js";
import { loadFavoriteIds, saveFavoriteIds, toggleFavoriteId } from "../favorites.js";
import { SCHOOL_OPTIONS, createSubjectOptions, getSubjectLabel, loadTeacherProfile, normalizeTeacherProfile, saveTeacherProfile } from "../teacher-profile.js";
import { escapeHtml } from "../utils.js";
import { getLessonPageKey, loadFavoriteStats, setFavoriteState, trackGroupClick } from "../visitor-analytics.js";
import { hydrateViewCounts, renderResourceCount, renderViewCounter } from "./view-counter.js";
import { bindCardDiscussions, renderCardDiscussion } from "./card-discussions.js";
import { bindResourceDescriptions } from "./resource-descriptions.js";
import { bindHomeIntro, renderHomeIntro } from "./dashboard-intro.js";

let didWarnCatalogDiagnostics = false;
const resourcePlaceholderUrls = ["social-studies", "civics", "economics", "history"]
  .map(name => `/assets/lesson-thumbnails/${name}-default-v1.jpg`);
for (let index = resourcePlaceholderUrls.length - 1; index > 0; index -= 1) {
  const swap = Math.floor(Math.random() * (index + 1));
  [resourcePlaceholderUrls[index], resourcePlaceholderUrls[swap]] = [resourcePlaceholderUrls[swap], resourcePlaceholderUrls[index]];
}
const resourcePlaceholderAssignments = new Map();

export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.cssText = "";

  const config = await loadDashboardConfig();
  const root = document.createElement("div");
  root.className = "curation-app";
  document.body.appendChild(root);

  const view = new URLSearchParams(window.location.search).get("view");
  if (view === "new") {
    renderNewLessonsView(root, config);
    return;
  }
  if (view === "favorites") {
    renderFavoritesView(root, config);
    return;
  }

  const subjectOptions = createSubjectOptions(config.catalog);
  const profile = loadTeacherProfile(subjectOptions);
  if (profile) startCurationHome(root, config, profile, subjectOptions);
  else renderTeacherOnboarding(root, profile => startCurationHome(root, config, profile, subjectOptions), {}, subjectOptions);
}

export async function loadDashboardConfig(options = {}) {
  return loadSharedDashboardConfig(options);
}

function startCurationHome(root, config, profile, subjectOptions) {
  const state = { profile, subjectOptions, unit: "", middleUnit: "", kind: "all", query: "", sort: "unit" };
  root.innerHTML = renderHomeIntro();
  const libraryRoot = document.createElement("div");
  libraryRoot.id = "lesson-library";
  root.appendChild(libraryRoot);
  renderCurationHome(libraryRoot, config, state);
  bindHomeIntro(root);
  refreshDashboardConfig(libraryRoot, config, state);
}

async function refreshDashboardConfig(root, currentConfig, state) {
  try {
    const nextConfig = await loadDashboardConfig({ cache: false, fallbackConfig: currentConfig });
    if (!root.isConnected || JSON.stringify(nextConfig) === JSON.stringify(currentConfig)) return;
    const subjectOptions = createSubjectOptions(nextConfig.catalog);
    const profile = normalizeTeacherProfile(state.profile, subjectOptions);
    if (!profile) {
      renderTeacherOnboarding(root, nextProfile => startCurationHome(root, nextConfig, nextProfile, subjectOptions), {}, subjectOptions);
      return;
    }
    const focusTarget = getCurationFocusTarget(root);
    state.subjectOptions = subjectOptions;
    state.profile = profile;
    renderCurationHome(root, nextConfig, state, focusTarget);
  } catch (error) {
    console.warn("Dashboard refresh failed:", error);
  }
}

function renderCurationHome(root, config, state, focusTarget = "") {
  const catalog = config.catalog;
  const subjectLabel = getSubjectLabel(state.subjectOptions, state.profile.school, state.profile.subject);
  const subjectItems = catalog.resources.filter(resource =>
    resource.subjects.includes(state.profile.subject) && resource.schools.includes(state.profile.school)
  );
  const units = catalog.units.filter(unit =>
    unit.school === state.profile.school
    && unit.subject === state.profile.subject
    && subjectItems.some(resource => resource.unitKeys.includes(unit.key))
  );
  if (state.unit && !units.some(unit => unit.key === state.unit)) {
    state.unit = "";
    state.middleUnit = "";
  }
  const selectedUnit = units.find(unit => unit.key === state.unit) || null;
  if (!selectedUnit || !getMiddleUnitCounts(selectedUnit, subjectItems).some(({ title }) => title === state.middleUnit)) state.middleUnit = "";

  warnCatalogDiagnostics(catalog);

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar(config.catalog.resources, false, state)}
      ${renderSubjectRoller(state.profile, state.subjectOptions)}
      <main>
        ${renderUnitNavigator(units, selectedUnit, subjectItems, state, subjectLabel)}
      </main>
      ${renderFooter()}
    </div>
  `;

  bindCurationEvents(root, config, state);
  applyLibraryFilter(root, state);
  restoreCurationFocus(root, focusTarget);
  const subject = root.querySelector('.subject-roller [aria-pressed="true"]');
  const subjectField = root.querySelector(".subject-roller__field");
  if (subject && subjectField) {
    const tabBounds = subject.getBoundingClientRect();
    const fieldBounds = subjectField.getBoundingClientRect();
    if (tabBounds.left < fieldBounds.left) subjectField.scrollLeft += tabBounds.left - fieldBounds.left;
    else if (tabBounds.right > fieldBounds.right) subjectField.scrollLeft += tabBounds.right - fieldBounds.right;
  }
}

function renderNewLessonsView(root, config) {
  const items = config.catalog.resources.filter(resource => resource.isNew);

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar(config.catalog.resources)}
      <main>
        <section class="curation-new-lessons" aria-labelledby="new-lessons-title">
          <header class="curation-section-head">
            <div>
              <span>ALL SUBJECTS</span>
              <h1 id="new-lessons-title">새로 들어온 수업</h1>
            </div>
            <a href="index.html">홈으로</a>
          </header>
          ${items.length ? `
            <div class="bundle-list">
              ${items.map(item => renderResourceCard(item)).join("")}
            </div>
          ` : `
            <div class="curation-library__empty">
              <strong>새로 들어온 수업이 없습니다.</strong>
              <span>새 수업이 등록되면 이곳에서 만날 수 있습니다.</span>
              <a href="index.html">홈으로</a>
            </div>
          `}
        </section>
      </main>
      ${renderFooter()}
    </div>
  `;

  bindCurationEvents(root, config, {});
}

function getFavoriteResources(resources) {
  const resourceById = new Map(resources.map(resource => [resource.id, resource]));
  return loadFavoriteIds().map(id => resourceById.get(id)).filter(Boolean);
}

function renderFavoritesView(root, config) {
  const items = getFavoriteResources(config.catalog.resources);

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar(config.catalog.resources, true)}
      <main>
        <section class="curation-new-lessons curation-favorites" aria-labelledby="favorite-lessons-title">
          <header class="curation-section-head">
            <div>
              <span>MY LESSONS</span>
              <h1 id="favorite-lessons-title">내 수업함</h1>
            </div>
            <a href="index.html">홈으로</a>
          </header>
          <div class="bundle-list" data-favorites-list ${items.length ? "" : "hidden"}>
            ${items.map(item => renderResourceCard(item)).join("")}
          </div>
          <div class="curation-library__empty" data-favorites-empty ${items.length ? "hidden" : ""}>
            <strong>내 수업함이 비어 있습니다.</strong>
            <span>수업 카드의 별을 누르면 이곳에 모아둘 수 있습니다.</span>
            <a href="index.html">수업 둘러보기</a>
          </div>
        </section>
      </main>
      ${renderFooter()}
    </div>
  `;

  bindCurationEvents(root, config, {});
}

function renderTopbar(resources, favoritesCurrent = false, state = null) {
  const favoriteCount = getFavoriteResources(resources).length;
  return `
    <header class="curation-topbar">
      <a class="curation-brand" href="index.html" aria-label="BOOONG 홈">
        <span class="curation-brand__mark" aria-hidden="true">${renderScooterPictogram()}</span>
        <span><b>BOOONG</b><small>수업 준비실</small></span>
      </a>
      ${state ? `<div class="curation-search-wrap">
        <label class="curation-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value="${escapeAttr(state.query)}" placeholder="주제, 단원, 수업 이름으로 찾기" aria-label="수업 검색" data-library-search>
        </label>
        <section class="curation-search-results" data-search-results aria-live="polite" hidden></section>
      </div>` : "<span></span>"}
      <nav class="curation-topbar__actions" aria-label="빠른 이동">
        ${renderViewCounter()}
        <a class="curation-topbar__favorites ${favoritesCurrent ? "is-current" : ""}" href="index.html?view=favorites" aria-label="내 수업함, 저장한 수업 ${favoriteCount}개" ${favoritesCurrent ? `aria-current="page"` : ""}>
          <span>내 수업함</span><b data-favorite-count>${favoriteCount}</b>
        </a>
      </nav>
    </header>
  `;
}

function renderSubjectRoller(profile, subjectOptions) {
  return `
    <nav class="subject-roller" aria-label="과목 변경">
      <div class="subject-roller__field" role="group" aria-label="과목 선택">
        ${SCHOOL_OPTIONS.filter(({ value }) => subjectOptions[value]?.length).map(({ value: school, label: schoolLabel }) => `<div class="subject-roller__group" role="group" aria-label="${escapeAttr(schoolLabel)} 과목">${subjectOptions[school].map(({ value, label }) => `<button type="button" data-subject-school="${escapeAttr(school)}" data-subject-value="${escapeAttr(value)}" aria-pressed="${school === profile.school && value === profile.subject}">${escapeHtml(label)}</button>`).join("")}</div>`).join("")}
      </div>
    </nav>
  `;
}

function renderUnitNavigator(units, selectedUnit, resources, state, subjectLabel) {
  const visibleUnits = selectedUnit ? [selectedUnit] : units;
  return `
    <section class="unit-workspace" aria-label="교육과정별 수업 탐색">
      <aside class="unit-picker" aria-label="단원 목차">
        <h2>단원 목차</h2>
        <button class="unit-tab" type="button" data-unit="" aria-pressed="${!selectedUnit}"><strong>전체 단원</strong><small>자료 ${resources.length}개</small></button>
        <div class="unit-axis__track" role="group" aria-label="단원 선택">
          ${units.map(unit => renderUnitTab(unit, selectedUnit, resources, state)).join("")}
        </div>
      </aside>
      <div class="unit-detail" id="unit-detail">
        <header class="curation-library-head">
          <div><h1>${escapeHtml(subjectLabel)} 수업 모아보기</h1><p>과목과 단원에 맞는 수업을 한눈에 살펴보세요.</p></div>
          <div class="curation-library-controls">
            <div class="curation-kind-filter" role="group" aria-label="자료 종류">
              ${renderKindButton("all", "전체", state)}${renderKindButton("lesson", "수업", state)}${renderKindButton("game", "게임", state)}
            </div>
            <select class="field__input" data-library-sort aria-label="수업 정렬">
              <option value="unit"${state.sort === "unit" ? " selected" : ""}>단원순</option>
              <option value="title"${state.sort === "title" ? " selected" : ""}>가나다순</option>
            </select>
          </div>
        </header>
        ${selectedUnit ? `<select class="field__input curation-middle-select" data-middle-select aria-label="중단원 선택">
          <option value="">전체 중단원</option>
          ${getMiddleUnitCounts(selectedUnit, resources).map(({ title, count }) => `<option value="${escapeAttr(title)}"${state.middleUnit === title ? " selected" : ""}>${escapeHtml(title)} (${count}개)</option>`).join("")}
        </select>` : ""}
        <p class="curation-library-status" data-library-count aria-live="polite"></p>
        ${visibleUnits.map(unit => renderResourcePanel(resources.filter(item => item.unitKeys.includes(unit.key)), unit, state)).join("")}
        <div class="curation-library__empty" data-library-empty hidden>
          <strong>조건에 맞는 수업이 없습니다.</strong><span>다른 단원을 선택하거나 검색어와 자료 종류를 바꿔보세요.</span>
        </div>
      </div>
    </section>
  `;
}

function renderUnitTab(unit, selectedUnit, resources, state) {
  const selected = selectedUnit?.key === unit.key;
  const resourceCount = resources.filter(resource => resource.unitKeys.includes(unit.key)).length;
  return `
    <div class="unit-picker__chapter">
      <button class="unit-tab" type="button" data-unit="${escapeAttr(unit.key)}" aria-pressed="${selected && !state.middleUnit}">
        <strong>${escapeHtml(unit.title)}</strong><small>${resourceCount}</small>
      </button>
      <div class="unit-picker__middle" role="group" aria-label="${escapeAttr(`${unit.title} 중단원`)}">
        ${getMiddleUnitCounts(unit, resources).map(({ title, count }) => `<button type="button" data-middle-unit="${escapeAttr(title)}" data-unit-key="${escapeAttr(unit.key)}" aria-pressed="${selected && state.middleUnit === title}"><span>${escapeHtml(title)}</span><small>${count}개</small></button>`).join("")}
      </div>
    </div>
  `;
}

function getMiddleUnitCounts(unit, resources) {
  const items = resources.filter(resource => resource.unitKeys.includes(unit.key));
  return [...new Set(unit.middleUnits)].map(title => ({
    title,
    count: items.filter(resource => (resource.middleUnitsByKey?.[unit.key] || resource.middleUnits || []).includes(title)).length,
  })).filter(({ count }) => count > 0);
}

function renderResourcePanel(items, unit, state) {
  const sortedItems = [...items].sort(state.sort === "title"
    ? (a, b) => a.title.localeCompare(b.title, "ko")
    : (a, b) => compareResourceByMiddleUnit(a, b, unit.key));
  const [, number = "", title = unit.title] = unit.title.match(/^([IVXLCDM]+\.)\s*(.+)$/) || [];
  return `
    <section class="curation-unit-section" data-library-section aria-labelledby="unit-title-${escapeAttr(encodeURIComponent(unit.key))}">
      <header class="curation-section-head">
        <h2 id="unit-title-${escapeAttr(encodeURIComponent(unit.key))}">${number ? `<span>${escapeHtml(number)}</span>` : ""}${escapeHtml(title)}</h2>
        <span data-section-count>${sortedItems.length}개 자료</span>
      </header>
      <div class="bundle-list" data-library-grid>${sortedItems.map(item => renderResourceCard(item, unit.key)).join("")}</div>
    </section>
  `;
}

function compareResourceByMiddleUnit(a, b, unitKey) {
  const aNumber = Number.parseInt((a.middleUnitsByKey?.[unitKey] || a.middleUnits)?.[0]?.match(/^\s*(\d+)/)?.[1] || "", 10);
  const bNumber = Number.parseInt((b.middleUnitsByKey?.[unitKey] || b.middleUnits)?.[0]?.match(/^\s*(\d+)/)?.[1] || "", 10);
  if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) return 0;
  if (Number.isNaN(aNumber)) return 1;
  if (Number.isNaN(bNumber)) return -1;
  return aNumber - bNumber;
}

function renderKindButton(value, label, state) {
  const selected = state.kind === value;
  return `<button type="button" data-kind="${value}" aria-pressed="${selected}">${label}</button>`;
}

function renderResourceCard(item, selectedUnitKey = "") {
  const middleUnits = item.middleUnitsByKey?.[selectedUnitKey] || item.middleUnits || [];
  const isFavorite = loadFavoriteIds().includes(item.id);
  return `
    <article class="bundle-card has-cover" data-resource-id="${escapeAttr(item.id)}" data-library-item data-kind="${escapeAttr(item.kind)}" data-middle-units="${escapeAttr(JSON.stringify(middleUnits))}" data-search="${escapeAttr(item.searchText)}">
      ${renderResourceCover(item)}
      <div class="bundle-card__content">
        <div class="bundle-card__badges">
          ${middleUnits.length ? `<span>${escapeHtml(formatUnitList(middleUnits))}</span>` : ""}
        </div>
        <div class="bundle-card__utilities">
          <button class="bundle-favorite" type="button" data-favorite-id="${escapeAttr(item.id)}" aria-pressed="${isFavorite}" aria-label="${escapeAttr(`${item.title} ${isFavorite ? "수업함에서 빼기" : "수업함에 담기"}`)}" title="${isFavorite ? "수업함에서 빼기" : "수업함에 담기"}">
            <span class="bundle-favorite__icon" aria-hidden="true">${isFavorite ? "★" : "☆"}</span>
          </button>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="bundle-card__description" data-resource-description>
          <p>${escapeHtml(item.desc || "수업에 바로 활용할 수 있는 자료입니다.")}</p>
          <button type="button" aria-expanded="false" hidden>더 보기</button>
        </div>
        <div class="bundle-actions">
          ${["blog", "teacher", "worksheet"].map(key => {
            const action = item.actions.find(action => action.key === key);
            return action ? renderActionLink(action, item) : `<span class="bundle-action is-disabled" aria-disabled="true" title="아직 등록되지 않은 링크입니다">${key === "blog" ? "수업 소개" : key === "teacher" ? "자료 링크" : "활동지"}<small>미등록</small></span>`;
          }).join("")}
        </div>
      </div>
      <footer class="bundle-card__meta">
          ${item.makers.length ? `<div class="bundle-card__makers" aria-label="만든이"><span>만든이</span><div class="bundle-card__maker-names">${item.makers.map(maker => `<a class="chip chip--gray bundle-card__maker" href="about.html#${escapeAttr(encodeURIComponent(maker))}">${escapeHtml(maker)}</a>`).join("")}</div></div>` : ""}
          <div class="bundle-card__engagement">
            <div class="bundle-card__stats">
              ${renderResourceCount(escapeAttr(getResourceViewKey(item)), escapeAttr(item.id))}
              <span data-favorite-count-for="${escapeAttr(item.id)}">저장수 0</span>
            </div>
            <div class="bundle-card__discussion">${renderCardDiscussion(item.id, item.title)}</div>
          </div>
      </footer>
    </article>
  `;
}

function renderResourceCover(item) {
  const placeholderUrl = getResourcePlaceholderUrl(item.id);
  const image = `<img src="${escapeAttr(item.thumbnailUrl || placeholderUrl)}" alt="${item.thumbnailUrl ? escapeAttr(item.thumbnailAlt || `${item.title} 대표 이미지`) : ""}" data-fallback-src="${escapeAttr(placeholderUrl)}" width="800" height="500" loading="lazy" decoding="async">`;
  const action = item.actions.find(action => action.key === "blog");
  return `<figure class="bundle-card__cover${item.thumbnailUrl ? "" : " is-placeholder"}">${action ? `<a href="${escapeAttr(action.href)}" ${action.external ? 'target="_blank" rel="noopener"' : ""} aria-label="${escapeAttr(`${item.title} 수업 소개`)}" ${renderTrackingData(item, action)}>${image}</a>` : image}</figure>`;
}

function getResourcePlaceholderUrl(resourceId) {
  if (!resourcePlaceholderAssignments.has(resourceId)) {
    resourcePlaceholderAssignments.set(resourceId, resourcePlaceholderUrls[resourcePlaceholderAssignments.size % resourcePlaceholderUrls.length]);
  }
  return resourcePlaceholderAssignments.get(resourceId);
}

function bindResourceImages(root) {
  root.querySelectorAll(".bundle-card__cover img").forEach(image => {
    const showPlaceholder = () => {
      if (image.getAttribute("src") === image.dataset.fallbackSrc) return;
      image.closest(".bundle-card__cover").classList.add("is-placeholder");
      image.alt = "";
      image.src = image.dataset.fallbackSrc;
    };
    if (image.complete && !image.naturalWidth) showPlaceholder();
    else image.addEventListener("error", showPlaceholder, { once: true });
  });
}

function getResourceViewKey(item) {
  const internal = (item.actions || []).find(action => action && !action.external && /[?&]lesson=/.test(action.href || ""));
  const match = internal && /[?&]lesson=([^&]+)/.exec(internal.href);
  if (!match) return "";
  try {
    return getLessonPageKey(decodeURIComponent(match[1]));
  } catch {
    return getLessonPageKey(match[1]);
  }
}

function formatUnitList(units) {
  return units.length > 1 ? `${units[0]} +${units.length - 1}` : units[0];
}

function renderActionLink(action, item) {
  const title = action.key === "worksheet" ? "활동지" : action.key === "blog" ? "수업 소개" : "자료 링크";
  return `<a class="bundle-action${action.key === "teacher" ? " is-teacher" : ""}" href="${escapeAttr(action.href)}" ${action.external ? `target="_blank" rel="noopener"` : ""} ${renderTrackingData(item, action)}>
    <strong>${title}</strong><span aria-hidden="true">${action.external ? "↗" : "→"}</span>
  </a>`;
}

function renderTrackingData(item, action) {
  return `data-track-action data-group-id="${escapeAttr(item.id)}" data-group-title="${escapeAttr(item.title)}" data-group-type="${escapeAttr(item.kind)}" data-action-key="${escapeAttr(action.key)}"`;
}

function renderFooter() {
  return `
    <footer class="curation-footer">
      <div class="curation-footer__identity">
        <strong>BOOONG <span>사회교육공동체</span></strong>
        <p>우리는 함께일 때 강하다</p>
      </div>
      <nav class="curation-footer__links" aria-label="사이트 안내"><a href="about.html">BOOONG 소개 →</a><a class="curation-footer__operator" href="admin.html">운영자</a></nav>
    </footer>
  `;
}

function bindCurationEvents(root, config, state) {
  bindResourceImages(root);
  bindResourceDescriptions(root);
  hydrateViewCounts(root);
  bindCardDiscussions(root);
  hydrateFavoriteCounts(root, config.catalog.resources);

  root.querySelectorAll("[data-favorite-id]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(root, button, config.catalog.resources));
  });

  root.querySelectorAll("[data-subject-value]").forEach(button => {
    button.addEventListener("click", () => selectSubject(root, config, state, button.dataset.subjectSchool, button.dataset.subjectValue, true));
  });
  root.querySelectorAll("[data-middle-unit]").forEach(button => {
    button.addEventListener("click", () => {
      state.unit = button.dataset.unitKey;
      state.middleUnit = button.dataset.middleUnit;
      renderCurationHome(root, config, state, "middle");
    });
  });
  root.querySelector("[data-middle-select]")?.addEventListener("change", event => {
    state.middleUnit = event.target.value;
    renderCurationHome(root, config, state, "middleSelect");
  });
  root.querySelector("[data-library-sort]")?.addEventListener("change", event => {
    state.sort = event.target.value;
    renderCurationHome(root, config, state, "sort");
  });

  const search = root.querySelector("[data-library-search]");
  search?.addEventListener("input", event => {
    state.query = event.target.value || "";
    applyLibraryFilter(root, state);
    renderSearchResults(root, config, state, state.query);
  });

  root.querySelectorAll("[data-unit]").forEach(button => {
    button.addEventListener("click", () => {
      state.unit = button.dataset.unit || "";
      state.middleUnit = "";
      renderCurationHome(root, config, state, "unit");
    });
  });

  const kindButtons = root.querySelectorAll(".curation-kind-filter [data-kind]");
  kindButtons.forEach(button => {
    button.addEventListener("click", () => {
      state.kind = button.dataset.kind || "all";
      kindButtons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      applyLibraryFilter(root, state);
    });
  });

  bindTrackedLinks(root);
}

function bindTrackedLinks(root) {
  root.querySelectorAll("[data-track-action]").forEach(link => {
    link.addEventListener("click", () => {
      trackGroupClick({
        groupId: link.dataset.groupId,
        title: link.dataset.groupTitle,
        type: link.dataset.groupType,
        href: link.href,
        actionKey: link.dataset.actionKey,
      });
    });
  });
}

function showSearchResource(root, config, state, resourceId) {
  const item = config.catalog.resources.find(resource => resource.id === resourceId);
  if (!item) return;
  const profile = normalizeTeacherProfile({ school: item.schools?.[0], subject: item.subjects?.[0] }, state.subjectOptions);
  const unit = config.catalog.units.find(candidate =>
    candidate.school === profile?.school
    && candidate.subject === profile?.subject
    && item.unitKeys.includes(candidate.key)
  );
  if (!profile || !unit) return;

  state.profile = profile;
  state.unit = unit.key;
  state.middleUnit = "";
  state.kind = "all";
  state.query = "";
  renderCurationHome(root, config, state);
  [...root.querySelectorAll("[data-resource-id]")]
    .find(card => card.dataset.resourceId === item.id)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderSearchResults(root, config, state, query) {
  const results = root.querySelector("[data-search-results]");
  if (!results) return;
  const normalized = normalizeSearch(query);
  if (!normalized) {
    results.hidden = true;
    results.innerHTML = "";
    return;
  }

  const matches = config.catalog.resources.filter(item => (item.searchText || "").includes(normalized) && item.actions?.length).slice(0, 4);
  results.hidden = false;
  results.innerHTML = `
    <header><span>검색 결과</span><small>${matches.length ? `${matches.length}개` : "0개"}</small></header>
    ${matches.length ? `<ul>${matches.map(renderSearchResult).join("")}</ul>` : "<p>일치하는 수업이 없습니다.</p>"}
  `;
  results.querySelectorAll("[data-search-resource]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      showSearchResource(root, config, state, link.dataset.searchResource);
    });
  });
  bindTrackedLinks(results);
}

function renderSearchResult(item) {
  const subject = item.subjects?.[0] || "수업 자료";
  const unit = item.middleUnits?.[0] || "수업 자료";
  return `<li><a href="#unit-detail" data-search-resource="${escapeAttr(item.id)}"><span><small>${escapeHtml(subject)} · ${escapeHtml(unit)} · ${escapeHtml(item.kind === "game" ? "게임" : "수업")}</small><strong>${escapeHtml(item.title)}</strong></span><i aria-hidden="true">↓</i></a></li>`;
}

async function hydrateFavoriteCounts(root, resources) {
  const resourcesById = new Map(resources.map(resource => [resource.id, resource]));
  await Promise.all(loadFavoriteIds().filter(id => resourcesById.has(id)).map(id => setFavoriteState(id, true)));
  const stats = await loadFavoriteStats();
  if (!root.isConnected) return;
  stats.forEach(stat => updateFavoriteCount(root, stat.resourceId, stat.count));
}

function updateFavoriteCount(root, resourceId, count) {
  root.querySelectorAll("[data-favorite-count-for]").forEach(slot => {
    if (slot.dataset.favoriteCountFor !== resourceId) return;
    slot.hidden = false;
    slot.textContent = `저장수 ${Number(count || 0).toLocaleString("ko-KR")}`;
  });

}

async function toggleFavorite(root, button, resources) {
  const id = button.dataset.favoriteId || "";
  const favoriteIds = saveFavoriteIds(toggleFavoriteId(loadFavoriteIds(), id));
  const isFavorite = favoriteIds.includes(id);

  root.querySelectorAll("[data-favorite-id]").forEach(item => {
    if (item.dataset.favoriteId !== id) return;
    item.setAttribute("aria-pressed", String(isFavorite));
    item.setAttribute("aria-label", `${item.closest(".bundle-card")?.querySelector("h3")?.textContent || "수업"} ${isFavorite ? "수업함에서 빼기" : "수업함에 담기"}`);
    item.title = isFavorite ? "수업함에서 빼기" : "수업함에 담기";
    item.querySelector(".bundle-favorite__icon").textContent = isFavorite ? "★" : "☆";
    item.disabled = true;
  });

  const favoriteCount = getFavoriteResources(resources).length;
  root.querySelectorAll("[data-favorite-count]").forEach(item => {
    item.textContent = favoriteCount;
    item.closest(".curation-topbar__favorites")?.setAttribute("aria-label", `내 수업함, 저장한 수업 ${favoriteCount}개`);
  });
  if (root.querySelector(".curation-favorites") && !isFavorite) {
    button.closest(".bundle-card")?.remove();
    const hasItems = Boolean(root.querySelector("[data-favorites-list] .bundle-card"));
    const list = root.querySelector("[data-favorites-list]");
    const empty = root.querySelector("[data-favorites-empty]");
    if (list) list.hidden = !hasItems;
    if (empty) empty.hidden = hasItems;
  }
  const count = await setFavoriteState(id, isFavorite);
  if (count !== null) updateFavoriteCount(root, id, count);
  root.querySelectorAll("[data-favorite-id]").forEach(item => {
    if (item.dataset.favoriteId === id) item.disabled = false;
  });
}

function selectSubject(root, config, state, nextSchool, nextSubject, restoreFocus = false) {
  if (!normalizeTeacherProfile({ school: nextSchool, subject: nextSubject }, state.subjectOptions)) return;
  if (nextSchool === state.profile.school && nextSubject === state.profile.subject) return;

  state.profile = { school: nextSchool, subject: nextSubject };
  state.unit = "";
  state.middleUnit = "";
  state.kind = "all";
  state.query = "";
  saveTeacherProfile(state.profile, state.subjectOptions);
  renderCurationHome(root, config, state, restoreFocus ? "subject" : "");
  if (root.id === "lesson-library") root.scrollIntoView({ block: "start", behavior: "instant" });
}

function applyLibraryFilter(root, state) {
  const query = normalizeSearch(state.query);
  const visibleIds = new Set();
  root.querySelectorAll("[data-library-item]").forEach(item => {
    const kindMatch = state.kind === "all" || item.dataset.kind === state.kind;
    const queryMatch = !query || (item.dataset.search || "").includes(query);
    const middleMatch = !state.middleUnit || JSON.parse(item.dataset.middleUnits || "[]").includes(state.middleUnit);
    item.hidden = !(kindMatch && queryMatch && middleMatch);
    if (!item.hidden) visibleIds.add(item.dataset.resourceId);
  });
  root.querySelectorAll("[data-library-section]").forEach(section => {
    const count = [...section.querySelectorAll("[data-library-item]")].filter(item => !item.hidden).length;
    section.querySelector("[data-section-count]").textContent = `${count}개 자료`;
    section.hidden = !state.unit && count === 0;
  });
  const countLabel = root.querySelector("[data-library-count]");
  if (countLabel) countLabel.textContent = `수업 ${visibleIds.size}개${state.middleUnit ? ` · ${state.middleUnit}` : ""}`;
  const empty = root.querySelector("[data-library-empty]");
  if (empty) empty.hidden = visibleIds.size > 0;
}

function renderTeacherOnboarding(root, onComplete, initialProfile = {}, subjectOptions) {
  let step = 0;
  const draft = { ...initialProfile };

  const render = () => {
    const steps = [
      {
        label: "학교급",
        title: "어느 학교에서 가르치시나요?",
        desc: "중학교와 고등학교의 교육과정에 맞춰 자료를 나눕니다.",
        value: draft.school,
        options: SCHOOL_OPTIONS.map(option => ({ value: option.value, label: option.label, note: option.value === "중학교" ? "중등 교육과정" : "고교학점제·선택과목" })),
      },
      {
        label: "과목",
        title: "무엇을 가르치시나요?",
        desc: "선택한 과목의 수업을 첫 화면에 준비해둘게요.",
        value: draft.subject,
        options: (subjectOptions[draft.school] || []).map(({ value, label }) => ({ value, label })),
      },
    ];
    const current = steps[step];

    root.innerHTML = `
      <section class="teacher-entry" aria-labelledby="teacher-entry-title">
        <aside class="teacher-entry__intro">
          <a class="teacher-entry__brand" href="index.html">
            <span>${renderScooterPictogram()}</span><b>BOOONG</b>
          </a>
          <div>
            <span>교사를 위한 수업 준비실</span>
            <h1 id="teacher-entry-title">자료를 찾기 전에,<br>과목부터.</h1>
            <p>학교급과 과목, 두 가지만 알려주시면 필요한 수업을 먼저 꺼내놓겠습니다.</p>
          </div>
          <ol aria-label="수업 설정 단계">
            ${steps.map((item, index) => {
              const value = index === 0 ? draft.school : draft.subject;
              return `<li class="${index === step ? "is-current" : ""} ${index < step ? "is-complete" : ""}">
                <span>${index + 1}</span><small>${escapeHtml(item.label)}</small><b>${escapeHtml(value || "선택 전")}</b>
              </li>`;
            }).join("")}
          </ol>
        </aside>
        <div class="teacher-entry__panel">
          <header>
            <span>${step + 1} / 2 · ${escapeHtml(current.label)}</span>
            <h2>${escapeHtml(current.title)}</h2>
            <p>${escapeHtml(current.desc)}</p>
          </header>
          <div class="teacher-entry__options ${step === 1 ? "is-subjects" : ""}" role="group" aria-label="${escapeAttr(current.title)}">
            ${current.options.map(option => `
              <button type="button" data-profile-option="${escapeAttr(option.value)}" aria-pressed="${option.value === current.value}">
                <span>${escapeHtml(option.label)}</span>${option.note ? `<small>${escapeHtml(option.note)}</small>` : ""}<i aria-hidden="true">✓</i>
              </button>`).join("")}
          </div>
          <footer>
            ${step ? `<button class="teacher-entry__back" type="button" data-profile-back>이전</button>` : `<span></span>`}
            <button class="teacher-entry__next" type="button" data-profile-next ${current.value ? "" : "disabled"}>
              ${step === 1 ? "내 수업 준비실 열기" : "과목 고르기"}
            </button>
          </footer>
        </div>
      </section>
    `;

    root.querySelectorAll("[data-profile-option]").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.profileOption || "";
        if (step === 0) {
          if (draft.school !== value) draft.subject = "";
          draft.school = value;
        } else draft.subject = value;
        render();
      });
    });
    root.querySelector("[data-profile-back]")?.addEventListener("click", () => { step = 0; render(); });
    root.querySelector("[data-profile-next]")?.addEventListener("click", () => {
      if (step === 0) { step = 1; render(); return; }
      const profile = normalizeTeacherProfile(draft, subjectOptions);
      if (!profile) return;
      saveTeacherProfile(profile, subjectOptions);
      onComplete(profile);
    });
  };

  render();
}

function renderScooterPictogram() {
  return `<svg viewBox="0 0 24 24" role="img" focusable="false"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 15.5V11l2-2h3.5l1.5 1.5v5M10 9V5h3"/></svg>`;
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function getCurationFocusTarget(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active)) return "";
  if (active.matches("[data-library-search]")) return "search";
  if (active.matches("[data-unit]")) return "unit";
  if (active.matches("[data-middle-unit]")) return "middle";
  if (active.matches("[data-middle-select]")) return "middleSelect";
  if (active.matches("[data-library-sort]")) return "sort";
  return active.closest(".subject-roller") ? "subject" : "";
}

function restoreCurationFocus(root, target) {
  const selector = {
    search: "[data-library-search]",
    subject: "[data-subject-value][aria-pressed=\"true\"]",
    sort: "[data-library-sort]",
    middle: "[data-middle-unit][aria-pressed=\"true\"]",
    middleSelect: "[data-middle-select]",
    unit: "[data-unit][aria-pressed=\"true\"]",
  }[target];
  const element = selector ? root.querySelector(selector) : null;
  element?.focus({ preventScroll: true });
  if (target === "search") element?.setSelectionRange(element.value.length, element.value.length);
}

function warnCatalogDiagnostics(catalog) {
  if (didWarnCatalogDiagnostics || !["", "localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  const diagnostics = catalog.diagnostics || {};
  const messages = [
    diagnostics.unknownUnitCodes?.length ? `unknown unit codes: ${diagnostics.unknownUnitCodes.join(", ")}` : "",
    diagnostics.duplicateUnitCodes?.length ? `duplicate unit codes: ${diagnostics.duplicateUnitCodes.join(", ")}` : "",
    diagnostics.duplicateResourceIds?.length ? `duplicate resource ids: ${diagnostics.duplicateResourceIds.join(", ")}` : "",
  ].filter(Boolean);
  if (!messages.length) return;
  didWarnCatalogDiagnostics = true;
  console.warn(`Dashboard catalog diagnostics — ${messages.join("; ")}`);
}

function escapeAttr(value) {
  return escapeHtml(String(value || ""));
}
