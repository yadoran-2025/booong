"use client";

import { useState } from "react";
import { validateItineraryDraft } from "../../lib/bungmo/model.js";

const time = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minutes = (value) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };

export default function ItineraryDialog({ event, meeting, onClose, onSave }) {
  const [form, setForm] = useState({ day: event?.day ?? meeting?.startDate ?? "", startTime: time(event?.startMinutes ?? 600), endTime: time(event?.endMinutes ?? 660), title: event?.title ?? "", placeName: event?.placeName ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  async function submit(submitEvent) {
    submitEvent.preventDefault();
    try {
      const draft = validateItineraryDraft({ ...form, startMinutes: minutes(form.startTime), endMinutes: minutes(form.endTime) }, meeting);
      setSaving(true); setError("");
      await onSave({ ...event, ...draft }); onClose();
    } catch (caughtError) { setError(caughtError.message || "일정을 저장하지 못했어요."); } finally { setSaving(false); }
  }
  return <div className="expense-dialog-backdrop" onMouseDown={onClose}>
    <section className="expense-dialog" role="dialog" aria-modal="true" aria-labelledby="itinerary-dialog-title" onMouseDown={(submitEvent) => submitEvent.stopPropagation()}>
      <div><p>여행 일정</p><h2 id="itinerary-dialog-title">{event ? "일정 수정" : "일정 추가"}</h2></div>
      <form onSubmit={submit}>
        <label>날짜<input type="date" required value={form.day} min={meeting?.startDate ?? undefined} max={meeting?.endDate ?? undefined} onChange={(submitEvent) => update("day", submitEvent.target.value)} autoFocus /></label>
        <div className="dialog-grid"><label>시작 시간<input type="time" required step="1800" value={form.startTime} onChange={(submitEvent) => update("startTime", submitEvent.target.value)} /></label><label>종료 시간<input type="time" required step="1800" value={form.endTime} onChange={(submitEvent) => update("endTime", submitEvent.target.value)} /></label></div>
        <label>일정 이름<input maxLength="40" required value={form.title} onChange={(submitEvent) => update("title", submitEvent.target.value)} /></label>
        <label>장소<input maxLength="100" required value={form.placeName} onChange={(submitEvent) => update("placeName", submitEvent.target.value)} /></label>
        {error && <p className="expense-form-error" role="alert">{error}</p>}
        <div className="expense-dialog-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button></div>
      </form>
    </section>
  </div>;
}
