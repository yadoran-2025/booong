import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountWebApps } from '../../rice-basket/web-apps.js';

function setup(t, { canEdit = true, thumbnailUrl } = {}) {
  class Node {
    constructor(tag) { this.tag = tag; }
    className = '';children = [];attributes = {};isConnected = true;
    classList = { add: name => { this.className += ` ${name}`; }, remove() {} };
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener() {}
  }
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.document = { createElement: tag => new Node(tag) };
  globalThis.window = { addEventListener() {} };
  t.after(() => { globalThis.document = previousDocument;globalThis.window = previousWindow; });
  const root = new Node('main'), teacherUrl = 'https://example.org/class/private?gameId=secret#dashboard';
  mountWebApps(root, { id: 'page-d5ccbf8787cd', webApps: [{ title: '실습', teacherUrl, studentUrl: 'https://example.org/student?gameId=secret', ...(thumbnailUrl ? { thumbnailUrl } : {}) }] }, { canEdit, sessionId: 'training', api() {}, fetchQr: () => new Promise(() => {}) });
  const all = node => [node, ...node.children.flatMap(all)];
  const nodes = all(root);
  return { nodes, teacherUrl, byClass: name => nodes.find(node => node.className.split(' ').includes(name)) };
}

test('iframe 대신 공개 썸네일 링크를 표시하고 이미지 오류여도 교사 링크를 유지한다', t => {
  const view = setup(t), preview = view.byClass('wa-preview'), media = view.byClass('wa-preview-media');
  assert.equal(view.nodes.some(node => node.tag === 'iframe'), false);
  assert.equal(preview.href, view.teacherUrl);assert.equal(preview.target, '_blank');assert.equal(preview.rel, 'noopener noreferrer');
  const [image, status] = media.children;
  assert.equal(image.src.includes('secret'), false);assert.equal(image.src.includes('/class/'), false);
  image.onerror();assert.equal(image.hidden, true);assert.match(status.textContent, /불러오지 못했습니다/);
  image.onload();assert.equal(image.hidden, false);assert.equal(status.hidden, true);
  assert.equal(preview.href, view.teacherUrl);
});

test('등록한 이미지가 있으면 자동 캡처 서비스를 호출하지 않는다', t => {
  const view = setup(t, { thumbnailUrl: 'https://example.org/dashboard.jpg' });
  assert.equal(view.byClass('wa-preview-media').children[0].src, 'https://example.org/dashboard.jpg');
});

test('참가자 화면은 교사 썸네일과 교사 링크를 표시하지 않는다', t => {
  const view = setup(t, { canEdit: false });
  assert.equal(view.byClass('wa-preview'), undefined);
  assert.equal(view.nodes.some(node => node.href === view.teacherUrl), false);
  assert.equal(view.nodes.some(node => String(node.src || '').includes('thum.io')), false);
});
