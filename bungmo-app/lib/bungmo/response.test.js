import assert from "node:assert/strict";
import test from "node:test";

import { availabilityGroups, changeAvailability, nextAvailability } from "./response.js";

test("빈 칸은 클릭마다 가능 → 어려움 → 빈 칸을 순환하고 다른 칸은 보존한다", () => {
  let availability = { other: "unavailable" };
  for (const expected of ["available", "unavailable", "undecided", "available"]) {
    const change = changeAvailability(availability, {}, "slot", nextAvailability(availability.slot));
    assert.deepEqual(change.delta, { slot: expected });
    assert.deepEqual(change.availability, { other: "unavailable", slot: expected });
    availability = change.availability;
  }
  assert.equal(nextAvailability(null), "available");
});

test("한 일정 칸 변경은 로컬 미리보기와 서버 쓰기에 쓸 단일 칸 delta를 만든다", () => {
  assert.deepEqual(changeAvailability({ "slot-a": "available" }, {}, "slot-b", "unavailable"), {
    availability: { "slot-a": "available", "slot-b": "unavailable" },
    delta: { "slot-b": "unavailable" }
  });
});

test("비교는 해당 시간의 가능·어려움·미응답 참가자를 구분한다", () => {
  const people = [{ id: "a", availability: { slot: "available" } }, { id: "b", availability: { slot: "unavailable" } }, { id: "c" }, { id: "d", availability: { slot: "undecided" } }];
  const groups = availabilityGroups(people, "slot");
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([state, values]) => [state, values.map(person => person.id)])), { available: ["a"], unavailable: ["b"], undecided: ["c", "d"] });
});

test("debounce 안의 여러 칸 변경은 기존 전체 map 없이 변경된 칸만 모은다", () => {
  const first = changeAvailability({ "old-slot": "available" }, {}, "slot-a", "available");
  const second = changeAvailability(first.availability, first.delta, "slot-b", "unavailable");

  assert.deepEqual(second, {
    availability: { "old-slot": "available", "slot-a": "available", "slot-b": "unavailable" },
    delta: { "slot-a": "available", "slot-b": "unavailable" }
  });
});
