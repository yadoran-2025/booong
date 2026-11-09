import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webProjectLab } from '../../rice-basket/html-lab.js';
import { FIRST_HTML, FIRST_JS } from '../../rice-basket/project-lab.js';

function setup(t) {
  class Node {
    constructor(tag) { this.tag = tag; }
    className = '';children = [];attributes = {};
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() { this.focused = true; }
    scrollIntoView() {}
  }
  const previous = globalThis.document;globalThis.document = { createElement: tag => new Node(tag) };
  t.after(() => { globalThis.document = previous; });
  const root = webProjectLab(), walk = node => [node, ...node.children.flatMap(walk)], nodes = () => walk(root);
  const byClass = name => nodes().find(node => node.className.split(' ').includes(name));
  return { nodes, button: text => nodes().find(node => node.tag === 'button' && node.textContent === text), byClass, next: () => byClass('project-navigation').children[1].onclick() };
}

test('같은 HTML 파일을 텍스트 편집기로 연 뒤 브라우저로 열며 다음 단계로 자동 이동하지 않는다', t => {
  const view = setup(t);
  assert.equal(view.byClass('project-files').children.length, 1);assert.equal(view.byClass('html-preview'), undefined);
  assert.equal(view.byClass('project-source').children[0].textContent, FIRST_HTML);
  const launch = view.button('같은 index.html을 브라우저로 열기');
  assert.equal(view.byClass('project-source').hidden, true);assert.equal(launch.disabled, true);
  launch.onclick();assert.equal(view.byClass('html-preview'), undefined);
  view.button('텍스트 편집기로 열기').onclick();
  assert.equal(view.byClass('project-source').hidden, false);assert.equal(launch.disabled, false);assert.equal(view.byClass('project-tag-map').hidden, true);
  launch.onclick();assert.equal(view.byClass('project-tag-map').hidden, false);
  assert.equal(view.byClass('project-address').textContent, 'file:///나의 수업 프로젝트 폴더/index.html');
  const frame = view.byClass('html-preview');assert.match(frame.srcdoc, /나의 첫 웹페이지/);assert.doesNotMatch(frame.srcdoc, /<script/);
  assert.equal(frame.attributes.sandbox, 'allow-scripts');assert.equal(frame.referrerPolicy, 'no-referrer');assert.match(frame.srcdoc, /default-src 'none'/);
  assert.equal(view.button('1 HTML 한 파일').attributes['aria-selected'], 'true');assert.equal(view.button('2 CSS·JS가 있는 폴더').disabled, true);
  assert.equal(view.nodes().filter(node => ['a', 'input', 'textarea'].includes(node.tag)).length, 0);
});

test('HTML만 따로 열면 모양과 동작이 빠지고 폴더 안에서 열면 CSS·JS가 돌아온다', t => {
  const view = setup(t);view.next();assert.equal(view.byClass('project-files').children.length, 3);
  assert.match(view.byClass('project-file-origin').className, /is-folder/);assert.equal(view.byClass('project-path').textContent, '나의 수업 프로젝트 폴더');
  view.button('텍스트 편집기로 열기').onclick();assert.equal(view.byClass('project-source').hidden, false);
  assert.match(view.byClass('project-source').children[0].textContent, /href="style.css"/);
  view.button('HTML만 따로 열기').onclick();
  const isolated = view.byClass('html-preview');assert.doesNotMatch(isolated.srcdoc, /<style>|data:text\/javascript/);
  assert.equal(view.byClass('project-address').textContent, 'file:///바탕화면/index.html');assert.equal(view.byClass('project-loose-file').hidden, false);
  assert.equal(view.button('폴더 안에서 열기').hidden, false);assert.match(view.byClass('project-browser-status').textContent, /style.css와 script.js가 없어/);
  assert.equal(view.button('HTML만 따로 열기').attributes['aria-pressed'], 'true');assert.equal(view.button('폴더 안에서 열기').attributes['aria-pressed'], 'false');
  view.button('폴더 안에서 열기').onclick();const frame = view.byClass('html-preview');assert.match(frame.srcdoc, /<style>/);assert.match(frame.srcdoc, /data:text\/javascript/);
  assert.equal(view.byClass('project-address').textContent, 'file:///나의 수업 프로젝트 폴더/index.html');assert.equal(view.byClass('project-loose-file').hidden, true);
  assert.equal(view.button('HTML만 따로 열기').attributes['aria-pressed'], 'false');assert.equal(view.button('폴더 안에서 열기').attributes['aria-pressed'], 'true');
  view.button('script.js').onclick();assert.equal(view.byClass('project-source').children[0].textContent, FIRST_JS);assert.equal(view.byClass('html-preview'), frame);
});

