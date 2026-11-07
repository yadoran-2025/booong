import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createLessonCatalogStore, importCatalogRows, updateLesson } from "../lib/lesson-catalog-store.js";
import { buildDashboardCatalog, loadDashboardConfig } from "../js/dashboard-data.js";
import { createCatalogReadCache } from "../lib/lesson-catalog-api.js";
import handler from "../api/admin.js";
import { withLocalAdmin } from "../lib/local-admin.js";

const unitRows = [{ "단원_코드": "1", 과목: "사회1", 대단원: "I. 세계", 중단원: "1. 세계의 이해" }, { "단원_코드": "2", 과목: "통합사회2", 대단원: "I. 인권", 중단원: "1. 인권 보장" }];
const rows = [{ group_id: "group-2", group_title: "기존 수업", published: "TRUE", "단원_코드": "1", kind: "lesson", rubric: "보존할 내용" }, { group_title: "비공개 자료", published: "FALSE", "단원_코드": "2" }];
const originalIds = buildDashboardCatalog(rows, unitRows).resources.map(x => x.id);
const imported = importCatalogRows(rows, unitRows);
assert.deepEqual(buildDashboardCatalog(imported.rows, unitRows).resources.map(x => x.id), originalIds);
assert.equal(imported.rows.length, 2);
assert.equal(imported.rows[0].rubric, "보존할 내용");
assert.equal(imported.rows[1].resource_id, "resource-비공개-자료-2");
assert.throws(() => importCatalogRows([rows[0], rows[0]], unitRows), /중복/);
assert.throws(() => importCatalogRows(rows, [...unitRows, unitRows[0]]), /단원 코드/);
assert.throws(() => importCatalogRows([{ ...rows[0], "단원_코드": "999" }], unitRows), /단원 코드/);
const lesson = { ...imported.rows[0], desc: "소개", maker: "제작자", discipline: "사회", school: "", "단원명": "", blog_link: "https://example.com/intro", teacher_link: "/lesson.html", dorms_link: "", thumbnail_url: "", thumbnail_alt: "", new: "FALSE", "단원_코드": "1,2" };
const changed = updateLesson(imported, lesson);
assert.equal(changed.rows[0].resource_id, "group-2");
assert.equal(changed.rows[0].rubric, "보존할 내용");
assert.equal(changed.rows[0]["단원_코드"], "1,2");
const renamed = updateLesson(changed, { ...lesson, group_title: "이름 변경" });
assert.equal(renamed.rows[0].resource_id, "group-2");
assert.equal(buildDashboardCatalog(renamed.rows, unitRows).resources[0].id, "group-2");
for (const input of [
  { ...lesson, group_title: "" }, { ...lesson, resource_id: "unknown" }, { ...lesson, resource_id: "__proto__" },
  { ...lesson, "단원_코드": "999" }, { ...lesson, "단원_코드": "bad" }, { ...lesson, "단원_코드": "" },
  { ...lesson, blog_link: "javascript:alert(1)" }, { ...lesson, blog_link: "//evil.example/a" },
  { ...lesson, blog_link: "https://name:password@example.com" }, { ...lesson, desc: "a".repeat(10001) },
  { ...lesson, published: true }, { ...lesson, new: "anything" },
]) assert.throws(() => updateLesson(imported, input));
assert.equal(updateLesson(imported, { ...lesson, published: "FALSE", "단원_코드": "" }).rows[0].published, "FALSE");
const newState = updateLesson(imported, { ...lesson, resource_id: "", published: "FALSE" });
assert.match(newState.rows.at(-1).resource_id, /^lesson-[0-9a-f-]{36}$/);

const directory = await mkdtemp(join(tmpdir(), "booong-catalog-"));
try {
  const store = createLessonCatalogStore({ directory, readSheets: async () => ({ rows, unitRows }) });
  assert.equal((await store.load()).state, null);
  const first = await store.mutate({ action: "import", revision: null });
  assert.equal(first.rows.length, 2);
  assert.ok(first.revision);
  await assert.rejects(store.mutate({ action: "import", revision: first.revision }), error => error.status === 409);
  const outcomes = await Promise.allSettled([
    store.mutate({ action: "save", revision: first.revision, lesson }),
    store.mutate({ action: "save", revision: first.revision, lesson: { ...lesson, group_title: "충돌" } }),
  ]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(x => x.status === "rejected").reason.status, 409);
  const persisted = (await createLessonCatalogStore({ directory }).load()).state;
  assert.equal(persisted.rows[0].group_title, "기존 수업");
  assert.equal(persisted.rows[0].rubric, "보존할 내용");
  const publicCatalog = buildDashboardCatalog(persisted.rows, persisted.unitRows);
  assert.equal(publicCatalog.resources.length, 1);
  assert.equal(publicCatalog.resources.some(x => x.title === "비공개 자료"), false);
} finally { await rm(directory, { recursive: true, force: true }); }

