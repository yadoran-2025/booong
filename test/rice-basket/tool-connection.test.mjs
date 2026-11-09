import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toolConnectionLab } from '../../rice-basket/tool-connection.js';

function setup(t, reducedMotion = false) {
  class Node {
    constructor(tag) { this.tag = tag; }
    children = []; attributes = {}; dataset = {}; isConnected = true; className = ''; value = ''; checked = false; style = {};
    append(...children) { for (const child of children) { if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(n => n !== child); child.parentNode = this; this.children.push(child); } }
    prepend(child) { this.append(child); this.children = [child, ...this.children.filter(n => n !== child)]; }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) { this.clicks = (this.clicks || 0) + 1; this.onclick?.(); } }
    attachShadow() { this.shadowRoot = new Node('shadow-root'); return this.shadowRoot; }
    showModal() { this.open = true; }
    close() { this.open = false; this.onclose?.(); }
  }
  const old = { document: globalThis.document, window: globalThis.window, IntersectionObserver: globalThis.IntersectionObserver };
  let onIntersect, disconnected = false, serial = 0;
  const timers = new Map();
  globalThis.document = { createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag) };
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  globalThis.IntersectionObserver = class { constructor(callback) { onIntersect = callback; } observe() {} disconnect() { disconnected = true; } };
  t.mock.method(globalThis, 'setTimeout', callback => { timers.set(++serial, callback); return serial; });
  t.mock.method(globalThis, 'clearTimeout', key => timers.delete(key));
  t.after(() => Object.assign(globalThis, old));
  const root = toolConnectionLab();
  const walk = n => [n, ...n.children.flatMap(walk), ...(n.shadowRoot ? walk(n.shadowRoot) : [])];
  const nodes = () => walk(root), byClass = name => nodes().find(n => n.className.split(' ').includes(name));
  return {
    root, timers, nodes, byClass,
    button: text => nodes().find(n => n.tag === 'button' && (n.textContent === text || n.attributes['aria-label'] === text)),
    visible() { onIntersect?.([{ isIntersecting: true, intersectionRatio: 1 }]); assert.equal(disconnected, !reducedMotion); },
    tick() { assert.equal(timers.size, 1, 'one playback timer'); const [key, fn] = timers.entries().next().value; timers.delete(key); fn(); },
    run() { const scenes = []; for (let i = 0; timers.size && i < 160; i++) { scenes.push(root.dataset.scene); this.tick(); } assert.equal(timers.size, 0); return scenes; },
  };
}

test('두 앱·세 도구 모두 근거와 결과를 연결하고 API 자료 탭과 브라우저를 구분한다', t => {
  const v = setup(t, true);
  assert.equal(v.byClass('tool-app').shadowRoot.children[0].href, '/studies/tool-connection-app.css');
  for (const agent of ['Claude Code', 'Codex']) {
    v.button(agent).click();
    for (const service of ['Google Drive', 'Gmail', 'Browser Use']) {
      v.button(service).click();
      assert.equal(v.byClass('tool-app').attributes['aria-label'], `${agent} 데스크톱 화면 예시`);
      assert.equal(v.byClass('tool-panel').hidden, true);
      v.button('3. 검색·실행').click(); assert.equal(v.byClass('tool-panel').hidden, false);
      assert.equal(v.byClass('tool-browser').hidden, service !== 'Browser Use');
      assert.equal(v.byClass('tool-source-view').hidden, service === 'Browser Use');
      v.button('4. 근거 확인').click();
      assert.equal(v.byClass('tool-evidence').children.length, service === 'Browser Use' ? 1 : 2);
      assert.equal(v.byClass('tool-app').dataset.highlight, 'true');
      v.button('5. 결과 활용').click(); assert.equal(v.byClass('tool-answer').hidden, false);
      assert.equal(v.byClass('tool-output').hidden, service === 'Browser Use');
      if (service === 'Google Drive') assert.equal(v.byClass('tool-activity').hidden, false);
      if (service === 'Gmail') assert.equal(v.byClass('tool-checklist').hidden, false);
      assert.equal(v.button('다시 재생').type, 'button');
    }
  }
  assert.equal(v.timers.size, 0);
});

