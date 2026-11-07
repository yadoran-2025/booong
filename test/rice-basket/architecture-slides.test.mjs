import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountArchitectureSlides } from '../../rice-basket/learning.js';

function deck(t, hash = '') {
  const originalDocument = globalThis.document, originalLocation = globalThis.location;
  class Node {
    children = [];
    attributes = {};
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...nodes) { this.children.push(...nodes); }
    focus() { globalThis.document.activeElement = this; }
    querySelectorAll() { return this.children; }
  }
  globalThis.document = { createElement: () => new Node(), activeElement: null };
  globalThis.location = { hash };
  t.after(() => { globalThis.document = originalDocument; globalThis.location = originalLocation; });
  const story = new Node(), nav = new Node();
  const tabs = Array.from({ length: 4 }, () => new Node());
  const slides = ['watch', 'shift', 'points', 'classroom'].map(name => Object.assign(new Node(), { id: `architecture-${name}` }));
  nav.append(...tabs);
  story.querySelector = () => nav;
  story.querySelectorAll = () => slides;
  let stopped = 0;
  mountArchitectureSlides(story, () => stopped++);
  const selected = () => slides.flatMap((slide, index) => slide.hidden ? [] : [index]);
  return { story, tabs, slides, nav, selected, stopped: () => stopped };
}

test('한 장씩 넘기며 실험 노드를 유지하고 영상을 떠날 때 재생을 멈춘다', t => {
  const view = deck(t);
  assert.deepEqual(view.selected(), [0]);
  assert.equal(view.story.children.length, 0, '개별 화면에 별도 푸터를 추가하지 않는다');
  view.tabs[1].onclick();
  assert.deepEqual(view.selected(), [1]);
  assert.equal(view.stopped(), 1);
  view.slides[1].experimentValue = '기둥 구조';
  view.tabs[3].onclick();
  assert.deepEqual(view.selected(), [3]);
  view.tabs[1].onclick();
  assert.equal(view.slides[1].experimentValue, '기둥 구조');
  assert.equal(view.tabs[1].attributes['aria-selected'], 'true');
  assert.equal(view.slides[1].attributes['aria-labelledby'], view.tabs[1].id);
  assert.equal(view.tabs[1].attributes['aria-controls'], view.slides[1].id);
});

test('기존 섹션 링크를 열고 방향키·Home·End로 탭과 포커스를 이동한다', t => {
  const view = deck(t, '#architecture-points');
  assert.deepEqual(view.selected(), [2]);
  for (const [key, expected] of [['End', 3], ['ArrowRight', 0], ['ArrowLeft', 3], ['Home', 0]]) {
    let prevented = false;
    view.nav.onkeydown({ key, preventDefault() { prevented = true; } });
    assert.deepEqual(view.selected(), [expected]);
    assert.equal(globalThis.document.activeElement, view.tabs[expected]);
    assert.equal(view.tabs[expected].tabIndex, 0);
    assert.equal(prevented, true);
  }
  view.nav.onkeydown({ key: 'ArrowRight', ctrlKey: true });
  assert.deepEqual(view.selected(), [0]);
});
