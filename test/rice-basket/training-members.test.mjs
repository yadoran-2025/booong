import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
const editor = source.slice(source.indexOf('async function classEditor()'), source.indexOf('\nfunction responseRows('));
const settle = () => new Promise(setImmediate);

function setup({ failMembers = false } = {}) {
  const buttons = [{ dataset: { trainingMember: 'CHOI' }, pressed: 'true' }, { dataset: { trainingMember: 'HOON' }, pressed: 'false' }];
  buttons.forEach(button => {
    button.getAttribute = () => button.pressed;
    button.setAttribute = (_, value) => { button.pressed = value; };
  });
  const options = { isConnected: true, querySelectorAll: () => buttons, querySelector: () => null };
  const nodes = {
    '#class-members': options, '#class-name': { value: '연수' }, '#class-school': { value: '학교' }, '#class-date': { value: '2026-09-28' },
    '#pick-search': { value: '' }, '#page-options': {}, '#selected-count': {}, '#selected-pages': { style: { setProperty() {} }, querySelectorAll: () => [] },
    '#refresh-pages': {}, '#save-class': {}, '.view-heading h1': {}, '#save-status': {},
  };
  const requests = [], existing = { id: 'training', name: '연수', school: '학교', lectureDate: '2026-09-28', pageIds: ['page'], memberCodes: ['CHOI'], gridColumns: 3 };
  const context = vm.createContext({
    document: { querySelector: selector => nodes[selector], querySelectorAll: () => [] },
    sessionId: 'training', pages: [{ id: 'page', title: '자료' }, { id: 'page-2', title: '다음 자료' }], experiences: {}, adminAccountId: () => 'owner',
    loadMembers: async () => { if (failMembers) throw new Error('offline');return [{ id: 'CHOI', name: '최진영' }, { id: 'HOON', name: '최승훈' }]; },
    api: async (path, method = 'GET', body) => { requests.push({ path, method, body });return existing; },
    sessionAdminLinks: () => { throw new Error('연수 수정 화면에는 중복 이동 메뉴를 만들지 않는다'); }, sessionSharePanel: () => '', bindSessionSharing() {}, adminShell: html => { context.html = html; }, escapeHtml: value => String(value || ''), hrefPage: (id, session) => `?admin=1&p=${id}&s=${session}`,
    toast: value => { context.message = value; }, dirty: false, revision: 0, location: {},
    setDirty() { context.dirty = true;context.revision++; },
  });
  vm.runInContext(editor, context);
  return { context, nodes, options, buttons, requests };
}

test('BOOONG 구성원은 이름·코드가 보이는 버튼으로 선택하고 기존 연수와 함께 저장한다', async () => {
  const view = setup();await view.context.classEditor();await settle();
  assert.match(view.context.html, /<legend>연수자<\/legend>/);
  assert.match(view.options.innerHTML, /data-training-member="CHOI" aria-pressed="true"/);
  assert.match(view.options.innerHTML, /최진영/);
  view.buttons[1].onclick();assert.equal(view.buttons[1].pressed, 'true');
  await view.nodes['#save-class'].onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests.at(-1).body.memberCodes)), ['CHOI', 'HOON']);
  view.buttons[0].onclick();await view.nodes['#save-class'].onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests.at(-1).body.memberCodes)), ['HOON']);
});

test('구성원 목록 조회가 실패해도 기존 선택은 저장 시 지워지지 않는다', async () => {
  const view = setup({ failMembers: true });await view.context.classEditor();await settle();
  assert.match(view.options.innerHTML, /data-training-member="CHOI" aria-pressed="true"/);
  assert.match(view.options.innerHTML, /다시 시도/);
  await view.nodes['#save-class'].onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests.at(-1).body.memberCodes)), ['CHOI']);
});

test('편집 화면은 저장을 제목 옆에 두고 선택·순서 편집과 기존 저장 내용을 유지한다', async () => {
  const view = setup(), checkbox = { value: 'page-2', checked: true };
  const up = { dataset: { up: 'page-2' } }, remove = { dataset: { remove: 'page-2' } };
  view.context.document.querySelectorAll = selector => selector === '.page-option input' ? [checkbox] : [];
  view.nodes['#selected-pages'].querySelectorAll = () => [up, remove];
  await view.context.classEditor();await settle();
  assert.doesNotMatch(view.context.html, /session-admin-nav|save-bar/);
  assert.match(view.context.html, /class="class-editor-save"/);
  assert.match(view.context.html, /<ol id="selected-pages" class="class-selected-list">/);
  assert.match(view.nodes['#selected-pages'].innerHTML, /class="class-selected-number">01/);
  checkbox.onchange();
  assert.equal(view.nodes['#selected-count'].textContent, '2개 선택');
  up.onclick();await view.nodes['#save-class'].onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests.at(-1).body.pageIds)), ['page-2', 'page']);
  remove.onclick();await view.nodes['#save-class'].onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(view.requests.at(-1).body.pageIds)), ['page']);
  assert.equal(view.requests.at(-1).body.gridColumns, 3);
  assert.equal(view.requests.at(-1).body.lectureDate, '2026-09-28');
});
