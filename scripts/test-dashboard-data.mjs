import assert from "node:assert/strict";
import { buildDashboardCatalog, createWorkMap, createMakerWorkMap, loadDashboardConfig, mergeDashboardCatalog, normalizeDashboardConfig } from "../js/dashboard-data.js";

const unitRows = [
  { "단원_코드": "36", "과목": "사회1", "대단원": "XII. 세계화와 평화", "중단원": "2. 세계화의 양상" },
  { "단원_코드": "45", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "2. 시장 가격의 결정" },
  { "단원_코드": "46", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "3. 시장 가격의 변동" },
  { "단원_코드": "47", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "3. 시장 가격의 변동" },
  { "단원_코드": "48", "과목": "사회2[15개정]", "대단원": "I. 헌법과 국가기관", "중단원": "1. 민주주의와 헌법" },
  { "단원_코드": "90", "과목": "통합사회2", "대단원": "I. 인권 보장과 헌법", "중단원": "2. 인권 문제의 양상" },
  { "단원_코드": "149", "과목": "경제", "대단원": "I. 경제생활과 경제 문제", "중단원": "1. 희소성과 선택" },
];
const groupRows = [
  { published: "TRUE", group_title: "놀라운 수요일", kind: "game", discipline: "사회", school: "중학교, 고등학교", "단원_코드": "36, 90", teacher_link: "https://example.com/game" },
  { published: "TRUE", group_title: "우리가 만드는 수요곡선", kind: "lesson", discipline: "경제", desc: "설명전용검색어", "단원_코드": "45", teacher_link: "https://example.com/teacher", blog_link: "https://example.com/blog", dorms_link: "https://example.com/worksheet" },
  { published: "TRUE", group_title: "15개정 사회 자료", kind: "lesson", discipline: "사회", "단원_코드": "48", teacher_link: "https://example.com/15개정" },
  { published: "TRUE", group_title: "상대 경로 자료", kind: "lesson", "단원_코드": "45", teacher_link: "lesson.html?mode=teacher", dorms_link: "/worksheet.html" },
  { published: "TRUE", group_title: "HTTP 자료", kind: "lesson", "단원_코드": "45", teacher_link: "http://example.com/teacher" },
  { published: "TRUE", group_title: "위험한 링크", kind: "lesson", "단원_코드": "45", teacher_link: "javascript:alert(1)", blog_link: "javascript:alert(2)", dorms_link: "data:text/html,unsafe" },
  { published: "TRUE", group_title: "프로토콜 상대 링크", kind: "lesson", "단원_코드": "45", teacher_link: "//evil.example/teacher", dorms_link: "mailto:teacher@example.com" },
  { published: "TRUE", group_id: "stable-material-id", group_title: "고정 식별 자료", kind: "lesson", "단원_코드": "45", teacher_link: "https://example.com/stable" },
  { published: "", group_title: "숨긴 자료", kind: "lesson", "단원_코드": "46", teacher_link: "https://example.com/hidden" },
  { published: "TRUE", group_title: "잘못 연결된 자료", kind: "lesson", "단원_코드": "999", teacher_link: "https://example.com/unknown" },
];

