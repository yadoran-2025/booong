import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import handler from "../api/admin.js";
import { loadMembers, normalizeMemberProfiles, validateMemberProfileInput, memberFeaturedWorks, MEMBER_PROFILE_FIELD_LIMITS } from "../js/member-data.js";
import { readMemberProfiles, readMemberProfileState, saveMemberProfile } from "../lib/member-profile-store.js";
import { withLocalAdmin } from "../lib/local-admin.js";
import { ContentConflictError } from "../lib/booong-content-storage.js";

const input = { members: [{ id: "Do", name: "멤버", aliases: ["doh", "dobby"], career: ["학교, 부서", "부대"], trainingCareer: ["연수 A", "연수 B"], making: ["자료 A", "자료 B"], admin: "private@example.com" }] };
const expected = normalizeMemberProfiles(input);
assert.deepEqual(expected[0].career, ["학교, 부서", "부대"]);
assert.deepEqual(expected[0].trainingCareer, input.members[0].trainingCareer);
assert.equal("admin" in expected[0], false);
for (const data of [{}, { members: [null] }, { members: [{ id: "" }] }, { members: [{ id: "Do" }, { id: "do" }] }]) assert.throws(() => normalizeMemberProfiles(data));
assert.deepEqual(normalizeMemberProfiles({ members: [] }), []);
const edit = Object.fromEntries(["id", ...Object.keys(MEMBER_PROFILE_FIELD_LIMITS)].map(key => [key, Array.isArray(expected[0][key]) ? expected[0][key].join("\n") : expected[0][key]]));
const visibleEdit=Object.fromEntries(['id','name','interests','bio','career'].map(key=>[key,edit[key]]));
assert.deepEqual(Object.keys(validateMemberProfileInput(visibleEdit)).sort(),Object.keys(visibleEdit).sort());
assert.throws(()=>validateMemberProfileInput({...visibleEdit,career:undefined}),'보이는 필드의 검증은 유지한다');
assert.deepEqual(validateMemberProfileInput({ ...edit, career: "학교, 부서; 유지\n부대" }).career, ["학교, 부서; 유지", "부대"]);
for (const invalid of [null, [], { ...edit, name: " " }, { ...edit, admin: "attacker@example.com" }, { ...edit, aliases: [] }, { ...edit, bio: "x".repeat(10001) }]) assert.throws(() => validateMemberProfileInput(invalid));
for (const featuredWorkIds of [null,'lesson:a',['bad'],[1],['lesson:a','lesson:a'],['lesson:a','lesson:b','lesson:c','lesson:d'],['lesson:\ninvalid']]) assert.throws(() => validateMemberProfileInput({...edit,featuredWorkIds}));
assert.deepEqual(validateMemberProfileInput({...edit,featuredWorkIds:[]}).featuredWorkIds,[]);
const works=[{type:'lesson',id:'a'},{type:'game',id:'b'},{type:'lesson',id:'c'},{type:'lesson',id:'d'}];
assert.deepEqual(memberFeaturedWorks({},works),[works[0],works[2],works[3]]);
assert.deepEqual(memberFeaturedWorks({featuredWorkIds:['game:b','lesson:deleted','lesson:a']},works),[works[1],works[0]]);
assert.deepEqual(memberFeaturedWorks({featuredWorkIds:[]},works),[]);

const other = normalizeMemberProfiles({ members: [{ id: "Other", name: "다른 구성원", avatar: "[URL]", homepage: "https://example.com" }] })[0];
let cloudData = { members: [...expected, other] }, etag = '"first"', race = false, writes = 0;
const storage = {
  async read(name) {
    assert.equal(name, "members");
    return { data: structuredClone(cloudData), etag };
  },
  async write(name, data, expectedRevision) {
    assert.equal(name, "members");
    if (race) etag = '"external"';
    if (expectedRevision !== etag) throw new ContentConflictError();
    writes++;
    cloudData = structuredClone(data); etag = '"saved"';
    return { etag };
  },
};
const cloudOptions = { storage };
const updated = await saveMemberProfile({ revision: etag, member: { ...visibleEdit, name: "새 이름" } }, cloudOptions);
assert.equal(updated.revision, '"saved"');
assert.equal(updated.members[0].name, "새 이름");
assert.deepEqual(updated.members[0].career, expected[0].career);
assert.equal(updated.members[0].avatar, expected[0].avatar);
for (const key of ['aliases','trainingCareer','making']) assert.deepEqual(updated.members[0][key],expected[0][key],'입력란을 뺀 기존 필드는 프로필 저장 시 지우지 않는다');
assert.deepEqual(updated.members[1], other, "Editing one profile preserves every other profile");
await assert.rejects(saveMemberProfile({ revision: '"first"', member: edit }, cloudOptions), { status: 409 });
race = true;
await assert.rejects(saveMemberProfile({ revision: etag, member: edit }, cloudOptions), { status: 409 });
assert.equal(writes, 1, "A concurrent cloud update is never overwritten");

