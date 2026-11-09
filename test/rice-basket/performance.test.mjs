import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
const learning = source.slice(source.indexOf('async function learningView('), source.indexOf('\nasync function start('))
  .replace("const {mountWebApps}=await import('./web-apps.js');", '')
  .replace("const {loadWebAppLessons}=await import('./web-app-lessons.js');", '');

function environment(page, targets = [], operatorMode = false) {
  const session = { id: 'training', name: '연수', pageIds: [page.id], pages: [page], people: [], counts: {}, recordsVisible: false, generation: 0 };
  const root = { isConnected: true }, intervals = [], calls = [];
  let catalogReads = 0, mounted = false, cleared = 0;
  const context = vm.createContext({
    sessionId: 'training', pageId: page.id, operatorMode, WEB_APPS_PAGE_ID: 'web-apps',
    document: { querySelector: () => root, querySelectorAll: () => targets },
    app: { classList: { add() {} }, querySelector: () => root, insertAdjacentHTML() {} },
    localStorage: { getItem: () => null },
    api: async route => { calls.push(route);return session; },
    publicHeader: () => '', sharedSessionUrl: () => '', sessionAdminLinks: () => '', learningNavigation: () => '', adminShell() {},
    renderLearningPage() {}, ideaBoard() {}, resourceEditor() {}, adminAccountId: () => 'owner',
    loadWebAppLessons: async () => { catalogReads++;return []; },
    mountWebApps: () => { mounted = true; }, publicFetch() {}, operatorFetch() {},
    setInterval: callback => { intervals.push(callback);return intervals.length; }, clearInterval: () => { cleared++; },
  });
  vm.runInContext(learning, context);
  return { context, intervals, calls, session, root, get catalogReads() { return catalogReads; }, get mounted() { return mounted; }, get cleared() { return cleared; } };
}

test('설명·영상 페이지만 열면 연수를 한 번 읽고 주기적 조회를 시작하지 않는다', async () => {
  const view = environment({ id: 'architecture' });
  await view.context.learningView();
  assert.equal(view.calls.length, 1);
  assert.equal(view.intervals.length, 0);
});

test('활동은 숨긴 탭·진행 중 요청·떼어낸 화면을 재조회하지 않고 복귀하면 갱신한다', async () => {
  const target = { dataset: { sessionActivity: 'compare' }, isConnected: true };
  const view = environment({ id: 'activity' }, [target]);
  await view.context.learningView();
  const refresh = view.intervals[0];
  view.context.document.hidden = true;await refresh();assert.equal(view.calls.length, 1);
  view.context.document.hidden = false;
  let release, reads = 0;
  view.context.api = () => { reads++;return new Promise(resolve => { release = resolve; }); };
  const first = refresh();await refresh();assert.equal(reads, 1);
  release(view.session);await first;
  const second = refresh();assert.equal(reads, 2);release(view.session);await second;
  target.isConnected = false;await refresh();assert.equal(reads, 2);assert.equal(view.cleared, 1);
});

for (const [operator, apps, expected] of [[false, [{ title: '기존 앱' }], 0], [false, [{ lessonId: 'lesson' }], 1], [true, [], 1]]) {
  test(`웹앱 카탈로그는 연결 수업이나 편집에 필요할 때만 읽는다 (${operator}, ${expected})`, async () => {
    const view = environment({ id: 'web-apps', webApps: apps }, [], operator);
    await view.context.learningView();
    assert.equal(view.catalogReads, expected);assert.equal(view.mounted, true);
  });
}
