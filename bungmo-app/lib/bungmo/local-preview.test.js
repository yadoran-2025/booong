import assert from "node:assert/strict";
import test from "node:test";
import { createLocalPreviewStore, isLocalPreview, isLocalOperator } from "./local-preview.js";

test('실제 데이터 로컬 운영자는 서버 표식과 루프백 주소가 모두 필요하다', () => {
  assert.equal(isLocalOperator({ hostname: 'localhost', enabled: true }), true);
  assert.equal(isLocalOperator({ hostname: '127.0.0.1', enabled: false }), false);
  assert.equal(isLocalOperator({ hostname: 'booong.vercel.app', enabled: true }), false);
  assert.equal(isLocalOperator({ hostname: 'localhost.evil.example', enabled: true }), false);
});

test("로컬 미리보기는 개발 루프백 주소에서만 켜진다", () => {
  assert.equal(isLocalPreview({ nodeEnv: "development", hostname: "localhost" }), true);
  assert.equal(isLocalPreview({ nodeEnv: "development", hostname: "127.0.0.1" }), true);
  assert.equal(isLocalPreview({ nodeEnv: "production", hostname: "localhost" }), false);
  assert.equal(isLocalPreview({ nodeEnv: "development", hostname: "bungmo.test" }), false);
});

test("로컬 저장소는 쓰기 후 구독자에게 갱신을 알린다", () => {
  const store = createLocalPreviewStore({ expenses: { meeting: [] } });
  const snapshots = [];
  const stop = store.subscribe("expenses", "meeting", (items) => snapshots.push(items));
  store.save("expenses", "meeting", { id: "expense", amount: 1000, settled: false });
  stop();
  assert.deepEqual(snapshots, [[], [{ id: "expense", amount: 1000, settled: false }]]);
});

test("즉시 만든 미리보기 항목은 서로 다른 ID로 모두 구독된다", () => {
  const store = createLocalPreviewStore({ expenses: { meeting: [] } });
  const snapshots = [];
  store.subscribe("expenses", "meeting", (items) => snapshots.push(items));
  const first = store.save("expenses", "meeting", { amount: 1000 });
  const second = store.save("expenses", "meeting", { amount: 2000 });
  assert.notEqual(first, second);
  assert.deepEqual(snapshots.at(-1).map((item) => item.amount), [1000, 2000]);
  assert.equal(snapshots.length, 3);
});

test("local preview initializes a newly introduced meeting collection", () => {
  const store = createLocalPreviewStore({ expenses: {} });
  assert.deepEqual(store.read("transferSettlements", "meeting"), []);
  store.save("transferSettlements", "meeting", { id: "a|b", settled: true });
  assert.deepEqual(store.read("transferSettlements", "meeting"), [{ id: "a|b", settled: true }]);
});

test("미리보기 모임별 구성원은 서로 격리된다", () => {
  const store = createLocalPreviewStore();
  assert.ok(store.read("members", "preview-planning").some((member) => member.id === "preview-guest"));
  assert.ok(!store.read("members", "preview-upcoming").some((member) => member.id === "preview-guest"));
});
