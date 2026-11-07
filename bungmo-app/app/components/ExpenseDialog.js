"use client";

import { useEffect, useState } from "react";
import { normalizeExpenseDraft, syncExpenseDraftMembers } from "../../lib/bungmo/expense.js";

const shortId = (id) => id.slice(0, 8);
const nameOf = (member) => member.displayName || member.nickname || shortId(member.id);

export default function ExpenseDialog({ expense, members, onClose, onSave }) {
  const [form, setForm] = useState({
    title: expense?.title ?? "",
    amount: expense?.amount?.toString() ?? "",
    payerId: expense?.payerId ?? members[0]?.id ?? "",
    participantIds: expense?.participantIds ?? members.map((member) => member.id)
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const memberIds = members.map((member) => member.id).join("\u0000");

  useEffect(() => {
    setForm((current) => syncExpenseDraftMembers(current, members));
  }, [memberIds]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleParticipant = (id) => update("participantIds", form.participantIds.includes(id)
    ? form.participantIds.filter((item) => item !== id)
    : [...form.participantIds, id]);

  async function submit(event) {
    event.preventDefault();
    try {
      const draft = normalizeExpenseDraft(form, members.map((member) => member.id));
      setSaving(true);
      setError("");
      await onSave({ id: expense?.id, ...draft });
      onClose();
    } catch (caughtError) {
      setError(caughtError.message || "지출을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="expense-dialog-backdrop" onMouseDown={onClose}>
    <section className="expense-dialog" role="dialog" aria-modal="true" aria-labelledby="expense-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <div><p>공동 지출</p><h2 id="expense-dialog-title">{expense ? "지출 수정" : "지출 추가"}</h2></div>
      <form onSubmit={submit}>
        <label>지출 이름<input value={form.title} maxLength={40} onChange={(event) => update("title", event.target.value)} autoFocus /></label>
        <label>금액 (원)<input type="number" min="1" step="1" inputMode="numeric" value={form.amount} onChange={(event) => update("amount", event.target.value)} /></label>
        <label>결제한 사람<select value={form.payerId} onChange={(event) => update("payerId", event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{nameOf(member)}</option>)}</select></label>
        <fieldset><legend>함께한 사람</legend><div className="expense-members">{members.map((member) => <label key={member.id}><input type="checkbox" checked={form.participantIds.includes(member.id)} onChange={() => toggleParticipant(member.id)} />{nameOf(member)}</label>)}</div></fieldset>
        {error && <p className="expense-form-error" role="alert">{error}</p>}
        <div className="expense-dialog-actions"><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button></div>
      </form>
    </section>
  </div>;
}
