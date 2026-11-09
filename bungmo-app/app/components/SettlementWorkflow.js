"use client";

import { useState } from "react";
import { saveExpenseReadiness } from "../../lib/bungmo/repository.js";
import { readinessForRevision } from "../../lib/bungmo/settlement.js";

export default function SettlementWorkflow({ meeting, profile, activeMembers, revision, readiness, totalLabel, pendingExpenseCount }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requiredIds = activeMembers.map((member) => member.id);
  const status = readinessForRevision(readiness, requiredIds, revision);


  async function toggleReady(memberId) {
    setSaving(true);
    setError("");
    try {
      await saveExpenseReadiness(meeting.id, memberId, !status.readyIds.includes(memberId), revision);
    } catch {
      setError("입력 완료 상태를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="settlement-summary" aria-label="정산 요약">
      <div><span>전체 지출</span><strong>{totalLabel}</strong></div>
      <div><span>정산 전</span><strong>{pendingExpenseCount}건</strong></div>
      <div><span>함께한 인원</span><strong>{activeMembers.length}명</strong></div>
      <div className="settlement-readiness-summary">
        <span>지출 입력 완료</span>
        <strong className="readiness-progress" aria-live="polite">{status.readyIds.length}/{status.total}</strong>
        <div className="settlement-workflow-actions">
          {activeMembers.map(member => <button className={`btn ${status.readyIds.includes(member.id) ? "btn--primary" : "btn--ghost"}`} type="button" key={member.id} aria-pressed={status.readyIds.includes(member.id)} disabled={saving} onClick={() => toggleReady(member.id)}>{member.displayName} · {status.readyIds.includes(member.id) ? "완료 취소" : "입력 완료"}</button>)}
        </div>
      </div>
    </section>
    {error && <section className="settlement-workflow-details">
      {error && <p className="settlement-workflow-error" role="alert">{error}</p>}
    </section>}
  </>;
}
