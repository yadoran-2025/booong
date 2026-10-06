# 왓챠-도서관 호환 시스템 Implementation Plan

## 최신 실행 범위 — 2026-10-03

최종 요청: 야도란·도선생 버튼을 함께 선택할 수 있게 하고, 아래에서 경기도서관·선경·태장마루 등 도서관 하나를 선택하면 해당 도서관의 대출 가능 책만 나열한다. 경기도서관·선경·태장마루는 바로 보이며 나머지는 다른 도서관 메뉴에서 선택한다. 선택한 계정들의 저장 목록을 합치고 같은 왓챠 작품 ID는 한 번만 보여주며 책마다 소유 계정을 표시한다. 기본 대출 가능 필터는 켜져 있고 필요하면 해제해 미확인 책의 ISBN을 교정할 수 있다. 새로 불러오기와 대출 상태 갱신은 선택한 계정들에 적용하며 공유 책의 교정·조회 결과는 두 캐시에 함께 저장한다. 계정과 도서관 선택은 재방문에도 유지한다. 아래 이전 단일 계정·체크리스트 UI보다 이 요청이 우선한다.

최신 추가 요청: 긴 가로 행을 반응형 여러 열의 작은 카드로 바꾸고 제목·안내 영역을 줄인다. 수원은 공개 통합검색의 24개 도서관을 개별 선택한다. 수원 지점 목록은 접히며 전체 선택·해제를 제공한다. 카드에는 실제 대출 가능한 지점명을 표시하고 상세에는 개별 소장 도서관 결과를 나눈다. 기존 저장 결과는 지점 이름으로 바로 활용하고 이후 응답의 기관 코드를 함께 저장한다. 기존 수원 전체 선택은 24개 지점 선택으로 이관한다.

추가 요청: 책은 작은 표지·제목·상태를 보이는 컴팩트 행으로 표시하고 소장본·ISBN·재조회는 기본 접힌 상세 영역에 둔다. 경기도서관·수원시·용인시 체크리스트의 선택을 브라우저에 기억한다. 선택한 곳 중 대출 가능한 기관이 있으면 초록, 선택한 곳 전부 확인된 대출 불가·미소장이면 빨강, 선택 없음·조회 중·실패·ISBN 미확인은 중립색으로 표시한다. 선택 변경은 저장 결과로 즉시 반영하며 자동으로 도서를 숨기지 않는다. 대출 가능 필터만 선택 기준에 따라 작동한다.

추가 요청: 루프백 로컬 개발 서버의 이 페이지는 로그인 없이 조회한다. 운영 환경 인증은 유지한다.

추가 요청: 책 제목 옆에 왓챠 목록의 표지 이미지를 표시한다. 검증한 HTTPS 이미지 호스트만 허용하고 네이티브 지연 로딩을 사용한다. 기존 저장 목록은 완료한 대출 조회 결과와 수동 ISBN 교정을 유지하면서 표지 메타데이터만 보완한다. 표지 없음·이미지 로딩 실패는 빈 표지 자리로 표시한다.

최신 요청: 야도란(`WwRqoyDgkV5lz`)과 도선생(`6ewxa7ae1WvQ1`) 두 공개 계정을 등록한다. 계정 선택 시 전체 읽고 싶어요 목록을 자동 수집한다. 서버의 20권 페이지 단위는 내부 전송에만 사용하며 사용자에게 다음 페이지 버튼을 노출하지 않는다.

전체 목록과 도서관 결과는 브라우저 IndexedDB에 계정별로 저장한다. 저장 결과는 재방문에 바로 표시하며, 중단된 미조회 책만 이어서 확인한다. 새로 불러오기는 목록과 모든 대출 상태를 갱신하고 수동 ISBN 교정을 유지한다. 두 건씩 도서관 조회하며 25권마다 저장하고 완료 시 다시 저장한다. 계정 전환·새로 불러오기 시 이전 작업을 취소한다. 저장 실패는 안내하되 조회를 막지 않는다.

경기도서관·수원 통합검색·용인 시립 21개 도서관의 현재 공개 조회 응답을 사용한다. 제공자 수집 동의를 확보했다고 주장하지 않으며 로그인·비공개 접근을 우회하지 않는다. 자유 계정 관리, 서버 저장소, 정기 수집, Firebase 변경, 운영 배포는 제외한다. 새 API 키나 의존성 없이 기존 관리자 인증을 사용한다. 아래 초기 계획의 메모리 전용·단일 계정·20권씩 수동 조회 제약보다 최신 요청이 우선한다.

