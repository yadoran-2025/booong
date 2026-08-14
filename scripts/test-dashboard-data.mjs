import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDashboardCatalog, mergeDashboardCatalog, normalizeDashboardConfig } from "../js/dashboard-data.js";

const dashboardSource = readFileSync(new URL("../js/ui/dashboard.js", import.meta.url), "utf8");
assert.match(dashboardSource, /pointerdown[\s\S]*?event\.target\.closest\("button"\)/);

const unitRows = [
  { "단원_코드": "36", "과목": "사회1", "대단원": "XII. 세계화와 평화", "중단원": "2. 세계화의 양상" },
  { "단원_코드": "45", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "2. 시장 가격의 결정" },
  { "단원_코드": "46", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "3. 시장 가격의 변동" },
  { "단원_코드": "90", "과목": "통합사회2", "대단원": "I. 인권 보장과 헌법", "중단원": "2. 인권 문제의 양상" },
  { "단원_코드": "149", "과목": "경제", "대단원": "I. 경제생활과 경제 문제", "중단원": "1. 희소성과 선택" },
];
const groupRows = [
  { published: "TRUE", group_title: "놀라운 수요일", kind: "game", discipline: "사회", school: "중학교, 고등학교", "단원_코드": "36, 90", teacher_link: "https://example.com/game" },
  { published: "TRUE", group_title: "우리가 만드는 수요곡선", kind: "lesson", discipline: "경제", desc: "설명전용검색어", "단원_코드": "45", teacher_link: "https://example.com/teacher", worksheet_link: "https://example.com/worksheet" },
  { published: "", group_title: "숨긴 자료", kind: "lesson", "단원_코드": "46", teacher_link: "https://example.com/hidden" },
  { published: "TRUE", group_title: "잘못 연결된 자료", kind: "lesson", "단원_코드": "999", teacher_link: "https://example.com/unknown" },
];

const catalog = buildDashboardCatalog(groupRows, unitRows);
assert.deepEqual(catalog.subjects.map(({ value }) => value), ["사회1", "사회2", "통합사회2"]);
assert.equal(catalog.units.length, 4);
assert.equal(catalog.resources.some(({ title }) => title === "숨긴 자료"), false);
assert.deepEqual(catalog.resources.find(({ title }) => title === "놀라운 수요일").subjects, ["사회1", "통합사회2"]);
assert.equal(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").actions.length, 2);
assert.equal(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").searchText.includes("설명전용검색어"), true);
assert.deepEqual(catalog.diagnostics.unknownUnitCodes, [999]);

const local = { groups: [{ id: "local-lesson", lessons: [{ id: "lesson-1" }] }], games: [{ id: "local-game" }] };
const merged = mergeDashboardCatalog(local, catalog);
assert.equal(merged.schemaVersion, 3);
assert.equal(merged.catalog, catalog);
assert.equal(merged.groups[0].lessons[0].id, "lesson-1");
assert.equal(merged.games[0].id, "local-game");

const legacy = normalizeDashboardConfig({
  groups: [{ id: "legacy-lesson", subject: "사회1", title: "로컬 수업", lessons: [] }],
  games: [{ id: "legacy-game", subject: "경제", title: "로컬 게임", link: "https://example.com/game" }],
});
assert.equal(legacy.schemaVersion, 3);
assert.equal(legacy.catalog.resources.length, 2);
assert.equal(legacy.catalog.resources.every(({ unitKeys }) => unitKeys.length === 1), true);
assert.equal(legacy.catalog.units.every(({ title }) => title === "단원 미지정"), true);
