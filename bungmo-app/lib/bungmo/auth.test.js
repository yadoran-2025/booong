import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";

const auth = { name: "shared-google" }, dataAuth = { name: "bungmo-data" };
const signedOut = [];
mock.module("../firebase.js", { exports: { auth, dataAuth } });
mock.module("firebase/auth", { exports: { signOut: async target => { signedOut.push(target); } } });
const { signInWithGoogle, signOutOfBungmo } = await import("./auth.js");
const savedWindow = globalThis.window;
after(() => { if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow; });
beforeEach(() => { signedOut.length = 0; });

test("로그인은 BOOONG 운영자 공간을 거쳐 현재 붕모 경로로 돌아온다", () => {
  let destination;
  globalThis.window = { location: { hostname: "booong.vercel.app", pathname: "/bungmo/trip/", search: "?meeting=2", hash: "#day-1", assign: url => { destination = url; } } };
  signInWithGoogle();
  const url = new URL(destination, "https://booong.vercel.app");
  assert.equal(url.pathname, "/admin.html");
  assert.equal(url.searchParams.get("next"), "/bungmo/trip/?meeting=2#day-1");
});

test("로그아웃은 공통 Google 세션과 붕모 데이터 세션을 함께 지운다", async () => {
  await signOutOfBungmo();
  assert.deepEqual(signedOut, [dataAuth, auth]);
});
