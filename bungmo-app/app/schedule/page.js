"use client";

import { useEffect, useState } from "react";
import { useBungmoWorkspace } from "../components/BungmoWorkspace.js";
import ScheduleBoard from "../components/ScheduleBoard.js";
import { subscribeMeetingMembers, subscribeUsers } from "../../lib/bungmo/repository.js";

function Schedule({ user, profile, meeting }) {
  const [memberRecords, setMemberRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [memberError, setMemberError] = useState("");
  const [userError, setUserError] = useState("");
  const [memberRetry, setMemberRetry] = useState(0);
  const [userRetry, setUserRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setUsersLoading(true); setUserError("");
    const stop = subscribeUsers((items) => {
      if (!active) return;
      setUsers(items); setUsersLoading(false); setUserError("");
    }, () => {
      if (!active) return;
      setUsers([]); setUsersLoading(false); setUserError("회원 이름을 불러오지 못했어요.");
    });
    return () => { active = false; stop(); };
  }, [userRetry]);

  useEffect(() => {
    let active = true;
    setMemberRecords([]); setMembersLoading(true); setMemberError("");
    const stop = subscribeMeetingMembers(meeting.id, (items) => {
      if (!active) return;
      setMemberRecords(items); setMembersLoading(false); setMemberError("");
    }, () => {
      if (!active) return;
      setMemberRecords([]); setMembersLoading(false); setMemberError("모임 멤버를 불러오지 못했어요.");
    });
    return () => { active = false; stop(); };
  }, [meeting.id, memberRetry]);

  const loading = membersLoading || usersLoading;
  const error = memberError || userError;
  return <main className="service-page"><div className="service-heading"><div><h1>일정 조율</h1></div></div>{userError && <div className="subscription-error" role="alert"><span>{userError}</span><button type="button" onClick={() => setUserRetry((value) => value + 1)}>다시 시도</button></div>}{memberError && <div className="subscription-error" role="alert"><span>{memberError}</span><button type="button" onClick={() => setMemberRetry((value) => value + 1)}>다시 시도</button></div>}{loading ? <section className="service-empty" role="status"><h2>모임 멤버를 불러오는 중이에요.</h2><p>잠시만 기다려 주세요.</p></section> : !error && <ScheduleBoard key={meeting.id} meeting={meeting} user={user} profile={profile} memberRecords={memberRecords} users={users} />}</main>;
}

export default function SchedulePage() {
  const { user, profile, meeting } = useBungmoWorkspace();
  return <Schedule key={meeting.id} user={user} profile={profile} meeting={meeting} />;
}
