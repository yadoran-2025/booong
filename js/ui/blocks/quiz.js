import { formatInline, parseExamTitle } from "../../utils.js";
import { buildImage } from "./media.js";
export function renderQuizAccordion(block) {
  const container = document.createElement("div");
  container.className = "block quiz-accordion";
  block.items.forEach(item => {
    const itemEl = document.createElement("div");
    itemEl.className = "quiz-accordion__item";
    const summary = document.createElement("button");
    summary.className = "quiz-accordion__summary";
    summary.innerHTML = `<span class="quiz-accordion__title">${parseExamTitle(item.image)}</span>`;
    const content = document.createElement("div");
    content.className = "quiz-accordion__content";
    const imgWrap = document.createElement("div");
    imgWrap.className = "quiz-accordion__image-wrap";
    imgWrap.appendChild(buildImage(item.image));
    content.appendChild(imgWrap);
    if (item.answer) content.appendChild(buildAnswer(item.answer, "정답 및 해설 보기"));
    summary.addEventListener("click", () => itemEl.classList.toggle("is-open"));
    itemEl.appendChild(summary);
    itemEl.appendChild(content);
    container.appendChild(itemEl);
  });
  return container;
}

/* ── 내부 헬퍼 ── */

export function buildAnswer(answer, label = "답 보기") {
  const wrap = document.createElement("div");
  wrap.className = "answer";
  const btn = document.createElement("button");
  btn.className = "answer__toggle";
  btn.textContent = label;
  btn.addEventListener("click", () => wrap.classList.toggle("is-open"));
  const content = document.createElement("div");
  content.className = "answer__content";
  if (Array.isArray(answer)) {
    if (answer.some(item => /^- /.test(String(item || "").trim()))) {
      content.innerHTML = formatInline(answer.join("\n"));
    } else {
      let html = "<ul>";
      answer.forEach(b => { html += `<li>${formatInline(b)}</li>`; });
      html += "</ul>";
      content.innerHTML = html;
    }
  } else {
    content.innerHTML = `<p>${formatInline(answer)}</p>`;
  }
  wrap.appendChild(btn);
  wrap.appendChild(content);
  return wrap;
}
