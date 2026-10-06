import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { escapeHtml } from "../js/utils.js";
import { toggleFavoriteId } from "../js/favorites.js";
import { SCHOOL_OPTIONS } from "../js/teacher-profile.js";
import { renderCardDiscussion } from "../js/ui/card-discussions.js";
import { bindResourceDescriptions } from "../js/ui/resource-descriptions.js";
import { renderHomeIntro } from "../js/ui/dashboard-intro.js";
import "./test-dashboard-intro.mjs";

const { createIntroRoute, sampleIntroRoute } = await import('../js/ui/intro-scooter.js');
const { camera, curve } = createIntroRoute();
assert.deepEqual(sampleIntroRoute(curve, -1), sampleIntroRoute(curve, 0));
assert.deepEqual(sampleIntroRoute(curve, 2), sampleIntroRoute(curve, 1));
assert.ok(sampleIntroRoute(curve, 1).position.distanceTo(camera.position) > sampleIntroRoute(curve, 0).position.distanceTo(camera.position));
for (const progress of [0, .03, .08, .14]) assert.equal(sampleIntroRoute(curve, progress).bank, 0, 'the departure stays upright');
const steps = Array.from({ length: 1001 }, (_, i) => sampleIntroRoute(curve, i / 1000));
assert.ok(steps.every(step => Math.abs(step.bank) < .05), 'banking stays subtle on tight bends');
const { createScooterModel } = await import('../js/ui/scooter-model.js');
const { model, wheels, wheelRadius } = createScooterModel();
assert.equal(wheels.length, 2);
assert.ok(wheels.every(wheel => Math.abs(wheel.position.y - wheelRadius) < .003), 'tires meet the road at their rolling pivots');
let triangleCount = 0;
model.traverse(node => {
  if (!node.isMesh) return;
  const positions = node.geometry.getAttribute('position');
  assert.ok(positions.array.every(Number.isFinite), 'model geometry is valid');
  triangleCount += (node.geometry.index?.count || positions.count) / 3;
});
assert.ok(triangleCount < 50000, 'the decorative scooter stays within its rendering budget');
assert.equal(model.getObjectByName('WheelFront'), wheels[1]);
const distances = steps.slice(1).map((step, i) => step.position.distanceTo(steps[i].position));
assert.ok(Math.max(...distances) / Math.min(...distances) < 1.1, 'arc-length sampling keeps travel speed steady');
for (let i = 1; i < steps.length; i++) {
  const turn = Math.atan2(Math.sin(steps[i].heading - steps[i - 1].heading), Math.cos(steps[i].heading - steps[i - 1].heading));
  assert.ok(Math.abs(turn) < .06, 'heading follows smooth bends without snapping');
}
assert.match(renderHomeIntro(), /assets\/models\/credits.txt/);
assert.match(renderHomeIntro(), /href="#lesson-library" data-intro-skip/);

// Exercise the browser renderer without connecting the test to live analytics.
const source = readFileSync(new URL("../js/ui/dashboard.js", import.meta.url), "utf8")
  .replace(/^import .+;$/gm, "").replace(/^export /gm, "");
