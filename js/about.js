import { createMakerWorkMap, createWorkMap, getMemberLookupKeys, loadCachedDashboardConfig, loadDashboardConfig } from "./dashboard-data.js";
import { loadMembers, memberFeaturedWorks } from "./member-data.js";
import { loadManagedThumbnails, thumbnailUrl } from "./thumbnail-data.js";
import { memberTrainingCareer, normalizeTrainingMembers } from "./member-training.js";
import { escapeHtml } from "./utils.js";
import { getLessonPageKey, loadGroupClickStats, loadPageVisitStats } from "./visitor-analytics.js";

const root = document.getElementById("about-root");

const MEMBER_COLORS = {
  choi: { color: "#1B6BFF", bg: "#E6EEFF" },
  hyum: { color: "#FF8C1B", bg: "#FFF3E6" },
  do: { color: "#2E7D4F", bg: "#EAF5EE" },
  han: { color: "#8B5CF6", bg: "#F9F4FF" },
};

const state = {
  members: [],
  workMap: new Map(),
  makerWorkMap: new Map(),
  resourcesById: new Map(),
  thumbnails: {},
  selectedMemberId: "",
  galleryIndex: 0,
  pageViews: new Map(),
  linkClicks: new Map(),
  trainings: [],
  trainingError: false,
  trainingLoading: false,
};

init();

async function init() {
  root.innerHTML = renderLoading();

  try {
    state.members = await loadMembers();
    applyDashboardConfig(loadCachedDashboardConfig());

    renderAbout();
    refreshWorks();
    refreshPreviewThumbnails();
    refreshWorkStats();
    refreshTraining();
  } catch (err) {
    root.innerHTML = renderError(err);
  }
}

async function refreshTraining() {
  if (state.trainingLoading) return;
  state.trainingLoading = true;
  const retry = root.querySelector("[data-action='retry-training']");
  if (retry) retry.disabled = true;
  try {
    const response = await fetch('/api/rice-basket?route=/api/member-training', { credentials: 'omit' });
    if (!response.ok) throw new Error('연수 이력을 불러오지 못했습니다.');
    const { trainings } = await response.json();
    if (!Array.isArray(trainings) || trainings.some(t => !t || ['name', 'school', 'lectureDate'].some(key => typeof t[key] !== 'string'))) throw new Error('연수 이력 형식을 확인해 주세요.');
    state.trainings = trainings.map(t => ({ ...t, memberCodes: normalizeTrainingMembers(t.memberCodes) }));
    state.trainingError = false;
  } catch (error) {
    state.trainingError = true;
    console.warn('Member training refresh failed:', error);
  } finally {
    state.trainingLoading = false;
    renderMemberDetail();
  }
}

async function refreshWorks() {
  try {
    applyDashboardConfig(await loadDashboardConfig());
    refreshMemberPreviews();
    renderMemberDetail();
  } catch (err) {
    console.warn("About works refresh failed:", err);
  }
}

async function refreshWorkStats() {
  const [pages, clicks] = await Promise.all([loadPageVisitStats(), loadGroupClickStats()]);
  state.pageViews = new Map(pages.map(page => [page.key, page.views]));
  state.linkClicks = new Map(clicks.map(click => [click.groupId, click.views]));
  root.querySelectorAll("[data-work-metric]").forEach(slot => {
    const values = slot.dataset.metricType === "조회수" ? state.pageViews : state.linkClicks;
    const value = values.get(slot.dataset.metricKey);
    slot.querySelector("strong").textContent = value == null ? "—" : Number(value).toLocaleString("ko-KR");
  });
}

function applyDashboardConfig(config) {
  if (!config) {
    state.workMap = new Map();
    state.makerWorkMap = new Map();
    return;
  }
  state.resourcesById = new Map((config.catalog?.resources || []).map(resource => [resource.id, resource]));
  state.workMap = createWorkMap(config.groups || [], config.games || [], config.catalog?.resources || []);
  state.makerWorkMap = createMakerWorkMap(state.workMap, state.members);
}

