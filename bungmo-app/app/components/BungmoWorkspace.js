"use client";

import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import AuthGate from "./AuthGate.js";
import MeetingWorkspace from "./MeetingWorkspace.js";

const WorkspaceContext = createContext(null);
export const useBungmoWorkspace = () => useContext(WorkspaceContext);

export default function BungmoWorkspace({ children }) {
  const pathname = usePathname();
  if (/\/access\/?$/.test(pathname)) return children;
  return <AuthGate>{({ user, profile }) => <MeetingWorkspace user={user} profile={profile}>{(meeting, selectMeeting) =>
    <WorkspaceContext.Provider value={{ user, profile, meeting, selectMeeting }}>{children}</WorkspaceContext.Provider>
  }</MeetingWorkspace>}</AuthGate>;
}