const context = vm.createContext({ escapeHtml, SCHOOL_OPTIONS, renderCardDiscussion, loadFavoriteIds: () => [], renderResourceCount: () => '<span data-resource-count>조회수 0</span>' });
vm.runInContext(`${source}\nthis.library = { renderResourceCard, bindResourceImages, renderSubjectRoller, renderUnitNavigator, applyLibraryFilter, compareResourceByMiddleUnit, getMiddleUnitCounts, renderFavoritesView, renderTopbar, toggleFavorite };`, context);
const { renderResourceCard, bindResourceImages, renderSubjectRoller, renderUnitNavigator, applyLibraryFilter, compareResourceByMiddleUnit, getMiddleUnitCounts } = context.library;
const subjects = { 중학교: [{ value: "사회", label: "사회" }], 고등학교: [{ value: "사회", label: "사회" }, { value: "경제", label: "경제" }] };
const subjectMarkup = renderSubjectRoller({ school: "고등학교", subject: "사회" }, subjects);
assert.equal((subjectMarkup.match(/data-subject-value/g) || []).length, 3);
assert.equal((subjectMarkup.match(/aria-pressed="true"/g) || []).length, 1);
assert.match(subjectMarkup, /data-subject-school="고등학교" data-subject-value="사회" aria-pressed="true"/);
assert.doesNotMatch(subjectMarkup, /<select/);
const actions = ["blog", "teacher", "worksheet"].map(key => ({ key, href: `https://example.com/${key}`, external: true }));
const resource = { id: "r1", title: "사례 <탐구>", desc: "설명", kind: "lesson", makers: ["교사"], unitKeys: ["u1", "u2"], middleUnits: ["9. 다른 과목"], middleUnitsByKey: { u1: ["1. 첫 단원"], u2: ["2. 다음 단원"] }, actions, searchText: "사례 탐구" };
const markup = renderResourceCard(resource, "u1");
for (const key of ["blog", "teacher", "worksheet"]) assert.match(markup, new RegExp(`href="https://example.com/${key}"`));
for (const label of ["수업 소개", "자료 링크", "활동지"]) assert.ok(markup.includes(`<strong>${label}</strong>`));
assert.match(markup, /사례 &lt;탐구&gt;/);
assert.match(markup, /data-middle-units="\[&quot;1\. 첫 단원&quot;\]"/);
assert.match(markup, /data-favorite-id="r1"/);
assert.match(markup, /data-card-discussion="r1"/);
assert.match(markup, /data-favorite-count-for="r1">저장수 0<\/span>/);
assert.match(markup, /data-comment-count>0<\/span>/);
assert.match(markup, /data-resource-description[\s\S]*<button type="button" aria-expanded="false" hidden>더 보기<\/button>/);
assert.match(markup, /<\/div>\s*<footer class="bundle-card__meta">/);
assert.match(renderResourceCard({ ...resource, desc: '<script>alert("unsafe")</script>' }), /&lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;/);
assert.match(markup, /bundle-card__utilities[\s\S]*data-favorite-id="r1"[\s\S]*bundle-card__meta[\s\S]*data-resource-count[\s\S]*data-favorite-count-for="r1"/);
assert.doesNotMatch(markup.match(/bundle-card__badges[\s\S]*?<\/div>/)[0], /data-resource-count|data-favorite-count-for/);
assert.match(markup, /bundle-card__cover is-placeholder/);
assert.match(markup, /src="\/assets\/lesson-thumbnails\/(social-studies|civics|economics|history)-default-v1.jpg" alt=""/);
assert.doesNotMatch(markup, /대표 이미지|추천/);
const makers = ["moon", "choi", "hyum", "dol"];
const jointMarkup = renderResourceCard({ ...resource, makers });
assert.equal((jointMarkup.match(/chip chip--gray bundle-card__maker/g) || []).length, 4);
for (const maker of makers) assert.ok(jointMarkup.includes(`href="about.html#${maker}">${maker}</a>`));
const missing = renderResourceCard({ ...resource, actions: [actions[1]] });
assert.equal((missing.match(/aria-disabled="true"/g) || []).length, 2);
assert.equal((missing.match(/data-track-action/g) || []).length, 1);

