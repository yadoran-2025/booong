import { escapeHtml as esc, isHttpUrl } from '../js/utils.js';
import { bindHomeIntro } from '../js/ui/dashboard-intro.js';
import { normalizeFavoriteIds, toggleFavoriteId } from '../js/favorites.js';
import { readNotices } from '../js/notices.js';
import { renderNoticeArticle } from '../js/ui/notices.js';

const $ = selector => document.querySelector(selector);
const layout = document.body.dataset.layout || '';
const enhanced = document.body.hasAttribute('data-library-features');
const state = { subject: '사회2[15개정]', unit: '', query: '', view: 'all', sort: 'unit', middle: '', domain: '' };
const initialView = new URLSearchParams(location.search).get('view');
if (enhanced && ['favorites', 'new'].includes(initialView)) state.view = initialView;
const dialog = $('#lesson-dialog');
const splitTitle = title => title.match(/^([IVXLCDM]+\.)\s*(.+)$/)?.slice(1) || ['', title];
const subjectName = subject => subject === '사회2[15개정]' ? '사회2' : catalog.subjects.find(s => s.value === subject)?.label || subject;
const subjectResources = () => catalog.resources.filter(r => r.subjects.includes(state.subject));
const visibleResources = () => enhanced ? selectPreviewResources() : subjectResources().filter(r => (!state.unit || r.unitKeys.includes(state.unit)) && (!state.query || r.searchText.includes(state.query)));
const covers = { 'group-6': 'lesson-images/trader.jpg', 'group-19': 'lesson-images/popgrid.jpg', 'group-21': 'lesson-images/pyramid.jpg' };
let catalog;
let activeId;
let opener;
let modalItems = [];
let curriculumTools;
let saved = [];
const SAVE_KEY = 'booong-lesson-cards-mockup-saved-v1';
try { if (enhanced) saved = normalizeFavoriteIds(JSON.parse(localStorage.getItem(SAVE_KEY) || '[]')); } catch { /* The preview also works without storage. */ }
const comments = new Map();
let detailTab = 'intro';
let editingComment = '';
let replyingTo = '';
let notices = [];
let noticesError = '';
let statusTimer;
let journey;

function isGeography(unit) {
  const domain = curriculumTools?.getCurriculumChapter(unit)?.domain;
  if (domain) return domain.includes('지리');
  const firstHalf = /^(I|II|III|IV|V|VI)\./.test(unit.title);
  return unit.subject === '사회1' ? firstHalf : !firstHalf;
}

function selectPreviewResources() {
  let items = state.view === 'favorites' ? catalog.resources.filter(r => saved.includes(r.id)) : state.view === 'new' ? catalog.resources.filter(r => r.isNew) : state.query ? catalog.resources : subjectResources();
  items = items.filter(r => (!state.query || r.searchText.normalize('NFKC').toLowerCase().includes(state.query)) && (state.query || state.view !== 'all' || ((!state.unit || r.unitKeys.includes(state.unit)) && (!state.middle || (r.middleUnitsByKey?.[state.unit] || []).includes(state.middle)) && (!state.domain || r.unitKeys.some(key => {
    const unit = catalog.units.find(u => u.key === key && u.subject === state.subject);
    return unit && isGeography(unit) === (state.domain === '지리');
  })))));
  return items.sort(state.sort === 'title' ? (a, b) => a.title.localeCompare(b.title, 'ko') : (a, b) => catalog.units.findIndex(u => u.key === resourceUnit(a)) - catalog.units.findIndex(u => u.key === resourceUnit(b)));
}

function announce(message) {
  const status = $('#preview-status');
  if (!status) return;
  (Array.from(document.querySelectorAll('dialog[open]')).at(-1) || document.body).append(status);
  clearTimeout(statusTimer);
  status.textContent = message;
  status.hidden = false;
  statusTimer = setTimeout(() => { status.hidden = true; }, 4000);
}

function saveLesson(id) {
  const next = toggleFavoriteId(saved, id);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); }
  catch { announce('수업함에 저장하지 못했습니다. 브라우저의 저장 공간을 확인해 주세요.'); return; }
  saved = next;
  render();
  if (dialog.open) { renderDetail(); $('#detail-tools [data-save]')?.focus(); }
  else (Array.from(document.querySelectorAll('[data-save]')).find(b => b.dataset.save === id) || $('[data-view="favorites"]'))?.focus({ preventScroll: true });
}

