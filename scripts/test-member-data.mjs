import assert from "node:assert/strict";
import { normalizeMemberRow, parseMemberProfileCsv } from "../js/member-data.js";

const members = parseMemberProfileCsv("id,name,aliases,career,making\nDo,이도빈,doh|dobby,학교(2025)|부대(2026-),수업 A|game-1\n");
assert.deepEqual(members[0].aliases, ["doh", "dobby"]);
assert.deepEqual(members[0].career, ["학교(2025)", "부대(2026-)"]);
assert.deepEqual(members[0].making, ["수업 A", "game-1"]);
assert.equal(normalizeMemberRow({ id: "" }), null);
console.log("member-data tests passed");
