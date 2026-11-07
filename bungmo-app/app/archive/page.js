"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "../components/AuthGate.js";
import MeetingDialog from "../components/MeetingDialog.js";
import MeetingWorkspace from "../components/MeetingWorkspace.js";
import { deleteMeeting, saveMeeting, subscribeMeetings } from "../../lib/bungmo/repository.js";

const labels = { planning: "계획 중", upcoming: "예정", completed: "완료" };

function Archive({ user, meeting: activeMeeting }) {
  const router = useRouter();
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(null);

  useEffect(() => subscribeMeetings((items) => { setMeetings(items.toSorted((a, b) => (b.round ?? 0) - (a.round ?? 0))); setError(""); }, () => setError("모임 기록을 불러오지 못했어요.")), [retry]);
  async function remove(meeting) {
    if (!window.confirm(`${meeting.round}회 모임을 삭제할까요?`)) return;
    try { await deleteMeeting(meeting.id); } catch { setError("모임을 삭제하지 못했어요."); }
  }
  function open(meeting) { window.localStorage.setItem("bungmoMeetingId", meeting.id); router.push("/trip"); }

  return <main className="service-page">
    <div className="service-heading"><div><span>OUR ARCHIVE</span><h1>우리가 만난 기록</h1><p>{activeMeeting.title}을 기준으로 보고 있어요. 다른 기록을 열면 해당 모임으로 전환됩니다.</p></div><button className="service-primary" type="button" onClick={() => setEditing({})}>+ 모임 추가</button></div>
    {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
    {meetings.length ? <ul className="meeting-records">{meetings.map((meeting) => <li key={meeting.id}><button type="button" className="meeting-record" onClick={() => open(meeting)}><span>{meeting.round}회</span><strong>{meeting.title}</strong><small>{meeting.location || "장소 미정"}</small><em className={`meeting-status ${meeting.status}`}>{labels[meeting.status] ?? "계획 중"}</em></button><div><button type="button" onClick={() => setEditing(meeting)}>수정</button><button type="button" className="expense-delete" onClick={() => remove(meeting)} aria-label={`${meeting.title} 삭제`}>삭제</button></div></li>)}</ul> : <section className="service-empty"><h2>아직 모임 기록이 없어요.</h2><p>첫 모임을 추가하면 일정과 정산을 함께 기록할 수 있어요.</p></section>}
    {editing && <MeetingDialog meeting={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={(meeting) => saveMeeting(meeting, user.uid)} />}
  </main>;
}

export default function ArchivePage() { return <AuthGate>{({ user, profile }) => <MeetingWorkspace user={user} profile={profile}>{(meeting) => <Archive user={user} meeting={meeting} />}</MeetingWorkspace>}</AuthGate>; }
