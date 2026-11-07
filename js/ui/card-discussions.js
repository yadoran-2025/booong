import { packIcon } from "./lesson-packs.js";
import { escapeHtml } from "../utils.js";

const MAX_COMMENTS = 100;

export async function readCardComments(resourceId, viewer = false) {
  const url = `/api/comments?resourceId=${encodeURIComponent(resourceId)}${viewer ? "&viewer=1" : ""}`;
  const response = await fetch(url, { cache: "no-store", credentials: viewer ? "same-origin" : "omit" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.comments)) throw { reason: body.reason || "temporarily_unavailable" };
  return { ...body, count: Number.isSafeInteger(body.count) ? body.count : body.comments.length };
}

export function renderCardDiscussion(resourceId, title = "수업", compact = false) {
  return `<button class="bundle-action bundle-comment-trigger" type="button" data-comment-open aria-label="${escapeHtml(`${title} 댓글 보기`)}">
    ${compact ? packIcon("comment") : "<strong>댓글</strong>"}<span data-comment-count>${compact ? "–" : "0"}</span>
  </button>
  <dialog class="bundle-discussion" data-card-discussion="${escapeHtml(resourceId)}" aria-label="${escapeHtml(`${title} 댓글`)}">
    <header class="bundle-discussion__header">
      <div><h2>댓글 <span data-discussion-count>…</span></h2><p>${escapeHtml(title)}</p></div>
      <button type="button" data-comment-close aria-label="댓글 창 닫기">×</button>
    </header>
    <div class="bundle-discussion__body">
      <div class="bundle-discussion__list" data-comment-list></div>
      <div class="bundle-discussion__composer">
        <p class="bundle-discussion__status" data-comment-status aria-live="polite"></p>
        <form class="bundle-discussion__form" data-comment-form hidden>
          <label><span data-form-label>댓글 남기기</span><textarea placeholder="이 수업에 대한 생각을 남겨주세요" maxlength="500" rows="3" required></textarea></label>
          <div class="bundle-discussion__form-actions"><small>최대 500자</small><div><button type="button" data-comment-cancel hidden>취소</button><button type="submit" data-comment-submit>댓글 등록</button></div></div>
        </form>
      </div>
    </div>
  </dialog>`;
}

export function bindCardDiscussions(root) {
  root.querySelectorAll("[data-card-discussion]").forEach(section => {
    const resourceId = section.dataset.cardDiscussion;
    const trigger = section.previousElementSibling;
    const status = section.querySelector("[data-comment-status]");
    const list = section.querySelector("[data-comment-list]");
    const form = section.querySelector("[data-comment-form]");
    const textarea = form.querySelector("textarea");
    const submit = form.querySelector("[data-comment-submit]");
    const cancel = form.querySelector("[data-comment-cancel]");
    const label = form.querySelector("[data-form-label]");
    const count = trigger.querySelector("[data-comment-count]");
    const modalCount = section.querySelector("[data-discussion-count]");
    let comments = [];
    let total = 0;
    let user = null;
    let mode = { type: "new" };
    let opened = false;

    const updateCount = value => {
      total = value;
      root.querySelectorAll("[data-card-discussion]").forEach(dialog => {
        if (dialog.dataset.cardDiscussion !== resourceId) return;
        dialog.querySelector("[data-discussion-count]").textContent = String(value);
        const button = dialog.previousElementSibling;
        button.querySelector("[data-comment-count]").textContent = String(value);
        button.setAttribute("aria-label", `${section.getAttribute("aria-label")} ${value}개 보기`);
      });
    };
    fetch(`/api/comments?resourceId=${encodeURIComponent(resourceId)}&countOnly=1`, { cache: "no-store", credentials: "omit" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !Number.isSafeInteger(body.count)) throw new Error("Count unavailable");
        if (section.isConnected && !opened) updateCount(body.count);
      }).catch(() => { if (section.isConnected && !opened) count.textContent = modalCount.textContent = "–"; });

    const resetComposer = () => {
      mode = { type: "new" };
      textarea.value = "";
      label.textContent = "댓글 남기기";
      submit.textContent = "댓글 등록";
      cancel.hidden = true;
    };

    const showError = reason => {
      form.hidden = true;
      if (reason === "authentication_required") {
        const link = document.createElement("a");
        link.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
        link.textContent = "도름스로 로그인하기 →";
        status.replaceChildren("작성하려면 로그인이 필요합니다. ", link);
      } else if (reason === "access_denied") status.textContent = "이 도름스 계정은 코멘트 작성 권한이 없습니다.";
      else {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "다시 확인";
        retry.addEventListener("click", refresh);
        status.replaceChildren("코멘트를 불러오거나 도름스 연결을 확인하지 못했습니다. ", retry);
      }
    };

    const refresh = async () => {
      form.hidden = true;
      status.textContent = "코멘트를 불러오는 중입니다…";
      try {
        const result = await readCardComments(resourceId, true);
        if (!section.isConnected) return;
        comments = result.comments;
        user = result.viewer;
        updateCount(result.count);
        resetComposer();
        renderList(list, comments, Boolean(user));
        if (!user) return showError(result.viewerError || "authentication_required");
        const logout = document.createElement("button");
        logout.type = "button";
        logout.textContent = "로그아웃";
        logout.addEventListener("click", async () => {
          logout.disabled = true;
          const response = await fetch("/api/auth/dorms/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
          if (response?.ok) location.reload();
          else { status.textContent = "로그아웃하지 못했습니다. 다시 시도해주세요."; form.hidden = true; }
        });
        const name = user.name?.trim() || "도름스 회원";
        const avatar = document.createElement("span");
        avatar.className = "bundle-discussion__avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = name.charAt(0);
        if (user.picture) {
          const image = document.createElement("img");
          image.src = user.picture;
          image.alt = "";
          image.referrerPolicy = "no-referrer";
          image.addEventListener("error", () => image.remove(), { once: true });
          avatar.append(image);
        }
        status.replaceChildren(avatar, `${name} 님으로 작성합니다. `, logout);
        form.hidden = false;
      } catch (error) {
        if (section.isConnected) { list.replaceChildren(); showError(error.reason); }
      }
    };

    trigger.addEventListener("click", () => { if (!section.open) { opened = true; section.showModal(); refresh(); } });
    section.querySelector("[data-comment-close]").addEventListener("click", () => section.close());
    cancel.addEventListener("click", resetComposer);
    list.addEventListener("click", async event => {
      const button = event.target.closest("button[data-comment-action]");
      if (!button || !user) return;
      const item = comments.find(comment => comment.id === button.closest("[data-comment-id]")?.dataset.commentId);
      if (!item || item.deleted) return;
      if (button.dataset.commentAction === "reply") {
        mode = { type: "reply", parentId: item.parentId || item.id };
        textarea.value = item.parentId ? `@${item.name} ` : "";
        label.textContent = `${item.name} 님에게 답글`;
        submit.textContent = "답글 등록";
        cancel.hidden = false;
        textarea.focus();
      } else if (item.mine && button.dataset.commentAction === "edit") {
        mode = { type: "edit", commentId: item.id };
        textarea.value = item.text;
        label.textContent = "댓글 수정";
        submit.textContent = "수정 저장";
        cancel.hidden = false;
        textarea.focus();
      } else if (item.mine && button.dataset.commentAction === "delete" && confirm("이 댓글을 삭제할까요?")) {
        button.disabled = true;
        try {
          const updated = await writeComment("DELETE", { resourceId, commentId: item.id });
          comments = comments.map(comment => comment.id === updated.id ? updated : comment);
          updateCount(total - 1);
          renderList(list, comments, true);
          if (mode.commentId === item.id) resetComposer();
        } catch (error) {
          if (error.reason === "not_found") await refresh();
          else showError(error.reason);
        } finally { button.disabled = false; }
      }
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text || text.length > 500) return;
      submit.disabled = true;
      try {
        const edited = mode.type === "edit";
        const updated = await writeComment(edited ? "PATCH" : "POST", {
          resourceId, text,
          ...(edited ? { commentId: mode.commentId } : mode.type === "reply" ? { parentId: mode.parentId } : {}),
        });
        comments = edited ? comments.map(comment => comment.id === updated.id ? updated : comment) : [updated, ...comments].slice(0, MAX_COMMENTS);
        if (!edited) updateCount(total + 1);
        renderList(list, comments, true);
        resetComposer();
      } catch (error) {
        if (error.reason === "not_found" || error.reason === "invalid_parent") await refresh();
        else showError(error.reason);
      } finally { submit.disabled = false; }
    });
  });
}

