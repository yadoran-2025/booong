import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { escapeHtml } from "./utils.js";
import { validateNoticeInput } from "./notices.js";

const root = document.querySelector("#admin-root");

async function start() {
  const response = await requireAdmin(root, "/api/notices?admin=1");
  if (!response) return;
  let notices = (await response.json()).notices;
  if (!Array.isArray(notices)) throw new Error("Invalid notice response");
  const account = adminAccountId();
  let editing = null, busy = false;
  root.innerHTML = `<div class="admin-shell">
    <nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="admin.html">BOOONG <small>OPERATIONS</small></a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav>
    <header class="admin-home__hero"><div><p class="analytics__eyebrow">수업 준비실의 새로운 소식</p><h1>공지 관리<span>.</span></h1><p>제목과 내용을 입력하면 수업 목록의 공지 바에 게시됩니다.</p></div><a class="btn btn--secondary" href="index.html#lesson-library">수업 목록 보기 ↗</a></header>
    <div class="notice-manager">
      <section class="notice-editor" aria-labelledby="notice-editor-title">
        <header><h2 id="notice-editor-title">새 공지 등록</h2><button class="btn btn--ghost" type="button" data-new-notice>새 공지</button></header>
        <form data-notice-form>
          <label class="field"><span class="field__label">제목</span><input class="field__input" name="title" maxlength="120" required placeholder="공지 제목을 입력하세요"></label>
          <label class="field"><span class="field__label">내용</span><textarea class="field__input" name="body" rows="8" maxlength="5000" required placeholder="공지 내용을 입력하세요"></textarea></label>
          <label class="field"><span class="field__label">링크 <small>선택</small></span><input class="field__input" name="link" type="url" maxlength="2000" placeholder="https://"></label>
          <p class="notice-manager__status" data-notice-status role="status" aria-live="polite"></p>
          <button class="btn btn--primary" type="submit" data-notice-submit>등록하고 게시하기</button>
        </form>
      </section>
      <section class="notice-manager__list" aria-labelledby="notice-list-title"><h2 id="notice-list-title">등록된 공지</h2><p>최신 등록순으로 표시됩니다. 내린 공지는 다시 게시할 수 있습니다.</p><div data-notice-list></div></section>
    </div>
  </div>`;
  const form = root.querySelector("[data-notice-form]");
  const status = root.querySelector("[data-notice-status]");
  const list = root.querySelector("[data-notice-list]");
  const heading = root.querySelector("#notice-editor-title");
  const submit = root.querySelector("[data-notice-submit]");

  function setBusy(value) {
    busy = value;
    root.querySelectorAll("button, input, textarea").forEach(element => { element.disabled = value || adminAccountId() !== account; });
  }
  onAdminAccountChange(id => {
    if (id !== account) { setBusy(false); status.textContent = "로그인 계정이 변경되었습니다. 입력한 내용은 보존됩니다. 새로고침 후 권한을 다시 확인해주세요."; }
  });

  function renderList() {
    list.innerHTML = notices.length ? notices.map(notice => `<article class="notice-manager__item">
      <div class="notice-manager__meta"><span>${notice.published ? "게시 중" : "내려둠"}</span><time datetime="${escapeHtml(notice.created_at)}">${escapeHtml(new Date(notice.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }))}</time></div>
      <h3>${escapeHtml(notice.title)}</h3><p>${escapeHtml(notice.body)}</p>
      <div class="notice-manager__actions"><button class="btn btn--secondary" type="button" data-edit-notice="${escapeHtml(notice.id)}">수정</button><button class="btn btn--ghost" type="button" data-publish-notice="${escapeHtml(notice.id)}">${notice.published ? "내리기" : "다시 게시"}</button></div>
    </article>`).join("") : '<p class="analytics__empty">등록된 공지가 없습니다.</p>';
  }

  function resetEditor() {
    editing = null;
    form.reset();
    heading.textContent = "새 공지 등록";
    submit.textContent = "등록하고 게시하기";
  }

  async function save(value, existing = null, fromForm = false) {
    if (busy || adminAccountId() !== account) return;
    setBusy(true);
    status.textContent = "저장하고 있습니다…";
    try {
      const response = await adminFetch("/api/notices", {
        method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, ...(existing ? { id: existing.id, updated_at: existing.updated_at } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "다른 곳에서 이 공지를 수정했습니다. 입력한 내용을 복사한 뒤 새로고침해주세요."
        : [401, 403].includes(response.status) ? "운영자 권한을 다시 확인해주세요. 입력한 내용은 보존됩니다."
        : "저장하지 못했습니다. 입력한 내용을 확인하고 다시 시도해주세요.");
      if (adminAccountId() !== account) throw new Error("계정이 변경되었습니다. 새로고침해 저장 결과를 확인해주세요.");
      if (!result.notice?.id) throw new Error("저장 결과를 확인하지 못했습니다. 새로고침해 확인해주세요.");
      notices = existing ? notices.map(notice => notice.id === existing.id ? result.notice : notice) : [result.notice, ...notices];
      renderList();
      if (fromForm) resetEditor();
      else if (editing?.id === existing?.id) editing = result.notice;
      status.textContent = result.notice.published ? "저장했습니다. 수업 목록에서 공지를 확인할 수 있습니다." : "공지를 내렸습니다. 다시 게시할 수 있습니다.";
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  }

  root.querySelector("[data-new-notice]").addEventListener("click", () => { resetEditor(); status.textContent = ""; form.elements.title.focus(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      const value = validateNoticeInput(Object.fromEntries(new FormData(form)));
      save({ ...value, published: editing ? editing.published : true }, editing, true);
    } catch (error) { status.textContent = error.message; }
  });
  list.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-notice]");
    const publish = event.target.closest("[data-publish-notice]");
    if (busy || (!edit && !publish) || adminAccountId() !== account) return;
    const notice = notices.find(item => item.id === (edit?.dataset.editNotice || publish.dataset.publishNotice));
    if (!notice) return;
    if (edit) {
      editing = notice;
      for (const name of ["title", "body", "link"]) form.elements[name].value = notice[name];
      heading.textContent = "공지 수정";
      submit.textContent = "수정 내용 저장";
      status.textContent = notice.published ? "저장하면 게시 중인 공지에 반영됩니다." : "내려둔 공지입니다. 저장 후 ‘다시 게시’를 누르면 공개됩니다.";
      form.elements.title.focus();
    } else save({ title: notice.title, body: notice.body, link: notice.link, published: !notice.published }, notice);
  });
  renderList();
}

start().catch(() => { root.innerHTML = '<p class="analytics__empty" role="alert">공지 관리 화면을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</p>'; });
