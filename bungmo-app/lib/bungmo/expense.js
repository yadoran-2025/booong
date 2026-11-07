const validMemberId = (id) => typeof id === "string" && id.trim().length > 0 && id.length <= 128;

export function resolveExpenseMembers(activeMembers, allMembers, expense, users = []) {
  const members = new Map(activeMembers.map((member) => [member.id, member]));
  if (!expense) return [...members.values()];
  const allById = new Map(allMembers.map((member) => [member.id, member]));
  const userNames = new Map(users.map((user) => [user.id, user.nickname]));
  const referencedIds = [...new Set([expense.payerId, ...(expense.participantIds ?? [])].filter(Boolean))];
  for (const id of referencedIds) {
    if (!members.has(id)) members.set(id, allById.get(id) ?? { id, displayName: userNames.get(id) || id.slice(0, 8) });
  }
  return [...members.values()];
}

export function normalizeExpenseDraft(form, allowedMemberIds) {
  const title = typeof form.title === "string" ? form.title.trim().slice(0, 40) : "";
  const amount = Number(form.amount);
  const participantIds = Array.isArray(form.participantIds) ? [...new Set(form.participantIds)] : [];
  if (!title) throw new Error("지출 이름을 입력해 주세요.");
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("금액은 1원 이상의 숫자로 입력해 주세요.");
  if (!validMemberId(form.payerId)) throw new Error("결제한 사람을 올바르게 선택해 주세요.");
  if (!participantIds.length) throw new Error("함께한 사람을 한 명 이상 선택해 주세요.");
  if (participantIds.some((id) => !validMemberId(id))) throw new Error("모임 멤버 정보가 올바르지 않아요.");
  if (allowedMemberIds && (!allowedMemberIds.includes(form.payerId) || participantIds.some((id) => !allowedMemberIds.includes(id)))) {
    throw new Error("이 지출에서 선택할 수 있는 모임 멤버만 추가해 주세요.");
  }
  return { title, amount, payerId: form.payerId, participantIds };
}

export function syncExpenseDraftMembers(form, members) {
  const allowed = new Set(members.map((member) => member.id));
  const payerId = allowed.has(form.payerId) ? form.payerId : members[0]?.id ?? "";
  const participantIds = (Array.isArray(form.participantIds) ? form.participantIds : []).filter((id) => allowed.has(id));
  if (payerId === form.payerId && participantIds.length === form.participantIds?.length) return form;
  return { ...form, payerId, participantIds };
}
