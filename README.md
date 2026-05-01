# BOOONG Dashboard

사회교육공동체 BOOONG의 수업 자료를 모아 보고, 수업 화면을 실행하고, 자료 검색/저작/출력 흐름을 다루는 정적 대시보드입니다.

이 저장소는 BOOONG Design System을 외부 의존성으로 사용합니다. 공통 디자인 토큰과 컴포넌트 원형은 이 repo에 다시 들여오지 않고, 페이지별 레이아웃과 제품 고유 동작만 관리합니다.

## 빠른 시작

```bash
npm run serve
```

기본 주소는 `http://127.0.0.1:8765/`입니다. 다른 포트를 쓰려면 PowerShell에서 다음처럼 실행합니다.

```powershell
$env:PORT="8000"; npm run serve
```

## 유지보수 명령

```bash
npm test
npm run check
npm run smoke
```

- `npm test`: BNG LANG/lesson markup 파서 테스트를 실행합니다.
- `npm run check`: 모든 JS 파일의 문법과 로컬 ESM named import/export를 검사합니다.
- `npm run smoke`: 주요 HTML 페이지와 로컬 script/link 참조가 깨지지 않았는지 확인합니다.
- `npm run serve`: 로컬 정적 서버를 실행합니다.

## 주요 페이지

- `index.html`: 대시보드와 수업 실행 진입점입니다.
- `author.html`: BNG LANG 기반 수업 JSON 저작 도구입니다.
- `asset-search.html`: 외부 자료 DB와 새 자료 등록 흐름을 다룹니다.
- `worksheet-maker.html`: 수업 블록을 활동지 형태로 조합합니다.
- `print.html`: 선택한 문제/자료를 출력용 페이지로 렌더링합니다.
- `select.html`: 출력할 문제를 고르는 페이지입니다.
- `about.html`, `connect.html`: 소개와 연결/편집 보조 페이지입니다.

## 현재 구조

```text
.
|-- *.html
|-- assets/
|-- css/
|-- js/
|   |-- author/
|   |-- asset-search/
|   |-- ui/
|   |   `-- blocks/
|   |-- worksheet-maker/
|   |-- api.js
|   |-- app.js
|   |-- asset-config.js
|   |-- lesson-markup.js
|   `-- ...
|-- lessons/
|-- scripts/
|   |-- serve.mjs
|   |-- check-js.mjs
|   |-- check-local-imports.mjs
|   |-- smoke-pages.mjs
|   `-- test-lesson-markup.mjs
`-- members.json
```

## 수업 데이터와 BNG LANG

수업 본문은 `lessons/*.json`에 둡니다. 대시보드 목록은 `lessons/index.json`에서 읽고, 각 수업은 `sections[].blocks[]` 구조로 렌더링됩니다.

저작 도구는 BNG LANG 문법을 JSON 블록으로 변환합니다. 대표 문법은 다음과 같습니다.

```text
## 장 제목
### 절 제목

일반 문단

[[asset-key]]
[[asset-a]] ~ [[asset-b]]
[[asset-key==캡션]]

{{텍스트박스 본문}}

[사례
사례 본문
[[case-img]]
<답>
정답 또는 해설
</답>
]

[발문
질문입니다.
[[question-ref]]
<답>
답입니다.
</답>
]

[개념
개념 설명
[[concept-image]]
]

[문제
250611[경제]
<답>
해설입니다.
</답>
]
```

자료 키는 외부 Google Sheet CSV에서 읽어 오며, 관련 설정은 `js/api.js`와 `js/asset-config.js`에 모여 있습니다.

## 디자인 시스템 원칙

HTML 페이지는 버전 고정된 BOOONG Design System CSS를 사용합니다.

```html
<link rel="stylesheet" href="https://yadoran-2025.github.io/booong-design-system/releases/v2.0.0/booong.css">
```

이 repo의 CSS는 제품별 화면 구성, 수업 블록 배치, 저작 도구, 자료 검색, 활동지/출력 흐름만 담당합니다. 공통 토큰이나 디자인 시스템 소스 파일을 이 repo에 다시 추가하지 않습니다.

UI 스타일을 바꾸기 전에는 design-system `AI_GUIDE.md`를 먼저 확인합니다.

## 작업 기준

- 기능 변경 전후에는 `npm test`, `npm run check`, `npm run smoke`를 실행합니다.
- 페이지 진입점 script 경로는 facade 없이 실제 `index.js` 모듈을 직접 가리킵니다.
- 큰 파일은 기능별 모듈로 나누되, lesson JSON schema와 기존 URL 파라미터 동작은 유지합니다.
- 임시 로그와 생성 산출물은 커밋하지 않습니다.
