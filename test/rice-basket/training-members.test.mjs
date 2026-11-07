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
    sessionId: 'training', pages: [{ id: 'page', title: '자료' }], experiences: {}, adminAccountId: () => 'owner',
    loadMembers: async () => { if (failMembers) throw new Error('offline');return [{ id: 'CHOI', name: '최진영' }, { id: 'HOON', name: '최승훈' }]; },
    api: async (path, method = 'GET', body) => { requests.push({ path, method, body });return existing; },
    adminShell: html => { context.html = html; }, escapeHtml: value => String(value || ''), pageCard: () => '',
    toast: value => { context.message = value; }, dirty: false, revision: 0, location: {},
    setDirty() { context.dirty = true;context.revision++; },
  });
  vm.runInContext(editor, context);
  return { context, nodes, options, buttons, requests };
}

test('BOOONG 구성원은 이름·코드가 보이는 버튼으로 선택하고 기존 연수와 함께 저장한다', async () => {
  const view = setup();await view.context.classEditor();await settle();
  assert.match(view.context.html, /<legend>BOOONG 참가자<\/legend>/);
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
