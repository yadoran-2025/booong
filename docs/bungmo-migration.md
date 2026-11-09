# 붕모 대시보드 통합

운영자 공간의 **붕모 대시보드**에서 `/bungmo/`를 연다. 모임 선택·생성,
가능 시간 입력·비교, 참가자와 게스트 관리, 지출·개인별 정산·송금 완료 표시,
정산 내역 모아보기, 여행 일정·Google 지도 링크, 지난 모임과 프로필 권한을 이전했다.
게스트는 직접 로그인하거나 이용하지 않는다. 운영자가 게스트를 이름으로 추가하고
가능 시간과 지출 입력 완료 상태를 대신 기록한다.

## 인증과 데이터 범위

- 홈피의 기존 Google 로그인과 `api/admin.js`의 운영자 명단을 재사용한다.
- 로그인이 필요하면 `/admin.html?next=/bungmo/...`에서 인증한 뒤 원래 화면으로 돌아온다.
  복귀 주소는 붕모의 정해진 내부 경로만 허용한다. 기존 `/bungmo/access/`는 운영자 공간으로 연결한다.
  붕모의 별도 이용 허용/제한은 사용하지 않고, 기존 프로필의 `active` 값은 기록으로만 남긴다.
  모임별 참가자의 `members/{id}.active`는 기존대로 참가 여부를 관리한다.
- 별도 닉네임 가입·수정 단계는 없다. 새 운영자의 참가자 정보는 Google 계정 이름
  (이름이 없으면 이메일 아이디)으로 내부 계정 기록을 자동 준비하며, 기존 프로필과 참가자 ID는 덮어쓰지 않는다.
  로그인 계정과 실제 참가자는 별개이며, 새 모임을 만들 때 운영자를 참가자로 자동 추가하지 않는다.
- 참가자 선택 목록은 `/api/members`의 BOOONG 프로필을 직접 읽고, 화면에 다시 돌아오면 갱신한다.
  선택한 프로필은 `bungmoMeetings/{meetingId}/members/booong:{profileId}`에
  `kind: profile`, `profileId`, `displayName`, `active`로 연결한다. 프로필 이름 변경은 화면에 반영하고
  삭제된 프로필은 저장된 이름으로 과거 기록을 식별한다.
  기존 `bungmoUsers` 명단은 과거 참가자·정산 이름 해석에만 쓰며 새 참가자 선택 목록에는 섞지 않는다.
- `/api/bungmo-session`은 운영자 확인 후 원래 Firebase UID의 단기 데이터 세션을 발급한다.
  별도 Firebase Auth 인스턴스를 메모리에만 두어 홈피의 Google 세션을 덮어쓰지 않는다.
- 운영자 명단은 서버 전용 `BOOONG_ADMIN_EMAILS`로 관리하며 변경은 서버 재시작 또는 새 배포에 반영된다.
  새 명단을 사용하는 서버에서는 다음 권한 확인부터 적용되며, 이미 발급된 데이터 권한은 최장 120초 남을 수 있다.
  이전 설정이 남은 배포 URL의 접근도 별도로 확인한다.
  활성 화면은 45초마다 권한을 다시 확인한다. 로그아웃하면 공통 Google 세션과 붕모 데이터 세션을 함께 정리한다.
- 웹 앱: `1:266288546185:web:727060b22ce9643d0c2158` (붕 홈피).
- Firebase 프로젝트: `yadoran-2025`, Firestore 데이터베이스: `(default)`.
- 데이터 경로: `bungmoUsers/{uid}`, `bungmoMeetings/{id}` 및 기존 하위 컬렉션만 사용한다.
  원래 UID와 문서 ID를 유지하고 기존 기록을 복사·초기화하지 않는다.
- 전용 서명 계정: `booong-bungmo-server@yadoran-2025.iam.gserviceaccount.com`.
  Firestore 관리자 등 프로젝트 IAM 역할을 추가하지 않았다.
