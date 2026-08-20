import { loadDashboardConfig as loadSharedDashboardConfig } from "../dashboard-data.js";
import { loadFavoriteIds, saveFavoriteIds, toggleFavoriteId } from "../favorites.js";
import { SCHOOL_OPTIONS, createSubjectOptions, getAdjacentTeacherProfile, getSubjectLabel, loadTeacherProfile, normalizeTeacherProfile, saveTeacherProfile } from "../teacher-profile.js";
import { escapeHtml } from "../utils.js";
import { getLessonPageKey, trackGroupClick } from "../visitor-analytics.js";
import { hydrateViewCounts, renderResourceCount, renderViewCounter } from "./view-counter.js";

const QUICK_TOOLS = [
  { id: "worksheet-maker", label: "활동지 만들기", note: "수업 흐름을 한 장으로", href: "worksheet-maker.html", mark: "01" },
  { id: "asset-search", label: "수업자료 찾기", note: "이미지·영상·읽기 자료", href: "asset-search.html", mark: "02" },
  { id: "print-mode", label: "기출문제 고르기", note: "문항을 골라 바로 인쇄", href: "select.html", mark: "03" },
  { id: "lesson-author", label: "새 수업 만들기", note: "BNG LANG으로 직접 제작", href: "author.html", mark: "04" },
];

