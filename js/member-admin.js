import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from "./admin.js";
import { MEMBER_PROFILE_FIELD_LIMITS, MEMBER_FEATURED_WORK_LIMIT, memberFeaturedWorks, validateMemberProfileInput } from "./member-data.js";
import { createWorkMap, createMakerWorkMap, loadDashboardConfig } from "./dashboard-data.js";
import { loadManagedThumbnails, thumbnailUrl } from "./thumbnail-data.js";
import { escapeHtml } from "./utils.js";

const root = document.querySelector("#admin-root");
const labels = { name: "이름", interests: "관심 분야", bio: "캐치프레이즈", career: "경력" };

async function start() {
  const response = await requireAdmin(root, "/api/members?admin=1");
  if (!response) return;
  const account = adminAccountId();
  let state = await response.json(), selected = state.members?.[0]?.id, busy = false;
  const [config, thumbnails] = await Promise.all([loadDashboardConfig().catch(() => null), loadManagedThumbnails().catch(() => ({}))]);
  if (adminAccountId() !== account) throw new Error("Account changed");
  if (!Array.isArray(state.members) || typeof state.revision !== "string") throw new Error("Invalid profiles");
  root.innerHTML = `<div class="admin-shell">
    <nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="admin.html">BOOONG <small>OPERATIONS</small></a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav>
    <header class="admin-home__hero"><h1>프로필 관리<span>.</span></h1><a class="btn btn--secondary" href="about.html" target="_blank" rel="noopener noreferrer">소개 페이지 보기 ↗</a></header>
    <div class="member-manager">
      <div class="member-picker" role="group" aria-label="수정할 구성원">${state.members.map(member => `<button class="btn btn--secondary" type="button" data-member="${escapeHtml(member.id)}" aria-pressed="false">${escapeHtml(member.name)}</button>`).join("")}</div>
      ${state.members.length ? `<section class="member-editor" aria-labelledby="member-editor-title">
        <header class="member-editor__header"><h2 id="member-editor-title">프로필 수정</h2><span class="member-code" data-member-code aria-label="구성원 코드"></span></header>
        <form data-member-form>
          <input type="hidden" name="id">
          <div class="member-editor__layout">
          <div class="member-fields">
            ${Object.entries(labels).map(([name, label]) => `<label class="field"><span class="field__label">${label}</span>${name === "name"
              ? `<input class="field__input" name="${name}" maxlength="${MEMBER_PROFILE_FIELD_LIMITS[name]}"${name === "name" ? " required" : ""}>`
              : `<textarea class="field__input" name="${name}" maxlength="${MEMBER_PROFILE_FIELD_LIMITS[name]}" rows="${name === "interests" ? 2 : name === "bio" ? 3 : 4}"${name === "career" ? ' placeholder="한 줄에 하나씩 입력"' : ""}></textarea>`}</label>`).join("")}
          </div>
          <fieldset class="member-featured"><legend>대표 콘텐츠 <span>선택 순서대로 최대 3개</span></legend><div class="member-featured__choices" data-featured-choices></div></fieldset>
          </div>
          <div class="member-actions"><p class="notice-manager__status" data-member-status role="status" aria-live="polite"></p><button class="btn btn--ghost" type="button" data-member-reset>변경 취소</button><button class="btn btn--primary" type="submit">수정 내용 저장</button></div>
        </form>
      </section>` : '<p class="analytics__empty">등록된 프로필이 없습니다.</p>'}
    </div>
  </div>`;
  if (!state.members.length) return;
  const form = root.querySelector("[data-member-form]");
  const status = root.querySelector("[data-member-status]");
  const current = () => state.members.find(member => member.id === selected);
  const resources = new Map((config?.catalog?.resources || []).map(resource => [resource.id, resource]));
  let makerWorks, featuredIds = [];
  const candidates = () => makerWorks.get(selected.toLowerCase()) || [];
  const workId = work => `${work.type}:${work.id}`;
  const savedFeaturedIds = () => memberFeaturedWorks(current(), candidates()).map(workId);
  const text = value => Array.isArray(value) ? value.join("\n") : value || "";
  const dirty = () => Object.keys(labels).some(name => form.elements[name].value !== text(current()[name]))
    || (config && JSON.stringify(featuredIds) !== JSON.stringify(savedFeaturedIds()));
  function renderFeaturedChoices() {
    const choices = root.querySelector('[data-featured-choices]');
    choices.innerHTML = !config ? '<p role="alert">자료 목록을 불러오지 못했습니다. 기존 대표 콘텐츠는 유지됩니다. 새로고침 후 다시 선택해주세요.</p>'
      : candidates().map(work => {
        const id = workId(work), order = featuredIds.indexOf(id);
        return `<button type="button" class="member-featured__choice" data-featured-id="${escapeHtml(id)}" aria-pressed="${order >= 0}"><img src="${escapeHtml(thumbnailUrl(resources.get(work.id) || { id: work.id }, thumbnails[work.id]))}" alt="" loading="lazy" width="240" height="150"><span>${escapeHtml(work.title)}</span><b aria-label="선택 순서">${order >= 0 ? order + 1 : '+'}</b></button>`;
      }).join('') || '<p>등록된 제작 자료가 없습니다.</p>';
  }
  function updateFeaturedSelection() {
    root.querySelectorAll('[data-featured-id]').forEach(button => {
      const order = featuredIds.indexOf(button.dataset.featuredId);
      button.setAttribute('aria-pressed', String(order >= 0));
      button.querySelector('b').textContent = order >= 0 ? order + 1 : '+';
    });
  }
  function setBusy(value) {
    busy = value;
    root.querySelectorAll("button, input, textarea").forEach(element => { element.disabled = value || adminAccountId() !== account; });
  }
  function fill() {
    makerWorks = createMakerWorkMap(createWorkMap(config?.groups || [], config?.games || [], config?.catalog?.resources || []), state.members);
    featuredIds = savedFeaturedIds();
    renderFeaturedChoices();
    for (const name of ["id", ...Object.keys(labels)]) form.elements[name].value = text(current()[name]);
    root.querySelector("#member-editor-title").textContent = current().name;
    root.querySelector('[data-member-code]').textContent = current().id;
    root.querySelectorAll("[data-member]").forEach(button => {
      const active = button.dataset.member === selected;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("btn--primary", active);
      button.classList.toggle("btn--secondary", !active);
    });
    status.textContent = "";
  }
  onAdminAccountChange(id => {
    if (id !== account) {
      setBusy(false);
      status.textContent = "로그인 계정이 변경되었습니다. 입력한 내용을 복사한 뒤 새로고침해주세요.";
    }
  });
  root.querySelectorAll("[data-member]").forEach(button => button.addEventListener("click", () => {
    if (busy || adminAccountId() !== account || selected === button.dataset.member) return;
    if (dirty() && !window.confirm("저장하지 않은 변경 내용을 버리고 다른 프로필을 여시겠어요?")) return;
    selected = button.dataset.member;
    fill();
    form.elements.name.focus();
  }));
  root.querySelector("[data-member-reset]").addEventListener("click", () => { if (!busy && adminAccountId() === account) fill(); });
  root.querySelector('[data-featured-choices]').addEventListener('click', event => {
    const button = event.target.closest('[data-featured-id]');
    if (!button || busy || adminAccountId() !== account) return;
    const id = button.dataset.featuredId;
    if (featuredIds.includes(id)) featuredIds = featuredIds.filter(value => value !== id);
    else if (featuredIds.length < MEMBER_FEATURED_WORK_LIMIT) featuredIds.push(id);
    else { status.textContent = '대표 콘텐츠는 최대 3개까지 선택할 수 있습니다. 먼저 선택한 자료를 해제해주세요.';return; }
    status.textContent = '';
    updateFeaturedSelection();
  });
  window.addEventListener("beforeunload", event => { if (busy || dirty()) { event.preventDefault(); event.returnValue = ""; } });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || adminAccountId() !== account) return;
    const member = Object.fromEntries(new FormData(form));
    if (config) member.featuredWorkIds = [...featuredIds];
    try { validateMemberProfileInput(member); } catch (error) { status.textContent = error.message; return; }
    setBusy(true);
    status.textContent = "저장하고 있습니다…";
    try {
      const response = await adminFetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member, revision: state.revision }) });
      const result = await response.json();
      if (adminAccountId() !== account) throw new Error("계정이 변경되었습니다. 새로고침해 저장 결과를 확인해주세요.");
      if (!response.ok) throw new Error([401, 403].includes(response.status) ? "운영자 권한을 다시 확인해주세요. 입력한 내용은 보존됩니다." : result.error || "저장하지 못했습니다. 다시 시도해주세요.");
      if (!Array.isArray(result.members) || !result.members.some(item => item.id === selected) || typeof result.revision !== "string") throw new Error("저장 결과를 확인하지 못했습니다. 새로고침해 확인해주세요.");
      state = result;
      root.querySelectorAll("[data-member]").forEach(button => { button.textContent = state.members.find(item => item.id === button.dataset.member).name; });
      fill();
      status.textContent = result.warning || "저장했습니다.";
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  });
  fill();
}

start().catch(() => { root.innerHTML = '<p class="analytics__empty" role="alert">프로필 관리 화면을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</p>'; });
