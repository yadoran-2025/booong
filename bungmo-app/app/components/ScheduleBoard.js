"use client";

import { useEffect, useRef, useState } from "react";
import { editableScheduleMembers, resolveMeetingMembers } from "../../lib/bungmo/member.js";
import { meetingHours, selectedMeetingDate, slotId } from "../../lib/bungmo/model.js";
import { changeAvailability } from "../../lib/bungmo/response.js";
import { saveResponse, subscribeResponse, subscribeResponses } from "../../lib/bungmo/repository.js";

const stateLabel = { available: "가능해요", unavailable: "어려워요", undecided: "미정이에요" };
const dateLabel = (date) => {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
};

export default function ScheduleBoard({ meeting, user, profile, memberRecords, users }) {
  const [mode, setMode] = useState("mine");
  const [date, setDate] = useState(meeting.candidateDates[0] ?? "");
  const [brush, setBrush] = useState("available");
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
  const timer = useRef(null);
  const painting = useRef(false);
  const lastPainted = useRef("");
  const paintRef = useRef(() => {});
  const board = useRef(null);
  const latestAvailability = useRef({});
  const pendingAvailability = useRef({});
  const loaded = useRef(false);
  const saveScope = useRef("");
  const selectionEpoch = useRef(0);
  const saveEpoch = useRef(0);
  const loadedEpoch = useRef(0);
  const hours = meetingHours(meeting);
  const members = resolveMeetingMembers(memberRecords, users);
  const editableMembers = editableScheduleMembers(members, user.uid);
  const target = editableMembers.find((member) => member.id === targetId) ?? null;
  const targetScope = target ? `${meeting.id}:${target.id}` : "";

  useEffect(() => {
    setDate((current) => selectedMeetingDate(meeting.candidateDates, current));
  }, [meeting.candidateDates]);

  useEffect(() => {
    const own = editableMembers.find((member) => member.id === user.uid);
    const nextTargetId = editableMembers.some((member) => member.id === targetId) ? targetId : (own ?? editableMembers[0])?.id ?? "";
    if (nextTargetId !== targetId) resetTarget(nextTargetId);
  }, [memberRecords, users, user.uid, targetId]);

  useEffect(() => {
    selectionEpoch.current += 1;
    saveEpoch.current += 1;
    const session = selectionEpoch.current;
    setAvailability({});
    latestAvailability.current = {};
    pendingAvailability.current = {};
    loaded.current = false;
    loadedEpoch.current = 0;
    painting.current = false;
    window.clearTimeout(timer.current);
    setSaveState("saved");
    setTargetError("");
    setTargetLoading(Boolean(target));
    const scope = targetScope;
    saveScope.current = scope;
    if (!target) return;
    let active = true;
    const stop = subscribeResponse(meeting.id, target.id, (response) => {
      if (!active || selectionEpoch.current !== session || saveScope.current !== scope) return;
      const next = response?.availability ?? {};
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
        saveEpoch.current += 1;
        loaded.current = false;
        loadedEpoch.current = 0;
        saveScope.current = "";
      }
      stop();
      window.clearTimeout(timer.current);
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

  useEffect(() => {
    const paintAtPointer = (event) => {
      if (!painting.current) return;
      const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest(".schedule-slot.editable");
      const id = slot?.dataset.slot;
      if (id && board.current?.contains(slot) && id !== lastPainted.current) {
        lastPainted.current = id;
        paintRef.current(id);
      }
    };
    const stopPainting = () => { painting.current = false; lastPainted.current = ""; };
    window.addEventListener("pointermove", paintAtPointer);
    window.addEventListener("pointerup", stopPainting);
    window.addEventListener("pointercancel", stopPainting);
    return () => {
      window.removeEventListener("pointermove", paintAtPointer);
      window.removeEventListener("pointerup", stopPainting);
      window.removeEventListener("pointercancel", stopPainting);
    };
  }, []);

  function scheduleSave() {
    window.clearTimeout(timer.current);
    const session = selectionEpoch.current;
    const request = ++saveEpoch.current;
    const scope = saveScope.current;
    const meetingId = meeting.id;
    const member = target;
    setSaveState("saving");
    timer.current = window.setTimeout(async () => {
      if (!member || !scope || saveScope.current !== scope || selectionEpoch.current !== session || saveEpoch.current !== request) return;
      const pending = pendingAvailability.current;
      pendingAvailability.current = {};
      try {
        // ponytail: same-slot in-flight writes are last-arrival-wins; serialize per target if this becomes observable.
        await saveResponse(meetingId, member.id, member.displayName, pending);
        if (saveScope.current === scope && selectionEpoch.current === session && saveEpoch.current === request) setSaveState("saved");
      } catch {
        if (saveScope.current === scope && selectionEpoch.current === session && saveEpoch.current === request) setSaveState("error");
      }
    }, 300);
  }

  function paint(id) {
    if (!loaded.current || loadedEpoch.current !== selectionEpoch.current || saveScope.current !== targetScope) return;
    const change = changeAvailability(latestAvailability.current, pendingAvailability.current, id, brush);
    latestAvailability.current = change.availability;
    pendingAvailability.current = change.delta;
    setAvailability(change.availability);
    scheduleSave();
  }
  paintRef.current = paint;

  function resetTarget(nextTargetId) {
    window.clearTimeout(timer.current);
    selectionEpoch.current += 1;
    saveEpoch.current += 1;
    saveScope.current = "";
    loaded.current = false;
    loadedEpoch.current = 0;
    latestAvailability.current = {};
    pendingAvailability.current = {};
    painting.current = false;
    lastPainted.current = "";
    setAvailability({});
    setTargetError("");
    setTargetLoading(Boolean(nextTargetId));
    setSaveState("saved");
    setTargetId(nextTargetId);
  }

  function selectTarget(event) {
    resetTarget(event.target.value);
  }

  const targetResponse = target && { id: target.id, displayName: target.displayName, availability };
  const responseById = new Map(responses.map((response) => [response.id, response]));
  const groupResponses = members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    availability: responseById.get(member.id)?.availability ?? {}
  }));
  const visibleResponses = mode === "mine" ? targetResponse ? [targetResponse] : [] : groupResponses;

  if (!members.length) return <section className="service-empty"><h2>참여 멤버가 없어요.</h2><p>멤버를 먼저 추가하면 일정을 입력하고 비교할 수 있어요.</p></section>;
  if (!meeting.candidateDates.length || !hours.length) return <section className="service-empty"><h2>입력할 날짜나 시간이 없어요.</h2><p>모임에서 후보 날짜와 시간을 먼저 설정해 주세요.</p></section>;
  const canPaint = mode === "mine" && Boolean(target) && !targetLoading && !targetError && loaded.current && loadedEpoch.current === selectionEpoch.current && saveScope.current === targetScope;
  return <section className="schedule-board" ref={board}><div className="schedule-controls"><div className="schedule-modes" role="tablist" aria-label="일정 보기"><button type="button" role="tab" aria-selected={mode === "mine"} className={mode === "mine" ? "active" : ""} onClick={() => setMode("mine")}>참가자 일정 입력</button><button type="button" role="tab" aria-selected={mode === "group"} className={mode === "group" ? "active" : ""} onClick={() => setMode("group")}>모두 비교 <span>{members.length}</span></button></div>{mode === "mine" ? <div>{editableMembers.length <= 6 ? <div className="participant-buttons" role="group" aria-label="일정 입력 대상">{editableMembers.map(member => <button type="button" key={member.id} aria-pressed={targetId === member.id} onClick={() => selectTarget({ target: { value: member.id } })}>{member.displayName}</button>)}</div> : <label className="meeting-selector">입력 대상<select value={targetId} disabled={!editableMembers.length} onChange={selectTarget}>{editableMembers.length ? editableMembers.map((member) => <option key={member.id} value={member.id}>{member.displayName}{member.id === user.uid ? " (나)" : member.kind === "guest" ? " (게스트)" : ""}</option>) : <option value="">입력 가능한 멤버가 없어요</option>}</select></label>}<div className="schedule-brushes" aria-label="입력 상태"><button type="button" className={`available ${brush === "available" ? "active" : ""}`} aria-pressed={brush === "available"} disabled={!canPaint} onClick={() => setBrush("available")}><i />가능해요</button><button type="button" className={`unavailable ${brush === "unavailable" ? "active" : ""}`} aria-pressed={brush === "unavailable"} disabled={!canPaint} onClick={() => setBrush("unavailable")}><i />어려워요</button></div></div> : <div className="schedule-legend"><span><i className="available" />가능</span><span><i className="unavailable" />어려움</span><span><i />미정</span></div>}</div><div className="schedule-day-tabs" role="tablist" aria-label="후보 날짜">{meeting.candidateDates.map((candidate) => <button type="button" role="tab" aria-selected={date === candidate} className={date === candidate ? "active" : ""} onClick={() => setDate(candidate)} key={candidate}><strong>{dateLabel(candidate)}</strong></button>)}</div>{targetError && mode === "mine" && <div className="subscription-error" role="alert"><span>{targetError}</span><button type="button" onClick={() => { resetTarget(targetId); setTargetRetry((value) => value + 1); }}>다시 시도</button></div>}{responsesError && mode === "group" && <div className="subscription-error" role="alert"><span>{responsesError}</span><button type="button" onClick={() => setResponsesRetry((value) => value + 1)}>다시 시도</button></div>}{mode === "mine" && targetLoading && <div className="service-empty" role="status">선택한 일정 응답을 불러오는 중이에요.</div>}{mode === "group" && !responsesLoaded && !responsesError ? <div className="service-empty" role="status">모두의 일정 응답을 불러오는 중이에요.</div> : mode !== "group" || responsesLoaded ? <div className="schedule-grid-scroll"><div className="schedule-grid" style={{ "--schedule-hours": hours.length }}><div className="schedule-corner">이름</div>{hours.map((hour) => <div className="schedule-hour" key={hour}><strong>{hour}</strong><span>시</span></div>)}{visibleResponses.map((response) => <ScheduleRow key={response.id} name={`${response.displayName}${response.id === user.uid ? " (나)" : ""}`} availability={response.availability ?? {}} date={date} hours={hours} editable={canPaint} onPaint={paint} painting={painting} lastPainted={lastPainted} />)}{mode === "group" && <SummaryRow responses={groupResponses} date={date} hours={hours} />}</div></div> : null}<footer className="schedule-help"><p><strong>{mode === "mine" ? target ? "칸을 누르거나 드래그해서 표시하세요." : "먼저 모임에 참가자를 추가해 주세요." : "모든 활성 멤버의 입력을 비교해요."}</strong><span>{mode === "mine" ? "선택한 상태로 입력되며, 0.3초 뒤 저장돼요." : "응답하지 않은 멤버는 미정으로 보여요."}</span></p>{mode === "mine" && target && <span className={`schedule-saved ${saveState}`} aria-live="polite">{saveState === "saving" ? "저장 중" : saveState === "error" ? "저장 실패 · 다시 입력해 주세요" : "저장됨"}</span>}</footer></section>;
}