구현: `watcha-library.html`, `js/watcha-library.js`, `js/watcha-library-data.js`, `js/watcha-library-cache.js`, `css/watcha-library.css`, `lib/watcha-library.js`, `api/watcha-library.js`. 검증: `scripts/test-watcha-library.mjs`, 기존 전체 테스트·정적 검사·화면 smoke 및 브라우저 확인.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 카드에서 여러 왓챠피디아 계정의 읽고 싶은 도서를 경기도서관·수원·용인의 소장 및 대출 상태와 연결한다.

**Architecture:** 기존 정적 관리자 페이지와 Vercel API·Google 관리자 검증을 재사용한다. 서버의 wishlist/도서관 모듈이 외부 응답을 작은 공통 계약으로 정규화하고, 브라우저가 계정별 페이지 수집·ISBN 병합·20권씩 조회·필터링을 수행한다. 도서관 원문을 현재 상태의 우선 출처로 사용하고 정보나루는 명시적으로 전날 데이터인 보조 출처로 사용한다.

**Tech Stack:** Vanilla HTML/CSS/ESM JavaScript, Node 24.x/Vercel Functions, native fetch/URL/AbortController, 기존 Firebase Auth와 jose, node:assert/strict.

**Spec:** `docs/superpowers/specs/2026-10-03-watcha-library.md` — 반드시 함께 읽는다. 사용자 미응답 가정과 외부 연동 미검증 항목을 포함한 검토용 초안이다.

## Global Constraints

- 관리자 화면과 모든 API 요청은 기존 Google 관리자 검증을 재사용한다.
- BOOONG Firebase 웹 앱은 `1:266288546185:web:727060b22ce9643d0c2158`, 프로젝트는 `yadoran-2025`; 이 기능은 기존 Authentication을 사용하며 Firebase 규칙·Functions·Hosting·다른 앱을 변경하지 않는다.
- BOOONG Design System `https://yadoran-2025.github.io/booong-design-system/releases/v2.0.0/booong.css`와 기존 토큰·컴포넌트를 사용한다. 가이드는 `https://github.com/yadoran-2025/booong-design-system/blob/main/AI_GUIDE.md`이다.
- 원문 조회는 서버에서 실행한다. 외부 API 키는 `DATA4LIBRARY_AUTH_KEY` 서버 환경변수로만 보관한다. 원문 목록·토큰·키를 정적 JSON·공개 Google Sheet·로그에 저장하지 않는다.
- 요청 프로필은 `https://pedia.watcha.com/ko/users/{id}` 또는 `https://watchapedia.com/ko/users/{id}`만 허용한다. ID는 `[A-Za-z0-9_-]{1,80}`; query·hash는 제거하고 사용자정보·다른 경로·다른 호스트·다른 포트는 거부한다.
- 서버는 고정된 검증 완료 HTTPS 호스트/경로만 호출한다. 사용자 제공 next URL을 따라가지 않으며 외부 redirect는 자동 추적하지 않는다.
- 최대 10개 계정, 외부 요청 timeout 8초, 응답 원문 최대 2 MiB, wishlist 페이지당 최대 50권, 브라우저 도서 조회 동시 2건, 서버 기관 조회 동시 3건으로 시작한다.
- 초기 결과 저장은 메모리뿐이며 영속 DB·cron·공유 캐시를 추가하지 않는다. 모든 API 응답은 `private, no-store`다.
- 브라우저 설정 키는 `booong:watcha-library:{firebaseUid}:v1`; 계정 전환 시 결과와 진행 요청을 취소하고 새 UID의 설정만 불러온다. 저장 실패는 안내하되 조회 기능을 막지 않는다.
- 외부 문자열은 `escapeHtml`/`textContent`로 렌더링하고 원문 링크의 protocol·hostname을 검증한다. 표지·긴 소개문 수집은 최초 범위에서 제외한다.
- 계획 단계에서는 문서만 작성한다. 실행 전 사용자에게 계획 검토와 실행 방식 선택을 요청한다.

## Review Focus

