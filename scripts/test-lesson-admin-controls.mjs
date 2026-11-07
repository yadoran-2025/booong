import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildDashboardCatalog } from "../js/dashboard-data.js";
import { getLessonContributors } from "../js/lesson-contributors.js";
import { thumbnailUrl } from "../js/thumbnail-data.js";
import { escapeHtml } from "../js/utils.js";

const source = await readFile(new URL("../js/lesson-admin.js", import.meta.url), "utf8");
const list = { innerHTML: "" }, search = { value: "" };
const root = { querySelector: selector => selector === "[data-list]" ? list : selector === "[data-search]" ? search : null };
const context = vm.createContext({ document: { querySelector: () => root }, window: { addEventListener() {} },
  onAdminAccountChange() {}, buildDashboardCatalog, getLessonContributors, thumbnailUrl, esc: escapeHtml });
vm.runInContext(source.replace(/^import .*;\n/gm, "").replace(/^start\(\)\.catch\(showError\);$/m, ""), context);
context.fixture = { rows: [{ resource_id: "lesson-1", group_title: "테스트 <수업>", published: "TRUE", "new!": "TRUE", "단원_코드": "1", maker: "CHOI" }], unitRows: [{ "단원_코드": "1", 과목: "사회1", 대단원: "I. 세계", 중단원: "1. 세계 이해" }] };
vm.runInContext('state = fixture; selectedId = "lesson-1"; renderList();', context);
assert.match(list.innerHTML, /data-row-selected="true"/);
assert.doesNotMatch(list.innerHTML, /data-selected=/, "Unit chips and selected rows have different selectors");
assert.match(list.innerHTML, /테스트 &lt;수업&gt;/);
assert.match(list.innerHTML, /data-lesson-flag="published"[^>]+checked/);
assert.match(list.innerHTML, /data-lesson-flag="new"[^>]+checked/);
for (const [button] of list.innerHTML.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)) assert.doesNotMatch(button, /<input/, "Flag checkboxes are outside the lesson selection button");
vm.runInContext('state.rows[0].new = "FALSE"; renderList();', context);
assert.doesNotMatch(list.innerHTML, /data-lesson-flag="new"[^>]+checked/);
assert.doesNotMatch(source, /<select|자료 유형|const choice =|data-choice=/);
assert.match(source, /catalog-subjects[\s\S]*data-subject=/);
assert.match(source, /published: latest && published\(latest\)/);
assert.match(source, /new: isNew\(latest\)/);
assert.match(source, /action: "flags"/);
assert.doesNotMatch(source, /data-units|function renderUnits/);
assert.match(source, /aria-haspopup="dialog" aria-label="\$\{esc\(subject\)\} 단원 선택"/);
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
root.querySelector = selector => selector === "[data-editor]" ? panel : selector === ".catalog-workspace" ? { classList: { add() {} } } : selector === "[data-catalog-message]" ? {} : { focus() {} };
context.adminAccountId = () => "admin";
context.document.createComment = () => marker = { isConnected: true, replaceWith(node) { attachedPanel = node; } };
context.document.createElement = () => {
  const listeners = {};
  return { setAttribute() {}, addEventListener(type, fn) { listeners[type] = fn; }, showModal() { this.open = true; },
    close() { this.open = false; listeners.close?.(); }, remove() {} };
};
context.opener = opener;
vm.runInContext('account = "admin"; selectedId = "lesson-1"; dirty = true; selectedUnits = new Set([1]); selectedSubject = "통합사회2"; contributors = [{code:"CHOI",role:"작성 중인 역할"}]; renderEditor = () => { selectedUnits = new Set(); selectedSubject = "사회1"; contributors = []; }; renderList = () => {}; openRegistration(opener);', context);
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
vm.runInContext('openRegistration(opener); registration.createdId = "lesson-2"; registration.dialog.close();', context);
assert.equal(vm.runInContext("selectedId", context), "lesson-1", "Creating a lesson preserves the existing unsaved editor");
assert.equal(vm.runInContext("dirty", context), true);
vm.runInContext('dirty = false; openRegistration(opener); registration.createdId = "lesson-2"; registration.dialog.close();', context);
assert.equal(vm.runInContext("selectedId", context), "lesson-2", "Without an unsaved draft the newly created lesson is selected");
console.log("Lesson admin controls: separate list checkboxes, legacy flags, subject buttons and stale form flag protection passed.");
console.log("Registration modal: close cancellation, original DOM/draft restoration, focus and successful creation selection passed.");
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
  const failed = vm.runInContext('dirty = true; write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  finish({ ok: false, json: async () => ({ error: "저장 실패 <내용>" }) });await failed;
  assert.match(toast.innerHTML, /toast--error/);assert.match(toast.innerHTML, /저장 실패 &lt;내용&gt;/);
  assert.doesNotMatch(toast.innerHTML, /저장했습니다/);assert.equal(vm.runInContext("dirty", saveContext), true);
  toast.dismiss();assert.equal(toast.innerHTML, "");
  const stale = vm.runInContext('write({ action: "save", lesson: { resource_id: "lesson-1" } });', saveContext);
  saveContext.adminAccountId = () => "other";
  finish({ ok: true, json: async () => ({ state: {} }) });await stale;
  assert.equal(toast.innerHTML, "", "A response from the previous account cannot show a success notification");
}
console.log("Save notifications: confirmed success, failure, escaping, dismissal and account isolation passed.");