const covered = renderResourceCard({ ...resource, thumbnailUrl: "/assets/lesson-thumbnails/test.webp", thumbnailAlt: '지도 "예시" <그림>' });
assert.match(covered, /bundle-card has-cover/);
assert.match(covered, /src="\/assets\/lesson-thumbnails\/test.webp"/);
assert.match(covered, /alt="지도 &quot;예시&quot; &lt;그림&gt;"/);
assert.match(covered, /loading="lazy"/);
assert.match(covered, /bundle-card__cover[\s\S]*href="https:\/\/example.com\/blog"/);
assert.match(renderResourceCard({ ...resource, thumbnailUrl: "/test.jpg", actions: [] }), /alt="사례 &lt;탐구&gt; 대표 이미지"/);
assert.doesNotMatch(renderResourceCard({ ...resource, thumbnailUrl: "/test.jpg", actions: [] }), /bundle-card__cover"><a/);
const defaultImages = Array.from({ length: 5 }, (_, index) => renderResourceCard({ ...resource, id: `default-${index}` }).match(/<img src="([^"]+)"/)[1]);
assert.equal(new Set(defaultImages.slice(0, 4)).size, 4, "each cycle uses all four default illustrations");
assert.equal(defaultImages[4], defaultImages[0]);
assert.equal(renderResourceCard({ ...resource, id: "default-0" }).match(/<img src="([^"]+)"/)[1], defaultImages[0], "a resource keeps its image during filtering and rerendering");
for (const complete of [false, true]) {
  let placeholderClass = "", errorHandler;
  const image = { complete, naturalWidth: 0, src: "/broken.jpg", alt: "잘못된 수업 이미지", dataset: { fallbackSrc: "/assets/lesson-thumbnails/history-default-v1.jpg" },
    getAttribute: () => image.src,
    closest: () => ({ classList: { add: value => { placeholderClass = value; } } }),
    addEventListener: (event, handler, options) => { assert.equal(event, "error"); assert.equal(options.once, true); errorHandler = handler; },
  };
  bindResourceImages({ querySelectorAll: () => [image] });
  if (!complete) { assert.equal(image.src, "/broken.jpg"); errorHandler(); }
  assert.equal(image.src, image.dataset.fallbackSrc);
  assert.equal(image.alt, "");
  assert.equal(placeholderClass, "is-placeholder");
}
bindResourceImages({ querySelectorAll: () => [{ complete: true, naturalWidth: 0, getAttribute: () => "/default.jpg", dataset: { fallbackSrc: "/default.jpg" } }] }); // Never retry a missing fallback forever.

// Empty statistics keep all counters visible, and loaded counts replace defaults.
const counterSource = readFileSync(new URL("../js/ui/view-counter.js", import.meta.url), "utf8")
  .replace(/^import .+;$/gm, "").replace(/^export /gm, "");
let pageStats = [], clickStats = [];
const counterContext = vm.createContext({ loadPageVisitStats: async () => pageStats, loadGroupClickStats: async () => clickStats });
vm.runInContext(`${counterSource}\nthis.counters = { renderResourceCount, hydrateResources };`, counterContext);
assert.match(counterContext.counters.renderResourceCount("p1", "r1"), />조회수 0<\/span>/);
const pageSlot = { isConnected: true, dataset: { viewKey: "p1" } };
const clickSlot = { isConnected: true, dataset: { clickId: "r1" } };
const counterRoot = { querySelectorAll: () => [pageSlot, clickSlot] };
await counterContext.counters.hydrateResources(counterRoot);
assert.equal(pageSlot.textContent, "조회수 0");
assert.equal(clickSlot.textContent, "조회수 0");
clickStats = [{ groupId: "r1", views: 31 }];
await counterContext.counters.hydrateResources(counterRoot);
assert.equal(pageSlot.textContent, "조회수 0");
assert.equal(clickSlot.textContent, "조회수 31");

// Inline disclosure reserves room for its button, restores the full text, and reacts to width changes.
const originalObserver = globalThis.ResizeObserver;
const originalDocument = globalThis.document;
const originalComputedStyle = globalThis.getComputedStyle;
const observed = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = []; observed.push(this); }
  observe(target) { this.targets.push(target); }
  disconnect() { this.disconnected = true; }
};
globalThis.document = { fonts: { ready: Promise.resolve() } };
globalThis.getComputedStyle = () => ({ lineHeight: "24px" });
try {
  const makeDescription = text => {
    const paragraph = { textContent: text };
    const attrs = { "aria-expanded": "false" };
    const button = { textContent: "더 보기", hidden: true, getAttribute: name => attrs[name], setAttribute: (name, value) => { attrs[name] = value; }, addEventListener: (_, handler) => { button.click = handler; } };
    return { paragraph, button, charactersPerLine: 40, querySelector: selector => selector === "p" ? paragraph : button,
      get scrollHeight() { return Math.ceil((Array.from(paragraph.textContent).length + (button.hidden ? 0 : 7)) / this.charactersPerLine) * 24; },
    };
  };
  const fullText = "설명😀".repeat(70);
  const long = makeDescription(fullText), short = makeDescription("짧".repeat(120));
  const descriptionRoot = { querySelectorAll: () => [long, short] };
  bindResourceDescriptions(descriptionRoot);
  assert.equal(long.button.hidden, false);
  assert.ok(long.scrollHeight <= 72, "three lines include the inline button");
  assert.ok(long.paragraph.textContent.endsWith("…"));
  assert.equal(short.button.hidden, true);
  assert.notEqual(long.paragraph.id, short.paragraph.id);
  assert.equal(long.button.getAttribute("aria-controls"), long.paragraph.id);
  long.button.click();
  assert.equal(long.button.getAttribute("aria-expanded"), "true");
  assert.equal(long.button.textContent, "접기");
  assert.equal(long.paragraph.textContent, fullText);
  observed[0].callback([{ target: long }]);
  assert.equal(long.paragraph.textContent, fullText, "resize preserves expanded text");
  long.button.click();
  assert.ok(long.scrollHeight <= 72);
  short.charactersPerLine = 20;
  observed[0].callback([{ target: short }]);
  assert.equal(short.button.hidden, false, "narrow screens reveal a toggle when the text wraps");
  assert.ok(short.scrollHeight <= 72);
  short.button.click();
  assert.equal(short.paragraph.textContent, "짧".repeat(120), "resizing retains the original text");
  bindResourceDescriptions(descriptionRoot);
  assert.equal(observed[0].disconnected, true);
  await Promise.resolve();
} finally {
  globalThis.ResizeObserver = originalObserver;
  globalThis.document = originalDocument;
  globalThis.getComputedStyle = originalComputedStyle;
}