- 정상처럼 보이는 빈 응답·수원 재수집·미지원 지점은 미소장으로 바뀌지 않아야 한다. Task 3의 부분 범위/장애 테스트.
- ISBN 없는 동명 도서·다른 번역/판본·잘못된 ISBN은 자동 병합되지 않아야 한다. Task 2의 ISBN/병합 테스트.
- 두 번째 이후 wishlist 페이지 실패·반복 cursor·비공개 전환은 전체 목록 완료로 보이지 않아야 한다. Task 2/5의 페이지 수집 테스트.
- 전날 상태·예약·열람전용·새 원문 상태가 현재 대출 가능으로 오인되지 않아야 한다. Task 3/5의 상태/최신성 테스트.
- Google 계정 전환·관리자 권한 회수·이전 요청의 늦은 응답이 다른 계정에 결과를 노출하지 않아야 한다. Task 4/5의 인증/화면 경합 테스트.

---

## 실행 순서와 검증 게이트

2026-10-03 실행 기록: 사용자가 Native를 선택하고 실험 계정 1개를 제공했다. 공개 프로필은 정상 접근되지만, 사용자가 **자동 연동을 유지하고 허용 경로 확보 후 진행**을 선택하여 Task 1은 대기 상태다. 근거·실제 도서관 검색 경로·문의 초안은 `docs/superpowers/specs/2026-10-03-watcha-library-sources.md`에 기록했다. Task 1을 완료 처리하거나 미검증 계약으로 후속 구현을 시작하지 않는다.

Task 1은 외부 연동 경로를 확정하는 선행 검증이다. Task 2–5는 그 결과가 명시적인 계약으로 확정된 뒤 실행한다. 하나의 사용자 흐름이므로 별도 수집 플랫폼·다른 프로젝트로 나누지 않는다.

자동 wishlist 및 현재 대출 상태 연동이 막히면 Task 1 보고서와 구현 가능한 범위를 제시한다. 임의의 내부 API/브라우저 봇을 추가하거나, 사용자 동의 없이 CSV 방식으로 요구를 바꾸지 않는다. 외부 endpoint/필드가 미확정인 상태에서 아래 계획을 완전히 실행 가능한 것으로 보고하지 않는다.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `docs/superpowers/specs/2026-10-03-watcha-library-sources.md` (신규) | 검증한 upstream 계약·허용 경로·freshness·지점 범위·실측시간 기록 |
| `scripts/fixtures/watcha-library/*.json` (신규) | 검증한 형태를 재현한 비식별/합성 응답; 실제 개인 목록·키 제외 |
| `data/watcha-libraries.json` (신규) | 검증된 공공도서관 지점 이름·기관별 코드·안전한 검색 URL |
| `js/watcha-library-data.js` (신규) | 공통 데이터 계약, ISBN 검증/병합; DOM·인증·fetch 없음 |
| `lib/watcha-wishlist.js` (신규) | 허용된 wishlist 페이지 조회와 서지 후보 검색 |
| `lib/library-availability.js` (신규) | 세 기관 원문 및 정보나루 결과 정규화 |
| `api/watcha-library.js` (신규) | 인증·요청 검증·서버 모듈 호출·HTTP 오류 매핑 |
| `watcha-library.html`, `css/watcha-library.css`, `js/watcha-library.js` (신규) | 관리자 도구 화면·표/모바일 목록·조회 및 설정 관리 |
| `scripts/test-watcha-library.mjs` (신규) | 전 기능의 작은 assert 실행 검사; 실행 인자로 구간 선택 |
| `js/admin.js` (수정, 현재 92–100행) | 세 번째 카드와 관리자 홈의 자동 mount 범위 |
| `scripts/test-admin.mjs` (수정, 현재 147행 이후) | 기존 두 카드/권한 회귀 및 새 페이지 import 안전성 |
| `scripts/serve.mjs` (수정, 현재 8–16행) | `/api/watcha-library` 로컬 라우트 |
| `scripts/smoke-pages.mjs`, `package.json` (수정) | 페이지 smoke 대상과 기존 test 명령에 검사 연결 |

`css/admin.css`는 기존 2열/모바일 1열 레이아웃을 그대로 쓴다. Firebase·Supabase·다른 API 파일은 변경하지 않는다. 현재 작업 트리에 다수의 수정/신규 파일이 있으므로 적용 시점의 내용을 기준으로 변경하고 다른 작업을 되돌리지 않는다. commit은 파일 전체를 무작정 stage하지 말고 자신이 만든 변경만 포함한다.

## 공통 계약

