const isoDay = date => date.toISOString().slice(0, 10);

export function calendarDays(day) {
  const first = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const count = Math.ceil((first.getUTCDay() + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(1 - first.getUTCDay() + index);
    return isoDay(date);
  });
}

export function shiftCalendarMonth(day, offset) {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return isoDay(date);
}

export const isMeetingDay = (day, meeting) =>
  (!meeting.startDate || day >= meeting.startDate) && (!meeting.endDate || day <= meeting.endDate);
