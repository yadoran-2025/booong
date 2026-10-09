# 개인 프로필 시트

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

프로필 페이지는 공개 CSV에 한 명 이상 있으면 시트 데이터를 사용한다. 시트가 비어 있거나 읽히지 않으면 기존 `members.json`을 fallback으로 사용한다. 초기 마이그레이션은 `members-profile.csv`를 Google Sheet에 붙여넣으면 된다.
