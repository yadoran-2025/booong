"use client";

import Link from "next/link";

import MeetingMembers from "../components/MeetingMembers.js";
import { useBungmoWorkspace } from "../components/BungmoWorkspace.js";

function MembersService({ profile, meeting }) {
  return <main className="service-page">
    <div className="service-heading"><div><h1>함께하는 사람</h1></div><Link className="btn btn--ghost" href="/schedule/">일정 조율하기 →</Link></div>
    <MeetingMembers key={meeting.id} meetingId={meeting.id} profile={profile} />
  </main>;
}

export default function MembersPage() {
  const { profile, meeting } = useBungmoWorkspace();
  return <MembersService key={meeting.id} profile={profile} meeting={meeting} />;
}
