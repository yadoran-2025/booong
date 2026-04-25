/**
 * 대시보드 메인 화면 렌더링
 */
export async function showDashboard() {
  document.body.innerHTML = "";
  document.body.style.background = "";

  let config = { dashboard: {}, subjects: [], groups: [], games: [], tools: [] };
  try {
    const res = await fetch(`lessons/index.json?_=${Date.now()}`);
    if (res.ok) config = await res.json();
  } catch (err) {
    console.error("대시보드 설정 로드 실패:", err);
  }

  const { dashboard, subjects, groups, games, tools } = config;

  const container = document.createElement("div");
  container.className = "dashboard";

  const inner = document.createElement("div");
  inner.className = "dashboard__inner";

  // 헤더
  const header = document.createElement("header");
  header.className = "dashboard__header";

  let logoHTML = dashboard.logo || "🛵";
  if (dashboard.logo === "scooter-pictogram") {
    logoHTML = `
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--brand);">
        <circle cx="6" cy="18" r="2.5"></circle>
        <circle cx="18" cy="18" r="2.5"></circle>
        <path d="M6 15.5V11l2-2h3.5l1.5 1.5v5"></path>
        <path d="M10 9V5h3"></path>
      </svg>
    `;
  }

  header.innerHTML = `
    <div class="dashboard__logo">${logoHTML}</div>
    <h1 class="dashboard__title">${dashboard.title || "사회교육플랫폼 BOOONG"}</h1>
    <p class="dashboard__subtitle">${dashboard.subtitle || "스마트 수업 프리젠터"}</p>
    ${dashboard.source ? `<p class="dashboard__source">— ${dashboard.source}</p>` : ""}
  `;
  inner.appendChild(header);

  // 수업 섹션 — subject별 분류
  if (groups && groups.length > 0) {
    const subjectOrder = (subjects && subjects.length > 0)
      ? subjects
      : [...new Set(groups.map(g => g.subject))];

    subjectOrder.forEach(subject => {
      const subjectGroups = groups.filter(g => g.subject === subject);
      if (subjectGroups.length === 0) return;

      const section = document.createElement("section");
      section.className = "dashboard__section";
      section.innerHTML = `<h2 class="dashboard__section-title">${subject}</h2>`;

      const grid = document.createElement("div");
      grid.className = "dashboard__grid";

      subjectGroups.forEach(group => {
        const isMulti = group.lessons.length > 1;

        const groupEl = document.createElement("div");
        groupEl.className = `lesson-group${isMulti ? " lesson-group--multi" : ""}`;

        // 스택 래퍼 (멀티일 때 뒤쪽 그림자 카드)
        const cardWrapper = document.createElement("div");
        cardWrapper.className = "lesson-group__card-wrapper";

        const card = document.createElement("div");
        card.className = "dash-card lesson-group__card";
        card.innerHTML = `
          <div class="dash-card__tag">${group.school}</div>
          <h3 class="dash-card__title">${group.title}</h3>
          <p class="dash-card__desc">${group.desc}</p>
          <div class="dash-card__footer">
            ${group.lessons.length}개 차시
            <span class="dash-card__arrow">↓</span>
          </div>
        `;

        // 차시 목록 (호버 시 슬라이드다운)
        const subs = document.createElement("div");
        subs.className = "lesson-group__subs";

        group.lessons.forEach(lesson => {
          const subCard = document.createElement("a");
          subCard.className = "lesson-sub-card";
          subCard.href = `?lesson=${lesson.id}`;
          subCard.innerHTML = `
            <span class="lesson-sub-card__label">${lesson.label}</span>
            <span class="lesson-sub-card__title">${lesson.title}</span>
            <span class="lesson-sub-card__arrow">→</span>
          `;
          subs.appendChild(subCard);
        });

        cardWrapper.appendChild(card);
        groupEl.appendChild(cardWrapper);
        groupEl.appendChild(subs);
        grid.appendChild(groupEl);
      });

      section.appendChild(grid);
      inner.appendChild(section);
    });
  }

  // 게임 섹션
  if (games && games.length > 0) {
    const gameSection = document.createElement("section");
    gameSection.className = "dashboard__section";
    gameSection.innerHTML = `<h2 class="dashboard__section-title">게임</h2>`;

    const gameGrid = document.createElement("div");
    gameGrid.className = "dashboard__grid";

    games.forEach(g => {
      const card = document.createElement("a");
      card.className = "dash-card dash-card--game";
      card.href = g.link;
      card.target = "_blank";
      card.rel = "noopener";
      card.innerHTML = `
        <div class="dash-card__tag">${g.tag}</div>
        <h3 class="dash-card__title">${g.title}</h3>
        <p class="dash-card__desc">${g.desc}</p>
        <div class="dash-card__footer">게임 열기 <span class="dash-card__arrow">→</span></div>
      `;
      gameGrid.appendChild(card);
    });

    gameSection.appendChild(gameGrid);
    inner.appendChild(gameSection);
  }

  // 도구 섹션
  if (tools && tools.length > 0) {
    const toolSection = document.createElement("section");
    toolSection.className = "dashboard__section";
    toolSection.innerHTML = `<h2 class="dashboard__section-title">도구 및 가이드</h2>`;

    const toolGrid = document.createElement("div");
    toolGrid.className = "dashboard__grid";

    tools.forEach(t => {
      const card = document.createElement("a");
      card.className = `dash-card dash-card--${t.type || "tool"}`;
      card.href = t.link;
      card.innerHTML = `
        <div class="dash-card__tag">${t.tag}</div>
        <h3 class="dash-card__title">${t.title}</h3>
        <p class="dash-card__desc">${t.desc}</p>
        <div class="dash-card__footer">${t.type === "guide" ? "가이드 열기" : "이동하기"} <span class="dash-card__arrow">→</span></div>
      `;
      toolGrid.appendChild(card);
    });

    toolSection.appendChild(toolGrid);
    inner.appendChild(toolSection);
  }

  container.appendChild(inner);
  document.body.appendChild(container);
}
