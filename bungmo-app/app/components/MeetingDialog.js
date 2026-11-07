"use client";

import { useState } from "react";
import { MEETING_STATUSES, validateMeetingDraft } from "../../lib/bungmo/model.js";

const labels = { planning: "계획 중", upcoming: "예정", completed: "완료" };

export default function MeetingDialog({ meeting, onClose, onSave }) {
  const [form, setForm] = useState({
    round: meeting?.round?.toString() ?? "",
    title: meeting?.title ?? "",
    location: meeting?.location ?? "",
    status: meeting?.status ?? "planning",
    candidateDates: meeting?.candidateDates ?? [],
    startHour: meeting?.startHour?.toString() ?? "10",
    endHour: meeting?.endHour?.toString() ?? "22",
    startDate: meeting?.startDate ?? "",
    endDate: meeting?.endDate ?? ""
  });
  const [candidateDate, setCandidateDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    try {
      const draft = validateMeetingDraft({ ...form, round: Number(form.round), startHour: Number(form.startHour), endHour: Number(form.endHour) });
      setSaving(true); setError("");
      await onSave({ ...meeting, ...draft, location: form.location.trim() });
      onClose();
    } catch (caughtError) { setError(caughtError.message || "모임을 저장하지 못했어요."); } finally { setSaving(false); }
  }

  function addCandidate() {
    if (candidateDate && !form.candidateDates.includes(candidateDate)) update("candidateDates", [...form.candidateDates, candidateDate].toSorted());
    setCandidateDate("");
  }

  return <div className="expense-dialog-backdrop" onMouseDown={onClose}>
    <section className="expense-dialog" role="dialog" aria-modal="true" aria-labelledby="meeting-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <div><p>모임 기록</p><h2 id="meeting-dialog-title">{meeting ? "모임 수정" : "모임 추가"}</h2></div>
      <form onSubmit={submit}>
        <label>회차<input type="number" min="1" step="1" required value={form.round} onChange={(event) => update("round", event.target.value)} autoFocus /></label>
        <label>모임 이름<input maxLength="40" required value={form.title} onChange={(event) => update("title", event.target.value)} /></label>
        <label>지역 또는 장소<input maxLength="100" value={form.location} onChange={(event) => update("location", event.target.value)} /></label>
        <div><span>상태</span><div className="participant-buttons" role="group" aria-label="모임 상태">{MEETING_STATUSES.map(status => <button type="button" key={status} aria-pressed={form.status === status} onClick={() => update("status", status)}>{labels[status]}</button>)}</div></div>
        <fieldset><legend>후보 날짜</legend><div className="candidate-date"><input type="date" value={candidateDate} onChange={(event) => setCandidateDate(event.target.value)} /><button type="button" onClick={addCandidate}>추가</button></div><div className="candidate-list">{form.candidateDates.map((date) => <button type="button" key={date} onClick={() => update("candidateDates", form.candidateDates.filter((item) => item !== date))}>{date} ×</button>)}</div></fieldset>
        <div className="dialog-grid"><label>시작 시각<input type="number" min="0" max="23" step="1" required value={form.startHour} onChange={(event) => update("startHour", event.target.value)} /></label><label>종료 시각<input type="number" min="1" max="24" step="1" required value={form.endHour} onChange={(event) => update("endHour", event.target.value)} /></label></div>
        <div className="dialog-grid"><label>시작일<input type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} /></label><label>종료일<input type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} /></label></div>
        {error && <p className="expense-form-error" role="alert">{error}</p>}
        <div className="expense-dialog-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button></div>
      </form>
    </section>
  </div>;
}
