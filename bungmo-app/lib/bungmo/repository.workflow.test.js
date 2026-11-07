import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

const calls = { set: [], snapshot: [] };
const timestamp = { timestamp: true };
const firestore = {
  addDoc: async () => ({ id: "unused" }),
  collection: (...args) => ({ collection: args }),
  deleteDoc: async () => {},
  doc: (...args) => ({ doc: args }),
  getDoc: async () => ({ exists: () => false }),
  onSnapshot: (...args) => { calls.snapshot.push(args); return () => {}; },
  serverTimestamp: () => timestamp,
  setDoc: async (...args) => { calls.set.push(args); },
  updateDoc: async () => {},
  writeBatch: () => ({ set: () => {}, commit: async () => {} })
};

mock.module("firebase/firestore", { exports: firestore });
mock.module("../firebase.js", { exports: { db: "database" } });
const { saveExpenseReadiness, subscribeExpenseReadiness } = await import("./repository.js");

beforeEach(() => { Object.values(calls).forEach((items) => { items.length = 0; }); });

test("readiness writes use the narrow expected document", async () => {
  await saveExpenseReadiness("m1", "u1", true, "0123456789abcdef");
  assert.deepEqual(calls.set.pop(), [
    { doc: [{ collection: ["database", "bungmoMeetings", "m1", "expenseReadiness"] }, "u1"] },
    { ready: true, revision: "0123456789abcdef", updatedAt: timestamp }
  ]);
});

test("local preview publishes saved readiness immediately", (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousWindow = globalThis.window;
  process.env.NODE_ENV = "development";
  globalThis.window = { location: { hostname: "localhost" } };
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  });

  let readiness;
  const stop = subscribeExpenseReadiness("readiness-preview", (next) => { readiness = next; });
  t.after(stop);
  saveExpenseReadiness("readiness-preview", "u1", true, "0123456789abcdef");
  assert.deepEqual(readiness, [{ id: "u1", ready: true, revision: "0123456789abcdef", updatedAt: readiness[0]?.updatedAt }]);
  assert.ok(readiness[0].updatedAt instanceof Date);
});