const units = [
  { key: "u1", title: "I. 첫 단원", middleUnits: ["1. 첫 단원", "1. 첫 단원", "2. 자료 없는 중단원"] },
  { key: "u2", title: "II. 다음 단원", middleUnits: ["2. 다음 단원"] },
];
const state = { unit: "", middleUnit: "", kind: "all", query: "", sort: "unit" };
const grouped = renderUnitNavigator(units, null, [resource], state, "통합사회2");
assert.equal((grouped.match(/data-library-section/g) || []).length, 2);
assert.match(grouped, /data-unit="" aria-pressed="true"/);
assert.match(grouped, /data-middle-unit="1\. 첫 단원"/);
assert.match(grouped, /<span>1\. 첫 단원<\/span><small>1개<\/small>/);
assert.doesNotMatch(grouped, /data-middle-unit="2\. 자료 없는 중단원"/);
const counts = getMiddleUnitCounts(units[0], [resource,
  { ...resource, id: "r2" },
  { ...resource, id: "other-unit", unitKeys: ["u2"], middleUnits: ["1. 첫 단원"], middleUnitsByKey: {} },
]);
assert.deepEqual(JSON.parse(JSON.stringify(counts)), [{ title: "1. 첫 단원", count: 2 }]);
assert.equal(getMiddleUnitCounts(units[0], []).length, 0);
const selected = renderUnitNavigator(units, units[1], [resource], { ...state, unit: "u2" }, "통합사회2");
assert.equal((selected.match(/data-library-section/g) || []).length, 1);
assert.match(selected, /2\. 다음 단원 \(1개\)<\/option>/);
assert.ok(compareResourceByMiddleUnit(resource, { ...resource, middleUnitsByKey: { u1: ["2. 둘째 단원"] } }, "u1") < 0);

