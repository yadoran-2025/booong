import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { normalizeMemberRow, parseMemberProfileCsv } from "../js/member-data.js";
import { escapeHtml } from "../js/utils.js";

const members = parseMemberProfileCsv("id,name,aliases,career,making\nDo,이도빈,doh|dobby,학교(2025)|부대(2026-),수업 A|game-1\n");
assert.deepEqual(members[0].aliases, ["doh", "dobby"]);
assert.deepEqual(members[0].career, ["학교(2025)", "부대(2026-)"]);
assert.deepEqual(members[0].making, ["수업 A", "game-1"]);
assert.equal(normalizeMemberRow({ id: "" }), null);

const [member] = parseMemberProfileCsv('id,name,세부 연수경력\r\nDo,이도빈,"연수 A (2025, 30시간)\r\n연수 B|<img src=x onerror=alert(1)>"\r\n');
assert.deepEqual(member.trainingCareer, ["연수 A (2025, 30시간)", "연수 B", "<img src=x onerror=alert(1)>"]);
assert.deepEqual(members[0].trainingCareer, []);
assert.deepEqual(normalizeMemberRow({ id: "Do", "세부 연수경력": "  " }).trainingCareer, []);

const source = readFileSync(new URL("../js/about.js", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace(/^init\(\);$/m, "");
const root = { querySelector: () => null };
const context = vm.createContext({
  document: { getElementById: () => root }, escapeHtml, URL,
  getLessonPageKey: id => `view:${id}`,
  loadPageVisitStats: async () => [{ key: "view:수업 A", views: 73 }],
  loadGroupClickStats: async () => [{ groupId: "external-work", views: 9999 }],
});
vm.runInContext(source, context);
const html = context.renderMemberCard(member, []);
assert.match(html, /data-action="toggle-training" aria-expanded="false" aria-controls="member-training-content"/);
assert.match(html, /id="member-training-content" inert/);
assert.match(html, /<ol class="member-career">/);
assert.ok(html.indexOf("세부 연수경력") < html.indexOf("제작 자료"), "연수 이력은 제작 자료보다 먼저 표시한다");
assert.ok(html.indexOf("연수 A") < html.indexOf("연수 B"));
assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(html, /<img src=x/);
assert.doesNotMatch(context.renderMemberCard(members[0], []), /member-card__training/);

const toggle = {
  expanded: "false",
  nextElementSibling: { inert: true },
  getAttribute: () => toggle.expanded,
  setAttribute: (_, value) => { toggle.expanded = value; },
  addEventListener: (_, listener) => { toggle.click = listener; },
};
root.querySelector = selector => selector === "[data-action='toggle-training']" ? toggle : null;
context.bindMemberCardActions();
toggle.click();
assert.equal(toggle.expanded, "true");
assert.equal(toggle.nextElementSibling.inert, false);
toggle.click();
assert.equal(toggle.expanded, "false");
assert.equal(toggle.nextElementSibling.inert, true);

vm.runInContext('state.linkClicks.set("external-work", 1234); state.linkClicks.set("zero", 0); state.pageViews.set("view:수업 A", 52);', context);
const works = [
  { id: "External Work", type: "lesson", title: "시장 <수업>", href: "https://example.com/lesson?a=1&lesson=수업%20A", external: true, units: ["시장과 가격"] },
  { id: "internal", type: "lesson", title: "내부 수업", href: "index.html?lesson=수업%20A", external: false },
  { id: "zero", type: "game", title: "게임", href: "https://example.com/game", external: true },
  { id: "missing", type: "game", title: "새 게임", href: "https://example.com/new", external: true },
];
const workHtml = context.renderMemberCard(member, works);
assert.match(workHtml, /만든 자료 <span>4<\/span>/);
assert.match(workHtml, /수업 2 · 게임 2/);
assert.match(workHtml, /시장 &lt;수업&gt;/);
assert.match(workHtml, /<strong>1,234<\/strong>/);
assert.match(workHtml, /data-metric-type="조회수" data-metric-key="view:수업 A"/);
assert.equal(context.getWorkMetric(works[0]).label, "링크 클릭");
assert.equal(context.getWorkMetric(works[1]).value, 52);
assert.match(context.renderWorkLinks([works[2]]), /<strong>0<\/strong>/);
assert.match(context.renderWorkLinks([works[3]]), /<strong>—<\/strong>/);
const metricSlots = works.map(work => {
  const metric = context.getWorkMetric(work);
  const number = { textContent: "—" };
  return { dataset: { metricType: metric.label, metricKey: metric.key }, querySelector: () => number, number };
});
root.querySelectorAll = () => metricSlots;
await context.refreshWorkStats();
assert.deepEqual(metricSlots.map(slot => slot.number.textContent), ["9,999", "73", "—", "—"]);
console.log("member-data tests passed");