test('로컬 서버 열기 뒤 별도 단계에서 파일·서버 차이와 데이터 읽기 예시를 비교한다', t => {
  const view = setup(t);view.next();view.next();assert.equal(view.byClass('html-preview'), undefined);
  view.button('로컬 서버로 열어줘').onclick();assert.equal(view.byClass('project-address').textContent, 'http://localhost:5500/');
  assert.match(view.byClass('html-preview').srcdoc, /data:text\/javascript/);assert.equal(view.button('4 차이 비교').disabled, true);
  view.next();assert.equal(view.byClass('project-workspace').hidden, true);assert.equal(view.byClass('project-comparison').hidden, false);
  const values = view.nodes().filter(node => node.tag === 'td').map(node => node.textContent);
  assert.ok(values.includes('file:///나의 수업 프로젝트 폴더/index.html'));assert.ok(values.includes('http://localhost:5500/'));assert.ok(values.includes('HTML·CSS·일반 JS는 그대로 작동'));
  view.button('같은 데이터 파일 읽어 보기').onclick();
  assert.ok(view.nodes().some(node => node.textContent?.startsWith('읽기 제한 예시:')));assert.ok(view.nodes().some(node => node.textContent?.startsWith('읽기 성공:')));
  view.button('이전').onclick();assert.equal(view.byClass('project-comparison').hidden, true);assert.equal(view.button('로컬 서버로 열어줘').hidden, false);
});

test('다음으로 새 단계를 공개하고 이미 본 단계만 탭과 키보드로 되돌아간다', t => {
  const view = setup(t), first = view.button('1 HTML 한 파일'), second = view.button('2 CSS·JS가 있는 폴더');
  assert.equal(view.button('이전').disabled, true);view.button('4 차이 비교').onclick();assert.equal(first.attributes['aria-selected'], 'true');
  first.onkeydown({ key: 'End', preventDefault() {} });assert.equal(first.attributes['aria-selected'], 'true');
  view.next();assert.equal(second.disabled, false);assert.equal(view.button('3 로컬 서버로 열기').disabled, true);
  second.onkeydown({ key: 'Home', preventDefault() {} });assert.equal(first.attributes['aria-selected'], 'true');
  first.onkeydown({ key: 'End', preventDefault() {} });assert.equal(second.attributes['aria-selected'], 'true');
  view.next();view.next();assert.equal(view.byClass('project-navigation').children[1].hidden, false);
  assert.equal(view.button('5 배포해 보기').disabled, true);view.next();assert.equal(view.byClass('project-navigation').children[1].hidden, true);
  assert.equal(view.nodes().filter(node => node.attributes.role === 'tab').length, 5);assert.equal(view.nodes().filter(node => node.attributes['aria-selected'] === 'true').length, 1);
});

test('배포하면 공개 주소로 다른 사람이 보고 로컬 서버를 꺼도 공개 페이지는 유지된다', t => {
  const view = setup(t);for (let i = 0;i < 4;i++) view.next();
  assert.equal(view.byClass('deployment-scene').hidden, false);assert.equal(view.byClass('project-comparison').hidden, true);
  const deviceViews = view.nodes().filter(node => node.className === 'deployment-device-view');
  assert.equal(deviceViews[0].children[0].tag, 'iframe');assert.equal(deviceViews[1].children[0].tag, 'p');
  assert.equal(view.button('공개 주소로 열어 보기').disabled, true);assert.equal(view.button('로컬 서버 끄고 새로고침').disabled, true);
  view.button('배포해줘').onclick();assert.equal(view.byClass('deployment-public-address').textContent, 'https://my-class.example');
  assert.equal(view.byClass('deployment-host-files').children.length, 3);assert.equal(view.button('공개 주소로 열어 보기').disabled, false);
  view.button('공개 주소로 열어 보기').onclick();const publicFrame = deviceViews[1].children[0];assert.equal(publicFrame.tag, 'iframe');assert.equal(publicFrame.attributes.sandbox, 'allow-scripts');
  assert.match(publicFrame.srcdoc, /data:text\/javascript/);
  view.button('로컬 서버 끄고 새로고침').onclick();assert.equal(deviceViews[0].children[0].tag, 'p');assert.equal(deviceViews[1].children[0].tag, 'iframe');assert.notEqual(deviceViews[1].children[0], publicFrame);
  assert.match(view.byClass('deployment-status').textContent, /공개 주소는 호스팅 서버에서 계속 열립니다/);
  view.button('이전').onclick();view.next();assert.equal(view.button('배포해줘').disabled, false);assert.equal(view.button('공개 주소로 열어 보기').disabled, true);
});
