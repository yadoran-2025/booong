"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_EXPENSE_ROWS, normalizeExpenseRows, syncExpenseDraftMembers } from "../../lib/bungmo/expense.js";

const nameOf = member => member.displayName || member.nickname || member.id.slice(0, 8);

export default function ExpenseSheet({ members, onClose, onSave }) {
  const blankRow = () => ({ title: "", amount: "", payerId: members[0]?.id ?? "", participantIds: members.map(member => member.id) });
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, (_, key) => ({ key, ...blankRow() })));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(5);
  const dialog = useRef(null);
  const memberIds = members.map(member => member.id).join("\u0000");
  const count = rows.filter(row => row.title.trim() || row.amount.trim()).length;

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    element.querySelector("input")?.focus();
    return () => element.close();
  }, []);

  useEffect(() => { setRows(current => current.map(row => syncExpenseDraftMembers(row, members))); }, [memberIds]);

  function update(key, patch) {
    setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
    setError(null);
  }

  function addRow() {
    const key = nextKey.current++;
    setRows(current => [...current, { key, ...blankRow() }]);
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    try {
      const drafts = normalizeExpenseRows(rows, members.map(member => member.id));
      setError(null); setSaving(true);
      await onSave(drafts);
      onClose();
    } catch (caughtError) {
      setError(caughtError.code ? new Error("일괄 저장하지 못했어요. 입력 내용은 유지되었으니 다시 시도해 주세요.") : caughtError);
      if (caughtError.rowIndex != null) dialog.current?.querySelector(`[data-expense-row="${caughtError.rowIndex}"] input`)?.focus();
    } finally { setSaving(false); }
  }

  return <dialog className="expense-sheet" ref={dialog} aria-labelledby="expense-sheet-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <form noValidate onSubmit={submit} onKeyDown={event => { if (event.key === "Enter" && event.target.matches("input, select")) event.preventDefault(); }}>
      <header className="expense-sheet-header"><h2 id="expense-sheet-title">지출 한 번에 입력</h2><button className="btn btn--ghost" type="button" disabled={saving || rows.length >= MAX_EXPENSE_ROWS} onClick={addRow}>＋ 행 추가</button></header>
      <div className="expense-sheet-scroll">
        <table><thead><tr><th rowSpan={2} scope="col">행</th><th rowSpan={2} scope="col">지출 이름</th><th rowSpan={2} scope="col">금액 (원)</th><th rowSpan={2} scope="col">결제한 사람</th><th colSpan={Math.max(1, members.length)} scope="colgroup">함께한 사람</th><th rowSpan={2} scope="col"><span className="sr-only">행 삭제</span></th></tr><tr>{members.length ? members.map(member => <th className="expense-sheet-person" scope="col" key={member.id}>{nameOf(member)}</th>) : <th scope="col">참가자 없음</th>}</tr></thead>
          <tbody>{rows.map((row, index) => <tr data-expense-row={index} className={error?.rowIndex === index ? "expense-sheet-invalid" : ""} key={row.key}>
            <th scope="row">{index + 1}</th>
            <td><input className="expense-sheet-title" aria-label={`${index + 1}행 지출 이름`} value={row.title} maxLength={40} disabled={saving} onChange={event => update(row.key, { title: event.target.value })} /></td>
            <td><input className="expense-sheet-amount" type="number" min={1} step={1} inputMode="numeric" aria-label={`${index + 1}행 금액`} value={row.amount} disabled={saving} onChange={event => update(row.key, { amount: event.target.value })} /></td>
            <td>{members.length === 1 ? <span className="expense-sheet-payer-name">{nameOf(members[0])}</span> : members.length <= 3 ? <div className="expense-sheet-payers" role="group" aria-label={`${index + 1}행 결제한 사람`}>{members.map(member => <button className="btn btn--ghost" type="button" key={member.id} disabled={saving} aria-pressed={row.payerId === member.id} onClick={() => update(row.key, { payerId: member.id })}>{nameOf(member)}</button>)}</div> : <select aria-label={`${index + 1}행 결제한 사람`} value={row.payerId} disabled={saving} onChange={event => update(row.key, { payerId: event.target.value })}>{members.map(member => <option key={member.id} value={member.id}>{nameOf(member)}</option>)}</select>}</td>
            {members.length ? members.map(member => <td className="expense-sheet-check" key={member.id}><label><span className="sr-only">{index + 1}행 {nameOf(member)} 함께한 사람</span><input type="checkbox" disabled={saving} checked={row.participantIds.includes(member.id)} onChange={() => update(row.key, { participantIds: row.participantIds.includes(member.id) ? row.participantIds.filter(id => id !== member.id) : [...row.participantIds, member.id] })} /></label></td>) : <td />}
            <td><button className="btn btn--ghost expense-sheet-remove" type="button" disabled={saving} aria-label={`${index + 1}행 삭제`} onClick={() => { setRows(current => current.filter(item => item.key !== row.key)); setError(null); }}>×</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {error && <p className="expense-sheet-error" role="alert">{error.message || "저장하지 못했어요. 입력 내용을 유지했으니 다시 시도해 주세요."}</p>}
      <footer className="expense-sheet-footer"><span>빈 행은 저장하지 않아요.</span><div><button className="btn btn--ghost" type="button" onClick={onClose} disabled={saving}>취소</button><button className="btn btn--primary" type="submit" disabled={saving || !count}>{saving ? "저장 중…" : `${count}건 저장`}</button></div></footer>
    </form>
  </dialog>;
}