아래 타입은 JS의 JSDoc으로 `js/watcha-library-data.js`에 정의한다. TypeScript 빌드를 추가하지 않는다.

```ts
type Group = 'gyeonggi' | 'suwon' | 'yongin';
type Profile = { id: string; url: string; label: string };
type WishBook = {
  watchaId: string; title: string; author: string; publisher: string;
  isbn13: string | null; accountIds: string[];
};
type WishPage = { profileId: string; books: WishBook[]; nextCursor: string | null };
type Library = {
  id: string; group: Group; name: string; providerBranchId: string | null;
  data4libraryCode: string | null; searchUrl: string;
};
type Holding = {
  libraryId: string; name: string;
  state: 'available' | 'unavailable' | 'not-held' | 'unknown';
  source: 'catalog' | 'data4library' | 'none';
  freshness: 'current' | 'previous-day' | 'unknown';
  checkedAt: string; sourceDate: string | null; sourceUrl: string;
  reason: string | null; room: string | null; callNumber: string | null; dueDate: string | null;
};
type GroupResult = {
  group: Group; coverage: 'full' | 'partial' | 'unknown';
  status: 'ok' | 'partial' | 'unavailable' | 'unsupported'; holdings: Holding[];
};
type Availability = { isbn13: string; groups: GroupResult[] };
type Candidate = { isbn13: string; title: string; author: string; publisher: string };
```

wishlist 에러는 `profile_private`, `profile_not_found`, `source_unavailable`, `source_not_configured`, `source_schema_changed`, `rate_limited` 중 하나의 `error.reason`을 가진다. 기관 일부 실패는 `GroupResult`로 반환하며 전체 요청을 예외로 끝내지 않는다. upstream 고유 cursor 형식·복본 집계는 Task 1에서 확정한다.

### Task 1: 연동 가능성을 실제 계약으로 확정

**Files:** Create sources 문서, 위 fixture 폴더의 `wishlist-page-1.json`, `wishlist-page-2.json`, `catalog-gyeonggi.json`, `catalog-suwon.json`, `catalog-yongin.json`, `data4library.json`, `data/watcha-libraries.json`, `scripts/test-watcha-library.mjs`; Modify 이 spec/plan에서 검증으로 달라진 계약만.

**Interfaces:** 사용자 프로필 URL과 기관 공식 문서/검색을 소비한다. 후속 작업에 HTTP method·고정 endpoint·입력 필드·cursor·ISBN 경로·상태 매핑·지점 코드·원문 링크 생성법·사용 허용 근거를 sources 문서로 제공한다. registry 형태는 `{ libraries: Library[] }`다.

- [ ] **Step 1: 선행 검증 체크를 작성한다.** sources 문서에 `| source | status | reason |` 표를 두고 source 값은 `watcha`, `gyeonggi`, `suwon`, `yongin`, status 값은 `ready` 또는 `blocked`로 고정한다. `node scripts/test-watcha-library.mjs sources`는 네 항목 모두 `ready`이고 위 fixture 6개와 registry가 존재할 때만 통과한다. `blocked` 항목은 이유를 출력하고 실패한다. 이 체크는 parser의 정확성을 대신하지 않는다.
- [ ] **Step 2: 검사 실패를 확인한다.** Run: `node scripts/test-watcha-library.mjs sources`; Expected: 필요한 계약 문서/fixture가 없어 FAIL.
- [ ] **Step 3: 왓챠 경로를 검증한다.** 제공받은 계정 또는 사용자가 화면에서 지정한 계정의 도서 wishlist 두 페이지와 도서 상세를 허용된 경로로 확인한다. 허용 근거·로그인 필요성·ISBN 제공 여부·한 페이지 수·완료 조건·cursor 인코딩/검증 규칙을 기록한다. 사전 동의가 필요한 경우 연락을 대신 보내지 않고 사용자에게 근거와 필요한 정보를 알린다. 경로가 없으면 `blocked`로 기록한다.
- [ ] **Step 4: 세 도서관의 계약을 검증한다.** 공식 전체 공공도서관 명단을 registry로 만들고 각 기관에서 정확한 ISBN으로 대출 가능/불가/미소장 사례를 조회한다. 기관별 응답 형태·복본 중 하나가 가능한 경우의 집계·예약/열람전용 사유·지점 코드·pagination·현재성·권한/자동 조회 가능성·8초 내 응답 여부를 기록한다. 정보나루는 키가 제공된 경우 보조 계약/코드 일치/누락만 별도 검증한다. 수원은 정보나루 결과로 원문 확인을 생략하지 않는다.
- [ ] **Step 5: 재현 가능한 입력을 남긴다.** 실제 계약 형태로 fixture를 만들되 개인 계정/도서 목록과 키는 합성 값으로 치환한다. fixture와 endpoint/필드 표가 서로 대응하는지 확인하고 위 spec/plan의 차이를 수정한다. HTML parser가 필요하면 Node 기본 기능으로 안정적으로 읽는 embedded JSON이 있는지 먼저 확인한다. 없다면 이 시점에만 작은 parser 의존성의 필요성과 파일 변경을 계획에 추가한다. 서버 브라우저 자동화는 기본안에서 제외한다.
- [ ] **Step 6: 게이트를 실행한다.** Run: `node scripts/test-watcha-library.mjs sources`; Expected: 네 source `ready`로 PASS. 막힌 경로가 있으면 FAIL 보고서까지만 완료하고 해당 구현을 진행하지 않는다. 사용자에게 미완료 이유와 대안을 제시한다.
- [ ] **Step 7: 검증 산출물만 commit한다.** Message: `docs: verify watcha and library source contracts`; 자신이 만든 문서·합성 fixture·registry·검사만 포함한다.

