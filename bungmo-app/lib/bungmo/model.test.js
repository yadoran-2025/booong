import assert from "node:assert/strict";
import test from "node:test";
import * as model from "./model.js";
import { explicitMeeting, meetingHours, meetingSelection, normalizeMeeting, selectedMeetingDate, slotId, validateItineraryDraft, validateMeetingDraft, validateNickname } from "./model.js";

test("날짜와 시간을 안정적인 슬롯 ID로 만든다", () => {
  assert.equal(slotId("2026-08-14", 9), "2026-08-14-09");
});

test("닉네임의 공백을 정리하고 16자로 제한한다", () => {
  assert.equal(validateNickname("  재영  "), "재영");
  assert.throws(() => validateNickname(""), /닉네임/);
  assert.throws(() => validateNickname("12345678901234567"), /16자/);
});

test("모임 문서를 화면에서 쓰는 형태로 정규화한다", () => {
  assert.deepEqual(normalizeMeeting({ id: "m8", round: 8, title: "화천", candidateDates: ["2026-08-14"] }), {
    id: "m8",
    round: 8,
    title: "화천",
    location: "",
    status: "planning",
    candidateDates: ["2026-08-14"],
    startHour: 10,
    endHour: 22,
    startDate: null,
    endDate: null
  });
});

test("완료 모임만 있어도 첫 모임을 기본 선택한다", () => {
  const meetings = [{ id: "completed", status: "completed" }];
  assert.equal(model.initialMeeting?.(meetings, null)?.id, "completed");
});

test("저장된 ID가 있을 때만 모임을 명시적으로 선택한다", () => {
  const meetings = [{ id: "m1", title: "춘천" }, { id: "m2", title: "서울" }];
  assert.equal(explicitMeeting(meetings, null), null);
  assert.equal(explicitMeeting(meetings, "missing"), null);
  assert.equal(explicitMeeting(meetings, "m2")?.title, "서울");
});

test("모임 선택은 의미 있는 변경만 알린다", () => {
  let onChange = (meeting) => calls.push(["select:first", meeting?.id ?? null, meeting?.title ?? null]);
  let onUpdate = (meeting) => calls.push(["update:first", meeting?.id ?? null, meeting?.title ?? null]);
  let previous;
  const calls = [];
  const snapshot = (meetings, savedId) => {
    const next = meetingSelection(meetings, savedId, previous);
    previous = next;
    if (next.selectionChanged) onChange(next.meeting);
    else if (next.dataChanged) onUpdate(next.meeting);
  };

  snapshot([{ id: "m1", title: "춘천", status: "planning" }, { id: "m2", title: "서울", status: "upcoming" }], "m1");
  onChange = (meeting) => calls.push(["select:latest", meeting?.id ?? null, meeting?.title ?? null]);
  onUpdate = (meeting) => calls.push(["update:latest", meeting?.id ?? null, meeting?.title ?? null]);
  snapshot([{ id: "m1", title: "춘천", status: "planning" }, { id: "m2", title: "서울", status: "upcoming" }], "m1");
  snapshot([{ id: "m1", title: "화천", status: "planning" }, { id: "m2", title: "서울", status: "upcoming" }], "m1");
  snapshot([{ id: "m2", title: "서울", status: "upcoming" }], "m1");
  snapshot([{ id: "m2", title: "서울", status: "upcoming" }], "m1");
  snapshot([], "m2");
  snapshot([], "m2");

  assert.deepEqual(calls, [
    ["select:first", "m1", "춘천"],
    ["update:latest", "m1", "화천"],
    ["select:latest", "m2", "서울"],
    ["select:latest", null, null]
  ]);
});

test("현재 후보 날짜가 사라지면 첫 후보 날짜로 이동한다", () => {
  assert.equal(selectedMeetingDate(["2026-09-13", "2026-09-14"], "2026-09-12"), "2026-09-13");
  assert.equal(selectedMeetingDate(["2026-09-13", "2026-09-14"], "2026-09-14"), "2026-09-14");
  assert.equal(selectedMeetingDate([], "2026-09-14"), "");
});

test("모임별 시작·종료 시간으로 시간 칸을 만든다", () => {
  assert.deepEqual(meetingHours({ startHour: 10, endHour: 13 }), [10, 11, 12]);
});

test("모임 초안의 필수 값과 날짜·시간 범위를 검증한다", () => {
  assert.deepEqual(validateMeetingDraft({ round: 8, title: "  화천  ", status: "upcoming", candidateDates: [], startHour: 10, endHour: 22, startDate: "2026-08-14", endDate: "2026-08-15" }), { round: 8, title: "화천", status: "upcoming", candidateDates: [], startHour: 10, endHour: 22, startDate: "2026-08-14", endDate: "2026-08-15" });
  assert.throws(() => validateMeetingDraft({ round: 0, title: "모임", status: "planning", candidateDates: ["2026-08-14"], startHour: 10, endHour: 22 }), /회차/);
  assert.throws(() => validateMeetingDraft({ round: 1, title: "모임", status: "planning", candidateDates: [], startHour: 10, endHour: 22 }), /후보 날짜/);
  assert.throws(() => validateMeetingDraft({ round: 1, title: "모임", status: "upcoming", candidateDates: [], startHour: 22, endHour: 10 }), /종료 시간/);
});

test("여행 일정은 엄격한 날짜와 하루 시간 범위를 검증한다", () => {
  assert.deepEqual(validateItineraryDraft({ day: "2026-08-14", startMinutes: 600, endMinutes: 630, title: "  점심  ", placeName: "  춘천역  " }, { startDate: "2026-08-14", endDate: "2026-08-15" }), { day: "2026-08-14", startMinutes: 600, endMinutes: 630, title: "점심", placeName: "춘천역" });
  for (const day of ["", "2026-8-14", "2026-02-30"]) assert.throws(() => validateItineraryDraft({ day, startMinutes: 600, endMinutes: 630, title: "점심", placeName: "춘천역" }), /날짜/);
  assert.throws(() => validateItineraryDraft({ day: "2026-08-16", startMinutes: 600, endMinutes: 630, title: "점심", placeName: "춘천역" }, { startDate: "2026-08-14", endDate: "2026-08-15" }), /모임 기간/);
  assert.throws(() => validateItineraryDraft({ day: "2026-08-14", startMinutes: -1, endMinutes: 630, title: "점심", placeName: "춘천역" }), /종료 시간/);
  assert.throws(() => validateItineraryDraft({ day: "2026-08-14", startMinutes: 600, endMinutes: 1440, title: "점심", placeName: "춘천역" }), /종료 시간/);
  assert.throws(() => validateItineraryDraft({ day: "2026-08-14", startMinutes: 600, endMinutes: 600, title: "점심", placeName: "춘천역" }), /종료 시간/);
  assert.throws(() => validateItineraryDraft({ day: "2026-08-14", startMinutes: 630, endMinutes: 600, title: "점심", placeName: "춘천역" }), /종료 시간/);
});
