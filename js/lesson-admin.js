import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { buildDashboardCatalog } from "./dashboard-data.js";
import { thumbnailUrl, loadManagedThumbnails } from "./thumbnail-data.js";
import { escapeHtml as esc } from "./utils.js";

const root = document.querySelector("#admin-root");
let state, thumbnails = {}, account, epoch = 0, busy = false, dirty = false, selectedId, filter = "all";
let selectedUnits = new Set();
const published = row => ["true", "1", "yes", "y", "공개"].includes(String(row.published).toLowerCase());
const codes = row => String(row["단원_코드"] || "").split(/[,;\n]+/).filter(x => x.trim()).map(Number);
const resourceFor = row => buildDashboardCatalog([{ ...row, published: "TRUE" }], state.unitRows).resources[0];
const active = () => account === adminAccountId();
const message = value => { const target = root.querySelector("[data-catalog-message]"); if (target) target.textContent = value; };

function setBusy(value) {
  busy = value;
  root.querySelectorAll("button, input, select, textarea").forEach(element => { element.disabled = value || !active(); });
}

function frame() {
  root.innerHTML = `<div class="admin-shell"><nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="admin.html">BOOONG</a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav>
    <header class="admin-home__hero"><div><h1>수업 관리<span>.</span></h1></div><a class="btn btn--secondary" href="index.html#lesson-library">수업 목록 보기 ↗</a></header>
    <p class="catalog-message" role="status" aria-live="polite" data-catalog-message></p><div data-catalog-content></div></div>`;
}