### Task 2: wishlist와 ISBN을 정확히 연결

**Files:** Create `js/watcha-library-data.js`, `lib/watcha-wishlist.js`; Modify `scripts/test-watcha-library.mjs`.

**Interfaces:** Task 1의 wishlist/cursor/서지 응답 계약을 소비한다. Produces `normalizeIsbn(value: string): string|null`, `normalizeProfile(url: string, label?: string): Profile`, `mergeWishBooks(books: WishBook[]): WishBook[]`, `fetchWishPage(profile: Profile, cursor: string|null): Promise<WishPage>`, `findBookCandidates(title: string, author: string): Promise<Candidate[]>`.

- [ ] **Step 1: `books` 검사에 실패 assertions를 추가한다.**

```js
assert.equal(normalizeIsbn('0-306-40615-2'), '9780306406157');
assert.equal(normalizeIsbn('9780306406158'), null); // 잘못된 체크섬
assert.equal(normalizeProfile('https://watchapedia.com/ko/users/sample?x=1').id, 'sample');
assert.equal(normalizeProfile('https://pedia.watcha.com/ko/users/sample').id, 'sample');
assert.throws(() => normalizeProfile('https://watchapedia.com.evil/ko/users/sample'));
assert.throws(() => normalizeProfile('https://user:pass@watchapedia.com/ko/users/sample'));
const book = { watchaId:'b1', title:'같은 제목', author:'저자', publisher:'출판사', isbn13:'9780306406157', accountIds:['a'] };
assert.deepEqual(mergeWishBooks([book, { ...book, accountIds:['b'] }])[0].accountIds, ['a','b']);
assert.equal(mergeWishBooks([book, { ...book, watchaId:'b2', isbn13:null }]).length, 2);
assert.equal(mergeWishBooks([book, { ...book, watchaId:'b2', isbn13:'9780140328721' }]).length, 2);
```

같은 ISBN 없는 watchaId는 합치되 다른 watchaId/다른 유효 ISBN/동명 도서는 분리한다. fixture 2페이지에서 영화 제외·중복 계정 제거·빈 목록·비공개·429·변경된 schema를 검증하고 오류 `reason`을 각각 assert한다.
- [ ] **Step 2: 실패를 확인한다.** Run: `node scripts/test-watcha-library.mjs books`; Expected: 새 export 없음으로 FAIL.
- [ ] **Step 3: 순수 변환과 wishlist 조회를 구현한다.** Task 1의 확정한 고정 source만 fetch한다. 페이지별 결과는 요청 profile ID를 붙이고 확인한 ISBN만 정규화한다. 확인할 수 없는 ISBN은 null이다. 후보 검색은 정보나루 `srchBooks`를 사용하고 판본을 자동 선택하지 않는다; 키 미설정은 `source_not_configured`로 반환한다. 세부 URL 조립·JSON/HTML 경로는 sources 문서를 따른다.
- [ ] **Step 4: 검사를 통과시킨다.** Run: `node scripts/test-watcha-library.mjs books && npm run check`; Expected: PASS, upstream fetch mock으로 외부 키/네트워크 없이 실행.
- [ ] **Step 5: 자신의 변경을 commit한다.** Message: `feat: normalize watcha book wishlists`.

