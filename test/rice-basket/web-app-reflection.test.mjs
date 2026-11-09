import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHandler } from '../../lib/rice-basket/server.mjs';
import { WEB_APPS_PAGE_ID } from '../../rice-basket/web-app-config.js';

test('웹앱 매력 포스트잇과 댓글은 연수 공유 화면에서 함께 보고 다른 게시판은 비공개로 유지한다', async () => {
  const privatePage = 'page-0a0c2f1d230e';
  let data = { schemaVersion: 3, pages: [{ id: WEB_APPS_PAGE_ID, title: '웹앱', sections: [] }, { id: privatePage, title: '아이디어', sections: [] }], sessions: [
    { id: 'training', pageIds: [WEB_APPS_PAGE_ID, privatePage], notesByPage: { [privatePage]: [{ id: 'private-note', text: '기존 답변' }] } },
    { id: 'separate', pageIds: [WEB_APPS_PAGE_ID] },
    { id: 'unassigned', pageIds: [] },
  ], surveys: [] };
  const run = createHandler({ load: async () => ({ data: structuredClone(data) }), save: async state => { data = state.data; } });
  async function call(session, method = 'GET', body, admin = false, page = WEB_APPS_PAGE_ID, suffix = '') {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    Object.assign(req, { method, url: `/api/sessions/${session}/pages/${page}/notes${suffix}`, headers: { host: 'localhost' }, riceBasketAdmin: admin });
    let status, result;
    await run(req, { writeHead: code => { status = code; }, end: value => { result = JSON.parse(value); } });
    return { status, body: result };
  }
  const note = { name: '참가자', text: '내 선택에 따라 수업자료가 움직이는 느낌이다.' };
  assert.equal((await call('training', 'POST', note)).status, 201);
  assert.equal((await call('training', 'GET', undefined, true)).body.notes[0].text, note.text);
  const shared = await call('training');
  assert.equal(shared.body.notes[0].name, note.name);
  assert.equal(shared.body.notes[0].text, note.text);
  assert.deepEqual((await call('separate')).body.notes, []);
  const comment = { name: '동료', text: '저도 같은 점이 좋았어요.' };
  const suffix = `/${shared.body.notes[0].id}/comments`;
  assert.equal((await call('training', 'POST', comment, false, WEB_APPS_PAGE_ID, suffix)).status, 201);
  assert.deepEqual((await call('training')).body.notes[0].comments, [comment]);
  assert.equal((await call('separate', 'POST', comment, false, WEB_APPS_PAGE_ID, suffix)).status, 404);
  assert.equal((await call('training', 'POST', { ...comment, text: ' ' }, false, WEB_APPS_PAGE_ID, suffix)).status, 400);
  assert.deepEqual((await call('training', 'GET', undefined, false, privatePage)).body, { notes: [], recordsVisible: false });
  assert.equal((await call('training', 'POST', comment, false, privatePage, '/private-note/comments')).status, 401);
  assert.equal((await call('unassigned', 'POST', note)).status, 404);
  assert.equal((await call('unassigned')).status, 404);
  assert.equal((await call('training', 'POST', { ...note, text: ' ' })).status, 400);
  assert.equal((await call('training', 'POST', { ...note, text: '가'.repeat(501) })).status, 400);
  assert.equal(data.sessions[0].notesByPage[WEB_APPS_PAGE_ID].length, 1);
  assert.equal(data.sessions[0].notesByPage[privatePage][0].text, '기존 답변');
});

