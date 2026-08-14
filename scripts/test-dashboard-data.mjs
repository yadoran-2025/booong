import assert from "node:assert/strict";
import { buildDashboardCatalog } from "../js/dashboard-data.js";

const unitRows = [
  { "단원_코드": "36", "과목": "사회1", "대단원": "XII. 세계화와 평화", "중단원": "2. 세계화의 양상" },
  { "단원_코드": "45", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "2. 시장 가격의 결정" },
  { "단원_코드": "46", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "3. 시장 가격의 변동" },
  { "단원_코드": "90", "과목": "통합사회2", "대단원": "I. 인권 보장과 헌법", "중단원": "2. 인권 문제의 양상" },
  { "단원_코드": "149", "과목": "경제", "대단원": "I. 경제생활과 경제 문제", "중단원": "1. 희소성과 선택" },
];
const groupRows = [
  { published: "TRUE", group_title: "놀라운 수요일", kind: "game", discipline: "사회", school: "중학교, 고등학교", "단원_코드": "36, 90", teacher_link: "https://example.com/game" },
  { published: "TRUE", group_title: "우리가 만드는 수요곡선", kind: "lesson", discipline: "경제", "단원_코드": "45", teacher_link: "https://example.com/teacher", worksheet_link: "https://example.com/worksheet" },
  { published: "", group_title: "숨긴 자료", kind: "lesson", "단원_코드": "46", teacher_link: "https://example.com/hidden" },
  { published: "TRUE", group_title: "잘못 연결된 자료", kind: "lesson", "단원_코드": "999", teacher_link: "https://example.com/unknown" },
];

const catalog = buildDashboardCatalog(groupRows, unitRows);
assert.deepEqual(catalog.subjects.map(({ value }) => value), ["사회1", "사회2", "통합사회2", "경제"]);
assert.equal(catalog.units.length, 4);
assert.equal(catalog.resources.some(({ title }) => title === "숨긴 자료"), false);
assert.deepEqual(catalog.resources.find(({ title }) => title === "놀라운 수요일").subjects, ["사회1", "통합사회2"]);
assert.equal(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").actions.length, 2);
assert.deepEqual(catalog.diagnostics.unknownUnitCodes, [999]);
