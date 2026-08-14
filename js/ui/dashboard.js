import { loadDashboardConfig as loadSharedDashboardConfig } from "../dashboard-data.js";
import { SCHOOL_OPTIONS, createSubjectOptions, getAdjacentTeacherProfile, loadTeacherProfile, normalizeTeacherProfile, saveTeacherProfile } from "../teacher-profile.js";
import { escapeHtml } from "../utils.js";
import { trackGroupClick } from "../visitor-analytics.js";

const QUICK_TOOLS = [
  { id: "worksheet-maker", label: "활동지 만들기", note: "수업 흐름을 한 장으로", href: "worksheet-maker.html", mark: "01" },
  { id: "asset-search", label: "수업자료 찾기", note: "이미지·영상·읽기 자료", href: "asset-search.html", mark: "02" },
  { id: "print-mode", label: "기출문제 고르기", note: "문항을 골라 바로 인쇄", href: "select.html", mark: "03" },
  { id: "lesson-author", label: "새 수업 만들기", note: "BNG LANG으로 직접 제작", href: "author.html", mark: "04" },
];

export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.cssText = "";

  const config = await loadDashboardConfig();
  const subjectOptions = createSubjectOptions(config.catalog);
  const root = document.createElement("div");
  root.className = "curation-app";
  document.body.appendChild(root);

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
    const nextConfig = await loadDashboardConfig({ cache: false });
    if (!root.isConnected || JSON.stringify(nextConfig) === JSON.stringify(currentConfig)) return;
    const subjectOptions = createSubjectOptions(nextConfig.catalog);
    const profile = normalizeTeacherProfile(state.profile, subjectOptions);
    if (!profile) {
      renderTeacherOnboarding(root, nextProfile => startCurationHome(root, nextConfig, nextProfile, subjectOptions), {}, subjectOptions);
      return;
    }
    state.subjectOptions = subjectOptions;
    state.profile = profile;
    renderCurationHome(root, nextConfig, state);
  } catch (error) {
    console.warn("Dashboard refresh failed:", error);
  }
}

function renderCurationHome(root, config, state) {
  const items = createLibraryItems(config);
  const subjectItems = items
    .filter(item => item.subjects.includes(state.profile.subject) && item.schools.includes(state.profile.school))
    .sort((a, b) => a.order - b.order);
  const units = createUnitIndex(subjectItems);
  if (!units.some(unit => unit.key === state.unit)) state.unit = units[0]?.key || "";
  const selectedUnit = units.find(unit => unit.key === state.unit) || null;
  const unitItems = selectedUnit ? subjectItems.filter(item => item.unitKeys.includes(selectedUnit.key)) : [];

  root.innerHTML = `
    <div class="curation-shell">
      ${renderTopbar()}
      <main>
        ${renderHero(state.profile, subjectItems.length)}
        ${renderUnitNavigator(units, selectedUnit, state.profile, unitItems, state.subjectOptions)}
        ${renderLibrarySection(unitItems, selectedUnit, state)}
      </main>
      ${renderFooter()}
    </div>
  `;

  bindCurationEvents(root, config, state);
  applyLibraryFilter(root, state);
  const activeUnit = root.querySelector("[data-unit][aria-selected=\"true\"]");
  if (activeUnit) activeUnit.parentElement.scrollLeft = activeUnit.offsetLeft - (activeUnit.parentElement.clientWidth - activeUnit.offsetWidth) / 2;
}

function renderTopbar() {
  return `
    <header class="curation-topbar">
      <a class="curation-brand" href="index.html" aria-label="BOOONG 홈">
        <span class="curation-brand__mark" aria-hidden="true">${renderScooterPictogram()}</span>
        <span><b>BOOONG</b><small>수업 준비실</small></span>
      </a>
      <a class="curation-topbar__about" href="about.html">만든 사람들</a>
    </header>
  `;
}

