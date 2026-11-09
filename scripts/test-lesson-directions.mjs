import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { escapeHtml as esc } from '../js/utils.js';

const source = readFileSync(new URL('../mockups/lesson-cards.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('function renderCards('), source.indexOf('function renderDetail('));
const items = [{ id: '1', unit: '사회2::IV. 시장과 가격' }, { id: '2', unit: '사회2::VII. 인구' }, { id: '3', unit: '사회2::IV. 시장과 가격' }];
for (const layout of ['', 'atlas', 'poster', 'journal']) {
  const context = vm.createContext({ layout, esc, resourceUnit: r => r.unit, renderCard: r => `<button>${r.id}</button>`, splitTitle: t => t.match(/^([IVXLCDM]+\.)\s*(.+)$/)?.slice(1) || ['', t] });
  vm.runInContext(`${render}\nthis.renderCards = renderCards;`, context);
  const html = context.renderCards(items);
  assert.equal((html.match(/<button>/g) || []).length, 3);
  assert.equal((html.match(/class="chapter"/g) || []).length, ['atlas', 'journal'].includes(layout) ? 2 : 0);
  if (layout === 'atlas' || layout === 'journal') {
    assert.ok(html.indexOf('<button>3</button>') < html.indexOf('<button>2</button>'), 'same-unit lessons remain together');
    assert.equal((context.renderCards(items.slice(0, 1)).match(/class="chapter"/g) || []).length, 1);
  }
  assert.equal(context.renderCards([]), '');
}
for (const layout of ['atlas', 'poster', 'journal']) {
  const html = readFileSync(new URL(`../mockups/lesson-${layout}.html`, import.meta.url), 'utf8');
  assert.ok(html.includes(`data-layout="${layout}"`));
  assert.ok(html.includes('공적 쟁점으로 이해해야 한다.'));
  assert.ok(html.includes('발췌·번역'));
  assert.ok(html.includes('lesson-cards.js'));
}
console.log('Lesson directions: grouping, default grid, and shared intro passed.');
