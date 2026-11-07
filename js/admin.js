import { escapeHtml } from "./utils.js";
import { firebaseApp } from "./firebase-config.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const auth = getAuth(firebaseApp);
const root = document.querySelector("#admin-root");
let adminCheck;

export const adminAccountId = () => auth.currentUser?.uid || null;
export const onAdminAccountChange = listener => onAuthStateChanged(auth, user => listener(user?.uid || null));

function adminFrame(content) {
  return `<div class="admin-shell"><nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="/index.html">BOOONG <small>OPERATIONS</small></a><a class="analytics__back" href="/index.html">← 수업 준비실</a></nav>${content}<footer class="admin-footer">사회교육공동체 BOOONG <span>운영자 공간</span></footer></div>`;
}

function accessScreen(message) {
  const email = auth.currentUser?.email;
  return adminFrame(`<div class="admin-entry"><header class="admin-entry__intro"><p class="analytics__eyebrow">수업 준비실을 돌보는 곳</p><h1>운영자 공간<span>.</span></h1><p>자료를 살피고,<br>선생님들의 이용 흐름을 확인합니다.</p></header><section class="admin-access" aria-labelledby="admin-access-title"><span class="admin-access__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg></span><p class="admin-access__label">운영자 전용</p><h2 id="admin-access-title">${email ? "계정 권한을 확인해주세요" : "Google 계정으로 로그인"}</h2><p class="admin-access__message" role="alert">${escapeHtml(message)}</p>${email ? `<div class="admin-account"><span>현재 로그인 계정</span><strong>${escapeHtml(email)}</strong></div>` : ""}<button class="btn btn--primary admin-access__login" type="button" data-admin-login><span aria-hidden="true">G</span>${email ? "다른 Google 계정으로 로그인" : "Google로 로그인"}</button><div class="admin-access__secondary"><button class="btn btn--ghost" type="button" data-admin-retry>다시 확인</button><a href="/index.html">수업 준비실로 돌아가기 →</a></div></section></div>`);
}

async function signIn(container, button) {
  button.disabled = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
    location.reload();
  } catch (error) {
    const message = error.code === "auth/popup-closed-by-user" ? "로그인이 취소되었습니다."
      : error.code === "auth/unauthorized-domain" ? "이 사이트의 Google 로그인이 아직 설정되지 않았습니다."
      : "Google 로그인에 실패했습니다. 다시 시도해주세요.";
    container.querySelector("[role=alert]").textContent = message;
    button.disabled = false;
  }
}

export async function adminFetch(url, options = {}) {
  const target = new URL(url, location.origin);
  if (target.origin !== location.origin || !target.pathname.startsWith("/api/")) throw new Error("Invalid admin API URL");
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Google 계정으로 로그인해주세요.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  return fetch(target, { ...options, headers, cache: "no-store" });
}

export async function requireAdmin(container, url = "/api/admin") {
  // Keep a working screen visible during revalidation; only slow initial loads need a placeholder.
  const timer = container.querySelector(".admin-shell, .analytics__inner, .textbook__inner") ? null
    : setTimeout(() => { container.innerHTML = '<p class="analytics__empty" role="status">화면을 준비하고 있습니다.</p>'; }, 250);
  container.setAttribute("aria-busy", "true");
  let message;
  try {
    await auth.authStateReady();
    if (!auth.currentUser) {
      adminCheck = null;
      message = "운영자로 등록된 Google 계정으로 로그인해주세요.";
    } else {
      const uid = auth.currentUser.uid;
      let response;
      if (url === "/api/admin") {
        if (!adminCheck || adminCheck.uid !== uid || adminCheck.expires <= Date.now()) {
          const check = { uid, expires: Date.now() + 30_000 };
          check.promise = adminFetch(url).then(response => {
            if (!response.ok && adminCheck === check) adminCheck = null;
            return response;
          }).catch(error => { if (adminCheck === check) adminCheck = null; throw error; });
          adminCheck = check;
        }
        response = (await adminCheck.promise).clone();
      } else response = await adminFetch(url);
      if (auth.currentUser?.uid !== uid) { adminCheck = null; throw new Error("Google account changed"); }
      if (response.ok) return response;
      const body = await response.json();
      message = response.status === 401 ? "Google 계정으로 다시 로그인해주세요."
        : response.status === 403 ? "이 계정에는 운영자 권한이 없습니다. 등록된 운영자 계정으로 로그인해주세요."
        : body.reason === "admin_not_configured" ? "운영자 명단이 아직 설정되지 않았습니다. 명단을 설정한 뒤 다시 확인해주세요."
        : "운영자 권한을 확인하지 못했습니다. 잠시 후 다시 확인해주세요.";
    }
  } catch {
    message = "운영자 권한을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.";
  } finally {
    clearTimeout(timer);
    container.removeAttribute("aria-busy");
  }
  container.innerHTML = accessScreen(message);
  container.querySelector("[data-admin-login]").addEventListener("click", event => signIn(container, event.currentTarget));
  container.querySelector("[data-admin-retry]").addEventListener("click", () => location.reload());
  return false;
}

