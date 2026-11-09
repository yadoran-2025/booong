# BOOONG 통계 원본 접근과 집계 API

대상은 Firebase 프로젝트 `yadoran-2025`, BOOONG 웹앱 `1:266288546185:web:727060b22ce9643d0c2158`, 기본 Realtime Database `yadoran-2025-default-rtdb`의 `analytics` 경로다. 다른 DB 인스턴스·Firestore·Storage·Functions·Hosting 설정은 변경하지 않는다.

## 공개 집계

`GET /api/analytics`는 오늘·누적 조회수, 페이지·자료별 집계, 즐겨찾기 수만 반환한다. 기존 화면이 사용하는 제목·자료 ID·링크 메타데이터와 숫자는 유지하고, 방문자 ID·방문자별 기록·전체 일별 이력은 반환하지 않는다. 서버는 필요한 집계 경로 다섯 개만 읽으며 전체 방문 이력을 다운로드하지 않는다.

Vercel CDN 캐시는 60초, 같은 탭의 요청 재사용은 15초다. 공개 숫자 표시는 최대 약 75초 지연될 수 있지만 기록과 카운터 쓰기는 계속 즉시 처리된다. 동시 원본 요청은 합치며, 오류·제한 응답은 캐시하지 않는다. 실패를 정상적인 빈 집계로 캐시하지 않는다. 쿼리는 `admin=1`만 허용하며 다른 쿼리·중복 값은 거절한다.

기존 `api/admin.js` 라우터와 `/api/admin?analytics=1` rewrite를 재사용하므로 Vercel 서버 함수 수는 늘리지 않는다. 로컬 서버도 같은 경로를 제공한다.

## 관리자 원본

`GET /api/analytics?admin=1`은 기존 Google 토큰 검증과 서버 전용 `BOOONG_ADMIN_EMAILS` 명단 확인을 모두 통과해야 한다. 원래 통계 화면의 전체 원본·이력 분석을 유지하며 브라우저와 CDN 모두 `no-store`다. 일반 로그인이나 전용 서버 ID 토큰 자체는 Google 관리자 인증을 대신하지 못한다.

`booong-analytics-reader@yadoran-2025.iam.gserviceaccount.com`은 프로젝트 IAM 역할 없이 조회용 커스텀 토큰을 서명한다. UID `booong-analytics-reader`와 `booongAnalyticsRead: true` 클레임을 모두 만족해야 `analytics` 전체를 읽을 수 있다. 서버 모듈은 고정된 DB의 `analytics` 아래 허용 경로에 GET만 수행한다. 키는 `FIREBASE_BOOONG_ANALYTICS_READER` 서버 환경변수에만 둔다.

## 방문 기록과 기존 데이터

기존 브라우저의 방문자 ID, 탭 세션 중복 방지, 방문·자료 클릭·즐겨찾기 쓰기 코드는 유지한다. 서버 집계 API도 기존 카운터를 읽어서 반환하며 다시 계산하거나 초기화하지 않는다.

원본 전체·집계 컬렉션·방문자 목록의 익명 읽기는 차단한다. 기존 Firebase 트랜잭션에는 읽기 권한도 필요하므로 아래 단일 경로는 계속 읽을 수 있다.

- 페이지·자료·일별·누적·즐겨찾기 카운터 하나
- 경로를 정확히 지정한 방문자 레코드 하나: 기존 중복 확인·클릭 기록·즐겨찾기 상태 확인에 사용

이 예외는 기존 익명 기록과 호환하기 위한 것이다. 브라우저 ID 자체가 소유자 인증은 아니므로 이미 알고 있는 ID의 단일 레코드 조회까지 차단하는 설계는 아니다. 상위 방문자 목록이나 전체 원본을 열거해서 다운로드하는 권한은 없다. 기존 익명 쓰기와 값 검증은 변경하지 않는다.