function cover(r) {
  const fallback = /경제|금융|시장/.test(r.searchText) ? 'economics' : /법|정치|헌법/.test(r.searchText) ? 'civics' : 'social-studies';
  return covers[r.id] || r.thumbnailUrl || `../assets/lesson-thumbnails/${fallback}-default-v1.jpg`;
}

function saveIcon(isSaved) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${isSaved ? 'M5 12l4 4L19 6' : 'M6 3h12v18l-6-4-6 4z'}"/></svg>`;
}

function resourceUnit(r) {
  return r.unitKeys.find(key => key.startsWith(`${state.subject}::`)) || (enhanced ? r.unitKeys[0] : '') || '';
}

const resourceSubject = r => resourceUnit(r).split('::')[0] || r.subjects[0] || state.subject;

function render() {
  const subject = catalog.subjects.find(s => s.value === state.subject);
  const common = ['사회1', '사회2', '사회2[15개정]', '통합사회2', '사회와문화', '정치', '경제', state.subject];
  $('#subjects').innerHTML = ['중학교', '고등학교'].map(school => `<div class="subject-group" role="group" aria-label="${school} 과목"><span>${school}</span>${catalog.subjects.filter(s => s.school === school && (!enhanced || common.includes(s.value))).map(s => `<button type="button" data-subject="${esc(s.value)}" aria-pressed="${s.value === state.subject && (!enhanced || state.view === 'all')}">${esc(s.value === '사회2[15개정]' ? '사회2 · 2015' : s.label)}</button>`).join('')}</div>`).join('') + (enhanced ? '<button type="button" data-open="subjects" aria-haspopup="dialog">다른 과목 ↗</button>' : '');
  $('#subject-title').textContent = subjectName(state.subject);
  $('#school-year').textContent = `${subject.school} · ${state.subject === '사회2[15개정]' ? '2015' : '2022'} 개정`;
  const units = catalog.units.filter(u => u.subject === state.subject && (!enhanced || !state.domain || isGeography(u) === (state.domain === '지리')));
  $('#units').innerHTML = `<button type="button" class="unit" data-unit="" aria-pressed="${!state.unit}"><strong>전체 단원</strong></button>${units.map(u => {
    const [number, title] = splitTitle(u.title);
    return `<button type="button" class="unit" data-unit="${esc(u.key)}" aria-pressed="${state.unit === u.key}"><i>${esc(number)}</i><strong>${esc(title)}</strong></button>`;
  }).join('')}`;
  $('#library-title').textContent = state.unit ? units.find(u => u.key === state.unit).title : '전체 단원';
  const items = visibleResources();
  $('#result-count').textContent = `${items.length}개 수업`;
  $('#cards').innerHTML = items.length ? renderCards(items) : `<p class="empty">${state.query ? '검색한 수업이 없습니다. 다른 검색어로 찾아보세요.' : enhanced && state.view === 'favorites' ? '수업 카드의 ‘담기’를 눌러 내 수업함에 담아보세요.' : '아직 등록된 수업이 없습니다.'}</p>`;
  if (enhanced) renderFeatureControls();
  journey?.update(items.map(r => ({ id: r.id, title: r.title, subject: subjectName(resourceSubject(r)), unit: resourceUnit(r).split('::')[1] || '단원 공통', cover: cover(r), hasScreenshot: Boolean(covers[r.id]) })));
}

