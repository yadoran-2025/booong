import assert from "node:assert/strict";
import test from "node:test";
import { editableScheduleMembers, normalizeMemberDraft, resolveMeetingMembers } from "./member.js";

test("registered and guest member drafts are normalized", () => {
  assert.deepEqual(normalizeMemberDraft({ kind: "profile", profileId: "CHOI", displayName: " 최진영 " }), { kind: "profile", profileId: "CHOI", displayName: "최진영", active: true });
  assert.deepEqual(normalizeMemberDraft({ kind: "registered", userId: "u1" }), {
    kind: "registered", userId: "u1", active: true
  });
  assert.deepEqual(normalizeMemberDraft({ kind: "guest", displayName: "  철수  " }), {
    kind: "guest", displayName: "철수", active: true
  });
  assert.throws(() => normalizeMemberDraft({ kind: "guest", displayName: " " }), /객원 이름/);
});

test("BOOONG 프로필의 최신 이름을 쓰고 삭제된 프로필은 기록된 이름을 보존한다", () => {
  const records = [{ id: "booong:CHOI", kind: "profile", profileId: "CHOI", displayName: "옛 이름", active: true }];
  assert.equal(resolveMeetingMembers(records, [{ id: "booong:CHOI", nickname: "최진영" }])[0].displayName, "최진영");
  assert.equal(resolveMeetingMembers(records, [])[0].displayName, "옛 이름");
});

test("meeting members resolve registered profiles and hide inactive records", () => {
  const records = [
    { id: "u1", kind: "registered", userId: "u1", active: true },
    { id: "g1", kind: "guest", displayName: "철수", active: true },
    { id: "g2", kind: "guest", displayName: "영희", active: false }
  ];
  assert.deepEqual(resolveMeetingMembers(records, [{ id: "u1", nickname: "가나" }]), [
    { id: "u1", kind: "registered", userId: "u1", displayName: "가나", active: true },
    { id: "g1", kind: "guest", displayName: "철수", active: true }
  ]);
});

test("inactive members remain resolvable for historical records", () => {
  const records = [{ id: "g1", kind: "guest", displayName: "철수", active: false }];
  assert.equal(resolveMeetingMembers(records, [], { activeOnly: false })[0].displayName, "철수");
});

test("operators can record every active participant schedule", () => {
  const members = [
    { id: "u1", kind: "registered", displayName: "진영", active: true },
    { id: "u2", kind: "registered", displayName: "민수", active: true },
    { id: "g1", kind: "guest", displayName: "철수", active: true },
    { id: "g2", kind: "guest", displayName: "영희", active: false }
  ];
  assert.deepEqual(editableScheduleMembers(members, "u1").map((member) => member.id), ["u1", "u2", "g1"]);
});
