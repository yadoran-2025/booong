# 붕모 대시보드 통합

운영자 공간의 **붕모 대시보드**에서 `/bungmo/`를 연다. 모임 선택·생성,
가능 시간 입력·비교, 참가자와 게스트 관리, 지출·개인별 정산·송금 완료 표시,
정산 내역 모아보기, 여행 일정·Google 지도 링크, 지난 모임과 프로필 권한을 이전했다.
게스트는 직접 로그인하거나 이용하지 않는다. 운영자가 게스트를 이름으로 추가하고
가능 시간과 지출 입력 완료 상태를 대신 기록한다.

## 인증과 데이터 범위

- 홈피의 기존 Google 로그인과 `api/admin.js`의 운영자 명단을 재사용한다.
- `/api/bungmo-session`은 운영자 확인 후 원래 Firebase UID의 단기 데이터 세션을 발급한다.
  별도 Firebase Auth 인스턴스를 메모리에만 두어 홈피의 Google 세션을 덮어쓰지 않는다.
- 운영자 명단 변경은 다음 권한 확인부터 적용된다. 명단 캐시 30초와 데이터 권한
  120초를 합쳐, 이미 발급된 세션의 접근은 최장 약 150초 이내 차단된다.
  활성 화면은 45초마다 권한을 다시 확인한다. 프로필의 `active: false`는 데이터 규칙에서 즉시 확인한다.
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