let didWarnCatalogDiagnostics = false;

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
  const state = { profile, subjectOptions, unit: "", kind: "all", query: "" };
  renderCurationHome(root, config, state);
  refreshDashboardConfig(root, config, state);
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
  if (!units.some(unit => unit.key === state.unit)) state.unit = units[0]?.key || "";
  const selectedUnit = units.find(unit => unit.key === state.unit) || null;
  const unitItems = selectedUnit
    ? catalog.resources
      .filter(resource => resource.unitKeys.includes(selectedUnit.key))
      .sort((a, b) => Number(b.isNew) - Number(a.isNew))
    : [];

  warnCatalogDiagnostics(catalog);

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar()}
      <main>
        ${renderHero(state.profile, subjectItems.length, state.query, subjectLabel)}
        ${renderUnitNavigator(units, selectedUnit, state.profile, unitItems, catalog.resources, state, subjectLabel)}
      </main>
      ${renderFooter()}
    </div>
  `;

  bindCurationEvents(root, config, state);
  applyLibraryFilter(root, state);
  const activeUnit = root.querySelector("[data-unit][aria-pressed=\"true\"]");
  if (activeUnit) activeUnit.parentElement.scrollLeft = activeUnit.offsetLeft - (activeUnit.parentElement.clientWidth - activeUnit.offsetWidth) / 2;
  restoreCurationFocus(root, focusTarget);
}

function renderNewLessonsView(root, config) {
  const items = config.catalog.resources.filter(resource => resource.isNew);

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar()}
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
              ${items.map(renderResourceCard).join("")}
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

function renderFavoritesView(root, config) {
  const resourceById = new Map(config.catalog.resources.map(resource => [resource.id, resource]));
  const items = loadFavoriteIds().map(id => resourceById.get(id)).filter(Boolean);

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar(true)}
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
            ${items.map(renderResourceCard).join("")}
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

function renderTopbar(favoritesCurrent = false) {
  const favoriteCount = loadFavoriteIds().length;
  return `
    <header class="curation-topbar">
      <a class="curation-brand" href="index.html" aria-label="BOOONG 홈">
        <span class="curation-brand__mark" aria-hidden="true">${renderScooterPictogram()}</span>
        <span><b>BOOONG</b><small>수업 준비실</small></span>
      </a>
      <nav class="curation-topbar__actions" aria-label="빠른 이동">
        <a class="curation-topbar__favorites ${favoritesCurrent ? "is-current" : ""}" href="index.html?view=favorites" aria-label="내 수업함, 저장한 수업 ${favoriteCount}개" ${favoritesCurrent ? `aria-current="page"` : ""}>
          <span>내 수업함</span><b data-favorite-count>${favoriteCount}</b>
        </a>
      </nav>
      ${renderViewCounter()}
    </header>
  `;
}

function renderHero(profile, count, query, subjectLabel) {
  return `
    <section class="curation-hero" aria-labelledby="curation-hero-title">
      <div class="curation-hero__copy">
        <span class="curation-kicker">${escapeHtml(profile.school)} · ${escapeHtml(subjectLabel)} 수업 준비실</span>
        <h1 id="curation-hero-title">오늘 수업,<br><em>이런 건 어떠세요?</em></h1>
        <p>${count
          ? `선생님의 과목에 맞는 수업 ${count}개를 먼저 꺼내두었습니다.`
          : "아직 꼭 맞는 꾸러미는 없지만, 바로 쓸 수 있는 제작 도구와 전체 자료를 열어두었습니다."}</p>
        <label class="curation-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value="${escapeAttr(query)}" placeholder="주제, 단원, 수업 이름으로 찾기" data-library-search>
          <kbd>검색</kbd>
        </label>
      </div>
      <a class="curation-subject-slip" href="index.html?view=new">
        <span>새로 들어온 수업</span>
        <strong>NEW</strong>
        <small>ALL SUBJECTS</small>
        <i>BOOONG<br>CURATION</i>
      </a>
    </section>
  `;
}

function renderUnitNavigator(units, selectedUnit, profile, items, resources, state, subjectLabel) {
  return `
    <section class="unit-axis" aria-labelledby="unit-axis-title">
      <header class="unit-axis__head">
        <div>
          <span>CURRICULUM MAP</span>
          <h2 id="unit-axis-title">${escapeHtml(subjectLabel)} 대단원</h2>
        </div>
        ${renderSubjectRoller(profile, state.subjectOptions)}
      </header>
      ${units.length ? `
        <div class="unit-workspace">
          <aside class="unit-picker" aria-label="대단원 목록">
            <header><span>대단원 ${units.length}개</span></header>
            <div class="unit-axis__track" role="group" aria-label="대단원 선택">
              ${units.map(unit => renderUnitTab(unit, selectedUnit, resources)).join("")}
            </div>
          </aside>
          <div class="unit-detail" id="unit-detail" aria-live="polite">
            ${renderResourcePanel(items, selectedUnit, state)}
          </div>
        </div>
      ` : `
        <div class="unit-axis__empty" aria-live="polite">
          <strong>대단원 지도를 불러오고 있습니다.</strong>
          <span>과목에 맞는 교육과정과 수업을 연결하는 중입니다.</span>
        </div>
      `}
    </section>
  `;
}

function renderSubjectRoller(profile, subjectOptions) {
  const currentSubjectLabel = getSubjectLabel(subjectOptions, profile.school, profile.subject);
  return `
    <div class="subject-roller" data-subject-roller role="group" aria-label="과목 돌려서 변경">
      <div class="subject-roller__meta">
        <span>과목 바꾸기</span>
        <strong>${escapeHtml(`${profile.school} · ${currentSubjectLabel}`)}</strong>
      </div>
      <div class="subject-roller__groups" role="radiogroup" aria-label="과목 선택" aria-live="polite">
        ${SCHOOL_OPTIONS.map(({ value: school, label }) => `
          <div class="subject-roller__group">
            <span>${escapeHtml(label)}</span>
            <div class="subject-roller__field" role="group" aria-label="${escapeAttr(label)} 과목">
              ${(subjectOptions[school] || []).map(({ value: subject, label: subjectLabel }) => {
                const selected = school === profile.school && subject === profile.subject;
                return `<button type="button" class="${selected ? "is-current" : ""}" data-subject-school="${escapeAttr(school)}" data-subject-value="${escapeAttr(subject)}" role="radio" aria-checked="${selected}" tabindex="${selected ? "0" : "-1"}">${escapeHtml(subjectLabel)}</button>`;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
      <div class="subject-roller__nav">
        <button type="button" data-subject-step="-1" aria-label="이전 과목">←</button>
        <button type="button" data-subject-step="1" aria-label="다음 과목">→</button>
      </div>
    </div>
  `;
}

function renderUnitTab(unit, selectedUnit, resources) {
  const selected = selectedUnit?.key === unit.key;
  const resourceCount = resources.filter(resource => resource.unitKeys.includes(unit.key)).length;
  return `
    <button class="unit-tab" type="button" data-unit="${escapeAttr(unit.key)}" aria-pressed="${selected}">
      <strong>${escapeHtml(unit.title)}</strong>
      <small>${resourceCount}개 자료</small>
    </button>
  `;
}

function renderResourcePanel(items, selectedUnit, state) {
  const sortedItems = [...items].sort(compareResourceByMiddleUnit);
  return `
    <section class="curation-recommendations" aria-labelledby="resource-panel-title">
      <header class="curation-section-head">
        <div>
          <span data-library-count>${sortedItems.length}개 자료</span>
          <h2 id="resource-panel-title">${escapeHtml(selectedUnit.title)}</h2>
        </div>
        <div class="unit-detail__summary">
          <strong>중단원</strong>
          ${selectedUnit.middleUnits.length
            ? `<ul>${selectedUnit.middleUnits.map(unit => `<li>${escapeHtml(unit)}</li>`).join("")}</ul>`
            : `<p>등록된 중단원이 없습니다.</p>`}
        </div>
      </header>
      <div class="curation-kind-filter" role="group" aria-label="자료 종류">
        ${renderKindButton("all", "전체", state)}
        ${renderKindButton("lesson", "수업", state)}
        ${renderKindButton("game", "게임", state)}
      </div>
      ${sortedItems.length ? `
        <div class="bundle-list" data-library-grid>
          ${sortedItems.map(item => renderResourceCard(item, selectedUnit.key)).join("")}
        </div>
        <div class="curation-library__empty" data-library-empty hidden>
          <strong>찾는 자료가 없습니다.</strong><span>검색어를 바꾸거나 전체 자료를 선택해보세요.</span>
        </div>
      ` : `
        <div class="curation-empty">
          <span>자료 0개</span>
          <h3>${escapeHtml(selectedUnit.title)}</h3>
          <p>이 대단원은 교육과정에 등록되어 있지만 연결된 자료가 아직 없습니다.</p>
        </div>
      `}
    </section>
  `;
}

function compareResourceByMiddleUnit(a, b) {
  const aNumber = Number.parseInt(a.middleUnits?.[0]?.match(/^\s*(\d+)/)?.[1] || "", 10);
  const bNumber = Number.parseInt(b.middleUnits?.[0]?.match(/^\s*(\d+)/)?.[1] || "", 10);
  if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) return 0;
  if (Number.isNaN(aNumber)) return 1;
  if (Number.isNaN(bNumber)) return -1;
  return aNumber - bNumber;
}