const catalog = buildDashboardCatalog(groupRows, unitRows);
assert.deepEqual(catalog.subjects.map(({ value }) => value), ["사회1", "사회2", "사회2[15개정]", "통합사회2"]);
assert.equal(catalog.units.length, 5);
assert.equal(catalog.subjects.find(({ value }) => value === "사회2[15개정]").school, "중학교");
assert.equal(catalog.resources.some(({ title }) => title === "숨긴 자료"), false);
assert.deepEqual(catalog.resources.find(({ title }) => title === "놀라운 수요일").subjects, ["사회1", "통합사회2"]);
assert.deepEqual(catalog.resources.find(({ title }) => title === "놀라운 수요일").middleUnitsByKey["사회1::XII. 세계화와 평화"], ["2. 세계화의 양상"]);
assert.deepEqual(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").actions, [
  { key: "blog", label: "수업 소개", href: "https://example.com/blog", external: true },
  { key: "teacher", label: "교사용 자료", href: "https://example.com/teacher", external: true },
  { key: "worksheet", label: "도름스", href: "https://example.com/worksheet", external: true },
]);
assert.equal(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").actions.every(({ external }) => external), true);
assert.equal(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").searchText.includes("설명전용검색어"), true);
assert.equal(catalog.resources.find(({ title }) => title === "고정 식별 자료").id, "stable-material-id");
assert.deepEqual(catalog.resources.find(({ title }) => title === "상대 경로 자료").actions, [
  { key: "teacher", label: "교사용 자료", href: "lesson.html?mode=teacher", external: false },
  { key: "worksheet", label: "도름스", href: "/worksheet.html", external: false },
]);
assert.deepEqual(catalog.resources.find(({ title }) => title === "HTTP 자료").actions, [
  { key: "teacher", label: "교사용 자료", href: "http://example.com/teacher", external: true },
]);
assert.deepEqual(catalog.resources.find(({ title }) => title === "위험한 링크").actions, []);
assert.deepEqual(catalog.resources.find(({ title }) => title === "프로토콜 상대 링크").actions, []);
for (const [url, expected] of [["/assets/lesson-thumbnails/popgrid-v1.webp", "/assets/lesson-thumbnails/popgrid-v1.webp"], ["https://example.com/cover.jpg", "https://example.com/cover.jpg"], ["", ""], ["javascript:alert(1)", ""], ["data:image/svg+xml,unsafe", ""], ["//evil.example/cover.jpg", ""]]) {
  const [resource] = buildDashboardCatalog([{ ...groupRows[1], thumbnail_url: url, thumbnail_alt: "  세계지도  " }], unitRows).resources;
  assert.equal(resource.thumbnailUrl, expected);
  assert.equal(resource.thumbnailAlt, "세계지도");
}
assert.deepEqual(catalog.units.find(({ key }) => key === "사회2::III. 시장과 가격").middleUnits, [
  "2. 시장 가격의 결정",
  "3. 시장 가격의 변동",
  "3. 시장 가격의 변동",
]);
assert.deepEqual(catalog.diagnostics.unknownUnitCodes, [999]);

const workMap = createWorkMap([], [], catalog.resources);
const makers = [{id:'CHOI',aliases:['old-choi'],making:['manual-only','담당 수업']},{id:'Hyum'}];
const assigned = createWorkMap([],[],[{id:'assigned',title:'담당 수업',makers:['old-choi','Hyum']},{id:'manual-only',title:'수동 입력 자료',makers:[]}]);
assert.deepEqual(createMakerWorkMap(assigned,makers).get('choi').map(work=>work.id),['assigned']);
assert.deepEqual(createMakerWorkMap(assigned,makers).get('hyum').map(work=>work.id),['assigned']);
assigned.get('lesson:assigned').makers=['Hyum'];
assert.equal(createMakerWorkMap(assigned,makers).has('choi'),false,'수업에서 메이커를 해제하면 예전 제작 자료 입력이 있어도 다시 연결하지 않는다');
const inquiryCatalog = buildDashboardCatalog(
  [{ published: "TRUE", group_id: "inquiry-material", group_title: "사회문제 탐구 자료", "단원_코드": "185" }],
  [{ "단원_코드": "185", 과목: "사회문제탐구", 대단원: "I. 사회문제의 이해와 탐구", 중단원: "1. 사회문제의 의미와 관점", 소단원: "1. 사회문제의 의미와 특징" }],
);
assert.deepEqual(inquiryCatalog.subjects.map(({ school, value, label }) => ({ school, value, label })), [
  { school: "고등학교", value: "사회문제탐구", label: "사회문제 탐구" },
]);
assert.deepEqual(inquiryCatalog.resources[0].subjects, ["사회문제탐구"]);
assert.deepEqual(inquiryCatalog.diagnostics.unknownUnitCodes, []);
assert.deepEqual(workMap.get("game:resource-놀라운-수요일-36-90")?.units, ["XII. 세계화와 평화", "I. 인권 보장과 헌법"]);
assert.deepEqual(workMap.get("lesson:resource-우리가-만드는-수요곡선-45")?.units, ["III. 시장과 가격"]);

const local = { groups: [{ id: "local-lesson", lessons: [{ id: "lesson-1" }] }], games: [{ id: "local-game" }] };
const merged = mergeDashboardCatalog(local, catalog);
assert.equal(merged.schemaVersion, 3);
assert.equal(merged.catalog, catalog);
assert.equal(merged.groups[0].lessons[0].id, "lesson-1");
assert.equal(merged.games[0].id, "local-game");

const legacy = normalizeDashboardConfig({
  groups: [{ id: "legacy-lesson", school: "고등학교", subject: "사회1", title: "로컬 수업", thumbnail_url: "/local.webp", thumbnail_alt: "로컬 수업 이미지", lessons: [{ id: "lesson-1" }] }],
  games: [{ id: "legacy-game", subject: "경제", title: "로컬 게임", link: "https://example.com/game" }],
});
assert.equal(legacy.schemaVersion, 3);
assert.equal(legacy.catalog.resources.length, 2);
assert.equal(legacy.catalog.resources.every(({ unitKeys }) => unitKeys.length === 1), true);
assert.equal(legacy.catalog.resources.find(({ title }) => title === "로컬 수업").thumbnailUrl, "/local.webp");
assert.equal(legacy.catalog.resources.find(({ title }) => title === "로컬 수업").thumbnailAlt, "로컬 수업 이미지");
assert.equal(legacy.catalog.units.every(({ title }) => title === "단원 미지정"), true);
assert.equal(legacy.catalog.subjects.find(({ value }) => value === "사회1").school, "고등학교");
assert.equal(legacy.catalog.units.find(({ subject }) => subject === "사회1").school, "고등학교");
assert.deepEqual(legacy.catalog.resources.find(({ title }) => title === "로컬 수업").schools, ["고등학교"]);
assert.deepEqual(legacy.catalog.resources.find(({ title }) => title === "로컬 수업").actions, [
  { key: "teacher", label: "교사용 자료", href: "index.html?lesson=lesson-1", external: false },
]);
assert.deepEqual(legacy.catalog.resources.find(({ title }) => title === "로컬 게임").schools, ["고등학교"]);

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
try {
  let releaseLocal, managedStarted = false;
  globalThis.fetch = async input => {
    if (String(input).startsWith("/lessons/index.json")) return new Promise(resolve => { releaseLocal = () => resolve({ ok: true, json: async () => ({ groups: [], games: [] }) }); });
    assert.equal(input, "/api/lesson-catalog");
    managedStarted = true;
    return { ok: true, json: async () => ({ active: true, catalog }) };
  };
  const concurrent = loadDashboardConfig();
  assert.equal(managedStarted, true, "Managed catalog starts before the local index responds");
  releaseLocal();
  assert.equal((await concurrent).catalogSource, "managed");
  globalThis.fetch = async input => {
    if (String(input).startsWith("/lessons/index.json")) {
      return { ok: true, json: async () => ({ groups: [], games: [] }) };
    }
    throw new Error("offline");
  };
  console.warn = () => {};
  const retained = await loadDashboardConfig({ cache: false, fallbackConfig: merged });
  assert.equal(retained.catalog.resources.some(({ title }) => title === "놀라운 수요일"), true);
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}