function renderMemberDetail() {
  const detail = root.querySelector(".member-detail");
  if (!detail) return;
  const selectedMember = getSelectedMember();
  if (!selectedMember) return;
  const scroller = root.querySelector('.member-profile-dialog') || detail;
  const scrollTop = scroller.scrollTop;
  const restoreFocus = detail.contains?.(document.activeElement);
  const expanded = detail.querySelector("[data-action='toggle-training']")?.getAttribute("aria-expanded") === "true";
  detail.innerHTML = renderMemberCard(selectedMember, resolveMemberWorks(selectedMember, state.makerWorkMap));
  bindMemberCardActions();
  const toggle = detail.querySelector("[data-action='toggle-training']");
  if (expanded && toggle) { toggle.setAttribute('aria-expanded', 'true');toggle.nextElementSibling.inert = false; }
  if (restoreFocus) root.querySelector('.member-card')?.focus({ preventScroll: true });
  scroller.scrollTop = scrollTop;
}

function renderAbout() {
  const initial = getInitialSelectedMemberId(state.members);
  state.galleryIndex = initial ? state.members.findIndex(member => isSameMember(member.id, initial)) + 1 : 0;
  root.innerHTML = `
    <main class="about about-gallery-shell">
      <nav class="about__nav" aria-label="소개 페이지 이동">
        <a class="about__brand" href="about.html"><b>BOOONG</b><span>사회교육공동체</span></a>
        <a class="about__back" href="index.html">수업 준비실 ↗</a>
      </nav>
      <section class="about-gallery" aria-label="BOOONG과 구성원" aria-roledescription="carousel">
        <div class="about-gallery__stage" tabindex="0" aria-label="소개 카드. 휠, 좌우 방향키 또는 드래그로 이동">
          <article class="gallery-card gallery-card--intro" data-gallery-card="0" aria-roledescription="slide" aria-label="BOOONG 소개">
            <img class="gallery-card__image" src="assets/about-hero.jpg?v=20260427" alt="" fetchpriority="high" decoding="async">
            <div class="gallery-card__intro-copy">
              <h1>타자를 돕고,<br>타자로서 돕는<br>사람들</h1>
              <blockquote>타자를 돕는 일을 도우며,<br>미래-타자의 출현에 열린 지식과 기술은 어떤 얼굴일까.
                <cite>『사이보그가 되다』, 김원영·김초엽, 2021</cite>
              </blockquote>
              <span class="gallery-card__action">구성원 만나기 <span aria-hidden="true">→</span></span>
            </div>
            ${state.members.length ? '<button class="gallery-card__open" type="button" data-open-slide="0" aria-label="구성원 만나기"></button>' : ''}
          </article>
          ${state.members.map((member, index) => renderMemberPreview(member, index + 1)).join('')}
        </div>
        <div class="about-gallery__controls">
          <button class="gallery-arrow" type="button" data-gallery-step="-1" aria-label="이전 소개">←</button>
          <div class="gallery-caption" aria-live="polite" aria-atomic="true"><strong data-gallery-caption>BOOONG</strong><span data-gallery-count></span></div>
          <button class="gallery-arrow" type="button" data-gallery-step="1" aria-label="다음 소개">→</button>
        </div>
        <nav class="gallery-index" aria-label="소개 바로가기">
          <button type="button" data-gallery-index="0">BOOONG</button>
          ${state.members.map((member, index) => `<button type="button" data-gallery-index="${index + 1}">${escapeHtml(getMemberCode(member))}</button>`).join('')}
        </nav>
      </section>
      <footer class="about__footer"><span>BOOONG ${new Date().getFullYear()}</span><a href="mailto:jinyoung1571@naver.com">연락하기 ↗</a></footer>
      <dialog class="member-profile-dialog" aria-label="구성원 프로필"><div class="member-detail"></div></dialog>
    </main>`;
  bindAboutGallery();
}

async function refreshPreviewThumbnails() {
  try {
    state.thumbnails = await loadManagedThumbnails();
    refreshMemberPreviews();
    renderMemberDetail();
  } catch (error) { console.warn('Member preview thumbnails unavailable:', error); }
}

function memberAffiliations(member) {
  const year = new Date().getFullYear();
  return normalizeCareer(member.career).filter(item => {
    const start = Number(item.period.match(/(?:19|20)\d{2}/)?.[0]);
    return !/예정/.test(item.place) && (!start || start <= year);
  }).slice(0, 2);
}

