import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountWebApps } from '../../rice-basket/web-apps.js';
import { readFileSync } from 'node:fs';
import { DEFAULT_WEB_APP_TYPES } from '../../rice-basket/web-app-config.js';

function setup(t, { canEdit = true, thumbnailUrl, thumbnailImage, lessonId, typeId, typeIds, count = 1, studentUrl = 'https://example.org/student?gameId=secret', qrFetch, lessons = [], api = () => {} } = {}) {
  class Node {
    constructor(tag) { this.tag = tag; }
    className = '';children = [];attributes = {};isConnected = true;
    classList = { add: name => { this.className += ` ${name}`; }, remove() {} };
    append(...nodes) { nodes.forEach(node => { node.remove();node.parent = this;this.children.push(node); }); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);this.parent = null; }
    replaceWith(node) { const parent = this.parent;node.remove();parent.children.splice(parent.children.indexOf(this), 1, node);node.parent = parent;this.parent = null; }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; });this.children = [];this.append(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener() {}
    querySelectorAll(selector) {
      const matches = node => selector.split(',').some(part => {
        const tag = part.match(/^\w+/)?.[0], attribute = part.match(/\[(name|type)="([^"]+)"\]/);
        return (!tag || node.tag === tag) && (!attribute || node[attribute[1]] === attribute[2]);
      });
      return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    focus() { this.focused = true; }
    scrollIntoView() { this.scrolled = true; }
    checkValidity() { return true; }
    reportValidity() { this.reported = true; }
    getBoundingClientRect() { return { left: 100, top: 100, right: 700, bottom: 700 }; }
    showModal() { this.open = true; }
    close() { const wasOpen = this.open;this.open = false;if (wasOpen) this.onclose?.(); }
  }
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.document = { createElement: tag => new Node(tag) };
  globalThis.window = { addEventListener() {} };
  t.after(() => { globalThis.document = previousDocument;globalThis.window = previousWindow; });
  const root = new Node('main'), teacherUrl = 'https://example.org/class/private?gameId=secret#dashboard';
  let qrRequests = 0;const qrPaths = [];
  mountWebApps(root, { id: 'page-d5ccbf8787cd', webApps: Array.from({ length: count }, (_, index) => ({ title: count === 1 ? '실습' : `실습 ${index + 1}`, teacherUrl, studentUrl, ...(lessonId ? { lessonId } : {}), ...(typeIds ? { typeId: typeIds[index] } : typeId ? { typeId } : {}), ...(thumbnailUrl ? { thumbnailUrl } : {}), ...(thumbnailImage ? { thumbnailImage } : {}) })) }, { canEdit, sessionId: 'training', lessons, api, fetchQr: path => { qrRequests++;qrPaths.push(path);return qrFetch ? qrFetch(path) : new Promise(() => {}); } });
  const all = node => [node, ...node.children.flatMap(all)];
  return { get nodes() { return all(root); }, teacherUrl, get qrRequests() { return qrRequests; }, qrPaths, byClass: name => all(root).find(node => node.className.split(' ').includes(name)) };
}

test('iframe 대신 공개 썸네일 링크를 표시하고 이미지 오류여도 교사 링크를 유지한다', t => {
  const view = setup(t), preview = view.byClass('wa-preview'), media = view.byClass('wa-preview-media');
  assert.equal(view.nodes.some(node => node.tag === 'iframe'), false);
  assert.equal(preview.href, view.teacherUrl);assert.equal(preview.target, '_blank');assert.equal(preview.rel, 'noopener noreferrer');
  const [image, status] = media.children;
  assert.equal(image.loading, 'lazy');assert.notEqual(image.hidden, true, '숨긴 이미지는 브라우저 지연 로딩을 시작하지 못한다');
  assert.equal(image.src.includes('secret'), false);assert.equal(image.src.includes('/class/'), false);
  image.onerror();assert.equal(image.hidden, true);assert.match(status.textContent, /불러오지 못했습니다/);
  image.onload();assert.equal(image.hidden, false);assert.equal(status.hidden, true);
  assert.equal(preview.href, view.teacherUrl);
});