function renderHero(profile, count) {
  return `
    <section class="curation-hero" aria-labelledby="curation-hero-title">
      <div class="curation-hero__copy">
        <span class="curation-kicker">${escapeHtml(profile.school)} · ${escapeHtml(profile.subject)} 수업 준비실</span>
        <h1 id="curation-hero-title">오늘 수업,<br><em>어디서 시작할까요?</em></h1>
        <p>${count
          ? `선생님의 과목에 맞는 수업 꾸러미 ${count}개를 먼저 꺼내두었습니다.`
          : "아직 꼭 맞는 꾸러미는 없지만, 바로 쓸 수 있는 제작 도구와 전체 자료를 열어두었습니다."}</p>
        <label class="curation-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="주제, 단원, 수업 이름으로 찾기" data-library-search>
          <kbd>검색</kbd>
        </label>
      </div>
      <div class="curation-subject-slip" aria-hidden="true">
        <span>${profile.school === "중학교" ? "MIDDLE" : "HIGH"}</span>
        <strong>${escapeHtml(profile.subject)}</strong>
        <small>TEACHER'S EDITION</small>
        <i>BOOONG<br>CURATION</i>
      </div>
    </section>
  `;
}

function renderUnitNavigator(units, selectedUnit, profile, items, subjectOptions) {
  return `
    <section class="unit-axis" aria-labelledby="unit-axis-title">
      <header class="unit-axis__head">
        <div>
          <span>CURRICULUM MAP</span>
          <h2 id="unit-axis-title">${escapeHtml(profile.subject)} 대단원</h2>
        </div>
        ${renderSubjectRoller(profile, subjectOptions)}
        <p>현재 진도에 맞는 대단원을 고르면 그 아래 수업만 꺼내드립니다.</p>
      </header>
      ${units.length ? `
        <div class="unit-workspace">
          <aside class="unit-picker" aria-label="대단원 목록">
            <header><span>대단원</span><small>${units.length}개</small></header>
            <div class="unit-axis__track" role="tablist" aria-label="대단원 선택">
              ${units.map((unit, index) => renderUnitTab(unit, index, selectedUnit)).join("")}
            </div>
          </aside>
          <div class="unit-detail" id="unit-detail" role="tabpanel" aria-live="polite">
            ${renderRecommendationSection(items, selectedUnit, profile)}
          </div>
        </div>
      ` : `
        <div class="unit-axis__empty" aria-live="polite">
          <strong>대단원 지도를 불러오고 있습니다.</strong>
          <span>과목에 맞는 교육과정과 수업 꾸러미를 연결하는 중입니다.</span>
        </div>
      `}
    </section>
  `;
}

