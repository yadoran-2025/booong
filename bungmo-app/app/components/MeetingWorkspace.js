"use client";

import { useEffect, useState } from "react";
import { canManageBungmo } from "../../lib/bungmo/access.js";
import { explicitMeeting } from "../../lib/bungmo/model.js";
import { saveMeeting, subscribeMeetings } from "../../lib/bungmo/repository.js";
import AppShell from "./AppShell.js";
import MeetingDialog from "./MeetingDialog.js";
import MeetingGate from "./MeetingGate.js";

const storageKey = "bungmoMeetingId";

export default function MeetingWorkspace({ user, profile, children }) {
  const [meetings, setMeetings] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draftId, setDraftId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => subscribeMeetings((items) => {
    const sorted = items.toSorted((a, b) => (b.round ?? 0) - (a.round ?? 0));
    setMeetings(sorted); setLoaded(true); setError("");
    setActiveId((current) => {
      if (current === null) return explicitMeeting(sorted, window.localStorage.getItem(storageKey))?.id ?? "";
      return current && explicitMeeting(sorted, current) ? current : "";
    });
    setDraftId((current) => explicitMeeting(sorted, current)?.id ?? sorted[0]?.id ?? "");
  }, () => { setLoaded(true); setError("모임 목록을 불러오지 못했어요."); }), [retry]);

  const meeting = explicitMeeting(meetings, activeId);

  function enter() {
    if (!explicitMeeting(meetings, draftId)) return;
    window.localStorage.setItem(storageKey, draftId);
    setActiveId(draftId);
  }

  function changeMeeting() {
    setDraftId(activeId || meetings[0]?.id || "");
    window.localStorage.removeItem(storageKey);
    setActiveId("");
  }

  async function create(meetingDraft) {
    const id = await saveMeeting(meetingDraft, user.uid);
    window.localStorage.setItem(storageKey, id);
    setDraftId(id); setActiveId(id);
  }

  if (!loaded || activeId && !meeting) return <main className="auth-screen" aria-busy="true">모임을 불러오는 중…</main>;
  if (!meeting) return <><MeetingGate meetings={meetings} selectedId={draftId} onSelect={setDraftId} onEnter={enter} onCreate={() => setCreating(true)} canManageAccess={canManageBungmo(user)} error={error} onRetry={() => setRetry((value) => value + 1)} />{creating && <MeetingDialog onClose={() => setCreating(false)} onSave={create} />}</>;
  return <AppShell profile={profile} meeting={meeting} onChangeMeeting={changeMeeting}>{children(meeting)}</AppShell>;
}
