import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

const calls = { set: [] };
const timestamp = { timestamp: true };
const firestore = {
  addDoc: async () => ({ id: "unused" }),
  collection: (...args) => ({ path: args.slice(1).join("/") }),
  deleteDoc: async () => {},
  doc: (parent, id) => ({ id, path: `${parent.path}/${id}` }),
  getDoc: async () => ({ exists: () => false }),
  onSnapshot: () => () => {},
  serverTimestamp: () => timestamp,
  setDoc: async (...args) => { calls.set.push(args); },
  updateDoc: async () => {},
  writeBatch: () => ({ set: () => {}, commit: async () => {} })
};

mock.module("firebase/firestore", { exports: firestore });
mock.module("../firebase.js", { exports: { db: "database" } });
const { saveResponse, subscribeResponse } = await import("./repository.js");

beforeEach(() => { calls.set.length = 0; });

test("응답 저장은 전체 availability 대신 바뀐 한 칸만 병합한다", async () => {
  await saveResponse("m1", "g1", "철수", { "2026-09-12-10": "available" });
  assert.deepEqual(calls.set, [[
    { id: "g1", path: "bungmoMeetings/m1/responses/g1" },
    { displayName: "철수", availability: { "2026-09-12-10": "available" }, updatedAt: timestamp },
    { merge: true }
  ]]);
});

test("로컬 미리보기의 서로 다른 일정 칸 저장은 기존 칸을 덮어쓰지 않는다", async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWindow = globalThis.window;
  process.env.NODE_ENV = "development";
  globalThis.window = { location: { hostname: "localhost" } };
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  });

  await saveResponse("response-delta-preview", "g1", "철수", { "slot-a": "available" });
  await saveResponse("response-delta-preview", "g1", "철수", { "slot-b": "unavailable" });
  let response;
  const stop = subscribeResponse("response-delta-preview", "g1", (next) => { response = next; });
  t.after(stop);
  assert.deepEqual(response.availability, { "slot-a": "available", "slot-b": "unavailable" });
});