test('등록한 이미지가 있으면 자동 캡처 서비스를 호출하지 않는다', t => {
  const view = setup(t, { thumbnailUrl: 'https://example.org/dashboard.jpg' });
  assert.equal(view.byClass('wa-preview-media').children[0].src, 'https://example.org/dashboard.jpg');
});

test('저장한 캡처 이미지를 썸네일과 설정에 복구하고 지우기는 저장 전 초안에만 반영한다', t => {
  const thumbnailImage = 'data:image/jpeg;base64,' + readFileSync(new URL('../../assets/lesson-thumbnails/apps/group-2.jpg', import.meta.url)).toString('base64');
  const view = setup(t, { thumbnailImage, thumbnailUrl: 'https://example.org/old.jpg' });
  assert.equal(view.byClass('wa-preview-media').children[0].src, thumbnailImage);
  view.byClass('wa-toolbar-actions').children[1].onclick();
  const row = view.byClass('wa-fields').children[0], capture = row.children.find(node => node.className === 'wa-capture');
  const [paste, clear, preview, value] = capture.children;
  assert.equal(value.value, thumbnailImage);assert.equal(preview.hidden, false);
  clear.onclick();assert.equal(value.value, '');assert.equal(preview.hidden, true);
  view.byClass('wa-settings').querySelectorAll('button').find(node => node.textContent === '취소').onclick();
  view.byClass('wa-toolbar-actions').children[1].onclick();
  assert.equal(view.byClass('wa-fields').children[0].children.find(node => node.className === 'wa-capture').children[3].value, thumbnailImage);
  let prevented = false;
  row.onpaste({ clipboardData: { items: [{ type: 'text/plain' }] }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);assert.equal(paste.textContent, '캡처 이미지 붙여넣기');
});

test('참가자도 같은 썸네일·앱 열기·학생 QR을 보며 편집 버튼은 숨긴다', t => {
  const thumbnailImage = 'data:image/jpeg;base64,' + readFileSync(new URL('../../assets/lesson-thumbnails/apps/group-2.jpg', import.meta.url)).toString('base64');
  const view = setup(t, { canEdit: false, thumbnailImage });
  assert.equal(view.byClass('wa-preview').href, view.teacherUrl);
  assert.equal(view.byClass('wa-preview-media').children[0].src, thumbnailImage);
  const actions = view.byClass('wa-card-actions').children;
  assert.equal(actions[0].href, view.teacherUrl);assert.equal(actions[0].textContent, '앱 열기 ↗');
  assert.equal(actions[1].textContent, '학생 QR');
  assert.equal(view.byClass('wa-toolbar-actions').hidden, true);
  assert.equal(view.byClass('wa-toolbar-actions').children[2].hidden, true);
});

test('유형 수정은 네 문구를 채우고 취소하면 원본을 유지하며 저장 후 새 문구를 복구한다', async t => {
  let body;
  const view = setup(t, { typeId: 'type-1', api: async (route, method, next) => { body = next;return { webAppTypes: next.webAppTypes, webAppsRevision: 1 }; } });
  const edit = view.byClass('wa-toolbar-actions').children[2], dialog = view.byClass('wa-types-dialog'), form = dialog.children[0];
  assert.equal(view.byClass('wa-types'), undefined);
  edit.onclick();let inputs = dialog.querySelectorAll('input[type="text"]');assert.deepEqual(inputs.map(input => input.value), [...DEFAULT_WEB_APP_TYPES]);assert.equal(inputs[0].focused, true);
  inputs[0].value = '저장하지 않는 초안';inputs[0].oninput();
  dialog.querySelectorAll('button').find(node => node.textContent === '취소').onclick();
  edit.onclick();inputs = dialog.querySelectorAll('input[type="text"]');assert.equal(inputs[0].value, DEFAULT_WEB_APP_TYPES[0]);assert.equal(body, undefined);
  inputs[0].value = ' 수정한 첫 유형 ';inputs[0].oninput();
  await form.onsubmit({ preventDefault() {} });
  assert.equal(body.webAppTypes[0].id, 'type-1');assert.equal(body.webAppTypes[0].label, '수정한 첫 유형');assert.equal(body.webAppsRevision, 0);
  assert.equal(dialog.open, false);
  assert.match(view.byClass('wa-group').children[0].textContent, /수정한 첫 유형/);
  edit.onclick();assert.equal(dialog.querySelector('input[type="text"]').value, '수정한 첫 유형');
});

test('유형 저장 실패와 중복 오류는 편집 내용을 유지한다', async t => {
  let calls = 0;
  const view = setup(t, { api: async () => { calls++;throw new Error('다른 곳에서 수정했습니다.'); } });
  view.byClass('wa-toolbar-actions').children[2].onclick();
  const dialog = view.byClass('wa-types-dialog'), input = dialog.querySelector('input[type="text"]'), status = dialog.children[0].children[3];
  input.value = '새 문구';await dialog.children[0].onsubmit({ preventDefault() {} });
  assert.equal(dialog.open, true);assert.equal(input.value, '새 문구');assert.match(status.textContent, /다른 곳/);assert.equal(input.disabled, false);
  input.value = DEFAULT_WEB_APP_TYPES[1];await dialog.children[0].onsubmit({ preventDefault() {} });
  assert.match(status.textContent, /중복/);assert.equal(calls, 1);
});

test('웹앱의 유형을 선택·저장하고 유형별 그룹과 다음 편집에 선택 상태를 복구한다', async t => {
  let saved;
  const view = setup(t, { api: async (route, method, body) => { saved = body;return { webApps: body.webApps, webAppsRevision: 1 }; } });
  view.byClass('wa-toolbar-actions').children[1].onclick();
  const dialog = view.byClass('wa-settings'), row = view.byClass('wa-fields').children[0];
  const group = row.children.find(node => node.className === 'wa-type-options'), choices = group.querySelectorAll('button');
  assert.equal(choices[0].attributes['aria-pressed'], 'true');choices[3].onclick();
  assert.equal(choices[3].attributes['aria-pressed'], 'true');assert.equal(choices[0].attributes['aria-pressed'], 'false');
  await dialog.children[0].onsubmit({ preventDefault() {} });
  assert.equal(saved.webApps[0].typeId, 'type-3');
  assert.match(view.byClass('wa-groups').children[0].children[0].textContent, /^3번 유형/);
  view.byClass('wa-toolbar-actions').children[1].onclick();
  assert.equal(view.byClass('wa-fields').children[0].querySelector('[name="typeId"]').value, 'type-3');
});

test('참가자 화면도 지정한 유형별로 묶는다', t => {
  const view = setup(t, { typeId: 'type-2', canEdit: false });
  assert.match(view.byClass('wa-group').children[0].textContent, /^2번 유형/);
});

test('유형 번호 순으로 묶고 미지정은 마지막에 두며 QR은 원래 웹앱 번호를 사용한다', async t => {
  const view = setup(t, { count: 5, typeIds: ['type-3', 'type-2', '', 'type-2', 'type-1'], qrFetch: async () => ({ ok: true, blob: async () => new Blob(['qr']) }) });
  const groups = view.byClass('wa-groups').children;
  assert.deepEqual(groups.map(group => group.children[0].textContent.split(' · ')[0]), ['1번 유형', '2번 유형', '3번 유형', '미지정']);
  const names = group => group.children[1].children.map(card => card.children[1].children[0].textContent);
  assert.deepEqual(groups.map(names), [['실습 5'], ['실습 2', '실습 4'], ['실습 1'], ['실습 3']]);
  assert.equal(view.qrRequests, 0);
  const secondTypeCards = groups[1].children[1].children;
  await secondTypeCards[1].children[1].children[1].children[1].onclick();
  assert.match(view.qrPaths[0], /\/web-apps\/3\/qr\?session=training$/);
  view.byClass('qr-dialog').close();
});

test('삭제된 유형 번호가 남은 웹앱도 미지정 그룹에서 유지한다', t => {
  const view = setup(t, { typeId: 'type-deleted' });
  assert.equal(view.byClass('wa-group').children[0].textContent, '미지정');
  assert.equal(view.byClass('wa-gallery').children.length, 1);
});

test('바깥 추가 버튼은 기존 설정을 보존하고 새 입력란에 초점을 둔다', t => {
  const view = setup(t), tools = view.byClass('wa-toolbar-actions'), fields = view.byClass('wa-fields'), dialog = view.byClass('wa-settings');
  assert.equal(tools.hidden, false);
  assert.deepEqual(tools.children.map(node => node.textContent), ['+ 웹앱 추가', '웹앱 설정', '유형 수정']);
  tools.children[0].onclick();
  assert.equal(dialog.open, true);assert.equal(fields.children.length, 2);
  assert.equal(fields.children[0].querySelector('[name="title"]').value, '실습');
  assert.equal(fields.children[1].querySelector('[name="lessonId"]').value, '');
  assert.equal(fields.children[1].querySelector('input[type="search"]').focused, true);
  view.byClass('wa-settings').querySelectorAll('button').find(node => node.textContent === '취소').onclick();
  tools.children[1].onclick();assert.equal(fields.children.length, 1);
});

test('BOOONG 수업 선택은 이름·썸네일·교사 링크를 채우고 선택한 유형을 유지한다', async t => {
  const lesson = { id: 'group-2', title: '자동 수업 이름', teacherUrl: 'https://example.org/lesson', thumbnailUrl: 'https://example.org/cover.jpg', searchText: '자동 수업 이름 사회' };
  let saved;
  const view = setup(t, { count: 0, lessons: [lesson], api: async (route, method, body) => { saved = body;return { webApps: body.webApps, webAppsRevision: 1 }; } });
  view.byClass('wa-toolbar-actions').children[0].onclick();
  const fields = view.byClass('wa-fields'), form = view.byClass('wa-settings').children[0];
  fields.children[0].children.find(node => node.className === 'wa-type-options').querySelectorAll('button')[3].onclick();
  fields.children[0].querySelector('input[type="search"]').value = '없는 수업';
  fields.children[0].querySelector('input[type="search"]').oninput();
  const search = fields.children[0].querySelector('input[type="search"]');search.value = '사회';search.oninput();
  fields.children[0].querySelectorAll('button').find(node => node.className.includes('wa-lesson-choice')).onclick();
  const row = fields.children[0];
  assert.equal(row.querySelector('[name="teacherUrl"]').value, lesson.teacherUrl);
  assert.equal(row.querySelector('[name="studentUrl"]').required, false);
  assert.equal(row.querySelector('h3').textContent, lesson.title);
  assert.equal(row.querySelector('img').src, lesson.thumbnailUrl);
  await form.onsubmit({ preventDefault() {} });
  assert.deepEqual(saved.webApps, [{ lessonId: 'group-2', typeId: 'type-3' }]);
  assert.equal(view.byClass('wa-gallery').children[0].children[1].children[0].textContent, lesson.title);
});

test('선택한 수업의 교사 링크 수정과 선택 학생 링크를 저장한다', async t => {
  const lesson = { id: 'group-2', title: '자동 이름', teacherUrl: 'https://example.org/lesson', thumbnailUrl: 'https://example.org/cover.jpg', searchText: '자동 이름' };
  let saved;
  const view = setup(t, { count: 0, lessons: [lesson], api: async (route, method, body) => { saved = body;return { webApps: body.webApps, webAppsRevision: 1 }; } });
  view.byClass('wa-toolbar-actions').children[0].onclick();
  const fields = view.byClass('wa-fields');
  fields.children[0].querySelectorAll('button').find(node => node.className.includes('wa-lesson-choice')).onclick();
  fields.children[0].querySelector('[name="teacherUrl"]').value = 'https://example.org/class?room=private';
  fields.children[0].querySelector('[name="studentUrl"]').value = 'https://example.org/join?room=private';
  await view.byClass('wa-settings').children[0].onsubmit({ preventDefault() {} });
  assert.deepEqual(saved.webApps, [{ lessonId: 'group-2', teacherUrl: 'https://example.org/class?room=private', studentUrl: 'https://example.org/join?room=private' }]);
});

test('빈 목록은 입력란 하나로 시작한다', t => {
  const empty = setup(t, { count: 0 });
  empty.byClass('wa-toolbar-actions').children[0].onclick();
  assert.equal(empty.byClass('wa-fields').children.length, 1);
});

test('20개일 때 추가를 막는다', t => {
  const full = setup(t, { count: 20 }), add = full.byClass('wa-toolbar-actions').children[0];
  assert.equal(add.disabled, true);add.onclick();
  assert.equal(full.byClass('wa-settings').open, undefined);
});

test('편집할 웹앱만 표시하고 다른 웹앱의 초안도 유지하며 숨긴 오류 입력으로 이동한다', async t => {
  let calls = 0;
  const view = setup(t, { count: 3, api: async () => { calls++; } });
  view.byClass('wa-toolbar-actions').children[1].onclick();
  const rows = view.byClass('wa-fields').children, nav = view.byClass('wa-editor-nav'), dialog = view.byClass('wa-settings');
  assert.deepEqual(rows.map(row => row.hidden), [false, true, true]);
  nav.children[1].onclick();const input = rows[1].querySelector('[name="teacherUrl"]');input.value = 'invalid';input.checkValidity = () => false;
  nav.children[0].onclick();assert.equal(input.value, 'invalid');
  await dialog.children[0].onsubmit({ preventDefault() {} });
  assert.deepEqual(rows.map(row => row.hidden), [true, false, true]);assert.equal(input.reported, true);assert.equal(calls, 0);
});

test('배경에서 시작하고 끝난 클릭만 취소하며 모달 여백·내부 드래그는 닫지 않는다', t => {
  const view = setup(t), open = view.byClass('wa-toolbar-actions').children[1], dialog = view.byClass('wa-settings');open.onclick();
  const pointer = (x, y) => ({ target: dialog, button: 0, clientX: x, clientY: y });
  dialog.onpointerdown(pointer(200, 200));dialog.onclick(pointer(50, 50));assert.equal(dialog.open, true);
  dialog.onpointerdown(pointer(50, 50));dialog.onclick(pointer(200, 200));assert.equal(dialog.open, true);
  const input = view.byClass('wa-fields').children[0].querySelector('[name="teacherUrl"]');input.value = 'https://example.org/draft';
  dialog.onpointerdown(pointer(50, 50));dialog.onclick(pointer(50, 50));assert.equal(dialog.open, false);
  open.onclick();assert.equal(view.byClass('wa-fields').children[0].querySelector('[name="teacherUrl"]').value, view.teacherUrl);
});

test('저장 중에는 배경과 상단 닫기를 막고 저장 성공 후 닫는다', async t => {
  let complete, saved;
  const view = setup(t, { api: (route, method, body) => { saved = body;return new Promise(resolve => { complete = resolve; }); } });
  view.byClass('wa-toolbar-actions').children[1].onclick();
  const dialog = view.byClass('wa-settings'), saving = dialog.children[0].onsubmit({ preventDefault() {} });
  const outside = { target: dialog, button: 0, clientX: 50, clientY: 50 };
  dialog.onpointerdown(outside);dialog.onclick(outside);
  view.byClass('wa-settings-heading').children[1].onclick();assert.equal(dialog.open, true);
  complete({ webApps: saved.webApps, webAppsRevision: 1 });await saving;assert.equal(dialog.open, false);
});

test('유형 편집 배경 클릭도 저장하지 않고 닫는다', t => {
  const view = setup(t);view.byClass('wa-toolbar-actions').children[2].onclick();
  const dialog = view.byClass('wa-types-dialog'), input = dialog.querySelector('input[type="text"]');input.value = '초안';input.oninput();
  const outside = { target: dialog, button: 0, clientX: 50, clientY: 50 };dialog.onpointerdown(outside);dialog.onclick(outside);
  assert.equal(dialog.open, false);view.byClass('wa-toolbar-actions').children[2].onclick();
  assert.equal(dialog.querySelector('input[type="text"]').value, DEFAULT_WEB_APP_TYPES[0]);
});

test('QR을 배경 클릭으로 닫으면 늦게 도착한 이미지를 버린다', async t => {
  let complete;
  const view = setup(t, { qrFetch: () => new Promise(resolve => { complete = resolve; }) });
  const dialog = view.byClass('qr-dialog'), pending = view.byClass('wa-gallery').children[0].children[1].children[1].children[1].onclick();
  const outside = { target: dialog, button: 0, clientX: 50, clientY: 50 };dialog.onpointerdown(outside);dialog.onclick(outside);
  complete({ ok: true, blob: async () => new Blob(['late']) });await pending;
  assert.equal(dialog.open, false);assert.equal(dialog.children[1].hidden, true);
});

test('학생 URL 없이도 교사 화면을 표시하고 학생 참여·QR 요청은 생략한다', t => {
  const view = setup(t, { studentUrl: '' });
  assert.equal(view.byClass('wa-preview').href, view.teacherUrl);
  assert.equal(view.byClass('wa-join'), undefined);assert.equal(view.qrRequests, 0);
  assert.equal(view.byClass('wa-card-actions').children.some(node => node.textContent === '학생 QR'), false);
  view.byClass('wa-toolbar-actions').children[1].onclick();
  const row = view.byClass('wa-fields').children[0];
  const input = name => row.children.flatMap(node => node.children).find(node => node.name === name);
  assert.equal(input('studentUrl').required, false);assert.equal(input('teacherUrl').required, true);
});

test('여러 웹앱을 한 번에 카드로 표시하고 버튼을 누를 때 해당 QR만 불러온다', async t => {
  const view = setup(t, { count: 3, qrFetch: async () => ({ ok: true, blob: async () => new Blob(['qr']) }) });
  const cards = view.byClass('wa-gallery').children, dialog = view.byClass('qr-dialog');
  assert.equal(cards.length, 3);assert.equal(view.qrRequests, 0);
  assert.deepEqual(cards.map(card => card.children[1].children[0].textContent), ['실습 1', '실습 2', '실습 3']);
  const secondQr = cards[1].children[1].children[1].children[1];
  assert.equal(secondQr.textContent, '학생 QR');assert.equal(secondQr.attributes['aria-haspopup'], 'dialog');
  await secondQr.onclick();
  assert.equal(dialog.open, true);assert.equal(view.qrRequests, 1);
  assert.match(view.qrPaths[0], /\/web-apps\/1\/qr\?session=training$/);
  assert.equal(dialog.children[0].children[0].textContent, '실습 2');
  assert.equal(dialog.children[1].hidden, false);assert.match(dialog.children[1].src, /^blob:/);
  const revoked = [];t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  dialog.children[0].children[1].onclick();
  assert.deepEqual(revoked, [dialog.children[1].src]);assert.equal(dialog.open, false);
});

test('닫힌 QR 요청이 나중에 끝나도 다음 카드의 QR을 덮어쓰지 않는다', async t => {
  const pending = [], view = setup(t, { count: 2, qrFetch: () => new Promise(resolve => pending.push(resolve)) });
  const cards = view.byClass('wa-gallery').children, dialog = view.byClass('qr-dialog');
  const first = cards[0].children[1].children[1].children[1].onclick();
  dialog.close();
  const second = cards[1].children[1].children[1].children[1].onclick();
  pending[1]({ ok: false });await second;
  assert.match(dialog.children[2].textContent, /불러오지 못했습니다/);
  pending[0]({ ok: true, blob: async () => new Blob(['old']) });await first;
  assert.equal(dialog.children[1].hidden, true);assert.equal(dialog.children[0].children[0].textContent, '실습 2');
  assert.equal(dialog.children[3].children[0].href, 'https://example.org/student?gameId=secret');
});

test('학생 URL이 없어도 참가자에게 같은 웹앱을 열고 미리보기를 표시한다', t => {
  const view = setup(t, { canEdit: false, studentUrl: '' });
  assert.equal(view.qrRequests, 0);assert.equal(view.byClass('wa-join'), undefined);
  assert.equal(view.byClass('wa-preview').href, view.teacherUrl);
  assert.equal(view.byClass('wa-card-actions').children[0].href, view.teacherUrl);
  assert.equal(view.nodes.some(node => node.textContent === '학생 참여 링크가 등록되지 않았습니다.'), false);
});

test('BOOONG 수업을 연결한 참가자 카드도 카탈로그의 이름과 이미지를 사용한다', t => {
  const view = setup(t, { canEdit: false, lessonId: 'group-2', lessons: [{ id: 'group-2', title: '연결한 수업', teacherUrl: 'https://example.org/lesson', thumbnailUrl: 'https://example.org/cover.jpg' }] });
  assert.equal(view.byClass('wa-card-body').children[0].textContent, '연결한 수업');
  assert.equal(view.byClass('wa-preview-media').children[0].src, 'https://example.org/cover.jpg');
  assert.equal(view.byClass('wa-preview').href, view.teacherUrl);
});
