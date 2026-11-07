import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classroomInteraction } from '../../rice-basket/learning.js';

function environment(t, reducedMotion = false) {
  const originalDocument = globalThis.document, originalWindow = globalThis.window;
  let animations = 0;
  class Node {
    constructor(tag) { this.tag = tag; }
    children = [];
    style = {};
    dataset = {};
    attributes = {};
    className = '';
    classList = { add: name => { this.className += ` ${name}`; } };
    setAttribute(name, value) { this.attributes[name] = value;if (name === 'class') this.className = value; }
    append(...nodes) { this.children.push(...nodes); }
    animate() { animations++; }
  }
  globalThis.document = { createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag) };
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  t.after(() => { globalThis.document = originalDocument; globalThis.window = originalWindow; });
  return { animations: () => animations };
}

function all(node) { return [node, ...node.children.flatMap(all)]; }
function byClass(node, name) { return all(node).filter(item => item.className.split(' ').includes(name)); }

test('학생의 답을 누르면 집계·막대 비율·화면읽기 결과가 함께 바뀐다', t => {
  const motion = environment(t);
  const panel = classroomInteraction('aggregate');
  const [answer] = byClass(panel, 'lp-classroom-choice');
  answer.onclick(); answer.onclick();
  assert.match(byClass(panel, 'lp-classroom-result')[0].textContent, /예시 20명 · A 예상 8명/);
  assert.equal(byClass(panel, 'lp-classroom-fill')[0].style.width, '40%');
  assert.equal(byClass(panel, 'lp-classroom-result')[0].attributes['aria-live'], 'polite');
  assert.equal(motion.animations(), 2);
});

test('이해도 선택을 바꾸면 활성 경로와 다음 과제가 함께 바뀐다', t => {
  environment(t);
  const panel = classroomInteraction('branch');
  const choices = byClass(panel, 'lp-classroom-choice');
  const routes = byClass(panel, 'lp-classroom-route');
  choices[0].onclick();
  assert.deepEqual(routes.map(node => node.dataset.active), ['true', 'false']);
  assert.match(byClass(panel, 'lp-classroom-task')[0].textContent, /벽과 기둥/);
  choices[1].onclick();
  assert.deepEqual(routes.map(node => node.dataset.active), ['false', 'true']);
  assert.deepEqual(choices.map(node => node.attributes['aria-pressed']), ['false', 'true']);
  assert.match(byClass(panel, 'lp-classroom-task')[0].textContent, /내부 벽만 옮기면/);
});

for (const reducedMotion of [false, true]) test(`수요·공급 네 방향 이동과 균형점·초기화를 연결한다 (모션 줄이기 ${reducedMotion})`, t => {
  const motion = environment(t, reducedMotion);
  const panel = classroomInteraction('graph');
  const choices = byClass(panel, 'lp-classroom-choice');
  const image = byClass(panel, 'lp-market-graph')[0];
  const demand = byClass(panel, 'lp-market-d').find(node => node.tag === 'g');
  const supply = byClass(panel, 'lp-market-s').find(node => node.tag === 'g');
  const point = byClass(panel, 'lp-market-equilibrium')[0];
  const original = byClass(panel, 'lp-market-old-point')[0];
  const result = byClass(panel, 'lp-classroom-result')[0];
  const paths = [demand.children[0].attributes.d, supply.children[0].attributes.d];
  const cases = [
    ['D-L', 42, 42, -44.8, 0], ['D-R', 58, 58, 44.8, 0],
    ['S-L', 58, 42, 0, -44.8], ['S-R', 42, 58, 0, 44.8],
  ];
  for (const [move, price, quantity, dx, sx] of cases) {
    const choice = choices.find(node => node.dataset.move === move);choice.onclick();
    assert.equal(demand.style.transform, `translateX(${dx}px)`);
    assert.equal(supply.style.transform, `translateX(${sx}px)`);
    assert.equal(point.style.transform, `translate(${(quantity - 50) * 2.8}px, ${(50 - price) * 2.2}px)`);
    assert.match(image.attributes['aria-label'], new RegExp(`균형가격 ${price}, 균형거래량 ${quantity}`));
    assert.match(result.textContent, new RegExp(`균형가격 50 → ${price} · 균형거래량 50 → ${quantity}`));
    assert.equal(original.attributes.visibility, 'visible');
    assert.equal(choice.attributes['aria-pressed'], 'true');
    assert.equal(choices.filter(node => node.attributes['aria-pressed'] === 'true').length, 1);
    assert.deepEqual([demand.children[0].attributes.d, supply.children[0].attributes.d], paths, '곡선의 기울기를 유지한다');
  }
  choices.find(node => node.dataset.move === 'S-R').onclick();
  assert.match(image.attributes['aria-label'], /균형가격 42, 균형거래량 58/);
  byClass(panel, 'lp-market-reset')[0].onclick();
  assert.equal(demand.style.transform, 'translateX(0px)');
  assert.equal(supply.style.transform, 'translateX(0px)');
  assert.equal(original.attributes.visibility, 'hidden');
  assert.equal(choices.some(node => node.attributes['aria-pressed'] === 'true'), false);
  assert.match(image.attributes['aria-label'], /균형가격 50, 균형거래량 50/);
  assert.equal(motion.animations(), reducedMotion ? 0 : 6);
});