const root = await mkdtemp(join(tmpdir(), "booong-members-"));
const cwd = process.cwd(), originalFetch = globalThis.fetch, originalWarn = console.warn;
const saved = Object.fromEntries(["NODE_ENV", "VERCEL", "BLOB_READ_WRITE_TOKEN"].map(key => [key, process.env[key]]));
try {
  process.chdir(root);
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  await mkdir(".data");
  const file = join(root, ".data/member-profiles.json");
  await writeFile(file, JSON.stringify(input));
  assert.deepEqual(await readMemberProfiles({ file }), { members: expected });
  const request = async (url = "/api/members", method = "GET", body, authorized = false, extraHeaders = {}) => {
    const headers = new Map();
    const res = { headers, setHeader(key, value) { headers.set(key.toLowerCase(), value); }, end(body) { this.body = JSON.parse(body); } };
    const req = { method, url, headers: { host: "127.0.0.1:8765", origin: "http://127.0.0.1:8765", "content-type": "application/json", ...extraHeaders }, socket: { remoteAddress: "127.0.0.1" }, body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body || {})) };
    if (authorized) await withLocalAdmin(req, () => handler(req, res)); else await handler(req, res);
    return res;
  };
  for (const url of ["/api/members", "/api/admin?members=1"]) {
    const response = await request(url);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { members: expected });
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "max-age=30");
    assert.equal(response.headers.get("vercel-cache-tag"), "booong-member-profiles");
    assert.equal("revision" in response.body, false);
    assert.ok(!JSON.stringify(response.body).includes("private@example.com"));
  }
  assert.equal((await request("/api/members", "POST")).statusCode, 401);
  assert.equal((await request("/api/members?admin=1")).statusCode, 401);
  assert.equal((await request("/api/members", "DELETE")).statusCode, 405);
  for (const url of ["/api/members?admin=0", "/api/admin?members=0", "/api/admin?members=1&members=1", "/api/admin?members=1&catalog=1", "/api/members?admin=1&admin=1"]) assert.equal((await request(url)).statusCode, 400);
  const managed = await request("/api/members?admin=1", "GET", null, true);
  assert.equal(managed.statusCode, 200);
  assert.equal(managed.headers.get("cache-control"), "no-store");
  assert.equal(managed.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(typeof managed.body.revision, "string");
  const payload = { member: { ...edit, bio: "수정한 소개 <script>",featuredWorkIds:['game:b','lesson:a'] }, revision: managed.body.revision };
  for (const [headers, status] of [[{ origin: "https://evil.example" }, 401], [{ "content-type": "text/plain" }, 415], [{ "content-length": "65537" }, 413]]) assert.equal((await request("/api/members", "POST", payload, true, headers)).statusCode, status);
  assert.equal((await request("/api/members", "POST", "broken", true)).statusCode, 400);
  assert.equal((await request("/api/members", "POST", "x".repeat(65537), true)).statusCode, 413);
  assert.equal((await request("/api/members", "POST", { ...payload, member: { ...edit, admin: "attacker@example.com" } }, true)).statusCode, 400);
  assert.equal((await request("/api/members", "POST", { ...payload, member: { ...edit, id: "new-id" } }, true)).statusCode, 404);
  const savedProfile = await request("/api/members", "POST", payload, true);
  assert.equal(savedProfile.statusCode, 200);
  assert.equal(savedProfile.body.members[0].bio, payload.member.bio);
  assert.notEqual(savedProfile.body.revision, payload.revision);
  assert.deepEqual(await readMemberProfileState({ file }), savedProfile.body);
  assert.equal((await request("/api/members", "POST", payload, true)).statusCode, 409);
  assert.equal((await request()).body.members[0].bio, payload.member.bio);
  assert.deepEqual((await request()).body.members[0].featuredWorkIds,payload.member.featuredWorkIds,'선택 순서는 저장 후 공개 API와 재접속에서도 유지된다');
  const nextInput = { member: { ...edit, bio: "同時保存" }, revision: savedProfile.body.revision };
  const simultaneous = await Promise.allSettled([saveMemberProfile(nextInput, { file }), saveMemberProfile({ ...nextInput, member: { ...edit, bio: "other" } }, { file })]);
  assert.equal(simultaneous.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(simultaneous.find(result => result.status === "rejected").reason.status, 409);
  assert.deepEqual((await readMemberProfiles({file})).members[0].featuredWorkIds,payload.member.featuredWorkIds,'대표 콘텐츠 필드를 보내지 않는 기존 클라이언트의 수정도 선택을 보존한다');
  await writeFile(file, "invalid JSON");
  await assert.rejects(saveMemberProfile(nextInput, { file }));
  assert.equal(await readFile(file, "utf8"), "invalid JSON", "Corrupt storage is never replaced with an empty file");
  process.env.NODE_ENV = "production";
  assert.equal((await request()).statusCode, 503, "Production never reads local profile files");
  process.env.NODE_ENV = "development";
  await writeFile(file, "invalid JSON");
  const unavailable = await request();
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.headers.get("vercel-cdn-cache-control"), "no-store");

  const urls = [];
  globalThis.fetch = async url => { urls.push(url); return new Response(JSON.stringify(input)); };
  assert.deepEqual(await loadMembers(), expected);
  assert.deepEqual(urls, ["/api/members"]);
  globalThis.fetch = async () => new Response('{"members":[]}');
  assert.deepEqual(await loadMembers(), [], "An intentionally empty list must not restore old profiles");
  console.warn = () => {};
  for (const broken of [new Response("unavailable", { status: 503 }), new Response("invalid JSON"), new Response('{"members":[{}]}')]) {
    const calls = [];
    globalThis.fetch = async url => { calls.push(url); return calls.length === 1 ? broken : new Response(JSON.stringify(input)); };
    assert.deepEqual(await loadMembers({ fallbackUrl: "/members.json" }), expected);
    assert.deepEqual(calls, ["/api/members", "/members.json"]);
  }
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url)));
  assert.ok(config.rewrites.some(row => row.source === "/api/members" && row.destination === "/api/admin?members=1"));
  console.log("Member Firebase profiles, public field filtering, routing and fallback checks passed.");
} finally {
  process.chdir(cwd);
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(root, { recursive: true, force: true });
}
