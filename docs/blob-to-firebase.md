# 남은 BOOONG Blob의 Firebase 이전

2026-11-09 대상은 BOOONG 웹앱 `1:266288546185:web:727060b22ce9643d0c2158`, Firebase 프로젝트 `yadoran-2025`다. 수업·프로필은 이미 전용 콘텐츠 DB에 있으며 최신 내용을 덮어쓰지 않는다.

| 기존 Blob | 운영 대상 |
| --- | --- |
| `workshop/store.json` | `yadoran-2025-booong-content`의 `content/workshop` |
| `booong-thumbnails/manifest.json` | 같은 DB의 `content/thumbnails` |
| `booong-thumbnails/images/` | 기존 서울 버킷 `yadoran-2025.firebasestorage.app`의 `booong/managed-content/thumbnails/images/` |

API·썸네일 주소·공유 링크·이미지 복원 버전·응답 식별자·관리자 인증과 공개 필터를 유지한다. 쌀바구니 로컬 개발도 같은 Firebase를 사용한다. 로컬 썸네일 편집은 기존 로컬 파일을 사용한다. 두 JSON 문서는 기존 콘텐츠 DB와 같은 서버 인증·ETag 조건부 저장을 사용하며, 누락·접속 실패를 빈 자료나 Blob으로 대체하지 않는다. 원래 배열·null·키와 ID를 그대로 보존한다. 문서당 기존 8MiB 제한은 유지한다.

기존 `booong-content-server@yadoran-2025.iam.gserviceaccount.com`과 서버 전용 `FIREBASE_BOOONG_CONTENT_SERVER`를 재사용한다. 새 프로젝트 커스텀 역할 `booongManagedContentObjects`는 `storage.objects.get`, `storage.objects.create`만 가지며, 프로젝트 IAM 조건은 위 버킷의 `booong/managed-content/` 객체 경로로 제한한다. 다른 앱·교과서·버킷 설정·공유 Storage 규칙은 바꾸지 않는다. 이미지 생성에는 `ifGenerationMatch=0`을 사용해 기존 객체를 덮어쓰지 못하며 영구 다운로드 토큰을 발급하지 않는다. 이미지 원본은 비공개이고 기존 카드 API만 공개한다. 콘텐츠 DB 규칙에는 정확히 두 레코드만 추가한다.

원본은 Git·정적 배포에서 제외한 `.data/blob-to-firebase-2026-11-09/backup/`에 바이트·SHA-256·ETag와 함께 보관한다. Firebase Storage의 `booong/managed-content/archive/2026-11-09/`에도 전체 원본을 비공개 보관한다. 예전 수업·프로필 Blob은 최신 Firebase를 덮어쓰는 데 사용하지 않는다. 원본 Blob 자체는 삭제하지 않는다.

전환은 기존 운영 소스에서 썸네일·쌀바구니 저장만 차단한 임시 배포로 시작한다. 읽기는 유지하고 다른 앱은 영향받지 않는다. 진행 중 요청이 끝난 뒤 최종 백업·복사·전체 내용 대조를 수행하고 Firebase 운영 배포로 승격한다. 전환 뒤 기존 Blob이 바뀌지 않았는지 다시 검사한다. 이전 중 실패하면 입력을 유지한 채 다시 저장해야 한다.

```sh
node --env-file=.env.local scripts/migrate-remaining-blob.mjs .data/blob-to-firebase-2026-11-09/backup --backup
node --env-file=.env.local scripts/migrate-remaining-blob.mjs .data/blob-to-firebase-2026-11-09/backup --copy
node --env-file=.env.local scripts/migrate-remaining-blob.mjs .data/blob-to-firebase-2026-11-09/backup --verify
```

복사 도구는 원본 ETag·체크섬을 매번 대조하며 기존 대상이 다르면 덮어쓰지 않는다. 운영 전환 이후 Firebase 편집이 발생하면 이전 Blob 배포로 단순 복귀할 수 없다. 최신 Firebase·Blob을 각각 백업하고 변경분을 먼저 대조해야 한다. Blob SDK는 이전·백업 도구의 개발 의존성으로만 남으며 운영 API에서는 불러오지 않는다.

검증은 전체 테스트·쌀바구니 테스트·이미지 OAuth와 권한·비공개 객체·전체 데이터 일치·저장 충돌·접근 거부·운영 공개 API 대조를 포함한다. 실제 운영 수업·설문을 수정하거나 삭제해서 검증하지 않는다.
