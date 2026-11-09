import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";

const calls = [];
const user = { uid: "google-uid", getIdToken: async () => "google-token" };
const auth = { currentUser: user };
const dataAuth = { currentUser: null };
let changeAccount = false;
mock.module("../firebase.js", { exports: { auth, dataAuth } });
mock.module("firebase/auth", { exports: {
  inMemoryPersistence: "memory",
  setPersistence: async (...args) => calls.push(["persistence", ...args]),
  signInWithCustomToken: async (target, token) => { calls.push(["signin", target, token]); target.currentUser = user; if (changeAccount) auth.currentUser = null; },
  signOut: async target => { calls.push(["signout", target]); target.currentUser = null; }
} });
const { openOperatorSession } = await import("./session.js");
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
beforeEach(() => { calls.length = 0; auth.currentUser = user; dataAuth.currentUser = null; changeAccount = false; });

test("운영자 데이터 로그인은 Google 세션을 덮어쓰지 않고 메모리에만 둔다", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/bungmo-session");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer google-token");
    assert.equal(options.cache, "no-store");
    return new Response(JSON.stringify({ token: "approved-custom-token", email: "operator@example.com" }));
  };
  assert.equal(await openOperatorSession(user), "operator@example.com");
  assert.deepEqual(calls, [["persistence", dataAuth, "memory"], ["signin", dataAuth, "approved-custom-token"]]);
  assert.equal(auth.currentUser, user);
});

test("권한 거절과 서버 장애에는 데이터를 로그인하지 않는다", async () => {
  for (const status of [401, 403, 503]) {
    globalThis.fetch = async () => new Response("{}", { status });
    await assert.rejects(openOperatorSession(user), error => error.denied === (status !== 503));
    assert.equal(calls.length, 0);
  }
});

test("권한 확인 중 바뀐 Google 계정의 데이터 세션을 남기지 않는다", async () => {
  globalThis.fetch = async () => { auth.currentUser = null; return new Response(JSON.stringify({ token: "approved", email: "operator@example.com" })); };
  await assert.rejects(openOperatorSession(user), /계정이 바뀌/);
  assert.equal(calls.length, 0);
  auth.currentUser = user;
  changeAccount = true;
  globalThis.fetch = async () => new Response(JSON.stringify({ token: "approved", email: "operator@example.com" }));
  await assert.rejects(openOperatorSession(user), /계정이 바뀌/);
  assert.equal(dataAuth.currentUser, null);
});

test("계정 정보가 빠진 세션 응답은 참가자 정보 생성 전에 거절한다", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ token: "approved" }));
  await assert.rejects(openOperatorSession(user), /계정 정보/);
  assert.equal(calls.length, 0);
});
