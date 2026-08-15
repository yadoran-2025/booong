import { escapeHtml } from "./utils.js";
import { loadMembers } from "./member-data.js";

const root = document.getElementById("connect-root");

const state = {
  index: null,
  membersData: null,
  originalJson: "",
  selectedMemberId: "",
  query: "",
};

init();

async function init() {
  root.innerHTML = renderLoading();
  try {
    const [indexRes, members] = await Promise.all([
      fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" }),
      loadMembers(),
    ]);
    if (!indexRes.ok) throw new Error(`lessons/index.json ${indexRes.status}`);
    state.index = await indexRes.json();
    state.membersData = { members };
    normalizeMembersData();
    state.originalJson = getOutputJson();
    state.selectedMemberId = state.membersData.members?.[0]?.id || "";
    render();
  } catch (err) {
    root.innerHTML = renderError(err);
  }
}

function render() {
  const members = getMembers();
  const works = getWorks();
  const selectedMember = members.find(member => member.id === state.selectedMemberId) || members[0] || null;
  if (selectedMember && selectedMember.id !== state.selectedMemberId) state.selectedMemberId = selectedMember.id;
  const linkedCount = getLinkedWorkCount(members);
  const selectedCount = selectedMember ? getMemberWorks(selectedMember).filter(work => findWork(work.type, work.id)).length : 0;

  root.innerHTML = `
    <main class="connect">
      <header class="connect__topbar">
        <div class="connect__hero">
          <a class="connect__back" href="index.html">대시보드로 돌아가기</a>
          <p class="connect__eyebrow">BOOONG Admin</p>
          <h1 class="connect__title">제작자 연결 편집기</h1>
          <p class="connect__intro">사람을 선택한 뒤, 그 사람이 만든 수업과 게임을 체크하세요. 변경된 members.json만 다운로드하면 반영됩니다.</p>
        </div>
        <div class="connect__actions">
          <span class="connect__dirty ${hasChanges() ? "is-dirty" : ""}">${hasChanges() ? "변동사항 있음" : "변동사항 없음"}</span>
          <button class="btn" type="button" data-action="copy-json">members.json 복사</button>
          <button class="btn btn--primary" type="button" data-action="download-json">members.json 다운로드</button>
        </div>
      </header>

      <section class="connect__summary" aria-label="연결 현황">
        <div class="connect-stat">
          <span class="connect-stat__label">Creators</span>
          <strong>${members.length}</strong>
        </div>
        <div class="connect-stat">
          <span class="connect-stat__label">Works</span>
          <strong>${works.length}</strong>
        </div>
        <div class="connect-stat">
          <span class="connect-stat__label">Linked</span>
          <strong>${linkedCount}</strong>
        </div>
        <div class="connect-stat connect-stat--accent">
          <span class="connect-stat__label">Selected</span>
          <strong>${selectedCount}</strong>
        </div>
      </section>

      ${renderWarnings(members, works)}

      <div class="connect__layout">
        <aside class="connect-panel connect-members">
          <div class="connect-panel__head">
            <h2>members.json</h2>
            <span>${members.length}명</span>
          </div>
          <div class="connect-members__list">
            ${members.map(member => renderMemberButton(member, works)).join("") || `<p class="connect-empty">등록된 제작자가 없습니다.</p>`}
          </div>
        </aside>

        <section class="connect-panel connect-works">
          <div class="connect-panel__head">
            <div>
              <h2>${selectedMember ? escapeHtml(selectedMember.name) : "제작자 없음"}</h2>
              <p>${selectedMember ? `${selectedCount}개 자료 연결됨 · ${escapeHtml(selectedMember.interests || "관심사 미등록")}` : "members 배열에 제작자를 먼저 추가하세요."}</p>
            </div>
            <input class="connect-search" type="search" value="${escapeAttr(state.query)}" placeholder="자료 검색" data-action="search">
          </div>
          ${selectedMember ? renderWorkList(selectedMember, works) : `<p class="connect-empty">연결할 제작자를 선택할 수 없습니다.</p>`}
        </section>

        <aside class="connect-panel connect-output">
          <div class="connect-panel__head">
            <h2>변경된 members.json</h2>
          </div>
          <textarea class="connect-output__textarea" readonly spellcheck="false">${escapeHtml(getOutputJson())}</textarea>
        </aside>
      </div>
    </main>
  `;

  bindEvents();
}