전환 전에 `.data/analytics-access-2026-11-07/analytics-before.json`, `rules-before.json`, `backup-manifest.json`에 원본과 규칙·체크섬을 백업한다. 날짜가 포함된 폴더명은 작업 시작 시의 이름이며 검증 기록에는 UTC 시각을 별도로 기록한다. 이 폴더는 Git·정적 내보내기에서 제외하고 파일 권한을 제한한다. 운영 데이터에 대한 삭제·이전·재계산은 수행하지 않는다.

## 전환과 검증

1. 새 API·브라우저 코드를 먼저 검증용 운영 빌드로 확인하고 운영 주소에 반영한다.
2. 규칙을 바꾸기 직전에 현재 운영 규칙이 백업과 같은지 확인한다.
3. 아래 명령으로 기본 DB 인스턴스의 규칙만 배포한다. 변경 내용은 `analytics`의 읽기 권한이며 기존 쓰기·검증과 나머지 규칙은 대조해 보존한다.

```sh
firebase deploy --only database --config firebase.analytics.json --project yadoran-2025 --non-interactive
```

4. 익명 전체·목록 조회 거부, 전용 조회 계정 접근, 관리자/비관리자 API, 집계 캐시, 기존 데이터 보존과 실제 브라우저 기록을 확인한다. 전환 전부터 열려 있던 관리자 통계 화면은 새로고침해 새 인증 API를 사용한다.

기본 검사: `npm test`, `npm run check`, `npm run smoke`.

실제 Firebase 규칙 해석은 로컬 에뮬레이터에서 검사한다. 이 테스트는 프로젝트 `demo-booong-analytics`와 루프백 호스트만 허용하며 합성 자료를 사용한다. Firebase 테스트 라이브러리는 기존 `bungmo-app`의 개발 의존성을 재사용한다.

```sh
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" firebase emulators:exec --only database --project demo-booong-analytics --config .data/analytics-access-2026-11-07/emulator.json 'node scripts/test-analytics-rules.mjs'
```

규칙을 되돌릴 때도 먼저 최신 운영 규칙을 백업하고, `analytics` 읽기 설정만 검토해 되돌린다. 통계 원본 백업을 통째로 덮어쓰면 이후 실제 방문 기록을 잃을 수 있으므로 원본 복원은 일반적인 코드·규칙 롤백에 포함하지 않는다.

## 2026-11-08 운영 검증

운영 배포는 `dpl_6hTD6tsCu6ixsEmyBz7cu95zzNYP`이다. 작업 도중 반영된 쌀바구니·파비콘 배포 `dpl_Dx4J7uXGh7PUbRfdXLvcu5ZCNhuC`를 기준으로 이번 소스 7개만 교체하고 나머지는 해시를 대조해 보존했다.

운영 Firebase에서 전체·목록·shallow 조회 10종이 익명 접근을 거부했다. 전용 계정의 원본 조회와 단일 카운터 읽기는 성공했다. Google 관리자 승인·거절은 단위테스트에서, 실제 제한 DB를 읽는 비공개 처리와 `no-store`는 로컬 운영자 허용 경로에서 확인했다. Google 로그인한 운영 관리자 화면의 수동 검증은 하지 않았다.

기존 페이지별 방문자 기록 957건과 과거 80개 날짜의 일별 통계를 대조해 보존을 확인했다. 기존 최초 클릭 기록과 카운터도 초기화되지 않았다. 제한 적용 후 실제 브라우저에서 같은 세션의 페이지 기록을 두 번 요청해 조회수·방문자·전체 조회수가 각각 1만 증가하고, 자료 링크 두 번은 세션 조회 1·전체 클릭 2로 기록되는 것을 확인했다. 즐겨찾기 추가·중복 추가·해제·중복 해제 후 기존 총수도 유지됐다. 검증 과정의 방문·클릭은 정상 테스트 트래픽으로 통계에 포함된다.

공개 응답은 약 9.8KB이며 캐시 적중 요청은 약 18~19ms였다. 새 캐시 경로의 원본 재조회도 제한 적용 후 성공했다. 검증 상세는 백업 폴더의 `access-verification.json`, `preservation-verification.json`, `live-tracking-verification.json`, `private-handler-verification.json`, `cache-verification.json`, `source-scope.json`에 보관한다.
