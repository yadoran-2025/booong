"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeMemberDraft, resolveMeetingMembers } from "../../lib/bungmo/member.js";
import { deactivateMeetingMember, saveMeetingMember } from "../../lib/bungmo/repository.js";

export default function MemberDialog({ meetingId, records, users, onClose }) {
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialog = useRef(null);
  const savingRef = useRef(saving);
  const onCloseRef = useRef(onClose);
  savingRef.current = saving;
  onCloseRef.current = onClose;
  const members = resolveMeetingMembers(records, users, { activeOnly: false });
  const activeMembers = members.filter((member) => member.active);
  const inactiveMembers = members.filter((member) => !member.active);
  const availableUsers = users.filter((user) => !records.some((member) => member.kind === "registered" && member.userId === user.id));

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.querySelector("#guest-name")?.focus();
    return () => previousFocus?.focus?.();
  }, []);

  useEffect(() => {
    const currentDialog = dialog.current;
    if (currentDialog && !currentDialog.contains(document.activeElement)) currentDialog.querySelector("#guest-name")?.focus();
  }, [records, users]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const currentDialog = dialog.current;
      if (!currentDialog) return;
      if (event.key === "Escape") {
        if (!savingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...currentDialog.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!currentDialog.contains(document.activeElement) || !focusable.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  function close() {
    if (!saving) onClose();
  }

  async function save(member) {
    try {
      setSaving(true);
      setError("");
      const draft = normalizeMemberDraft(member);
      await saveMeetingMember(meetingId, { ...(member.id && { id: member.id }), ...draft });
      if (member.kind === "guest" && !member.id) setGuestName("");
    } catch (caughtError) {
      setError(caughtError.message || "멤버를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function exclude(member) {
    try {
      setSaving(true);
      setError("");
      await deactivateMeetingMember(meetingId, member.id);
    } catch (caughtError) {
      setError(caughtError.message || "멤버를 제외하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  function addGuest(event) {
    event.preventDefault();
    save({ kind: "guest", displayName: guestName });
  }

  return <div className="expense-dialog-backdrop" onMouseDown={saving ? undefined : onClose}>
    <section className="expense-dialog member-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="member-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <div><p>참여 멤버</p><h2 id="member-dialog-title">멤버 관리</h2></div>
      <div className="member-dialog-content">
        <section><h3>참여 중</h3><ul className="member-records">{activeMembers.length ? activeMembers.map((member) => <li key={member.id}><span>{member.displayName}{member.kind === "guest" && " · 게스트"}</span><button type="button" disabled={saving} onClick={() => exclude(member)}>제외</button></li>) : <li>참여 중인 멤버가 없어요.</li>}</ul></section>
        <section><h3>다시 참여</h3><ul className="member-records">{inactiveMembers.length ? inactiveMembers.map((member) => <li key={member.id}><span>{member.displayName}{member.kind === "guest" && " · 게스트"}</span><button type="button" disabled={saving} onClick={() => save(member)}>재참여</button></li>) : <li>제외된 멤버가 없어요.</li>}</ul></section>
        <section><h3>등록 회원 추가</h3><ul className="member-records">{availableUsers.length ? availableUsers.map((user) => <li key={user.id}><span>{user.nickname}</span><button type="button" disabled={saving} onClick={() => save({ id: user.id, kind: "registered", userId: user.id, active: true })}>추가</button></li>) : <li>추가할 등록 회원이 없어요.</li>}</ul></section>
        <form onSubmit={addGuest}><label htmlFor="guest-name">게스트 이름</label><div className="member-guest-input"><input id="guest-name" value={guestName} maxLength="16" disabled={saving} onChange={(event) => setGuestName(event.target.value)} /><button type="submit" disabled={saving}>{saving ? "저장 중…" : "게스트 추가"}</button></div></form>
        {error && <p className="expense-form-error" role="alert">{error}</p>}
      </div>
      <div className="expense-dialog-actions"><button type="button" onClick={close} disabled={saving}>취소</button></div>
    </section>
  </div>;
}
