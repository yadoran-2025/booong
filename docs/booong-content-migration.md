# BOOONG 수업·프로필 Firebase 이전

2026-11-07 이전 범위는 BOOONG 웹앱 `1:266288546185:web:727060b22ce9643d0c2158`, Firebase 프로젝트 `yadoran-2025`의 수업 목록과 구성원 프로필 두 항목이다.

| 원본 private Blob | 전용 DB 경로 | 백업 당시 내용 |
| --- | --- | --- |
| `booong-lessons/catalog.json` | `content/catalog` | 수업 25개, 단원 234개, 49,771바이트 |
| `booong-members/profiles.json` | `content/members` | 프로필 9명, 3,738바이트 |

대상 인스턴스는 `yadoran-2025-booong-content`, 위치는 `asia-southeast1`이다. 기존 기본 DB·왓챠·trackside·Firestore·Storage·쌀바구니·ERP·공지·댓글은 변경하지 않는다. 당시 썸네일과 쌀바구니는 Blob에 유지했다. 2026-11-09 후속 이전으로 [남은 Blob도 Firebase로 전환했다](blob-to-firebase.md).

## 접근과 저장

`booong-content-server@yadoran-2025.iam.gserviceaccount.com`은 프로젝트 IAM 역할 없이 커스텀 토큰을 서명한다. UID `booong-content-server`와 `booongContent: true` 클레임을 모두 가진 서버만 위의 두 레코드를 읽고 쓴다. 루트·다른 경로·일반 로그인·익명 접근·삭제는 거부한다. 키는 서버 전용 `FIREBASE_BOOONG_CONTENT_SERVER`에만 두며 브라우저로 전달하지 않는다.

레코드는 JSON 문자열로 저장한다. 원래 열 이름, ID, 비공개 수업, 순서, 빈 배열과 null을 유지한다. 기존 API와 관리자 인증·공개 필터·CDN 캐시는 유지하고 Firebase ETag로 조건부 쓰기를 수행한다. 저장 실패나 누락 시 Blob·이전 시트로 자동 전환하거나 빈 목록으로 초기화하지 않는다. 로컬 개발은 기존 `.data/lesson-catalog/catalog.json`, `.data/member-profiles.json`을 유지한다.

규칙 배포는 전용 설정으로만 실행한다.

```sh
firebase deploy --only database --config firebase.booong-content.json --project yadoran-2025 --non-interactive
```

기본 `firebase.json`이나 왓챠·Firestore 규칙을 배포하지 않는다.

## 백업과 복사 검증

Git과 정적 배포에서 제외한 `.data/booong-firebase-migration/`에 원본 `catalog.json`, `profiles.json`, Blob ETag와 SHA-256을 담은 `blob-backup-manifest.json`을 보관한다. 기존 Blob 원본도 삭제하거나 덮어쓰지 않는다. 같은 폴더의 운영 배포·소스 목록은 전환 전 상태를 기록한다. 자격 증명을 백업 자료나 Git에 포함하지 않는다.

```sh
node --env-file=.env.local scripts/migrate-booong-content.mjs .data/booong-firebase-migration
node --env-file=.env.local scripts/migrate-booong-content.mjs .data/booong-firebase-migration --write
```

첫 명령은 쓰지 않고 검증한다. 백업 체크섬·현재 Blob 내용/ETag·스키마를 확인한 뒤, 대상이 비어 있을 때만 `null_etag` 조건으로 생성한다. 기존 대상이 같으면 다시 대조하고, 다르면 덮어쓰지 않는다. 복사 후 원래 객체 전체를 대조한다. Blob 원본이 백업 후 바뀌었다면 중단하고 새로운 백업을 만든다.

운영 전환 직전과 직후에도 원본이 바뀌지 않았는지 확인한다. 이전 중에는 두 관리 화면에서 편집을 피하고, 전환 전부터 열린 관리자 화면은 새로고침한다. 프로필의 이전 Blob 수정 버전은 충돌로 거절된다.

## 배포와 복구

운영 기준 배포는 `dpl_ATpPQyiz7Lx2WVHbWq3K4mxSctHc`이다. 이 배포의 원본 파일 목록을 유지하고 저장소 모듈 두 개, 수업 API의 저장소 생성, 새 Firebase 서버 모듈만 교체하여 별도 운영 빌드로 검증한다. 작업 폴더의 다른 미배포 변경은 함께 올리지 않는다.

운영 전환 배포는 `dpl_CTwunneQyyQo7DFwjB9crXksRhdq`이다. 검증용 배포의 전체 원본 목록을 대조하여 위의 파일 네 개 외에는 동일함을 확인한 뒤 `booong.vercel.app`으로 승격했다. 운영 전후 공개 수업 17개와 구성원 9명의 API 전체 응답이 동일하다. 원본 Blob 두 파일의 ETag·SHA-256과 Firebase 전체 내용은 전환 후에도 백업과 일치한다. 검증 기록은 백업 폴더의 `firebase-verification.json`, `deployed-scope-verification.json`, `production-verification.json`에 보관한다.

전환 후 편집이 없으면 이전 배포로 되돌려 기존 Blob을 다시 사용할 수 있다. Firebase에서 새 편집이 발생했다면 먼저 최신 Firebase와 Blob을 각각 백업하고 변경분을 대조해야 한다. 오래된 Blob으로 단순 복귀하면 전환 후 편집이 사라진다. 이 문서의 이전 스크립트는 기존 Firebase 데이터를 되돌리거나 덮어쓰는 도구가 아니다.

검증: `npm test`, `npm run check`, 실제 Firebase 전체 객체 대조·ETag 충돌·접근 거부, 배포 전후 공개 API 대조.
