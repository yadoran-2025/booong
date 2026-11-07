import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const routes = ["index.html", "members/index.html", "schedule/index.html", "settlement/index.html", "trip/index.html", "archive/index.html", "access/index.html"];

test("정적 빌드가 모든 현재 경로를 만든다", async () => {
  await Promise.all(routes.map((route) => assert.doesNotReject(() => access(new URL(`../out/${route}`, import.meta.url)))));
});

test("붕모 빌드는 홈피의 하위 경로에서 제공된다", async () => {
  const config = await readFile(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(config, /basePath: "\/bungmo"/);
  assert.match(config, /trailingSlash: true/);
  const source = await readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8");
  assert.match(source, /href="\/admin.html"/);
  assert.match(source, /href=\{`\/bungmo/);
});

test("모바일 메뉴에도 지난 모임 링크를 포함한다", async () => {
  const shell = await readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8");
  assert.match(shell, /bungmo-mobile-nav[\s\S]*navigation[\s\S]*\.map/);
  assert.match(shell, /\["\/archive", "◷", "지난 모임"\]/);
});

test("모임 선택 게이트와 현재 모임 바가 모든 기능의 범위를 고정한다", async () => {
  const [gate, workspace, shell] = await Promise.all([
    readFile(new URL("../app/components/MeetingGate.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MeetingWorkspace.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8")
  ]);
  assert.match(gate, /어떤 <em>모임<\/em>으로/);
  assert.match(gate, /이 모임으로 들어가기/);
  assert.match(gate, /사이트 멤버 관리/);
  assert.match(workspace, /localStorage\.removeItem\(storageKey\)/);
  assert.match(shell, /현재 모임/);
  assert.match(shell, /모임 바꾸기/);
});

test("사이트 멤버 권한 페이지는 실제 사용자 데이터와 관리자 변경 함수를 사용한다", async () => {
  const [page, repository] = await Promise.all([
    readFile(new URL("../app/access/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/bungmo/repository.js", import.meta.url), "utf8")
  ]);
  assert.match(page, /subscribeUsers/);
  assert.match(page, /updateUserAccess/);
  assert.match(page, /canManageBungmo/);
  assert.match(repository, /export const updateUserAccess/);
});

test("모든 기능 페이지가 공통 모임 작업공간을 사용한다", async () => {
  const routes = ["../app/page.js", "../app/schedule/page.js", "../app/settlement/page.js", "../app/trip/page.js", "../app/members/page.js", "../app/archive/page.js"];
  const sources = await Promise.all(routes.map((route) => readFile(new URL(route, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.match(source, /MeetingWorkspace/);
    assert.doesNotMatch(source, /MeetingSelector/);
  }
});

test("멤버 관리는 모임 전환과 키보드 모달 상태를 안전하게 처리한다", async () => {
  const [shell, membersPage, roster, dialog] = await Promise.all([
    readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8"),
    readFile(new URL("../app/members/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MeetingMembers.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MemberDialog.js", import.meta.url), "utf8")
  ]);
  assert.match(shell, /\["\/members", "◉", "멤버 관리"\]/);
  assert.doesNotMatch(shell, /<MeetingMembers/);
  assert.match(membersPage, /<MeetingMembers key=\{meeting\.id\}/);
  assert.match(membersPage, /<MeetingWorkspace user=\{user\} profile=\{profile\}/);
  assert.match(roster, /registeredMembers/);
  assert.match(roster, /member-roster-group guests/);
  assert.match(dialog, /게스트 이름/);
  assert.match(dialog, /onMouseDown=\{saving \? undefined : onClose\}/);
  assert.match(dialog, /function close\(\) \{\s+if \(!saving\) onClose\(\);/);
  assert.match(dialog, /document\.addEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(dialog, /document\.removeEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(dialog, /!currentDialog\.contains\(document\.activeElement\) \|\| !focusable\.includes\(document\.activeElement\)/);
  assert.match(dialog, /previousFocus\?\.focus\?\.\(\)/);
});

test("정산은 참여자 블록에서 개인별 보내기와 받기 결과를 보여 준다", async () => {
  const settlement = await readFile(new URL("../app/settlement/page.js", import.meta.url), "utf8");
  assert.match(settlement, /className="person-picker"/);
  assert.match(settlement, /최종 보낼 금액/);
  assert.match(settlement, /최종 받을 금액/);
  assert.match(settlement, /내가 결제한 돈/);
  assert.match(settlement, /남이 결제해 내가 부담할 돈/);
  assert.match(settlement, /groupPersonExpenses/);
  assert.match(settlement, /summarizePersonTransfers/);
});

test("정산 입력 완료 상태는 함께한 인원 옆 요약 칸에 표시한다", async () => {
  const workflow = await readFile(new URL("../app/components/SettlementWorkflow.js", import.meta.url), "utf8");
  assert.match(workflow, /className="settlement-summary"[\s\S]*함께한 인원[\s\S]*className="settlement-readiness-summary"/);
  assert.doesNotMatch(workflow, /className="settlement-workflow"/);
});

test("정산 알림과 이미지 캡처 기능을 노출하지 않는다", async () => {
  const workflow = await readFile(new URL("../app/components/SettlementWorkflow.js", import.meta.url), "utf8");
  const shell = await readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /confirmAndExport|정산 이미지|전체 다운로드|canvas|svgToPng/);
  assert.doesNotMatch(shell, /AdminNotifications|정산 완료 알림 받기/);
});

test("정산 내역 모아보기는 사람별 송금 카드를 팝업으로 보여 준다", async () => {
  const settlement = await readFile(new URL("../app/settlement/page.js", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../app/components/SettlementCaptureDialog.js", import.meta.url), "utf8");
  assert.match(settlement, /정산 내역 모아보기/);
  assert.match(settlement, /<SettlementCaptureDialog[\s\S]*transfers=\{pendingTransfers\}[\s\S]*readiness=\{readiness\}/);
  assert.match(dialog, /role="dialog"[\s\S]*개인별 정산 내역/);
  assert.match(dialog, /보낼 금액[\s\S]*받을 금액[\s\S]*보낼 곳[\s\S]*받을 곳/);
  assert.match(dialog, /readinessForRevision[\s\S]*✓ 입력 완료[\s\S]*입력 확인 전/);
  assert.match(dialog, /체크 대상 아님/);
});

test("지출 내역은 화면 크기와 관계없이 항상 표시한다", async () => {
  const settlement = await readFile(new URL("../app/settlement/page.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/service.css", import.meta.url), "utf8");
  assert.match(settlement, /<section className="settlement-panel expense-list">[\s\S]*이번 모임에서 쓴 돈[\s\S]*expense-list-body/);
  assert.doesNotMatch(settlement, /expense-list-toggle|<details className="settlement-panel expense-list"/);
  assert.doesNotMatch(styles, /expense-list-toggle|\.expense-list:not\(\[open\]\)|\.expense-list\[open\]/);
});

test("일정 대상 전환과 저장 완료는 최신 세션만 화면을 바꾼다", async () => {
  const board = await readFile(new URL("../app/components/ScheduleBoard.js", import.meta.url), "utf8");
  assert.match(board, /function resetTarget\(nextTargetId\) \{[\s\S]*selectionEpoch\.current \+= 1;[\s\S]*saveEpoch\.current \+= 1;[\s\S]*setAvailability\(\{\}\);[\s\S]*setTargetError\(""\);[\s\S]*setTargetLoading\(Boolean\(nextTargetId\)\);[\s\S]*setTargetId\(nextTargetId\);/);
  assert.match(board, /const session = selectionEpoch\.current;[\s\S]*const request = \+\+saveEpoch\.current;/);
  assert.match(board, /selectionEpoch\.current === session && saveEpoch\.current === request/);
  assert.match(board, /const loadedEpoch = useRef\(0\)/);
  assert.match(board, /loadedEpoch\.current = 0/);
  assert.match(board, /loadedEpoch\.current = session/);
  assert.match(board, /loadedEpoch\.current !== selectionEpoch\.current/);
});