function renderQuickTools(config) {
  const toolsById = new Map((config.tools || []).map(tool => [tool.id, tool]));
  return `
    <aside class="curation-tools" aria-labelledby="quick-tools-title">
      <header><span>바로 준비하기</span><h2 id="quick-tools-title">수업 도구</h2></header>
      <div class="curation-tools__list">
        ${QUICK_TOOLS.map(item => {
          const tool = toolsById.get(item.id);
          return `
            <a href="${escapeAttr(tool?.link || item.href)}">
              <span>${item.mark}</span>
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.note)}</small>
              <i aria-hidden="true">→</i>
            </a>`;
        }).join("")}
      </div>
    </aside>
  `;
}

function renderKindButton(value, label, state) {
  const selected = state.kind === value;
  return `<button type="button" data-kind="${value}" aria-pressed="${selected}">${label}</button>`;
}

function renderResourceCard(item, selectedUnitKey = "") {
  const middleUnits = item.middleUnitsByKey?.[selectedUnitKey] || item.middleUnits || [];
  const isFavorite = loadFavoriteIds().includes(item.id);
  return `
    <article class="bundle-card" data-library-item data-kind="${escapeAttr(item.kind)}" data-search="${escapeAttr(item.searchText)}">
      <div class="bundle-card__content">
        <div class="bundle-card__badges">
          ${middleUnits.length ? `<span>${escapeHtml(formatUnitList(middleUnits))}</span>` : ""}
          <span>${item.kind === "game" ? "게임" : "수업"}</span>
          ${item.discipline ? `<span>${escapeHtml(item.discipline)}</span>` : ""}
          ${renderResourceCount(escapeAttr(getResourceViewKey(item)), escapeAttr(item.id))}
        </div>
        <div class="bundle-card__title-row">
          <h3>${escapeHtml(item.title)}</h3>
          <button class="bundle-favorite" type="button" data-favorite-id="${escapeAttr(item.id)}" aria-pressed="${isFavorite}" aria-label="${escapeAttr(`${item.title} ${isFavorite ? "수업함에서 빼기" : "수업함에 담기"}`)}" title="${isFavorite ? "수업함에서 빼기" : "수업함에 담기"}">
            <span class="bundle-favorite__icon" aria-hidden="true">${isFavorite ? "★" : "☆"}</span>
          </button>
        </div>
        <p>${escapeHtml(item.desc || "수업에 바로 활용할 수 있는 자료입니다.")}</p>
        ${item.makers.length ? `
          <div class="bundle-card__makers" aria-label="제작자">
          <span class="bundle-card__makers-label">MADE BY</span>
          ${item.makers.map(maker => `<a class="bundle-card__maker" href="about.html#${escapeAttr(encodeURIComponent(maker))}">${escapeHtml(maker)}</a>`).join("")}
        </div>
        ` : ""}
        <div class="bundle-actions">
          ${item.actions.map(action => renderActionLink(action, item)).join("") || `<span class="bundle-action is-disabled">자료 준비 중</span>`}
        </div>
      </div>
    </article>
  `;
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
  const title = action.key === "worksheet" ? "활동지 열기" : action.key === "blog" ? "수업 소개" : "자료 열기";
  return `<a class="bundle-action" href="${escapeAttr(action.href)}" ${action.external ? `target="_blank" rel="noopener"` : ""} ${renderTrackingData(item, action)}>
    <strong>${title}</strong><span aria-hidden="true">→</span>
  </a>`;
}

