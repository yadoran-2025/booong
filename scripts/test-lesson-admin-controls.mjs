import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildDashboardCatalog } from "../js/dashboard-data.js";
import { getLessonContributors } from "../js/lesson-contributors.js";
import { thumbnailUrl } from "../js/thumbnail-data.js";
import { escapeHtml } from "../js/utils.js";

const source = await readFile(new URL("../js/lesson-admin.js", import.meta.url), "utf8");
const list = { innerHTML: "" }, search = { value: "" }, count = {}, resetFilters = {};
const root = { querySelector: selector => selector === "[data-list]" ? list : selector === "[data-search]" ? search : selector === "[data-result-count]" ? count : selector === "[data-clear-filters]" ? resetFilters : null };
const context = vm.createContext({ document: { querySelector: () => root }, window: { addEventListener() {} },
  onAdminAccountChange() {}, buildDashboardCatalog, getLessonContributors, thumbnailUrl, esc: escapeHtml });
vm.runInContext(source.replace(/^import .*;\n/gm, "").replace(/^start\(\)\.catch\(showError\);$/m, ""), context);
context.fixture = { rows: [{ resource_id: "lesson-1", group_title: "테스트 <수업>", published: "TRUE", "new!": "TRUE", "단원_코드": "1", maker: "CHOI" }], unitRows: [{ "단원_코드": "1", 과목: "사회1", 대단원: "I. 세계", 중단원: "1. 세계 이해" }] };
vm.runInContext('state = fixture; selectedId = "lesson-1"; renderList();', context);
assert.match(list.innerHTML, /aria-haspopup="dialog">수정<\/button>/);
assert.doesNotMatch(source, /catalog-workspace|is-editing/);
assert.doesNotMatch(list.innerHTML, /data-selected=/, "Unit chips and selected rows have different selectors");
assert.match(list.innerHTML, /테스트 &lt;수업&gt;/);
assert.match(list.innerHTML, /catalog-row__units[\s\S]*1\. 세계 이해/);
assert.match(list.innerHTML, /data-lesson-flag="published"[^>]+checked/);
assert.match(list.innerHTML, /data-lesson-flag="new"[^>]+checked/);
for (const [button] of list.innerHTML.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)) assert.doesNotMatch(button, /<input/, "Flag checkboxes are outside the lesson selection button");
vm.runInContext('state.rows[0].new = "FALSE"; renderList();', context);
assert.doesNotMatch(list.innerHTML, /data-lesson-flag="new"[^>]+checked/);
assert.doesNotMatch(source, /자료 유형|const choice =|data-choice=/);
assert.match(source, /catalog-subjects[\s\S]*data-subject=/);
assert.match(source, /published: latest && published\(latest\)/);
assert.match(source, /new: isNew\(latest\)/);
assert.match(source, /action: "flags"/);
assert.doesNotMatch(source, /data-units|function renderUnits/);
assert.match(source, /aria-haspopup="dialog" aria-label="\$\{esc\(subject\)\} 단원 선택"/);
{
  const originalRows = context.fixture.rows;
  context.fixture.rows = [
    { resource_id: "lesson-1", group_title: "테스트 <수업>", desc: "수요 <공급>", published: "TRUE", new: "TRUE", "단원_코드": "1", maker: "old-choi", teacher_link: "https://example.com/lesson" },
    { resource_id: "lesson-2", group_title: "경제 수업", published: "FALSE", new: "TRUE", "단원_코드": "99", contributors: [{ code: "Do", role: "활동지 기획" }], blog_link: "javascript:alert(1)" },
    { resource_id: "lesson-3", group_title: "미분류", published: "FALSE", "단원_코드": "" },
  ];
  context.fixture.unitRows.push({ "단원_코드": "99", 과목: "사회2", 대단원: "I. 경제", 중단원: "1. 경제생활" });
  vm.runInContext('members = [{ id: "CHOI", name: "최진영", aliases: ["old-choi"] }, { id: "Do", name: "이도빈" }]; renderList();', context);
  assert.doesNotMatch(list.innerHTML, /catalog-row__description|catalog-row__links/);
  assert.match(list.innerHTML, /class="catalog-row__thumbnail"/);
  assert.match(list.innerHTML, /class="chip chip--gray">최진영<\/span>/);

  assert.doesNotMatch(list.innerHTML, /javascript:/);
  assert.equal(count.textContent, "수업 3개");assert.equal(resetFilters.hidden, true);
  search.value = "최진영 세계";vm.runInContext('renderList();', context);
  assert.equal(count.textContent, "수업 1개");assert.match(list.innerHTML, /lesson-1/);assert.equal(resetFilters.hidden, false);
  search.value = "활동지 기획";vm.runInContext('renderList();', context);
  assert.match(list.innerHTML, /lesson-2/);assert.equal(count.textContent, "수업 1개");
  search.value = "";
  vm.runInContext('filter = "draft"; subjectFilter = "사회2"; makerFilter = "Do"; newOnly = true; renderList();', context);
  assert.equal(count.textContent, "수업 1개");assert.match(list.innerHTML, /lesson-2/);assert.doesNotMatch(list.innerHTML, /data-row-id="lesson-1"/);
  vm.runInContext('filter = "published"; renderList();', context);
  assert.equal(count.textContent, "수업 0개");assert.match(list.innerHTML, /조건에 맞는 수업이 없습니다/);
  vm.runInContext('filter = "all"; subjectFilter = "unassigned"; makerFilter = "unassigned"; newOnly = false; renderList();', context);
  assert.equal(count.textContent, "수업 1개");assert.match(list.innerHTML, /lesson-3/);
  vm.runInContext('subjectFilter = ""; makerFilter = "CHOI"; renderList();', context);
  assert.equal(count.textContent, "수업 1개");assert.match(list.innerHTML, /lesson-1/, "Profile aliases match the canonical creator filter");
  context.fixture.rows = originalRows;
  vm.runInContext('filter = "all"; subjectFilter = makerFilter = ""; newOnly = false; members = [];', context);
}
{
  const previousQuery = root.querySelector;
  const content = { innerHTML: "", querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] };
  root.querySelector = selector => selector === "[data-catalog-content]" ? content : previousQuery(selector);
  vm.runInContext('subjectFilter = "삭제된 과목"; makerFilter = "삭제된 제작자"; render();', context);
  assert.equal(vm.runInContext("subjectFilter", context), "");assert.equal(vm.runInContext("makerFilter", context), "", "Removing the last matching lesson clears unavailable picker choices");
  vm.runInContext('subjectFilter = "사회1"; makerFilter = "CHOI"; render();', context);
  assert.equal(vm.runInContext("subjectFilter", context), "사회1");assert.equal(vm.runInContext("makerFilter", context), "CHOI");
  vm.runInContext('subjectFilter = makerFilter = "";', context);
  root.querySelector = previousQuery;
}
console.log("Catalog cards and filters: profile names, large thumbnails, concise information, multi-word search, combined filters, missing metadata and aliases passed.");
{
  const selected = { innerHTML: "" };
  const subjectButtons = ["사회1", "사회2"].map(subject => ({ dataset: { subject }, setAttribute(_, value) { this.label = value; } }));
  let picker, focused = false;
  const pickerOpener = { isConnected: true, focus() { focused = true; } };
  root.append = element => { picker = element; };
  root.querySelector = selector => selector === "[data-selected]" ? selected : null;
  root.querySelectorAll = selector => selector === "[data-subject]" ? subjectButtons : [];
  context.adminAccountId = () => "admin";
  context.pickerOpener = pickerOpener;
  context.fixture.unitRows = [
    { "단원_코드": "1", 과목: "사회1", 대단원: "I. 세계", 중단원: "1. 세계 이해" },
    { "단원_코드": "2", 과목: "사회1", 대단원: "II. 자연", 중단원: "2. 자연 <환경>" },
    { "단원_코드": "99", 과목: "사회2", 대단원: "I. 경제", 중단원: "1. 경제생활" },
  ];
  context.document.createElement = () => {
    const nodes = Object.fromEntries(["count", "close", "cancel", "apply"].map(name => [`[data-unit-${name}]`, { addEventListener(_, fn) { this.click = fn; } }]));
    const inputs = [1, 2].map(value => ({ value: String(value), checked: value === 1, addEventListener(_, fn) { this.change = fn; } }));
    let close;
    return { nodes, inputs, setAttribute() {}, querySelector: selector => nodes[selector], querySelectorAll: () => inputs,
      addEventListener(type, fn) { if (type === "close") close = fn; }, showModal() { this.open = true; },
      close() { this.open = false;close?.(); }, remove() { this.removed = true; } };
  };
  vm.runInContext('account = "admin"; selectedSubject = "사회1"; selectedUnits = new Set([1,99]); dirty = false; openUnitPicker(pickerOpener);', context);
  assert.equal(picker.open, true);
  assert.match(picker.innerHTML, /사회1 단원 선택/);
  assert.match(picker.innerHTML, /II. 자연/);
  assert.match(picker.innerHTML, /자연 &lt;환경&gt;/);
  assert.doesNotMatch(picker.innerHTML, /경제생활/);
  picker.inputs[1].checked = true;picker.inputs[1].change();
  assert.equal(picker.nodes["[data-unit-count]"].textContent, "선택 2개");
  assert.equal(vm.runInContext("[...selectedUnits].join(',')", context), "1,99", "Draft choices do not change the form");
  assert.equal(vm.runInContext("dirty", context), false);
  picker.nodes["[data-unit-cancel]"].click();
  assert.equal(picker.removed, true);assert.equal(focused, true);
  assert.equal(vm.runInContext("[...selectedUnits].join(',')", context), "1,99");
  vm.runInContext('openUnitPicker(pickerOpener);', context);
  picker.inputs[1].checked = true;picker.inputs[1].change();picker.nodes["[data-unit-apply]"].click();
  assert.equal(vm.runInContext("[...selectedUnits].sort((a,b)=>a-b).join(',')", context), "1,2,99", "Other subjects remain selected");
  assert.equal(vm.runInContext("dirty", context), true);
  assert.match(selected.innerHTML, /사회2 · 1. 경제생활/);
  assert.deepEqual(subjectButtons.map(button => button.dataset.hasUnits), ["true", "true"]);
  assert.match(subjectButtons[0].label, /2개 선택됨/);
  vm.runInContext('dirty = false; openUnitPicker(pickerOpener);', context);
  picker.nodes["[data-unit-apply]"].click();
  assert.equal(vm.runInContext("dirty", context), false, "Applying identical choices leaves a clean form clean");
  vm.runInContext('openUnitPicker(pickerOpener);', context);
  picker.inputs[0].checked = false;picker.inputs[0].change();
  context.adminAccountId = () => "other";
  picker.nodes["[data-unit-apply]"].click();
  assert.equal(vm.runInContext("selectedUnits.has(1)", context), true, "Account changes cannot apply a stale picker");
  context.adminAccountId = () => "admin";
}
let attachedPanel, dialog, marker, openerFocused = false;
const panel = { value: "작성 중인 제목", replaceWith(node) { attachedPanel = node; } };
const opener = { isConnected: true, focus() { openerFocused = true; } };
root.append = node => { dialog = node; };
root.querySelectorAll = () => [];
root.querySelector = selector => selector === "[data-editor]" ? panel : selector === ".catalog-workspace" ? { classList: { add() {} } } : selector === "[data-catalog-message]" ? {} : { focus() {} };
context.adminAccountId = () => "admin";
context.document.createComment = () => marker = { isConnected: true, replaceWith(node) { attachedPanel = node; } };
context.document.createElement = () => {
  const listeners = {};
  return { setAttribute() {}, addEventListener(type, fn) { listeners[type] = fn; }, showModal() { this.open = true; },
    close() { this.open = false; listeners.close?.(); }, remove() {} };
};
context.opener = opener;
vm.runInContext('account = "admin"; selectedId = "lesson-1"; dirty = true; selectedUnits = new Set([1]); selectedSubject = "통합사회2"; contributors = [{code:"CHOI",role:"작성 중인 역할"}]; renderEditor = () => { selectedUnits = new Set(); selectedSubject = "사회1"; contributors = []; }; renderList = () => {}; render = () => {}; openRegistration(opener);', context);
assert.equal(dialog.open, true);
assert.equal(attachedPanel, marker);
assert.equal(vm.runInContext("selectedId", context), null);
assert.equal(vm.runInContext("dirty", context), false);
await vm.runInContext("canLeave = async () => false; closeRegistration();", context);
assert.equal(dialog.open, true, "Keep editing leaves the registration modal open");
await vm.runInContext("canLeave = async () => true; closeRegistration();", context);
assert.equal(dialog.open, false);
assert.equal(attachedPanel, panel, "Cancel reattaches the same editor and its input values");
assert.equal(panel.value, "작성 중인 제목");
assert.equal(vm.runInContext("selectedId", context), "lesson-1");
assert.equal(vm.runInContext("dirty", context), true);
assert.equal(vm.runInContext("selectedSubject", context), "통합사회2");
assert.equal(vm.runInContext("contributors[0].role", context), "작성 중인 역할");
assert.equal(vm.runInContext("[...selectedUnits][0]", context), 1);
assert.equal(openerFocused, true);
vm.runInContext('openRegistration(opener); registration.savedId = "lesson-2"; registration.dialog.close();', context);
assert.equal(vm.runInContext("selectedId", context), "lesson-1", "Creating a lesson preserves the existing unsaved editor");
assert.equal(vm.runInContext("dirty", context), true);
vm.runInContext('dirty = false; openRegistration(opener); registration.savedId = "lesson-2"; registration.dialog.close();', context);
assert.equal(vm.runInContext("selectedId", context), "lesson-1", "Saving returns to the cards without opening an inline editor");
vm.runInContext('selectedId = null; openRegistration(opener, "lesson-1");', context);
assert.equal(vm.runInContext("selectedId", context), "lesson-1", "Edit opens the requested lesson in the modal");
await vm.runInContext('busy = true; closeRegistration();', context);
assert.equal(dialog.open, true, "An in-flight save cannot discard the modal");
await vm.runInContext('busy = false; closeRegistration();', context);
assert.equal(vm.runInContext("selectedId", context), null, "Closing edit restores the card view");
{
  let focus = "";
  root.querySelectorAll = () => [];
  root.querySelector = selector => selector === '[data-filter][aria-pressed="true"]' || selector === "[data-new-filter]" ? { focus() { focus = selector; } } : null;
  context.adminFetch = async () => ({ ok: true, json: async () => ({ state: context.fixture }) });
  context.flagInput = { dataset: { flagId: "lesson-1", lessonFlag: "published" }, checked: false };
  await vm.runInContext('saveFlag(flagInput);', context);
  assert.equal(focus, '[data-filter][aria-pressed="true"]', "A row hidden by a saved publication change returns focus to the active filter");
  context.flagInput.dataset.lessonFlag = "new";
  await vm.runInContext('saveFlag(flagInput);', context);
  assert.equal(focus, "[data-new-filter]", "A row hidden by removing its new flag returns focus to the new-only control");
}
{
  let confirmation, writes = [];
  context.document.createElement = () => {
    let close;
    return { setAttribute() {}, showModal() {}, remove() {}, addEventListener(type, fn) { if (type === "close") close = fn; }, close() { close(); } };
  };
  root.append = element => { confirmation = element; };
  vm.runInContext('account = "admin"; selectedId = "lesson-1"; registration = {}; dirty = true; busy = false;', context);
  context.captureDelete = input => { writes.push(input); };
  vm.runInContext('write = captureDelete;', context);
  const cancelled = vm.runInContext('deleteLesson();', context);
  assert.match(confirmation.innerHTML, /테스트 &lt;수업&gt;/);
  assert.match(confirmation.innerHTML, /저장하지 않은 수정 내용/);
  confirmation.returnValue = "cancel";confirmation.close();await cancelled;assert.equal(writes.length, 0);
  const confirmed = vm.runInContext('deleteLesson();', context);
  confirmation.returnValue = "delete";confirmation.close();await confirmed;
  assert.equal(writes.length, 1);assert.equal(writes[0].id, "lesson-1");assert.equal(writes[0].action, "delete");
  const stale = vm.runInContext('deleteLesson();', context);
  context.adminAccountId = () => "other";confirmation.returnValue = "delete";confirmation.close();await stale;
  assert.equal(writes.length, 1, "A stale account cannot confirm deletion");
  context.adminAccountId = () => "admin";
}
console.log("Lesson admin controls: separate list checkboxes, legacy flags, subject buttons and stale form flag protection passed.");
console.log("Registration modal: close cancellation, draft preservation, focus, edit selection and busy close protection passed.");
console.log("Unit picker: subject grouping, draft cancellation, apply, cross-subject preservation, unchanged choices and account isolation passed.");
{
  let timeout, finish;
  const toast = { innerHTML: "", querySelector: () => ({ addEventListener(_, fn) { toast.dismiss = fn; } }), replaceChildren() { this.innerHTML = ""; } };
  const status = { textContent: "" };
  const toastRoot = { querySelector: selector => selector === "[data-save-toast]" ? toast : selector === "[data-catalog-message]" ? status : selector === ".catalog-workspace" ? { classList: { add() {} } } : null, querySelectorAll: () => [] };
  const saveContext = vm.createContext({ document: { querySelector: () => toastRoot }, window: { addEventListener() {} }, onAdminAccountChange() {},
    esc: escapeHtml, adminAccountId: () => "admin", clearTimeout() {}, setTimeout(fn) { timeout = fn;return 1; },
    adminFetch: () => new Promise(resolve => { finish = resolve; }) });
  vm.runInContext(source.replace(/^import .*;\n/gm, "").replace(/^start\(\)\.catch\(showError\);$/m, ""), saveContext);
  vm.runInContext('account = "admin"; dirty = true; render = () => {};', saveContext);
  const pending = vm.runInContext('write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  assert.equal(toast.innerHTML, "", "No success notification before storage confirms the save");
  finish({ ok: true, json: async () => ({ state: { rows: [{ resource_id: "lesson-1" }] } }) });await pending;
  assert.match(toast.innerHTML, /toast--success/);assert.match(toast.innerHTML, /저장했습니다\./);
  assert.equal(vm.runInContext("dirty", saveContext), false);
  timeout();assert.equal(toast.innerHTML, "", "Notifications dismiss automatically");
  const delayed = vm.runInContext('dirty = true; write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  finish({ ok: true, json: async () => ({ state: { rows: [{ resource_id: "lesson-1" }] }, warning: "저장은 완료됐지만 공개 목록 갱신이 지연되고 있습니다." }) });await delayed;
  assert.match(toast.innerHTML, /목록 갱신이 지연/);
  assert.match(status.textContent, /목록 갱신이 지연/);
  assert.equal(vm.runInContext("dirty", saveContext), false, "A cache purge failure does not mark a persisted lesson unsaved");
  timeout();
  vm.runInContext('registration = { savedId: null, dialog: { close() { registration.closed = true; registration.busyAtClose = busy; } } };', saveContext);
  const failed = vm.runInContext('dirty = true; write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  finish({ ok: false, json: async () => ({ error: "저장 실패 <내용>" }) });await failed;
  assert.match(toast.innerHTML, /toast--error/);assert.match(toast.innerHTML, /저장 실패 &lt;내용&gt;/);
  assert.doesNotMatch(toast.innerHTML, /저장했습니다/);assert.equal(vm.runInContext("dirty", saveContext), true);
  toast.dismiss();assert.equal(toast.innerHTML, "");
  assert.equal(vm.runInContext("registration.closed", saveContext), undefined, "Failed saves keep the editor open");
  const modalSave = vm.runInContext('write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  finish({ ok: true, json: async () => ({ state: { rows: [{ resource_id: "lesson-1" }] } }) });await modalSave;
  assert.equal(vm.runInContext("registration.savedId", saveContext), "lesson-1");
  assert.equal(vm.runInContext("registration.closed", saveContext), true, "Only confirmed saves close the editor");
  assert.equal(vm.runInContext("registration.busyAtClose", saveContext), false, "Restore focus to an enabled button after saving");
  toast.dismiss();

  vm.runInContext('registration = { dialog: { close() { registration.closed = true; } } }; dirty = true;', saveContext);
  const failedDelete = vm.runInContext('write({ action: "delete", id: "lesson-1" });', saveContext);
  finish({ ok: false, json: async () => ({ error: "다른 관리자가 목록을 수정했습니다." }) });await failedDelete;
  assert.equal(vm.runInContext("registration.closed", saveContext), undefined);
  assert.equal(vm.runInContext("dirty", saveContext), true, "Delete failure preserves the editor draft");
  const deleted = vm.runInContext('write({ action: "delete", id: "lesson-1" });', saveContext);
  finish({ ok: true, json: async () => ({ state: { rows: [] } }) });await deleted;
  assert.equal(vm.runInContext("registration.deleted", saveContext), true);
  assert.equal(vm.runInContext("registration.closed", saveContext), true);
  assert.match(toast.innerHTML, /수업을 삭제했습니다/);toast.dismiss();
  const stale = vm.runInContext('write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  saveContext.adminAccountId = () => "other";
  finish({ ok: true, json: async () => ({ state: {} }) });await stale;
  assert.equal(toast.innerHTML, "", "A response from the previous account cannot show a success notification");
}
console.log("Save notifications: confirmed success, failure, escaping, dismissal and account isolation passed.");
