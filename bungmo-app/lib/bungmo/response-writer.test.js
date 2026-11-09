import assert from "node:assert/strict";
import test from "node:test";
import { createResponseWriter } from "./response-writer.js";

test("화면을 떠날 때 지연 중인 변경도 즉시 저장하고 같은 칸은 마지막 입력을 쓴다", async () => {
  const writes = [];
  const writer = createResponseWriter(async delta => writes.push(delta), () => {});
  writer.change({ a: "available" });
  writer.change({ a: "unavailable", b: "available" });
  await writer.flush();
  assert.deepEqual(writes, [{ a: "unavailable", b: "available" }]);
  assert.deepEqual(writer.pending(), {});
});

test("저장 중 추가한 변경은 앞선 저장 뒤에 직렬로 기록한다", async () => {
  const writes = [];
  let release;
  const writer = createResponseWriter(delta => { writes.push(delta); return writes.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(); }, () => {});
  writer.change({ a: "available" });
  const first = writer.flush();
  await Promise.resolve();
  writer.change({ a: "unavailable", b: "available" });
  const rest = writer.flush();
  assert.deepEqual(writer.pending(), { a: "unavailable", b: "available" });
  assert.equal(writes.length, 1);
  release();
  await Promise.all([first, rest]);
  assert.deepEqual(writes, [{ a: "available" }, { a: "unavailable", b: "available" }]);
});

test("실패한 변경은 잃지 않고 최신 입력과 합쳐 다시 저장한다", async () => {
  const writes = [], statuses = [];
  let fail = true;
  const writer = createResponseWriter(async delta => { if (fail) throw Error("offline"); writes.push(delta); }, state => statuses.push(state));
  writer.change({ a: "available", b: "unavailable" });
  await assert.rejects(writer.flush(), /offline/);
  assert.equal(statuses.at(-1), "error");
  fail = false;
  writer.change({ a: "undecided" });
  await writer.flush();
  assert.deepEqual(writes, [{ a: "undecided", b: "unavailable" }]);
  assert.equal(statuses.at(-1), "saved");
});
