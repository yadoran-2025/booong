"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useBungmoWorkspace } from "./components/BungmoWorkspace.js";
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
  const responseCount = members.filter(member => responses.some(response => response.id === member.id)).length;

  return <main className="service-page meeting-home">
    <header className="service-heading"><div><h1>모임 한눈에</h1></div><Link className="btn btn--primary" href="/schedule/">일정 조율하기 →</Link></header>
    {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
    <section className="home-stats" aria-label="모임 현황">
      <Link href="/members/"><span>함께하는 사람</span><strong>{members.length}<small>명</small></strong></Link>
      <Link href="/schedule/"><span>일정 응답</span><strong>{responseCount}<small>/ {members.length}명</small></strong></Link>
      <Link href="/settlement/"><span>정산할 지출</span><strong>{won(outstandingTotal)}<small>원</small></strong></Link>
      <Link href="/trip/"><span>여행 일정</span><strong>{itinerary.length}<small>개</small></strong></Link>
    </section>
    <div className="home-panels">
      <section className="home-panel"><header><h2>모임 준비</h2></header>
        <Link className="home-task" href="/members/"><span className="home-task-number">1</span><div><strong>참가자 구성</strong><p>{members.length ? members.map(member => member.displayName).join(" · ") : "BOOONG 프로필에서 함께할 사람을 선택하세요."}</p></div><span aria-hidden="true">→</span></Link>
        <Link className="home-task" href="/schedule/"><span className="home-task-number">2</span><div><strong>가능한 시간 모으기</strong><p>{responseCount}명이 일정을 남겼어요.</p></div><span aria-hidden="true">→</span></Link>
      </section>
      <section className="home-panel"><header><h2>지출과 정산</h2><Link href="/settlement/">지출 기록 →</Link></header>
        {transfers.length ? <ul className="home-transfer-list">{transfers.slice(0, 3).map(transfer => <li key={`${transfer.fromId}-${transfer.toId}`}><span>{names.get(transfer.fromId) || "이전 참가자"} → {names.get(transfer.toId) || "이전 참가자"}</span><strong>{won(transfer.amount)}원</strong></li>)}</ul> : <div className="home-panel-empty"><strong>{expenses.length ? "현재 주고받을 금액이 없어요." : "서로 나눌 지출을 기록하세요."}</strong><p>{expenses.length ? "기록한 지출과 정산 내역을 확인할 수 있어요." : "결제한 사람과 함께한 사람을 고르면 정산해 드려요."}</p></div>}
      </section>
      <section className="home-panel home-itinerary"><header><h2>여행 일정</h2><Link href="/trip/">일정 관리 →</Link></header>
        {sortedItinerary.length ? <ol className="home-agenda">{sortedItinerary.slice(0, 4).map(event => <li key={event.id}><time>{event.day.slice(5)}<strong>{time(event.startMinutes)}</strong></time><div><strong>{event.title}</strong><p>{event.placeName}</p></div></li>)}</ol> : <div className="home-panel-empty"><strong>다음 만남을 함께 계획해 보세요.</strong><p>여행 날짜와 장소를 시간순으로 정리할 수 있어요.</p><Link className="btn btn--ghost" href="/trip/">여행 일정 추가 →</Link></div>}
      </section>
    </div>
  </main>;
}

export default function HomePage() {
  const { meeting } = useBungmoWorkspace();
  return <Dashboard key={meeting.id} meeting={meeting} />;
}
