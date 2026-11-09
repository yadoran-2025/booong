import assert from "node:assert/strict";
import test, { mock } from "node:test";

const calls = { add: [], update: [], remove: [], set: [], batch: [] };
let batchId = 0, batchCommits = 0, batchFailure;
const timestamp = { timestamp: true };
const firestore = {
  addDoc: async (...args) => { calls.add.push(args); return { id: "new-expense" }; },
  collection: (...args) => ({ collection: args }),
  deleteDoc: async (...args) => { calls.remove.push(args); },
  doc: (...args) => args.length === 1 ? { doc: args, id: `batch-${++batchId}` } : { doc: args },
  getDoc: async () => ({ exists: () => false }),
  onSnapshot: () => () => {},
  runTransaction: async () => {},
  serverTimestamp: () => timestamp,
  setDoc: async (...args) => { calls.set.push(args); },
  updateDoc: async (...args) => { calls.update.push(args); },
  writeBatch: () => {
    const staged = [];
    return { set: (...args) => staged.push(args), commit: async () => { batchCommits++; if (batchFailure) throw batchFailure; calls.batch.push(staged); } };
  }
};

mock.module("firebase/firestore", { exports: firestore });
mock.module("../firebase.js", { exports: { db: "database" } });
const { deleteExpense, saveExpense, saveExpenses, saveTransferSettlement, updateExpenseSettled } = await import("./repository.js");
const meetingId = "meeting-1";
const draft = { title: "식사", payerId: "payer", participantIds: ["payer", "guest"], amount: 12000 };

test("새 지출은 addDoc으로 완전한 기본 정산 상태를 저장한다", async () => {
  await saveExpense(meetingId, draft);
  assert.deepEqual(calls.add.pop(), [{ collection: ["database", "bungmoMeetings", meetingId, "expenses"] }, { ...draft, settled: false, createdAt: timestamp, updatedAt: timestamp }]);
});

test("기존 지출 편집은 해당 문서만 갱신하고 settled를 덮어쓰지 않는다", async () => {
  await saveExpense(meetingId, { id: "expense-1", ...draft, settled: true });
  assert.deepEqual(calls.update.pop(), [{ doc: [{ collection: ["database", "bungmoMeetings", meetingId, "expenses"] }, "expense-1"] }, { ...draft, updatedAt: timestamp }]);
});

test("정산 토글과 삭제는 좁은 문서 작업만 수행한다", async () => {
  await updateExpenseSettled(meetingId, "expense-1", true);
  await deleteExpense(meetingId, "expense-1");
  const reference = { doc: [{ collection: ["database", "bungmoMeetings", meetingId, "expenses"] }, "expense-1"] };
  assert.deepEqual(calls.update.pop(), [reference, { settled: true, updatedAt: timestamp }]);
  assert.deepEqual(calls.remove.pop(), [reference]);
});

test("transfer completion is stored separately from expenses", async () => {
  await saveTransferSettlement(meetingId, { fromId: "guest/a", toId: "payer", amount: 5000 }, true, "0123456789abcdef");
  assert.deepEqual(calls.set.pop(), [
    { doc: [{ collection: ["database", "bungmoMeetings", meetingId, "transferSettlements"] }, "guest%2Fa|payer"] },
    { fromId: "guest/a", toId: "payer", amount: 5000, revision: "0123456789abcdef", settled: true, updatedAt: timestamp }
  ]);
});

test("여러 지출은 서로 다른 새 문서로 한 번에 저장한다", async () => {
  const before = batchCommits;
  const ids = await saveExpenses(meetingId, [draft, { ...draft, title: "교통", amount: "3000" }], ["payer", "guest"]);
  assert.equal(new Set(ids).size, 2);
  assert.equal(batchCommits, before + 1);
  const writes = calls.batch.at(-1);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map(([reference]) => reference.id), ids);
  assert.deepEqual(writes.map(([, data]) => data), [
    { ...draft, settled: false, createdAt: timestamp, updatedAt: timestamp },
    { ...draft, title: "교통", amount: 3000, settled: false, createdAt: timestamp, updatedAt: timestamp }
  ]);
});

test("잘못된 행이나 비활성 참가자가 있으면 일괄 쓰기를 시작하지 않는다", async () => {
  const before = batchCommits;
  await assert.rejects(saveExpenses(meetingId, [draft, { ...draft, amount: 0 }], ["payer", "guest"]), /2행:/);
  await assert.rejects(saveExpenses(meetingId, [draft], ["payer"]), /모임 멤버/);
  await assert.rejects(saveExpenses(meetingId, [draft], []), /참가자/);
  assert.equal(batchCommits, before);
});

test("일괄 저장 실패를 호출자에게 전달하고 단건 저장으로 재시도하지 않는다", async () => {
  const before = calls.batch.length, added = calls.add.length;
  batchFailure = new Error("permission-denied");
  try { await assert.rejects(saveExpenses(meetingId, [draft, draft], ["payer", "guest"]), /permission-denied/); }
  finally { batchFailure = null; }
  assert.equal(calls.batch.length, before);
  assert.equal(calls.add.length, added);
});
