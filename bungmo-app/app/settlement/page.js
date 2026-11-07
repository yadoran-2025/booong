"use client";

import { useEffect, useRef, useState } from "react";
import AuthGate from "../components/AuthGate.js";
import ExpenseDialog from "../components/ExpenseDialog.js";
import MeetingWorkspace from "../components/MeetingWorkspace.js";
import SettlementCaptureDialog from "../components/SettlementCaptureDialog.js";
import SettlementWorkflow from "../components/SettlementWorkflow.js";
import { resolveExpenseMembers } from "../../lib/bungmo/expense.js";
import { resolveMeetingMembers } from "../../lib/bungmo/member.js";
import { deleteExpense, saveExpense, saveTransferSettlement, subscribeExpenseReadiness, subscribeExpenses, subscribeMeetingMembers, subscribeTransferSettlements, subscribeUsers } from "../../lib/bungmo/repository.js";
import { calculateTransfers, expenseEntryRevision, expenseRevision, groupPersonExpenses, splitExpense, summarizePersonTransfers, unsettledTransfers } from "../../lib/bungmo/settlement.js";

const won = (amount) => `${amount.toLocaleString("ko-KR")}원`;
const shortId = (id) => id.slice(0, 8);

function Settlement({ meeting, profile }) {
  const [expenses, setExpenses] = useState([]);
  const [readiness, setReadiness] = useState([]);
  const [transferSettlements, setTransferSettlements] = useState([]);
  const [users, setUsers] = useState([]);
  const [memberRecords, setMemberRecords] = useState([]);
  const [userError, setUserError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [readinessError, setReadinessError] = useState("");
  const [loading, setLoading] = useState(false);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [userRetry, setUserRetry] = useState(0);
  const [memberRetry, setMemberRetry] = useState(0);
  const [expenseRetry, setExpenseRetry] = useState(0);
  const [readinessRetry, setReadinessRetry] = useState(0);
  const [editing, setEditing] = useState(null);
  const [showCapture, setShowCapture] = useState(false);
  const [selectedId, setSelectedId] = useState(profile.id);
  const expenseGeneration = useRef(0);

  useEffect(() => {
    const onError = () => setUserError("회원 이름을 불러오지 못했어요.");
    const stopUsers = subscribeUsers((items) => { setUsers(items); setUserError(""); }, onError);
    return stopUsers;
  }, [userRetry]);

  useEffect(() => {
    let active = true;
    const generation = expenseGeneration.current;
    setMembersLoading(true);
    setMemberError("");
    const stop = subscribeMeetingMembers(meeting.id, (items) => {
      if (!active || generation !== expenseGeneration.current) return;
      setMemberRecords(items); setMemberError(""); setMembersLoading(false);
    }, () => {
      if (!active || generation !== expenseGeneration.current) return;
      setMemberRecords([]); setMemberError("모임 멤버를 불러오지 못했어요."); setMembersLoading(false);
    });
    return () => { active = false; stop(); };
  }, [meeting.id, memberRetry]);

  useEffect(() => {
    let active = true;
    const generation = expenseGeneration.current;
    setLoading(true);
    const stop = subscribeExpenses(meeting.id, (items) => {
      if (!active || generation !== expenseGeneration.current) return;
      setExpenses(items); setExpenseError(""); setLoading(false);
    }, () => {
      if (!active || generation !== expenseGeneration.current) return;
      setExpenseError("정산 정보를 불러오지 못했어요."); setLoading(false);
    });
    return () => { active = false; stop(); };
  }, [meeting.id, expenseRetry]);

  useEffect(() => {
    setTransfersLoading(true);
    const stop = subscribeTransferSettlements(meeting.id, (items) => {
      setTransferSettlements(items); setExpenseError(""); setTransfersLoading(false);
    }, () => {
      setTransferSettlements([]); setExpenseError("송금 완료 상태를 불러오지 못했어요."); setTransfersLoading(false);
    });
    return stop;
  }, [meeting.id, expenseRetry]);

  useEffect(() => subscribeExpenseReadiness(meeting.id, (items) => { setReadiness(items); setReadinessError(""); }, () => setReadinessError("입력 완료 상태를 불러오지 못했어요.")), [meeting.id, readinessRetry]);

  const activeMembers = resolveMeetingMembers(memberRecords, users);
  const allMembers = resolveMeetingMembers(memberRecords, users, { activeOnly: false });
  const dialogMembers = resolveExpenseMembers(activeMembers, allMembers, editing?.id ? editing : null, users);
  const names = new Map([...users.map((user) => [user.id, user.nickname]), ...allMembers.map((member) => [member.id, member.displayName])]);
  const nameOf = (id) => names.get(id) || shortId(id);
  const transfers = calculateTransfers(expenses);
  const revision = expenseRevision(expenses);
  const pendingTransfers = unsettledTransfers(transfers, transferSettlements, revision);
  const activeTotal = expenses.filter((expense) => !expense.settled).reduce((sum, expense) => sum + expense.amount, 0);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const personIds = new Set(activeMembers.map((member) => member.id));
  for (const expense of expenses) {
    personIds.add(expense.payerId);
    expense.participantIds.forEach((id) => personIds.add(id));
  }
  const settlementPeople = [...personIds].map((id) => allMembers.find((member) => member.id === id) ?? { id, displayName: nameOf(id), kind: "legacy" }).sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
  const selectedPerson = settlementPeople.find((member) => member.id === selectedId) ?? settlementPeople.find((member) => member.id === profile.id) ?? settlementPeople[0];
  const personalExpenses = groupPersonExpenses(expenses, selectedPerson?.id);
  const selectedExpenseCount = personalExpenses.paid.length + personalExpenses.owed.length;
  const personal = summarizePersonTransfers(pendingTransfers, selectedPerson?.id);
  const personalAll = summarizePersonTransfers(transfers, selectedPerson?.id);
  const transferStatus = (transfer) => transferSettlements.find((item) => item.fromId === transfer.fromId
    && item.toId === transfer.toId && item.amount === transfer.amount && item.revision === revision);

  async function save(expense) {
    if (membersLoading || memberError || (!expense.id && !activeMembers.length)) throw new Error("모임 멤버 정보를 확인한 뒤 저장해 주세요.");
    await saveExpense(meeting.id, expense);
  }
  async function toggleTransfer(transfer) {
    try { await saveTransferSettlement(meeting.id, transfer, !transferStatus(transfer)?.settled, revision); } catch { setExpenseError("송금 완료 상태를 저장하지 못했어요."); }
  }
  async function remove(expense) {
    if (!window.confirm("이 지출을 삭제할까요? 삭제하면 송금 금액도 바로 바뀝니다.")) return;
    try { await deleteExpense(meeting.id, expense.id); } catch { setExpenseError("지출을 삭제하지 못했어요."); }
  }
  return <main className="service-page">
    <div className="service-heading"><div><span>SETTLEMENT</span><h1>누가, 누구에게, 얼마를</h1><p>{meeting.title}에서 쓴 돈을 나누고 최종 송금액을 확인해요.</p></div><div className="heading-controls"><button className="service-primary capture-settlements" type="button" disabled={!settlementPeople.length} onClick={() => setShowCapture(true)}>정산 내역 모아보기</button><button className="service-primary" type="button" disabled={membersLoading || Boolean(memberError) || activeMembers.length === 0} onClick={() => setEditing({})}>+ 지출 추가</button></div></div>
    {userError && <div className="subscription-error" role="alert"><span>{userError}</span><button type="button" onClick={() => setUserRetry((value) => value + 1)}>다시 시도</button></div>}
    {memberError && <div className="subscription-error" role="alert"><span>{memberError}</span><button type="button" onClick={() => setMemberRetry((value) => value + 1)}>다시 시도</button></div>}
    {expenseError && <div className="subscription-error" role="alert"><span>{expenseError}</span><button type="button" onClick={() => setExpenseRetry((value) => value + 1)}>다시 시도</button></div>}
    {readinessError && <div className="subscription-error" role="alert"><span>{readinessError}</span><button type="button" onClick={() => setReadinessRetry((value) => value + 1)}>다시 시도</button></div>}
    {loading || transfersLoading ? <section className="service-empty" role="status"><h2>정산 정보를 불러오는 중이에요.</h2><p>잠시만 기다려 주세요.</p></section> : <>
      <SettlementWorkflow
        meeting={meeting}
        profile={profile}
        activeMembers={activeMembers}
        revision={expenseEntryRevision(expenses)}
        readiness={readiness}
        totalLabel={won(total)}
        pendingExpenseCount={expenses.filter((expense) => !expense.settled).length}
      />
      <section className="settlement-layout">
        <section className="settlement-panel expense-list"><div className="card-title"><div><span>지출 내역</span><h2>이번 모임에서 쓴 돈</h2></div></div><div className="expense-list-body">{expenses.length ? expenses.map((expense) => <article className={`expense ${expense.settled ? "done" : ""}`} key={expense.id}><i className="avatar">{nameOf(expense.payerId).slice(0, 1)}</i><button type="button" className="expense-row" onClick={() => setEditing(expense)}><strong>{expense.title}</strong><span>{nameOf(expense.payerId)} 결제 · {expense.participantIds.length}명 함께</span></button><b>{won(expense.amount)}</b><div className="expense-actions"><button type="button" className="expense-delete" onClick={() => remove(expense)} aria-label={`${expense.title} 삭제`}>삭제</button></div></article>) : <p className="settlement-empty">아직 등록된 지출이 없어요.</p>}</div></section>
        <aside className="transfer-card person-settlement"><span>참여자별 정산</span><h2>내 이름을 눌러 확인하세요</h2><p>정산 전 지출 {won(activeTotal)}의 상계 결과예요.</p>
          {settlementPeople.length ? <><div className="person-picker" role="list" aria-label="정산 참여자">{settlementPeople.map((person) => <button type="button" className={person.id === selectedPerson?.id ? "active" : ""} aria-pressed={person.id === selectedPerson?.id} onClick={() => setSelectedId(person.id)} key={person.id}><i>{person.displayName.slice(0, 1)}</i><strong>{person.displayName}</strong><small>{person.kind === "guest" ? "게스트" : person.id === profile.id ? "나" : "멤버"}</small></button>)}</div>
            {selectedPerson && <section className="person-detail" aria-live="polite"><header><div><span>{selectedPerson.displayName}의 정산 내역</span><strong>{selectedExpenseCount}건</strong></div><em className={selectedPerson.kind === "guest" ? "guest" : ""}>{selectedPerson.kind === "guest" ? "GUEST" : "MEMBER"}</em></header>
              <div className="person-final-grid"><div className="person-final"><span>최종 보낼 금액</span><strong>{won(personal.outgoingTotal)}</strong>{personalAll.outgoing.length ? <ul>{personalAll.outgoing.map((transfer) => { const settled = transferStatus(transfer)?.settled; return <li className={settled ? "settled" : ""} key={`${transfer.fromId}-${transfer.toId}`}><span>{nameOf(transfer.toId)}에게 보내기</span><b>{won(transfer.amount)}</b><button type="button" onClick={() => toggleTransfer(transfer)}>{settled ? "완료 취소" : "송금 완료"}</button></li>; })}</ul> : <p>보낼 돈이 없어요.</p>}</div>
                <div className="person-final incoming"><span>최종 받을 금액</span><strong>{won(personal.incomingTotal)}</strong>{personalAll.incoming.length ? <ul>{personalAll.incoming.map((transfer) => { const settled = transferStatus(transfer)?.settled; return <li className={settled ? "settled" : ""} key={`${transfer.fromId}-${transfer.toId}`}><span>{nameOf(transfer.fromId)}에게 받기</span><b>{won(transfer.amount)}</b><button type="button" onClick={() => toggleTransfer(transfer)}>{settled ? "완료 취소" : "수령 완료"}</button></li>; })}</ul> : <p>받을 돈이 없어요.</p>}</div></div>
              <div className="person-expense-group paid"><header><div><span>내가 결제한 돈</span><strong>{personalExpenses.paid.length}건</strong></div><small>내 카드·계좌에서 먼저 낸 전체 금액</small></header><div className="person-expenses">{personalExpenses.paid.length ? personalExpenses.paid.map((expense) => { const share = expense.participantIds.includes(selectedPerson.id) ? splitExpense(expense.amount, expense.participantIds)[selectedPerson.id] : 0; return <div className={expense.settled ? "settled" : ""} key={expense.id}><p><strong>{expense.title}</strong><span>{expense.settled ? "정산 완료" : `${expense.participantIds.length}명 함께`}</span></p><b><span>결제액 {won(expense.amount)}</span>{share > 0 && <small>내 몫 {won(share)}</small>}</b></div>; }) : <p className="settlement-empty">내가 결제한 지출이 없어요.</p>}</div></div>
              <div className="person-expense-group owed"><header><div><span>남이 결제해 내가 부담할 돈</span><strong>{personalExpenses.owed.length}건</strong></div><small>참여자로 포함된 지출의 내 몫</small></header><div className="person-expenses">{personalExpenses.owed.length ? personalExpenses.owed.map((expense) => { const share = splitExpense(expense.amount, expense.participantIds)[selectedPerson.id]; return <div className={expense.settled ? "settled" : ""} key={expense.id}><p><strong>{expense.title}</strong><span>{expense.settled ? "정산 완료" : `${nameOf(expense.payerId)} 결제`}</span></p><b><span>내 부담 {won(share)}</span><small>전체 {won(expense.amount)}</small></b></div>; }) : <p className="settlement-empty">남이 결제해 부담할 지출이 없어요.</p>}</div></div>
            </section>}
          </> : <p className="settlement-empty">지출을 추가하면 개인별 송금액을 계산해요.</p>}
        </aside>
      </section>
    </>}
    {editing && <ExpenseDialog expense={editing.id ? editing : null} members={dialogMembers} onClose={() => setEditing(null)} onSave={save} />}
    {showCapture && <SettlementCaptureDialog meeting={meeting} people={settlementPeople} transfers={pendingTransfers} readiness={readiness} revision={expenseEntryRevision(expenses)} nameOf={nameOf} onClose={() => setShowCapture(false)} />}
  </main>;
}

export default function SettlementPage() { return <AuthGate>{({ user, profile }) => <MeetingWorkspace user={user} profile={profile}>{(meeting) => <Settlement meeting={meeting} profile={profile} />}</MeetingWorkspace>}</AuthGate>; }
