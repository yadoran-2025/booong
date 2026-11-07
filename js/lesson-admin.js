import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { buildDashboardCatalog } from "./dashboard-data.js";
import { thumbnailUrl } from "./thumbnail-data.js";
import { readThumbnailRecords, saveThumbnail, openThumbnailEditor } from "./thumbnail-editor.js";
import { escapeHtml as esc } from "./utils.js";
import { loadMembers } from "./member-data.js";
import { getLessonContributors } from "./lesson-contributors.js";

const root = document.querySelector("#admin-root");
let state, thumbnails = {}, account, epoch = 0, busy = false, dirty = false, selectedId, filter = "all";
let selectedUnits = new Set(), thumbnailEditor, selectedSubject;
let members = [], contributors = [];
let registration, saveToastTimer;
const published = row => ["true", "1", "yes", "y", "공개"].includes(String(row.published).toLowerCase());
const isNew = row => ["true", "1", "yes", "y", "new", "checked", "check", "on", "o", "예", "네", "체크"].includes(String(row?.new ?? row?.["new!"] ?? row?.new_flag ?? row?.is_new ?? "").trim().toLowerCase());
const codes = row => String(row["단원_코드"] || "").split(/[,;\n]+/).filter(x => x.trim()).map(Number);
const resourceFor = row => buildDashboardCatalog([{ ...row, published: "TRUE" }], state.unitRows).resources[0];
const active = () => account === adminAccountId();
const message = value => { const target = root.querySelector("[data-registration-status]") || root.querySelector("[data-catalog-message]"); if (target) target.textContent = value; };

function showSaveToast(text, type = "success") {
  const target = root.querySelector("[data-save-toast]");
  if (!target) return;
  clearTimeout(saveToastTimer);
  target.innerHTML = `<div class="toast toast--${type}"><span class="toast__icon" aria-hidden="true">${type === "success" ? "✓" : "!"}</span><span class="toast__msg">${esc(text)}</span><button class="toast__close" type="button" aria-label="저장 알림 닫기">×</button></div>`;
  target.querySelector("button").addEventListener("click", () => { clearTimeout(saveToastTimer); target.replaceChildren(); });
  saveToastTimer = setTimeout(() => target.replaceChildren(), 5000);
}

function setBusy(value) {
  busy = value;
  root.querySelectorAll("button, input, select, textarea").forEach(element => { element.disabled = value || !active(); });
}

function frame() {
  root.innerHTML = `<div class="admin-shell"><nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="admin.html">BOOONG</a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav>
    <header class="admin-home__hero"><div><h1>수업 관리<span>.</span></h1></div><a class="btn btn--secondary" href="index.html#lesson-library">수업 목록 보기 ↗</a></header>
    <p class="catalog-message" role="status" aria-live="polite" data-catalog-message></p><div data-catalog-content></div></div><div class="toast-container catalog-save-toast" data-save-toast role="status" aria-live="polite" aria-atomic="true"></div>`;
}