### Task 3: 세 도서관의 소장·대출 상태 정규화

**Files:** Create `lib/library-availability.js`; Modify `scripts/test-watcha-library.mjs`; Task 1 registry의 검증 오류가 있으면 수정한다.

**Interfaces:** `Library`, `Holding`, `GroupResult`, `Availability`, `normalizeIsbn` 및 registry를 소비한다. Produces `normalizeCatalogResult(group: Group, raw: unknown, libraries: Library[], checkedAt: string): GroupResult`, `normalizeData4Library(raw: unknown, library: Library, checkedAt: string): Holding`, `lookupAvailability(isbn13: string, groups: Group[], branchIds: string[]): Promise<Availability>`.

- [ ] **Step 1: `libraries` 검사에 실패 assertions를 추가한다.** 각 기관 fixture에서 대출 가능 1복본+대출중 1복본은 해당 지점 `available/current`, 전 복본 대출불가는 `unavailable/current`, 완전한 소장 없음만 `not-held/current`임을 assert한다. `hasBook=Y, loanAvailable=Y` 정보나루 fixture는 아래 결과를 assert한다.

```js
const library = { id:'test-branch', group:'gyeonggi', name:'검사 지점', providerBranchId:null, data4libraryCode:'123456', searchUrl:'https://www.library.kr/ggl/' };
const previous = normalizeData4Library({ response:{ result:{ hasBook:'Y', loanAvailable:'Y' } } }, library, '2026-10-03T00:00:00Z');
assert.equal(previous.state, 'available');
assert.equal(previous.freshness, 'previous-day');
assert.equal(previous.sourceDate, null); // 응답에 원문 기준 날짜 없음
```

선택 지점 누락·수원 재수집·기관 500·timeout·schema 변경·예약·열람전용·알 수 없는 상태는 unknown/partial 또는 unavailable이며 not-held/available로 바뀌지 않음을 assert한다. 전체 공공도서관 명단과 제공 지점 일부가 다른 경우 coverage=partial이다.
- [ ] **Step 2: 실패를 확인한다.** Run: `node scripts/test-watcha-library.mjs libraries`; Expected: 새 export 없음으로 FAIL.
- [ ] **Step 3: 기관별 최소 조회/변환을 구현한다.** 기관 원문을 우선하고 ISBN 정확 일치만 판정한다. 세 그룹은 `Promise.allSettled`로 조회하고 실패한 그룹의 선택 지점도 unknown으로 포함한다. 복본 집계/코드 매핑/정상 무결과 판정은 Task 1 계약을 따른다. 정보나루 미지원/누락은 미소장이 아니며 전날 결과도 현재성 확인을 대신하지 않는다. upstream 원문·API 키를 오류문에 실어 보내지 않는다.
- [ ] **Step 4: 검사를 통과시킨다.** Run: `node scripts/test-watcha-library.mjs libraries && npm run check`; Expected: PASS, 한 기관 실패에도 나머지 결과 유지.
- [ ] **Step 5: 자신의 변경을 commit한다.** Message: `feat: check library holdings and availability`.

### Task 4: 보호된 API와 로컬 실행 연결

**Files:** Create `api/watcha-library.js`; Modify `scripts/serve.mjs`, `scripts/test-watcha-library.mjs`, `scripts/test-admin.mjs`.

**Interfaces:** 기존 `adminAccess(req) -> Promise<{status,body}>`, `sendJson(res,status,body)`와 Task 2/3 함수들을 소비한다. `GET /api/watcha-library?action=libraries`는 `{libraries:Library[]}` 반환. `POST /api/watcha-library`는 다음 body만 받는다.

| action | 입력 | 200 응답 |
| --- | --- | --- |
| `wishlist` | `{action,profileUrl,cursor:string|null}` | `WishPage` |
| `candidates` | `{action,title,author}` | `{candidates:Candidate[]}` |
| `availability` | `{action,isbn13,groups:Group[],branchIds:string[]}` | `Availability` |

