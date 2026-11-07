"use client";

import { useEffect, useRef, useState } from "react";
import AuthGate from "../components/AuthGate.js";
import ItineraryDialog from "../components/ItineraryDialog.js";
import MeetingWorkspace from "../components/MeetingWorkspace.js";
import { deleteItinerary, saveItinerary, subscribeItinerary } from "../../lib/bungmo/repository.js";
import { googleMapsSearchUrl } from "../../lib/bungmo/maps.js";

const displayTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function Trip({ meeting }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");
  const generation = useRef(0);
  const selectedMeetingId = useRef(meeting.id);
  useEffect(() => {
    generation.current += 1;
    selectedMeetingId.current = meeting.id;
    setEvents([]); setSelectedDay(""); setError(""); setEditing(null);
    let active = true;
    const current = generation.current;
    setLoading(true);
    const stop = subscribeItinerary(meeting.id, (items) => {
      if (!active || current !== generation.current) return;
      const sorted = items.toSorted((a, b) => a.day.localeCompare(b.day) || a.startMinutes - b.startMinutes);
      const days = [...new Set(sorted.map((item) => item.day))];
      setEvents(sorted); setSelectedDay((current) => days.includes(current) ? current : days[0] ?? ""); setError(""); setLoading(false);
    }, () => {
      if (!active || current !== generation.current) return;
      setError("여행 일정을 불러오지 못했어요."); setLoading(false);
    });
    return () => { active = false; stop(); };
  }, [meeting.id, retry]);
  async function remove(event) {
    const meetingId = meeting.id;
    if (!window.confirm(`${event.title} 일정을 삭제할까요?`)) return;
    if (selectedMeetingId.current !== meetingId) return;
    try { await deleteItinerary(meetingId, event.id); } catch { setError("일정을 삭제하지 못했어요."); }
  }
  function openEditor(event) { setEditing({ event, meetingId: meeting.id }); }
  async function save(event) {
    if (!editing || editing.meetingId !== selectedMeetingId.current) throw new Error("모임이 변경되어 일정을 저장하지 않았어요.");
    await saveItinerary(editing.meetingId, event);
  }
  const days = [...new Set(events.map((event) => event.day))];
  const visibleEvents = events.filter((event) => event.day === selectedDay);
  return <main className="service-page">
    <div className="service-heading"><div><span>OUR ITINERARY</span><h1>여행의 모든 순간</h1><p>{meeting.title}에서 함께할 일정은 시간순으로 모두에게 보여요.</p></div><button className="service-primary" type="button" onClick={() => openEditor(null)}>+ 일정 추가</button></div>
    {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
    {loading ? <section className="service-empty" role="status"><h2>여행 일정을 불러오는 중이에요.</h2></section> : events.length ? <><div className="trip-tabs">{days.map((day, index) => <button type="button" className={selectedDay === day ? "active" : ""} onClick={() => setSelectedDay(day)} key={day}><span>DAY {index + 1}</span><strong>{day}</strong></button>)}</div><section className="trip-layout"><ol className="itinerary-list timeline">{visibleEvents.map((event, index) => <li key={event.id}><time dateTime={event.day}>{displayTime(event.startMinutes)}</time><i className={["blue", "coral", "green"][index % 3]} /><div><button type="button" className="itinerary-event" onClick={() => openEditor(event)}><strong>{event.title}</strong><span>{event.placeName}</span></button><a href={googleMapsSearchUrl(event.placeName)} target="_blank" rel="noreferrer">지도 보기 ↗</a><button type="button" className="expense-delete" onClick={() => remove(event)} aria-label={`${event.title} 삭제`}>삭제</button></div></li>)}</ol><aside className="trip-map" aria-label="여행 동선"><div className="map-grid" /><span className="map-river">BUNGMO TRIP</span>{visibleEvents.slice(0, 3).map((event, index) => <i className={`pin pin-${index + 1}`} key={event.id}>{index + 1}</i>)}<div><strong>오늘의 동선</strong><p>{visibleEvents.map((event) => event.placeName).join(" → ")}</p></div></aside></section></> : <section className="service-empty"><h2>아직 등록된 일정이 없어요.</h2><p>일정을 추가해 여행 동선을 함께 정리해 보세요.</p><button className="service-primary" type="button" onClick={() => openEditor(null)}>+ 일정 추가</button></section>}
    {editing && <ItineraryDialog event={editing.event} meeting={meeting} onClose={() => setEditing(null)} onSave={save} />}
  </main>;
}

export default function TripPage() { return <AuthGate>{({ user, profile }) => <MeetingWorkspace user={user} profile={profile}>{(meeting) => <Trip meeting={meeting} />}</MeetingWorkspace>}</AuthGate>; }
