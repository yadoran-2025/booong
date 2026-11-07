"use client";

import { useEffect, useState } from "react";
import { resolveMeetingMembers } from "../../lib/bungmo/member.js";
import { subscribeMeetingMembers, subscribeUsers } from "../../lib/bungmo/repository.js";
import MemberDialog from "./MemberDialog.js";

export default function MeetingMembers({ meetingId, profile }) {
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [retry, setRetry] = useState(0);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    let active = true;
    setRecords([]);
    setMembersLoading(true);
    setMembersError("");
    const stop = subscribeMeetingMembers(meetingId, (items) => {
      if (!active) return;
      setRecords(items);
      setMembersLoading(false);
      setMembersError("");
    }, () => {
      if (!active) return;
      setMembersLoading(false);
      setMembersError("참여 멤버를 불러오지 못했어요.");
    });
    return () => { active = false; stop(); };
  }, [meetingId, retry]);

  useEffect(() => {
    let active = true;
    setUsers([]);
    setUsersLoading(true);
    setUsersError("");
    const stop = subscribeUsers((items) => {
      if (!active) return;
      setUsers(items);
      setUsersLoading(false);
      setUsersError("");
    }, () => {
      if (!active) return;
      setUsersLoading(false);
      setUsersError("회원 정보를 불러오지 못했어요.");
    });
    return () => { active = false; stop(); };
  }, [retry]);

  const members = resolveMeetingMembers(records, users);
  const registeredMembers = members.filter((member) => member.kind === "registered");
  const guestMembers = members.filter((member) => member.kind === "guest");
  const error = membersError || usersError;
  const loading = membersLoading || usersLoading;

  return <section className="member-roster">
    <header className="member-roster-summary"><div><span>MEMBER ROSTER</span><p><strong>{members.length}</strong><small>명이 함께해요</small></p><small className="member-roster-counts">등록 멤버 {registeredMembers.length} · 게스트 {guestMembers.length}</small></div><button type="button" onClick={() => setManaging(true)}>멤버 구성 바꾸기</button></header>
    {error && <p className="member-roster-error" role="alert">{error}<button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></p>}
    {loading ? <div className="member-roster-empty" role="status">참여 멤버를 불러오는 중이에요.</div> : members.length ? <div className="member-roster-groups">
      {registeredMembers.length > 0 && <section className="member-roster-group"><header><span>등록 멤버</span><small>등록 프로필 · {registeredMembers.length}명</small></header><ul className="member-roster-list">{registeredMembers.map((member) => <li key={member.id}><i>{member.displayName.slice(0, 1)}</i><div><strong>{member.displayName}</strong><span>운영자가 관리하는 등록 참가자</span></div><small>{member.id === profile.id ? "나" : "MEMBER"}</small></li>)}</ul></section>}
      {guestMembers.length > 0 && <section className="member-roster-group guests"><header><span>게스트</span><small>운영자가 기록 · {guestMembers.length}명</small></header><ul className="member-roster-list">{guestMembers.map((member) => <li key={member.id}><i>{member.displayName.slice(0, 1)}</i><div><strong>{member.displayName}</strong><span>이 모임에만 추가한 게스트</span></div><small>GUEST</small></li>)}</ul></section>}
    </div> : <div className="member-roster-empty"><strong>아직 참여 멤버가 없어요.</strong><span>멤버 구성 바꾸기에서 등록 회원이나 객원을 추가해 보세요.</span></div>}
    {managing && <MemberDialog meetingId={meetingId} records={records} users={users} onClose={() => setManaging(false)} />}
  </section>;
}