function renderFeaturedWork(member) {
  const works = memberFeaturedWorks(member, resolveMemberWorks(member, state.makerWorkMap));
  if (!works.length) return '';
  return `<h3 class="gallery-work__label">대표 콘텐츠</h3><div class="gallery-works">${works.map(work => {
    const resource = state.resourcesById.get(work.id) || { id: work.id };
    return `<a class="gallery-work" data-preview-work href="${escapeAttr(work.href)}" ${work.external ? 'target="_blank" rel="noopener noreferrer"' : ''}>
      <img class="gallery-work__image" src="${escapeAttr(thumbnailUrl(resource, state.thumbnails[work.id]))}" alt="" width="800" height="500" loading="lazy" decoding="async">
      <span class="gallery-work__title">${escapeHtml(work.title)} <span aria-hidden="true">${work.external ? '↗' : '→'}</span></span>
    </a>`;
  }).join('')}</div>`;
}

function refreshMemberPreviews() {
  root.querySelectorAll('[data-member-feature]').forEach(target => {
    const index = Number(target.dataset.memberFeature);
    target.innerHTML = renderFeaturedWork(state.members[index - 1]);
    target.closest('[data-gallery-card]').classList.toggle('has-feature', Boolean(target.innerHTML));
    target.querySelectorAll('[data-preview-work]').forEach(link => { link.tabIndex = index === state.galleryIndex ? 0 : -1; });
    target.querySelectorAll('img').forEach(img => img.addEventListener('error', event => {
      event.target.src = '/assets/lesson-thumbnails/social-studies-default-v1.jpg';
    }, { once: true }));
  });
}

