import assert from "node:assert/strict";
import test, { mock } from "node:test";

const calls = { add: [], update: [], remove: [], set: [] };
const timestamp = { timestamp: true };
const firestore = {
  addDoc: async (...args) => { calls.add.push(args); return { id: "new-expense" }; },
  collection: (...args) => ({ collection: args }),
  deleteDoc: async (...args) => { calls.remove.push(args); },
  doc: (...args) => ({ doc: args }),
  getDoc: async () => ({ exists: () => false }),
  onSnapshot: () => () => {},
  serverTimestamp: () => timestamp,
  setDoc: async (...args) => { calls.set.push(args); },
  updateDoc: async (...args) => { calls.update.push(args); },
  writeBatch: () => ({ set: () => {}, commit: async () => {} })
};

mock.module("firebase/firestore", { exports: firestore });
mock.module("../firebase.js", { exports: { db: "database" } });
const { deleteExpense, saveExpense, saveTransferSettlement, updateExpenseSettled } = await import("./repository.js");
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
