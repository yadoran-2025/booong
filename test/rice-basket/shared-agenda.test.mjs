import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

test('설문은 공유 목차의 마지막 항목으로 한 번만 표시하고 연수 링크를 유지한다', async () => {
  const source = fs.readFileSync(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
  const shared = source.slice(source.indexOf('async function sharedGrid(){'), source.indexOf('function localActivity('))
    .replace("const {mountSharedSurveyResults}=await import('./survey.js');", '');
  for (const alreadyIncluded of [false, true]) {
    const session = { id: 'training', name: '연수', pages: [{ id: 'lesson', title: '첫 주제' }], surveyPageId: 'survey' };
    if (alreadyIncluded) session.pages.push({ id: 'survey', title: '설문' });
    const originalPages = structuredClone(session.pages), app = {};
    const context = vm.createContext({
      app, sessionId: session.id, operatorMode: false, api: async () => session,
      escapeHtml: String, hrefPage: (page, training) => `?p=${page}&s=${training}`,
      publicFetch: async () => ({ ok: false }), mountSharedSurveyResults: async () => {},
      document: { querySelector: selector => ['#class-qr', '#class-qr-large', '#class-qr-dialog', '#expand-class-qr', '#close-class-qr'].includes(selector) ? {} : selector === '.shared-main' ? { append() {} } : null, createElement: () => ({}) },
    });
    await vm.runInContext(`${shared};sharedGrid()`, context);
    assert.equal((app.innerHTML.match(/class="agenda-item"/g) || []).length, 2);
    assert.equal((app.innerHTML.match(/href="\?p=survey&s=training"/g) || []).length, 1);
    assert.match(app.innerHTML, /agenda-number">02<\/span>.*<h3>설문<\/h3>/);
    assert.match(app.innerHTML, /agenda-open">설문 열기/);
    assert.doesNotMatch(app.innerHTML, /class="button"[^>]*>설문<\/a>/);
    assert.deepEqual(session.pages, originalPages);
  }
});

test('QR 확대는 현재 QR을 사용하고 단축 링크 저장 뒤에도 같은 이미지로 갱신한다', async () => {
  const source = fs.readFileSync(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
  const shared = source.slice(source.indexOf('async function sharedGrid(){'), source.indexOf('function localActivity('));
  const nodes = Object.fromEntries(['class-qr', 'class-qr-large', 'class-qr-dialog', 'expand-class-qr', 'close-class-qr', 'short-link-form', 'short-link-status', 'short-link'].map(id => [`#${id}`, {}]));
  const dialog = nodes['#class-qr-dialog'], revoked = [];let serial = 0;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  nodes['#expand-class-qr'].disabled = true;
  nodes['#short-link-form'].querySelector = () => ({});
  const context = vm.createContext({
    app: {}, sessionId: 'training', operatorMode: true, escapeHtml: String,
    api: async () => ({ id: 'training', name: '연수', pages: [] }),
    operatorFetch: async () => ({ ok: true, blob: async () => ({}) }),
    URL: { createObjectURL: () => `blob:qr-${++serial}`, revokeObjectURL: url => revoked.push(url) },
    document: { querySelector: selector => nodes[selector] },
  });
  await vm.runInContext(`${shared};sharedGrid()`, context);await new Promise(setImmediate);
  assert.equal(nodes['#expand-class-qr'].disabled, false);
  assert.equal(nodes['#class-qr-large'].src, nodes['#class-qr'].src);
  nodes['#expand-class-qr'].onclick();assert.equal(dialog.open, true);
  nodes['#close-class-qr'].onclick();assert.equal(dialog.open, false);
  await nodes['#short-link-form'].onsubmit({ preventDefault() {} });
  assert.equal(nodes['#class-qr-large'].src, 'blob:qr-2');
  assert.equal(nodes['#class-qr'].src, 'blob:qr-2');
  assert.deepEqual(revoked, ['blob:qr-1']);
});