function renderMemberPreview(member, index) {
  const { color, bg } = getMemberColors(member);
  const affiliations = memberAffiliations(member);
  return `<article class="gallery-card gallery-card--member" data-gallery-card="${index}" aria-roledescription="slide" aria-label="${escapeAttr(member.name)} 소개" style="--member-color:${escapeAttr(color)};--member-bg:${escapeAttr(bg)}">
    <div class="gallery-card__person">
    <div class="gallery-card__identity"><div><span class="gallery-card__code${getMemberCode(member).length > 6 ? ' gallery-card__code--long' : ''}" aria-hidden="true">${escapeHtml(getMemberCode(member))}</span><h2>${escapeHtml(member.name || member.id)}</h2></div><span class="gallery-card__profile" aria-hidden="true">↗</span></div>
    ${renderMemberStatement(member)}
    ${affiliations.length ? `<ul class="gallery-card__careers" aria-label="최근 경력">${affiliations.map(affiliation => `<li class="gallery-card__affiliation"><strong>${escapeHtml(affiliation.place)}</strong>${affiliation.period ? `<span>${escapeHtml(affiliation.period)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="gallery-card__feature" data-member-feature="${index}"></div>
    <button class="gallery-card__open" type="button" data-open-slide="${index}" aria-label="${escapeAttr(member.name || member.id)} 프로필과 만든 자료 보기"></button>
  </article>`;
}

function renderMemberStatement(member) {
  const interests = splitInterests(member.interests);
  if (!member.bio && !interests.length) return '';
  return `<div class="gallery-card__statement">
    ${member.bio ? `<p class="gallery-card__bio">${escapeHtml(member.bio)}</p>` : ''}
    ${interests.length ? `<div class="gallery-card__interest-group"><span class="gallery-card__interest-label">관심사</span><ul class="gallery-card__interests" aria-label="관심사">${interests.map(interest => `<li>${escapeHtml(interest)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}

function galleryOffset(index, active, total) {
  const distance = ((index - active) % total + total) % total;
  return distance > total / 2 ? distance - total : distance;
}

function paintGalleryPosition(position) {
  const total = state.members.length + 1;
  root.querySelectorAll('[data-gallery-card]').forEach((card, i) => {
    const offset = galleryOffset(i, position, total);
    card.style.setProperty('--offset', offset);
    card.style.setProperty('--card-scale', 1 - Math.min(1, Math.abs(offset)) * .1);
    card.style.setProperty('--card-opacity', 1 - Math.min(1, Math.abs(offset)) * .35);
    card.hidden = Math.abs(offset) > 2;
  });
}

function showGallerySlide(index, updateHash = true) {
  const total = state.members.length + 1;
  settleGalleryMotion?.(index);
  state.galleryIndex = (index % total + total) % total;
  const focusedCard = document.activeElement?.closest?.('[data-gallery-card]');
  if (focusedCard && Number(focusedCard.dataset.galleryCard) !== state.galleryIndex) root.querySelector('.about-gallery__stage')?.focus({ preventScroll: true });
  paintGalleryPosition(state.galleryIndex);
  root.querySelectorAll('[data-gallery-card]').forEach((card, i) => {
    const offset = galleryOffset(i, state.galleryIndex, total);
    card.classList.toggle('is-current', offset === 0);
    card.setAttribute('aria-hidden', String(offset !== 0));
    const button = card.querySelector('[data-open-slide]');
    if (button) button.tabIndex = offset === 0 ? 0 : -1;
    card.querySelectorAll('[data-preview-work]').forEach(link => { link.tabIndex = offset === 0 ? 0 : -1; });
  });
  root.querySelectorAll('[data-gallery-index]').forEach((button, i) => button.setAttribute('aria-current', String(i === state.galleryIndex)));
  root.querySelector(`[data-gallery-index="${state.galleryIndex}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
  root.querySelectorAll('[data-gallery-step]').forEach(button => { button.disabled = total === 1; });
  const member = state.members[state.galleryIndex - 1];
  root.querySelector('[data-gallery-caption]').textContent = member ? member.name || getMemberCode(member) : 'BOOONG · 함께하는 사람들';
  root.querySelector('[data-gallery-count]').textContent = `${String(state.galleryIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  if (updateHash) history.replaceState(null, '', member ? `#${encodeURIComponent(member.id)}` : location.pathname + location.search);
}

let disposeGallery, memberOpener, settleGalleryMotion;

function bindAboutGallery() {
  disposeGallery?.();
  const controller = new AbortController(), { signal } = controller;
  disposeGallery = () => controller.abort();
  const gallery = root.querySelector('.about-gallery'), stage = root.querySelector('.about-gallery__stage');
  const dialog = root.querySelector('.member-profile-dialog');
  let drag = null, draggedAt = 0;
  let position = state.galleryIndex, target = position, origin = position, frame = 0, snapTimer = 0, lastTime = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stopMotion = index => {
    cancelAnimationFrame(frame);clearTimeout(snapTimer);frame = snapTimer = lastTime = 0;
    position = target = origin = index;stage.classList.remove('is-wheeling');
  };
  settleGalleryMotion = stopMotion;
  signal.addEventListener('abort', () => stopMotion(state.galleryIndex), { once: true });
  function animateWheel(time) {
    frame = 0;
    if (!stage.isConnected) return stopMotion(state.galleryIndex);
    if (document.hidden) return showGallerySlide(Math.round(target));
    const dt = lastTime ? Math.min(.05, (time - lastTime) / 1000) : 1 / 60;
    lastTime = time;
    position += (target - position) * (1 - Math.exp(-12 * dt));
    paintGalleryPosition(position);
    if (!snapTimer && Math.abs(target - position) < .001) return showGallerySlide(Math.round(target));
    frame = requestAnimationFrame(animateWheel);
  }
  const beginMotion = () => { if (!frame) { lastTime = 0;frame = requestAnimationFrame(animateWheel); } };
  motion.addEventListener('change', () => { if (motion.matches) showGallerySlide(Math.round(target)); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) showGallerySlide(Math.round(target)); }, { signal });
  const move = step => showGallerySlide(state.galleryIndex + step);
  root.querySelectorAll('[data-gallery-step]').forEach(button => button.addEventListener('click', () => move(Number(button.dataset.galleryStep)), { signal }));
  root.querySelectorAll('[data-gallery-index]').forEach(button => button.addEventListener('click', () => showGallerySlide(Number(button.dataset.galleryIndex)), { signal }));
  root.querySelectorAll('[data-open-slide]').forEach(button => button.addEventListener('click', () => {
    if (Date.now() - draggedAt < 250) return;
    const index = Number(button.dataset.openSlide);
    if (index !== state.galleryIndex) return showGallerySlide(index);
    if (index === 0) return move(1);
    memberOpener = button;
    selectMember(state.members[index - 1].id);
  }, { signal }));
  stage.addEventListener('click', event => {
    if (Date.now() - draggedAt < 250 || event.target.closest('[data-open-slide]')) return;
    const card = event.target.closest('[data-gallery-card]');
    if (card && Number(card.dataset.galleryCard) !== state.galleryIndex) showGallerySlide(Number(card.dataset.galleryCard));
  }, { signal });
  stage.addEventListener('wheel', event => {
    if (event.ctrlKey || !event.cancelable || !state.members.length) return;
    const card = event.target?.closest?.('.gallery-card--member');
    if (card && Math.abs(event.deltaY) > Math.abs(event.deltaX)
      && (event.deltaY > 0 ? card.scrollTop + card.clientHeight < card.scrollHeight - 1 : card.scrollTop > 0)) return;
    event.preventDefault();
    if (document.activeElement?.closest?.('[data-gallery-card]')) stage.focus({ preventScroll: true });
    if (!snapTimer) origin = target;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    target += Math.max(-.7, Math.min(.7, pixels / 650));
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const shift = target - origin;
      target = Math.abs(shift) < .12 ? origin : shift > 0 ? Math.ceil(target - .03) : Math.floor(target + .03);
      snapTimer = 0;
      if (motion.matches) showGallerySlide(Math.round(target));else beginMotion();
    }, 150);
    if (!motion.matches) { stage.classList.add('is-wheeling');beginMotion(); }
  }, { passive: false, signal });
  gallery.addEventListener('keydown', event => {
    const card = event.target?.closest?.('.gallery-card--member');
    const vertical = { ArrowDown:1, PageDown:1, ArrowUp:-1, PageUp:-1 }[event.key];
    if (card && vertical && (vertical > 0 ? card.scrollTop + card.clientHeight < card.scrollHeight - 1 : card.scrollTop > 0)) return;
    const step = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[event.key];
    if (step) { event.preventDefault();move(step); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault();showGallerySlide(event.key === 'Home' ? 0 : state.members.length); }
  }, { signal });
  stage.addEventListener('pointerdown', event => {
    if (event.isPrimary && event.button === 0) drag = { id: event.pointerId, x: event.clientX, moved: false };
  }, { signal });
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id || Math.abs(event.clientX - drag.x) < 10) return;
    drag.moved = true;stage.setPointerCapture(event.pointerId);
  }, { signal });
  stage.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const distance = event.clientX - drag.x;
    if (drag.moved) draggedAt = Date.now();
    if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
    drag = null;
  }, { signal });
  stage.addEventListener('pointercancel', () => { drag = null; }, { signal });
  let backdrop = false;
  dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog; }, { signal });
  dialog.addEventListener('click', event => { if (backdrop && event.target === dialog) dialog.close(); }, { signal });
  dialog.addEventListener('close', () => {
    state.selectedMemberId = '';
    const target = memberOpener?.isConnected ? memberOpener : root.querySelector(`[data-open-slide="${state.galleryIndex}"]`);
    target?.focus({ preventScroll: true });
  }, { signal });
  window.addEventListener('hashchange', () => {
    const id = getInitialSelectedMemberId(state.members);
    showGallerySlide(id ? state.members.findIndex(member => isSameMember(member.id, id)) + 1 : 0, false);
  }, { signal });
  refreshMemberPreviews();
  showGallerySlide(state.galleryIndex, false);
}