test('웹앱 목록 위 활동에서 이 페이지를 포함한 연수로 포스트잇 작성을 연결한다', async () => {
  const source = await readFile(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
  const board = source.slice(source.indexOf('function ideaBoard(page){'), source.indexOf('\nasync function resourceEditor('));
  let position, html;
  const add = {}, status = {}, links = { children: [], replaceChildren() { this.children = []; }, append(link) { this.children.push(link); } };
  const picker = { hidden: true, querySelector: selector => selector === '[role=status]' ? status : links };
  const anchor = { insertAdjacentHTML(where, content) { position = where;html = content; } };
  const root = { classList: { add() {} }, querySelector: selector => selector === '.lp-page-intro' ? anchor : selector === '#lp-note-add' ? add : picker };
  const context = vm.createContext({
    WEB_APPS_PAGE_ID, ideaBoardPageId: 'page-0a0c2f1d230e', sessionId: null,
    app: { querySelector: () => root }, document: { createElement: () => ({}) },
    hrefPage: (page, session) => `?p=${page}&s=${session}`,
    api: async route => route === '/api/admin' ? { sessions: [{ id: 'yes' }, { id: 'no' }] }
      : { id: route.endsWith('/yes') ? 'yes' : 'no', name: '연수', pageIds: route.endsWith('/yes') ? [WEB_APPS_PAGE_ID] : [] },
  });
  vm.runInContext(board, context);
  context.ideaBoard({ id: WEB_APPS_PAGE_ID });
  assert.equal(position, 'afterend');
  assert.match(html, /웹앱 형태의 수업자료에는 어떤 매력이 있나요/);
  assert.match(html, /웹앱들을 열어 직접 살펴보세요/);
  assert.match(html, /나만의 표현/);
  await add.onclick();
  assert.equal(picker.hidden, false);
  assert.equal(links.children.length, 1);
  assert.equal(links.children[0].href, `/studies/?p=${WEB_APPS_PAGE_ID}&s=yes&note=1`);
  assert.equal(links.children[0].target, '_blank');
});

test('공유 포스트잇은 공개 안내와 개수를 표시하고 운영자 전용 안내를 없앤다', async () => {
  const source = await readFile(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
  const board = source.slice(source.indexOf('function ideaBoard(page){'), source.indexOf('\nasync function resourceEditor('));
  let html, refresh, reads=0, writes=0, cleared=0, countText;
  const status = {}, count = {}, button = {}, draft = {}, form = { elements: { name: { focus() {} }, text: {} }, querySelector: () => button };
  Object.defineProperty(count, 'textContent', { get: () => countText, set: value => { countText=value;writes++; } });
  const add = { setAttribute() {}, closest: () => ({}), focus() {} };
  const anchor = { insertAdjacentHTML(where, content) { html = content; } };
  const nodes = { '.lp-page-intro': anchor, '#lp-note-form': form, '#lp-notes': {}, '#lp-note-status': status, '#lp-note-count': count, '#lp-note-add': add, '.lp-note-draft': draft, '#lp-note-cancel': {} };
  const root = { isConnected: true, classList: { add() {} }, querySelector: selector => nodes[selector] };
  const context = vm.createContext({
    WEB_APPS_PAGE_ID, ideaBoardPageId: 'page-0a0c2f1d230e', sessionId: 'training', operatorMode: false,
    app: { querySelector: () => root }, params: new URLSearchParams(), document: { hidden: false },
    api: async () => { reads++;return { notes: [] }; }, setInterval: callback => { refresh = callback;return 1; }, clearInterval: () => { cleared++; },
  });
  vm.runInContext(board, context);
  context.ideaBoard({ id: WEB_APPS_PAGE_ID });
  await new Promise(setImmediate);
  assert.match(html, /이름과 내용이 이 연수의 공유 화면에 표시됩니다/);
  assert.doesNotMatch(html, /운영자만 확인|운영자에게만/);
  assert.equal(count.textContent, '0개의 포스트잇');
  assert.equal(status.textContent, '');
  await refresh();
  assert.equal(status.textContent, '');
  assert.equal(writes, 1, '응답이 같으면 포스트잇 개수도 다시 쓰지 않는다');
  assert.equal(reads, 2);
  context.document.hidden=true;await refresh();assert.equal(reads, 2, '숨긴 탭은 조회하지 않는다');
  context.document.hidden=false;await refresh();assert.equal(reads, 3, '복귀하면 조회를 재개한다');
  root.isConnected=false;await refresh();assert.equal(reads, 3);assert.equal(cleared, 1);
});
