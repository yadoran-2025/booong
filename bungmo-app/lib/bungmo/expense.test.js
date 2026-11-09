import assert from "node:assert/strict";
import test from "node:test";
import * as expenseDomain from "./expense.js";

const { normalizeExpenseDraft, normalizeExpenseRows, resolveExpenseMembers, syncExpenseDraftMembers } = expenseDomain;

test("지출 초안을 정규화하고 알 수 없는 참여자 ID도 보존한다", () => {
  assert.deepEqual(normalizeExpenseDraft({ title: "  식사 ", amount: "10000", payerId: "payer", participantIds: ["unknown-user", "payer", "unknown-user"] }), {
    title: "식사", amount: 10000, payerId: "payer", participantIds: ["unknown-user", "payer"]
  });
});

test("지출 초안의 필수 값과 정수 금액을 검증한다", () => {
  const valid = { title: "식사", amount: "100", payerId: "payer", participantIds: ["payer"] };
  assert.throws(() => normalizeExpenseDraft({ ...valid, title: " " }), /지출 이름/);
  assert.throws(() => normalizeExpenseDraft({ ...valid, amount: "1.5" }), /1원 이상의 숫자/);
  assert.throws(() => normalizeExpenseDraft({ ...valid, payerId: "" }), /결제한 사람/);
  assert.throws(() => normalizeExpenseDraft({ ...valid, participantIds: [] }), /함께한 사람/);
});

test("새 지출은 선택한 모임 밖의 결제자와 참여자를 거부한다", () => {
  const valid = { title: "식사", amount: "100", payerId: "payer", participantIds: ["payer"] };
  assert.throws(() => normalizeExpenseDraft({ ...valid, payerId: "outsider" }, ["payer"]), /모임 멤버/);
  assert.throws(() => normalizeExpenseDraft({ ...valid, participantIds: ["payer", "outsider"] }, ["payer"]), /모임 멤버/);
  assert.throws(() => normalizeExpenseDraft(valid, []), /모임 멤버/);
});

test("새 지출의 선택지는 현재 활성 멤버만 포함한다", () => {
  const active = { id: "active", displayName: "활성" };
  const inactive = { id: "inactive", displayName: "비활성", active: false };
  assert.deepEqual(resolveExpenseMembers([active], [active, inactive], null), [active]);
});

test("지출 수정은 현재 멤버와 원본에 참조된 비활성·레거시 멤버만 보여 준다", () => {
  const active = { id: "active", displayName: "활성" };
  const inactive = { id: "inactive", displayName: "비활성", active: false };
  const unrelated = { id: "unrelated", displayName: "무관한 비활성", active: false };
  const expense = { payerId: "inactive", participantIds: ["active", "legacy-member", "inactive"] };

  assert.deepEqual(resolveExpenseMembers([active], [active, inactive, unrelated], expense), [
    active,
    inactive,
    { id: "legacy-member", displayName: "legacy-m" }
  ]);
});

test("현재 멤버가 없어도 원본 ID 범위에서 역사 지출을 수정할 수 있다", () => {
  const expense = { title: "식사", amount: "100", payerId: "inactive", participantIds: ["inactive", "legacy-member"] };
  const members = resolveExpenseMembers([], [{ id: "inactive", displayName: "비활성", active: false }], expense);

  assert.deepEqual(members.map((member) => member.id), ["inactive", "legacy-member"]);
  assert.deepEqual(normalizeExpenseDraft(expense, members.map((member) => member.id)), {
    title: "식사", amount: 100, payerId: "inactive", participantIds: ["inactive", "legacy-member"]
  });
});

test("원본에 없는 멤버가 모달을 연 뒤 비활성화되면 저장을 거부한다", () => {
  const original = { id: "original", displayName: "원본" };
  const stale = { id: "stale", displayName: "비활성화됨", active: false };
  const expense = { payerId: "original", participantIds: ["original"] };
  const members = resolveExpenseMembers([original], [original, stale], expense);

  assert.deepEqual(members.map((member) => member.id), ["original"]);
  assert.throws(() => normalizeExpenseDraft({ title: "식사", amount: "100", payerId: "original", participantIds: ["original", "stale"] }, members.map((member) => member.id)), /모임 멤버/);
});

test("새 지출을 입력하는 동안 사라진 멤버만 초안에서 제거한다", () => {
  const form = { title: "저녁 장보기", amount: "28000", payerId: "removed", participantIds: ["removed", "active"] };

  assert.deepEqual(syncExpenseDraftMembers(form, [{ id: "active" }]), {
    title: "저녁 장보기", amount: "28000", payerId: "active", participantIds: ["active"]
  });
});

test("멤버십 문서가 없는 과거 등록 회원은 프로필 이름으로 표시하되 새 선택지에는 넣지 않는다", () => {
  const active = { id: "active", displayName: "활성" };
  const users = [{ id: "legacy-user", nickname: "옛 회원" }];
  const expense = { payerId: "legacy-user", participantIds: ["active", "legacy-user"] };

  assert.deepEqual(resolveExpenseMembers([active], [active], expense, users), [
    active,
    { id: "legacy-user", displayName: "옛 회원" }
  ]);
  assert.deepEqual(resolveExpenseMembers([active], [active], null, users), [active]);
});

test("지출 참여자 수는 제한하지 않고 모든 ID를 검증한다", () => {
  const base = { title: "식사", amount: "100", payerId: "payer", participantIds: ["payer"] };
  assert.equal(normalizeExpenseDraft({ ...base, participantIds: Array.from({ length: 20 }, (_, index) => `u${index}`) }).participantIds.length, 20);
  assert.throws(() => normalizeExpenseDraft({ ...base, participantIds: ["payer", 3] }), /멤버 정보/);
  assert.throws(() => normalizeExpenseDraft({ ...base, payerId: " ".repeat(2) }), /결제한 사람/);
});

test("지출 시트는 빈 행을 건너뛰고 입력한 행을 순서대로 검증한다", () => {
  const row = { title: " 식사 ", amount: "12000", payerId: "payer", participantIds: ["payer", "guest"] };
  assert.deepEqual(normalizeExpenseRows([{ title: " ", amount: "" }, row, { ...row, title: "교통", amount: "3000" }], ["payer", "guest"]), [
    { ...row, title: "식사", amount: 12000 }, { ...row, title: "교통", amount: 3000 }
  ]);
  assert.throws(() => normalizeExpenseRows([{ title: "", amount: "" }]), /한 건 이상/);
  assert.throws(() => normalizeExpenseRows([{ title: "", amount: "" }, { ...row, amount: "1.5" }]), error => error.rowIndex === 1 && /^2행:/.test(error.message));
  assert.throws(() => normalizeExpenseRows([{ ...row, title: "" }]), /^Error: 1행:/);
  assert.throws(() => normalizeExpenseRows([row], ["payer"]), /모임 멤버/);
  assert.throws(() => normalizeExpenseRows(Array(501).fill(row)), /500행/);
});