function renderCard(r) {
  const context = enhanced && (state.query || state.view !== 'all') ? `${subjectName(resourceSubject(r))} · ` : '';
  const experimental = ['packs', 'showcase', 'tickets'].includes(layout);
  const unitName = resourceUnit(r).split('::')[1] || '단원 공통';
  const [number, unitTitle] = splitTitle(unitName);
  const mark = experimental && number ? `<span class="card-mark" aria-hidden="true">${esc(number.replace('.', ''))}</span>` : '';
  const packSubjectKey = layout === 'packs' ? resourceUnit(r).split('::')[0] || r.subjects[0] : '';
  const packSubject = layout === 'packs' ? (packSubjectKey ? `${subjectName(packSubjectKey)}${packSubjectKey === '사회2[15개정]' ? ' · 2015' : ''}` : '공통') : '';
  const packHeading = layout === 'packs' ? `<span class="pack-heading"><span class="card-subject">${esc(packSubject)}</span><span class="card-unit">${mark}${esc(unitTitle)}</span></span>` : '';
  const card = `<button class="lesson-card" type="button" data-lesson="${esc(r.id)}" aria-haspopup="dialog" aria-label="${esc(experimental ? `${packSubject ? `${packSubject} · ` : ''}${unitName} · ${r.title}` : r.title)} 수업 소개">${packHeading ? '' : mark}<img class="card-image" src="${esc(cover(r))}" alt=""><span class="card-content">${packHeading ? '' : `<span class="card-unit">${esc(context + (experimental ? unitTitle : unitName))}</span>`}<span class="card-title">${esc(r.title)}</span>${packHeading}${layout === 'journal' ? `<span class="card-description">${esc(r.desc)}</span>` : ''}${packHeading ? '' : `<span class="card-foot"><span>${r.kind === 'game' ? '게임' : '수업'}${enhanced && r.isNew ? ' · 새 수업' : ''}</span>${enhanced ? '' : '<b aria-hidden="true">↗</b>'}</span>`}</span></button>`;
  const save = `<button type="button" class="save-toggle save-control" data-save="${esc(r.id)}" aria-pressed="${saved.includes(r.id)}" aria-label="${esc(r.title)} ${saved.includes(r.id) ? '수업함에서 빼기' : '수업함에 담기'}" title="${saved.includes(r.id) ? '수업함에서 빼기' : '내 수업함에 담기'}">${saveIcon(saved.includes(r.id))}<span>${saved.includes(r.id) ? '담김' : '담기'}</span></button>`;
  const count = layout === 'packs' ? (comments.get(r.id) || []).length : 0;
  const footer = layout === 'packs' ? `<div class="pack-footer"><div class="pack-stats"><span class="pack-stat" aria-label="조회수 미연동" title="조회수 미연동"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>—</span></span><span class="pack-stat" aria-label="저장수 미연동" title="저장수 미연동">${saveIcon(false)}<span>—</span></span><button class="pack-stat pack-comments" type="button" data-comments="${esc(r.id)}" aria-haspopup="dialog" aria-label="${esc(r.title)} 댓글 ${count}개 보기" title="댓글 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2z"/></svg><span data-comment-count="${esc(r.id)}">${count}</span></button></div>${save}</div>` : save;
  return enhanced ? `<article class="lesson-tile">${card}${footer}</article>` : card;
}

