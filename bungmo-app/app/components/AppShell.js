"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOutOfBungmo } from "../../lib/bungmo/auth.js";
import { updateProfileNickname } from "../../lib/bungmo/repository.js";
import { validateNickname } from "../../lib/bungmo/model.js";
import { isLocalPreview } from "../../lib/bungmo/local-preview.js";

const navigation = [
  ["/", "⌂", "한눈에 보기"],
  ["/settlement", "₩", "정산"],
  ["/schedule", "▦", "모임일정 산출"],
  ["/members", "◉", "멤버 관리"],
  ["/trip", "↗", "여행 일정"],
  ["/archive", "◷", "지난 모임"]
];

export default function AppShell({ profile, meeting, onChangeMeeting, children }) {
  const pathname = usePathname().replace(/^\/bungmo(?=\/|$)/, "").replace(/\/$/, "") || "/";
  const [nickname, setNickname] = useState(profile.nickname);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveNickname(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      await updateProfileNickname(profile.id, validateNickname(nickname));
    } catch (caughtError) {
      setError(caughtError.message || "닉네임을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  const meetingPeriod = meeting.startDate
    ? `${meeting.startDate}${meeting.endDate && meeting.endDate !== meeting.startDate ? ` — ${meeting.endDate}` : ""}`
    : meeting.candidateDates?.length ? "일정 정하는 중" : "날짜 미정";

  return (
    <main className="bungmo-shell">
      <aside className="bungmo-sidebar">
        <a className="bungmo-logo" href="/bungmo/" aria-label="BOOONG 메인 대시보드"><span>붕</span><strong>BOOONG</strong></a>
        <nav aria-label="주요 메뉴">
          {navigation.map(([href, icon, label]) => <a className={`bungmo-nav-link ${pathname === href ? "active" : ""}`} aria-label={label} aria-current={pathname === href ? "page" : undefined} href={`/bungmo${href === "/" ? "/" : `${href}/`}`} key={href}><span>{icon}</span><strong>{label}</strong></a>)}
        </nav>
        <a className="operations-back" href="/admin.html">← 운영자 공간</a><div className="bungmo-sidebar-note"><span>현재 범위</span><strong>{meeting.round}회</strong><p>{meeting.title}</p></div>
      </aside>
      <section className="bungmo-workspace">
        <header className="meeting-context-bar">
          <a className="mobile-context-logo" href="/bungmo/" aria-label="BOOONG 메인 대시보드">붕</a>
          <span className="meeting-context-round">{meeting.round}</span>
          <div className="meeting-context-copy"><span>현재 모임</span><strong>{meeting.round}회 · {meeting.title}</strong><small>{meetingPeriod}{meeting.location ? ` · ${meeting.location}` : ""}</small></div>
          <div className="meeting-context-actions">
            <a className="operations-back" href="/admin.html">운영자 공간</a>
            {isLocalPreview() && <small className="local-preview-badge">로컬 미리보기</small>}
            <button className="change-meeting" type="button" onClick={onChangeMeeting}>모임 바꾸기</button>
            <details className="profile-menu">
            <summary className="bungmo-profile"><span>{profile.nickname.slice(0, 1)}</span><strong>{profile.nickname}</strong><i>⌄</i></summary>
            <form onSubmit={saveNickname}>
              <label htmlFor="profile-nickname">닉네임</label>
              <input id="profile-nickname" value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} />
              {error && <p role="alert">{error}</p>}
              <button type="submit" disabled={saving}>{saving ? "저장 중…" : "닉네임 저장"}</button>
              <a href="/bungmo/members/">멤버 관리</a>
              <button type="button" onClick={signOutOfBungmo}>로그아웃</button>
            </form>
            </details>
          </div>
        </header>
        {isLocalPreview() && <p className="preview-notice" role="status">로컬 미리보기 · 예시 데이터로 기능을 확인하고 있습니다.</p>}
        {children}
      </section>
      <nav className="bungmo-mobile-nav" aria-label="모바일 메뉴">
        {navigation.map(([href, icon, label]) => <a className={`bungmo-nav-link ${pathname === href ? "active" : ""}`} aria-label={label} aria-current={pathname === href ? "page" : undefined} href={`/bungmo${href === "/" ? "/" : `${href}/`}`} key={href}><span>{icon}</span><strong>{label.replace("한눈에 보기", "홈").replace("모임일정 산출", "일정").replace("멤버 관리", "참가자").replace("여행 일정", "여행").replace("지난 모임", "기록")}</strong></a>)}
      </nav>
    </main>
  );
}
