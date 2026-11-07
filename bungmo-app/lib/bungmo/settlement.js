export function splitExpense(amount, participantIds) {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("금액은 1원 이상의 정수여야 합니다.");
  const ids = [...new Set(participantIds)].sort();
  if (!ids.length) throw new Error("함께한 사람을 한 명 이상 선택해 주세요.");
  const base = Math.floor(amount / ids.length);
  let remainder = amount % ids.length;
  return Object.fromEntries(ids.map((id) => [id, base + (remainder-- > 0 ? 1 : 0)]));
}

function hashRevision(value) {
  const source = JSON.stringify(value);
  let hash = 14695981039346656037n;
  for (let index = 0; index < source.length; index += 1) hash = BigInt.asUintN(64, (hash ^ BigInt(source.charCodeAt(index))) * 1099511628211n);
  return hash.toString(16).padStart(16, "0");
}

export function expenseRevision(expenses) {
  return hashRevision(expenses.filter((expense) => !expense.settled).map((expense) => [
    expense.id ?? "", expense.payerId, [...new Set(expense.participantIds)].sort(), expense.amount
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function expenseEntryRevision(expenses) {
  return hashRevision(expenses.map((expense) => [
    expense.id ?? "",
    expense.title,
    expense.payerId,
    [...new Set(expense.participantIds)].sort(),
    expense.amount,
    Boolean(expense.settled)
  ]).sort((a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  }));
}

export function readinessForRevision(readiness, memberIds, revision) {
  const required = [...new Set(memberIds)].sort();
  const current = new Set(readiness.filter((item) => item.ready && item.revision === revision).map((item) => item.id));
  const readyIds = required.filter((id) => current.has(id));
  return { readyIds, total: required.length, complete: required.length > 0 && readyIds.length === required.length };
}

export function calculateTransfers(expenses) {
  const debts = new Map();
  for (const expense of expenses.filter((item) => !item.settled)) {
    const shares = splitExpense(expense.amount, expense.participantIds);
    for (const [id, share] of Object.entries(shares)) {
      if (id === expense.payerId) continue;
      const creditors = debts.get(id) ?? new Map();
      creditors.set(expense.payerId, (creditors.get(expense.payerId) ?? 0) + share);
      debts.set(id, creditors);
    }
  }
  const people = [...new Set([...debts].flatMap(([fromId, creditors]) => [fromId, ...creditors.keys()]))].sort();
  const result = [];
  for (let left = 0; left < people.length; left += 1) {
    for (let right = left + 1; right < people.length; right += 1) {
      const a = people[left];
      const b = people[right];
      const difference = (debts.get(a)?.get(b) ?? 0) - (debts.get(b)?.get(a) ?? 0);
      const amount = Math.floor(Math.abs(difference) / 10) * 10;
      if (difference > 0 && amount) result.push({ fromId: a, toId: b, amount });
      if (difference < 0 && amount) result.push({ fromId: b, toId: a, amount });
    }
  }
  return result;
}

export function summarizePersonTransfers(transfers, personId) {
  const outgoing = transfers.filter((transfer) => transfer.fromId === personId);
  const incoming = transfers.filter((transfer) => transfer.toId === personId);
  return {
    outgoing,
    incoming,
    outgoingTotal: outgoing.reduce((sum, transfer) => sum + transfer.amount, 0),
    incomingTotal: incoming.reduce((sum, transfer) => sum + transfer.amount, 0)
  };
}

export function unsettledTransfers(transfers, settlements, revision) {
  return transfers.filter((transfer) => !settlements.some((settlement) => settlement.settled
    && settlement.revision === revision
    && settlement.fromId === transfer.fromId
    && settlement.toId === transfer.toId
    && settlement.amount === transfer.amount));
}

export function groupPersonExpenses(expenses, personId) {
  return {
    paid: expenses.filter((expense) => expense.payerId === personId),
    owed: expenses.filter((expense) => expense.payerId !== personId && expense.participantIds.includes(personId))
  };
}
