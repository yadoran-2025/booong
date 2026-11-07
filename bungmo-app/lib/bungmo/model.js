export const BUNGMO_USERS = "bungmoUsers";
export const BUNGMO_MEETINGS = "bungmoMeetings";
export const MEETING_STATUSES = ["planning", "upcoming", "completed"];
export const AVAILABILITY_STATES = ["available", "unavailable"];

export const slotId = (date, hour) => `${date}-${String(hour).padStart(2, "0")}`;

export const meetingHours = ({ startHour, endHour }) =>
  Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

export function validateNickname(value) {
  const nickname = value.trim();
  if (!nickname) throw new Error("닉네임을 입력해 주세요.");
  if (nickname.length > 16) throw new Error("닉네임은 16자까지 입력할 수 있어요.");
  return nickname;
}

export function normalizeMeeting(data) {
  return {
    id: data.id,
    round: data.round,
    title: data.title,
    location: data.location ?? "",
    status: data.status ?? "planning",
    candidateDates: data.candidateDates ?? [],
    startHour: data.startHour ?? 10,
    endHour: data.endHour ?? 22,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null
  };
}

export const initialMeeting = (meetings, savedId) =>
  meetings.find((meeting) => meeting.id === savedId)
  ?? meetings.find((meeting) => ["planning", "upcoming"].includes(meeting.status))
  ?? meetings[0]
  ?? null;

export const explicitMeeting = (meetings, savedId) =>
  savedId ? meetings.find((meeting) => meeting.id === savedId) ?? null : null;

export function meetingSelection(meetings, savedId, previous) {
  const meeting = meetings.find((item) => item.id === savedId)
    ?? meetings.find((item) => ["planning", "upcoming"].includes(item.status))
    ?? meetings[0]
    ?? null;
  const id = meeting?.id ?? null;
  const version = JSON.stringify(meeting);
  return {
    meeting,
    id,
    version,
    selectionChanged: id !== previous?.id,
    dataChanged: id === previous?.id && version !== previous?.version
  };
}

export const selectedMeetingDate = (candidateDates, currentDate) =>
  candidateDates.includes(currentDate) ? currentDate : candidateDates[0] ?? "";

export function validateMeetingDraft({ round, title, status, candidateDates, startHour, endHour, startDate, endDate }) {
  if (!Number.isSafeInteger(round) || round < 1) throw new Error("모임 회차는 1 이상의 숫자여야 해요.");
  if (!title.trim()) throw new Error("모임 이름을 입력해 주세요.");
  if (candidateDates.length < 1 && status === "planning") throw new Error("후보 날짜를 한 개 이상 추가해 주세요.");
  if (!Number.isSafeInteger(startHour) || !Number.isSafeInteger(endHour) || endHour <= startHour) throw new Error("종료 시간은 시작 시간보다 늦어야 해요.");
  if (startDate && endDate && endDate < startDate) throw new Error("종료일은 시작일보다 빠를 수 없어요.");
  return { round, title: title.trim(), status, candidateDates, startHour, endHour, startDate: startDate || null, endDate: endDate || null };
}

export function validateItineraryDraft({ day, startMinutes, endMinutes, title, placeName }, meeting) {
  if (!title.trim()) throw new Error("일정 이름을 입력해 주세요.");
  if (!placeName.trim()) throw new Error("장소를 입력해 주세요.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00.000Z`);
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error("일정 날짜를 입력해 주세요.");
  if (meeting?.startDate && meeting?.endDate && (day < meeting.startDate || day > meeting.endDate)) throw new Error("일정 날짜는 모임 기간 안에서 선택해 주세요.");
  if (!Number.isSafeInteger(startMinutes) || !Number.isSafeInteger(endMinutes) || startMinutes < 0 || endMinutes >= 1440 || endMinutes <= startMinutes) throw new Error("종료 시간은 시작 시간보다 늦어야 해요.");
  return { day, startMinutes, endMinutes, title: title.trim(), placeName: placeName.trim() };
}
