# Dashboard Schema V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 Google Sheets 스키마의 `그룹 정보`와 `단원 코드`를 결합해, 교사가 학교급·과목을 고른 뒤 모든 대단원과 연결 자료를 탐색하는 대시보드로 교체한다.

**Architecture:** `js/dashboard-data.js`가 두 시트를 읽어 대시보드 전용 `catalog` 모델을 만든다. 기존 `groups`/`games`는 로컬 수업 플레이어와 활동지 제작기의 호환 데이터로 그대로 보존한다. `js/ui/dashboard.js`는 `catalog`만 소비해 왼쪽 대단원 가지와 오른쪽 자료 패널을 렌더링하며, 교사 프로필의 과목 후보도 같은 카탈로그에서 얻는다.

**Tech Stack:** Vanilla ES modules, Google Sheets published CSV, native `fetch`, `sessionStorage`/`localStorage`, Node `assert`, BOOONG Design System v2.0.0, project CSS

## Global Constraints

- 작업 위치는 `/Users/a/Documents/GitHub/booong-dashboard-restructure`, 브랜치는 `codex/dashboard-restructure`다. 원본 저장소와 현재 미커밋 변경을 덮어쓰지 않는다.
- Firebase는 이 대시보드 카탈로그의 데이터원이 아니다. Firebase 설정·규칙·Functions·Hosting은 수정하거나 배포하지 않는다.
- 새 데이터원은 아래 두 공개 CSV뿐이다.
  - `그룹 정보`: `gid=1091433397`
  - `단원 코드`: `gid=1789849359`
