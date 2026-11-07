import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIRST_HTML, htmlFileLab } from '../../rice-basket/html-lab.js';

function setup(t) {
  class Node {
    constructor(tag) { this.tag = tag; }
    className = '';children = [];attributes = {};
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() { this.focused = true; }
    scrollIntoView() {}
  }
  const previous = globalThis.document;globalThis.document = { createElement: tag => new Node(tag) };
  t.after(() => { globalThis.document = previous; });
  const root = htmlFileLab(), walk = node => [node, ...node.children.flatMap(walk)], nodes = walk(root);
  return { nodes, button: text => nodes.find(node => node.tag === 'button' && node.textContent === text), byClass: name => nodes.find(node => node.className.split(' ').includes(name)) };
}

test('폴더에서 파일을 만든 뒤 저장한 HTML을 브라우저로 연다', t => {
  const view = setup(t), source = view.byClass('html-source'), frame = view.byClass('html-preview');
  const open = view.button('브라우저로 열기'), save = view.button('파일에 저장'), refresh = view.button('새로고침');
  assert.equal(source.disabled, true);assert.equal(open.disabled, true);assert.equal(save.disabled, true);assert.equal(refresh.disabled, true);
  view.button('+ index.html 만들기').onclick();
  assert.equal(source.value, FIRST_HTML);assert.equal(source.disabled, false);assert.equal(open.disabled, false);
  assert.equal(view.byClass('html-file').hidden, false);assert.equal(frame.hidden, true);
  open.onclick();assert.equal(frame.hidden, false);assert.match(frame.srcdoc, /<h1>안녕하세요!<\/h1>/);
  const old = frame.srcdoc;
  source.value = FIRST_HTML.replace('안녕하세요!', '내가 고친 제목');source.oninput();
  assert.equal(save.disabled, false);assert.equal(frame.srcdoc, old, '편집만으로 브라우저 화면을 바꾸지 않는다');
  refresh.onclick();assert.equal(frame.srcdoc, old, '저장 전 새로고침은 기존 파일을 다시 읽는다');
  save.onclick();assert.equal(frame.srcdoc, old, '저장은 이미 열린 화면을 자동 변경하지 않는다');
  refresh.onclick();assert.match(frame.srcdoc, /<h1>내가 고친 제목<\/h1>/);assert.equal(save.disabled, true);
});

test('내려받기는 마지막 저장본을 사용하며 미리보기는 스크립트·외부 요청을 차단한다', t => {
  const view = setup(t), source = view.byClass('html-source'), frame = view.byClass('html-preview');
  const download = view.nodes.find(node => node.tag === 'a');
  assert.equal(download.hidden, true);view.button('+ index.html 만들기').onclick();
  const savedLink = download.href;
  source.value = '<h1>새 내용</h1><script>alert(1)</script>';source.oninput();
  assert.equal(download.href, savedLink);
  view.button('파일에 저장').onclick();
  assert.equal(decodeURIComponent(download.href.split(',')[1]), source.value);assert.equal(download.download, 'index.html');
  view.button('브라우저로 열기').onclick();
  assert.equal(frame.attributes.sandbox, '');assert.equal(frame.referrerPolicy, 'no-referrer');
  assert.match(frame.srcdoc, /default-src 'none'/);assert.match(frame.srcdoc, /form-action 'none'/);
});

test('파일 한 번 클릭은 열지 않고 더블클릭과 키보드 활성화로 브라우저를 연다', t => {
  const view = setup(t), browser = view.byClass('html-browser'), file = view.byClass('html-file');
  assert.equal(browser.hidden, true);
  view.button('+ index.html 만들기').onclick();
  assert.equal(file.focused, true);
  file.onclick({ detail: 1 });assert.equal(browser.hidden, true);
  file.onclick({ detail: 2 });assert.equal(browser.hidden, true);
  file.ondblclick();assert.equal(browser.hidden, false);
  assert.match(view.byClass('html-preview').srcdoc, /<h1>안녕하세요!<\/h1>/);
  browser.hidden = true;
  file.onclick({ detail: 0 });assert.equal(browser.hidden, false);
});
