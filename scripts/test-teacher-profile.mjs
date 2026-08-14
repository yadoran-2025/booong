import assert from "node:assert/strict";
import { createSubjectOptions, getAdjacentTeacherProfile, getSubjectLabel, normalizeTeacherProfile } from "../js/teacher-profile.js";

const choices = createSubjectOptions({ subjects: [
  { school: "고등학교", value: "통합사회2", label: "통합사회2" },
  { school: "중학교", value: "사회1", label: "사회1" },
  { school: "중학교", value: "사회2", label: "사회2" },
  { school: "고등학교", value: "정치", label: "정치와 법" },
] });

assert.deepEqual(choices, {
  중학교: [
    { value: "사회1", label: "사회1" },
    { value: "사회2", label: "사회2" },
  ],
  고등학교: [
    { value: "통합사회2", label: "통합사회2" },
    { value: "정치", label: "정치와 법" },
  ],
});
assert.equal(getSubjectLabel(choices, "고등학교", "정치"), "정치와 법");
assert.deepEqual(normalizeTeacherProfile({ school: "고등학교", subject: "정치" }, choices), { school: "고등학교", subject: "정치" });
assert.equal(normalizeTeacherProfile({ school: "고등학교", subject: "한국지리" }, choices), null);
assert.deepEqual(getAdjacentTeacherProfile({ school: "중학교", subject: "사회2" }, choices, 1), { school: "고등학교", subject: "통합사회2" });
assert.deepEqual(getAdjacentTeacherProfile({ school: "고등학교", subject: "정치" }, choices, 1), { school: "중학교", subject: "사회1" });
