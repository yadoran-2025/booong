"use client";

import { useEffect, useState } from "react";
import AuthGate from "./components/AuthGate.js";
import MeetingWorkspace from "./components/MeetingWorkspace.js";
import { resolveMeetingMembers } from "../lib/bungmo/member.js";
import { subscribeExpenses, subscribeItinerary, subscribeMeetingMembers, subscribeResponses, subscribeUsers } from "../lib/bungmo/repository.js";
import { calculateTransfers } from "../lib/bungmo/settlement.js";

const won = (amount) => amount.toLocaleString("ko-KR");
const time = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function Dashboard({ meeting }) {
  const [responses, setResponses] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [itinerary, setItinerary] = useState([]);
  const [memberRecords, setMemberRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setResponses([]); setExpenses([]); setItinerary([]); setMemberRecords([]); setError("");
    const onError = () => setError("모임 정보를 불러오지 못했어요.");
    const stops = [
      subscribeResponses(meeting.id, setResponses, onError),
      subscribeExpenses(meeting.id, setExpenses, onError),
      subscribeItinerary(meeting.id, setItinerary, onError),
      subscribeMeetingMembers(meeting.id, setMemberRecords, onError),
      subscribeUsers(setUsers, onError)
    ];
    return () => stops.forEach((stop) => stop());
  }, [meeting.id, retry]);

  const outstandingTotal = expenses.filter((item) => !item.settled).reduce((sum, item) => sum + item.amount, 0);
  const transfers = calculateTransfers(expenses);
  const members = resolveMeetingMembers(memberRecords, users);
  const names = new Map([...users.map((user) => [user.id, user.nickname]), ...resolveMeetingMembers(memberRecords, users, { activeOnly: false }).map((member) => [member.id, member.displayName])]);
  const sortedItinerary = itinerary.toSorted((a, b) => a.day.localeCompare(b.day) || a.startMinutes - b.startMinutes);

  return <main className="service-page meeting-home">
    <header className="meeting-home-heading"><div><span>MEETING WORKSPACE</span><h1>{meeting.title}<br />대시보드</h1></div><p>✓ 아래 내용은 모두 이 모임 기준이에요.</p></header>
    {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
    <div className="meeting-overview-grid">
      <a className="meeting-overview-card responses" href="/bungmo/schedule/"><span>AVAILABILITY</span><h2>언제 만날 수 있어요?</h2><p>참여자의 가능한 시간을 한곳에서 비교해요.</p><strong>{responses.length}<small>명 응답</small></strong></a>
      <a className="meeting-overview-card money" href="/bungmo/settlement/"><span>SETTLEMENT</span><h2>이번 모임에서 쓴 돈</h2><p>서로 주고받을 금액은 상계해서 보여 줘요.</p><div><strong>{won(outstandingTotal)}<small>원</small></strong><span className="meeting-money-people">{transfers.slice(0, 3).map((transfer) => <i key={`${transfer.fromId}-${transfer.toId}`}>{(names.get(transfer.fromId) || "?").slice(0, 1)}</i>)}</span></div></a>
      <a className="meeting-overview-card trip" href="/bungmo/trip/"><span>ITINERARY</span><h2>여행 일정 {itinerary.length}개</h2>{sortedItinerary.length ? <div className="meeting-trip-preview">{sortedItinerary.slice(0, 3).map((event) => <p key={event.id}><time>{event.day.slice(5)} {time(event.startMinutes)}</time><i /><strong>{event.title}</strong></p>)}</div> : <p>아직 등록된 여행 일정이 없어요.</p>}</a>
      <a className="meeting-overview-card members" href="/bungmo/members/"><span>MEMBERS</span><h2>함께하는 사람</h2><p>이 모임에 참여하는 멤버만 표시해요.</p><div className="meeting-member-avatars">{members.slice(0, 6).map((member) => <i key={member.id}>{member.displayName.slice(0, 1)}</i>)}</div></a>
    </div>
  </main>;
}

export default function HomePage() {
  return <AuthGate>{({ user, profile }) => <MeetingWorkspace user={user} profile={profile}>{(meeting) => <Dashboard meeting={meeting} />}</MeetingWorkspace>}</AuthGate>;
}
