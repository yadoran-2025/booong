# 수업용 프리젠터

Notion 지도안을 기반으로 한 수업용 웹 프리젠터.
교실 빔프로젝터에 띄워놓고 키보드로 진행하며, 답은 숨김 처리되어 교사가 원할 때 공개합니다.

## 구조

```
teaching-materials/
├── index.html                  # 셸 (레이아웃)
├── style.css                   # 디자인 시스템
├── app.js                      # 렌더링 + 인터랙션
├── lessons/
│   └── rational-discrimination.json    # 1차시 콘텐츠 (합리적 차별 금지)
├── assets/
│   └── images/
│       └── rational-discrimination/    # 수업별 이미지 폴더
└── README.md
```

새 수업을 만들려면 `lessons/`에 JSON 하나, `assets/images/`에 이미지 폴더 하나 추가하면 됩니다. 디자인과 로직은 공유.

## 로컬 실행

`fetch`로 JSON을 불러오기 때문에 `file://`로 열면 CORS 에러가 납니다. 로컬 서버를 띄워야 해요.

```bash
# Python이 있다면
python3 -m http.server 8000

# Node가 있다면
npx serve
```

브라우저에서 `http://localhost:8000` 접속.

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소로 push
2. 저장소 Settings → Pages → Source: `main` 브랜치 루트
3. 몇 분 뒤 `https://[계정명].github.io/[저장소명]/`로 접속 가능

URL에 `?lesson=rational-discrimination`을 붙여서 특정 수업을 불러옵니다. 기본값도 이거예요.

## 이미지 배치

1차시에 필요한 이미지 파일들. 노션에서 다운받아서 `assets/images/rational-discrimination/`에 아래 파일명으로 저장하세요. (파일이 없으면 "이미지: 파일명" 플레이스홀더가 표시되니, 완성 전에도 구조 확인 가능)

| 파일명 | 용도 | 노션에서 |
|---|---|---|
| `1-1-math-a.jpg` | 1-1 수학문제 Q, 좌측 인물 | 첫 번째 사진 |
| `1-1-math-b.jpg` | 1-1 수학문제 Q, 우측 인물 | 두 번째 사진 |
| `1-1-vocal-a.webp` | 1-1 보컬 Q, 좌측 인물 | `M3flED-WkZdJFN...webp` |
| `1-1-vocal-b.jpg` | 1-1 보컬 Q, 우측 인물 | `images.jpg` |
| `1-1-appearance-a.png` | 1-1 지적 능력 Q, 좌측 | 첫 번째 image.png |
| `1-1-appearance-b.png` | 1-1 지적 능력 Q, 우측 | 두 번째 image.png |
| `1-1-allport.jpg` | 올포트 초상 | `download.jpg` (편견 저자) |
| `1-3-dworkin.jpg` | 드워킨 초상 (1-3, 1-4 재사용) | `20100724.01100115000003.01M.jpg` |
| `1-4-constitution.png` | 헌법 차별금지영역 조문 | 헌법 스크린샷 |
| `1-4-nhrc-law.png` | 국가인권위원회법 조문 | 인권위법 스크린샷 |

이미지 저작권 주의: 인물 사진과 언론사 이미지는 공개 저장소에 올리면 저작권 문제가 될 수 있습니다. 수업 시연 시에만 쓸 거면 저장소를 private로 하거나, 민감한 이미지는 별도 슬라이드로 분리하는 것을 고려하세요.

## 조작법

- `←` `→` 또는 `PageUp` `PageDown`: 섹션 이동
- `Space` 또는 `Enter`: 현재 화면의 답 토글
- 답 박스 클릭: 해당 답만 토글
- 좌측 목차 클릭: 해당 섹션으로 점프
- URL `#1-2` 해시로 딥링크 (북마크, 공유용)

## 콘텐츠 수정

`lessons/rational-discrimination.json`을 편집하면 즉시 반영됩니다. 블록 타입:

- `paragraph`: 일반 단락
- `case`: 🟩 초록 사례 박스 (답 토글 포함 가능)
- `question`: 🗨️ 파란 질문 박스 (여러 하위 질문, 이미지 쌍, 결론 포함 가능)
- `concept`: 💡 회색 개념 정의 (제목, 본문, 불릿, 이미지 조합)
- `figure-concept`: 인물 사진 + 개념 정의 나란히
- `figure-quote`: 인물 사진 + 인용문 나란히
- `expandable`: 접어둘 수 있는 하위 블록 모음
- `summary`: 차시 요약 (번호 목록)

본문에서 `**볼드**`는 강조로, 줄바꿈은 그대로 렌더됩니다.

## 남은 작업

- [ ] 2차시 콘텐츠 추가 (`sessions` 배열에 추가)
- [ ] 이미지 파일 배치
- [ ] 필요시 인쇄용 스타일 (`@media print`)