let reads = 0, time = 0;
const cache = createCatalogReadCache({ load: async () => { reads++; return { state: { ...imported } }; } }, () => time);
const results = await Promise.all([cache.read(), cache.read(), cache.read()]);
assert.equal(reads, 1);
assert.equal(results[0].catalog.resources.length, 1);
assert.equal(JSON.stringify(results[0]).includes("비공개 자료"), false);
time = 30001; await cache.read(); assert.equal(reads, 2);
cache.clear(); await cache.read(); assert.equal(reads, 3);
let failedReads = 0;
const failureCache = createCatalogReadCache({ load: async () => { failedReads++; throw new Error("offline"); } }, () => time);
await assert.rejects(failureCache.read());
assert.deepEqual(await failureCache.read(), { error: true }); assert.equal(failedReads, 1);
time += 10001; await assert.rejects(failureCache.read()); assert.equal(failedReads, 2);

async function request(url, method = "GET", body = "", headers = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(req, { url, method, headers: { host: "127.0.0.1:8765", ...headers }, socket: { remoteAddress: "127.0.0.1" } });
  let response;
  const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(value) { response = { status: this.statusCode, body: JSON.parse(value), headers: this.headers }; } };
  await handler(req, res); return response;
}
assert.equal((await request("/api/lesson-catalog?admin=1")).status, 401);
assert.equal((await request("/api/admin?catalog=1&admin=1")).status, 401);
assert.equal((await request("/api/lesson-catalog", "POST", "{}")).status, 401);
for (const url of ["/api/lesson-catalog?nonce=1", "/api/lesson-catalog?admin=1&admin=1", "/api/admin?catalog=0", "/api/admin?catalog=1&catalog=1", "/api/lesson-catalog?admin=no"]) assert.equal((await request(url)).status, 400);
assert.equal((await request("/api/lesson-catalog", "PUT")).status, 405);
assert.equal((await request("/api/admin")).status, 401);
assert.equal((await request("/api/lesson-thumbnails?admin=1")).status, 401);

const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
async function localRequest(body, headers = {}) {
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { url: "/api/lesson-catalog", method: "POST", headers: { host: "127.0.0.1:8765", origin: "http://127.0.0.1:8765", "content-type": "application/json", ...headers }, socket: { remoteAddress: "127.0.0.1" } });
  let result; const res = { setHeader() {}, end(value) { result = { status: this.statusCode, body: JSON.parse(value) }; } };
  await withLocalAdmin(req, () => handler(req, res)); return result;
}
try {
  assert.equal((await localRequest("{")).status, 400);
  assert.equal((await localRequest("null")).status, 400);
  assert.equal((await localRequest(JSON.stringify({ action: "import", revision: "bad" }))).status, 400);
  assert.equal((await localRequest("{}", { "content-type": "text/plain" })).status, 415);
  assert.equal((await localRequest("a".repeat(65537))).status, 413);
} finally { if (originalEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnv; }

const originalFetch = globalThis.fetch, originalStorage = globalThis.sessionStorage;
let sheetReads = 0; const saved = new Map();
globalThis.sessionStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
globalThis.fetch = async url => {
  if (String(url).startsWith("lessons/index.json")) return { ok: true, json: async () => ({ groups: [], games: [] }) };
  if (url === "/api/lesson-catalog") return { ok: true, json: async () => results[0] };
  sheetReads++; throw new Error("Sheets should not be used after migration");
};
try {
  assert.equal((await loadDashboardConfig()).catalogSource, "managed");
  assert.equal((await loadDashboardConfig()).catalog.resources[0].id, "group-2");
  assert.equal(sheetReads, 0);
  globalThis.fetch = async url => {
    if (String(url).startsWith("lessons/index.json")) return { ok: true, json: async () => ({ groups: [], games: [] }) };
    if (url === "/api/lesson-catalog") return { ok: false };
    sheetReads++; throw new Error("Do not resurrect the old sheet during an outage");
  };
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal((await loadDashboardConfig()).catalogSource, "managed", "A known managed snapshot can survive an outage");
    saved.clear();
    const failed = await loadDashboardConfig();
    assert.equal(failed.catalogUnavailable, true);
    assert.equal(failed.catalog.resources.length, 0);
    assert.equal(sheetReads, 0, "Unknown migration state never falls back to the old sheet");
  } finally { console.warn = warn; }
} finally { globalThis.fetch = originalFetch; if (originalStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = originalStorage; }

const html = await readFile(new URL("../lesson-admin.html", import.meta.url), "utf8");
assert.match(html, /releases\/v2\.0\.0\/booong.css/);
assert.match(await readFile(new URL("../js/admin.js", import.meta.url), "utf8"), /href="lesson-admin.html"/);
const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
assert.ok(config.rewrites.some(row => row.source === "/api/lesson-catalog" && row.destination === "/api/admin?catalog=1"));
console.log("Lesson catalog import, stable IDs, validation, persistence, conflicts, cache, auth, aliases and managed reads passed.");