function renderCards(items) {
  if (!['atlas', 'journal'].includes(layout)) return items.map(renderCard).join('');
  const groups = new Map();
  for (const item of items) {
    const key = resourceUnit(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups, ([key, resources]) => {
    const [number, title] = splitTitle(key.split('::')[1] || '단원 공통');
    return `<section class="chapter"><header class="chapter-heading"><span class="chapter-number" aria-hidden="true">${esc(number.replace('.', ''))}</span><h3>${esc(title)}</h3><span class="chapter-count">${resources.length}개 수업</span></header><div class="chapter-cards">${resources.map(renderCard).join('')}</div></section>`;
  }).join('');
}

function renderDetail() {
  $('#detail').scrollTop = 0;
  const r = modalItems.find(item => item.id === activeId);
  const index = modalItems.indexOf(r);
  $('#detail').classList.toggle('detail--comments', enhanced && detailTab === 'comments');
  if (enhanced) {
    const count = (comments.get(r.id) || []).length;
    document.querySelectorAll('[data-comment-count]').forEach(counter => {
      if (counter.dataset.commentCount !== r.id) return;
      counter.textContent = count;
      counter.parentElement.setAttribute('aria-label', `${r.title} 댓글 ${count}개 보기`);
    });
    $('#detail-tools').innerHTML = `<div class="detail-tabs" role="group" aria-label="수업 상세 내용"><button type="button" data-detail-tab="intro" aria-pressed="${detailTab === 'intro'}">수업 소개</button><button type="button" data-detail-tab="comments" aria-pressed="${detailTab === 'comments'}">댓글 ${count}</button></div><button type="button" class="btn btn--secondary save-control" data-save="${esc(r.id)}" aria-pressed="${saved.includes(r.id)}" aria-label="${esc(r.title)} ${saved.includes(r.id) ? '수업함에서 빼기' : '수업함에 담기'}">${saveIcon(saved.includes(r.id))}<span>${saved.includes(r.id) ? '수업함에 담김' : '수업함에 담기'}</span></button>`;
    if (detailTab === 'comments') {
      const discussion = comments.get(r.id) || [];
      const threaded = discussion.filter(c => !c.parentId).flatMap(c => [c, ...discussion.filter(reply => reply.parentId === c.id)]);
      $('#detail').innerHTML = `<section class="preview-discussion"><h2 id="detail-title">${esc(r.title)}</h2><p>댓글 미리보기입니다. 공개되지 않으며 새로고침하면 사라집니다.</p><ul class="preview-comments">${threaded.map(c => `<li${c.parentId ? ' class="is-reply"' : ''}><p>${c.parentId ? '↳ ' : ''}${esc(c.text)}</p><button type="button" data-edit-comment="${esc(c.id)}">수정</button><button type="button" data-delete-comment="${esc(c.id)}">삭제</button><button type="button" data-reply-comment="${esc(c.id)}">답글</button></li>`).join('') || '<li>아직 남긴 댓글이 없습니다.</li>'}</ul><form class="preview-comment-form"><label>댓글 남기기<textarea name="comment" rows="3" maxlength="500" placeholder="이 수업에 대한 생각을 남겨주세요" required></textarea></label><button class="btn btn--primary" type="submit" disabled>댓글 미리보기</button></form></section>`;
      $('.preview-comment-form label').insertAdjacentHTML('afterend', '<button type="button" class="btn btn--secondary" data-cancel-comment hidden>취소</button>');
      $('#detail-position').textContent = `${index + 1} / ${modalItems.length}`;
      $('[data-step="-1"]').disabled = index === 0;
      $('[data-step="1"]').disabled = index === modalItems.length - 1;
      return;
    }
  }
  const unit = resourceUnit(r);
  const subject = enhanced ? resourceSubject(r) : state.subject;
  const middle = r.middleUnitsByKey?.[unit] || [];
  const actions = r.actions.filter(a => isHttpUrl(a.href));
  const primary = actions.find(a => a.key === 'teacher') || actions.find(a => a.key !== 'blog');
  $('#detail').innerHTML = `<div class="detail-preview"><img src="${esc(cover(r))}" alt="${esc(covers[r.id] ? `${r.title} 활동 화면` : `${r.title} 대표 이미지 예시`)}"></div><div class="detail-content"><p class="detail-subject">${esc(subjectName(subject))} · ${subject === '사회2[15개정]' ? '2015' : '2022'} 개정</p><p class="detail-unit">${esc(unit.split('::')[1] || '단원 공통')}${middle.length ? `<br>${esc(middle.join(' · '))}` : ''}</p><h2 id="detail-title">${esc(r.title)}</h2><p class="detail-description">${esc(r.desc)}</p>${r.makers.length ? `<p class="detail-makers">만든이 ${enhanced ? r.makers.map(m => `<a href="../about.html#${esc(encodeURIComponent(m))}" target="_blank" rel="noopener">${esc(m.toUpperCase())}</a>`).join(' · ') : esc(r.makers.join(' · ').toUpperCase())}</p>` : ''}${enhanced ? '<div class="detail-stats" title="운영 통계 연동 위치"><span>조회수 —</span><span>저장수 —</span></div>' : ''}<div class="detail-actions">${primary ? `<a class="btn btn--primary" href="${esc(primary.href)}" target="_blank" rel="noopener">자료 열기 <span aria-hidden="true">↗</span></a>` : ''}${actions.filter(a => a !== primary).map(a => `<a class="btn btn--secondary" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.key === 'blog' ? '원문 소개' : a.label)} ↗</a>`).join('')}</div>${enhanced ? '<div class="detail-references"></div>' : ''}</div>`;
  if (enhanced && curriculumTools) {
    const reference = $('#detail .detail-references');
    const chapter = catalog.units.find(u => u.key === unit);
    reference.innerHTML = chapter ? curriculumTools.renderCurriculumButton(chapter, middle.length === 1 ? middle[0] : '') : '';
    curriculumTools.bindCurriculum(reference);
  }
  $('#detail-position').textContent = `${index + 1} / ${modalItems.length}`;
  $('[data-step="-1"]').disabled = index === 0;
  $('[data-step="1"]').disabled = index === modalItems.length - 1;
}

