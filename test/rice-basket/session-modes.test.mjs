import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
const startup = source.slice(source.indexOf('async function start('));

for (const [query, mode, authenticated] of [
  ['?s=training', 'shared', false],
  ['?s=training&p=survey', 'learning', false],
  ['?admin=1&s=training', 'editor', true],
  ['?admin=1&s=training&tab=responses', 'redirect', true],
  ['?manage=1&s=training', 'redirect', true],
  ['?admin=1&s=training&p=survey', 'learning', true],
  ['?manage=1&s=training&p=survey', 'learning', true],
]) test(`${query}는 ${mode} 화면으로 이동하고 인증 범위를 유지한다`, async () => {
  const params = new URLSearchParams(query), routes = [], calls = [];
  let subscription;
  const context = vm.createContext({
    params, authGeneration: 0, pollTimer: null, admin: params.has('admin'), operatorMode: params.has('admin') || params.has('manage'),
    pageId: params.get('p'), sessionId: params.get('s'), app: { replaceChildren() {} },
    window: { addEventListener() {} }, clearInterval() {},
    requireAdmin: async () => { calls.push('auth');return true; },
    onAdminAccountChange: callback => { subscription = callback; },
    api: async route => { calls.push(route);return { pages: [], sessions: [] }; },
    learningView: async () => routes.push('learning'), sharedGrid: async () => routes.push('shared'),
    classEditor: async () => routes.push('editor'),
    location: { replace: url => { assert.equal(url, '/studies/?admin=1&s=training');routes.push('redirect'); } },
    errorView: error => { throw error; },
  });
  vm.runInContext(startup, context);
  subscription?.();await new Promise(setImmediate);
  assert.deepEqual(routes, [mode]);
  assert.equal(calls.includes('auth'), authenticated);
  assert.equal(calls.includes('/api/admin'), mode === 'editor', '특정 관리 페이지를 열 때 전체 목록을 먼저 읽지 않는다');
});

test('관리 페이지 링크는 관리 경로를 유지하고 참가자 화면은 별도 창의 공개 주소를 쓴다', () => {
  const helpers = source.slice(source.indexOf('const hrefPage ='), source.indexOf('function toast('));
  for (const operatorMode of [true, false]) {
    const context = vm.createContext({ operatorMode, pageId: null, params: new URLSearchParams('tab=responses') });
    vm.runInContext(helpers, context);
    const href = vm.runInContext("hrefPage('survey', 'training')", context);
    const url = new URL(href, 'http://localhost');
    assert.equal(url.searchParams.has('admin'), operatorMode);
    assert.equal(url.searchParams.has('manage'), false);
    assert.equal(url.searchParams.get('s'), 'training');
    const nav = context.sessionAdminLinks('training');
    assert.match(nav, /aria-current="page">연수 구성/);
    assert.doesNotMatch(nav, /응답·공유 관리|tab=responses/);
    assert.match(nav, /href="\/studies\/\?s=training" target="_blank" rel="noopener noreferrer">연수생 화면 열기/);
  }
});
