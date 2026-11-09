import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

let existing, failure;
const writes = [];
const timestamp = { timestamp: true };
mock.module("../firebase.js", { exports: { db: "database" } });
mock.module("firebase/firestore", { exports: {
  addDoc() {}, deleteDoc() {}, getDoc() {}, onSnapshot() {}, setDoc() {}, updateDoc() {}, writeBatch() {},
  collection: (_, name) => name,
  doc: (collection, uid) => `${collection}/${uid}`,
  serverTimestamp: () => timestamp,
  runTransaction: async (db, callback) => {
    assert.equal(db, "database");
    if (failure) throw failure;
    await callback({ get: async reference => {
      assert.equal(reference, "bungmoUsers/operator");
      return { exists: () => Boolean(existing) };
    }, set: (...args) => writes.push(args) });
  }
} });
const { ensureProfile } = await import("./repository.js");
const user = { uid: "operator", email: "operator@example.com", displayName: "  김교사  " };
beforeEach(() => { existing = null; failure = null; writes.length = 0; });

test("새 운영자는 닉네임 입력 없이 계정 이름으로 참가자 정보를 만든다", async () => {
  await ensureProfile(user);
  assert.deepEqual(writes, [["bungmoUsers/operator", { nickname: "김교사", email: user.email, photoURL: "", createdAt: timestamp, updatedAt: timestamp }]]);
});

test("기존 참가자 이름과 기록은 덮어쓰지 않는다", async () => {
  existing = { nickname: "기존 이름", active: false, createdAt: "original" };
  await ensureProfile(user);
  assert.deepEqual(writes, []);
});

test("이름이 없으면 이메일 아이디를 쓰고 긴 이름도 저장 범위를 지킨다", async () => {
  await ensureProfile({ ...user, displayName: " " });
  assert.equal(writes[0][1].nickname, "operator");
  await ensureProfile({ ...user, displayName: "😀".repeat(20) });
  assert.equal(writes[1][1].nickname, "😀".repeat(16));
});

test("초기 정보 준비 실패는 로그인 화면에서 처리할 수 있도록 전달한다", async () => {
  failure = new Error("permission-denied");
  await assert.rejects(ensureProfile(user), /permission-denied/);
  assert.deepEqual(writes, []);
});