function renderFeatureControls() {
  const globalView = state.view !== 'all' || Boolean(state.query);
  $('.workspace').classList.toggle('is-global', globalView);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  document.querySelectorAll('[data-saved-count]').forEach(b => { b.textContent = catalog.resources.filter(r => saved.includes(r.id)).length; });
  document.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
  if (globalView) {
    $('#school-year').textContent = '전체 과목';
    $('#subject-title').textContent = state.view === 'favorites' ? '내 수업함' : state.view === 'new' ? '새로 들어온 수업' : '수업 검색';
    $('#library-title').textContent = state.query ? '검색 결과' : '모든 과목';
  }
  const unit = catalog.units.find(u => u.key === state.unit);
  $('#subject-tools').innerHTML = !globalView && curriculumTools ? `<button type="button" class="btn btn--secondary" data-open="curriculum" aria-haspopup="dialog">교육과정 ↗</button>${curriculumTools.renderEvaluationButton(state.subject)}` : '';
  $('#unit-tools').innerHTML = !globalView && unit && curriculumTools ? curriculumTools.renderCurriculumButton(unit, state.middle) : '';
  const middles = unit ? [...new Set([...(curriculumTools?.getCurriculumMiddleUnits(unit) || []), ...(unit.middleUnits || [])])] : [];
  $('#middle-units').innerHTML = !globalView && unit ? [['', '전체 중단원'], ...middles.map(m => [m, m])].map(([value, label]) => `<button type="button" data-middle="${esc(value)}" aria-pressed="${value === state.middle}">${esc(label)}</button>`).join('') : '';
  $('#unit-domains').innerHTML = catalog.subjects.find(s => s.value === state.subject)?.school === '중학교' ? [['', '전체'], ['일반사회', '일반사회'], ['지리', '지리']].map(([value, label]) => `<button type="button" data-domain="${value}" aria-pressed="${state.domain === value}">${label}</button>`).join('') : '';
  curriculumTools?.bindCurriculum($('#subject-tools'));
  curriculumTools?.bindCurriculum($('#unit-tools'));
  const textbook = $('#operator-textbook');
  if (textbook) textbook.href = '../textbook-analysis.html' + (unit ? `?${new URLSearchParams({ unitKey: unit.key, ...(state.middle ? { middle: state.middle } : {}) })}` : '');
}

function openFeature(kind) {
  const popup = $('#feature-dialog');
  const content = $('#feature-content');
  $('#feature-title').textContent = kind === 'subjects' ? '과목 선택' : kind === 'curriculum' ? `${subjectName(state.subject)} 교육과정` : kind === 'notices' ? '공지사항' : '댓글 이용안내';
  if (kind === 'subjects') {
    content.innerHTML = `<div class="subject-picker">${['중학교', '고등학교'].map(school => `<h3>${school}</h3><div role="group" aria-label="${school} 과목">${catalog.subjects.filter(s => s.school === school).map(s => `<button type="button" class="btn btn--secondary" data-subject="${esc(s.value)}" aria-pressed="${s.value === state.subject}">${esc(s.label)}</button>`).join('')}</div>`).join('')}</div>`;
  } else if (kind === 'curriculum') {
    content.innerHTML = '<div class="reference-picker">' + catalog.units.filter(u => u.subject === state.subject).map(u => `<div><h3>${esc(u.title)}</h3>${curriculumTools.renderCurriculumButton(u)}</div>`).join('') + '</div>';
    curriculumTools.bindCurriculum(popup);
  } else if (kind === 'notices') {
    content.innerHTML = noticesError ? `<p role="alert">${esc(noticesError)}</p>` : notices.length ? notices.map(renderNoticeArticle).join('') : '<p>등록된 공지가 없습니다.</p>';
  } else {
    content.innerHTML = '<p>기존 사이트에서는 도름스 계정으로 로그인한 교사가 댓글과 답글을 남기고, 자신의 댓글을 수정·삭제할 수 있습니다.</p><p>이 목업에서는 상세 모달의 댓글 화면에서 공개 등록 없이 배치를 시험할 수 있습니다.</p><a class="btn btn--secondary" href="https://dorms.school" target="_blank" rel="noopener">도름스 ↗</a>';
  }
  popup.showModal();
}