async function renderAdmin() {
  if (!await requireAdmin(root)) return;
  if (new URLSearchParams(location.search).get('tab') === 'rice-basket') {
    location.replace('/rice-basket/?admin=1&tab=classes');
    return;
  }
  const email = auth.currentUser?.email || "";
  root.innerHTML = adminFrame(`<header class="admin-home__hero"><div><p class="analytics__eyebrow">BOOONG 운영실</p><h1>수업 준비실을 살피는 시간<span>.</span></h1><p>사이트 운영부터 수업 연구, 모임 기록까지. 필요한 일을 찾아보세요.</p></div><div class="admin-account admin-account--verified"><span><i aria-hidden="true"></i>운영자 확인 완료</span><strong>${escapeHtml(email)}</strong></div></header>
    <div class="admin-home__tools">
      <section class="admin-tool-group" aria-labelledby="admin-erp-title">
        <header class="admin-tool-group__heading"><h2 id="admin-erp-title">연구소 운영</h2><p>장부와 연수 자료를<br> 한곳에서 관리해요.</p></header>
        <ul class="admin-tool-group__list" role="list"><li><a class="admin-tool" href="research-erp.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h3m3 0h2m-8 4h3m3 0h2M8 18h8"/></svg></span><div><h3>연구소 ERP</h3><p>매출, 커피·사료(밥)·임차료를 기록하고 월별 수입과 비용을 확인합니다.</p></div><span class="admin-tool__action">장부 열기 <span aria-hidden="true">→</span></span></a></li><li><a class="admin-tool" href="/rice-basket/?admin=1&amp;tab=classes"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-2 12H5L3 9Zm4 0 5-7 5 7M9 13v4m6-4v4"/></svg></span><div><h3>쌀바구니</h3><p>연수 자료를 구성하고 참가자에게 공유합니다.</p></div><span class="admin-tool__action">쌀바구니 열기 <span aria-hidden="true">→</span></span></a></li></ul>
      </section>
      <section class="admin-tool-group" aria-labelledby="admin-site-title">
        <header class="admin-tool-group__heading"><h2 id="admin-site-title">사이트 운영</h2><p>새 소식을 전하고,<br> 이용 흐름을 살펴요.</p></header>
        <ul class="admin-tool-group__list" role="list">
          <li><a class="admin-tool" href="notice-admin.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h4l12-5v14L8 14H4zM8 14l2 7H6l-2-7M20 9a4 4 0 0 1 0 6"/></svg></span><div><h3>공지 관리</h3><p>공지 제목과 내용, 관련 링크를 등록하고 수정합니다.</p></div><span class="admin-tool__action">공지 관리 <span aria-hidden="true">→</span></span></a></li>
          <li><a class="admin-tool" href="lesson-admin.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18H4zM8 7h8M8 12h8M8 17h5"/></svg></span><div><h3>수업 관리</h3><p>수업 정보와 자료 링크, 과목·단원, 공개 여부를 관리합니다.</p></div><span class="admin-tool__action">수업 관리 <span aria-hidden="true">→</span></span></a></li>
          <li><a class="admin-tool" href="thumbnail-admin.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/></svg></span><div><h3>썸네일 관리</h3><p>수업 이미지를 교체하고, 카드에 보일 영역을 조절합니다.</p></div><span class="admin-tool__action">이미지 관리 <span aria-hidden="true">→</span></span></a></li>
          <li><a class="admin-tool" href="analytics.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M6 15l5-5 4 3 6-8M16 5h5v5"/></svg></span><div><h3>방문 통계</h3><p>방문 기록과 자료 이용 흐름을 확인합니다.</p></div><span class="admin-tool__action">통계 보기 <span aria-hidden="true">→</span></span></a></li>
        </ul>
      </section>
      <section class="admin-tool-group" aria-labelledby="admin-research-title">
        <header class="admin-tool-group__heading"><h2 id="admin-research-title">수업 연구</h2><p>교과서와 책에서<br> 수업의 실마리를 찾아요.</p></header>
        <ul class="admin-tool-group__list" role="list">
          <li><a class="admin-tool" href="https://drive.google.com/drive/folders/1DJk3fA986d_FmoRrOW0HFJc_cg7rMPcp" target="_blank" rel="noopener noreferrer"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg></span><div><h3>개론서</h3></div><span class="admin-tool__action">폴더 열기<span class="sr-only">새 탭에서 열기</span><span aria-hidden="true">↗</span></span></a></li>
          <li><a class="admin-tool" href="textbook-analysis.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h3M4 19a2 2 0 0 0 2 2h7M14 3v4M8 7h3m-3 4h2"/><circle cx="16" cy="13" r="4"/><path d="m19 16 3 3"/></svg></span><div><h3>교과서 분석</h3><p>단원별 교과서를 펼치고, 출판사별 내용을 비교합니다.</p></div><span class="admin-tool__action">교과서 열기 <span aria-hidden="true">→</span></span></a></li>
          <li><a class="admin-tool" href="watcha-library.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18"/></svg></span><div><h3>왓챠–도서관</h3><p>읽고 싶은 책의 소장 도서관과 대출 가능 여부를 확인합니다.</p></div><span class="admin-tool__action">도서관 확인 <span aria-hidden="true">→</span></span></a></li>
        </ul>
      </section>
      <section class="admin-tool-group" aria-labelledby="admin-community-title">
        <header class="admin-tool-group__heading"><h2 id="admin-community-title">모임과 기록</h2><p>함께하는 일정을 챙기고,<br> 나눈 이야기를 돌아봐요.</p></header>
        <ul class="admin-tool-group__list" role="list">
          <li><a class="admin-tool" href="bungmo/"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><path d="M2 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 5 5v1"/></svg></span><div><h3>붕모 대시보드</h3><p>모임 일정, 참가자와 게스트, 지출·정산, 여행 기록을 관리합니다.</p></div><span class="admin-tool__action">모임 관리 <span aria-hidden="true">→</span></span></a></li>
          <li><a class="admin-tool" href="https://booong-2026-report.vercel.app/" target="_blank" rel="noopener noreferrer"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6 4V4a1 1 0 0 1 1-1ZM8 13v-3m4 3V7m4 6V9"/></svg></span><div><h3>붕 노가리 분석</h3><p>붕 노가리 분석 보고서를 확인합니다.</p></div><span class="admin-tool__action">분석 보기<span class="sr-only">새 탭에서 열기</span><span aria-hidden="true">↗</span></span></a></li>
        </ul>
      </section>
    </div>`);
}

if (root && (!root.dataset.page || root.dataset.page === "admin")) renderAdmin();

if (root && (!root.dataset.page || root.dataset.page === "admin") && typeof onAuthStateChanged === 'function') {
  let lastAccount = auth.currentUser?.uid || null;
  onAdminAccountChange(uid => {
    if (uid === lastAccount) return;
    lastAccount = uid;adminCheck = null;root.replaceChildren();renderAdmin();
  });
}
