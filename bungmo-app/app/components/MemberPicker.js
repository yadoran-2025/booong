"use client";

import { useState } from "react";
import { normalizeMemberDraft, resolveMeetingMembers } from "../../lib/bungmo/member.js";
import { deactivateMeetingMember, saveMeetingMember } from "../../lib/bungmo/repository.js";

export default function MemberPicker({ meetingId, records, users }) {
  const [query, setQuery] = useState("");
  const [guestName, setGuestName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const members = resolveMeetingMembers(records, users, { activeOnly: false });
  const activeMembers = members.filter(member => member.active);
  const keyword = query.trim().toLocaleLowerCase("ko");
  const profiles = users.filter(user => user.profileId && user.nickname.toLocaleLowerCase("ko").includes(keyword));

  async function save(member) {
    setSaving(true); setError("");
    try {
      await saveMeetingMember(meetingId, { ...(member.id && { id: member.id }), ...normalizeMemberDraft(member) });
      if (member.kind === "guest") setGuestName("");
    } catch (error) { setError(error.message || "참가자를 추가하지 못했어요."); }
    finally { setSaving(false); }
  }

  async function exclude(member) {
    setSaving(true); setError("");
    try { await deactivateMeetingMember(meetingId, member.id); }
    catch { setError("참가자를 제외하지 못했어요."); }
    finally { setSaving(false); }
  }

  return <div className="member-workspace">
    <section className="member-directory" aria-labelledby="member-directory-title">
      <header><h2 id="member-directory-title">BOOONG 프로필</h2><label className="sr-only" htmlFor="member-search">프로필 이름 검색</label><input className="field__input" id="member-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름 검색" /></header>
      <div className="member-profile-grid">{profiles.map(user => {
        const selected = records.find(member => member.id === user.id && member.active);
        return <button className="member-profile" type="button" key={user.id} aria-pressed={Boolean(selected)} disabled={saving} onClick={() => selected ? exclude(selected) : save({ id: user.id, kind: "profile", profileId: user.profileId, displayName: user.nickname })}>
          <span className="member-avatar" aria-hidden="true">{user.nickname.slice(0, 1)}</span><strong>{user.nickname}</strong><span className="member-check" aria-hidden="true">{selected ? "✓" : "+"}</span>
        </button>;
      })}</div>
      {!profiles.length && <p className="member-empty">검색 결과가 없어요.</p>}
    </section>
    <section className="member-selection" aria-labelledby="member-selection-title">
      <header><h2 id="member-selection-title">이번 모임 참가자 <span>{activeMembers.length}</span></h2></header>
      {activeMembers.length ? <ul className="member-selection-list">{activeMembers.map(member => <li key={member.id}><span><strong>{member.displayName}</strong>{member.kind === "guest" && <small>게스트</small>}{member.kind === "registered" && <small>기존 참가 기록</small>}</span><button className="btn btn--ghost" type="button" disabled={saving} onClick={() => exclude(member)} aria-label={`${member.displayName} 참가 제외`}>제외</button></li>)}</ul> : <p className="member-empty">함께할 사람을 프로필에서 선택하세요.</p>}
      <form className="member-guest-form" onSubmit={event => { event.preventDefault(); save({ kind: "guest", displayName: guestName }); }}><label htmlFor="guest-name">게스트 추가</label><div><input className="field__input" id="guest-name" value={guestName} maxLength={16} disabled={saving} onChange={event => setGuestName(event.target.value)} placeholder="이름" required /><button className="btn btn--ghost" type="submit" disabled={saving}>추가</button></div></form>
      {members.some(member => !member.active && member.kind === "guest") && <section className="member-returning"><h3>이전 게스트</h3>{members.filter(member => !member.active && member.kind === "guest").map(member => <button className="btn btn--ghost" key={member.id} type="button" disabled={saving} onClick={() => save(member)}>{member.displayName} 다시 추가</button>)}</section>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </div>;
}