async function loadPreviewNotices() {
  try {
    notices = await readNotices();
    if (notices.length) $('#notice-bar').innerHTML = `<button class="notice-preview" type="button" data-open="notices" aria-haspopup="dialog"><b>공지</b><span>${esc(notices[0].title)}</span><span aria-hidden="true">↗</span></button>`;
  } catch { noticesError = '공지사항을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'; }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !catalog) return;
  if (enhanced && button.hasAttribute('data-open')) { openFeature(button.dataset.open); return; }
  if (enhanced && button.hasAttribute('data-save')) { saveLesson(button.dataset.save); return; }
  if (enhanced && button.hasAttribute('data-detail-tab')) {
    detailTab = button.dataset.detailTab;
    editingComment = replyingTo = '';
    renderDetail();
    Array.from(document.querySelectorAll('[data-detail-tab]')).find(b => b.dataset.detailTab === detailTab)?.focus();
    return;
  }
  if (enhanced && button.hasAttribute('data-cancel-comment')) {
    editingComment = replyingTo = '';
    renderDetail();
    $('.preview-comment-form textarea').focus();
    return;
  }
  if (enhanced && (button.hasAttribute('data-edit-comment') || button.hasAttribute('data-reply-comment'))) {
    const item = (comments.get(activeId) || []).find(c => c.id === (button.dataset.editComment || button.dataset.replyComment));
    if (!item) return;
    editingComment = button.hasAttribute('data-edit-comment') ? item.id : '';
    replyingTo = editingComment ? '' : item.parentId || item.id;
    const form = $('.preview-comment-form');
    form.querySelector('label').firstChild.textContent = editingComment ? '댓글 수정' : '답글 남기기';
    form.querySelector('textarea').value = editingComment ? item.text : '';
    form.querySelector('[type="submit"]').disabled = !editingComment;
    form.querySelector('[data-cancel-comment]').hidden = false;
    form.querySelector('textarea').focus();
    return;
  }
  if (enhanced && button.hasAttribute('data-delete-comment')) {
    comments.set(activeId, (comments.get(activeId) || []).filter(c => c.id !== button.dataset.deleteComment && c.parentId !== button.dataset.deleteComment));
    editingComment = replyingTo = '';
    renderDetail();
    $('[data-detail-tab="comments"]').focus();
    return;
  }
  if (enhanced && button.hasAttribute('data-view')) {
    state.view = button.dataset.view;
    state.unit = state.middle = state.domain = state.query = '';
    $('#search').value = '';
  } else if (enhanced && button.hasAttribute('data-sort')) {
    state.sort = button.dataset.sort;
  } else if (enhanced && button.hasAttribute('data-middle')) {
    state.middle = button.dataset.middle;
  } else if (enhanced && button.hasAttribute('data-domain')) {
    state.domain = button.dataset.domain;
    state.unit = state.middle = '';
  } else if (button.hasAttribute('data-subject')) {
    state.subject = button.dataset.subject;
    state.unit = state.query = state.middle = state.domain = '';
    state.view = 'all';
    $('#search').value = '';
    if (enhanced && $('#feature-dialog').open) $('#feature-dialog').close();
  } else if (button.hasAttribute('data-unit')) {
    state.unit = button.dataset.unit;
    state.middle = '';
  } else if (button.hasAttribute('data-lesson') || button.hasAttribute('data-comments')) {
    activeId = button.dataset.lesson || button.dataset.comments;
    opener = button;
    detailTab = button.hasAttribute('data-comments') ? 'comments' : 'intro';
    editingComment = replyingTo = '';
    modalItems = visibleResources();
    renderDetail();
    dialog.showModal();
    return;
  } else if (button.hasAttribute('data-step')) {
    const index = modalItems.findIndex(r => r.id === activeId) + Number(button.dataset.step);
    if (!modalItems[index]) return;
    activeId = modalItems[index].id;
    editingComment = replyingTo = '';
    renderDetail();
    dialog.scrollTop = 0;
    if (button.disabled) $('.close').focus();
    return;
  } else return;
  render();
  if (enhanced && (button.hasAttribute('data-view') || button.hasAttribute('data-subject'))) {
    const url = new URL(location.href);
    if (state.view === 'all') url.searchParams.delete('view');
    else url.searchParams.set('view', state.view);
    history.replaceState(null, '', url);
  }
  const attribute = ['data-subject', 'data-unit', 'data-view', 'data-sort', 'data-middle', 'data-domain'].find(a => button.hasAttribute(a));
  Array.from(document.querySelectorAll(`[${attribute}]`)).find(b => b.getAttribute(attribute) === button.getAttribute(attribute))?.focus({ preventScroll: true });
  if (enhanced && button.hasAttribute('data-view')) $('#lesson-library').scrollIntoView({ block: 'start' });
});