function render() {
  const content = root.querySelector("[data-catalog-content]");
  if (!state) {
    content.innerHTML = `<section class="catalog-import"><h2>기존 수업부터 가져오세요</h2><p>구글 시트의 수업과 단원표를 가져옵니다. 이후에는 이 화면에서 수정하며, 기존 시트는 변경하지 않습니다.</p><button class="btn btn--primary" type="button" data-import>구글 시트 가져오기</button></section>`;
    content.querySelector("[data-import]").addEventListener("click", () => write({ action: "import", revision: null }));
    return;
  }
  content.innerHTML = `<div class="catalog-toolbar"><input class="field__input" type="search" aria-label="수업 검색" placeholder="수업 제목·과목·제작자로 찾기" data-search><div class="catalog-choice" role="group" aria-label="공개 여부 필터">${[["all", "전체"], ["published", "공개"], ["draft", "비공개"]].map(([key, label]) => `<button class="btn btn--secondary" type="button" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join("")}</div><button class="btn btn--ghost" type="button" data-refresh>새로고침</button><button class="btn btn--primary" type="button" data-new>수업 등록</button></div>
    <div class="catalog-workspace"><nav class="catalog-list" aria-label="수업 목록" data-list></nav><section class="catalog-editor" aria-label="수업 편집" data-editor></section></div>`;
  content.querySelector("[data-search]").addEventListener("input", renderList);
  content.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    content.querySelectorAll("[data-filter]").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.filter === filter)));
    renderList();
  }));
  content.querySelector("[data-new]").addEventListener("click", () => selectLesson(null));
  content.querySelector("[data-refresh]").addEventListener("click", async () => { if (await canLeave()) start().catch(showError); });
  content.querySelector("[data-list]").addEventListener("click", event => {
    const button = event.target.closest("[data-lesson]");
    if (button) selectLesson(button.dataset.lesson);
  });
  if (!state.rows.some(row => row.resource_id === selectedId)) selectedId = state.rows[0]?.resource_id || null;
  renderList(); renderEditor();
}

function renderList() {
  const query = root.querySelector("[data-search]").value.trim().normalize("NFKC").toLowerCase();
  const rows = state.rows.filter(row => {
    if (filter === "published" && !published(row) || filter === "draft" && published(row)) return false;
    const item = resourceFor(row);
    return `${row.group_title} ${row.maker} ${item?.subjects.join(" ")}`.normalize("NFKC").toLowerCase().includes(query);
  });
  root.querySelector("[data-list]").innerHTML = rows.map(row => {
    const item = resourceFor(row);
    return `<button type="button" class="catalog-row" data-lesson="${esc(row.resource_id)}" aria-current="${selectedId === row.resource_id}"><img src="${esc(thumbnailUrl(item, thumbnails[row.resource_id]))}" alt="" loading="lazy"><div><strong>${esc(row.group_title)}</strong><span>${published(row) ? "공개" : "비공개"}${item?.subjects.length ? ` · ${esc(item.subjects.join(" · "))}` : ""}</span></div></button>`;
  }).join("") || '<p class="catalog-message">조건에 맞는 수업이 없습니다.</p>';
}

async function canLeave() {
  if (!dirty) return true;
  const dialog = document.createElement("dialog");
  dialog.className = "alert-dialog catalog-confirm";
  dialog.setAttribute("aria-labelledby", "catalog-confirm-title");
  dialog.innerHTML = '<h2 id="catalog-confirm-title">수정 내용을 버릴까요?</h2><p>저장하지 않은 내용은 사라집니다.</p><form method="dialog" class="catalog-actions"><button class="btn btn--secondary" value="cancel" autofocus>계속 수정</button><button class="btn btn--primary" value="discard">수정 버리고 이동</button></form>';
  root.append(dialog); dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => { const discard = dialog.returnValue === "discard"; dialog.remove(); resolve(discard); }, { once: true }));
}
async function selectLesson(id) {
  if (busy || !active() || !await canLeave() || !active()) return;
  selectedId = id; dirty = false; message("");
  renderList(); renderEditor();
  root.querySelector(".catalog-workspace").classList.add("is-editing");
  root.querySelector('[name="group_title"]').focus();
}

const field = (row, name, label, max, type = "text") => `<div class="field"><label class="field__label" for="lesson-${name}">${label}</label><input class="field__input" id="lesson-${name}" name="${name}" type="${type}" maxlength="${max}" value="${esc(row[name] || "")}"${name === "group_title" ? " required" : ""}></div>`;
const choice = (name, label, options, value) => `<fieldset class="field"><legend>${label}</legend><div class="catalog-choice" role="group" aria-label="${label}">${options.map(([key, text]) => `<button class="btn btn--secondary" type="button" data-choice="${name}" data-value="${key}" aria-pressed="${value === key}">${text}</button>`).join("")}</div><input type="hidden" name="${name}" value="${value}"></fieldset>`;

function renderEditor() {
  const row = state.rows.find(row => row.resource_id === selectedId) || { kind: "lesson", published: "FALSE", new: "FALSE" };
  selectedUnits = new Set(codes(row));
  const subjectNames = [...new Set(state.unitRows.map(unit => unit["과목"]).filter(Boolean))];
  const firstSubject = state.unitRows.find(unit => selectedUnits.has(Number(unit["단원_코드"])))?.["과목"] || subjectNames[0];
  root.querySelector("[data-editor]").innerHTML = `<header><h2>${selectedId ? "수업 편집" : "새 수업"}</h2><button class="btn btn--ghost catalog-back" type="button" data-back>← 목록</button>${selectedId ? `<a class="btn btn--secondary" href="thumbnail-admin.html?lesson=${encodeURIComponent(selectedId)}">썸네일 수정 ↗</a>` : ""}</header>
    <form>${field(row, "group_title", "수업 제목", 200)}<div class="field"><label class="field__label" for="lesson-desc">수업 소개</label><textarea class="field__input" id="lesson-desc" name="desc" maxlength="10000" rows="5">${esc(row.desc || "")}</textarea></div>
    <div class="catalog-two">${field(row, "maker", "제작자", 500)}${field(row, "discipline", "분야", 100)}</div>
    <fieldset class="field"><legend>과목·단원</legend><label class="sr-only" for="lesson-subject">과목 선택</label><select class="field__input" id="lesson-subject" data-subject>${subjectNames.map(subject => `<option${subject === firstSubject ? " selected" : ""}>${esc(subject)}</option>`).join("")}</select><div class="catalog-selected" data-selected></div><div class="catalog-unit-list" data-units></div></fieldset>
    ${field(row, "blog_link", "수업 소개 링크", 2000)}${field(row, "teacher_link", "교사용 자료 링크", 2000)}${field(row, "dorms_link", "도름스 링크", 2000)}
    <div class="catalog-two">${choice("kind", "자료 유형", [["lesson", "수업"], ["game", "게임"]], row.kind === "game" ? "game" : "lesson")}${choice("published", "공개 여부", [["TRUE", "공개"], ["FALSE", "비공개"]], published(row) ? "TRUE" : "FALSE")}</div>
    ${choice("new", "신규 표시", [["TRUE", "신규로 표시"], ["FALSE", "표시 안 함"]], ["true", "1", "yes", "y", "new", "checked", "check", "on", "o", "예", "네", "체크"].includes(String(row.new ?? row["new!"] ?? row.new_flag ?? row.is_new ?? "").toLowerCase()) ? "TRUE" : "FALSE")}
    <footer class="catalog-form-footer"><button class="btn btn--secondary" type="button" data-reset>수정 취소</button><button class="btn btn--primary" type="submit">저장</button></footer></form>`;
  const form = root.querySelector("[data-editor] form");
  form.addEventListener("input", () => { dirty = true; });
  form.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => {
    form.elements[button.dataset.choice].value = button.dataset.value;
    form.querySelectorAll(`[data-choice="${button.dataset.choice}"]`).forEach(other => other.setAttribute("aria-pressed", String(other === button)));
    dirty = true;
  }));
  form.querySelector("[data-subject]").addEventListener("change", renderUnits);
  form.querySelector("[data-reset]").addEventListener("click", async () => { if (await canLeave() && active()) { dirty = false; renderEditor(); message(""); } });
  root.querySelector("[data-back]").addEventListener("click", async () => {
    if (await canLeave() && active()) { dirty = false; root.querySelector(".catalog-workspace").classList.remove("is-editing"); renderEditor(); }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const lesson = { ...row, ...data, resource_id: selectedId || "",
      "단원_코드": [...selectedUnits].join(","), school: row.school || "", "단원명": row["단원명"] || "", thumbnail_url: row.thumbnail_url || "", thumbnail_alt: row.thumbnail_alt || "" };
    write({ action: "save", revision: state.revision, lesson });
  });
  renderUnits();
}

function unitLabel(unit) {
  return [unit["중단원"], unit["소단원"]].filter(Boolean).join(" · ") || unit["대단원"];
}
function renderUnits() {
  const subject = root.querySelector("[data-subject]").value;
  const units = state.unitRows.filter(unit => unit["과목"] === subject);
  const majors = [...new Set(units.map(unit => unit["대단원"]))];
  root.querySelector("[data-units]").innerHTML = majors.map(major => `<fieldset><legend>${esc(major)}</legend>${units.filter(unit => unit["대단원"] === major).map(unit => `<label class="catalog-checkbox"><input type="checkbox" value="${esc(unit["단원_코드"])}"${selectedUnits.has(Number(unit["단원_코드"])) ? " checked" : ""}><span>${esc(unitLabel(unit))}</span></label>`).join("")}</fieldset>`).join("");
  root.querySelector("[data-units]").querySelectorAll("input").forEach(input => input.addEventListener("change", () => {
    const code = Number(input.value);
    if (input.checked) selectedUnits.add(code); else selectedUnits.delete(code);
    dirty = true; renderSelected();
  }));
  renderSelected();
}
function renderSelected() {
  root.querySelector("[data-selected]").innerHTML = [...selectedUnits].map(code => {
    const unit = state.unitRows.find(unit => Number(unit["단원_코드"]) === code);
    const label = unit ? `${unit["과목"]} · ${unitLabel(unit)}` : String(code);
    return `<button class="btn btn--secondary" type="button" data-remove-unit="${code}" aria-label="${esc(label)} 선택 해제">${esc(label)} ×</button>`;
  }).join("");
  root.querySelectorAll("[data-remove-unit]").forEach(button => button.addEventListener("click", () => {
    selectedUnits.delete(Number(button.dataset.removeUnit)); dirty = true; renderUnits();
  }));
}

async function write(input) {
  if (busy || !active()) return;
  const run = epoch;
  setBusy(true); message(input.action === "import" ? "수업과 단원표를 가져오고 있습니다…" : "저장하고 있습니다…");
  try {
    const response = await adminFetch("/api/lesson-catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json();
    if (run !== epoch || !active()) return;
    if (!response.ok) throw new Error(result.error || "저장하지 못했습니다. 다시 시도해주세요.");
    state = result.state; dirty = false;
    if (input.action === "save" && !input.lesson.resource_id) selectedId = state.rows.at(-1).resource_id;
    render();
    if (input.action === "save") root.querySelector(".catalog-workspace").classList.add("is-editing");
    message(input.action === "import" ? `${state.rows.length}개 수업을 가져왔습니다.` : "저장했습니다. 수업 목록에는 약 1분 안에 반영됩니다.");
  } catch (error) { if (run === epoch && active()) message(error.message); }
  finally { if (run === epoch) setBusy(false); }
}

async function start() {
  const run = ++epoch;
  const response = await requireAdmin(root, "/api/lesson-catalog?admin=1");
  if (!response || run !== epoch) return;
  account = adminAccountId();
  const result = await response.json();
  const images = await loadManagedThumbnails().catch(() => ({}));
  if (run !== epoch || !active()) return;
  state = result.state; thumbnails = images; dirty = false; busy = false;
  frame(); render();
}
function showError() {
  root.innerHTML = '<p class="analytics__empty" role="alert">수업 목록을 불러오지 못했습니다. <button class="btn btn--secondary" type="button">다시 시도</button></p>';
  root.querySelector("button").addEventListener("click", () => start().catch(showError));
}
onAdminAccountChange(id => {
  if (account === undefined || id === account) return;
  epoch++; root.querySelector("dialog")?.close(); state = undefined; dirty = false; account = id; root.replaceChildren(); start().catch(showError);
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
start().catch(showError);
