"use client";

import { useEffect, useRef } from "react";
import { readinessForRevision, summarizePersonTransfers } from "../../lib/bungmo/settlement.js";

const won = (amount) => `${amount.toLocaleString("ko-KR")}원`;

export default function SettlementCaptureDialog({ meeting, people, transfers, readiness, revision, nameOf, onClose }) {
  const dialog = useRef(null);
  const requiredIds = people.filter((person) => person.kind !== "legacy" && person.active !== false).map((person) => person.id);
  const readyIds = new Set(readinessForRevision(readiness, requiredIds, revision).readyIds);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.querySelector("button")?.focus();
    return () => previousFocus?.focus?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const currentDialog = dialog.current;
      const focusable = currentDialog ? [...currentDialog.querySelectorAll("button, [tabindex]:not([tabindex='-1'])")] : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return <div className="expense-dialog-backdrop settlement-capture-backdrop" onMouseDown={onClose}>
    <section className="settlement-capture-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="settlement-capture-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="settlement-capture-header"><div><span>SETTLEMENT SNAPSHOT</span><h2 id="settlement-capture-title">개인별 정산 내역</h2><p>{meeting.round}회 · {meeting.title}의 현재 송금액을 모았어요. 이 화면을 캡처해 공유하세요.</p></div><button type="button" onClick={onClose} aria-label="정산 내역 모아보기 닫기">×</button></header>
      <div className="settlement-capture-cards">{people.map((person) => {
        const personal = summarizePersonTransfers(transfers, person.id);
        const required = requiredIds.includes(person.id);
        const ready = readyIds.has(person.id);
        return <article className="settlement-capture-card" key={person.id}>
          <header><i>{person.displayName.slice(0, 1)}</i><div><strong>{person.displayName}</strong><span>{person.kind === "guest" ? "GUEST" : "MEMBER"}</span></div><span className={`settlement-capture-readiness ${!required ? "exempt" : ready ? "ready" : ""}`}>{!required ? "체크 대상 아님" : ready ? "✓ 입력 완료" : "입력 확인 전"}</span></header>
          <div className="settlement-capture-totals"><div><span>보낼 금액</span><strong>{won(personal.outgoingTotal)}</strong></div><div><span>받을 금액</span><strong>{won(personal.incomingTotal)}</strong></div></div>
          <div className="settlement-capture-transfers"><div><span>보낼 곳</span><ul>{personal.outgoing.length ? personal.outgoing.map((transfer) => <li key={transfer.toId}><span>{nameOf(transfer.toId)}</span><b>{won(transfer.amount)}</b></li>) : <li className="empty">없음</li>}</ul></div><div><span>받을 곳</span><ul>{personal.incoming.length ? personal.incoming.map((transfer) => <li key={transfer.fromId}><span>{nameOf(transfer.fromId)}</span><b>{won(transfer.amount)}</b></li>) : <li className="empty">없음</li>}</ul></div></div>
        </article>;
      })}</div>
    </section>
  </div>;
}
