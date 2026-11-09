"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { editableScheduleMembers, resolveMeetingMembers } from "../../lib/bungmo/member.js";
import { meetingHours, slotId } from "../../lib/bungmo/model.js";
import { availabilityGroups, changeAvailability, nextAvailability } from "../../lib/bungmo/response.js";
import { createResponseWriter } from "../../lib/bungmo/response-writer.js";
import { saveResponse, subscribeResponse, subscribeResponses } from "../../lib/bungmo/repository.js";

const stateLabel = { available: "가능해요", unavailable: "어려워요", undecided: "미정이에요" };
const dateLabel = (date) => {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
};

export default function ScheduleBoard({ meeting, user, profile, memberRecords, users }) {
  const [mode, setMode] = useState("mine");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [targetId, setTargetId] = useState("");
  const [availability, setAvailability] = useState({});
  const [responses, setResponses] = useState([]);
  const [targetLoading, setTargetLoading] = useState(false);
  const [responsesLoaded, setResponsesLoaded] = useState(false);
  const [targetError, setTargetError] = useState("");
  const [responsesError, setResponsesError] = useState("");
  const [targetRetry, setTargetRetry] = useState(0);
  const [responsesRetry, setResponsesRetry] = useState(0);
  const [saveState, setSaveState] = useState("saved");
  const writerRef = useRef(null);
  const detailDialog = useRef(null);
  const latestAvailability = useRef({});
  const loaded = useRef(false);
  const saveScope = useRef("");
  const selectionEpoch = useRef(0);
  const loadedEpoch = useRef(0);
  const hours = meetingHours(meeting);
  const members = resolveMeetingMembers(memberRecords, users);
  const editableMembers = editableScheduleMembers(members, user.uid);
  const target = editableMembers.find((member) => member.id === targetId) ?? null;
  const targetScope = target ? `${meeting.id}:${target.id}` : "";

  useEffect(() => {
    const own = editableMembers.find((member) => member.id === user.uid);
    const nextTargetId = editableMembers.some((member) => member.id === targetId) ? targetId : (own ?? editableMembers[0])?.id ?? "";
    if (nextTargetId !== targetId) resetTarget(nextTargetId);
  }, [memberRecords, users, user.uid, targetId]);

  useEffect(() => {
    selectionEpoch.current += 1;
    const session = selectionEpoch.current;
    setAvailability({});
    latestAvailability.current = {};
    loaded.current = false;
    loadedEpoch.current = 0;
    setSaveState("saved");
    setTargetError("");
    setTargetLoading(Boolean(target));
    const scope = targetScope;
    saveScope.current = scope;
    if (!target) return;
    let active = true;
    const writer = createResponseWriter(delta => saveResponse(meeting.id, target.id, target.displayName, delta), state => {
      if (active && selectionEpoch.current === session && saveScope.current === scope) setSaveState(state);
    });
    writerRef.current = writer;
    const stop = subscribeResponse(meeting.id, target.id, (response) => {
      if (!active || selectionEpoch.current !== session || saveScope.current !== scope) return;
      const next = { ...(response?.availability ?? {}), ...writer.pending() };
      latestAvailability.current = next;
      setAvailability(next);
      loaded.current = true;
      loadedEpoch.current = session;
      setTargetLoading(false);
      setTargetError("");
    }, () => {
      if (!active || selectionEpoch.current !== session || saveScope.current !== scope) return;
      loaded.current = false;
      loadedEpoch.current = 0;
      setTargetLoading(false);
      setTargetError("선택한 일정 응답을 불러오지 못했어요.");
    });
    return () => {
      active = false;
      if (selectionEpoch.current === session) {
        selectionEpoch.current += 1;
        loaded.current = false;
        loadedEpoch.current = 0;
        saveScope.current = "";
      }
      writer.flush().catch(() => {});
      if (writerRef.current === writer) writerRef.current = null;
      stop();
    };
  }, [meeting.id, target?.id, targetRetry]);

  useEffect(() => {
    let active = true;
    setResponses([]);
    setResponsesLoaded(false);
    setResponsesError("");
    const stop = subscribeResponses(meeting.id, (items) => {
      if (!active) return;
      setResponses(items); setResponsesLoaded(true); setResponsesError("");
    }, () => {
      if (!active) return;
      setResponses([]); setResponsesLoaded(false); setResponsesError("모두의 일정 응답을 불러오지 못했어요.");
    });
    return () => { active = false; stop(); };
  }, [meeting.id, responsesRetry]);

  function cycleSlot(id) {
    if (mode !== "mine" || !loaded.current || loadedEpoch.current !== selectionEpoch.current || saveScope.current !== targetScope) return;
    const change = changeAvailability(latestAvailability.current, {}, id, nextAvailability(latestAvailability.current[id]));
    latestAvailability.current = change.availability;
    setAvailability(change.availability);
    writerRef.current?.change(change.delta);
  }

  function resetTarget(nextTargetId) {
    writerRef.current?.flush().catch(() => {});
    selectionEpoch.current += 1;
    saveScope.current = "";
    loaded.current = false;
    loadedEpoch.current = 0;
    latestAvailability.current = {};
    setAvailability({});
    setTargetError("");
    setTargetLoading(Boolean(nextTargetId));
    setSaveState("saved");
    setTargetId(nextTargetId);
  }

  function selectTarget(event) {
    resetTarget(event.target.value);
  }

  function selectSlot(day, hour) {
    setSelectedSlot({ day, hour });
    if (window.matchMedia("(max-width: 760px)").matches) detailDialog.current.showModal();
  }

  const responseById = new Map(responses.map((response) => [response.id, response]));
  const groupResponses = members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    availability: responseById.get(member.id)?.availability ?? {}
  }));
  const detail = selectedSlot && meeting.candidateDates.includes(selectedSlot.day) && hours.includes(selectedSlot.hour) ? selectedSlot : { day: meeting.candidateDates[0], hour: hours[0] };
  const detailGroups = availabilityGroups(groupResponses, slotId(detail.day, detail.hour));

  if (!members.length) return <section className="service-empty"><h2>함께할 사람을 먼저 선택하세요.</h2><Link className="btn btn--primary" href="/members/">참가자 선택 →</Link></section>;
  if (!meeting.candidateDates.length || !hours.length) return <section className="service-empty"><h2>후보 날짜와 시간을 설정하세요.</h2><Link className="btn btn--primary" href="/archive/">모임 정보 수정 →</Link></section>;
  const canPaint = mode === "mine" && Boolean(target) && !targetLoading && !targetError && loaded.current && loadedEpoch.current === selectionEpoch.current && saveScope.current === targetScope;
  return <section className="availability-board">
    <div className="availability-toolbar">
      <div className="availability-modes" role="group" aria-label="일정 보기"><button className="btn" type="button" aria-pressed={mode === "mine"} onClick={() => setMode("mine")}>일정 입력</button><button className="btn" type="button" aria-pressed={mode === "group"} onClick={() => setMode("group")}>모두 비교</button></div>
      {mode === "mine" && target && <div className="availability-save" role="status"><span className={`schedule-saved ${saveState}`}>{targetLoading ? "불러오는 중" : saveState === "saving" ? "저장 중…" : saveState === "error" ? "저장하지 못했어요" : "저장됨"}</span>{saveState === "error" && <button className="btn btn--ghost" type="button" onClick={() => writerRef.current?.flush().catch(() => {})}>다시 저장</button>}</div>}
    </div>
    {mode === "mine" && <div className="availability-input-controls">
      {editableMembers.length <= 6 ? <div className="participant-buttons" role="group" aria-label="일정 입력 대상">{editableMembers.map(member => <button type="button" key={member.id} aria-pressed={targetId === member.id} onClick={() => { if (targetId !== member.id) resetTarget(member.id); }}>{member.displayName}</button>)}</div> : <label className="availability-member-label">참가자<select value={targetId} onChange={selectTarget}>{editableMembers.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}
    </div>}
    {mode === "mine" && <p className="availability-instruction">누를 때마다 가능 → 어려움 → 빈칸으로 바뀌고 자동 저장돼요.</p>}
    {targetError && mode === "mine" && <div className="subscription-error" role="alert"><span>{targetError}</span><button type="button" onClick={() => { resetTarget(targetId); setTargetRetry(value => value + 1); }}>다시 시도</button></div>}
    {responsesError && mode === "group" && <div className="subscription-error" role="alert"><span>{responsesError}</span><button type="button" onClick={() => setResponsesRetry(value => value + 1)}>다시 시도</button></div>}
    {mode === "group" && !responsesLoaded && !responsesError ? <p role="status">모두의 응답을 불러오는 중이에요.</p> : mode === "mine" || responsesLoaded ? <div className={`availability-layout ${mode === "group" ? "comparing" : ""}`}>
      <div className="availability-scroll"><table className="availability-grid" style={{ minWidth: 72 + meeting.candidateDates.length * 132 }}><caption className="sr-only">{mode === "mine" ? `${target?.displayName ?? "참가자"}의 시간별 가능 여부` : "시간별 함께 가능한 인원"}</caption>
        <thead><tr><th scope="col">시간</th>{meeting.candidateDates.map(day => <th scope="col" key={day}><strong>{dateLabel(day)}</strong><span>{new Date(`${day}T00:00:00Z`).toLocaleDateString("ko-KR", { weekday: "long", timeZone: "UTC" })}</span></th>)}</tr></thead>
        <tbody>{hours.map(hour => <tr key={hour}><th scope="row">{String(hour).padStart(2, "0")}:00</th>{meeting.candidateDates.map(day => {
          const id = slotId(day, hour);
          const state = availability[id] ?? "undecided";
          const groups = availabilityGroups(groupResponses, id);
          const count = groups.available.length;
          return <td key={day}>{mode === "mine" ? <button className={`availability-cell ${state} ${canPaint ? "editable" : ""}`} type="button" data-slot={id} disabled={!canPaint} aria-label={`${target?.displayName ?? "참가자"}, ${dateLabel(day)} ${hour}시, ${stateLabel[state] ?? stateLabel.undecided}`} onClick={() => cycleSlot(id)}>{state === "available" ? "✓ 가능" : state === "unavailable" ? "− 어려움" : ""}</button> : <button className={`availability-cell comparison ${count === members.length ? "all-available" : count > 0 ? "some-available" : ""}`} type="button" aria-pressed={detail.day === day && detail.hour === hour} aria-label={`${dateLabel(day)} ${hour}시, ${members.length}명 중 ${count}명 가능`} onClick={() => selectSlot(day, hour)}><strong>{count}</strong><span>/ {members.length}명</span></button>}</td>;
        })}</tr>)}</tbody>
      </table></div>
      {mode === "group" && <aside className="availability-detail availability-detail-desktop" aria-label="선택한 시간의 참가자 응답"><ScheduleDetails day={detail.day} hour={detail.hour} groups={detailGroups} /></aside>}
    </div> : null}
    <dialog className="availability-dialog" ref={detailDialog} aria-label="선택한 시간의 참가자 응답"><div className="availability-detail"><ScheduleDetails day={detail.day} hour={detail.hour} groups={detailGroups} /><button className="btn btn--primary" type="button" onClick={() => detailDialog.current.close()}>닫기</button></div></dialog>
  </section>;
}

function ScheduleDetails({ day, hour, groups }) {
  if (!day || hour == null) return null;
  return <Fragment><h2 aria-live="polite">{dateLabel(day)} · {hour}:00–{hour + 1}:00</h2>{Object.entries(groups).map(([state, people]) => <section key={state} className={state}><h3>{state === "available" ? "가능" : state === "unavailable" ? "어려움" : "미정"} <span>{people.length}명</span></h3>{people.length ? <ul>{people.map(person => <li key={person.id}>{person.displayName}</li>)}</ul> : <p>없음</p>}</section>)}</Fragment>;
}
