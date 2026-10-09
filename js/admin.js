import { escapeHtml } from "./utils.js";
import { firebaseApp } from "./firebase-config.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const auth = getAuth(firebaseApp);
const root = document.querySelector("#admin-root");
let adminCheck;

export const adminAccountId = () => auth.currentUser?.uid || null;
export const onAdminAccountChange = listener => onAuthStateChanged(auth, user => listener(user?.uid || null));

function adminFrame(content) {
  return `<div class="admin-shell"><nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="index.html">BOOONG <small>OPERATIONS</small></a><a class="analytics__back" href="index.html">← 수업 준비실</a></nav>${content}<footer class="admin-footer">사회교육공동체 BOOONG <span>운영자 공간</span></footer></div>`;
}

function accessScreen(message) {
  const email = auth.currentUser?.email;
  return adminFrame(`<div class="admin-entry"><header class="admin-entry__intro"><p class="analytics__eyebrow">수업 준비실을 돌보는 곳</p><h1>운영자 공간<span>.</span></h1><p>자료를 살피고,<br>선생님들의 이용 흐름을 확인합니다.</p></header><section class="admin-access" aria-labelledby="admin-access-title"><span class="admin-access__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg></span><p class="admin-access__label">운영자 전용</p><h2 id="admin-access-title">${email ? "계정 권한을 확인해주세요" : "Google 계정으로 로그인"}</h2><p class="admin-access__message" role="alert">${escapeHtml(message)}</p>${email ? `<div class="admin-account"><span>현재 로그인 계정</span><strong>${escapeHtml(email)}</strong></div>` : ""}<button class="btn btn--primary admin-access__login" type="button" data-admin-login><span aria-hidden="true">G</span>${email ? "다른 Google 계정으로 로그인" : "Google로 로그인"}</button><div class="admin-access__secondary"><button class="btn btn--ghost" type="button" data-admin-retry>다시 확인</button><a href="index.html">수업 준비실로 돌아가기 →</a></div></section></div>`);
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
  const email = auth.currentUser?.email || "";
  root.innerHTML = adminFrame(`<header class="admin-home__hero"><div><p class="analytics__eyebrow">BOOONG 운영실</p><h1>수업 준비실을<br>살피는 시간<span>.</span></h1><p>확인할 도구를 선택하세요.</p></div><div class="admin-account admin-account--verified"><span><i aria-hidden="true"></i>운영자 확인 완료</span><strong>${escapeHtml(email)}</strong></div></header>
    <section class="admin-home__tools" aria-label="운영 도구"><a class="admin-tool" href="notice-admin.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5h16v14H4zM8 9h8m-8 4h5"/></svg></span><div><p class="admin-tool__category">수업 목록의 새로운 소식</p><h2>공지 관리</h2><p>공지 제목과 내용, 관련 링크를 등록하고 수정합니다.</p></div><span class="admin-tool__action">공지 관리 <span aria-hidden="true">→</span></span></a>
    <a class="admin-tool" href="analytics.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4v16h16M8 16v-5m5 5V6m5 10V9"/></svg></span><div><p class="admin-tool__category">사이트 이용 흐름</p><h2>방문 통계</h2><p>방문 기록과 자료 이용 흐름을 확인합니다.</p></div><span class="admin-tool__action">통계 보기 <span aria-hidden="true">→</span></span></a>
    <a class="admin-tool" href="textbook-analysis.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15M6 8h3m-3 4h3m6-4h3m-3 4h3"/></svg></span><div><p class="admin-tool__category">교과서와 수업 연구</p><h2>교과서 분석</h2><p>단원별 교과서를 펼치고, 출판사별 내용을 비교합니다.</p></div><span class="admin-tool__action">교과서 열기 <span aria-hidden="true">→</span></span></a>
    <a class="admin-tool" href="watcha-library.html"><span class="admin-tool__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h6v16H4zM14 4h6v16h-6zM7 8v5m10-5v5M10 12h4"/></svg></span><div><p class="admin-tool__category">읽고 싶은 책과 도서관</p><h2>왓챠–도서관</h2><p>읽고 싶어요 목록의 책을 소장한 도서관과 대출 가능 여부를 확인합니다.</p></div><span class="admin-tool__action">도서관 확인 <span aria-hidden="true">→</span></span></a></section>`);
}

if (root && (!root.dataset.page || root.dataset.page === "admin")) renderAdmin();