function bindEvents() {
  root.querySelectorAll("[data-member-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedMemberId = button.dataset.memberId;
      render();
    });
  });

  root.querySelectorAll("[data-work-key]").forEach(input => {
    input.addEventListener("change", () => {
      setMemberForWork(input.dataset.workType, input.dataset.workId, state.selectedMemberId, input.checked);
      render();
    });
  });

  root.querySelector("[data-action='search']")?.addEventListener("input", event => {
    state.query = event.target.value;
    render();
  });

  root.querySelector("[data-action='copy-json']")?.addEventListener("click", copyJson);
  root.querySelector("[data-action='download-json']")?.addEventListener("click", downloadJson);

  root.querySelector("[data-action='remove-missing']")?.addEventListener("click", () => {
    removeMissingWorks();
    render();
  });
}

function renderMemberButton(member, works) {
  const count = getMemberWorks(member).filter(work => findWork(work.type, work.id)).length;
  return `
    <button class="connect-member ${member.id === state.selectedMemberId ? "is-active" : ""}" type="button" data-member-id="${escapeAttr(member.id)}">
      <span class="connect-member__avatar">${renderAvatar(member)}</span>
      <span class="connect-member__body">
        <strong>${escapeHtml(member.name || member.id)}</strong>
        <span>${escapeHtml(member.interests || "관심사 미등록")}</span>
      </span>
      <span class="connect-member__count">${count}</span>
    </button>
  `;
}

function renderWorkList(member, works) {
  const filtered = filterWorks(works);
  const grouped = groupWorks(filtered);
  if (!filtered.length) return `<p class="connect-empty">검색 결과가 없습니다.</p>`;

  return Object.entries(grouped).map(([label, items]) => `
    <div class="connect-work-group">
      <h3>${escapeHtml(label)}</h3>
      <div class="connect-work-group__items">
        ${items.map(work => renderWorkCheckbox(work, member)).join("")}
      </div>
    </div>
  `).join("");
}

function renderWorkCheckbox(work, member) {
  const checked = hasMemberWork(member, work.type, work.id);
  return `
    <label class="connect-work">
      <input type="checkbox" data-work-key="${escapeAttr(work.key)}" data-work-type="${escapeAttr(work.type)}" data-work-id="${escapeAttr(work.id)}" ${checked ? "checked" : ""}>
      <span class="connect-work__body">
        <span class="connect-work__title">${escapeHtml(work.label ? `${work.label}: ${work.title}` : work.title)}</span>
        <span class="connect-work__meta">${escapeHtml(work.groupTitle)}</span>
      </span>
    </label>
  `;
}

function renderWarnings(members, works) {
  const missingWorks = getMissingWorks(members);
  if (!missingWorks.length) return "";
  return `
    <section class="connect-warning">
      <div>
        <strong>찾을 수 없는 자료 연결이 있습니다.</strong>
        <p>${escapeHtml(missingWorks.map(work => `${work.type}:${work.id}`).join(", "))}가 members.json에 있지만 index.json 자료 목록에는 없습니다.</p>
      </div>
      <button class="btn btn--sm" type="button" data-action="remove-missing">없는 자료 연결 제거</button>
    </section>
  `;
}

function getMembers() {
  return Array.isArray(state.membersData?.members) ? state.membersData.members : [];
}

function getWorks() {
  const groups = Array.isArray(state.index?.groups) ? state.index.groups : [];
  const games = Array.isArray(state.index?.games) ? state.index.games : [];
  const lessons = groups.flatMap(group => (group.lessons || []).map(lesson => ({
    type: "lesson",
    key: `lesson:${lesson.id}`,
    id: lesson.id,
    label: lesson.label,
    title: lesson.title,
    groupTitle: stripHtml(group.title),
  })));
  const gameWorks = games.map(game => ({
    type: "game",
    key: `game:${game.id}`,
    id: game.id,
    label: game.tag || "게임",
    title: game.title,
    groupTitle: "게임",
  }));
  return [...lessons, ...gameWorks];
}