모든 메서드에서 인증을 확인한다. 미로그인 401·권한 없음 403·관리자 명단 장애 503은 기존 body를 그대로 사용한다. 입력 오류 400, body 8 KiB 초과 413, 비공개 profile 422, rate limit 429, 미설정/외부 장애 503. 지원하지 않는 method는 405와 `Allow: GET, POST`.

- [ ] **Step 1: `api` 검사에 실패 assertions를 추가한다.** 기존 `scripts/test-admin.mjs`의 실제 서명 테스트 토큰 패턴을 재사용해서 각 action의 401/403/권한 회수 후403과 외부 호출 0회를 assert한다. 정상 action은 계약 응답, 잘못된 ISBN·group·중복/미등록 branch·cursor·해로운 profile URL은400, 원문 URL redirect는 추적되지 않음, oversized raw/preparsed body는413, 응답 Cache-Control은 private/no-store임을 assert한다. key/token/raw 응답이 응답 body에 없는지도 assert한다.
- [ ] **Step 2: 실패를 확인한다.** Run: `node scripts/test-watcha-library.mjs api`; Expected: handler 없음으로 FAIL.
- [ ] **Step 3: handler와 로컬 라우트를 구현한다.** 기존 JSON body 읽기 패턴(`api/comments.js`)을 새 handler 안에서 작게 적용하고 Vercel `req.body`와 로컬 stream 모두의 바이트 한도를 검증한다. action별 객체/문자열/배열 검증, title 1–300자·author 0–200자·cursor 최대1024자(실제 형태는 Task 1 계약), registry에 있는 지점만 허용한다. 인증 후 body/source를 처리하고 거부 요청은 외부 조회하지 않는다. 새 함수용 인증 bypass는 추가하지 않는다.
- [ ] **Step 4: 검사를 통과시킨다.** Run: `node scripts/test-watcha-library.mjs api && node scripts/test-admin.mjs && npm run check`; Expected: PASS. `npm run serve`에서 토큰 없는 `/api/watcha-library?action=libraries`가401인지 확인한다.
- [ ] **Step 5: 자신의 변경을 commit한다.** Message: `feat: protect watcha library lookup API`.

### Task 5: 관리자 카드와 조회 화면 완성

**Files:** Create `watcha-library.html`, `css/watcha-library.css`, `js/watcha-library.js`; Modify `js/admin.js`, `scripts/test-admin.mjs`, `scripts/test-watcha-library.mjs`, `scripts/smoke-pages.mjs`, `package.json`.

**Interfaces:** 기존 admin helpers와 Task 2 순수 함수/Task 4 API를 소비한다. 새 root는 `id="admin-root" data-page="watcha-library"`. Produces `collectWishPages(profile:Profile, request:(cursor:string|null)=>Promise<WishPage>, signal:AbortSignal):Promise<{books:WishBook[],complete:boolean,reason:string|null}>`, `renderBookResults(books:WishBook[], results:Availability[], options:{query:string,accountId:string|null,group:Group|null,state:string}):string`; 페이지 mount는 `document` 존재 시에만 실행하며 auth import는 mount 안에서 한다.

