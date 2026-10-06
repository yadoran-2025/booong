import assert from "node:assert/strict";
import { readCardComments, renderCardDiscussion, renderList } from "../js/ui/card-discussions.js";
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
console.log("Card discussion API and markup checks passed.");