function render() {
  const content = root.querySelector("[data-catalog-content]");
  if (!state) {
    content.innerHTML = `<section class="catalog-import"><h2>기존 수업부터 가져오세요</h2><p>구글 시트의 수업과 단원표를 가져옵니다. 이후에는 이 화면에서 수정하며, 기존 시트는 변경하지 않습니다.</p><button class="btn btn--primary" type="button" data-import>구글 시트 가져오기</button></section>`;
    content.querySelector("[data-import]").addEventListener("click", () => write({ action: "import", revision: null }));
    return;
  }
  content.innerHTML = `<div class="catalog-toolbar"><input class="field__input" type="search" aria-label="수업 검색" placeholder="수업 제목·과목·제작자로 찾기" data-search><div class="catalog-choice" role="group" aria-label="공개 여부 필터">${[["all", "전체"], ["published", "공개"], ["draft", "비공개"]].map(([key, label]) => `<button class="btn btn--secondary" type="button" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join("")}</div><button class="btn btn--ghost" type="button" data-refresh aria-label="목록 새로고침" title="새로고침"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 5v6h-6M4 19v-6h6M5.6 7A8 8 0 0 1 19.4 9M4.6 15A8 8 0 0 0 18.4 17"/></svg></button><button class="btn btn--primary" type="button" data-new>수업 등록</button></div>
    <div class="catalog-workspace"><nav class="catalog-list" aria-label="수업 목록" data-list></nav><section class="catalog-editor" aria-label="수업 편집" data-editor></section></div>`;
  content.querySelector("[data-search]").addEventListener("input", renderList);
  content.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    content.querySelectorAll("[data-filter]").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.filter === filter)));
    renderList();
  }));
  content.querySelector("[data-new]").addEventListener("click", event => openRegistration(event.currentTarget));
  content.querySelector("[data-refresh]").addEventListener("click", async () => { if (await canLeave()) start().catch(showError); });
  content.querySelector("[data-list]").addEventListener("click", event => {
    const button = event.target.closest("[data-lesson]");
    if (button) selectLesson(button.dataset.lesson);
  });
  content.querySelector("[data-list]").addEventListener("change", event => {
    const input = event.target.closest("[data-lesson-flag]");
    if (input) saveFlag(input);
  });
  if (!state.rows.some(row => row.resource_id === selectedId)) selectedId = state.rows[0]?.resource_id || null;
  renderList(); renderEditor();
}

function renderList() {
  const query = root.querySelector("[data-search]").value.trim().normalize("NFKC").toLowerCase();
  const rows = state.rows.filter(row => {
    if (filter === "published" && !published(row) || filter === "draft" && published(row)) return false;
    const item = resourceFor(row);
    return `${row.group_title} ${row.maker} ${item?.subjects.join(" ")} ${getLessonContributors(row).map(person => person.role).join(" ")}`.normalize("NFKC").toLowerCase().includes(query);
  });
  root.querySelector("[data-list]").innerHTML = rows.map(row => {
    const item = resourceFor(row);
    return `<article class="catalog-row" data-row-selected="${selectedId === row.resource_id}" data-row-id="${esc(row.resource_id)}">
      <button type="button" class="catalog-row__open" data-lesson="${esc(row.resource_id)}" aria-current="${selectedId === row.resource_id}" title="${esc(row.group_title)}"><img src="${esc(thumbnailUrl(item, thumbnails[row.resource_id]))}" alt="" loading="lazy"><div><strong class="catalog-row__title">${esc(row.group_title)}</strong>${item?.subjects.length ? `<span class="catalog-row__subjects">${esc(item.subjects.join(" · "))}</span>` : ""}</div></button>
      <div class="catalog-row__flags" role="group" aria-label="${esc(row.group_title)} 표시 설정">${[["published", "공개", published(row)], ["new", "신규", isNew(row)]].map(([field, label, checked]) => `<label><input type="checkbox" data-lesson-flag="${field}" data-flag-id="${esc(row.resource_id)}" aria-label="${esc(row.group_title)} ${label}"${checked ? " checked" : ""}>${label}</label>`).join("")}</div>
      <p class="catalog-message" data-flag-status role="status"></p></article>`;
  }).join("") || '<p class="catalog-message">조건에 맞는 수업이 없습니다.</p>';
}

async function saveFlag(input) {
  if (busy || !active()) return;
  const run = epoch, id = input.dataset.flagId, field = input.dataset.lessonFlag;
  setBusy(true);
  let status = "";
  try {
    const response = await adminFetch("/api/lesson-catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "flags", revision: state.revision, id, field, value: input.checked }) });
    const result = await response.json();
    if (run !== epoch || !active()) return;
    if (!response.ok) throw new Error(result.error || "표시 설정을 저장하지 못했습니다.");
    state = result.state;
    message(`${field === "published" ? "공개 여부" : "신규 표시"}를 저장했습니다.`);
  } catch (error) { if (run === epoch && active()) status = error.message; }
  finally {
    if (run === epoch && active()) {
      renderList(); setBusy(false);
      const row = [...root.querySelectorAll("[data-row-id]")].find(row => row.dataset.rowId === id);
      if (row) {
        row.querySelector("[data-flag-status]").textContent = status;
        row.querySelector(`[data-lesson-flag="${field}"]`).focus();
      }
      if (status) message(status);
    }
  }
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

function openRegistration(opener) {
  if (busy || registration || !active()) return;
  const run = epoch;
  const previous = { selectedId, selectedUnits, selectedSubject, contributors, dirty };
  const panel = root.querySelector("[data-editor]");
  const marker = document.createComment("lesson editor");
  panel.replaceWith(marker);
  const dialog = document.createElement("dialog");
  dialog.className = "catalog-registration";
  dialog.setAttribute("aria-labelledby", "catalog-registration-title");
  dialog.innerHTML = '<section class="catalog-editor" data-editor></section>';
  const entry = registration = { dialog, previous, createdId: null };
  root.append(dialog);
  selectedId = null; dirty = false;
  renderEditor();
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeRegistration(); });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (registration === entry) registration = null;
    if (run !== epoch || !active() || !marker.isConnected) return;
    ({ selectedId, selectedUnits, selectedSubject, contributors, dirty } = previous);
    marker.replaceWith(panel);
    if (entry.createdId && !previous.dirty) {
      selectedId = entry.createdId;
      renderEditor();
      root.querySelector(".catalog-workspace").classList.add("is-editing");
    }
    renderList();
    if (entry.createdId) message("새 수업을 비공개로 등록했습니다.");
    if (entry.createdId && !previous.dirty) root.querySelector('[name="group_title"]').focus();
    else if (opener.isConnected) opener.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  root.querySelector('[name="group_title"]').focus();
}

async function closeRegistration() {
  const entry = registration;
  if (busy || !entry) return;
  if (await canLeave() && registration === entry) entry.dialog.close();
}

const field = (row, name, label, max, type = "text") => `<div class="field"><label class="field__label" for="lesson-${name}">${label}</label><input class="field__input" id="lesson-${name}" name="${name}" type="${type}" maxlength="${max}" value="${esc(row[name] || "")}"${name === "group_title" ? " required" : ""}></div>`;
function renderEditor() {
  const row = state.rows.find(row => row.resource_id === selectedId) || { kind: "lesson", published: "FALSE", new: "FALSE" };
  selectedUnits = new Set(codes(row));
  contributors = getLessonContributors(row, members);
  const subjectNames = [...new Set(state.unitRows.map(unit => unit["과목"]).filter(Boolean))];
  selectedSubject = state.unitRows.find(unit => selectedUnits.has(Number(unit["단원_코드"])))?.["과목"] || subjectNames[0];
  root.querySelector("[data-editor]").innerHTML = `<header><h2${registration ? ' id="catalog-registration-title"' : ""}>${registration ? "수업 등록" : selectedId ? "수업 편집" : "새 수업"}</h2>${registration ? '<button class="btn btn--ghost btn--round-lg" type="button" data-registration-close aria-label="수업 등록 닫기">×</button>' : '<button class="btn btn--ghost catalog-back" type="button" data-back>← 목록</button>'}</header>
    <form><div class="catalog-form-body">${field(row, "group_title", "수업 제목", 200)}<section class="catalog-thumbnail" aria-label="썸네일" data-lesson-thumbnail></section><div class="field"><label class="field__label" for="lesson-desc">수업 소개</label><textarea class="field__input" id="lesson-desc" name="desc" maxlength="10000" rows="4">${esc(row.desc || "")}</textarea></div>
    <fieldset class="field catalog-contributors"><legend>제작자 · 맡은 일</legend><div class="catalog-contributor-chips" role="group" aria-label="제작자 선택" data-contributor-chips></div><div class="catalog-contributor-roles" data-contributor-roles></div></fieldset>
    ${field(row, "discipline", "분야", 100)}
    <fieldset class="field"><legend>과목·단원</legend><div class="catalog-choice catalog-subjects" role="group" aria-label="과목 선택">${subjectNames.map(subject => `<button class="btn btn--secondary" type="button" data-subject="${esc(subject)}" aria-haspopup="dialog" aria-label="${esc(subject)} 단원 선택">${esc(subject)}</button>`).join("")}</div><div class="catalog-selected" data-selected></div></fieldset>
    <div class="catalog-links">${field(row, "blog_link", "수업 소개 링크", 2000)}${field(row, "teacher_link", "교사용 자료 링크", 2000)}${field(row, "dorms_link", "도름스 링크", 2000)}</div></div>
    <footer class="catalog-form-footer">${registration ? '<p class="catalog-message" role="status" aria-live="polite" data-registration-status></p>' : ""}<button class="btn ${registration ? "btn--ghost" : "btn--secondary"}" type="button" data-reset>${registration ? "취소" : "수정 취소"}</button><button class="btn btn--primary" type="submit">${registration ? "수업 등록" : "저장"}</button></footer></form>`;
  const form = root.querySelector("[data-editor] form");
  form.addEventListener("input", () => { dirty = true; });
  form.querySelectorAll("[data-subject]").forEach(button => button.addEventListener("click", () => {
    selectedSubject = button.dataset.subject;
    openUnitPicker(button);
  }));
  form.querySelector("[data-reset]").addEventListener("click", async () => {
    if (registration) return closeRegistration();
    if (await canLeave() && active()) { dirty = false; renderEditor(); message(""); }
  });
  root.querySelector("[data-registration-close]")?.addEventListener("click", closeRegistration);
  root.querySelector("[data-back]")?.addEventListener("click", async () => {
    if (await canLeave() && active()) { dirty = false; root.querySelector(".catalog-workspace").classList.remove("is-editing"); renderEditor(); }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const latest = state.rows.find(item => item.resource_id === selectedId);
    const lesson = { ...row, ...data, resource_id: selectedId || "", contributors, maker: contributors.map(person => person.code).join(", "),
      kind: latest?.kind === "game" ? "game" : "lesson", published: latest && published(latest) ? "TRUE" : "FALSE", new: isNew(latest) ? "TRUE" : "FALSE",
      "단원_코드": [...selectedUnits].join(","), school: row.school || "", "단원명": row["단원명"] || "", thumbnail_url: row.thumbnail_url || "", thumbnail_alt: row.thumbnail_alt || "" };
    write({ action: "save", revision: state.revision, lesson });
  });
  renderSelected(); renderThumbnail(); renderContributors();
}

function renderContributors() {
  const original = getLessonContributors(state.rows.find(row => row.resource_id === selectedId), members);
  const choices = [...members, ...original.filter(person => !members.some(member => member.id.toLowerCase() === person.code.toLowerCase())).map(person => ({ id: person.code, name: "" }))];
  root.querySelector("[data-contributor-chips]").innerHTML = choices.map(member => {
    const selected = contributors.some(person => person.code.toLowerCase() === member.id.toLowerCase());
    return `<button class="btn btn--secondary catalog-contributor-chip" type="button" data-contributor="${esc(member.id)}" aria-pressed="${selected}"><strong>${selected ? "✓ " : ""}${esc(member.id)}</strong>${member.name ? `<span>${esc(member.name)}</span>` : ""}</button>`;
  }).join("");
  root.querySelector("[data-contributor-roles]").innerHTML = contributors.map(person => `<label class="catalog-contributor-role"><span class="chip chip--gray">${esc(person.code)}</span><span class="sr-only">${esc(person.code)} 맡은 일</span><input class="field__input" type="text" maxlength="200" aria-label="${esc(person.code)} 맡은 일" data-contributor-role="${esc(person.code)}" value="${esc(person.role)}" placeholder="예: 수업 기획, 활동지 제작"></label>`).join("");
  root.querySelectorAll("[data-contributor]").forEach(button => button.addEventListener("click", () => {
    const code = button.dataset.contributor;
    const index = contributors.findIndex(person => person.code.toLowerCase() === code.toLowerCase());
    if (index < 0) contributors.push({ code, role: "" }); else contributors.splice(index, 1);
    dirty = true; renderContributors();
    root.querySelectorAll("[data-contributor]").forEach(item => { if (item.dataset.contributor === code) item.focus(); });
  }));
  root.querySelectorAll("[data-contributor-role]").forEach(input => input.addEventListener("input", () => {
    contributors.find(person => person.code === input.dataset.contributorRole).role = input.value;
    dirty = true;
  }));
}

function renderThumbnail() {
  const section = root.querySelector("[data-lesson-thumbnail]");
  if (!selectedId) {
    if (registration) { section.hidden = true; return; }
    section.innerHTML = '<h3>썸네일</h3><p class="catalog-message">수업을 저장하면 이미지를 추가할 수 있습니다.</p>';
    return;
  }
  const row = state.rows.find(row => row.resource_id === selectedId), item = resourceFor(row);
  section.innerHTML = `<h3>썸네일</h3><div class="catalog-thumbnail__body"><img src="${esc(thumbnailUrl(item, thumbnails[item.id]))}" alt="${esc(item.title)} 썸네일" width="800" height="500"><div class="catalog-actions"><button class="btn btn--secondary" type="button" data-edit-lesson-thumbnail>이미지 수정</button>${thumbnails[item.id] ? '<button class="btn btn--ghost" type="button" data-restore-lesson-thumbnail>이전 이미지로 복원</button>' : ""}</div></div><p class="catalog-message" role="status" aria-live="polite" data-lesson-thumbnail-status></p>`;
  section.querySelector("img").addEventListener("error", event => { event.target.src = "/assets/lesson-thumbnails/social-studies-default-v1.jpg"; }, { once: true });
  section.querySelector("[data-edit-lesson-thumbnail]").addEventListener("click", event => {
    if (busy || !active()) return;
    const form = root.querySelector("[data-editor] form");
    const draft = resourceFor({ ...row, ...Object.fromEntries(new FormData(form)), contributors, "단원_코드": [...selectedUnits].join(",") });
    thumbnailEditor = openThumbnailEditor({ root, item: draft || item, record: thumbnails[item.id], account, opener: event.currentTarget,
      onSaved(record) {
        thumbnails[item.id] = record; renderThumbnail(); renderList();
        root.querySelector("[data-lesson-thumbnail-status]").textContent = "썸네일을 저장했습니다.";
      },
      onRefreshed(records) { thumbnails = records; renderThumbnail(); renderList(); },
      onClose() { thumbnailEditor = null; root.querySelector("[data-edit-lesson-thumbnail]")?.focus(); },
    });
  });
  section.querySelector("[data-restore-lesson-thumbnail]")?.addEventListener("click", async () => {
    if (busy || !active()) return;
    const run = epoch;
    setBusy(true);
    try {
      const record = await saveThumbnail(item.id, null, true, thumbnails[item.id]?.revision || null, account);
      if (run !== epoch || !active()) return;
      thumbnails[item.id] = record; renderThumbnail(); renderList();
      root.querySelector("[data-lesson-thumbnail-status]").textContent = "이전 이미지로 복원했습니다.";
    } catch (error) {
      if (run !== epoch || !active()) return;
      if (error.status === 409) {
        try { thumbnails = await readThumbnailRecords(account); if (run !== epoch || !active()) return; renderThumbnail(); renderList(); }
        catch { /* Keep the existing image and report the original conflict. */ }
      }
      if (run === epoch && active()) root.querySelector("[data-lesson-thumbnail-status]").textContent = error.message;
    } finally { if (run === epoch) setBusy(false); }
  });
}

function unitLabel(unit) {
  return [unit["중단원"], unit["소단원"]].filter(Boolean).join(" · ") || unit["대단원"];
}
function openUnitPicker(opener) {
  if (busy || !active()) return;
  const run = epoch;
  const draft = new Set(selectedUnits);
  const units = state.unitRows.filter(unit => unit["과목"] === selectedSubject);
  const majors = [...new Set(units.map(unit => unit["대단원"]))];
  const dialog = document.createElement("dialog");
  dialog.className = "catalog-unit-picker";
  dialog.setAttribute("aria-labelledby", "catalog-unit-picker-title");
  dialog.innerHTML = `<header><h2 id="catalog-unit-picker-title">${esc(selectedSubject)} 단원 선택</h2><button class="btn btn--ghost btn--round-lg" type="button" data-unit-close aria-label="단원 선택 닫기">×</button></header>
    <div class="catalog-unit-grid">${majors.map((major, index) => `<section class="catalog-unit-group" role="group" aria-labelledby="catalog-unit-major-${index}"><h3 id="catalog-unit-major-${index}">${esc(major)}</h3>${units.filter(unit => unit["대단원"] === major).map(unit => `<label class="catalog-checkbox"><input type="checkbox" value="${esc(unit["단원_코드"])}" data-unit-code${draft.has(Number(unit["단원_코드"])) ? " checked" : ""}><span>${esc(unitLabel(unit))}</span></label>`).join("")}</section>`).join("") || '<p>등록된 단원이 없습니다.</p>'}</div>
    <footer><span data-unit-count role="status" aria-live="polite"></span><button class="btn btn--secondary" type="button" data-unit-cancel>취소</button><button class="btn btn--primary" type="button" data-unit-apply>선택 적용</button></footer>`;
  root.append(dialog);
  const updateCount = () => { dialog.querySelector("[data-unit-count]").textContent = `선택 ${units.filter(unit => draft.has(Number(unit["단원_코드"]))).length}개`; };
  dialog.querySelectorAll("[data-unit-code]").forEach(input => input.addEventListener("change", () => {
    const code = Number(input.value);
    if (input.checked) draft.add(code); else draft.delete(code);
    updateCount();
  }));
  dialog.querySelector("[data-unit-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-unit-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-unit-apply]").addEventListener("click", () => {
    if (run !== epoch || !active()) return dialog.close();
    if (draft.size !== selectedUnits.size || [...draft].some(code => !selectedUnits.has(code))) {
      selectedUnits = draft; dirty = true; renderSelected();
    }
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (run === epoch && active() && opener.isConnected) opener.focus({ preventScroll: true });
  }, { once: true });
  updateCount();
  dialog.showModal();
}
function renderSelected() {
  root.querySelectorAll("[data-subject]").forEach(button => {
    const count = state.unitRows.filter(unit => unit["과목"] === button.dataset.subject && selectedUnits.has(Number(unit["단원_코드"]))).length;
    button.dataset.hasUnits = String(count > 0);
    button.setAttribute("aria-label", `${button.dataset.subject} 단원 선택${count ? `, ${count}개 선택됨` : ""}`);
  });
  root.querySelector("[data-selected]").innerHTML = [...selectedUnits].map(code => {
    const unit = state.unitRows.find(unit => Number(unit["단원_코드"]) === code);
    const label = unit ? `${unit["과목"]} · ${unitLabel(unit)}` : String(code);
    return `<button class="btn btn--secondary" type="button" data-remove-unit="${code}" aria-label="${esc(label)} 선택 해제">${esc(label)} ×</button>`;
  }).join("");
  root.querySelectorAll("[data-remove-unit]").forEach(button => button.addEventListener("click", () => {
    selectedUnits.delete(Number(button.dataset.removeUnit)); dirty = true; renderSelected();
  }));
}

async function write(input) {
  if (busy || !active()) return;
  const run = epoch;
  clearTimeout(saveToastTimer); root.querySelector("[data-save-toast]")?.replaceChildren();
  setBusy(true); message(input.action === "import" ? "수업과 단원표를 가져오고 있습니다…" : "저장하고 있습니다…");
  try {
    const response = await adminFetch("/api/lesson-catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const result = await response.json();
    if (run !== epoch || !active()) return;
    if (!response.ok) throw new Error(result.error || "저장하지 못했습니다. 다시 시도해주세요.");
    state = result.state; dirty = false;
    if (input.action === "save") showSaveToast(input.lesson.resource_id ? "저장했습니다." : "수업을 등록했습니다.");
    if (input.action === "save" && !input.lesson.resource_id && registration) {
      registration.createdId = state.rows.at(-1).resource_id;
      registration.dialog.close();
      return;
    }
    if (input.action === "save" && !input.lesson.resource_id) selectedId = state.rows.at(-1).resource_id;
    render();
    if (input.action === "save") root.querySelector(".catalog-workspace").classList.add("is-editing");
    message(input.action === "import" ? `${state.rows.length}개 수업을 가져왔습니다.` : "저장했습니다. 수업 목록에는 약 1분 안에 반영됩니다.");
  } catch (error) { if (run === epoch && active()) { message(error.message); showSaveToast(error.message, "error"); } }
  finally { if (run === epoch) setBusy(false); }
}

async function start() {
  const run = ++epoch;
  const response = await requireAdmin(root, "/api/lesson-catalog?admin=1");
  if (!response || run !== epoch) return;
  account = adminAccountId();
  const result = await response.json();
  const [images, people] = await Promise.all([readThumbnailRecords(account), loadMembers()]);
  if (run !== epoch || !active()) return;
  state = result.state; thumbnails = images; members = people; dirty = false; busy = false;
  frame(); render();
}
function showError() {
  root.innerHTML = '<p class="analytics__empty" role="alert">수업 목록을 불러오지 못했습니다. <button class="btn btn--secondary" type="button">다시 시도</button></p>';
  root.querySelector("button").addEventListener("click", () => start().catch(showError));
}
onAdminAccountChange(id => {
  if (account === undefined || id === account) return;
  epoch++; thumbnailEditor?.close(); root.querySelectorAll("dialog").forEach(dialog => dialog.close()); state = undefined; thumbnails = {}; contributors = []; members = []; dirty = false; account = id; root.replaceChildren(); start().catch(showError);
});
window.addEventListener("beforeunload", event => { if (dirty || registration?.previous.dirty) { event.preventDefault(); event.returnValue = ""; } });
start().catch(showError);