- `학생들 익명 코드`, `버그 수정`, 폐기된 `gid=0` lesson 시트는 읽지 않는다.
- `단원 코드` 표를 교육과정의 원본으로 취급한다. 대단원명·중단원명의 오탈자나 중복처럼 보이는 값도 클라이언트에서 임의 교정하지 않는다. 과목 선택기는 이 표의 전체 과목이 아니라 공개 자료가 하나 이상 조인된 과목만 표시한다.
- `published`는 `true`, `1`, `yes`, `y`, `공개`만 공개로 인정한다. 빈 값과 그 외 값은 비공개다.
- 한 자료의 `단원 코드`는 쉼표·줄바꿈·세미콜론으로 나누며, 여러 코드에 연결된 자료는 각 관련 과목/대단원에서 보이되 같은 대단원 안에서는 한 번만 센다.
- `teacher_link`는 자료의 기본 동작, `worksheet_link`는 선택적 보조 동작이다. 새 스키마에는 lesson JSON 경로가 없으므로 `?lesson=` 링크를 합성하지 않는다.
- `단원 코드`에 없는 코드는 화면을 깨뜨리지 않고 `diagnostics.unknownUnitCodes`에 남긴다.
- 대시보드는 문서형 페이지이므로 모바일 overlay 패턴을 쓰지 않는다. 기존 v2.0.0 스타일시트를 유지하고, 새 CSS는 제품 전용 레이아웃만 정의하며 새 색·간격은 BOOONG 토큰을 우선 사용한다. 근거: [BOOONG Design System AI Guide](https://github.com/yadoran-2025/booong-design-system/blob/main/AI_GUIDE.md).
- 접근성 기본값을 유지한다: 44px 이상 터치 대상, 키보드로 과목 이동, `aria-selected`/`aria-pressed`, 명확한 focus-visible, 링크가 없는 자료의 disabled 의미.
- 범위 밖: `about.html` 제작자 목록을 새 카탈로그로 이전하는 작업, 활동지 제작기에서 새 자료를 직접 편집하는 작업, lesson JSON 런타임 변경. 이들은 기존 로컬 `groups`/`games` 호환 데이터로 계속 동작한다.

시트 필드 매핑은 다음으로 고정한다.

| `그룹 정보` 열 | catalog 필드/처리 |
|---|---|
| `new!` | `resource.isNew` |
| `published` | 공개 필터 |
| `group_title` | `resource.title`; 빈 제목 행은 제외 |
| `maker` | 분리·중복 제거한 `resource.makers` |
| `kind` | `game`, 그 외 값은 `lesson` |
| `discipline` | `resource.discipline` |
| `school` | 조인으로 얻은 학교급을 보완하는 `resource.schools` |
| `단원 코드` | 숫자 배열 `resource.unitCodes`; curriculum join key |
| `단원명` | 구조에는 사용하지 않고 `resource.sourceUnitName`과 검색 텍스트에만 사용 |
| `desc` | `resource.desc` |
| `teacher_link` | `teacher` action |
| `worksheet_link` | `worksheet` action |

| `단원 코드` 열 | catalog 필드/처리 |
|---|---|
| `단원 코드` | 숫자 code; 중복 검증 key |
| `과목` | canonical subject value |
| `대단원` | `unit.title`; subject와 합쳐 `unit.key` 생성 |
| `중단원` | 원본 순서의 `unit.middleUnits`; 빈 값은 추가하지 않음 |

## Target Data Contract

`normalizeDashboardConfig()`의 반환값은 기존 필드 옆에 `schemaVersion`과 `catalog`를 추가한다. `buildDashboardCatalog()`은 아래 `catalog` 객체만 반환하고, `mergeDashboardCatalog()`이 이를 config에 넣는다.

```js
{
  schemaVersion: 3,
  groups: [],
  games: [],
  catalog: {
    subjects: [
      { school: "중학교", value: "사회1", label: "사회1", order: 0 }
    ],
    units: [
      {
        key: "사회1::I. 인권과 헌법",
        school: "중학교",
        subject: "사회1",
        title: "I. 인권과 헌법",
        order: 0,
        codes: [1, 2, 3],
        middleUnits: ["1. 인권 보장의 의미와 기본권"]
      }
    ],
    resources: [
      {
        id: "resource-우리가-만드는-수요곡선-45",
        title: "우리가 만드는 수요곡선",
        desc: "",
        sourceUnitName: "시장 가격의 결정",
        kind: "lesson",
        discipline: "경제",
        makers: ["maker-code"],
        isNew: false,
        unitCodes: [45],
        unitKeys: ["사회2::III. 시장과 가격"],
        subjects: ["사회2"],
        schools: ["중학교"],
        actions: [
          { key: "teacher", label: "교사용 자료", href: "https://example.com/teacher", external: true },
          { key: "worksheet", label: "활동지", href: "https://example.com/worksheet", external: true }
        ],
        searchText: "우리가 만드는 수요곡선 경제 사회2 iii. 시장과 가격 2. 시장 가격의 결정 maker-code"
      }
    ],
    diagnostics: {
      unknownUnitCodes: [],
      duplicateUnitCodes: [],
      duplicateResourceIds: []
    }
  }
}
```

과목에서 학교급을 얻는 매핑은 새 단원표에 학교급 열이 없으므로 데이터 경계에 한 번만 둔다.

```js
const SCHOOL_BY_SUBJECT = {
  사회1: "중학교",
  사회2: "중학교",
  통합사회1: "고등학교",
  통합사회2: "고등학교",
  사회와문화: "고등학교",
  정치: "고등학교",
  법과사회: "고등학교",
  경제: "고등학교",
  국제관계의이해: "고등학교",
  금융과경제생활: "고등학교",
};
```

표시명만 별도로 둔다. 저장·조인에는 원본 `value`를 쓴다.

```js
const SUBJECT_LABELS = {
  사회와문화: "사회와 문화",
  법과사회: "법과 사회",
  국제관계의이해: "국제 관계의 이해",
  금융과경제생활: "금융과 경제생활",
};
```

---

## Task 1: Lock the new schema into a pure catalog builder

**Files:**
- Create: `scripts/test-dashboard-data.mjs`
- Modify: `js/dashboard-data.js`
- Modify: `package.json`

- [ ] **Step 1: Add a failing adapter test with representative rows**

  `scripts/test-dashboard-data.mjs`에서 `buildDashboardCatalog()`을 import하고 다음을 한 번에 검증한다.

  ```js
  import assert from "node:assert/strict";
  import { buildDashboardCatalog } from "../js/dashboard-data.js";

  const unitRows = [
    { "단원_코드": "36", "과목": "사회1", "대단원": "XII. 세계화와 평화", "중단원": "2. 세계화의 양상" },
    { "단원_코드": "45", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "2. 시장 가격의 결정" },
    { "단원_코드": "46", "과목": "사회2", "대단원": "III. 시장과 가격", "중단원": "3. 시장 가격의 변동" },
    { "단원_코드": "90", "과목": "통합사회2", "대단원": "I. 인권 보장과 헌법", "중단원": "2. 인권 문제의 양상" },
    { "단원_코드": "149", "과목": "경제", "대단원": "I. 경제생활과 경제 문제", "중단원": "1. 희소성과 선택" },
  ];
  const groupRows = [
    { published: "TRUE", group_title: "놀라운 수요일", kind: "game", discipline: "사회", school: "중학교, 고등학교", "단원_코드": "36, 90", teacher_link: "https://example.com/game" },
    { published: "TRUE", group_title: "우리가 만드는 수요곡선", kind: "lesson", discipline: "경제", "단원_코드": "45", teacher_link: "https://example.com/teacher", worksheet_link: "https://example.com/worksheet" },
    { published: "", group_title: "숨긴 자료", kind: "lesson", "단원_코드": "46", teacher_link: "https://example.com/hidden" },
    { published: "TRUE", group_title: "잘못 연결된 자료", kind: "lesson", "단원_코드": "999", teacher_link: "https://example.com/unknown" },
  ];

  const catalog = buildDashboardCatalog(groupRows, unitRows);
  assert.deepEqual(catalog.subjects.map(({ value }) => value), ["사회1", "사회2", "통합사회2", "경제"]);
  assert.equal(catalog.units.length, 4);
  assert.equal(catalog.resources.some(({ title }) => title === "숨긴 자료"), false);
  assert.deepEqual(catalog.resources.find(({ title }) => title === "놀라운 수요일").subjects, ["사회1", "통합사회2"]);
  assert.equal(catalog.resources.find(({ title }) => title === "우리가 만드는 수요곡선").actions.length, 2);
  assert.deepEqual(catalog.diagnostics.unknownUnitCodes, [999]);
  ```

- [ ] **Step 2: Register and run the failing test**

  `package.json`의 `test`에 `node scripts/test-dashboard-data.mjs`를 추가한다.

  Run: `npm test`

  Expected: `SyntaxError: The requested module '../js/dashboard-data.js' does not provide an export named 'buildDashboardCatalog'`.

- [ ] **Step 3: Implement the smallest pure builder**

  `js/dashboard-data.js`에 `SCHOOL_BY_SUBJECT`, `SUBJECT_LABELS`와 export 함수 `buildDashboardCatalog(groupRows, unitRows)`를 추가한다. 구현 순서는 다음으로 고정한다.

  1. 단원 행을 원본 순서대로 읽고 숫자 코드로 정규화한다.
  2. 중복 코드는 첫 행을 사용하고 뒤 코드는 diagnostics에 기록한다.
  3. `subject + majorUnit`을 key로 묶어 `units`를 만든다.
  4. 학교급을 `SCHOOL_BY_SUBJECT`에서 얻고, 매핑 없는 과목 행은 건너뛴다.
  5. 공개 자료만 읽고 단원 코드를 조인한다.
  6. 자료의 `subjects`, `schools`, `unitKeys`를 조인 결과에서 파생한다. 원본 `school`은 조인 결과를 보완만 한다.
  7. `teacher_link`, `worksheet_link`가 있을 때만 action을 만든다.
  8. 자료 ID는 `resource-${slug(group_title)}-${unitCodes.join("-")}`로 만든다. 동일 ID가 다시 나오면 첫 행만 쓰고 diagnostics에 기록한다.

  ```js
  function createResourceId(title, unitCodes) {
    const slug = String(title || "resource")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    // ponytail: 동일 제목+단원코드는 중복 행으로 취급한다. 합법적 중복이 필요해지면 DB에 resource_id 열을 추가한다.
    return ["resource", slug || "untitled", ...unitCodes].join("-");
  }
  ```

- [ ] **Step 4: Prove the parser behavior**

  Run: `node scripts/test-dashboard-data.mjs`

  Expected: process exits `0` with no assertion error.

- [ ] **Step 5: Commit the adapter boundary**

  ```bash
  git add js/dashboard-data.js scripts/test-dashboard-data.mjs package.json
  git commit -m "feat: adapt dashboard catalog to schema v3"
  ```

## Task 2: Load the two live sheets without replacing legacy lesson data

**Files:**
- Modify: `js/dashboard-data.js`
- Modify: `scripts/test-dashboard-data.mjs`

- [ ] **Step 1: Add failing assertions for config compatibility**

  Export a pure `mergeDashboardCatalog(localConfig, catalog)` and assert:

  ```js
  const local = { groups: [{ id: "local-lesson", lessons: [{ id: "lesson-1" }] }], games: [{ id: "local-game" }] };
  const merged = mergeDashboardCatalog(local, catalog);
  assert.equal(merged.schemaVersion, 3);
  assert.equal(merged.catalog, catalog);
  assert.equal(merged.groups[0].lessons[0].id, "lesson-1");
  assert.equal(merged.games[0].id, "local-game");
  ```

  Run: `node scripts/test-dashboard-data.mjs`

  Expected: missing export or failed assertion.

- [ ] **Step 2: Replace the obsolete sheet URL and fetch path**

  Change `DASHBOARD_SHEET_URLS.lessons` to `DASHBOARD_SHEET_URLS.units` with `gid=1789849359`. Replace `loadSheetLessonGroups()` with `loadSheetDashboardCatalog()` that fetches groups and units in parallel and calls `buildDashboardCatalog()`.

  ```js
  const DASHBOARD_SHEET_URLS = {
    groups: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1091433397&single=true&output=csv",
    units: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1789849359&single=true&output=csv",
  };
  ```

- [ ] **Step 3: Keep the lesson runtime contract intact**

  `loadDashboardConfig()`은 항상 먼저 `lessons/index.json`을 정규화하고, 원격 로드 성공 시 `catalog`만 합친다. `groups`와 `games`를 원격 행으로 덮어쓰지 않는다.

  ```js
  const local = await loadLocalDashboardConfig();
  try {
    const merged = mergeDashboardCatalog(local, await loadSheetDashboardCatalog());
    if (useCache) saveCachedDashboardConfig(merged);
    return merged;
  } catch (error) {
    console.warn("Dashboard catalog load failed, using local lessons index:", error);
    return local;
  }
  ```

  캐시 키를 `booong-dashboard-config-v3`로 올려 v2 shape가 재사용되지 않게 한다. 원격 실패 시 오래된 v3 cache가 이미 있으면 최초 cache lookup에서 사용하고, cache가 없으면 UI가 기존 로컬 데이터의 fallback catalog를 만든다.

- [ ] **Step 4: Add a minimal legacy fallback catalog**

  `buildLegacyDashboardCatalog(groups, games)`를 `js/dashboard-data.js`에 두고 로컬 `majorUnit`/`middleUnit`/`subject` 값을 같은 `catalog` shape로 변환한다. 이는 네트워크 장애 때만 사용하며, 대단원이 없는 항목은 `단원 미지정` 하나에 묶는다. `normalizeDashboardConfig()`가 `catalog`가 없을 때 이 함수를 호출하도록 한다.

- [ ] **Step 5: Run the data and lesson regressions**

  Run: `npm test`

  Expected: dashboard-data, teacher-profile, lesson-markup assertions all pass; existing local lesson metadata remains available through `config.groups`.

- [ ] **Step 6: Commit the loader migration**

  ```bash
  git add js/dashboard-data.js scripts/test-dashboard-data.mjs
  git commit -m "fix: preserve lesson data while loading schema v3 catalog"
  ```

## Task 3: Derive teacher choices from the catalog

**Files:**
- Modify: `js/teacher-profile.js`
- Modify: `scripts/test-teacher-profile.mjs`
- Modify: `js/ui/dashboard.js`

- [ ] **Step 1: Rewrite profile tests around injected choices**

  Replace hardcoded legacy expectations with:

  ```js
  const choices = {
    중학교: ["사회1", "사회2"],
    고등학교: ["통합사회2", "정치"],
  };

  assert.deepEqual(normalizeTeacherProfile({ school: "고등학교", subject: "정치" }, choices), { school: "고등학교", subject: "정치" });
  assert.equal(normalizeTeacherProfile({ school: "고등학교", subject: "한국지리" }, choices), null);
  assert.deepEqual(getAdjacentTeacherProfile({ school: "중학교", subject: "사회2" }, choices, 1), { school: "고등학교", subject: "통합사회2" });
  assert.deepEqual(getAdjacentTeacherProfile({ school: "고등학교", subject: "정치" }, choices, 1), { school: "중학교", subject: "사회1" });
  ```

  Run: `node scripts/test-teacher-profile.mjs`

  Expected: current function signatures fail these assertions.

- [ ] **Step 2: Remove the 13-subject hardcoded list**

  Keep `SCHOOL_OPTIONS`, but limit the module to these catalog-aware helpers:

  ```js
  normalizeTeacherProfile(value, subjectOptions)
  loadTeacherProfile(subjectOptions)
  saveTeacherProfile(profile, subjectOptions)
  getAdjacentTeacherProfile(profile, subjectOptions, direction)
  createSubjectOptions(catalog)
  ```

  `createSubjectOptions(catalog)`는 `catalog.subjects`를 `{ 중학교: [], 고등학교: [] }`로 줄이되 원본 순서를 유지한다. `SUBJECT_OPTIONS`, `SUBJECT_ALIASES`, `getAdjacentSubject`, `getTeacherProfileScore`, `isTeacherProfileMatch`, `getCurriculumUnitOrder`는 새 데이터 흐름에서 필요 없으므로 삭제한다.

- [ ] **Step 3: Load config before validating the stored profile**

  In `showDashboard()` await `loadDashboardConfig()` first, derive `subjectOptions`, then call `loadTeacherProfile(subjectOptions)`. Pass the same options through onboarding, subject roller, profile save, and adjacent-profile calls. Replace the old score/alias match in the temporary legacy item path with exact `item.subjects.includes(profile.subject)` plus school membership. If a stored v1 profile contains an old subject such as `한국지리`, show onboarding instead of silently changing it.

- [ ] **Step 4: Verify rollover and onboarding**

  Run: `npm test`

  Expected: all profile and catalog assertions pass, including middle-to-high and final-high-to-middle wraparound.

- [ ] **Step 5: Commit profile migration**

  ```bash
  git add js/teacher-profile.js scripts/test-teacher-profile.mjs js/ui/dashboard.js
  git commit -m "feat: derive teacher subjects from curriculum catalog"
  ```

## Task 4: Replace resource-derived units with the canonical curriculum tree

**Files:**
- Modify: `js/ui/dashboard.js`

- [ ] **Step 1: Make the render state catalog-native**

  In `renderCurationHome()` remove `createLibraryItems(config)` and `createUnitIndex(subjectItems)`. Select data directly:

  ```js
  const catalog = config.catalog;
  const units = catalog.units.filter(unit =>
    unit.school === state.profile.school && unit.subject === state.profile.subject
  );
  if (!units.some(unit => unit.key === state.unit)) state.unit = units[0]?.key || "";
  const selectedUnit = units.find(unit => unit.key === state.unit) || null;
  const unitItems = selectedUnit
    ? catalog.resources.filter(resource => resource.unitKeys.includes(selectedUnit.key))
    : [];
  ```

  이 방식으로 자료가 0개인 대단원도 항상 왼쪽 가지에 나타난다.

- [ ] **Step 2: Delete the obsolete UI-side adapters**

  Remove `createLibraryItems`, `createGroupItem`, `createGameItem`, `createBaseItem`, `createUnitIndex`, `createLessonAction`, `createGameAction`, teacher-profile scoring imports, and 그에만 쓰이는 helpers. `dashboard-data.js`가 만든 `resource.actions`, `searchText`, `unitKeys`를 그대로 사용한다.

- [ ] **Step 3: Render the left branch and right resource panel from the new model**

  Keep the current long vertical spine concept, but make the left column compact:

  - header: `대단원 ${units.length}개`
  - each branch: source-order number/title, deduplicated resource count, middle-unit summary
  - selected branch: `aria-selected="true"`, high-contrast fill, spine node emphasis
  - right panel: selected 대단원 title, middle-unit list, resource count, resource cards
  - zero-resource unit: `이 대단원은 교육과정에 등록되어 있지만 연결된 자료가 아직 없습니다.`
  - unknown-code resources: regular unit branch에는 표시하지 않고 development console에 diagnostics warning 한 번만 출력

- [ ] **Step 4: Use schema actions exactly**

  A resource card is an `<article>`, not one giant anchor. Inside it render only existing actions:

  ```html
  <a class="bundle-action" href="https://example.com/teacher" target="_blank" rel="noopener">
    <small>교사용 자료</small><strong>자료 열기</strong><span aria-hidden="true">→</span>
  </a>
  <a class="bundle-action" href="https://example.com/worksheet" target="_blank" rel="noopener">
    <small>활동지</small><strong>활동지 열기</strong><span aria-hidden="true">→</span>
  </a>
  ```

  action이 하나도 없는 공개 자료는 설명과 `자료 준비 중` 상태는 보여주되 클릭 요소를 만들지 않는다. tracking payload의 `groupId`에는 generated resource id, `actionKey`에는 `teacher` 또는 `worksheet`를 보낸다.

- [ ] **Step 5: Keep filters and search deterministic**

  종류 필터는 `lesson`/`game`, 검색은 builder가 만든 `searchText`를 사용한다. 검색 범위에는 제목·설명·분야·과목·대단원·중단원·제작자를 포함한다. `new!`가 true인 자료를 먼저, 그다음 시트 원본 순서로 보여준다.

- [ ] **Step 6: Run static validation**

  Run: `npm run check`

  Expected: all JS parses and every local import resolves.

- [ ] **Step 7: Commit the catalog-native dashboard**

  ```bash
  git add js/ui/dashboard.js
  git commit -m "feat: render dashboard from canonical curriculum units"
  ```

## Task 5: Recompose the workbench layout around branch → resources

**Files:**
- Modify: `css/dashboard.css`

- [ ] **Step 1: Remove styles for deleted markup**

  Delete selectors that only served the old workbench/tool strip or old card-as-anchor markup. Keep the existing top bar, hero, horizontal subject roller, footer, and onboarding selectors.

- [ ] **Step 2: Make the branch structure visually explicit**

  Desktop layout:

  ```css
  .unit-workspace {
    display: grid;
    grid-template-columns: minmax(15rem, 0.32fr) minmax(0, 0.68fr);
    gap: var(--space-8);
  }

  .unit-axis__track {
    position: relative;
    display: grid;
    gap: var(--space-3);
    padding-left: var(--space-8);
  }
  ```

  세로 spine은 `::before`, 각 항목의 가지는 `button::before`, node는 `button::after`로 그린다. 선택 상태는 색뿐 아니라 배경·outline·node 크기로 구분한다.

- [ ] **Step 3: Make the right panel useful at a glance**

  Right panel uses a sticky section header only on desktop, a one-column resource list, visible kind/new badges, and a dedicated actions row. Do not add a new card component abstraction; keep page-specific `.bundle-*` classes.

- [ ] **Step 4: Define responsive collapse**

  At `max-width: 900px`, use one column, convert the branch list to horizontal overflow with visible focus, and keep the resource panel below it. At `max-width: 620px`, use one-column cards and 44px minimum buttons. Do not use fixed viewport heights or mobile overlays.

- [ ] **Step 5: Check design-system compliance in touched CSS**

  Run:

  ```bash
  rg -n "#[0-9A-Fa-f]{3,8}|font-family|border-radius|box-shadow" css/dashboard.css
  ```

  Expected: no newly introduced raw design primitives in the changed workbench selectors; existing legacy values outside the touched selectors may remain for a later cleanup.

- [ ] **Step 6: Commit layout changes**

  ```bash
  git add css/dashboard.css
  git commit -m "style: focus dashboard on curriculum branches"
  ```

## Task 6: Verify live schema behavior and regression safety

**Files:**
- Modify if a regression is found: `js/dashboard-data.js`
- Modify if a regression is found: `js/teacher-profile.js`
- Modify if a regression is found: `js/ui/dashboard.js`
- Modify if a regression is found: `css/dashboard.css`
- Modify if a regression is found: `scripts/test-dashboard-data.mjs`

- [ ] **Step 1: Run the complete automated suite**

  ```bash
  npm test
  npm run check
  npm run smoke
  ```

  Expected: all commands exit `0`; smoke verifies every HTML page including `index.html` returns successfully.

- [ ] **Step 2: Start the local server**

  ```bash
  npm run serve
  ```

  Expected: server reports `http://127.0.0.1:8765/`. If the existing server is already listening there, reuse it instead of starting a second process.

- [ ] **Step 3: Verify the middle-school path in the browser**

  Open `http://127.0.0.1:8765/index.html`, clear `booong-teacher-profile-v1` once, then verify:

  - onboarding offers only `사회1`, `사회2` for middle school;
  - selecting `사회2` shows every canonical `사회2` 대단원 in source order, including zero-resource units;
  - `III. 시장과 가격` shows resources linked to codes 45/46 without duplicates;
  - clicking a branch updates only the right resource panel selection state and content;
  - wheel, drag, left/right keys, and visible subject buttons all move through the same catalog-derived sequence.

- [ ] **Step 4: Verify the high-school and multi-code paths**

  Verify high school shows only subjects with at least one published joined resource. With the current sheet this is exactly `통합사회2`, `정치`; subjects that only exist in `단원 코드` do not appear. Confirm the resource using codes `36, 90` appears in both its middle-school and high-school curriculum locations.

- [ ] **Step 5: Verify actions, empty states, and compatibility**

  - a resource with `teacher_link` opens that URL in a new tab;
  - a resource with `worksheet_link` shows a second action;
  - a published row with no links shows `자료 준비 중` and is not clickable;
  - blank/false `published` rows never render;
  - a zero-resource 대단원 displays the curriculum-aware empty state;
  - `index.html?lesson=rat-disc-1` still loads the existing local lesson;
  - `worksheet-maker.html` still lists local lesson JSON entries;
  - `about.html` still loads without console errors.

- [ ] **Step 6: Inspect diagnostics without exposing them to teachers**

  Confirm unknown or duplicate codes produce one concise console warning and do not add a visible broken unit. Do not log complete sheet rows or URLs.

- [ ] **Step 7: Commit only any verification fixes**

  If verification required changes:

  ```bash
  git add js/dashboard-data.js js/teacher-profile.js js/ui/dashboard.js css/dashboard.css scripts/test-dashboard-data.mjs scripts/test-teacher-profile.mjs package.json
  git commit -m "fix: harden schema v3 dashboard integration"
  ```

  If no files changed, do not create an empty commit.

## Completion Criteria

- The dashboard fetches only the new `그룹 정보` and `단원 코드` sheets.
- `단원 코드` is the sole source of subject and curriculum-unit structure.
- Every canonical major unit appears even when it has zero connected resources.
- Published resources join correctly across one or multiple unit codes.
- Teacher and worksheet links are rendered without invented lesson routes.
- Middle/high subject choices come from published joined resources in the catalog; curriculum-only and old unsupported choices are rejected.
- Existing lesson player, worksheet maker, about page, analytics, and non-dashboard pages continue to work.
- Automated checks and the listed browser scenarios pass.