- 서버 환경변수: `FIREBASE_BUNGMO_SERVER` (전용 서비스 계정 JSON의 base64).
  로컬 `.env.local`과 Vercel `booong`의 production 환경에 비밀값으로 저장하며 브라우저 번들에는 포함하지 않는다.
  다른 앱의 서비스 계정 키를 이 변수에 넣으면 세션 발급을 거절한다.

## 빌드와 확인

원본 폴더를 변경하지 않고 `bungmo-app/`에서 기존 Next/React/Firebase 구현을 재사용한다.
BOOONG v2.0.0 스타일시트와 디자인 토큰을 소비하며 디자인 시스템 원본은 복제하지 않는다.
운영자 공간과 같은 글꼴·색상·버튼을 사용하고, 모든 화면의 상단 메뉴에서 기능을 선택한다.
한눈에 화면은 참가 현황·일정 응답·정산액과 준비 작업을 보여 준다. 참가자는 팝업 없이
프로필 검색·선택·제외·게스트 추가를 처리한다. 여행 일정은 월간 달력에서 모임 기간과
날짜별 일정을 표시하며, 선택한 날짜의 시간표에서 추가·수정·삭제한다. 여행 장소는 실제 Google 지도 링크로 연결한다.
기존 모임·참가·일정·정산 데이터의 일괄 초기화는 하지 않는다.
메뉴는 Next.js 화면 전환을 사용하며 로그인·선택한 모임은 공통 레이아웃에 유지한다.
운영자 권한의 주기적 재확인은 유지하고, 정적 전환용 `.txt`는 로컬에서도 `text/plain`으로 제공한다.
일정 조율은 날짜별 열·시간별 행에서 칸을 누를 때마다 가능 → 어려움 → 빈칸으로 순환 입력한다.
전체 비교에서는 가능한 인원과 개인 응답을 확인한다.
변경한 칸은 순서대로 병합 저장하며 참가자·화면 전환 시 대기 중인 변경도 저장한다.
새 지출은 시트에서 여러 행을 입력하고 Firestore 배치로 함께 저장한다. 빈 행은 제외하고
모든 행을 검증한 후 쓰며, 실패한 경우 입력을 유지한다. 기존 지출 수정은 단건 편집을 사용한다.

```sh
npm run build:bungmo
npm run serve
npm test
npm run check
npm run test:bungmo
npm run test:rules --prefix bungmo-app
```

빌드는 `/bungmo/` 정적 파일을 생성한다. 이 폴더는 Git에서 제외되고 Vercel 빌드가 다시 만든다.
Vercel 빌드는 `scripts/export-site.mjs`로 홈피와 붕모 정적 화면만 `public/`에 모은다.
API는 서버 함수로 유지하고 `bungmo-app/`, 서버 소스, 환경변수, 의존성 폴더는 공개 출력에서 제외한다.
`bungmo-app/out/`과 `bungmo/`는 생성물이다. 수동으로 만든 `bungmo/` 폴더는 덮어쓰지 않는다.
개발용 Next 서버의 루프백 주소에서는 원본 앱의 샘플 데이터 미리보기를 사용한다.
프로덕션 빌드에서는 이 우회 경로를 사용할 수 없다.

## 실서비스 반영 범위

2026-11-09 사용자의 전체 배포 요청으로 인증·디자인 통합, BOOONG 프로필 연동,
지출 일괄 입력, 여행 캘린더, 일정 클릭 순환 입력과 화면 전환 개선을 붕 사이트 변경과 함께 운영에 반영했다.
Vercel `booong` 배포는 `dpl_F3eCw7Ck6z3QJk9uHtixECT13Hr4`이며
`https://booong.vercel.app/`과 `/bungmo/`에서 제공한다.
Firestore는 `--project yadoran-2025 --config bungmo-app/firebase.json --only firestore:rules`로만 배포했다.
규칙 ID는 `3ac5225e-8fec-44c7-8388-85596338058b`이며 다른 앱 규칙은 운영 전후 동일하다.
통계·콘텐츠 RTDB 규칙은 현재 운영본과 같아 다시 배포하지 않았다.
운영 페이지 12개, 변경된 화면 파일 50개, 공개 프로필·수업·공지 데이터 보존과 미인증 API 차단을 확인했다.
로그인된 운영자 계정으로 실제 모임 조회, BOOONG 프로필 목록, 지출 입력 시트와 여행 캘린더를 확인했다.
데이터 추가·삭제·초기화는 수행하지 않았다. 배포 전후 ID·규칙·소스 목록과 검증 결과는
Git·정적 배포에서 제외한 `.data/deploy-2026-11-09/`에 보관한다. 아래는 이전 배포 기록이다.