function renderSubjectRoller(profile, subjectOptions) {
  return `
    <div class="subject-roller" data-subject-roller tabindex="0" role="group" aria-label="과목 돌려서 변경">
      <div class="subject-roller__meta">
        <span>ALL SUBJECTS</span>
        <strong>${escapeHtml(`${profile.school} · ${profile.subject}`)}</strong>
      </div>
      <div class="subject-roller__groups" aria-live="polite">
        ${SCHOOL_OPTIONS.map(({ value: school, label }) => `
          <div class="subject-roller__group">
            <span>${escapeHtml(label)}</span>
            <div class="subject-roller__field" role="radiogroup" aria-label="${escapeAttr(label)} 과목">
              ${(subjectOptions[school] || []).map(subject => {
                const selected = school === profile.school && subject === profile.subject;
                return `<button type="button" class="${selected ? "is-current" : ""}" data-subject-school="${escapeAttr(school)}" data-subject-value="${escapeAttr(subject)}" role="radio" aria-checked="${selected}">${escapeHtml(subject)}</button>`;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
      <div class="subject-roller__nav">
        <button type="button" data-subject-step="-1" aria-label="이전 과목">←</button>
        <small>WHEEL · DRAG · ← →</small>
        <button type="button" data-subject-step="1" aria-label="다음 과목">→</button>
      </div>
    </div>
  `;
}

function renderUnitTab(unit, index, selectedUnit) {
  const selected = selectedUnit?.key === unit.key;
  const parts = parseUnitLabel(unit.label);
  return `
    <button class="unit-tab" type="button" role="tab" data-unit="${escapeAttr(unit.key)}" aria-selected="${selected}" aria-controls="unit-detail">
      <span>${escapeHtml(parts.number || String(index + 1).padStart(2, "0"))}</span>
      <strong>${escapeHtml(parts.title)}</strong>
      <small>${escapeHtml(`${unit.items.length}개 꾸러미`)}</small>
      ${unit.middleUnits.length ? `<em>${escapeHtml(unit.middleUnits.slice(0, 2).join(" · "))}</em>` : ""}
    </button>
  `;
}

function renderRecommendationSection(items, selectedUnit, profile) {
  const unitTitle = selectedUnit?.label || `${profile.subject} 대단원`;
  if (!items.length) {
    return `
      <section class="curation-recommendations" aria-labelledby="recommendation-title">
        ${renderSectionHeading(unitTitle, `${profile.subject} 수업 꾸러미를 채우는 중입니다.`, "선택한 대단원")}
        <div class="curation-empty">
          <span>준비 중</span>
          <h3>${escapeHtml(unitTitle)} 꾸러미를 기다리고 있어요.</h3>
          <p>아래 자료 서랍에서 다른 수업을 살펴보거나, 새 수업을 직접 만들 수 있습니다.</p>
          <a href="author.html">새 수업 만들기 →</a>
        </div>
      </section>
    `;
  }

  const [featured, ...rest] = items;
  return `
    <section class="curation-recommendations" aria-labelledby="recommendation-title">
      ${renderSectionHeading(unitTitle, "이 대단원에 연결된 수업과 활동입니다.", `${items.length}개 꾸러미`)}
      <div class="curation-recommendation-grid">
        ${renderFeaturedBundle(featured)}
        <div class="curation-recommendation-stack">
          ${rest.slice(0, 3).map(renderCompactBundle).join("") || renderSmallEmpty()}
        </div>
      </div>
    </section>
  `;
}

function renderSectionHeading(title, desc, label) {
  return `
    <header class="curation-section-head">
      <div><span>${escapeHtml(label)}</span><h2 id="recommendation-title">${escapeHtml(title)}</h2></div>
      <p>${escapeHtml(desc)}</p>
    </header>
  `;
}

function renderFeaturedBundle(item) {
  return `
    <article class="bundle-feature" style="--bundle-color:${escapeAttr(item.color)}">
      <div class="bundle-feature__tab">${escapeHtml(item.discipline)}</div>
      <div class="bundle-feature__body">
        <span class="bundle-meta">${escapeHtml(item.kind === "game" ? "수업 게임" : `${item.lessonCount || item.actions.length}개 차시`)} · ${escapeHtml(item.primarySubject)}</span>
        <h3>${formatText(item.title)}</h3>
        <p>${escapeHtml(item.desc || "수업에 바로 활용할 수 있도록 자료를 한데 모았습니다.")}</p>
        <div class="bundle-actions">
          ${item.actions.slice(0, 4).map(action => renderActionLink(action, item)).join("") || `<span class="bundle-action is-disabled">연결 준비 중</span>`}
        </div>
      </div>
      <span class="bundle-feature__stamp" aria-hidden="true">READY<br>TO CLASS</span>
    </article>
  `;
}

function renderCompactBundle(item) {
  const action = item.actions[0];
  const content = `
    <span class="bundle-compact__index">${escapeHtml(item.discipline.slice(0, 2))}</span>
    <span class="bundle-compact__body">
      <small>${escapeHtml(item.primarySubject)} · ${item.kind === "game" ? "게임" : `${item.lessonCount || item.actions.length}차시`}</small>
      <strong>${formatText(item.title)}</strong>
    </span>
    <span class="bundle-compact__arrow" aria-hidden="true">↗</span>`;
  return action
    ? `<a class="bundle-compact" href="${escapeAttr(action.href)}" ${action.external ? `target="_blank" rel="noopener"` : ""} ${renderTrackingData(item, action)}>${content}</a>`
    : `<article class="bundle-compact is-disabled">${content}</article>`;
}

function renderSmallEmpty() {
  return `<div class="curation-small-empty"><span>+</span><p>다음 추천 꾸러미가 이곳에 쌓입니다.</p></div>`;
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

function renderLibrarySection(items, selectedUnit, state) {
  const unitTitle = selectedUnit?.label || state.profile.subject;
  return `
    <section class="curation-library" id="library" aria-labelledby="library-title">
      <header class="curation-library__head">
        <div>
          <span>선택한 단원 자료 서랍</span>
          <h2 id="library-title">${escapeHtml(unitTitle)} 자료</h2>
        </div>
        <div class="curation-kind-filter" role="group" aria-label="자료 종류">
          ${renderKindButton("all", "전체", state)}
          ${renderKindButton("lesson", "수업", state)}
          ${renderKindButton("game", "게임", state)}
        </div>
      </header>
      <div class="curation-library__meta"><span data-library-count>${items.length}개 자료</span><p>추천 자료를 먼저 보여줍니다.</p></div>
      <div class="curation-library__grid" data-library-grid>
        ${items.map(renderLibraryCard).join("")}
      </div>
      <div class="curation-library__empty" data-library-empty hidden>
        <strong>찾는 자료가 없습니다.</strong><span>검색어를 바꾸거나 전체 자료를 선택해보세요.</span>
      </div>
    </section>
  `;
}

function renderKindButton(value, label, state) {
  const selected = state.kind === value;
  return `<button type="button" data-kind="${value}" aria-pressed="${selected}">${label}</button>`;
}

function renderLibraryCard(item) {
  const action = item.actions[0];
  const tag = action ? "a" : "article";
  const attrs = action
    ? `href="${escapeAttr(action.href)}" ${action.external ? `target="_blank" rel="noopener"` : ""} ${renderTrackingData(item, action)}`
    : "aria-disabled=\"true\"";
  return `
    <${tag} class="library-card ${action ? "" : "is-disabled"}" ${attrs}
      data-library-item data-kind="${item.kind}" data-search="${escapeAttr(item.searchText)}">
      <span class="library-card__rail" style="--bundle-color:${escapeAttr(item.color)}">${escapeHtml(item.discipline)}</span>
      <span class="library-card__content">
        <small>${escapeHtml(item.primarySubject)} · ${item.kind === "game" ? "게임" : `${item.lessonCount || item.actions.length}차시`}</small>
        <strong>${formatText(item.title)}</strong>
        <span>${escapeHtml(item.desc || "수업 꾸러미 열기")}</span>
      </span>
      <i aria-hidden="true">↗</i>
    </${tag}>
  `;
}

function renderActionLink(action, item) {
  return `<a class="bundle-action" href="${escapeAttr(action.href)}" ${action.external ? `target="_blank" rel="noopener"` : ""} ${renderTrackingData(item, action)}>
    <small>${escapeHtml(action.label)}</small><strong>${escapeHtml(action.title)}</strong><span aria-hidden="true">→</span>
  </a>`;
}

function renderTrackingData(item, action) {
  return `data-track-action data-group-id="${escapeAttr(item.id)}" data-group-title="${escapeAttr(stripHtml(item.title))}" data-group-type="${escapeAttr(item.kind)}" data-action-key="${escapeAttr(action.key)}"`;
}

function renderFooter() {
  return `
    <footer class="curation-footer">
      <span>사회교육공동체 BOOONG</span>
      <p>교사의 준비 시간을 줄이고, 수업의 선택지는 넓힙니다.</p>
      <a href="about.html">BOOONG 소개 →</a>
    </footer>
  `;
}

function bindCurationEvents(root, config, state) {
  root.querySelectorAll("[data-subject-step]").forEach(button => {
    button.addEventListener("click", () => rollSubject(root, config, state, Number(button.dataset.subjectStep)));
  });
  root.querySelectorAll("[data-subject-value]").forEach(button => {
    button.addEventListener("click", () => selectSubject(root, config, state, button.dataset.subjectSchool, button.dataset.subjectValue));
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
    rollSubject(root, config, state, event.key === "ArrowRight" ? 1 : -1);
  });

  let dragStartX = null;
  roller?.addEventListener("pointerdown", event => {
    if (event.target.closest("[data-subject-step]")) return;
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
      renderCurationHome(root, config, state);
    });
  });

  root.querySelectorAll("[data-kind]").forEach(button => {
    button.addEventListener("click", () => {
      state.kind = button.dataset.kind || "all";
      root.querySelectorAll("[data-kind]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
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

function rollSubject(root, config, state, direction) {
  const nextProfile = getAdjacentTeacherProfile(state.profile, state.subjectOptions, direction);
  if (nextProfile) selectSubject(root, config, state, nextProfile.school, nextProfile.subject, direction);
}

function selectSubject(root, config, state, nextSchool, nextSubject, direction = 0) {
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
    renderCurationHome(root, config, state);
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
        desc: "선택한 과목의 수업 꾸러미를 첫 화면에 준비해둘게요.",
        value: draft.subject,
        options: (subjectOptions[draft.school] || []).map(subject => ({ value: subject, label: subject })),
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
            <h1 id="teacher-entry-title">자료를 찾기 전에,<br>선생님의 과목부터.</h1>
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

function createLibraryItems(config) {
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const games = Array.isArray(config.games) ? config.games : [];
  const knownIds = new Set(groups.map(group => group.id).filter(Boolean));
  const items = groups.map(createGroupItem);
  games.filter(game => !knownIds.has(game.id)).forEach(game => items.push(createGameItem(game)));
  return items.map((item, order) => ({ ...item, order }));
}

function createGroupItem(group) {
  if (normalizeKind(group.kind) === "game") return createGameItem(group);
  const lessons = Array.isArray(group.lessons) ? group.lessons : [];
  const actions = [createLessonAction(group.zeroSession, group, true), ...lessons.map(lesson => createLessonAction(lesson, group, false))].filter(Boolean);
  return createBaseItem(group, {
    kind: "lesson",
    lessonCount: lessons.length,
    actions,
  });
}

function createGameItem(game) {
  const links = Array.isArray(game.links) ? game.links : [];
  const actions = links.map((link, index) => createGameAction(link, game, index)).filter(Boolean);
  if (!actions.length && game.link) actions.push(createGameAction({ link: game.link, label: game.tag || "게임", title: "게임 열기" }, game, 0));
  if (game.worksheet) {
    const href = /^https?:\/\//i.test(game.worksheet)
      ? game.worksheet
      : `worksheet-maker.html?${new URLSearchParams({ game: game.id || "", worksheet: game.worksheet })}`;
    actions.push(createGameAction({ link: href, label: "학습지", title: "학습지 열기" }, game, actions.length));
  }
  return createBaseItem(game, { kind: "game", lessonCount: 0, actions });
}

function createBaseItem(source, extra) {
  const subjects = splitList(source.subject);
  const schools = splitList(source.school);
  const primarySubject = subjects[0] || "미분류";
  const discipline = normalizeDiscipline(source.discipline || primarySubject);
  const majorUnits = splitList(source.majorUnit);
  const middleUnits = splitList(source.middleUnit);
  const unitKeys = majorUnits.length ? majorUnits.map(normalizeUnitKey) : ["__unassigned__"];
  return {
    id: source.id || `item-${Math.random().toString(36).slice(2)}`,
    title: source.title || "수업 꾸러미",
    desc: source.desc || "",
    subjects,
    subject: primarySubject,
    primarySubject,
    discipline,
    majorUnits,
    middleUnits,
    unitKeys,
    schools: schools.length ? schools : ["기타"],
    color: getDisciplineColor(discipline),
    searchText: normalizeSearch([source.title, source.desc, source.subject, source.discipline, source.majorUnit, source.middleUnit].join(" ")),
    ...extra,
  };
}

function createUnitIndex(items) {
  const units = new Map();
  items.forEach(item => {
    item.unitKeys.forEach((key, index) => {
      if (!units.has(key)) {
        units.set(key, {
          key,
          label: key === "__unassigned__" ? "단원 미지정" : item.majorUnits[index] || item.majorUnits[0] || "단원 미지정",
          items: [],
          middleUnits: [],
        });
      }
      const unit = units.get(key);
      unit.items.push(item);
      const middleUnit = item.middleUnits[index] || (item.middleUnits.length === 1 ? item.middleUnits[0] : "");
      if (middleUnit && !unit.middleUnits.includes(middleUnit)) unit.middleUnits.push(middleUnit);
    });
  });
  return [...units.values()].sort(compareUnits);
}

function compareUnits(a, b) {
  if (a.key === "__unassigned__") return 1;
  if (b.key === "__unassigned__") return -1;
  const aOrder = getCurriculumUnitOrder(a.label);
  const bOrder = getCurriculumUnitOrder(b.label);
  return aOrder - bOrder || a.label.localeCompare(b.label, "ko");
}

function getCurriculumUnitOrder(label) {
  const head = String(label || "").trim().match(/^([IVXLCDM]+|\d+)/i)?.[1] || "";
  if (/^\d+$/.test(head)) return Number(head);
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let previous = 0;
  [...head.toUpperCase()].reverse().forEach(char => {
    const value = values[char] || 0;
    total += value < previous ? -value : value;
    previous = Math.max(previous, value);
  });
  return total || Number.MAX_SAFE_INTEGER;
}

function parseUnitLabel(label) {
  if (label === "단원 미지정") return { number: "ETC", title: label };
  const match = String(label || "").match(/^([^\s.]+)\.?\s*(.*)$/);
  return { number: match?.[1] || "", title: match?.[2] || label };
}

function normalizeUnitKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function createLessonAction(lesson, group, isZero) {
  if (!lesson) return null;
  const href = lesson.link || lesson.href || (!isZero && lesson.id ? `?lesson=${encodeURIComponent(lesson.id)}` : "");
  if (!href) return null;
  return {
    key: `lesson:${group.id || "group"}:${lesson.id || lesson.label || "item"}`,
    label: lesson.label || (isZero ? "지도안" : "차시"),
    title: lesson.title || (isZero ? "지도안 및 수업자료" : "수업 열기"),
    href,
    external: /^https?:\/\//i.test(href),
  };
}

function createGameAction(link, game, index) {
  const href = link.link || link.href || "";
  if (!href) return null;
  return {
    key: `game:${game.id || "game"}:${link.id || index}`,
    label: link.label || game.tag || "게임",
    title: link.title || "게임 열기",
    href,
    external: /^https?:\/\//i.test(href),
  };
}

function renderScooterPictogram() {
  return `<svg viewBox="0 0 24 24" role="img" focusable="false"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 15.5V11l2-2h3.5l1.5 1.5v5M10 9V5h3"/></svg>`;
}

function normalizeKind(value) {
  return String(value || "").toLowerCase() === "game" ? "game" : "lesson";
}

function normalizeDiscipline(value) {
  const discipline = String(value || "미분류").trim();
  return discipline === "사회학" ? "사회" : discipline;
}

function getDisciplineColor(value) {
  const colors = { 사회: "#2357d9", 법: "#2d6a4f", 정치: "#e45c3a", 경제: "#8a9f26", 지리: "#a36a32", 역사: "#6e4ba3", 윤리: "#be4b74" };
  return colors[value] || "#53645d";
}

function splitList(value) {
  return String(value || "").split(/[,\n;/|]+/).map(item => item.trim()).filter(Boolean);
}

function normalizeSearch(value) {
  return stripHtml(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatText(value) {
  return escapeHtml(String(value || "")).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function escapeAttr(value) {
  return escapeHtml(String(value || ""));
}
