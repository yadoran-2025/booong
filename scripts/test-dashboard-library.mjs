import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { escapeHtml } from "../js/utils.js";
import { toggleFavoriteId } from "../js/favorites.js";
import { SCHOOL_OPTIONS } from "../js/teacher-profile.js";
import { lessonScreenshots } from "../js/lesson-thumbnails.js";
import { bindLessonPacks, packIcon } from "../js/ui/lesson-packs.js";
import { renderCardDiscussion } from "../js/ui/card-discussions.js";
import { bindResourceDescriptions } from "../js/ui/resource-descriptions.js";
import { renderCurriculumButton, renderEvaluationButton, getCurriculumMiddleUnits, getCurriculumChapter } from "../js/ui/curriculum.js";
import { renderHomeIntro } from "../js/ui/dashboard-intro.js";
import { renderTextbookButton } from "../js/ui/textbooks.js";
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
const context = vm.createContext({ renderCurriculumButton, renderEvaluationButton, renderTextbookButton, getCurriculumMiddleUnits, getCurriculumChapter, escapeHtml, SCHOOL_OPTIONS, renderCardDiscussion, packIcon, lessonScreenshots, loadFavoriteIds: () => [], renderResourceCount: () => '<span data-resource-count>조회수 0</span>' });
vm.runInContext(`${source}\nthis.library = { renderResourceCard, renderResourceDetail, bindResourceImages, renderSubjectRoller, renderUnitNavigator, applyLibraryFilter, compareResourceByMiddleUnit, getMiddleUnitCounts, renderFavoritesView, renderTopbar, toggleFavorite, bindCurationEvents, applyLibraryViewSort };`, context);
const { renderResourceCard, renderResourceDetail, bindResourceImages, renderSubjectRoller, renderUnitNavigator, applyLibraryFilter, compareResourceByMiddleUnit, getMiddleUnitCounts } = context.library;
const subjects = { 중학교: [{ value: "사회", label: "사회" }], 고등학교: [{ value: "사회", label: "사회" }, { value: "경제", label: "경제" }] };
const subjectMarkup = renderSubjectRoller({ school: "고등학교", subject: "사회" }, subjects);
assert.equal((subjectMarkup.match(/data-subject-value/g) || []).length, 3);
assert.equal((subjectMarkup.match(/aria-pressed="true"/g) || []).length, 1);
assert.match(subjectMarkup, /data-subject-school="고등학교" data-subject-value="사회" aria-pressed="true"/);
assert.doesNotMatch(subjectMarkup, /<select/);
const actions = ["blog", "teacher", "worksheet"].map(key => ({ key, href: `https://example.com/${key}`, external: true }));
const resource = { id: "r1", title: "사례 <탐구>", desc: "설명", kind: "lesson", makers: ["교사"], unitKeys: ["u1", "u2"], middleUnits: ["9. 다른 과목"], middleUnitsByKey: { u1: ["1. 첫 단원"], u2: ["2. 다음 단원"] }, actions, searchText: "사례 탐구" };
const markup = renderResourceCard(resource, "u1");
const detail = renderResourceDetail(resource);
for (const key of ["blog", "teacher", "worksheet"]) assert.match(detail, new RegExp(`href="https://example.com/${key}"`));
for (const label of ["수업 소개", "자료 링크", "도름스"]) assert.ok(detail.includes(`<strong>${label}</strong>`));
assert.match(markup, /사례 &lt;탐구&gt;/);
assert.match(markup, /data-middle-units="\[&quot;1\. 첫 단원&quot;\]"/);
assert.match(markup, /data-favorite-id="r1"/);
assert.match(markup, /data-card-discussion="r1"/);
assert.match(markup, /data-favorite-count-for="r1" data-compact-count>–<\/span>/);
assert.match(markup, /data-comment-count>–<\/span>/);
assert.match(markup, /data-resource-open="r1"/);
assert.doesNotMatch(markup, /data-resource-description|bundle-card__badges|bundle-actions/);
assert.match(markup, /<h3>[\s\S]*lesson-pack__context[\s\S]*lesson-pack__footer/);
assert.match(renderResourceDetail({ ...resource, desc: '<script>alert("unsafe")</script>' }), /&lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;/);
assert.match(markup, /lesson-pack__footer[\s\S]*data-resource-count[\s\S]*data-favorite-count-for="r1"[\s\S]*data-favorite-id="r1"/);
assert.match(markup, /bundle-card__cover is-placeholder/);
assert.match(markup, /src="\/assets\/lesson-thumbnails\/(social-studies|civics|economics|history)-default-v1.jpg" alt=""/);
assert.doesNotMatch(markup, /대표 이미지|추천/);
const makers = ["moon", "choi", "hyum", "dol"];
const jointMarkup = renderResourceDetail({ ...resource, makers });
assert.equal((jointMarkup.match(/chip chip--gray bundle-card__maker/g) || []).length, 4);
for (const maker of makers) assert.ok(jointMarkup.includes(`href="about.html#${maker}">${maker}</a>`));
for (const collaborationMakers of [["Dooclass"], ["dooclass", "moon"]]) {
  const collaborationMarkup = renderResourceDetail({ ...resource, makers: collaborationMakers });
  assert.match(collaborationMarkup, /class="chip bundle-card__collaboration">두클래스 협업 컨텐츠<\/span>/);
  assert.doesNotMatch(collaborationMarkup, /bundle-card__makers|bundle-card__maker-names|about\.html#/);
}
assert.doesNotMatch(renderResourceDetail({ ...resource, makers: ["Dooclass-other"] }), /bundle-card__collaboration/);
assert.doesNotMatch(renderResourceDetail({ ...resource, makers: [] }), /bundle-card__collaboration|bundle-card__makers/);
const missing = renderResourceDetail({ ...resource, actions: [actions[1]] });
assert.equal((missing.match(/aria-disabled="true"/g) || []).length, 2);
assert.equal((missing.match(/data-track-action/g) || []).length, 1);

const covered = renderResourceCard({ ...resource, thumbnailUrl: "/assets/lesson-thumbnails/test.webp", thumbnailAlt: '지도 "예시" <그림>' });
assert.match(covered, /bundle-card has-cover lesson-pack/);
assert.match(covered, /src="\/assets\/lesson-thumbnails\/test.webp"/);
assert.match(covered, /alt="지도 &quot;예시&quot; &lt;그림&gt;"/);
assert.match(covered, /loading="lazy"/);
assert.doesNotMatch(covered, /bundle-card__cover[\s\S]*href="https:\/\/example.com\/blog"/);
assert.match(renderResourceCard({ ...resource, thumbnailUrl: "/test.jpg", actions: [] }), /alt="사례 &lt;탐구&gt; 대표 이미지"/);
assert.doesNotMatch(renderResourceCard({ ...resource, thumbnailUrl: "/test.jpg", actions: [] }), /bundle-card__cover"><a/);
const defaultImages = Array.from({ length: 5 }, (_, index) => renderResourceCard({ ...resource, id: `default-${index}` }).match(/<img src="([^"]+)"/)[1]);
assert.equal(new Set(defaultImages.slice(0, 4)).size, 4, "each cycle uses all four default illustrations");
assert.equal(defaultImages[4], defaultImages[0]);
assert.equal(renderResourceCard({ ...resource, id: "default-0" }).match(/<img src="([^"]+)"/)[1], defaultImages[0], "a resource keeps its image during filtering and rerendering");
for (const [id, path] of Object.entries(lessonScreenshots)) {
  assert.match(id, /^group-\d+$/);
  const bytes = readFileSync(new URL(`..${path}`, import.meta.url));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.ok(bytes.length > 10000, `${id} has a complete screenshot`);
}
assert.equal(Object.keys(lessonScreenshots).length, 17);
assert.match(renderResourceCard({ ...resource, id: "group-2" }), /apps\/group-2\.jpg/);
assert.match(renderResourceCard({ ...resource, id: "group-2", thumbnailUrl: "/custom.jpg" }), /src="\/custom.jpg"/, "explicit catalog covers win over captured defaults");

// Rerendering aborts old motion listeners and clears any pending tilt.
{
  const names = ["window", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame"];
  const previous = names.map(name => globalThis[name]);
  const styles = new Map();
  let pending, boundsReads = 0;
  const tile = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    getBoundingClientRect: () => { boundsReads++; return { left: 0, top: 0, width: 100, height: 200 }; }, contains: node => node === tile };
  const root = new EventTarget();
  root.closest = () => tile;
  const media = Object.assign(new EventTarget(), { matches: true });
  globalThis.window = new EventTarget();
  globalThis.matchMedia = () => media;
  globalThis.requestAnimationFrame = callback => { pending = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { pending = null; };
  const move = () => root.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 100, clientY: 0, pointerType: "mouse" }));
  try {
    bindLessonPacks(root); move(); pending();
    assert.equal(styles.get("--pack-ry"), "5deg");
    bindLessonPacks(root);
    assert.equal(styles.size, 0);
    move();
    assert.equal(boundsReads, 2, "only the current binding receives pointer events");
    media.matches = false; media.dispatchEvent(new Event("change"));
    assert.equal(pending, null, "reduced motion cancels the queued frame");
    move(); assert.equal(pending, null);
  } finally { names.forEach((name, index) => { if (previous[index] === undefined) delete globalThis[name]; else globalThis[name] = previous[index]; }); }
}
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
const counterContext = vm.createContext({ packIcon, loadPageVisitStats: async () => pageStats, loadGroupClickStats: async () => clickStats });
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
assert.equal(clickSlot.dataset.viewCount, 31);
assert.match(counterContext.counters.renderResourceCount("p1", "r1", true), /data-resource-count-value>–/);
const compactValue = { textContent: "–" }, compactLabels = {};
const compactSlot = { isConnected: true, dataset: { viewKey: "p1" }, querySelector: () => compactValue, setAttribute: (key, value) => { compactLabels[key] = value; } };
pageStats = [{ key: "p1", views: 1234 }];
await counterContext.counters.hydrateResources({ querySelectorAll: () => [compactSlot] });
assert.equal(compactValue.textContent, "1,234");
assert.equal(compactLabels["aria-label"], "조회수 1,234");
assert.equal(compactSlot.dataset.viewCount, 1234);
counterContext.loadPageVisitStats = async () => { throw new Error("Offline"); };
compactValue.textContent = "–";
await counterContext.counters.hydrateResources({ querySelectorAll: () => [compactSlot] });
assert.equal(compactValue.textContent, "–", "failed analytics never masquerade as a measured zero");

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
const state = { unit: "", middleUnit: "", query: "", sort: "unit" };
const grouped = renderUnitNavigator(units, null, [resource], state, "통합사회2");
assert.doesNotMatch(grouped, /curation-kind-filter|자료 종류/, "resource kinds no longer split the library");
assert.equal((grouped.match(/data-resource-id="r1"/g) || []).length, 1, "all units show each lesson once in a flat pack grid");
assert.match(grouped, /lesson-pack-grid/);
assert.equal((grouped.match(/data-middle-section/g) || []).length, 0);
assert.match(grouped, /<h3>사례 &lt;탐구&gt;<\/h3>/);
const selectedFirst = renderUnitNavigator(units, units[0], [resource], { ...state, unit: "u1" }, "통합사회2");
assert.equal((selectedFirst.match(/data-textbook-unit=/g) || []).length, 1, "selected unit tools stay above the single grid");
assert.match(selectedFirst, /data-textbook-unit="u1"/);
assert.doesNotMatch(selectedFirst, /curation-unit-section|curation-middle-section|data-middle-section/);
assert.equal((selectedFirst.match(/lesson-pack-grid/g) || []).length, 1);
assert.match(selectedFirst, /<h3>사례 &lt;탐구&gt;<\/h3>/);
const selectedMiddle = renderUnitNavigator(units, units[0], [resource], { ...state, unit: "u1", middleUnit: "1. 첫 단원" }, "통합사회2");
assert.match(selectedMiddle, /data-textbook-unit="u1" data-textbook-middle="1\. 첫 단원"/);
assert.match(grouped, /data-unit="" aria-pressed="true"/);
assert.match(grouped, /data-middle-unit="1\. 첫 단원"/);
assert.match(grouped, /<span>1\. 첫 단원<\/span><\/button>/);
assert.doesNotMatch(grouped.match(/<div class="unit-axis__track"[\s\S]*?<\/aside>/)[0], /unit-tab__meta|unit-tab__curriculum/);
assert.match(grouped, /<strong>I\. 첫 단원<\/strong>\s*<small>수업 1개<\/small>/);
assert.match(grouped, /<strong>II\. 다음 단원<\/strong>\s*<small>수업 1개<\/small>/);
assert.match(grouped, /data-unit=""[^>]*><strong>전체 단원<\/strong><\/button>/);
assert.match(grouped, /class="sr-only" data-library-count aria-live="polite"/);
assert.doesNotMatch(grouped, /curation-library-status/);
assert.doesNotMatch(grouped, /data-middle-unit="2\. 자료 없는 중단원"/);
const counts = getMiddleUnitCounts(units[0], [resource,
  { ...resource, id: "r2" },
  { ...resource, id: "other-unit", unitKeys: ["u2"], middleUnits: ["1. 첫 단원"], middleUnitsByKey: {} },
]);
assert.deepEqual(JSON.parse(JSON.stringify(counts)), [{ title: "1. 첫 단원", count: 2 }]);
assert.equal(getMiddleUnitCounts(units[0], []).length, 0);
const selected = renderUnitNavigator(units, units[1], [resource], { ...state, unit: "u2" }, "통합사회2");
assert.equal((selected.match(/lesson-pack-grid/g) || []).length, 1);
assert.doesNotMatch(selected, /curation-unit-section|curation-middle-section/);
assert.match(selected, /2\. 다음 단원<\/option>/);
assert.ok(compareResourceByMiddleUnit(resource, { ...resource, middleUnitsByKey: { u1: ["2. 둘째 단원"] } }, "u1") < 0);

