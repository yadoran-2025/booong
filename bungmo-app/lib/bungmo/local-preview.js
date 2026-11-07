const localUser = { uid: "local-preview-user", email: "noamchomsky1571@gmail.com", emailVerified: true, photoURL: "", bungmoOperator: true };
const localProfile = { id: localUser.uid, nickname: "재영", email: localUser.email, photoURL: "" };

export function isLocalPreview({ nodeEnv = typeof process === "undefined" ? "" : process.env.NODE_ENV, hostname = typeof window === "undefined" ? "" : window.location.hostname } = {}) {
  return nodeEnv === "development" && ["localhost", "127.0.0.1"].includes(hostname);
}

export const previewIdentity = () => ({ user: { ...localUser }, profile: { ...localProfile } });
let generatedId = 0;
const nextId = (type) => globalThis.crypto?.randomUUID?.() ?? `preview-${type}-${++generatedId}`;

const seed = () => ({
  users: [localProfile, { id: "minji", nickname: "민지", email: "minji@example.com" }, { id: "hyeon", nickname: "현", email: "hyeon@example.com" }, { id: "seojun", nickname: "서준", email: "seojun@example.com" }, { id: "yuna", nickname: "유나", email: "yuna@example.com", active: false }],
  meetings: [
    { id: "preview-planning", round: 9, title: "가을 캠핑", location: "가평", status: "planning", candidateDates: ["2026-09-12", "2026-09-13"], startHour: 10, endHour: 22, startDate: "2026-09-12", endDate: "2026-09-13" },
    { id: "preview-upcoming", round: 8, title: "여름 바다", location: "강릉", status: "upcoming", candidateDates: [], startHour: 10, endHour: 22, startDate: "2026-08-22", endDate: "2026-08-23" }
  ],
  members: {
    "preview-planning": [
      { id: localUser.uid, kind: "registered", userId: localUser.uid, active: true },
      { id: "minji", kind: "registered", userId: "minji", active: true },
      { id: "hyeon", kind: "registered", userId: "hyeon", active: true },
      { id: "seojun", kind: "registered", userId: "seojun", active: true },
      { id: "yuna", kind: "registered", userId: "yuna", active: true },
      { id: "preview-guest", kind: "guest", displayName: "동현", active: true }
    ],
    "preview-upcoming": [
      { id: localUser.uid, kind: "registered", userId: localUser.uid, active: true }
    ]
  },
  responses: { "preview-planning": [
    { id: localUser.uid, displayName: "재영", availability: { "2026-09-12-10": "available" } },
    { id: "minji", displayName: "민지", availability: { "2026-09-12-10": "available" } },
    { id: "hyeon", displayName: "현", availability: { "2026-09-12-11": "unavailable" } },
    { id: "seojun", displayName: "서준", availability: { "2026-09-13-12": "available" } }
  ] },
  expenses: { "preview-planning": [
    { id: "preview-expense-1", title: "장보기", payerId: localUser.uid, participantIds: [localUser.uid, "minji", "hyeon"], amount: 54000, settled: false },
    { id: "preview-expense-2", title: "캠핑장", payerId: "minji", participantIds: [localUser.uid, "minji", "hyeon", "seojun"], amount: 80000, settled: false },
    { id: "preview-expense-3", title: "커피", payerId: "hyeon", participantIds: ["hyeon", "seojun"], amount: 12000, settled: true },
    { id: "preview-expense-4", title: "숯·장작", payerId: "seojun", participantIds: [localUser.uid, "minji", "hyeon", "seojun", "yuna"], amount: 37500, settled: false },
    { id: "preview-expense-5", title: "아침 식사", payerId: "yuna", participantIds: [localUser.uid, "minji", "seojun", "yuna"], amount: 46000, settled: false }
  ] },
  expenseReadiness: { "preview-planning": [] },
  itinerary: { "preview-planning": [
    { id: "preview-event-1", day: "2026-09-12", startMinutes: 600, endMinutes: 660, title: "출발", placeName: "잠실역" },
    { id: "preview-event-2", day: "2026-09-12", startMinutes: 720, endMinutes: 780, title: "장보기", placeName: "가평마트" },
    { id: "preview-event-3", day: "2026-09-12", startMinutes: 900, endMinutes: 1020, title: "저녁 식사", placeName: "캠핑장" },
    { id: "preview-event-4", day: "2026-09-13", startMinutes: 600, endMinutes: 660, title: "아침 산책", placeName: "자라섬" }
  ] }
});

export function createLocalPreviewStore(initial = seed()) {
  const data = initial;
  const listeners = new Map();
  const key = (type, meetingId = "") => `${type}:${meetingId}`;
  const publish = (type, meetingId) => (listeners.get(key(type, meetingId)) ?? []).forEach((callback) => callback(store.read(type, meetingId)));
  const collection = (type, meetingId) => meetingId ? ((data[type] ??= {})[meetingId] ??= []) : (data[type] ??= []);
  const store = {
    read(type, meetingId) { return structuredClone(collection(type, meetingId)); },
    subscribe(type, meetingId, callback) {
      const listenerKey = key(type, meetingId); const set = listeners.get(listenerKey) ?? new Set();
      set.add(callback); listeners.set(listenerKey, set); callback(store.read(type, meetingId));
      return () => set.delete(callback);
    },
    save(type, meetingId, item, id = item.id) {
      const items = collection(type, meetingId); const next = { ...item, id: id ?? nextId(type) };
      const index = items.findIndex((current) => current.id === next.id);
      if (index < 0) items.push(next); else items[index] = { ...items[index], ...next };
      publish(type, meetingId); return next.id;
    },
    remove(type, meetingId, id) {
      const remaining = collection(type, meetingId).filter((item) => item.id !== id);
      if (meetingId) data[type][meetingId] = remaining; else data[type].splice(0, data[type].length, ...remaining);
      publish(type, meetingId);
    },
    update(type, meetingId, id, values) { return store.save(type, meetingId, values, id); }
  };
  return store;
}

export const localPreviewStore = createLocalPreviewStore();
