export function normalizeMemberDraft({ kind, userId, displayName }) {
  if (kind === "registered" && userId) return { kind, userId, active: true };
  const name = displayName?.trim().slice(0, 16);
  if (kind !== "guest" || !name) throw new Error("객원 이름을 입력해 주세요.");
  return { kind, displayName: name, active: true };
}

export function resolveMeetingMembers(records, users, { activeOnly = true } = {}) {
  const names = new Map(users.map((user) => [user.id, user.nickname]));
  return records
    .filter((member) => !activeOnly || member.active)
    .map((member) => ({
      ...member,
      displayName: member.kind === "registered"
        ? names.get(member.userId) || member.userId.slice(0, 8)
        : member.displayName
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
}

export const editableScheduleMembers = (members, uid) =>
  members.filter((member) => member.active);
