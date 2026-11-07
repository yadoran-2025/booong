import assert from "node:assert/strict";
import test from "node:test";
import { calculateTransfers, expenseEntryRevision, expenseRevision, groupPersonExpenses, readinessForRevision, splitExpense, summarizePersonTransfers, unsettledTransfers } from "./settlement.js";

test("나누어떨어지지 않는 1원은 참여자 ID 순서대로 배분한다", () => {
  assert.deepEqual(splitExpense(100, ["c", "a", "b"]), { a: 34, b: 33, c: 33 });
});

test("정산 완료된 지출은 송금액에서 제외한다", () => {
  const expenses = [
    { payerId: "a", participantIds: ["a", "b"], amount: 10000, settled: false },
    { payerId: "b", participantIds: ["a", "b"], amount: 4000, settled: true }
  ];
  assert.deepEqual(calculateTransfers(expenses), [{ fromId: "b", toId: "a", amount: 5000 }]);
});

test("상계 후 최소 송금 목록을 만든다", () => {
  const expenses = [
    { payerId: "a", participantIds: ["a", "b", "c"], amount: 12000, settled: false },
    { payerId: "b", participantIds: ["a", "b"], amount: 4000, settled: false }
  ];
  assert.deepEqual(calculateTransfers(expenses), [
    { fromId: "b", toId: "a", amount: 2000 },
    { fromId: "c", toId: "a", amount: 4000 }
  ]);
});

test("최종 송금액은 10원 미만을 버린다", () => {
  const expenses = [
    { payerId: "a", participantIds: ["a", "b"], amount: 2469, settled: false },
    { payerId: "c", participantIds: ["c", "d"], amount: 19, settled: false }
  ];
  assert.deepEqual(calculateTransfers(expenses), [
    { fromId: "b", toId: "a", amount: 1230 }
  ]);
});

test("does not reroute debt to an unrelated third party", () => {
  const expenses = [
    { payerId: "b", participantIds: ["a", "b"], amount: 10000, settled: false },
    { payerId: "c", participantIds: ["b", "c"], amount: 10000, settled: false }
  ];
  assert.deepEqual(calculateTransfers(expenses), [
    { fromId: "a", toId: "b", amount: 5000 },
    { fromId: "b", toId: "c", amount: 5000 }
  ]);
});

test("completed transfer status applies only to the same pair and amount", () => {
  const transfers = [
    { fromId: "a", toId: "b", amount: 5000 },
    { fromId: "b", toId: "c", amount: 3000 }
  ];
  const settlements = [
    { fromId: "a", toId: "b", amount: 5000, revision: "r1", settled: true },
    { fromId: "b", toId: "c", amount: 2000, revision: "r1", settled: true }
  ];
  assert.deepEqual(unsettledTransfers(transfers, settlements, "r1"), [transfers[1]]);
  assert.deepEqual(unsettledTransfers(transfers, settlements, "r2"), transfers);
});

test("expense revision changes only when settlement inputs change", () => {
  const expense = { id: "e1", title: "old", payerId: "a", participantIds: ["b", "a"], amount: 5000, settled: false };
  const revision = expenseRevision([expense]);
  assert.match(revision, /^[0-9a-f]{16}$/);
  assert.equal(expenseRevision([{ ...expense, title: "new", participantIds: ["a", "b"] }]), revision);
  assert.notEqual(expenseRevision([{ ...expense, amount: 5001 }]), revision);
});

test("expense entry revision changes for every field shown in the completion flow", () => {
  const expense = { id: "e1", title: "장보기", payerId: "a", participantIds: ["a", "b"], amount: 5000, settled: false };
  const revision = expenseEntryRevision([expense]);
  assert.match(revision, /^[0-9a-f]{16}$/);
  assert.notEqual(expenseEntryRevision([{ ...expense, title: "마트" }]), revision);
  assert.notEqual(expenseEntryRevision([{ ...expense, settled: true }]), revision);
});

test("all registered members must be ready for the same current revision", () => {
  const readiness = [
    { id: "a", ready: true, revision: "0123456789abcdef" },
    { id: "b", ready: true, revision: "fedcba9876543210" }
  ];
  assert.deepEqual(readinessForRevision(readiness, ["a", "b"], "0123456789abcdef"), {
    readyIds: ["a"], total: 2, complete: false
  });
  assert.deepEqual(readinessForRevision([{ ...readiness[0] }, { ...readiness[1], revision: "0123456789abcdef" }], ["a", "b"], "0123456789abcdef"), {
    readyIds: ["a", "b"], total: 2, complete: true
  });
});

test("expense entry revision uses locale-independent code-unit ordering", () => {
  const expenses = [
    { id: "ä", title: "둘째", payerId: "b", participantIds: ["z", "ä", "z"], amount: 7001, settled: false },
    { id: "z", title: "첫째", payerId: "a", participantIds: ["b", "a"], amount: 5000, settled: true }
  ];
  const localeCompare = String.prototype.localeCompare;
  String.prototype.localeCompare = () => { throw new Error("locale-dependent comparison used"); };
  try {
    assert.equal(expenseEntryRevision(expenses), "692086810e42c074");
    assert.equal(expenseEntryRevision([...expenses].reverse()), "692086810e42c074");
  } finally {
    String.prototype.localeCompare = localeCompare;
  }
});

test("개인별 최종 정산은 보내기와 받기 방향을 뒤집지 않는다", () => {
  const transfers = [
    { fromId: "a", toId: "b", amount: 42000 },
    { fromId: "c", toId: "a", amount: 12000 }
  ];
  assert.deepEqual(summarizePersonTransfers(transfers, "a"), {
    outgoing: [transfers[0]], incoming: [transfers[1]], outgoingTotal: 42000, incomingTotal: 12000
  });
});

test("개인 지출은 내가 결제한 돈과 남이 결제해 내가 부담할 돈으로 분리한다", () => {
  const paid = { id: "paid", payerId: "a", participantIds: ["a", "b"] };
  const owed = { id: "owed", payerId: "b", participantIds: ["a", "b"] };
  const unrelated = { id: "other", payerId: "b", participantIds: ["b"] };
  assert.deepEqual(groupPersonExpenses([paid, owed, unrelated], "a"), { paid: [paid], owed: [owed] });
});
