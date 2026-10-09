import { escapeHtml } from "../utils.js";
import { readNotices, safeNoticeLink } from "../notices.js";

let noticesRequest, disposeNotices;
const noticeDate = value => new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });

export function renderNoticeArticle(notice) {
  const link = safeNoticeLink(notice.link);
  return `<article class="notice-article"><time datetime="${escapeHtml(notice.created_at)}">${escapeHtml(noticeDate(notice.created_at))}</time>
    <h3>${escapeHtml(notice.title)}</h3><p>${escapeHtml(notice.body)}</p>
    ${link ? `<a class="btn btn--secondary" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">관련 링크 열기 ↗</a>` : ""}</article>`;
}

export function renderNoticeBar() {
  return '<div data-notices-host hidden></div>';
}

export async function bindNotices(root) {
  disposeNotices?.();
  const host = root.querySelector("[data-notices-host]");
  if (!host) return;
  const controller = new AbortController();
  let timer, animation;
  disposeNotices = () => { controller.abort(); clearInterval(timer); animation?.cancel(); };
  let notices;
  try {
    noticesRequest ||= readNotices().catch(error => { noticesRequest = null; throw error; });
    notices = await noticesRequest;
  } catch (error) { console.warn(error.message); return; }
  if (!host.isConnected || controller.signal.aborted || !notices.length) return;

  host.innerHTML = `<section class="library-notices" aria-label="공지사항">
    <span class="library-notices__label">공지</span>
    <button class="library-notices__row" type="button"><span class="library-notices__ticker" aria-hidden="true"><span class="library-notices__track"></span></span></button>
    ${notices.length > 1 ? '<span class="library-notices__position" aria-hidden="true"></span><button class="library-notices__play" type="button"></button>' : ""}
    <button class="library-notices__all" type="button">전체 공지 ↗</button>
  </section>
  <dialog class="notice-dialog" aria-label="공지사항">
    <header><h2>공지사항</h2><form method="dialog"><button class="btn btn--ghost" autofocus>닫기</button></form></header>
    <div class="notice-dialog__content"></div>
  </dialog>`;
  host.hidden = false;
  const news = host.querySelector(".library-notices");
  const row = news.querySelector(".library-notices__row");
  const track = news.querySelector(".library-notices__track");
  const position = news.querySelector(".library-notices__position");
  const play = news.querySelector(".library-notices__play");
  const dialog = host.querySelector("dialog");
  const content = dialog.querySelector(".notice-dialog__content");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0, paused = motion.matches, sliding = false;

  function noticeLine(index) {
    const line = document.createElement("span");
    line.className = "library-notices__line";
    const title = document.createElement("span");
    title.className = "library-notices__title";
    title.textContent = notices[index].title;
    const date = document.createElement("time");
    date.dateTime = notices[index].created_at;
    date.textContent = noticeDate(notices[index].created_at);
    line.append(title, date);
    return line;
  }

  function updateLabel() {
    row.setAttribute("aria-label", notices[current].title);
    if (!play) return;
    position.textContent = `${current + 1} / ${notices.length}`;
    play.textContent = paused ? "재생" : "멈춤";
    play.setAttribute("aria-label", `공지 자동 넘김 ${paused ? "재생" : "멈춤"}`);
  }
  const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: controller.signal });
  track.append(noticeLine(current));
  updateLabel();
  if (play) {
    listen(play, "click", () => { paused = !paused; updateLabel(); });
    listen(motion, "change", () => { paused = motion.matches; updateLabel(); });
    timer = setInterval(async () => {
      if (!host.isConnected) { disposeNotices(); return; }
      if (paused || sliding || document.hidden || news.matches(":hover, :focus-within") || document.querySelector("dialog[open]")) return;
      sliding = true;
      row.disabled = true;
      const next = (current + 1) % notices.length;
      track.append(noticeLine(next));
      animation = track.animate([{ transform: "translateY(0)" }, { transform: `translateY(-${track.firstElementChild.offsetHeight}px)` }], {
        duration: motion.matches ? 0 : 450, easing: "ease-in-out"
      });
      try { await animation.finished; }
      catch { return; }
      track.firstElementChild.remove();
      current = next;
      row.disabled = false;
      sliding = false;
      updateLabel();
    }, 4000);
  }
  function openNotices(selected) {
    dialog.querySelector("h2").textContent = selected ? selected.title : "공지사항";
    content.innerHTML = (selected ? [selected] : notices).map(renderNoticeArticle).join("");
    if (selected) content.querySelector("h3").remove();
    dialog.showModal();
    content.scrollTop = 0;
  }
  listen(row, "click", () => openNotices(notices[current]));
  listen(news.querySelector(".library-notices__all"), "click", () => openNotices());
}
