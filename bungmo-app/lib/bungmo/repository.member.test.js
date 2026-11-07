import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

const calls = { snapshots: [], set: [], update: [] };
const existingMemberPaths = new Set();
const timestamp = { timestamp: true };
const firestore = {
  addDoc: async () => ({ id: "unused" }),
  collection: (...args) => ({ path: args.slice(1).join("/") }),
  deleteDoc: async () => {},
  doc: (parent, id = "generated-member") => ({ id, path: `${parent.path}/${id}` }),
  getDoc: async (reference) => ({ exists: () => existingMemberPaths.has(reference.path) }),
  onSnapshot: (...args) => { calls.snapshots.push(args); return "unsubscribe"; },
  serverTimestamp: () => timestamp,
  setDoc: async (...args) => { calls.set.push(args); },
  updateDoc: async (...args) => { calls.update.push(args); },
  writeBatch: () => ({ set: () => {}, commit: async () => {} })
};

mock.module("firebase/firestore", { exports: firestore });
mock.module("../firebase.js", { exports: { db: "database" } });
const { deactivateMeetingMember, saveMeetingMember, subscribeMeetingMembers, updateUserAccess } = await import("./repository.js");

beforeEach(() => {
  Object.values(calls).forEach((items) => { items.length = 0; });
  existingMemberPaths.clear();
});

function enableLocalPreview(t) {
  const nodeEnv = process.env.NODE_ENV;
  const window = globalThis.window;
  process.env.NODE_ENV = "development";
  globalThis.window = { location: { hostname: "localhost" } };
  t.after(() => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (window === undefined) delete globalThis.window; else globalThis.window = window;
  });
}

test("meeting member subscription reads the meeting members collection", () => {
  const callback = () => {};
  const onError = () => {};
  assert.equal(subscribeMeetingMembers("m1", callback, onError), "unsubscribe");
  assert.equal(calls.snapshots.pop()[0].path, "bungmoMeetings/m1/members");
});

test("new member is active and returns the generated member id", async () => {
  assert.equal(await saveMeetingMember("m1", { kind: "guest", displayName: "동현" }), "generated-member");
  assert.deepEqual(calls.set.pop(), [
    { id: "generated-member", path: "bungmoMeetings/m1/members/generated-member" },
    { kind: "guest", displayName: "동현", active: true, createdAt: timestamp, updatedAt: timestamp },
    { merge: true }
  ]);
});

test("new registered member with a fixed ID keeps its creation timestamp", async () => {
  assert.equal(await saveMeetingMember("m1", { id: "u1", kind: "registered", userId: "u1" }), "u1");
  assert.deepEqual(calls.set, [[
    { id: "u1", path: "bungmoMeetings/m1/members/u1" },
    { kind: "registered", userId: "u1", active: true, createdAt: timestamp, updatedAt: timestamp },
    { merge: true }
  ]]);
  assert.equal(calls.update.length, 0);
});

test("inactive member reactivation updates only active and updatedAt", async () => {
  existingMemberPaths.add("bungmoMeetings/m1/members/g1");
  assert.equal(await saveMeetingMember("m1", {
    id: "g1", kind: "guest", displayName: "동현", active: false
  }), "g1");
  assert.equal(calls.set.length, 0);
  assert.deepEqual(calls.update, [[
    { id: "g1", path: "bungmoMeetings/m1/members/g1" },
    { active: true, updatedAt: timestamp }
  ]]);
});

test("member deactivation updates only active and updatedAt", async () => {
  await deactivateMeetingMember("m1", "g1");
  assert.deepEqual(calls.update.pop(), [
    { id: "g1", path: "bungmoMeetings/m1/members/g1" },
    { active: false, updatedAt: timestamp }
  ]);
});

test("site access update writes only the access flag and timestamp", async () => {
  await updateUserAccess("u2", false);
  assert.deepEqual(calls.update.pop(), [
    { id: "u2", path: "bungmoUsers/u2" },
    { active: false, updatedAt: timestamp }
  ]);
});

test("preview member save always activates the member", async (t) => {
  enableLocalPreview(t);
  let members = [];
  const unsubscribe = subscribeMeetingMembers("preview-member-save", (items) => { members = items; });
  assert.equal(await saveMeetingMember("preview-member-save", { id: "g1", kind: "guest", displayName: "동현", active: false }), "g1");
  assert.deepEqual(members, [{ id: "g1", kind: "guest", displayName: "동현", active: true }]);
  unsubscribe();
});

test("preview reactivation restores active without replacing member fields", async (t) => {
  enableLocalPreview(t);
  let members = [];
  const unsubscribe = subscribeMeetingMembers("preview-member-reactivate", (items) => { members = items; });
  await saveMeetingMember("preview-member-reactivate", { id: "g1", kind: "guest", displayName: "동현" });
  await deactivateMeetingMember("preview-member-reactivate", "g1");
  assert.equal(members[0].active, false);
  assert.equal(await saveMeetingMember("preview-member-reactivate", {
    id: "g1", kind: "guest", displayName: "변경", active: false
  }), "g1");
  assert.deepEqual(members, [{ id: "g1", kind: "guest", displayName: "동현", active: true }]);
  unsubscribe();
});

test("preview member deactivation resolves without a value", async (t) => {
  enableLocalPreview(t);
  await saveMeetingMember("preview-member-deactivate", { id: "g1", kind: "guest", displayName: "동현" });
  const result = deactivateMeetingMember("preview-member-deactivate", "g1");
  assert.equal(typeof result.then, "function");
  assert.equal(await result, undefined);
});
