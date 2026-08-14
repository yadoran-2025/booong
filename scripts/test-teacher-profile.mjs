import assert from "node:assert/strict";
import { createSubjectOptions, getAdjacentTeacherProfile, normalizeTeacherProfile } from "../js/teacher-profile.js";

const choices = {
  중학교: ["사회1", "사회2"],
  고등학교: ["통합사회2", "정치"],
};

assert.deepEqual(createSubjectOptions({ subjects: [
  { school: "고등학교", value: "통합사회2" },
  { school: "중학교", value: "사회1" },
  { school: "중학교", value: "사회2" },
  { school: "고등학교", value: "정치" },
] }), choices);
assert.deepEqual(normalizeTeacherProfile({ school: "고등학교", subject: "정치" }, choices), { school: "고등학교", subject: "정치" });
assert.equal(normalizeTeacherProfile({ school: "고등학교", subject: "한국지리" }, choices), null);
assert.deepEqual(getAdjacentTeacherProfile({ school: "중학교", subject: "사회2" }, choices, 1), { school: "고등학교", subject: "통합사회2" });
assert.deepEqual(getAdjacentTeacherProfile({ school: "고등학교", subject: "정치" }, choices, 1), { school: "중학교", subject: "사회1" });