function bindMemberCardActions() {
  root.querySelectorAll('.member-detail img').forEach(img => img.addEventListener('error', () => { img.src = '/assets/lesson-thumbnails/social-studies-default-v1.jpg'; }, { once: true }));
  root.querySelector("[data-action='retry-training']")?.addEventListener("click", refreshTraining);
  root.querySelector("[data-action='close-member']")?.addEventListener("click", () => {
    root.querySelector(".member-profile-dialog")?.close();
  });
  const trainingToggle = root.querySelector("[data-action='toggle-training']");
  trainingToggle?.addEventListener("click", () => {
    const expanded = trainingToggle.getAttribute("aria-expanded") !== "true";
    trainingToggle.setAttribute("aria-expanded", String(expanded));
    trainingToggle.nextElementSibling.inert = !expanded;
  });
}

function selectMember(memberId) {
  const member = state.members.find(item => isSameMember(item.id, memberId));
  if (!member) return;
  showGallerySlide(state.members.indexOf(member) + 1);
  state.selectedMemberId = member.id;
  renderMemberDetail();
  const dialog = root.querySelector('.member-profile-dialog');
  dialog.setAttribute('aria-label', `${member.name || member.id} 프로필`);
  if (!dialog.open) { dialog.showModal();dialog.scrollTop = 0; }
  root.querySelector('.member-card')?.focus({ preventScroll: true });
}