const item = (id, kind, middle) => ({ hidden: false, dataset: { resourceId: id, kind, middleUnits: JSON.stringify([middle]), search: "사례 탐구" } });
const rows = [item("r1", "lesson", "1. 첫 단원"), item("r1", "lesson", "2. 다음 단원"), item("r2", "game", "2. 다음 단원")];
const sections = [[rows[0]], [rows[1], rows[2]]].map(items => {
  const label = {};
  return { hidden: false, label, querySelectorAll: () => items, querySelector: () => label };
});
const count = {}, empty = {};
const root = {
  querySelectorAll: selector => selector === "[data-library-item]" ? rows : sections,
  querySelector: selector => selector === "[data-library-count]" ? count : empty,
};
applyLibraryFilter(root, state);
assert.equal(count.textContent, "수업 2개"); // A resource linked to two units is counted once.
applyLibraryFilter(root, { ...state, middleUnit: "1. 첫 단원" });
assert.equal(rows[0].hidden, false);
assert.equal(rows[1].hidden, true);
assert.equal(sections[1].hidden, true);
applyLibraryFilter(root, { ...state, kind: "game" });
assert.equal(sections[0].hidden, true);
assert.equal(rows[2].hidden, false);
applyLibraryFilter(root, { ...state, query: "없는 검색어" });
assert.equal(empty.hidden, false);
assert.ok(sections.every(section => section.hidden));
console.log("Dashboard library: grouped units, links, scoped sorting and filters passed.");

// Counts and cards use the same catalog, while saved missing IDs survive outages.
let savedFavorites = ["missing-from-catalog", "r1"];
context.loadFavoriteIds = () => savedFavorites;
context.saveFavoriteIds = ids => (savedFavorites = ids);
context.toggleFavoriteId = toggleFavoriteId;
context.renderViewCounter = () => "";
vm.runInContext("bindCurationEvents = () => {};", context);
const favoriteRoot = {};
context.library.renderFavoritesView(favoriteRoot, { catalog: { resources: [resource] } });
assert.equal((favoriteRoot.innerHTML.match(/data-resource-id=/g) || []).length, 1);
assert.match(favoriteRoot.innerHTML, /data-favorite-count>1<\/b>/);
assert.match(favoriteRoot.innerHTML, /aria-label="내 수업함, 저장한 수업 1개"/);
assert.match(context.library.renderTopbar([resource]), /data-favorite-count>1<\/b>/);
assert.deepEqual(savedFavorites, ["missing-from-catalog", "r1"]);

// Removing a card/count must finish before a slow analytics request resolves.
let finishAnalytics, removed = false;
context.setFavoriteState = () => new Promise(resolve => { finishAnalytics = resolve; });
const badge = { textContent: "1", closest: () => ({ setAttribute() {} }) };
const favoriteList = { hidden: false }, favoriteEmpty = { hidden: true };
const favoriteButton = { dataset: { favoriteId: "r1" }, setAttribute() {},
  querySelector: () => ({}), closest: () => ({ querySelector: () => ({ textContent: resource.title }), remove: () => { removed = true; } }) };
const toggledRoot = {
  querySelectorAll: selector => selector === "[data-favorite-id]" ? (removed ? [] : [favoriteButton]) : selector === "[data-favorite-count]" ? [badge] : [],
  querySelector: selector => ({ ".curation-favorites": {}, "[data-favorites-list]": favoriteList, "[data-favorites-empty]": favoriteEmpty })[selector] || null,
};
const pendingToggle = context.library.toggleFavorite(toggledRoot, favoriteButton, [resource]);
assert.equal(badge.textContent, 0);
assert.equal(removed, true);
assert.equal(favoriteList.hidden, true);
assert.equal(favoriteEmpty.hidden, false);
assert.deepEqual(savedFavorites, ["missing-from-catalog"]);
finishAnalytics(null);
await pendingToggle;
context.library.renderFavoritesView(favoriteRoot, { catalog: { resources: [resource] } });
assert.match(favoriteRoot.innerHTML, /data-favorite-count>0<\/b>/);
assert.equal((favoriteRoot.innerHTML.match(/data-resource-id=/g) || []).length, 0);
console.log("Favorite counts: catalog parity, preserved missing IDs and immediate removal passed.");