$('.close').addEventListener('click', () => dialog.close());
let backdropPointer = false;
dialog.addEventListener('pointerdown', event => { backdropPointer = event.target === dialog; });
dialog.addEventListener('click', event => { if (backdropPointer && event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => (opener?.isConnected ? opener : $('[data-view="favorites"]'))?.focus({ preventScroll: true }));
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(control => !control.closest('[hidden]') && control.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
});
$('#search').addEventListener('input', event => {
  state.query = event.target.value.trim().normalize('NFKC').toLowerCase();
  state.middle = '';
  if (catalog) render();
});
document.addEventListener('input', event => {
  if (!enhanced || !event.target.matches('.preview-comment-form textarea')) return;
  event.target.form.querySelector('[type="submit"]').disabled = !event.target.value.trim() || event.target.value.trim().length > 500;
});
document.addEventListener('submit', event => {
  if (!enhanced || !event.target.matches('.preview-comment-form')) return;
  event.preventDefault();
  const text = event.target.querySelector('textarea').value.trim();
  const list = comments.get(activeId) || [];
  if (!text || text.length > 500 || (!editingComment && list.length >= 100)) { announce('댓글은 500자, 수업당 100개까지 미리볼 수 있습니다.'); return; }
  if (editingComment) comments.set(activeId, list.map(c => c.id === editingComment ? { ...c, text } : c));
  else comments.set(activeId, [...list, { id: crypto.randomUUID(), text, parentId: replyingTo }]);
  editingComment = replyingTo = '';
  renderDetail();
  $('[data-detail-tab="comments"]').focus();
});
document.addEventListener('keydown', event => {
  const group = event.target.closest('[role="group"]');
  if (!group || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(group.querySelectorAll('button'));
  const index = buttons.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
});

// shortcut: this mockup uses the existing catalog snapshot; use loadDashboardConfig when applying to the live library.
try {
  const response = await fetch('home-compact-catalog.json');
  if (!response.ok) throw new Error('Catalog unavailable');
  catalog = await response.json();
  if (enhanced) {
    try {
      curriculumTools = await import('../js/ui/curriculum.js');
      await curriculumTools.loadCurriculum();
      catalog = curriculumTools.addCurriculumCatalog({ catalog }).catalog;
    } catch { announce('교육과정을 불러오지 못했습니다. 수업 목록은 계속 사용할 수 있습니다.'); }
  }
  const journeyHost = $('#lesson-journey');
  if (journeyHost) {
    try { const { createLessonJourney } = await import('./lesson-journey.js'); journey = createLessonJourney(journeyHost); }
    catch { journeyHost.hidden = true; }
  }
  render();
  if (enhanced) loadPreviewNotices();
} catch {
  $('#cards').innerHTML = '<p class="empty" role="alert">수업을 불러오지 못했습니다. 새로고침해 주세요.</p>';
}
bindHomeIntro(document);