function renderMemberCard(member, works) {
  const name = member.name || "이름 미등록";
  const career = normalizeCareer(member.career);
  const trainingCareer = memberTrainingCareer(member, state.trainings);
  const code = getMemberCode(member);
  const { color, bg } = getMemberColors(member);

  return `
    <article
      class="member-card"
      id="${escapeAttr(member.id || "")}"
      style="--member-color: ${escapeAttr(color)}; --member-bg: ${escapeAttr(bg)};"
      tabindex="-1"
    >
      <div class="member-card__toolbar"><button class="member-card__close" type="button" data-action="close-member" aria-label="프로필 닫기">×</button></div>

      <section class="member-card__identity" aria-label="${escapeAttr(name)} 소개">
        <div class="member-card__heading"><span class="gallery-card__code${code.length > 6 ? ' gallery-card__code--long' : ''}" aria-hidden="true">${escapeHtml(code)}</span><h2>${escapeHtml(name)}</h2></div>
        ${renderMemberStatement(member)}
      </section>

      <div class="member-card__body">
      <section class="member-card__career" aria-label="${escapeAttr(name)} 경력">
        <h3 class="member-card__section-title">경력</h3>
        ${career.length ? renderCareer(career) : `<p class="member-card__empty">—</p>`}
        ${trainingCareer.length ? `
          <section class="member-card__training">
            <button class="member-card__training-toggle" type="button" data-action="toggle-training" aria-expanded="false" aria-controls="member-training-content">
              <span>세부 연수경력</span>
              <span class="member-card__training-count">${trainingCareer.length}건</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="member-card__training-content" id="member-training-content" inert>
              <div>${renderCareer(trainingCareer.map(place => ({ place })), "ol")}</div>
            </div>
          </section>
        ` : ""}
        ${state.trainingError ? `<p role="status">연수 이력을 불러오지 못했습니다. <button type="button" class="btn btn--ghost" data-action="retry-training">다시 시도</button></p>` : ""}
      </section>

      <aside class="member-lessons" aria-label="${escapeAttr(name)} 제작 자료">
        <div class="member-lessons__header">
          <h3>만든 자료 <span>${works.length}</span></h3>
        </div>
        ${works.length ? renderWorkLinks(works) : `<p class="member-card__empty">—</p>`}
        ${works.length ? `<p class="member-lessons__note">링크 클릭은 BOOONG에서 자료를 연 횟수입니다.</p>` : ""}
      </aside>
      </div>
    </article>
  `;
}

function renderCareer(career, listTag = "ul") {
  return `
    <${listTag} class="member-career">
      ${career.map(item => `
        <li>
          <span class="member-career__place">${escapeHtml(item.place)}</span>
          ${item.period ? `<span class="member-career__period">${escapeHtml(item.period)}</span>` : ""}
        </li>
      `).join("")}
    </${listTag}>
  `;
}

