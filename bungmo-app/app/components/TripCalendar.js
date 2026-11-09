"use client";

import { calendarDays, isMeetingDay, shiftCalendarMonth } from "../../lib/bungmo/calendar.js";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export const dayLabel = day => new Date(`${day}T00:00:00Z`).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" });

export default function TripCalendar({ meeting, events, selectedDay, onSelect }) {
  const month = selectedDay.slice(0, 7);
  const days = calendarDays(selectedDay);
  const byDay = new Map();
  for (const event of events) {
    if (!byDay.has(event.day)) byDay.set(event.day, []);
    byDay.get(event.day).push(event);
  }
  return <section className="trip-calendar" aria-label="여행 일정 달력">
    <div className="trip-calendar-toolbar">
      <h2 aria-live="polite">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</h2>
      <div>{meeting.startDate && <button className="btn btn--ghost" type="button" onClick={() => onSelect(meeting.startDate)}>모임 시작일</button>}<button className="btn btn--ghost" type="button" aria-label="이전 달" onClick={() => onSelect(shiftCalendarMonth(selectedDay, -1))}>‹</button><button className="btn btn--ghost" type="button" aria-label="다음 달" onClick={() => onSelect(shiftCalendarMonth(selectedDay, 1))}>›</button></div>
    </div>
    <table className="trip-calendar-grid"><caption className="sr-only">날짜를 선택하면 그날의 일정을 볼 수 있어요.</caption><thead><tr>{weekdays.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead><tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(day => {
      const items = byDay.get(day) ?? [];
      const inPeriod = isMeetingDay(day, meeting) && Boolean(meeting.startDate || meeting.endDate);
      return <td key={day}><button className="trip-calendar-day" type="button" data-other-month={day.slice(0, 7) !== month} data-meeting-day={inPeriod} aria-pressed={day === selectedDay} aria-label={`${day} ${dayLabel(day)}${inPeriod ? ", 모임 기간" : ""}, 일정 ${items.length}건`} onClick={() => onSelect(day)}>
        <span className="trip-calendar-date">{Number(day.slice(8))}</span>
        <span className="trip-calendar-previews" aria-hidden="true">{items.slice(0, 2).map(event => <span key={event.id}>{event.title}</span>)}{items.length > 2 && <span>+{items.length - 2}건</span>}</span>
        {items.length > 0 && <span className="trip-calendar-count" aria-hidden="true">{items.length}건</span>}
      </button></td>;
    })}</tr>)}</tbody></table>
  </section>;
}