- [ ] **Step 1: `ui` 검사와 관리자 회귀 assertions를 추가한다.** 기존 관리자 렌더 검사에서 새 카드 href/title과 기존 두 카드를 assert한다. 새 page dataset으로 `js/admin.js`를 가져와도 renderAdmin이 실행되지 않음을 assert한다. `collectWishPages`는 2페이지를 끝까지 합치고 2페이지 실패 시 complete=false와 첫 페이지 책들을 유지한다; 반복 cursor/진행 없는 반복은 source_schema_changed다. `renderBookResults`는 제목 검색·담은 계정·지역·상태 필터와 ISBN확인 필요/미조회/전날 기준을 assert한다. `<img onerror=...>` 제목은 실행 HTML이 아닌 이스케이프 문자열이다.
- [ ] **Step 2: 실패를 확인한다.** Run: `node scripts/test-watcha-library.mjs ui && node scripts/test-admin.mjs`; Expected: 새 UI 함수/카드 없음으로 FAIL.
- [ ] **Step 3: 정적 shell·카드·홈 mount 범위를 구현한다.** 카드 문구는 spec 그대로, `.admin-tool` 재사용. 자동실행 조건은 `root && (!root.dataset.page || root.dataset.page === "admin")`. 인증 성공 전 책/계정 설정을 렌더링하지 않는다. DS 가이드를 읽고 기존 admin navigation과 네이티브 form/select/checkbox/details, 텍스트 상태를 사용한다. 모바일 ≤760px는1열, 키보드 포커스·label·44px 터치영역·aria-live 진행 안내를 제공한다.
- [ ] **Step 4: 계정/조회 동작을 구현한다.** UID별 localStorage 설정만 저장하고 결과는 메모리에 둔다. 여러 계정의 wishlist를 페이지 단위로 수집한 뒤 ISBN 병합; 수동 선택/입력 판본은 watchaId→ISBN으로 저장한다. 최초20권/다음20권, 동시2건, 그룹/지점 선택과 상태 재조회, 안전한 원문 링크를 연결한다. available 정렬은 같은 freshness 안에서 적용하고 전날 결과에는 `전날 기준`을 유지한다. 오류/부분/미조회 건수는 필터 밖에서도 남긴다.
- [ ] **Step 5: 계정 경합 검사를 추가하고 통과시킨다.** 첫 조회가 늦게 끝나기 전에 계정을 바꾼 fake auth/응답에서 결과와 form 저장이 새 계정에 섞이지 않는지 assert한다. 이전 request AbortController와 세대값을 둘 다 사용한다. localStorage 읽기/쓰기 예외와 corrupt JSON도 조회를 막지 않는다. 모든 신규 테스트는 기존 `scripts/test-watcha-library.mjs` 한 실행 파일에 모으고 `package.json` test 뒤에 연결한다.
- [ ] **Step 6: 정적/회귀 검사를 실행한다.** Run: `node scripts/test-watcha-library.mjs && npm test && npm run check && npm run smoke`; Expected: PASS. 기존 작업 때문에 실패가 있으면 자신의 회귀와 기존 실패를 구분하고 원인을 보고한다. 통과한 검사는 변경 없이 반복하지 않는다.
- [ ] **Step 7: 실환경 인수검사를 실행한다.** 허용된 두 계정으로 wishlist 총수/페이지 끝을 대조하고, 각 지역의 실제 ISBN 3건(가능/불가/미소장)을 원문과 대조한다. 여러 복본·수원 지점 누락·기관 장애·비공개 계정·모바일375px/PC1280px·Google 계정 전환·새로고침을 확인한다. Google 로그인은 `noamchomsky1571@gmail.com`을 기본 선택하며 인증 challenge는 사용자에게 맡긴다. 실패가 있으면 완료로 보고하지 않는다.
- [ ] **Step 8: 자신의 변경을 commit한다.** Message: `feat: add watcha library admin tool`.

## 배포와 인수 범위

이 계획에는 자동 production 배포를 포함하지 않는다. 구현 시 배포 권한을 별도로 이미 받았다면 기존 Vercel `booong` 프로젝트의 preview에서 새 페이지/API와 기존 관리자 두 도구를 검증하고, 권한 범위에 맞게 production으로 진행한다. Firebase deploy는 필요하지 않다. 키가 필요한 경우 Vercel의 해당 프로젝트 환경에만 `DATA4LIBRARY_AUTH_KEY`를 설정한다.

최종 보고는 자동 wishlist 가능 여부·세 지역의 현재성/coverage·검사 결과·남은 외부 차단 조건을 포함한다. 수동 가져오기만 구현됐거나 한 지역의 전날 데이터만 조회할 수 있으면 사용자 목표 전체 달성으로 표시하지 않는다.

## 자체 검토 기록

- 사용자 요구의 관리자 카드·복수 계정·wishlist·세 지역·소장/대출 상태는 Task 1–5와 완료 기준에 대응한다.
- 실제 upstream 계약은 미확정이다. Task 1 완료 후에만 나머지 단계가 실행 가능하며, 승인되지 않은 크롤링/현재성 추정을 확정 구현으로 적지 않았다.
- 함수/타입/필드명은 공통 계약과 각 Interfaces에서 일치한다. missing ISBN에는 직접 입력과 후보 검색 경로가 있다.
- Review Focus 다섯 항목은 각각 구체적인 owning task 검사에 연결했다. 내부 tests는 외부 사이트 변화를 증명하지 않으므로 실환경 인수검사를 따로 둔다.
- DB·정기 작업·알림·범용 adapter framework·개별 scraper 프로젝트는 초기 요구에 필요 없어 제외했다. 전체 목록/모든 선택 지점·권한·실패 처리·접근성을 생략하지 않았다.
