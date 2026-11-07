export const DAYS = [
  { key: "0807", date: "8월 7일", weekday: "금", day: "DAY 1" },
  { key: "0808", date: "8월 8일", weekday: "토", day: "DAY 2" },
  { key: "0809", date: "8월 9일", weekday: "일", day: "DAY 3" }
];

export const HOURS = Array.from({ length: 16 }, (_, index) => index + 8);

export const slotId = (dayKey, hour) =>
  `${dayKey}-${String(hour).padStart(2, "0")}`;

export const slotLabel = (id) => {
  const [dayKey, hour] = id.split("-");
  const day = DAYS.find((item) => item.key === dayKey);
  return `${day?.date ?? ""} ${hour}:00`;
};

export function nextAvailability(current, slot, brush) {
  const next = { ...current };
  if (brush === null) {
    delete next[slot];
  } else {
    next[slot] = brush;
  }
  return next;
}
