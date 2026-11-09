# 개인 프로필 저장소

공개 프로필은 Firebase 프로젝트 `yadoran-2025`의 BOOONG 전용 Realtime Database `yadoran-2025-booong-content`의 `content/members`에서 읽는다. 서버 전용 `FIREBASE_BOOONG_CONTENT_SERVER` 계정만 접근하며 JSON 문자열로 빈 배열·순서를 보존한다. 소개 화면·수업 제작자 선택·연수 참가자 선택은 `GET /api/members`를 공유하며, API는 공개 프로필 필드만 반환한다. 관리자 이메일은 프로필 저장소에 복사하거나 공개 API로 반환하지 않는다. 관리자 권한은 서버 전용 `BOOONG_ADMIN_EMAILS`로 확인하며 Google Sheet의 `admin` 열은 사용하지 않는다. 설정과 전환 절차는 [관리자 Google 계정](admin-sheet.md)을 따른다.

## 관리자 화면에서 수정

운영자 공간의 **프로필 관리**(`member-admin.html`)에서 구성원을 선택해 이름·관심 분야·캐치프레이즈·경력을 수정한다. 경력은 한 줄에 하나씩 입력한다. 구성원 코드는 기존 수업·연수 연결을 유지하기 위해 고정한다. 별칭·세부 연수경력·제작 자료의 수동 입력란은 제공하지 않는다. 만든 자료와 대표 콘텐츠 후보는 수업 관리의 메이커 지정으로만 집계하며, 예전 `making` 값으로 연결을 추가하지 않는다. 쌀바구니에서 자동 집계되는 연수경력은 기존 방식으로 합산한다. 이전 별칭·연수경력 데이터와 이미지·홈페이지 값, 다른 구성원의 프로필은 저장 시 유지한다.

관리자 조회(`GET /api/members?admin=1`)와 저장(`POST /api/members`)은 운영자 인증을 거치며 캐시하지 않는다. 저장은 같은 출처의 JSON 요청만 허용한다. 조회 시 받은 버전과 Firebase ETag를 비교하고 조건부 저장하므로 다른 관리자의 수정을 덮어쓰지 않는다. 저장 실패·충돌·계정 변경 시 입력 내용을 보존하며, 저장하지 않고 다른 구성원으로 이동할 때 확인한다.

소개 카드의 대표 콘텐츠는 프로필 관리에서 해당 구성원의 제작 자료 중 최대 3개를 선택한다. 선택한 순서는 `featuredWorkIds` 배열(`lesson:자료ID` 또는 `game:자료ID`)로 같은 BOOONG 프로필 레코드에 저장한다. 아직 선택하지 않은 기존 프로필은 수업을 먼저 정렬한 제작 자료 3개를 보여주며, 모두 해제해 저장한 빈 배열은 그대로 유지한다. 삭제되었거나 해당 구성원의 제작 자료가 아닌 항목은 소개 카드에 표시하지 않는다. `bio`는 관리 화면에서 **캐치프레이즈**로 편집하며, 관심사와 함께 소개 카드에서 생략하지 않는다. 기존 운영자 인증과 저장 충돌 검사는 그대로 적용한다.

## Google Sheet에서 가져오기

현재 게시된 프로필 시트를 읽고 ID 중복·빈 목록을 확인한 뒤 옮긴다. 기존 Firebase 프로필은 덮어쓰지 않는다.

```sh
node --env-file=.env.local scripts/migrate-member-profiles.mjs
node --env-file=.env.local scripts/migrate-member-profiles.mjs --write
node scripts/migrate-member-profiles.mjs --local --write
```

첫 명령은 검증만 한다. 두 번째는 `FIREBASE_BOOONG_CONTENT_SERVER`로 전용 Firebase에 새로 저장하고 다시 읽어 내용이 같은지 확인한다. 기존 레코드가 있으면 거절한다. 세 번째는 로컬 서버용 `.data/member-profiles.json`을 만든다. 로컬 파일도 덮어쓰지 않는다.

이관 후 Google Sheet의 프로필 수정은 자동 반영되지 않는다. 공개 API의 CDN 캐시는 최대 1시간이며 관리자 저장 성공 시 프로필 캐시 태그만 갱신한다. 캐시 갱신에 실패하면 저장 완료와 최대 1시간의 반영 지연을 관리자에게 알린다. Firebase나 API 장애 시 기존 `members.json`을 사용하므로 이전 내용이 표시될 수 있다. 빈 목록은 그대로 유지한다.

## 기존 CSV 형식

`members-profile.csv`는 기존 `members.json`을 아래 Google Sheet 스키마로 옮긴 초기 데이터다. 시트의 첫 행은 반드시 이 헤더를 사용한다.

```text
id,name,avatar,interests,career,bio,세부 연수경력,making
```

- `id`: 프로필과 제작자 연결에 쓰는 고유 코드
- `name`: 표시 이름
- `avatar`: 프로필 이미지 URL
- `interests`: 표시용 관심사 문자열
- `career`: 경력 여러 개는 `|`로 구분
- `bio`: 소개 문구
- `세부 연수경력`: 연수 이력. 여러 항목은 줄바꿈 또는 `|`로 구분하며, 입력한 순서대로 개인 프로필에 표시한다. 비어 있으면 이 영역은 표시하지 않는다.
- `making`: 만든 자료의 ID 또는 정확한 제목. 여러 개는 줄바꿈 또는 `|`로 구분

저장하는 JSON은 `{ "members": [...] }` 형식이며 `aliases`, `career`, `trainingCareer`, `making`은 문자열 배열이다. 기존 CSV의 `세부 연수경력`은 `trainingCareer`로 변환하며, 프로필 ID와 순서는 유지한다. 기존 `members-profile.csv`와 `members.json`은 이관 전 초기 자료로 보존한다.

기존 Blob `booong-members/profiles.json`은 백업으로 보존한다. 이전 범위·검증·복구 절차는 [BOOONG 콘텐츠 이전](booong-content-migration.md)을 따른다.
