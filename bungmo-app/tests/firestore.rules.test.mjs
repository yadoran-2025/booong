import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, afterEach, before } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from "firebase/firestore";

let env;

const CREATED_AT = Timestamp.fromMillis(1000);
const UPDATED_AT = Timestamp.fromMillis(2000);
const MAX_SAFE_AMOUNT = 9007199254740991;

const googleClaims = (email) => ({ firebase: { sign_in_provider: "custom" }, email, email_verified: true,
  bungmoOperator: true, bungmoEmail: email, bungmoUntil: Math.floor(Date.now() / 1000) + 120 });

async function seedMember(uid, nickname, overrides = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "bungmoUsers", uid), {
      nickname,
      email: `${uid}@example.com`,
      photoURL: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides
    });
  });
}

async function seedMeetingMember(meetingId, memberId, data) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "bungmoMeetings", meetingId, "members", memberId), {
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      ...data
    });
  });
}

async function seedResponse(meetingId, uid) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "bungmoMeetings", meetingId, "responses", uid), {
      displayName: uid,
      availability: {},
      updatedAt: serverTimestamp()
    });
  });
}

const meetingData = (overrides = {}) => ({
  round: 8,
  title: "화천",
  location: "강원",
  status: "upcoming",
  candidateDates: [],
  startHour: 10,
  endHour: 22,
  startDate: "2026-08-14",
  endDate: "2026-08-15",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...overrides
});

async function seedMeeting(meetingId, data = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "bungmoMeetings", meetingId), meetingData(data));
  });
}

async function seedExpense(meetingId, expenseId, data = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "bungmoMeetings", meetingId, "expenses", expenseId), {
      title: "숙소",
      payerId: "payer",
      participantIds: ["payer"],
      amount: 10000,
      settled: false,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      ...data
    });
  });
}

const expenseData = (overrides = {}) => ({
  title: "숙소",
  payerId: "payer",
  participantIds: ["payer"],
  amount: 10000,
  settled: false,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...overrides
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-booong-bungmo",
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") }
  });
});

afterEach(async () => env.clearFirestore());
after(async () => env.cleanup());