function renderTrackingData(item, action) {
  return `data-track-action data-group-id="${escapeAttr(item.id)}" data-group-title="${escapeAttr(item.title)}" data-group-type="${escapeAttr(item.kind)}" data-action-key="${escapeAttr(action.key)}"`;
}

function renderFooter() {
  return `
    <footer class="curation-footer">
      <span>사회교육공동체 BOOONG</span>
      <p>우리는 함께일 때 강하다</p>
      <a href="about.html">BOOONG 소개 →</a>
    </footer>
  `;
}

function bindCurationEvents(root, config, state) {
  hydrateViewCounts(root);

  root.querySelectorAll("[data-favorite-id]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(root, button));
  });

  root.querySelectorAll("[data-subject-step]").forEach(button => {
    button.addEventListener("click", () => rollSubject(root, config, state, Number(button.dataset.subjectStep), true));
  });
  root.querySelectorAll("[data-subject-value]").forEach(button => {
    button.addEventListener("click", () => selectSubject(root, config, state, button.dataset.subjectSchool, button.dataset.subjectValue, 0, true));
  });

  const roller = root.querySelector("[data-subject-roller]");
  roller?.addEventListener("wheel", event => {
    event.preventDefault();
    const distance = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    rollSubject(root, config, state, distance > 0 ? 1 : -1);
  }, { passive: false });
  roller?.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    rollSubject(root, config, state, event.key === "ArrowRight" ? 1 : -1, true);
  });

  let dragStartX = null;
  roller?.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    dragStartX = event.clientX;
    roller.setPointerCapture(event.pointerId);
  });
  roller?.addEventListener("pointerup", event => {
    if (dragStartX === null) return;
    const distance = event.clientX - dragStartX;
    dragStartX = null;
    if (Math.abs(distance) >= 24) rollSubject(root, config, state, distance < 0 ? 1 : -1);
  });
  roller?.addEventListener("pointercancel", () => { dragStartX = null; });

  const search = root.querySelector("[data-library-search]");
  search?.addEventListener("input", event => {
    state.query = event.target.value || "";
    applyLibraryFilter(root, state);
  });

  root.querySelectorAll("[data-unit]").forEach(button => {
    button.addEventListener("click", () => {
      state.unit = button.dataset.unit || "";
      state.kind = "all";
      state.query = "";
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

function toggleFavorite(root, button) {
  const id = button.dataset.favoriteId || "";
  const favoriteIds = saveFavoriteIds(toggleFavoriteId(loadFavoriteIds(), id));
  const isFavorite = favoriteIds.includes(id);

  root.querySelectorAll("[data-favorite-id]").forEach(item => {
    if (item.dataset.favoriteId !== id) return;
    item.setAttribute("aria-pressed", String(isFavorite));
    item.setAttribute("aria-label", `${item.closest(".bundle-card")?.querySelector("h3")?.textContent || "수업"} ${isFavorite ? "수업함에서 빼기" : "수업함에 담기"}`);
    item.title = isFavorite ? "수업함에서 빼기" : "수업함에 담기";
    item.querySelector(".bundle-favorite__icon").textContent = isFavorite ? "★" : "☆";
  });

  root.querySelectorAll("[data-favorite-count]").forEach(item => {
    item.textContent = favoriteIds.length;
    item.closest(".curation-topbar__favorites")?.setAttribute("aria-label", `내 수업함, 저장한 수업 ${favoriteIds.length}개`);
  });
  if (!root.querySelector(".curation-favorites") || isFavorite) return;

  button.closest(".bundle-card")?.remove();
  const hasItems = Boolean(root.querySelector("[data-favorites-list] .bundle-card"));
  const list = root.querySelector("[data-favorites-list]");
  const empty = root.querySelector("[data-favorites-empty]");
  if (list) list.hidden = !hasItems;
  if (empty) empty.hidden = hasItems;
}

function rollSubject(root, config, state, direction, restoreFocus = root.querySelector("[data-subject-roller]")?.contains(document.activeElement)) {
  const nextProfile = getAdjacentTeacherProfile(state.profile, state.subjectOptions, direction);
  if (nextProfile) selectSubject(root, config, state, nextProfile.school, nextProfile.subject, direction, restoreFocus);
}

function selectSubject(root, config, state, nextSchool, nextSubject, direction = 0, restoreFocus = false) {
  if (state.subjectRolling || !normalizeTeacherProfile({ school: nextSchool, subject: nextSubject }, state.subjectOptions)) return;
  if (nextSchool === state.profile.school && nextSubject === state.profile.subject) return;

  state.subjectRolling = true;
  root.querySelector("[data-subject-roller]")?.classList.add(direction >= 0 ? "is-rolling-next" : "is-rolling-prev");
  window.setTimeout(() => {
    state.profile = { school: nextSchool, subject: nextSubject };
    state.unit = "";
    state.kind = "all";
    state.query = "";
    state.subjectRolling = false;
    saveTeacherProfile(state.profile, state.subjectOptions);
    renderCurationHome(root, config, state, restoreFocus ? "subject" : "");
  }, 180);
}

function applyLibraryFilter(root, state) {
  const query = normalizeSearch(state.query);
  let count = 0;
  root.querySelectorAll("[data-library-item]").forEach(item => {
    const kindMatch = state.kind === "all" || item.dataset.kind === state.kind;
    const queryMatch = !query || (item.dataset.search || "").includes(query);
    item.hidden = !(kindMatch && queryMatch);
    if (!item.hidden) count += 1;
  });
  const countLabel = root.querySelector("[data-library-count]");
  if (countLabel) countLabel.textContent = `${count}개 자료`;
  const empty = root.querySelector("[data-library-empty]");
  if (empty) empty.hidden = count > 0;
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
  return active.closest("[data-subject-roller]") ? "subject" : "";
}

function restoreCurationFocus(root, target) {
  const selector = {
    search: "[data-library-search]",
    subject: "[data-subject-value][aria-checked=\"true\"]",
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
