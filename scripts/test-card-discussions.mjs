import assert from "node:assert/strict";
import { bindCardDiscussions, readCardComments, renderCardDiscussion, renderList } from "../js/ui/card-discussions.js";
import { shouldShowCommentNotice } from "../js/ui/home-comment-notice.js";

globalThis.fetch = async url => {
  assert.equal(url, "/api/comments?resourceId=lesson-1");
  return { ok: true, json: async () => ({ count: 3, comments: [{ id: "c1", name: "교사", text: "좋은 수업", createdAt: "2026-09-28T00:00:00Z" }] }) };
};

assert.equal((await readCardComments("lesson-1")).count, 3);
assert.equal((await readCardComments("lesson-1")).comments[0].text, "좋은 수업");
assert.match(renderCardDiscussion("lesson-1"), /<button[^>]+data-comment-open/);
assert.match(renderCardDiscussion("lesson-1"), /<dialog[^>]+data-card-discussion/);
assert.doesNotMatch(renderCardDiscussion("lesson-1"), /<select/);
assert.match(renderCardDiscussion('lesson" onmouseover="alert(1)'), /&quot; onmouseover=&quot;/);
assert.doesNotMatch(renderCardDiscussion("lesson-1"), /name="kind"|피드백/);
const noticeStorage = { value: null, getItem() { return this.value; } };
assert.equal(shouldShowCommentNotice(noticeStorage, "Mon Sep 28 2026"), true);
noticeStorage.value = "Mon Sep 28 2026";
assert.equal(shouldShowCommentNotice(noticeStorage, "Mon Sep 28 2026"), false);
assert.equal(shouldShowCommentNotice(noticeStorage, "Tue Sep 29 2026"), true);
noticeStorage.value = "never";
assert.equal(shouldShowCommentNotice(noticeStorage, "Tue Sep 29 2026"), false);
const list = { innerHTML: "", querySelectorAll: () => [] };
renderList(list, [
  { id: "reply", parentId: "root", name: "다른 회원", text: "답글", createdAt: "2026-09-28T01:00:00Z", mine: false },
  { id: "root", parentId: null, name: "삭제된 댓글", deleted: true, text: "", createdAt: "2026-09-28T00:00:00Z" },
], true);
assert.ok(list.innerHTML.indexOf('data-comment-id="root"') < list.innerHTML.indexOf('data-comment-id="reply"'));
assert.match(list.innerHTML, /삭제된 댓글입니다/);
assert.match(list.innerHTML, /bundle-discussion__item--reply/);
assert.doesNotMatch(list.innerHTML, /data-comment-action="reply"/);
assert.doesNotMatch(list.innerHTML, /data-comment-action="edit"/);
renderList(list, [{ id: "own", name: "나", kind: "feedback", text: "<script>alert(1)</script>", createdAt: "2026-09-28T00:00:00Z", mine: true }], true);
assert.match(list.innerHTML, /data-comment-action="edit"/);
assert.match(list.innerHTML, /data-comment-action="delete"/);
assert.doesNotMatch(list.innerHTML, /피드백/);
assert.doesNotMatch(list.innerHTML, /<script>/);

function countView(ids) {
  const node = () => ({ textContent: "", listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; }, setAttribute() {}, replaceChildren() {} });
  const sections = ids.map(id => {
    const count = node(), modalCount = node(), trigger = node(), form = node();
    form.querySelector = () => node();
    trigger.querySelector = () => count;
    const nodes = Object.fromEntries(["status", "list", "submit", "cancel", "close"].map(key => [`[data-comment-${key}]`, { ...node(), querySelectorAll: () => [] }]));
    Object.assign(nodes, { "[data-comment-form]": form, "[data-form-label]": node(), "[data-discussion-count]": modalCount });
    return { dataset: { cardDiscussion: id }, isConnected: true, previousElementSibling: trigger, getAttribute: () => id, querySelector: selector => nodes[selector], showModal() { this.open = true; }, count };
  });
  return { isConnected: true, sections, querySelectorAll: () => sections };
}
const observers = [];
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback;observers.push(this); }
  observe() {}
  unobserve() {}
  disconnect() { this.disconnected = true; }
  show(view) { this.callback(view.sections.map(section => ({ target: section.previousElementSibling, isIntersecting: true }))); }
};
globalThis.document = { createElement: () => ({}) };
globalThis.location = { pathname: '/index.html', search: '', hash: '' };
const calls = [];let unavailable = false;
globalThis.fetch = async url => {
  calls.push(url);
  return { ok: !unavailable, json: async () => url.includes('countOnly') ? { count: 3 } : { count: 5, comments: [], viewer: null } };
};
const tick = () => new Promise(setImmediate);
const visible = countView(['visible', 'visible']);bindCardDiscussions(visible);
assert.equal(calls.length, 0, '화면 밖 카드의 댓글 수는 조회하지 않는다');
observers.at(-1).show(visible);await tick();
assert.equal(calls.length, 1, '같은 수업의 동시 요청을 합친다');
assert.deepEqual(visible.sections.map(s => s.count.textContent), ['3', '3']);
const firstObserver = observers.at(-1);bindCardDiscussions(visible);observers.at(-1).show(visible);await tick();
assert.equal(firstObserver.disconnected, true, '다시 그릴 때 이전 관찰을 해제한다');
assert.equal(calls.length, 1, '과목·정렬 변경은 최근 댓글 수를 재사용한다');
visible.sections[0].previousElementSibling.listeners.click();await tick();
assert.equal(calls.at(-1), '/api/comments?resourceId=visible&viewer=1', '댓글을 열면 항상 최신 응답과 권한을 확인한다');
const refreshed = countView(['visible']);bindCardDiscussions(refreshed);observers.at(-1).show(refreshed);await tick();
assert.equal(refreshed.sections[0].count.textContent, '5', '새 댓글 수로 캐시를 갱신한다');
const failed = countView(['retry']);unavailable = true;bindCardDiscussions(failed);observers.at(-1).show(failed);await tick();
assert.equal(failed.sections[0].count.textContent, '–');
unavailable = false;bindCardDiscussions(failed);observers.at(-1).show(failed);await tick();
assert.equal(failed.sections[0].count.textContent, '3', '조회 실패를 캐시하지 않고 재시도한다');
const expired = countView(['visible']), now = Date.now;
Date.now = () => now() + 20000;
bindCardDiscussions(expired);observers.at(-1).show(expired);await tick();
assert.equal(expired.sections[0].count.textContent, '5');
Date.now = () => now() + 31000;
bindCardDiscussions(expired);observers.at(-1).show(expired);await tick();Date.now = now;
assert.equal(expired.sections[0].count.textContent, '3', '반복 정렬로 캐시 만료를 연장하지 않고 30초가 지나면 다시 조회한다');
const detached = countView(['detached']);bindCardDiscussions(detached);detached.isConnected = false;
const beforeDetached = calls.length;observers.at(-1).show(detached);await tick();
assert.equal(calls.length, beforeDetached);assert.equal(observers.at(-1).disconnected, true);
delete globalThis.IntersectionObserver;
const fallback = countView(['fallback']);bindCardDiscussions(fallback);await tick();
assert.equal(fallback.sections[0].count.textContent, '3', '관찰 API가 없는 브라우저도 댓글 수를 표시한다');
console.log("Card discussion API and markup checks passed.");