2026-10-13 Vercel `booong` production에 서버 환경변수를 설정하고 배포했다.
운영 URL은 `https://booong.vercel.app/bungmo/`, 배포 ID는
`dpl_5XXxGjUkotvrnoMmQ83jDW3NwZ7C`이다. 배포 전 최신 Firestore 규칙이 기준본과 동일함을 확인하고 붕모 부분만 병합했다.
`bungmo-app/firestore.baseline.rules`는 작업 시작 시 실제 배포 규칙의 기준본이다.
규칙 테스트가 기존 앱 부분이 그대로 보존되는지 비교한다.

Firestore 규칙은 데이터베이스 전체에 적용되므로 다른 앱 규칙을 보존한 병합본으로만
`firestore:rules`를 배포한다. 루트 RTDB 규칙, Storage, Functions, 다른 Hosting 사이트는
배포 대상이 아니다. 원본 붕모 폴더의 오래된 전체 규칙을 배포하면 안 된다.

홈피의 기존 production 소스 233개를 SHA로 그대로 재사용하고 붕모 관련 변경만 추가했다.
Firestore 배포는 `--project yadoran-2025 --config bungmo-app/firebase.json --only firestore:rules`로 한정했다.
반영 후 규칙 내용이 병합본과 정확히 일치함을 확인했다. 규칙 ID는
`32474c4d-ce6c-440a-8f15-dbc304eb8bfd`이다.
DB 데이터 병합·삭제·초기화는 진행하지 않았다.
새 규칙을 반영하면 기존 독립 붕모 앱의 일반 Google 로그인으로는 같은 데이터에 접근할 수 없다.
운영자는 홈피 `/bungmo/`를 사용해야 한다.

운영 배포에서 7개 화면, 초기 CSS·JS, 중립 글자색, 운영자 진입 링크를 확인했다.
기존 홈피 HTML·화면 CSS·대시보드 JS가 이전 배포와 동일함도 확인했다.
미인증 세션 API는 401, 미인증 Firestore 조회는 403이며 서버 소스와 환경변수는 공개되지 않는다.
실제 운영자 계정 로그인 후 데이터 조회 확인은 Edge 확장 프로그램의 자동 제어 차단으로 완료하지 못했다.
실서비스 데이터 추가·삭제 테스트는 수행하지 않았다.

## 로컬 로그인 생략

`npm run serve`의 루프백 개발 서버에서는 Google 로그인 없이 기존 붕모 자료를 엽니다.
서버가 로컬 HTML에 넣는 표식이 있을 때만 브라우저가 전용 메모리 인증 인스턴스를 사용합니다.
`BOOONG_LOCAL_ADMIN_UID`에는 기존 운영자 계정 `noamchomsky1571@gmail.com`의 Firebase UID를
로컬 `.env.local`에 보관합니다. 요청으로 UID를 지정할 수 없으며 새 사용자나 예시 자료를 생성하지 않습니다.
기존 전용 서명 계정과 120초 데이터 권한·45초 갱신을 재사용합니다.
운영 배포·외부 호스트·다른 Origin에는 이 세션을 발급하지 않습니다.
프로젝트·웹앱·Firestore 경로는 위와 같고 Firebase 규칙·Functions·Hosting 설정은 바꾸지 않습니다.
