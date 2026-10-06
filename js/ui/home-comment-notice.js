const NOTICE_KEY = "booong-comment-notice";

export function shouldShowCommentNotice(storage, today = new Date().toDateString()) {
  try { return ![today, "never"].includes(storage.getItem(NOTICE_KEY)); }
  catch { return true; }
}

export function showCommentNotice() {
  const today = new Date().toDateString();
  let storage;
  try { storage = localStorage; } catch { /* Storage may be disabled. */ }
  if (!shouldShowCommentNotice(storage, today)) return;

  const dialog = document.createElement("dialog");
  dialog.className = "home-comment-notice";
  dialog.setAttribute("aria-labelledby", "home-comment-notice-title");
  dialog.setAttribute("aria-describedby", "home-comment-notice-description");
  dialog.innerHTML = `
    <div class="home-comment-notice__body">
      <div class="home-comment-notice__copy">
        <span>BOOONG 새 기능</span>
        <h2 id="home-comment-notice-title">수업에서 함께 이야기해요</h2>
        <p id="home-comment-notice-description">수업 카드에 댓글을 남기고, 다른 선생님의 의견에 답글을 달 수 있어요. 교사임을 확인하기 위해 도름스 사이트로 로그인하면 댓글을 달 수 있어요.</p>
        <nav class="home-comment-notice__links" aria-label="도름스 링크">
          <a href="https://dorms.school" target="_blank" rel="noopener noreferrer">도름스 사이트 ↗</a>
        </nav>
      </div>
      <figure class="home-comment-notice__preview">
        <a href="/assets/comment-preview.png" target="_blank" rel="noopener" aria-label="댓글 화면 예시 크게 보기"><picture><source media="(max-width: 600px)" srcset="/assets/comment-preview-mobile.png"><img src="/assets/comment-preview.png" width="620" height="430" alt="댓글과 답글이 표시된 수업 댓글 화면 예시"></picture></a>
        <figcaption>댓글 화면 예시 · 누르면 크게 볼 수 있습니다</figcaption>
      </figure>
    </div>
    <div class="home-comment-notice__actions">
      <button type="button" data-notice-never>다시 보지 않기</button>
      <button type="button" data-notice-close>닫기</button>
    </div>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.querySelector("[data-notice-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-notice-never]").addEventListener("click", () => {
    try { storage?.setItem(NOTICE_KEY, "never"); } catch { /* Storage may be disabled. */ }
    dialog.close();
  });
  dialog.showModal();
  try { storage?.setItem(NOTICE_KEY, today); } catch { /* Storage may be disabled. */ }
}
