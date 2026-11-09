import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { escapeHtml as esc } from '../js/utils.js';

const source = readFileSync(new URL('../mockups/lesson-cards.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('function renderCard('), source.indexOf('function renderCards('));
const item = { id: 'one', title: '<img src=x onerror=alert(1)>', kind: 'lesson', isNew: false, subjects: [] };
for (const layout of ['', 'packs', 'showcase', 'tickets']) {
  const context = vm.createContext({ layout, enhanced: true, state: { query: '', view: 'all' }, saved: [], comments: new Map([['one', [{ text: '댓글' }]]]), esc, resourceSubject: () => '사회2[15개정]', subjectName: () => '사회2', resourceUnit: () => '사회2[15개정]::IV. 시장 경제와 가격', cover: () => '../assets/lesson-thumbnails/economics-default-v1.jpg', saveIcon: () => '<svg></svg>', splitTitle: t => t.match(/^([IVXLCDM]+\.)\s*(.+)$/)?.slice(1) || ['', t] });
  vm.runInContext(`${render}\nthis.render = renderCard;`, context);
  const html = context.render(item);
  assert.equal((html.match(/<button /g) || []).length, layout === 'packs' ? 3 : 2, 'detail, comments, and save stay separate buttons');
  assert.ok(html.includes('data-save="one"'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.equal(html.includes('class="card-mark"'), layout !== '');
  assert.equal(html.includes('class="pack-heading"'), layout === 'packs');
  if (layout === 'packs') {
    assert.ok(html.indexOf('class="card-title"') < html.indexOf('class="pack-heading"'), 'subject and unit follow the game title');
    assert.ok(!html.includes('class="card-foot"'), 'kind and new labels are absent');
    assert.ok(html.indexOf('</button>') < html.indexOf('data-comments='), 'comment action is outside the detail button');
    assert.ok(html.includes('조회수 미연동'));
    assert.ok(html.includes('저장수 미연동'));
    assert.ok(html.includes('data-comment-count="one">1</span>'));
    assert.ok(html.includes('class="card-subject">사회2 · 2015</span>'));
    assert.equal((html.match(/class="card-unit"/g) || []).length, 1);
    assert.ok(html.includes('aria-label="사회2 · 2015 · IV. 시장 경제와 가격'));
    context.resourceUnit = () => '';
    assert.ok(context.render(item).includes('class="card-subject">공통</span>'), 'untagged lessons do not inherit the selected subject');
  }
  if (layout) {
    assert.ok(html.includes('aria-hidden="true">IV</span>'));
    const page = readFileSync(new URL(`../mockups/lesson-${layout}.html`, import.meta.url), 'utf8');
    assert.ok(page.includes(`data-layout="${layout}"`));
    assert.ok(page.includes('data-library-features'));
    assert.ok(page.includes('lesson-cards.js'));
  }
}
const listeners = {};
const windowListeners = {};
const style = new Map();
const tile = { style: { setProperty: (key, value) => style.set(key, value), removeProperty: key => style.delete(key) }, getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 200 }), contains: node => node === tile };
const media = { matches: true, addEventListener: (_, callback) => { media.changed = callback; } };
let pending;
vm.runInNewContext(readFileSync(new URL('../mockups/lesson-packs.js', import.meta.url), 'utf8'), {
  document: { querySelector: () => ({ addEventListener: (type, callback) => { listeners[type] = callback; } }) },
  window: { addEventListener: (type, callback) => { windowListeners[type] = callback; } },
  matchMedia: () => media,
  requestAnimationFrame: callback => { pending = callback; return 1; },
  cancelAnimationFrame: () => { pending = null; }
});
const move = (clientX, clientY, pointerType = 'mouse') => listeners.pointermove({ target: { closest: () => tile }, clientX, clientY, pointerType });
move(110, 20);
move(210, -20);
pending();
assert.equal(style.get('--pack-ry'), '5deg', 'tilt stays clamped at the edge');
assert.equal(style.get('--pack-rx'), '4deg');
assert.equal(style.get('--pack-light-x'), '100%');
listeners.pointerout({ relatedTarget: tile });
assert.equal(style.size, 5, 'moving within a card preserves the effect');
listeners.pointerout({ relatedTarget: null });
assert.equal(style.size, 0, 'leaving clears all motion variables');
move(80, 100, 'touch');
assert.equal(pending, null, 'touch does not track tilt');
move(80, 100);
media.matches = false;
media.changed();
assert.equal(pending, null, 'reduced motion cancels pending work');
move(80, 100);
assert.equal(pending, null);
media.matches = true;
move(80, 100);
pending();
windowListeners.scroll();
assert.equal(style.size, 0, 'scrolling resets the old geometry');
console.log('Bold lesson cards: real unit marks, escaped content, separate save controls, and shared features passed.');
