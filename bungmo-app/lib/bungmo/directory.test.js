import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { normalizeBooongProfiles, subscribeBooongProfiles } from "./directory.js";

const saved = { fetch: globalThis.fetch, window: globalThis.window };
let focus;
beforeEach(() => { globalThis.window = { addEventListener: (type, listener) => { assert.equal(type, "focus"); focus = listener; }, removeEventListener: (_, listener) => { assert.equal(listener, focus); focus = null; } }; });
afterEach(() => { globalThis.fetch = saved.fetch; if (saved.window === undefined) delete globalThis.window; else globalThis.window = saved.window; });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("BOOONG ID를 로그인 UID와 분리하고 실제 프로필 이름을 사용한다", () => {
  assert.deepEqual(normalizeBooongProfiles({ members: [{ id: "CHOI", name: " 최진영 ", avatar: "photo.png" }] }), [{ id: "booong:CHOI", profileId: "CHOI", nickname: "최진영", photoURL: "photo.png" }]);
  for (const members of [[{ id: "../bad", name: "이름" }], [{ id: "CHOI", name: " " }], [{ id: "CHOI", name: "가" }, { id: "choi", name: "나" }]]) assert.throws(() => normalizeBooongProfiles({ members }));
  assert.throws(() => normalizeBooongProfiles({ users: [] }));
});

test("공통 API를 읽고 다시 돌아오면 수정한 프로필을 새로 받는다", async () => {
  let name = "최진영";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/members"); assert.equal(options.cache, "no-store");
    return new Response(JSON.stringify({ members: [{ id: "CHOI", name }] }));
  };
  const results = [];
  const stop = subscribeBooongProfiles(items => results.push(items));
  await tick();
  name = "새 이름"; await focus();
  assert.equal(results[0][0].nickname, "최진영");
  assert.equal(results[1][0].nickname, "새 이름");
  stop(); assert.equal(focus, null);
});

test("조회 실패에는 옛 붕모 명단으로 바꾸지 않고 오류를 전달한다", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  let failed;
  const stop = subscribeBooongProfiles(() => assert.fail("Stale list must not be shown"), error => { failed = error; });
  await tick(); assert.match(failed.message, /프로필/); stop();
});

test("화면을 떠난 뒤 도착한 응답은 무시한다", async () => {
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const stop = subscribeBooongProfiles(() => assert.fail("Unmounted subscriber"));
  stop(); finish(new Response(JSON.stringify({ members: [] }))); await tick();
});