function ScheduleRow({ name, availability, date, hours, editable, onPaint, painting, lastPainted }) {
  const labelName = name.replace(" (나)", "");
  return <><div className="schedule-person"><i className="avatar">{name[0]}</i><strong>{name}</strong></div>{hours.map((hour) => { const id = slotId(date, hour); const state = availability[id] ?? "undecided"; return <button type="button" data-slot={id} className={`schedule-slot ${state} ${editable ? "editable" : ""}`} disabled={!editable} key={id} aria-label={`${labelName}, ${dateLabel(date)} ${hour}시, ${stateLabel[state]}`} onPointerDown={editable ? (event) => { event.preventDefault(); painting.current = true; lastPainted.current = id; onPaint(id); } : undefined} onClick={editable ? () => onPaint(id) : undefined}><span>{state === "available" ? "✓" : state === "unavailable" ? "—" : ""}</span></button>; })}</>;
}

function SummaryRow({ responses, date, hours }) {
  return <><div className="schedule-person summary"><span>함께 가능</span><strong>인원</strong></div>{hours.map((hour) => { const id = slotId(date, hour); const count = responses.filter((response) => response.availability?.[id] === "available").length; return <div className="schedule-summary-slot" key={id}><strong>{count}</strong><span>명</span></div>; })}</>;
}
