"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOutOfBungmo } from "../../lib/bungmo/auth.js";
import { isLocalPreview } from "../../lib/bungmo/local-preview.js";

const navigation = [
  ["/", "⌂", "한눈에"],
  ["/members", "◉", "참가자"],
  ["/schedule", "▦", "일정 조율"],
  ["/settlement", "₩", "지출·정산"],
  ["/trip", "↗", "여행 일정"],
  ["/archive", "◷", "지난 모임"]
];

export default function AppShell({ user, meeting, onChangeMeeting, children }) {
  const pathname = usePathname().replace(/^\/bungmo(?=\/|$)/, "").replace(/\/$/, "") || "/";

  const meetingPeriod = meeting.startDate
    ? `${meeting.startDate}${meeting.endDate && meeting.endDate !== meeting.startDate ? ` — ${meeting.endDate}` : ""}`
    : meeting.candidateDates?.length ? "일정 정하는 중" : "날짜 미정";

  return (
    <div className="bungmo-shell">
      <header className="bungmo-header">
        <a className="bungmo-logo" href="/index.html" aria-label="BOOONG 홈"><strong>BOOONG</strong></a>
        <div className="bungmo-header-actions"><span className="bungmo-account">{user.displayName || user.email}</span><a className="operations-back" href="/admin.html">운영자 공간</a><button className="btn btn--ghost" type="button" onClick={signOutOfBungmo}>로그아웃</button></div>
      </header>
      <section className="bungmo-workspace">
        <header className="meeting-context-bar">
          <div className="meeting-context-copy"><strong>{meeting.round}회 · {meeting.title}</strong><small>{meetingPeriod}{meeting.location ? ` · ${meeting.location}` : ""}</small></div>
          <div className="meeting-context-actions">
            <button className="btn btn--ghost change-meeting" type="button" onClick={onChangeMeeting}>모임 선택 <span aria-hidden="true">↗</span></button>
          </div>
        </header>
        <nav className="bungmo-navigation" aria-label="붕모 메뉴">
          {navigation.map(([href, , label]) => <Link className={`bungmo-nav-link ${pathname === href ? "active" : ""}`} aria-current={pathname === href ? "page" : undefined} href={href === "/" ? "/" : `${href}/`} key={href}>{label}</Link>)}
        </nav>
        {isLocalPreview() && <p className="preview-notice" role="status">로컬 미리보기 · 예시 데이터로 기능을 확인하고 있습니다.</p>}
        {children}
      </section>
    </div>
  );
}
