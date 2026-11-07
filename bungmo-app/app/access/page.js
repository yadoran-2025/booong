"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "../components/AuthGate.js";
import { canManageBungmo } from "../../lib/bungmo/access.js";
import { subscribeUsers, updateUserAccess } from "../../lib/bungmo/repository.js";

const accessOn = (member) => member.active !== false;

function AccessDenied() {
  return <main className="access-denied"><section><span>BOOONG ACCESS</span><h1>관리자 전용 페이지예요.</h1><p>운영자 프로필 권한은 관리자 계정에서만 바꿀 수 있어요.</p><a href="/bungmo/">모임 선택으로 돌아가기</a></section></main>;
}

function AccessAdmin({ user }) {
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [savingId, setSavingId] = useState("");

  useEffect(() => subscribeUsers((items) => {
    setMembers(items.toSorted((a, b) => Number(accessOn(b)) - Number(accessOn(a)) || (a.nickname ?? "").localeCompare(b.nickname ?? "", "ko")));
    setLoaded(true);
    setError("");
  }, () => {
    setLoaded(true);
    setError("멤버 목록을 불러오지 못했어요.");
  }), [retry]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    return keyword ? members.filter((member) => `${member.nickname ?? ""} ${member.email ?? ""}`.toLocaleLowerCase("ko").includes(keyword)) : members;
  }, [members, query]);
  const activeCount = members.filter(accessOn).length;

  async function toggle(member) {
    if (member.id === user.uid) return;
    try {
      setSavingId(member.id);
      setError("");
      await updateUserAccess(member.id, !accessOn(member));
    } catch {
      setError("권한을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSavingId("");
    }
  }

  return <main className="access-admin">
    <header className="access-header"><a className="gate-brand" href="/bungmo/" aria-label="BOOONG 모임 선택"><span>붕</span><strong>BOOONG</strong></a><a href="/bungmo/">← 모임 선택으로</a></header>
    <section className="access-intro"><div><span>MEMBER ACCESS LEDGER</span><h1>누가 붕모에<br /><em>들어올 수 있나요?</em></h1><p>운영자 명단에 등록되어 Google로 로그인한 계정만 표시해요. 권한을 끄면 기존 데이터는 남고, 해당 계정의 붕모 이용을 제한해요.</p></div><dl><div><dt>전체 멤버</dt><dd>{members.length}</dd></div><div><dt>이용 가능</dt><dd>{activeCount}</dd></div><div><dt>권한 꺼짐</dt><dd>{members.length - activeCount}</dd></div></dl></section>
    <section className="access-ledger" aria-labelledby="access-list-title">
      <header><div><span>ACCESS / ALL MEMBERS</span><h2 id="access-list-title">운영자 프로필 권한</h2></div><label><span className="sr-only">멤버 검색</span><input type="search" placeholder="이름 또는 이메일 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label></header>
      {error && <div className="subscription-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
      {!loaded ? <p className="access-state" role="status">멤버 목록을 불러오는 중이에요.</p> : visible.length ? <ol className="access-list">{visible.map((member, index) => {
        const active = accessOn(member);
        const self = member.id === user.uid;
        return <li className={active ? "active" : "inactive"} key={member.id}><span className="access-index">{String(index + 1).padStart(2, "0")}</span><i>{(member.nickname || member.email || "?").slice(0, 1)}</i><div><strong>{member.nickname || "이름 없음"}{self && <small>관리자 · 나</small>}</strong><span>{member.email || "이메일 정보 없음"}</span></div><em>{active ? "이용 가능" : "권한 꺼짐"}</em><button type="button" disabled={self || savingId === member.id} aria-label={`${member.nickname || member.email} 사이트 권한 ${active ? "끄기" : "켜기"}`} onClick={() => toggle(member)}>{savingId === member.id ? "변경 중" : self ? "현재 계정" : active ? "이용 제한" : "이용 허용"}</button></li>;
      })}</ol> : <p className="access-state">검색 결과가 없어요.</p>}
    </section>
  </main>;
}

export default function AccessPage() {
  return <AuthGate>{({ user }) => canManageBungmo(user) ? <AccessAdmin user={user} /> : <AccessDenied />}</AuthGate>;
}