test('Drive는 입력·전송 후 두 파일을 읽고 서로 다른 근거를 확인한 다음 미리보기를 연다', t => {
  const v = setup(t); v.visible(); v.tick();
  assert.equal(v.root.dataset.scene, 'typing');
  assert.ok(v.byClass('tool-composer-placeholder').textContent.length < 10);
  v.button('일시정지').click(); assert.equal(v.timers.size, 0);
  v.button('흐름 재생').click();
  const quotes = [], scenes = [];
  for (let i = 0; v.timers.size && i < 150; i++) {
    scenes.push(v.root.dataset.scene);
    if (v.root.dataset.scene === 'quote-source') quotes.push(v.byClass('tool-source-quote').textContent);
    v.tick();
  }
  assert.deepEqual(quotes, ['주장 → 근거 → 예상 반론 순서로 작성합니다.', '근거의 적절성과 반론에 대한 응답을 확인합니다.']);
  assert.ok(scenes.indexOf('api-results') < scenes.indexOf('read-source'));
  assert.ok(scenes.indexOf('evidence') < scenes.indexOf('building'));
  assert.ok(scenes.indexOf('building') < scenes.indexOf('ready'));
  assert.equal(v.byClass('tool-send').clicks, 1);
  assert.equal(v.byClass('tool-open-preview').clicks, 1);
  assert.equal(v.root.dataset.scene, 'complete'); assert.equal(v.timers.size, 0);
  assert.equal(v.byClass('tool-activity').hidden, false);
  v.button('다시 재생').click(); assert.equal(v.root.dataset.scene, 'compose');
  v.root.isConnected = false; v.tick(); assert.equal(v.timers.size, 0);
});

test('Browser Use는 입력한 다음 검색 클릭·로딩·결과 클릭·본문 읽기 순으로 실행한다', t => {
  const v = setup(t); v.button('Browser Use').click();
  const scenes = v.run();
  const order = ['browser-focus', 'browser-type', 'browser-search', 'browser-loading', 'browser-results', 'browser-article', 'evidence'];
  for (let i = 1; i < order.length; i++) assert.ok(scenes.indexOf(order[i - 1]) < scenes.indexOf(order[i]), order[i]);
  assert.equal(v.byClass('tool-browser-submit').clicks, 1);
  assert.equal(v.byClass('tool-browser-result').clicks, 1);
  assert.equal(v.byClass('tool-browser-article').hidden, false);
  assert.equal(v.byClass('tool-app').dataset.cursor, 'false');
});

test('학생 활동은 입력과 자기 점검을 검증하고 자료를 다시 열어도 작성 내용이 남는다', t => {
  const v = setup(t, true); v.button('5. 결과 활용').click();
  const form = v.byClass('tool-activity'), submit = () => form.onsubmit({ preventDefault() {} });
  submit(); assert.match(v.byClass('tool-activity-status').textContent, /세 칸/);
  const textareas = v.nodes().filter(n => n.tag === 'textarea');
  textareas.forEach((n, i) => { n.value = ['허용하자', '학습 자료를 찾을 수 있다', '수업 중에는 교사가 정한 시간만 쓰자'][i]; });
  submit(); assert.match(v.byClass('tool-activity-status').textContent, /자기 점검/);
  form.children.filter(n => n.className === 'tool-check').forEach(n => { n.children[0].checked = true; });
  submit(); assert.match(v.byClass('tool-activity-status').textContent, /마쳤어요/);
  v.button('[1] 운영안의 작성 순서').click(); assert.equal(v.byClass('tool-output').hidden, true);
  assert.match(v.byClass('tool-document').children[0].textContent, /운영안/);
  v.byClass('tool-panel-bar').children[1].click(); assert.equal(v.byClass('tool-output').hidden, false);
  assert.equal(textareas[0].value, '허용하자');
});

test('동작 줄이기·키보드·직접 선택·확대 후 복귀는 자동 재생과 독립적으로 유지된다', t => {
  const v = setup(t, true); v.visible(); assert.equal(v.timers.size, 0);
  v.button('Claude Code').focus(); let prevented = false;
  v.byClass('tool-toolbar').children[0].onkeydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.ok(prevented); assert.equal(v.button('Codex').attributes['aria-pressed'], 'true');
  v.button('1. 요청 이해').focus(); v.byClass('tool-timeline').onkeydown({ key: 'End', preventDefault() {} });
  assert.equal(v.root.dataset.step, '4'); assert.equal(v.timers.size, 0);
  v.button('크게 보기').click(); assert.equal(v.byClass('tool-enlarged').open, true);
  v.button('닫기').click(); assert.equal(v.byClass('tool-enlarged').open, false);
  assert.equal(v.root.children[0].className, 'tool-visual'); assert.equal(v.root.dataset.step, '4');
});

test('화면 진입 뒤의 자동 재생은 사용자가 이미 고른 단계를 덮어쓰지 않는다', t => {
  const v = setup(t); v.button('Gmail').click(); v.button('5. 결과 활용').click(); v.visible();
  assert.equal(v.root.dataset.task, '1'); assert.equal(v.root.dataset.step, '4'); assert.equal(v.timers.size, 0);
});
