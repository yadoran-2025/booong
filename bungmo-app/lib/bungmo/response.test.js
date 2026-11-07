import assert from "node:assert/strict";
import test from "node:test";

import { changeAvailability } from "./response.js";

test("한 일정 칸 변경은 로컬 미리보기와 서버 쓰기에 쓸 단일 칸 delta를 만든다", () => {
  assert.deepEqual(changeAvailability({ "slot-a": "available" }, {}, "slot-b", "unavailable"), {
    availability: { "slot-a": "available", "slot-b": "unavailable" },
    delta: { "slot-b": "unavailable" }
  });
});

test("debounce 안의 여러 칸 변경은 기존 전체 map 없이 변경된 칸만 모은다", () => {
  const first = changeAvailability({ "old-slot": "available" }, {}, "slot-a", "available");
  const second = changeAvailability(first.availability, first.delta, "slot-b", "unavailable");

  assert.deepEqual(second, {
    availability: { "old-slot": "available", "slot-a": "available", "slot-b": "unavailable" },
    delta: { "slot-a": "available", "slot-b": "unavailable" }
  });
});
