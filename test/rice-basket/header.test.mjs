import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

test('학습 페이지 상단은 연수 제목을 안전하게 표시하고 독립 페이지는 기본 이름을 쓴다', () => {
  const source = fs.readFileSync(new URL('../../rice-basket/app.js', import.meta.url), 'utf8');
  const escape = source.split('\n').find(line => line.startsWith('const escapeHtml ='));
  const header = source.split('\n').find(line => line.startsWith('function publicHeader('));
  const context = vm.createContext({});
  vm.runInContext(`${escape}\n${header}`, context);
  const html = context.publicHeader('/rice-basket/?s=training&manage=1', '강연 목차', '바이브코딩 <연수>');
  assert.match(html, />바이브코딩 &lt;연수&gt;<\/a>/);
  assert.match(html, /href="\/rice-basket\/\?s=training&amp;manage=1"/);
  assert.doesNotMatch(html, /BOOONG의 쌀바구니/);
  assert.match(context.publicHeader('/rice-basket/?admin=1', '전체 페이지'), /BOOONG의 쌀바구니/);
  assert.match(source, /publicHeader\([^\n]+sessionId\?currentSession\.name:undefined\)/);
});
