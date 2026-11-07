"use client";

const statusLabels = { planning: "준비 중", upcoming: "예정", completed: "완료" };

const period = (meeting) => meeting.startDate
  ? `${meeting.startDate}${meeting.endDate && meeting.endDate !== meeting.startDate ? ` — ${meeting.endDate}` : ""}`
  : meeting.candidateDates?.length ? "일정 정하는 중" : "날짜 미정";

export default function MeetingGate({ meetings, selectedId, onSelect, onEnter, onCreate, canManageAccess, error, onRetry }) {
  return <main className="meeting-gate" aria-labelledby="meeting-gate-title">
    <header className="meeting-gate-header"><a className="gate-brand" href="/bungmo/" aria-label="BOOONG"><span>붕</span><strong>BOOONG</strong></a><div className="meeting-gate-tools"><em>01 / 먼저 모임을 선택합니다</em>{canManageAccess && <a href="/bungmo/access/">사이트 멤버 관리 →</a>}</div></header>
    <div className="meeting-gate-body">
      <section className="meeting-gate-copy"><span>CHOOSE YOUR MEETING</span><h1 id="meeting-gate-title">어떤 <em>모임</em>으로<br />들어갈까요?</h1><p>모임을 먼저 고르면 일정, 정산, 멤버와 여행 기록이 모두 그 모임 기준으로 열려요.</p><small>다른 모임의 데이터가 섞이지 않습니다.</small></section>
      <section className="meeting-gate-picker" aria-label="모임 선택">
        {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>다시 시도</button></div>}
        {meetings.map((meeting) => <button className="meeting-gate-card" type="button" aria-pressed={selectedId === meeting.id} onClick={() => onSelect(meeting.id)} key={meeting.id}>
          <span className="meeting-gate-round"><small>ROUND</small><strong>{meeting.round}</strong></span>
          <span className="meeting-gate-card-copy"><strong>{meeting.title}</strong><small>{period(meeting)}{meeting.location ? ` · ${meeting.location}` : ""}</small></span>
          <em className={meeting.status}>{statusLabels[meeting.status] ?? "준비 중"}</em>
        </button>)}
        {!meetings.length && !error && <div className="meeting-gate-empty"><strong>아직 등록된 모임이 없어요.</strong><span>첫 모임을 만들면 일정과 정산을 시작할 수 있어요.</span></div>}
        <div className="meeting-gate-actions"><button type="button" className="meeting-gate-create" onClick={onCreate}>＋ 새 모임 만들기</button><button type="button" className="meeting-gate-enter" disabled={!selectedId} onClick={onEnter}>이 모임으로 들어가기 →</button></div>
      </section>
    </div>
  </main>;
}
