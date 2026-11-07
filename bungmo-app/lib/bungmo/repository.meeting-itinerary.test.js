import assert from "node:assert/strict";
import test, { mock } from "node:test";

const calls = { add: [], update: [], remove: [], batchSet: [], batchCommits: 0 };
const timestamp = { timestamp: true };
const firestore = {
  addDoc: async (...args) => { calls.add.push(args); return { id: "new-record" }; },
  collection: (...args) => ({ path: args.slice(1).join("/") }),
  deleteDoc: async (...args) => { calls.remove.push(args); },
  doc: (parent, id = "generated-meeting") => ({ id, path: `${parent.path}/${id}` }),
  getDoc: async () => ({ exists: () => false }),
  onSnapshot: () => () => {},
  serverTimestamp: () => timestamp,
  setDoc: async () => {},
  updateDoc: async (...args) => { calls.update.push(args); },
  writeBatch: () => ({
    set: (reference, values) => calls.batchSet.push({ reference, values }),
    commit: async () => { calls.batchCommits += 1; }
  })
};

mock.module("firebase/firestore", { exports: firestore });
mock.module("../firebase.js", { exports: { db: "database" } });
const { deleteItinerary, deleteMeeting, saveItinerary, saveMeeting } = await import("./repository.js");

test("새 모임과 생성자 멤버십을 한 batch로 저장한다", async () => {
  const draft = { round: 8, title: "화천", location: "강원", status: "upcoming", candidateDates: [], startHour: 10, endHour: 22, startDate: "2026-08-14", endDate: "2026-08-15" };
  assert.equal(await saveMeeting(draft, "u1"), "generated-meeting");
  assert.deepEqual(calls.batchSet.map(({ reference }) => reference.path), ["bungmoMeetings/generated-meeting", "bungmoMeetings/generated-meeting/members/u1"]);
  assert.deepEqual(calls.batchSet.map(({ values }) => values), [
    { ...draft, creatorId: "u1", createdAt: timestamp, updatedAt: timestamp },
    { kind: "registered", userId: "u1", active: true, createdAt: timestamp, updatedAt: timestamp }
  ]);
  assert.equal(calls.batchCommits, 1);
});

test("새 모임에는 생성자 ID가 필요하다", async () => {
  await assert.rejects(() => saveMeeting({ title: "생성자 없음" }), /creatorId/);
});

test("기존 모임 수정은 기존 문서만 갱신한다", async () => {
  const draft = { round: 8, title: "화천", location: "강원", status: "upcoming", candidateDates: [], startHour: 10, endHour: 22, startDate: "2026-08-14", endDate: "2026-08-15" };
  await saveMeeting({ id: "meeting-8", ...draft, extra: "preserved" });
  assert.deepEqual(calls.update.pop(), [{ id: "meeting-8", path: "bungmoMeetings/meeting-8" }, { ...draft, extra: "preserved", updatedAt: timestamp }]);
});

test("여행 일정과 모임 삭제는 선택한 문서만 삭제한다", async () => {
  const event = { day: "2026-08-14", startMinutes: 600, endMinutes: 660, title: "점심", placeName: "춘천역" };
  await saveItinerary("meeting-8", event);
  assert.deepEqual(calls.add.pop(), [{ path: "bungmoMeetings/meeting-8/itinerary" }, { ...event, createdAt: timestamp, updatedAt: timestamp }]);
  await saveItinerary("meeting-8", { id: "event-1", ...event, note: "preserved" });
  assert.deepEqual(calls.update.pop(), [{ id: "event-1", path: "bungmoMeetings/meeting-8/itinerary/event-1" }, { ...event, note: "preserved", updatedAt: timestamp }]);
  await deleteItinerary("meeting-8", "event-1");
  await deleteMeeting("meeting-8");
  assert.deepEqual(calls.remove.pop(), [{ id: "meeting-8", path: "bungmoMeetings/meeting-8" }]);
  assert.deepEqual(calls.remove.pop(), [{ id: "event-1", path: "bungmoMeetings/meeting-8/itinerary/event-1" }]);
});