function renderWorkLinks(works) {
  return `
    <ul class="member-lessons__list">
      ${works.map(work => {
        const meta = getWorkMeta(work);
        const metric = getWorkMetric(work);
        const resource = state.resourcesById.get(work.id) || { id: work.id };
        return `
          <li>
            <a href="${escapeAttr(work.href)}" ${work.external ? `target="_blank" rel="noopener noreferrer"` : ""}>
              <img class="member-lessons__image" src="${escapeAttr(thumbnailUrl(resource, state.thumbnails[work.id]))}" alt="" width="800" height="500" loading="lazy" decoding="async">
              <span class="member-lessons__details">
                <span class="member-lessons__name">${escapeHtml(getWorkTitle(work))} <span class="member-lessons__arrow" aria-hidden="true">${work.external ? "↗" : "→"}</span></span>
                ${meta ? `<span class="member-lessons__meta" title="${escapeAttr((work.units || []).join(" · "))}">${escapeHtml(meta)}</span>` : ""}
              </span>
              <span class="member-lessons__metric" data-work-metric data-metric-type="${metric.label}" data-metric-key="${escapeAttr(metric.key)}" title="${metric.label === "조회수" ? "BOOONG 안에서 이 자료를 연 횟수" : "외부 사이트의 조회수가 아닌 BOOONG에서 링크를 연 횟수"}">
                <strong>${metric.value == null ? "—" : Number(metric.value).toLocaleString("ko-KR")}</strong>
                <span>${metric.label}</span>
              </span>
            </a>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function getWorkMetric(work) {
  const lessonId = !work.external && new URL(work.href, "https://booong.vercel.app").searchParams.get("lesson");
  if (lessonId) {
    const key = getLessonPageKey(lessonId);
    return { label: "조회수", key, value: state.pageViews.get(key) };
  }
  const clickId = String(work.id).trim().toLowerCase().replace(/[^a-z0-9가-힣_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return { label: "링크 클릭", key: clickId, value: state.linkClicks.get(clickId) };
}

function resolveMemberWorks(member, makerWorkMap) {
  return uniqueWorks(getMemberLookupKeys(member).flatMap(key => makerWorkMap.get(key) || []));
}

function getWorkTitle(work) {
  return work.title || "";
}

function getWorkMeta(work) {
  const units = Array.isArray(work.units) ? work.units.filter(Boolean) : [];
  if (units.length > 1) return `${units[0]} +${units.length - 1}`;
  return units[0] || (["수업", "게임"].includes(work.groupTitle) ? "" : work.groupTitle || "");
}

function uniqueWorks(works) {
  const seen = new Set();
  return works.filter(work => {
    const key = `${work.type}:${work.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getInitialSelectedMemberId(members) {
  let hashId;
  try { hashId = decodeURIComponent(location.hash.replace(/^#/, "")); } catch { return ""; }
  const hashMember = members.find(member => isSameMember(member.id, hashId));
  return hashMember?.id || "";
}

function getSelectedMember() {
  return state.members.find(member => isSameMember(member.id, state.selectedMemberId)) || null;
}

function getMemberCode(member) {
  return String(member.id || member.name || "member").trim().toUpperCase();
}

function getMemberColors(member) {
  const key = String(member.id || "").trim().toLowerCase();
  return MEMBER_COLORS[key] || { color: "#1B6BFF", bg: "#E6EEFF" };
}

function splitInterests(interests) {
  if (Array.isArray(interests)) return interests.map(String).map(item => item.trim()).filter(Boolean);
  return String(interests || "")
    .split(/[,，]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeCareer(career) {
  const items = Array.isArray(career) ? career : String(career || "").split(/\n+/);
  return items.map(parseCareerItem).filter(item => item.place || item.period).reverse();
}

function parseCareerItem(item) {
  if (item && typeof item === "object") {
    return {
      place: String(item.place || "").trim(),
      period: String(item.period || "").trim(),
    };
  }

  const text = String(item || "").trim();
  const match = text.match(/^(.*?)\s*[\(（]\s*([^()（）]+)\s*[\)）]\s*$/);
  if (!match) return { place: text, period: "" };

  return {
    place: match[1].trim(),
    period: match[2].trim(),
  };
}

function isSameMember(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
function renderLoading() {
  return `
    <main class="about">
      <div class="about__inner">
        <p class="about__status">프로필을 불러오는 중입니다.</p>
      </div>
    </main>
  `;
}

function renderError(err) {
  return `
    <main class="about">
      <div class="about__inner">
        <a class="about__back" href="index.html">← 대시보드</a>
        <div class="about__notice">
          <h1>About us 데이터를 불러오지 못했습니다</h1>
          <p>오류: ${escapeHtml(err.message)}</p>
        </div>
      </div>
    </main>
  `;
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}
