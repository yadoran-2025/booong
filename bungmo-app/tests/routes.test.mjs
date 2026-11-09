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
  assert.match(source, /import Link from "next\/link"/);
  assert.match(source, /<Link className=\{`bungmo-nav-link/);
  assert.doesNotMatch(source, /href=\{`\/bungmo/);
});

test("공통 메뉴에 지난 모임 링크와 현재 경로를 포함한다", async () => {
  const shell = await readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8");
  assert.match(shell, /bungmo-navigation[\s\S]*navigation\.map/);
  assert.match(shell, /aria-current=\{pathname === href \? "page"/);
  assert.doesNotMatch(shell, /bungmo-mobile-nav|bungmo-sidebar/);
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
  assert.match(gate, /href="\/admin.html"/);
  assert.match(workspace, /localStorage\.removeItem\(storageKey\)/);
  assert.match(shell, /meeting\.round.*meeting\.title/);
  assert.match(shell, /모임 선택/);
});

test("기존 권한 페이지는 BOOONG 운영자 공간으로 연결한다", async () => {
  const [page, repository] = await Promise.all([
    readFile(new URL("../app/access/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/bungmo/repository.js", import.meta.url), "utf8")
  ]);
  assert.match(page, /window.location.replace\("\/admin.html"\)/);
  assert.doesNotMatch(page, /updateUserAccess|toggle\(/);
  assert.doesNotMatch(repository, /updateUserAccess/);
});

test("운영자는 별도 닉네임 입력 없이 계정 정보로 진입한다", async () => {
  const [gate, shell, workspace] = await Promise.all([
    readFile(new URL("../app/components/AuthGate.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MeetingWorkspace.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(gate + shell, /NicknameDialog|닉네임|updateProfileNickname/);
  assert.match(gate, /await ensureProfile\(identity\)/);
  assert.match(shell, /user.displayName \|\| user.email/);
  assert.match(workspace, /<AppShell user=\{user\}/);
  await assert.rejects(access(new URL("../app/components/NicknameDialog.js", import.meta.url)), { code: "ENOENT" });
});

test("모든 기능 페이지가 공통 모임 작업공간을 사용한다", async () => {
  const routes = ["../app/page.js", "../app/schedule/page.js", "../app/settlement/page.js", "../app/trip/page.js", "../app/members/page.js", "../app/archive/page.js"];
  const sources = await Promise.all(routes.map((route) => readFile(new URL(route, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.match(source, /useBungmoWorkspace\(\)/);
    assert.doesNotMatch(source, /<AuthGate|<MeetingWorkspace|MeetingSelector/);
  }
  const layout = await readFile(new URL("../app/layout.js", import.meta.url), "utf8");
  const shared = await readFile(new URL("../app/components/BungmoWorkspace.js", import.meta.url), "utf8");
  assert.match(layout, /<BungmoWorkspace>\{children\}<\/BungmoWorkspace>/);
  assert.match(shared, /<AuthGate>[\s\S]*<MeetingWorkspace/);
  assert.match(shared, /WorkspaceContext.Provider/);
});

test("정적 화면 전환용 응답을 내보내고 로컬 서버도 올바른 MIME으로 제공한다", async () => {
  await Promise.all(routes.map(route => assert.doesNotReject(() => access(new URL(`../out/${route.replace(/\.html$/, ".txt")}`, import.meta.url)))));
  const server = await readFile(new URL("../../scripts/serve.mjs", import.meta.url), "utf8");
  assert.match(server, /pathname.startsWith\('\/bungmo\/'\).*extname\(file\) === '\.txt'[\s\S]*'text\/plain;charset=utf-8'/);
});

test("참가자 편집은 페이지 안에서 BOOONG 프로필을 선택한다", async () => {
  const [shell, membersPage, roster, dialog] = await Promise.all([
    readFile(new URL("../app/components/AppShell.js", import.meta.url), "utf8"),
    readFile(new URL("../app/members/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MeetingMembers.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MemberPicker.js", import.meta.url), "utf8")
  ]);
  assert.match(shell, /\["\/members", "◉", "참가자"\]/);
  assert.doesNotMatch(shell, /<MeetingMembers/);
  assert.match(membersPage, /<MeetingMembers key=\{meeting\.id\}/);
  assert.match(membersPage, /useBungmoWorkspace\(\)/);
  assert.match(roster, /<MemberPicker/);
  assert.match(dialog, /BOOONG 프로필/);
  assert.match(dialog, /user.profileId &&/);
  assert.match(dialog, /aria-pressed=\{Boolean\(selected\)\}/);
  assert.match(dialog, /disabled=\{saving\}/);
  assert.doesNotMatch(dialog, /aria-modal|role="dialog"/);
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

test("새 지출은 시트로 일괄 입력하고 기존 지출 수정은 유지한다", async () => {
  const [settlement, sheet] = await Promise.all([
    readFile(new URL("../app/settlement/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ExpenseSheet.js", import.meta.url), "utf8")
  ]);
  assert.match(settlement, /<ExpenseSheet members=\{activeMembers\}/);
  assert.match(settlement, /<ExpenseDialog expense=/);
  assert.match(sheet, /<dialog/);
  assert.match(sheet, /element.showModal\(\)/);
  assert.match(sheet, /<table>/);
  assert.match(sheet, /normalizeExpenseRows\(rows/);
  assert.match(sheet, /onCancel=.*if \(!saving\) onClose\(\)/);
});

test("일정 대상 전환과 저장 완료는 최신 세션만 화면을 바꾼다", async () => {
  const board = await readFile(new URL("../app/components/ScheduleBoard.js", import.meta.url), "utf8");
  assert.match(board, /function resetTarget\(nextTargetId\) \{[\s\S]*selectionEpoch\.current \+= 1;[\s\S]*setAvailability\(\{\}\);[\s\S]*setTargetError\(""\);[\s\S]*setTargetLoading\(Boolean\(nextTargetId\)\);[\s\S]*setTargetId\(nextTargetId\);/);
  assert.match(board, /if \(active && selectionEpoch.current === session && saveScope.current === scope\) setSaveState\(state\)/);
  assert.match(board, /writer.flush\(\).catch/);
  assert.match(board, /const loadedEpoch = useRef\(0\)/);
  assert.match(board, /loadedEpoch\.current = 0/);
  assert.match(board, /loadedEpoch\.current = session/);
  assert.match(board, /loadedEpoch\.current !== selectionEpoch\.current/);
});
