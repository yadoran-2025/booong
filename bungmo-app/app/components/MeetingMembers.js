"use client";

import { useEffect, useState } from "react";
import { subscribeMeetingMembers, subscribeUsers } from "../../lib/bungmo/repository.js";
import MemberPicker from "./MemberPicker.js";

export default function MeetingMembers({ meetingId }) {
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [retry, setRetry] = useState(0);

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

  const error = membersError || usersError;
  const loading = membersLoading || usersLoading;

  return <section>
    {error && <p className="member-roster-error" role="alert">{error}<button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></p>}
    {loading ? <p className="member-empty" role="status">참가자를 불러오는 중이에요.</p> : !error && <MemberPicker meetingId={meetingId} records={records} users={users} />}
  </section>;
}
