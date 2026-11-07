"use client";

import AuthGate from "../components/AuthGate.js";
import MeetingMembers from "../components/MeetingMembers.js";
import MeetingWorkspace from "../components/MeetingWorkspace.js";

function MembersService({ profile, meeting }) {
  return <main className="service-page">
    <div className="service-heading"><div><span>MEETING MEMBERS</span><h1>{meeting.title} 멤버</h1><p>이 모임에 참여할 멤버를 정하고, 필요하면 객원도 추가할 수 있어요.</p></div></div>
    <MeetingMembers key={meeting.id} meetingId={meeting.id} profile={profile} />
  </main>;
}

export default function MembersPage() {
  return <AuthGate>{({ user, profile }) => <MeetingWorkspace user={user} profile={profile}>{(meeting) => <MembersService profile={profile} meeting={meeting} />}</MeetingWorkspace>}</AuthGate>;
}