test("일반 Google 계정과 게스트는 기존 프로필이 있어도 조회·추가·수정할 수 없다", async () => {
  await seedMember("guest", "손님");
  await seedMeeting("private");
  const db = env.authenticatedContext("guest", { email: "guest@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
  await assertFails(getDoc(doc(db, "bungmoUsers/guest")));
  await assertFails(getDoc(doc(db, "bungmoMeetings/private")));
  await assertFails(setDoc(doc(db, "bungmoMeetings/private/members/g1"), { kind: "guest", displayName: "게스트", active: true, createdAt: CREATED_AT, updatedAt: UPDATED_AT }));
  await assertFails(updateDoc(doc(db, "bungmoMeetings/private"), { title: "공격" }));
  await assertFails(deleteDoc(doc(db, "bungmoMeetings/private")));
});

test("승인된 세션도 만료되거나 데이터 세션 제공자가 다르면 차단한다", async () => {
  await seedMember("u1", "운영자");
  await seedMeeting("private");
  for (const overrides of [{ bungmoUntil: 1 }, { bungmoOperator: false }, { firebase: { sign_in_provider: "google.com" } }]) {
    const db = env.authenticatedContext("u1", { ...googleClaims("operator@example.com"), ...overrides }).firestore();
    await assertFails(getDoc(doc(db, "bungmoMeetings/private")));
    await assertFails(setDoc(doc(db, "bungmoMeetings/private/members/new"), { kind: "guest", displayName: "게스트", active: true, createdAt: CREATED_AT, updatedAt: UPDATED_AT }));
  }
});

test("붕모 외의 실제 배포 규칙을 그대로 보존한다", async () => {
  const baseline = await readFile(new URL("../firestore.baseline.rules", import.meta.url), "utf8");
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const withoutFunctions = rules.slice(0, rules.indexOf("    function bungmoOperator()")) + rules.slice(rules.indexOf("    match /users/{userId}"));
  const withoutCollections = withoutFunctions.slice(0, withoutFunctions.indexOf("    match /bungmoUsers/{uid}")) + "  }\n}\n";
  assert.equal(withoutCollections, baseline);
});

test("서버가 승인한 운영자는 자신의 붕모 프로필을 만든다", async () => {
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(setDoc(doc(db, "bungmoUsers/u1"), {
    nickname: "재영", email: "u1@example.com", photoURL: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
});

test("다른 사람의 닉네임은 바꿀 수 없다", async () => {
  await seedMember("u1", "재영");
  await seedMember("u2", "민수");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(updateDoc(doc(db, "bungmoUsers/u2"), { nickname: "변경" }));
});

test("붕모에서는 별도의 사이트 이용 권한을 만들거나 바꿀 수 없다", async () => {
  await seedMember("admin", "관리자");
  await seedMember("u2", "민수");
  const admin = env.authenticatedContext("admin", googleClaims("noamchomsky1571@gmail.com")).firestore();
  const member = env.authenticatedContext("u2", { email: "u2@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();

  await assertFails(updateDoc(doc(admin, "bungmoUsers/u2"), { active: false, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(member, "bungmoUsers/admin"), { active: false, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(admin, "bungmoUsers/admin"), { active: false, updatedAt: serverTimestamp() }));
});

test("기존 붕모 접근 플래그와 관계없이 BOOONG 승인 세션을 따른다", async () => {
  await seedMember("inactive", "차단", { active: false });
  await seedMember("legacy", "기존 멤버");
  await seedMeeting("m1");
  const inactive = env.authenticatedContext("inactive", googleClaims("inactive@example.com")).firestore();
  const legacy = env.authenticatedContext("legacy", googleClaims("legacy@example.com")).firestore();

  await assertSucceeds(getDoc(doc(inactive, "bungmoMeetings/m1")));
  await assertSucceeds(getDoc(doc(inactive, "bungmoUsers/inactive")));
  await assertFails(updateDoc(doc(inactive, "bungmoUsers/inactive"), { active: true, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(inactive, "bungmoUsers/legacy"), { active: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(legacy, "bungmoMeetings/m1")));
  await assertSucceeds(updateDoc(doc(inactive, "bungmoUsers/inactive"), { nickname: "운영자", updatedAt: serverTimestamp() }));
});

test("회원은 모임 지출을 함께 관리할 수 있다", async () => {
  await seedMember("u1", "재영");
  await seedMeetingMember("m8", "u1", { kind: "registered", userId: "u1", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m8/expenses/e1"), {
    title: "숙소", payerId: "u1", participantIds: ["u1"], amount: 10000,
    settled: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
});

test("지출 여러 건은 함께 저장되고 잘못된 행이 있으면 전부 저장하지 않는다", async () => {
  await seedMember("u1", "운영자");
  await seedMeeting("batch-meeting");
  await seedMeetingMember("batch-meeting", "u1", { kind: "registered", userId: "u1", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const base = { title: "식사", payerId: "u1", participantIds: ["u1"], amount: 10000, settled: false, createdAt: CREATED_AT, updatedAt: UPDATED_AT };
  const first = doc(db, "bungmoMeetings/batch-meeting/expenses/first"), second = doc(db, "bungmoMeetings/batch-meeting/expenses/second");
  const batch = writeBatch(db);
  batch.set(first, base); batch.set(second, { ...base, title: "교통", amount: 3000 });
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(first)).data().amount, 10000);
  assert.equal((await getDoc(second)).data().amount, 3000);
  const third = doc(db, "bungmoMeetings/batch-meeting/expenses/third"), fourth = doc(db, "bungmoMeetings/batch-meeting/expenses/fourth");
  const invalid = writeBatch(db);
  invalid.set(third, base); invalid.set(fourth, { ...base, amount: 0 });
  await assertFails(invalid.commit());
  assert.equal((await getDoc(third)).exists(), false);
  assert.equal((await getDoc(fourth)).exists(), false);
});

test("new expenses require an active payer", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "payer", { kind: "guest", displayName: "결제자", active: true });
  await seedMeetingMember("m1", "active", { kind: "guest", displayName: "참여자", active: true });
  await seedMeetingMember("m1", "inactive", { kind: "guest", displayName: "제외", active: false });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();

  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/expenses/valid"), expenseData({ participantIds: ["active"] })));
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/expenses/inactive-payer"), expenseData({ payerId: "inactive", participantIds: ["active"] })));
});

test("expenses accept more than eight participants", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "payer", { kind: "guest", displayName: "결제자", active: true });
  const activeIds = Array.from({ length: 20 }, (_, index) => `active-${index}`);
  for (const id of activeIds) await seedMeetingMember("m1", id, { kind: "guest", displayName: id, active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();

  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/expenses/twenty"), expenseData({ participantIds: activeIds })));
});

test("expense updates retain referenced historical IDs", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "active", { kind: "guest", displayName: "활성", active: true });
  await seedMeetingMember("m1", "old-payer", { kind: "guest", displayName: "기존 결제자", active: false });
  await seedMeetingMember("m1", "old-participant", { kind: "guest", displayName: "기존 참여자", active: false });
  await seedMeetingMember("m1", "new-inactive", { kind: "guest", displayName: "새 비활성", active: false });
  await seedExpense("m1", "history", { payerId: "old-payer", participantIds: ["old-participant"] });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const expense = doc(db, "bungmoMeetings/m1/expenses/history");

  await assertSucceeds(updateDoc(expense, { payerId: "old-participant", participantIds: ["old-payer", "active"], updatedAt: serverTimestamp() }));
});

test("expense IDs, list shape, timestamps, and safe-integer money are bounded", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "payer", { kind: "guest", displayName: "결제자", active: true });
  await seedMeetingMember("m1", " ", { kind: "guest", displayName: "공백 ID", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const write = (id, data) => setDoc(doc(db, "bungmoMeetings", "m1", "expenses", id), data);

  await assertSucceeds(write("max-safe", expenseData({ amount: MAX_SAFE_AMOUNT })));
  await assertFails(write("unsafe", expenseData({ amount: MAX_SAFE_AMOUNT + 1 })));
  await assertFails(write("fraction", expenseData({ amount: 1.5 })));
  await assertFails(write("empty-payer", expenseData({ payerId: "" })));
  await assertFails(write("blank-payer", expenseData({ payerId: " " })));
  await assertFails(write("long-payer", expenseData({ payerId: "x".repeat(129) })));
  await assertFails(write("duplicate", expenseData({ participantIds: ["payer", "payer"] })));
  await assertFails(write("bad-created-at", expenseData({ createdAt: "now" })));
});

test("Bungmo members may add a guest but may not delete member history", async () => {
  await seedMember("u1", "진영");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const guest = doc(db, "bungmoMeetings/m1/members/g1");
  await assertSucceeds(setDoc(guest, {
    kind: "guest", displayName: "철수", active: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(guest));
});

test("guest names containing only whitespace are rejected", async () => {
  await seedMember("u1", "진영");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/g1"), {
    kind: "guest", displayName: " \t\n", active: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
});

test("a meeting records its operator without automatically adding a participant", async () => {
  await seedMember("u1", "진영");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1"), meetingData({ creatorId: "u1" })));
  assert.equal((await getDoc(doc(db, "bungmoMeetings/m1/members/u1"))).exists(), false);
});

test("new meetings require the actual creator identity", async () => {
  await seedMember("u1", "진영");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const { creatorId, ...withoutCreator } = meetingData({ creatorId: "u1" });
  await assertFails(setDoc(doc(db, "bungmoMeetings/missing-creator"), withoutCreator));
  await assertFails(setDoc(doc(db, "bungmoMeetings/wrong-creator"), meetingData({ creatorId: "other" })));
});

test("BOOONG 참가자는 프로필 ID로 저장하고 다른 프로필로 바꿀 수 없다", async () => {
  await seedMember("u1", "운영자");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const member = doc(db, "bungmoMeetings/m1/members/booong:CHOI");
  const data = { kind: "profile", profileId: "CHOI", displayName: "최진영", active: true, createdAt: CREATED_AT, updatedAt: UPDATED_AT };
  await assertSucceeds(setDoc(member, data));
  await assertFails(updateDoc(member, { profileId: "Moon", displayName: "문영종" }));
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/wrong"), data));
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/booong:Moon"), { ...data, kind: "guest", profileId: "Moon" }));
  await assertSucceeds(updateDoc(member, { active: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(member, { active: true, updatedAt: serverTimestamp() }));
});

test("meeting creatorId must be the requester and is immutable", async () => {
  await seedMember("u1", "진영");
  await seedMember("u2", "민수");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "bungmoMeetings/wrong-creator"), meetingData({ creatorId: "u2" }));
  batch.set(doc(db, "bungmoMeetings/wrong-creator/members/u2"), {
    kind: "registered", userId: "u2", active: true,
    createdAt: CREATED_AT, updatedAt: UPDATED_AT
  });
  await assertFails(batch.commit());

  await seedMeeting("protected", { creatorId: "u1" });
  await assertFails(updateDoc(doc(db, "bungmoMeetings/protected"), { creatorId: "u2", updatedAt: serverTimestamp() }));
});

test("legacy meetings without creatorId remain editable", async () => {
  await seedMember("u1", "진영");
  await seedMeeting("legacy");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(updateDoc(doc(db, "bungmoMeetings/legacy"), { title: "수정된 모임", updatedAt: serverTimestamp() }));
});

test("registered members require a matching Bungmo profile", async () => {
  await seedMember("u1", "진영");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/members/u1"), {
    kind: "registered", userId: "u1", active: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/phantom"), {
    kind: "registered", userId: "phantom", active: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
});

test("a guest member ID may not collide with a Bungmo profile", async () => {
  await seedMember("u1", "진영");
  await seedMember("u2", "민수");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/u2"), {
    kind: "guest", displayName: "철수", active: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
});

test("a registered member cannot be replaced by a guest to take over a response", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "u2", { kind: "registered", userId: "u2", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/u2"), {
    kind: "guest", displayName: "민수", active: true,
    createdAt: CREATED_AT, updatedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/responses/u2"), {
    displayName: "민수", availability: {}, updatedAt: serverTimestamp()
  }));
});

test("a meeting member creation timestamp is immutable", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "g1", { kind: "guest", displayName: "철수", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(updateDoc(doc(db, "bungmoMeetings/m1/members/g1"), {
    createdAt: Timestamp.fromMillis(3000), updatedAt: serverTimestamp()
  }));
});

test("a member may deactivate a guest without changing identity", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "g1", { kind: "guest", displayName: "철수", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(updateDoc(doc(db, "bungmoMeetings/m1/members/g1"), {
    active: false, updatedAt: serverTimestamp()
  }));
});

test("an inactive meeting member may be reactivated without changing identity", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "g1", { kind: "guest", displayName: "철수", active: false });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(updateDoc(doc(db, "bungmoMeetings/m1/members/g1"), {
    active: true, updatedAt: serverTimestamp()
  }));
});

test("a registered member user ID is immutable", async () => {
  await seedMember("u1", "진영");
  await seedMember("u2", "민수");
  await seedMeetingMember("m1", "u2", { kind: "registered", userId: "legacy-u2", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/members/u2"), {
    kind: "registered", userId: "u2", active: true,
    createdAt: CREATED_AT, updatedAt: serverTimestamp()
  }));
});

test("operators can record guest and registered participant schedules", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "g1", { kind: "guest", displayName: "철수", active: true });
  await seedMeetingMember("m1", "u2", { kind: "registered", userId: "u2", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/responses/g1"), {
    displayName: "철수", availability: {}, updatedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/responses/u2"), {
    displayName: "민수", availability: {}, updatedAt: serverTimestamp()
  }));
});

test("an active registered member may edit their own response", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "u1", { kind: "registered", userId: "u1", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertSucceeds(setDoc(doc(db, "bungmoMeetings/m1/responses/u1"), {
    displayName: "진영", availability: {}, updatedAt: serverTimestamp()
  }));
});

test("an inactive guest may not edit a response", async () => {
  await seedMember("u1", "진영");
  await seedMeetingMember("m1", "g1", { kind: "guest", displayName: "철수", active: false });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(setDoc(doc(db, "bungmoMeetings/m1/responses/g1"), {
    displayName: "철수", availability: {}, updatedAt: serverTimestamp()
  }));
});

test("개인 일정은 작성자만 바꿀 수 있다", async () => {
  await seedMember("u1", "재영");
  await seedMember("u2", "민수");
  await seedResponse("m8", "u2");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(updateDoc(doc(db, "bungmoMeetings/m8/responses/u2"), { availability: {} }));
});

test("transfer settlement status accepts only a bounded transfer record", async () => {
  await seedMember("u1", "member");
  await seedMeetingMember("m1", "u1", { kind: "registered", userId: "u1", active: true });
  await seedMeetingMember("m1", "u2", { kind: "guest", displayName: "guest", active: true });
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const transfer = doc(db, "bungmoMeetings/m1/transferSettlements/u1|u2");
  const valid = { fromId: "u1", toId: "u2", amount: 5000, revision: "0123456789abcdef", settled: true, updatedAt: serverTimestamp() };

  await assertSucceeds(setDoc(transfer, valid));
  await assertFails(setDoc(transfer, { ...valid, amount: 0 }));
  await assertFails(setDoc(transfer, { ...valid, revision: "stale" }));
  await assertFails(setDoc(transfer, { ...valid, extra: true }));
});

test("Bungmo 규칙은 기존 앱 컬렉션 권한을 넓히지 않는다", async () => {
  await seedMember("u1", "재영");
  const db = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  await assertFails(setDoc(doc(db, "classes/foreign-app"), { title: "금지" }));
  await assertFails(setDoc(doc(db, "workflows/foreign-app"), { title: "금지" }));
});

test("operators record well-formed readiness for each active participant", async () => {
  await seedMember("u1", "재영");
  await seedMember("u2", "민수");
  await seedMeetingMember("m1", "u1", { kind: "registered", userId: "u1", active: true });
  await seedMeetingMember("m1", "u2", { kind: "registered", userId: "u2", active: true });
  await seedMeetingMember("m1", "guest", { kind: "guest", displayName: "손님", active: true });
  const u1 = env.authenticatedContext("u1", googleClaims("u1@example.com")).firestore();
  const readiness = doc(u1, "bungmoMeetings/m1/expenseReadiness/u1");
  const valid = { ready: true, revision: "0123456789abcdef", updatedAt: serverTimestamp() };

  await assertSucceeds(setDoc(readiness, valid));
  await assertSucceeds(setDoc(doc(u1, "bungmoMeetings/m1/expenseReadiness/u2"), valid));
  await assertFails(setDoc(readiness, { ...valid, revision: "wrong" }));
  await assertSucceeds(setDoc(doc(u1, "bungmoMeetings/m1/expenseReadiness/guest"), valid));
});