async function writeComment(method, input) {
  const response = await fetch("/api/comments", {
    method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.comment) throw { reason: body.reason || "temporarily_unavailable" };
  return body.comment;
}

export function renderList(list, comments, canWrite = false) {
  const activeParents = new Set(comments.filter(item => item.parentId && !item.deleted).map(item => item.parentId));
  const shown = comments.filter(item => !item.deleted || activeParents.has(item.id));
  const ids = new Set(shown.map(item => item.id));
  // ponytail: only 100 comments load; group with a Map if this limit grows.
  const markup = shown.filter(item => !item.parentId || !ids.has(item.parentId)).map(parent => [parent, ...shown.filter(item => item.parentId === parent.id).reverse()]
    .map(item => `<article class="bundle-discussion__item${item.parentId ? " bundle-discussion__item--reply" : ""}" data-comment-id="${escapeHtml(item.id)}">
      <span class="bundle-discussion__avatar" aria-hidden="true">${item.deleted ? "×" : `${escapeHtml(item.name.charAt(0))}${item.picture ? `<img src="${escapeHtml(item.picture)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}`}</span>
      <div><div class="bundle-discussion__meta"><strong>${escapeHtml(item.name)}</strong><time>${new Date(item.createdAt).toLocaleString("ko-KR")}</time>${item.editedAt ? "<small>수정됨</small>" : ""}</div>
      <p>${item.deleted ? "삭제된 댓글입니다." : escapeHtml(item.text)}</p>
      ${canWrite && !item.deleted ? `<div class="bundle-discussion__actions">${!item.parentId || !shown.find(root => root.id === item.parentId)?.deleted ? '<button type="button" data-comment-action="reply">답글</button>' : ""}${item.mine ? '<button type="button" data-comment-action="edit">수정</button><button type="button" data-comment-action="delete">삭제</button>' : ""}</div>` : ""}</div>
    </article>`).join("")).join("");
  list.innerHTML = markup || '<div class="bundle-discussion__empty"><strong>아직 댓글이 없어요</strong><p>이 수업에 대한 첫 의견을 남겨주세요.</p></div>';
  list.querySelectorAll(".bundle-discussion__avatar img").forEach(image => image.addEventListener("error", () => image.remove(), { once: true }));
}