function setMemberForWork(type, id, memberId, shouldHaveMember) {
  const member = getMembers().find(item => item.id === memberId);
  if (!member) return;
  const works = getMemberWorks(member);
  if (shouldHaveMember && !hasMemberWork(member, type, id)) works.push({ type, id });
  if (!shouldHaveMember) {
    const idx = works.findIndex(work => work.type === type && work.id === id);
    if (idx >= 0) works.splice(idx, 1);
  }
  member.works = works;
}

function filterWorks(works) {
  const query = state.query.trim().toLowerCase();
  if (!query) return works;
  return works.filter(work => [work.title, work.label, work.groupTitle, work.id].join(" ").toLowerCase().includes(query));
}

function groupWorks(works) {
  return works.reduce((acc, work) => {
    const key = work.type === "game" ? "게임" : work.groupTitle;
    if (!acc[key]) acc[key] = [];
    acc[key].push(work);
    return acc;
  }, {});
}

function renderAvatar(member) {
  if (member.avatar) return `<img src="${escapeAttr(member.avatar)}" alt="">`;
  const compact = String(member.name || member.id || "").replace(/\s+/g, "");
  return escapeHtml(compact.slice(0, 2) || "?");
}

function getOutputJson() {
  return JSON.stringify(state.membersData, null, 2);
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(getOutputJson());
    toast("JSON을 복사했습니다.");
  } catch {
    root.querySelector(".connect-output__textarea")?.select();
    document.execCommand("copy");
    toast("JSON을 복사했습니다.");
  }
}

function downloadJson() {
  const blob = new Blob([getOutputJson()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "members.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderLoading() {
  return `<main class="connect"><p class="connect-empty">데이터를 불러오는 중입니다.</p></main>`;
}

function renderError(err) {
  return `
    <main class="connect">
      <a class="connect__back" href="index.html">대시보드로 돌아가기</a>
      <section class="connect-warning">
        <div>
          <strong>데이터를 불러오지 못했습니다.</strong>
          <p>${escapeHtml(err.message)}</p>
        </div>
      </section>
    </main>
  `;
}

function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? ""));
}

function normalizeMembersData() {
  if (!state.membersData || typeof state.membersData !== "object") state.membersData = { members: [] };
  if (!Array.isArray(state.membersData.members)) state.membersData.members = [];
  state.membersData.members.forEach(member => {
    if (!Array.isArray(member.works)) member.works = [];
    member.works = member.works
      .filter(work => work && (work.type === "lesson" || work.type === "game") && work.id)
      .map(work => ({ type: work.type, id: String(work.id) }));
  });
}

function getMemberWorks(member) {
  if (!Array.isArray(member.works)) member.works = [];
  return member.works;
}

function hasMemberWork(member, type, id) {
  return getMemberWorks(member).some(work => work.type === type && work.id === id);
}

function findWork(type, id) {
  return getWorks().find(work => work.type === type && work.id === id);
}

function getMissingWorks(members) {
  const known = new Set(getWorks().map(work => `${work.type}:${work.id}`));
  return members.flatMap(member => getMemberWorks(member)).filter(work => !known.has(`${work.type}:${work.id}`));
}

function removeMissingWorks() {
  const known = new Set(getWorks().map(work => `${work.type}:${work.id}`));
  getMembers().forEach(member => {
    member.works = getMemberWorks(member).filter(work => known.has(`${work.type}:${work.id}`));
  });
}

function hasChanges() {
  return getOutputJson() !== state.originalJson;
}

function getLinkedWorkCount(members) {
  return members.reduce((total, member) => {
    return total + getMemberWorks(member).filter(work => findWork(work.type, work.id)).length;
  }, 0);
}
