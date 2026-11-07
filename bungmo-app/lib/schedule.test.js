import test from "node:test";
import assert from "node:assert/strict";
import { nextAvailability, slotId, slotLabel } from "./schedule.js";

test("시간 칸 ID와 표시 문구를 안정적으로 만든다", () => {
  assert.equal(slotId("0807", 8), "0807-08");
  assert.equal(slotLabel("0809-23"), "8월 9일 23:00");
});

test("드래그 칠하기는 다른 시간 칸을 보존한다", () => {
  assert.deepEqual(
    nextAvailability({ "0807-08": "available" }, "0807-09", "unavailable"),
    { "0807-08": "available", "0807-09": "unavailable" }
  );
});

test("이미 칠한 시간 칸을 다시 누르면 응답을 지운다", () => {
  assert.deepEqual(
    nextAvailability(
      { "0807-08": "available", "0807-09": "unavailable" },
      "0807-08",
      null
    ),
    { "0807-09": "unavailable" }
  );
});
