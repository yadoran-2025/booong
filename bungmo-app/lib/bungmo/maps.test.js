import assert from "node:assert/strict";
import test from "node:test";
import { googleMapsSearchUrl } from "./maps.js";

test("장소명을 Google Maps 검색 URL로 만든다", () => {
  assert.equal(googleMapsSearchUrl("용산역 3번 출구"), "https://www.google.com/maps/search/?api=1&query=%EC%9A%A9%EC%82%B0%EC%97%AD%203%EB%B2%88%20%EC%B6%9C%EA%B5%AC");
});
