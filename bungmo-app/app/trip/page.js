"use client";

import { useEffect, useRef, useState } from "react";
import ItineraryDialog from "../components/ItineraryDialog.js";
import TripCalendar, { dayLabel } from "../components/TripCalendar.js";
import { isMeetingDay } from "../../lib/bungmo/calendar.js";
import { useBungmoWorkspace } from "../components/BungmoWorkspace.js";
import { deleteItinerary, saveItinerary, subscribeItinerary } from "../../lib/bungmo/repository.js";
import { googleMapsSearchUrl } from "../../lib/bungmo/maps.js";

const displayTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function Trip({ meeting }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const today = new Date().toLocaleDateString("sv-SE");
  const [selectedDay, setSelectedDay] = useState(meeting.startDate || today);
  const generation = useRef(0);
  const selectedMeetingId = useRef(meeting.id);
  useEffect(() => {
    generation.current += 1;
    selectedMeetingId.current = meeting.id;
    setEvents([]); setSelectedDay(meeting.startDate || today); setError(""); setEditing(null);
    let active = true;
    const current = generation.current;
    setLoading(true);
    const stop = subscribeItinerary(meeting.id, (items) => {
      if (!active || current !== generation.current) return;
      const sorted = items.toSorted((a, b) => a.day.localeCompare(b.day) || a.startMinutes - b.startMinutes);
      setEvents(sorted); setError(""); setLoading(false);
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
  function openEditor(event) { setEditing({ event, day: selectedDay, meetingId: meeting.id }); }
  async function save(event) {
    if (!editing || editing.meetingId !== selectedMeetingId.current) throw new Error("모임이 변경되어 일정을 저장하지 않았어요.");
    await saveItinerary(editing.meetingId, event);
    if (editing.meetingId === selectedMeetingId.current) setSelectedDay(event.day);
  }
  const canAdd = !loading && !error && isMeetingDay(selectedDay, meeting);
  const visibleEvents = events.filter((event) => event.day === selectedDay);
  return <main className="service-page">
    <div className="service-heading"><h1>여행 일정</h1><button className="service-primary" type="button" disabled={!canAdd} onClick={() => openEditor(null)}>+ 일정 추가</button></div>
    {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}>다시 시도</button></div>}
    {loading ? <section className="service-empty" role="status"><h2>여행 일정을 불러오는 중이에요.</h2></section> : <div className="trip-calendar-layout">
      <TripCalendar meeting={meeting} events={events} selectedDay={selectedDay} onSelect={setSelectedDay} />
      <section className="trip-day-agenda" aria-labelledby="trip-day-title">
        <h2 id="trip-day-title" aria-live="polite">{dayLabel(selectedDay)}</h2>
        {visibleEvents.length ? <ol className="trip-day-events">{visibleEvents.map(event => <li key={event.id}>
          <time dateTime={`${event.day}T${displayTime(event.startMinutes)}`}>{displayTime(event.startMinutes)}–{displayTime(event.endMinutes)}</time>
          <button className="trip-day-event" type="button" onClick={() => openEditor(event)}><strong>{event.title}</strong><span>{event.placeName}</span></button>
          <div className="trip-day-actions"><a href={googleMapsSearchUrl(event.placeName)} target="_blank" rel="noreferrer">지도 보기 ↗</a><button className="expense-delete" type="button" onClick={() => remove(event)} aria-label={`${event.title} 삭제`}>삭제</button></div>
        </li>)}</ol> : <p className="trip-day-empty">{error ? "일정을 확인할 수 없어요." : "등록된 일정이 없어요."}</p>}
        {canAdd ? <button className="btn btn--secondary trip-day-add" type="button" onClick={() => openEditor(null)}>+ 이 날짜에 일정 추가</button> : !isMeetingDay(selectedDay, meeting) && <p className="trip-day-empty">모임 기간 밖의 날짜예요.</p>}
      </section>
    </div>}
    {editing && <ItineraryDialog event={editing.event} initialDay={editing.day} meeting={meeting} onClose={() => setEditing(null)} onSave={save} />}
  </main>;
}

export default function TripPage() {
  const { meeting } = useBungmoWorkspace();
  return <Trip key={meeting.id} meeting={meeting} />;
}