const curriculum = JSON.parse(readFileSync(new URL("../data/curriculum.json", import.meta.url), "utf8"));
for (const subject of ["사회1", "사회2", "사회2[15개정]"]) {
  const middleUnits = Object.values(curriculum.chapters).filter(chapter => chapter.subject === subject)
    .map(chapter => ({ ...chapter, key: `${subject}::${chapter.title}`, school: "중학교", middleUnits: [] }));
  const middleState = { ...state, profile: { school: "중학교", subject } };
  for (const chapterLookup of [getCurriculumChapter, unit => getCurriculumChapter(unit, curriculum)]) {
    context.getCurriculumChapter = chapterLookup;
    const html = renderUnitNavigator(middleUnits, null, [], middleState, subject);
    const picker = html.match(/<aside[\s\S]*?<\/aside>/)[0];
    const buttons = [...picker.matchAll(/data-unit-group="([^"]+)" aria-pressed="(true|false)" aria-controls="unit-group-(\d+)"/g)];
    assert.deepEqual(buttons.map(match => match[1]), ["일반사회", "지리"]);
    assert.deepEqual(buttons.map(match => match[2]), ["true", "false"], "general social studies is visible initially");
    assert.doesNotMatch(picker, /aria-expanded|펼치기|접기/, "the two areas use visible selection buttons");
    const panels = [...picker.matchAll(/<div class="unit-picker__group-units" id="unit-group-(\d+)"( hidden)?>/g)];
    assert.equal(panels.length, 2);
    assert.equal(panels.filter(match => !match[2]).length, 1, "only one area is visible");
    for (const [index, panel] of panels.entries()) {
      const label = buttons[index][1];
      const content = picker.slice(panel.index, panels[index + 1]?.index);
      assert.equal((content.match(/data-unit=/g) || []).length, 6);
      assert.equal(content.includes('class="unit-picker__group-note"'), label === "지리", "only geography shows the subject expertise notice");
      if (label === "지리") assert.match(content, /일부 오류가 있을 수 있습니다\. 수업에 활용하기 전 내용을 확인해 주세요\./);
      const expected = middleUnits.filter(unit => getCurriculumChapter(unit, curriculum).domain.includes("지리") === (label === "지리"));
      for (const unit of expected) assert.ok(content.includes(`data-unit="${unit.key}"`), `${subject} ${unit.title} belongs to ${label}`);
    }
    for (const label of ["일반사회", "지리"]) {
      const unit = middleUnits.find(unit => getCurriculumChapter(unit, curriculum).domain.includes("지리") === (label === "지리"));
      const selection = renderUnitNavigator(middleUnits, unit, [], { ...middleState, unit: unit.key }, subject);
      assert.match(selection, new RegExp(`data-unit-group="${label}" aria-pressed="true"`), "selected chapter stays reachable");
      assert.equal((selection.match(/data-unit-group="[^"]+" aria-pressed="true"/g) || []).length, 1);
    }
    const keptOpen = renderUnitNavigator(middleUnits, null, [], { ...middleState, unitGroup: "지리" }, subject);
    assert.match(keptOpen, /data-unit-group="일반사회" aria-pressed="false"/);
    assert.match(keptOpen, /data-unit-group="지리" aria-pressed="true"/);
    assert.match(keptOpen, /id="unit-group-0" hidden>/);
    assert.match(keptOpen, /id="unit-group-1">/);
    const invalidGroup = renderUnitNavigator(middleUnits, null, [], { ...middleState, unitGroup: "없는 영역" }, subject);
    assert.match(invalidGroup, /data-unit-group="일반사회" aria-pressed="true"/);
  }
}
context.getCurriculumChapter = getCurriculumChapter;
assert.doesNotMatch(grouped, /data-unit-group=/, "high-school units keep their existing navigation");

// Area buttons switch only their unit panels and keep the lesson selection intact.
for (const name of ["bindCurriculum", "bindTextbooks", "bindNotices", "bindLessonPacks", "bindResourceDetails", "bindCardDiscussions"]) context[name] = () => {};
context.hydrateViewCounts = async () => {};
const hydrateFavorites = context.hydrateFavoriteCounts;
context.hydrateFavoriteCounts = () => {};
const groupPanels = { "#unit-group-0": { hidden: false }, "#unit-group-1": { hidden: true } };
const groupButtons = ["일반사회", "지리"].map((label, index) => {
  const attributes = { "aria-pressed": String(index === 0), "aria-controls": `unit-group-${index}` };
  return { dataset: { unitGroup: label }, getAttribute: key => attributes[key], setAttribute: (key, value) => { attributes[key] = value; }, addEventListener: (_, handler) => { groupButtons[index].click = handler; } };
});
const groupRoot = {
  querySelectorAll: selector => selector === "[data-unit-group]" ? groupButtons : [],
  querySelector: selector => groupPanels[selector] || null,
};
const groupState = { ...state, unit: "existing-unit", middleUnit: "existing-middle" };
context.library.bindCurationEvents(groupRoot, { catalog: { resources: [] } }, groupState);
for (const index of [1, 1, 0]) {
  groupButtons[index].click();
  assert.equal(groupState.unitGroup, groupButtons[index].dataset.unitGroup);
  assert.equal(groupState.unit, "existing-unit");
  assert.equal(groupState.middleUnit, "existing-middle");
  for (const [buttonIndex, button] of groupButtons.entries()) {
    assert.equal(button.getAttribute("aria-pressed"), String(buttonIndex === index));
    assert.equal(groupPanels[`#${button.getAttribute("aria-controls")}`].hidden, buttonIndex !== index);
  }
}
context.hydrateFavoriteCounts = hydrateFavorites;

const shared = { ...resource, middleUnitsByKey: { u1: ["1. 첫 단원", "2. 자료 없는 중단원", "1. 첫 단원"] } };
const sharedMarkup = renderUnitNavigator([units[0]], units[0], [shared], { ...state, unit: "u1" }, "통합사회2");
assert.equal((sharedMarkup.match(/data-resource-id="r1"/g) || []).length, 1, "a lesson linked to multiple middle units still appears once");
assert.doesNotMatch(sharedMarkup, /data-section-count|중단원 2개 · 수업 1개/);
assert.match(sharedMarkup, /data-middle-units="[^\"]*&quot;2\. 자료 없는 중단원&quot;/, "the single card retains all middle-unit filters");
const unassignedMarkup = renderUnitNavigator([units[0]], units[0], [{ ...resource, middleUnitsByKey: { u1: [] } }], state, "통합사회2");
assert.doesNotMatch(unassignedMarkup, /curation-middle-section/);
assert.equal((unassignedMarkup.match(/data-resource-id="r1"/g) || []).length, 1);
const sortedMarkup = renderUnitNavigator([units[0]], units[0], [{ ...resource, title: "하 수업" }, { ...resource, id: "r2", title: "가 수업" }], { ...state, sort: "title" }, "통합사회2");
assert.ok(sortedMarkup.indexOf("<h3>가 수업") < sortedMarkup.indexOf("<h3>하 수업"), "title sorting works within a middle unit");

assert.match(grouped, /data-library-sort="views" aria-pressed="false">조회순/);
const viewItems = [
  { title: "미집계", views: undefined }, { title: "하 수업", views: 20 },
  { title: "큰 수업", views: 1234 }, { title: "가 수업", views: 20 }, { title: "조회 0", views: 0 },
].map(({ title, views }) => ({ dataset: { resourceTitle: title }, querySelector: () => ({ dataset: { viewCount: views } }) }));
let viewOrder = viewItems;
const viewGrid = { querySelectorAll: () => viewOrder, append: (...items) => { viewOrder = items; } };
const viewRoot = { querySelector: () => viewGrid };
context.library.applyLibraryViewSort(viewRoot, { sort: "views" });
assert.deepEqual(viewOrder.map(item => item.dataset.resourceTitle), ["큰 수업", "가 수업", "하 수업", "조회 0", "미집계"], "numeric descending views, Korean title ties, and unknown counts last");
viewOrder = viewItems;
context.library.applyLibraryViewSort(viewRoot, { sort: "title" });
assert.equal(viewOrder, viewItems, "late analytics cannot override a different sort choice");
let focusedSort = -1;
const sortButtons = ["unit", "title", "views"].map((value, index) => ({
  dataset: { librarySort: value }, handlers: {},
  addEventListener(type, handler) { this.handlers[type] = handler; },
  focus() { focusedSort = index; },
}));
context.library.bindCurationEvents({ querySelectorAll: selector => selector === "[data-library-sort]" ? sortButtons : [], querySelector: () => null }, { catalog: { resources: [] } }, state);
for (const [index, key, expected] of [[0, "ArrowLeft", 2], [2, "ArrowRight", 0], [1, "End", 2], [2, "Home", 0]]) {
  sortButtons[index].handlers.keydown({ key, preventDefault() {} });
  assert.equal(focusedSort, expected, "all three sort choices support keyboard navigation");
}

const item = (id, kind, middle) => ({ hidden: false, dataset: { resourceId: id, kind, middleUnits: JSON.stringify([middle]), search: "사례 탐구" } });
const rows = [item("r1", "lesson", "1. 첫 단원"), item("r1", "lesson", "2. 다음 단원"), item("r2", "game", "2. 다음 단원")];
const count = {}, empty = {}, grid = {};
const root = {
  querySelectorAll: selector => selector === "[data-library-item]" ? rows : [],
  querySelector: selector => selector === "[data-library-count]" ? count : selector === "[data-library-grid]" ? grid : empty,
};
applyLibraryFilter(root, state);
assert.equal(count.textContent, "수업 2개");
assert.equal(grid.hidden, false);
applyLibraryFilter(root, { ...state, middleUnit: "1. 첫 단원" });
assert.equal(rows[0].hidden, false);
assert.equal(rows[1].hidden, true);
assert.equal(rows[2].hidden, true);
assert.equal(grid.hidden, false);
applyLibraryFilter(root, { ...state, kind: "game" });
assert.ok(rows.every(row => !row.hidden), "lessons and games stay visible together");
applyLibraryFilter(root, { ...state, query: "없는 검색어" });
assert.equal(empty.hidden, false);
assert.equal(grid.hidden, true);
assert.ok(rows.every(row => row.hidden));
const emptySelection = renderUnitNavigator(units, units[0], [], { ...state, unit: "u1" }, "통합사회2");
assert.match(emptySelection, /data-textbook-unit="u1"/, "unit references remain reachable when no lessons exist");
assert.match(emptySelection, /<strong>I\. 첫 단원<\/strong>\s*<small>수업 0개<\/small>/);
assert.doesNotMatch(selectedMiddle, /<option[^>]*>[^<]*\(\d+개\)/, "middle-unit choices do not repeat counts");
assert.doesNotMatch(emptySelection, /curation-unit-section|curation-middle-section/);
assert.doesNotMatch(grouped, /curation-library-hint|수업이 없는 단원도/);
const chipUnit = { key: "사회2::I. 인권과 헌법", subject: "사회2", title: "I. 인권과 헌법", middleUnits: [] };
const chipMarkup = renderUnitNavigator([chipUnit], chipUnit, [], { ...state, profile: { school: "중학교", subject: "사회2" } }, "사회2");
assert.match(chipMarkup, /<h1>사회2 수업 모아보기<\/h1>\s*<div class="curation-library-references">[\s\S]*data-curriculum-subject="사회2"[\s\S]*data-evaluation-subject="사회2"[\s\S]*data-textbook-unit=/);
assert.equal((chipMarkup.match(/data-evaluation-subject=/g) || []).length, 1, "evaluation appears once alongside the unit reference chips");
const allUnitsMarkup = renderUnitNavigator([chipUnit], null, [], { ...state, middleUnit: "3. 이전 선택", profile: { school: "중학교", subject: "사회2" } }, "사회2");
assert.match(allUnitsMarkup, /data-curriculum-subject="사회2" data-curriculum-chapter="" data-curriculum-middle=""/);
assert.match(allUnitsMarkup, /aria-label="사회2 전체 단원 교육과정"/);
assert.equal((allUnitsMarkup.match(/data-curriculum-subject=/g) || []).length, 1);
assert.doesNotMatch(allUnitsMarkup, /data-textbook-unit=/);
assert.doesNotMatch(grouped.match(/<aside[\s\S]*?<\/aside>/)[0], /unit-picker__hint|교육과정을 볼 수/);
console.log("Dashboard library: flat cards in every selection, unit references, sorting and filters passed.");

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
