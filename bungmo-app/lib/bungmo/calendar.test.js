import assert from "node:assert/strict";
import test from "node:test";
import { calendarDays, isMeetingDay, shiftCalendarMonth } from "./calendar.js";

test("달력은 일요일부터 토요일까지 빈틈없이 월 전체를 표시한다", () => {
  const days = calendarDays("2026-11-24");
  assert.equal(days.length, 35);
  assert.equal(days[0], "2026-11-01");
  assert.equal(days.at(-1), "2026-12-05");
  assert.equal(new Set(days).size, days.length);
  const leap = calendarDays("2024-02-15");
  assert.equal(leap[0], "2024-01-28");
  assert.ok(leap.includes("2024-02-29"));
  assert.equal(leap.at(-1), "2024-03-02");
  assert.equal(calendarDays("2026-08-01").length, 42);
});

test("월 이동은 월말과 연도 경계에서도 유효한 첫날을 고른다", () => {
  assert.equal(shiftCalendarMonth("2026-01-31", 1), "2026-02-01");
  assert.equal(shiftCalendarMonth("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftCalendarMonth("2026-01-01", -1), "2025-12-01");
});

test("모임 기간은 양 끝을 포함하고 미확정 날짜는 제한하지 않는다", () => {
  const meeting = { startDate: "2026-11-24", endDate: "2026-12-04" };
  for (const day of ["2026-11-24", "2026-12-01", "2026-12-04"]) assert.ok(isMeetingDay(day, meeting));
  for (const day of ["2026-11-23", "2026-12-05"]) assert.equal(isMeetingDay(day, meeting), false);
  assert.ok(isMeetingDay("2026-11-09", {}));
});
