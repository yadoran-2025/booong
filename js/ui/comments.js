import { app, activeUnsubscribers } from "../state.js";
import { db, ref, push, onChildAdded, onChildRemoved } from "../firebase-config.js";
import { toFbKey, escapeHtml } from "../utils.js";

/**
 * 댓글 섹션 생성
 */
export function buildCommentSection(key, variant = "question") {
  const wrap = document.createElement("div");
  wrap.className = `comment-section comment-section--${variant}`;

  const btn = document.createElement("button");
  btn.className = "comment-section__toggle";
  btn.textContent = "💬 학생 답변 보기";
  btn.type = "button";

  const content = document.createElement("div");
  content.className = "comment-section__body";

  const list = document.createElement("div");
  list.className = "comment-list";
  list.dataset.key = key;

  content.appendChild(list);
  content.appendChild(buildCommentForm(key, list));

  btn.addEventListener("click", () => {
    const isOpen = wrap.classList.toggle("is-open");
    if (isOpen && !content.dataset.loaded) {
      content.dataset.loaded = "1";
      subscribeComments(key, list);
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(content);
  return wrap;
}

function subscribeComments(key, list) {
  list.innerHTML = `<div class="comment-loading">불러오는 중…</div>`;

  const fbCommentKey = toFbKey(key);
  const dbRef = ref(db, `comments/${toFbKey(app.lesson.id)}/${fbCommentKey}`);
  let initialized = false;

  const unsubAdded = onChildAdded(dbRef, snap => {
    if (!initialized) { list.innerHTML = ""; initialized = true; }
    appendCommentItem(list, { id: snap.key, fbKey: fbCommentKey, ...snap.val() });
  });

  const emptyTimer = setTimeout(() => {
    if (!initialized) {
      list.innerHTML = `<div class="comment-empty">아직 답변이 없습니다. 첫 번째로 작성해보세요!</div>`;
      initialized = true;
    }
  }, 600);

  const unsubRemoved = onChildRemoved(dbRef, snap => {
    const item = list.querySelector(`.comment-item[data-id="${CSS.escape(snap.key)}"]`);
    if (item) item.remove();
    if (!list.querySelector(".comment-item")) {
      list.innerHTML = `<div class="comment-empty">아직 답변이 없습니다. 첫 번째로 작성해보세요!</div>`;
    }
  });

  activeUnsubscribers.push(() => {
    clearTimeout(emptyTimer);
    unsubAdded();
    unsubRemoved();
  });
}

function appendCommentItem(list, comment) {
  if (list.querySelector(`.comment-item[data-id="${CSS.escape(comment.id)}"]`)) return;
  list.querySelector(".comment-empty")?.remove();

  const item = document.createElement("div");
  item.className = "comment-item";
  item.dataset.id = comment.id;

  const time = comment.createdAt
    ? new Date(comment.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";

  item.innerHTML = `
    <div class="comment-item__header">
      <span class="comment-item__name">${escapeHtml(comment.name)}</span>
      <span class="comment-item__time">${time}</span>
    </div>
    <div class="comment-item__text">${escapeHtml(comment.text)}</div>
  `;

  list.appendChild(item);
  item.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildCommentForm(key, list) {
  const form = document.createElement("div");
  form.className = "comment-form";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "이름";
  nameInput.className = "comment-form__name";
  nameInput.maxLength = 30;
  const saved = localStorage.getItem("comment-name") || "";
  if (saved) nameInput.value = saved;
  nameInput.addEventListener("input", () => localStorage.setItem("comment-name", nameInput.value));

  const textarea = document.createElement("textarea");
  textarea.placeholder = "이 질문에 대한 내 생각을 적어보세요…";
  textarea.className = "comment-form__text";
  textarea.rows = 3;
  textarea.maxLength = 500;

  const footer = document.createElement("div");
  footer.className = "comment-form__footer";

  const counter = document.createElement("span");
  counter.className = "comment-form__counter";
  counter.textContent = "0 / 500";
  textarea.addEventListener("input", () => { counter.textContent = `${textarea.value.length} / 500`; });

  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "comment-form__submit";
  submit.textContent = "답변 제출";

  submit.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const text = textarea.value.trim();
    if (!name) { nameInput.focus(); showFormError(form, "이름을 입력해주세요."); return; }
    if (!text) { textarea.focus(); showFormError(form, "답변 내용을 입력해주세요."); return; }

    submit.disabled = true;
    submit.textContent = "전송 중…";

    try {
      await push(ref(db, `comments/${toFbKey(app.lesson.id)}/${toFbKey(key)}`), {
        key, name, text, createdAt: new Date().toISOString(),
      });
      textarea.value = "";
      counter.textContent = "0 / 500";
      submit.textContent = "✓ 제출됨";
      setTimeout(() => { submit.textContent = "답변 제출"; }, 2000);
    } catch (err) {
      console.error(err);
      showFormError(form, "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      submit.disabled = false;
    }
  });

  footer.appendChild(counter);
  footer.appendChild(submit);
  form.appendChild(nameInput);
  form.appendChild(textarea);
  form.appendChild(footer);
  return form;
}

function showFormError(form, msg) {
  let el = form.querySelector(".comment-form__error");
  if (!el) {
    el = document.createElement("div");
    el.className = "comment-form__error";
    form.insertBefore(el, form.querySelector(".comment-form__footer"));
  }
  el.textContent = msg;
  setTimeout(() => el.remove(), 3000);
}
