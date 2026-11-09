import { HTML_LAB_PAGE_ID, webProjectLab } from './html-lab.js';
import { toolConnectionLab } from './tool-connection.js';

const TEXT = value => String(value ?? '');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = TEXT(text);
  return node;
}

function button(label, className = 'lp-button') {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
}

function safeLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch { return ''; }
}

export function resourceUrl(value) {
  const url = new URL(/^[a-z][\w+.-]*:/i.test(value) ? value : `https://${value}`);
  if (url.protocol !== 'https:' || (!url.hostname.includes('.') && url.hostname !== 'localhost')) throw new Error('올바른 웹 주소를 입력해 주세요.');
  return url.href;
}

export function redBrickStudentUrl(value) {
  const url = new URL(value.trim());
  if (url.origin !== 'https://yadoran-2025.github.io' || url.pathname.replace(/\/$/, '') !== '/red-brick' || url.username || url.password || url.searchParams.get('student') !== '1' || !url.searchParams.get('display')?.trim()) {
    throw new Error('교사 화면의 ‘학생 화면 열기’ 링크 주소를 복사해 붙여 넣어 주세요.');
  }
  return url.href;
}

export function parseResourceLinks(content) {
  const intro = [];
  const links = [];
  for (const line of TEXT(content).split('\n')) {
    const parts = line.split(/\s+\|\s+/).map(part => part.trim());
    if (parts.length === 3) {
      const url = safeLink(parts[2]);
      if (parts[0] && parts[1] && url) links.push({ title: parts[0], description: parts[1], url });
    } else intro.push(line);
  }
  return { intro: intro.join('\n').trim(), links };
}

export function resourceCards(links, cardsOnly = false) {
  if (!links.length) return el('div', 'lp-resource-card-empty', cardsOnly ? '공유할 자료를 준비 중입니다.' : '위 표에 자료명, 소개, 주소를 입력하면 카드가 여기에 나타납니다.');
  const grid = el('div', 'lp-resource-grid');
  links.forEach(({ title, description, url }, index) => {
    const card = el('a', 'lp-resource-card'); card.href = url; card.target = '_blank'; card.rel = 'noopener noreferrer';
    card.append(el('span', 'lp-resource-number', String(index + 1).padStart(2, '0')), el('span', 'lp-resource-arrow', '↗'), el('h3', '', title), el('p', '', description), el('span', 'lp-resource-domain', new URL(url).hostname.replace(/^www\./, '')));
    grid.append(card);
  });
  return grid;
}

function resourceGallery(links, cardsOnly = false) {
  const section = el('section', `lp-resource-gallery${cardsOnly ? ' lp-resource-cards-only' : ''}`);
  const heading = el('div', 'lp-resource-heading');
  const title = el('div');
  title.append(el('span', 'lp-kicker', 'CURATED LINKS'), el('h2', '', '직접 만든 자료 둘러보기'));
  heading.append(title, el('span', 'lp-resource-count', `${String(links.length).padStart(2, '0')}개의 링크`));
  section.append(heading);
  if (!cardsOnly) {
    const wrap = el('div', 'lp-resource-table-wrap');
    const table = el('table', 'lp-resource-table');
    const head = el('tr');
    ['자료명', '한 줄 소개', '주소'].forEach(label => { const cell = el('th', '', label); cell.scope = 'col'; head.append(cell); });
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    links.forEach(({ title, description, url }) => {
      const row = el('tr');
      const name = el('td');
      const link = el('a', '', title); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; name.append(link);
      const address = el('td');
      const source = el('a', '', url); source.href = url; source.target = '_blank'; source.rel = 'noopener noreferrer'; address.append(source);
      row.append(name, el('td', '', description), address); tbody.append(row);
    });
    if (!links.length) { const row = el('tr'); const cell = el('td', 'lp-resource-table-empty', '아직 등록된 링크가 없습니다.'); cell.colSpan = 3; row.append(cell); tbody.append(row); }
    table.append(thead, tbody); wrap.append(table); section.append(wrap);
    const preview = el('div', 'lp-resource-preview-heading');
    preview.append(el('span', 'lp-kicker', 'PREVIEW'), el('h3', '', '연수자료 카드 미리보기'));
    section.append(preview);
  }
  section.append(resourceCards(links, cardsOnly));
  return section;
}

export function youtubeEmbed(url) {
  try {
    const parsed = new URL(url);
    if (!['youtube.com', 'www.youtube.com', 'youtu.be', 'www.youtu.be'].includes(parsed.hostname)) return '';
    const id = parsed.hostname.includes('youtu.be') ? parsed.pathname.split('/').filter(Boolean)[0] : parsed.searchParams.get('v');
    if (!/^[\w-]{11}$/.test(id || '')) return '';
    const start = Number.parseInt(parsed.searchParams.get('t') || '0', 10) || 0;
    return `https://www.youtube-nocookie.com/embed/${id}?start=${Math.max(0, start)}`;
  } catch { return ''; }
}

function field(label, tag = 'textarea', placeholder = '') {
  const wrap = el('label', 'lp-field');
  wrap.append(el('span', '', label));
  const input = el(tag);
  input.placeholder = placeholder;
  if (tag === 'textarea') input.rows = 4;
  wrap.append(input);
  return { wrap, input };
}

function labShell(kicker, title, copy) {
  const lab = el('section', 'lp-lab');
  const heading = el('div', 'lp-lab-heading');
  heading.append(el('span', 'lp-kicker', kicker), el('h2', '', title), el('p', '', copy));
  const stage = el('div', 'lp-lab-stage');
  lab.append(heading, stage);
  return { lab, stage };
}

function openingLab() {
  const { lab, stage } = labShell('아이디어 스케치', '수업 장면부터 한 칸씩', '기능 이름 대신 학생의 행동과 화면의 반응을 연결해 보세요. 이 브라우저 안에서만 작성됩니다.');
  const inputs = [
    field('어떤 수업인가요?', 'input', '예: 중학교 과학, 기체의 압력'),
    field('학생이 무엇을 하나요?', 'textarea', '예: 결과를 예상하고 근거를 한 문장으로 적는다.'),
    field('화면은 어떻게 반응하나요?', 'textarea', '예: 학급 전체의 예상을 분포로 보여준다.'),
  ];
  const output = el('div', 'lp-output');
  const update = () => {
    const [scene, action, response] = inputs.map(item => item.input.value.trim());
    output.replaceChildren(
      el('span', 'lp-output-label', '지금 만든 장면'),
      el('p', '', scene && action && response ? `${scene}에서 학생은 ${action} 화면은 ${response}` : '세 칸을 채우면 하나의 구현 가능한 수업 장면이 됩니다.'),
    );
  };
  inputs.forEach(item => item.input.addEventListener('input', update));
  stage.append(...inputs.map(item => item.wrap), output);
  update();
  return lab;
}

function architectureLab() {
  const { lab, stage } = labShell('구조 실험', '벽이 지탱할 때와 기둥이 지탱할 때', '버튼을 바꿔 구조와 평면의 관계를 비교해 보세요. 도식은 개념 이해를 위한 예시입니다.');
  const controls = el('div', 'lp-segment');
  const wall = button('내력벽 구조', 'lp-segment-button');
  const column = button('기둥 구조', 'lp-segment-button');
  wall.setAttribute('aria-pressed', 'true');
  column.setAttribute('aria-pressed', 'false');
  controls.append(wall, column);
  const plan = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  plan.setAttribute('viewBox', '0 0 700 390');
  plan.setAttribute('role', 'img');
  plan.setAttribute('aria-label', '구조 방식에 따라 달라지는 평면 도식');
  plan.classList.add('lp-plan');
  plan.innerHTML = `
    <defs><pattern id="lp-plan-paper" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e7efeb" stroke-width=".7"/></pattern></defs>
    <rect width="700" height="390" fill="#f8fbf8"/><rect width="700" height="390" fill="url(#lp-plan-paper)"/>
    <g class="lp-plan-sheet"><text x="30" y="30">FLOOR PLAN / 01</text><text x="670" y="30" text-anchor="end">SCHEMATIC · NTS</text></g>
    <g class="lp-plan-dim"><path d="M95 59H605 M95 53V65 M265 53V65 M435 53V65 M605 53V65 M44 108V310 M38 108H50 M38 310H50"/><text x="180" y="51">3.3 m</text><text x="350" y="51">3.3 m</text><text x="520" y="51">3.3 m</text><text x="28" y="213" transform="rotate(-90 28 213)">4.0 m</text></g>
    <g class="lp-plan-axis">${[95,265,435,605].map((x,i) => `<circle cx="${x}" cy="85" r="10"/><text x="${x}" y="89">${'ABCD'[i]}</text>`).join('')}${[108,209,310].map((y,i) => `<circle cx="69" cy="${y}" r="10"/><text x="69" y="${y+4}">${i+1}</text>`).join('')}</g>
    <g class="lp-bearing">
      <rect class="lp-plan-fill-wall" x="102" y="115" width="496" height="188"/>
      <path class="lp-plan-wall-load" d="M95 310V108H605V310H380 M325 310H95 M265 108V178 M265 223V310 M435 108V178 M435 223V310"/>
      <path class="lp-plan-window-cut" d="M133 108H218 M307 108H393 M477 108H562"/>
      <path class="lp-plan-window" d="M133 104H218 M133 112H218 M307 104H393 M307 112H393 M477 104H562 M477 112H562"/>
      <path class="lp-plan-door" d="M265 178H220 M220 178A45 45 0 0 0 265 223 M435 178H480 M480 178A45 45 0 0 1 435 223 M325 310V255 M325 255A55 55 0 0 1 380 310"/>
      <g class="lp-plan-room"><text x="180" y="204">실 01</text><text x="350" y="204">실 02</text><text x="520" y="204">실 03</text></g>
      <g class="lp-plan-legend"><path class="lp-plan-wall-load" d="M100 354H132"/><text x="142" y="358">하중을 받는 벽 · 구획 고정</text></g>
    </g>
    <g class="lp-columns">
      <rect class="lp-plan-fill-column" x="99" y="112" width="502" height="194"/>
      <path class="lp-plan-wall-shell" d="M95 310V108H605V310H380 M325 310H95"/>
      <path class="lp-plan-light-wall" d="M237 108V170 M237 215V310 M453 108V168 M453 213V271H605"/>
      <path class="lp-plan-window-cut" d="M133 108H218 M307 108H393 M477 108H562"/>
      <path class="lp-plan-window" d="M133 104H218 M133 112H218 M307 104H393 M307 112H393 M477 104H562 M477 112H562"/>
      <path class="lp-plan-door" d="M237 170H192 M192 170A45 45 0 0 0 237 215 M453 168H498 M498 168A45 45 0 0 1 453 213 M325 310V255 M325 255A55 55 0 0 1 380 310"/>
      <g class="lp-plan-column">${[95,265,435,605].flatMap(x => [108,209,310].map(y => `<rect x="${x-7}" y="${y-7}" width="14" height="14"/>`)).join('')}</g>
      <g class="lp-plan-room"><text x="165" y="205">작업실</text><text x="345" y="216">열린 공간</text><text x="525" y="198">회의실</text></g>
      <g class="lp-plan-legend"><rect class="lp-plan-column" x="102" y="346" width="12" height="12"/><text x="142" y="358">기둥이 하중 지지 · 벽 배치 자유</text></g>
    </g>`;
  const note = el('p', 'lp-live-value', '벽이 하중을 맡으면 벽의 위치가 공간 구획을 제한합니다.');
  const setMode = mode => {
    plan.dataset.mode = mode;
    const columns = mode === 'columns';
    plan.setAttribute('aria-label', columns ? '기둥 구조 평면도: 기둥 사이에 얇은 내부 벽을 배치한 열린 공간' : '내력벽 구조 평면도: 두꺼운 구조벽으로 나뉜 세 개의 고정된 공간');
    wall.setAttribute('aria-pressed', String(!columns));
    column.setAttribute('aria-pressed', String(columns));
    note.textContent = columns ? '기둥과 슬래브가 하중을 맡으면 내부 벽의 배치를 바꾸기 쉬워집니다.' : '벽이 하중을 맡으면 벽의 위치가 공간 구획을 제한합니다.';
  };
  wall.onclick = () => setMode('walls');
  column.onclick = () => setMode('columns');
  stage.append(controls, plan, note);
  setMode('walls');
  return lab;
}

const freedomData = [
  ['모으면', '각자의 답이 학급의 분포가 됩니다.', 'aggregate'],
  ['반응하면', '선택에 따라 다음 상황이 달라집니다.', 'branch'],
  ['맡기면', '반복 계산과 판정을 프로그램이 처리합니다.', 'score'],
  ['찾으면', '주장을 바꿀 수 있는 증거를 고릅니다.', 'evidence'],
  ['보이면', '변수를 움직이며 관계를 관찰합니다.', 'graph'],
];

function freedomPanel(kind) {
  const panel = el('div', 'lp-freedom-panel');
  if (kind === 'aggregate') {
    const counts = [7, 11, 5];
    const labels = ['A 예상', 'B 예상', '아직 모름'];
    const bars = el('div', 'lp-bars');
    const draw = () => {
      const max = Math.max(...counts);
      bars.replaceChildren(...counts.map((count, index) => {
        const row = el('div', 'lp-bar-row');
        const name = el('span', '', labels[index]);
        const track = el('span', 'lp-bar-track');
        const fill = el('span', 'lp-bar-fill');
        fill.style.width = `${count / max * 100}%`;
        track.append(fill);
        row.append(name, track, el('b', '', count));
        return row;
      }));
    };
    const choices = el('div', 'lp-choice-row');
    labels.forEach((label, index) => {
      const choice = button(label, 'lp-chip');
      choice.onclick = () => { counts[index] += 1; draw(); };
      choices.append(choice);
    });
    panel.append(el('p', 'lp-sample-label', '예시 응답 · 버튼을 눌러 표본에 한 표 더하기'), choices, bars);
    draw();
  }
  if (kind === 'branch') {
    const scene = el('div', 'lp-branch-scene');
    const choices = el('div', 'lp-choice-row');
    [['안전한 선택', '예산을 지켰습니다. 변화 폭은 작습니다.'], ['과감한 선택', '변화 폭이 큽니다. 남은 예산을 다시 살펴보세요.']].forEach(([label, result]) => {
      const choice = button(label, 'lp-chip');
      choice.onclick = () => { scene.textContent = result; scene.dataset.active = 'true'; };
      choices.append(choice);
    });
    scene.textContent = '선택하면 다음 상황이 이곳에 나타납니다.';
    panel.append(el('p', 'lp-sample-label', '예시 분기 · 결과를 보고 다시 선택하기'), choices, scene);
  }
  if (kind === 'score') {
    const input = field('가용 자원 10개 중 학습 활동에 배분할 수', 'input', '0–10');
    input.input.type = 'number'; input.input.min = '0'; input.input.max = '10'; input.input.value = '5';
    const result = el('div', 'lp-score-result');
    const check = button('규칙 확인');
    check.onclick = () => {
      const value = Number(input.input.value);
      result.textContent = Number.isFinite(value) && value >= 0 && value <= 10 ? `활동 ${value} · 남은 자원 ${10 - value}` : '0부터 10 사이의 수를 입력해 주세요.';
    };
    panel.append(el('p', 'lp-sample-label', '예시 판정 · 반복 계산을 화면에 맡기기'), input.wrap, check, result);
    check.click();
  }
  if (kind === 'evidence') {
    const result = el('p', 'lp-evidence-result', '자료를 선택하면 판단 기준을 확인합니다.');
    const list = el('div', 'lp-evidence-list');
    [
      ['기관의 원자료', '출처와 작성 시점이 확인되는 자료입니다.', true],
      ['출처 없는 요약 이미지', '원자료를 먼저 확인해야 합니다.', false],
      ['날짜가 표시된 지역 통계', '질문과 시점이 맞는지 확인할 수 있습니다.', true],
    ].forEach(([title, copy, useful]) => {
      const item = button(title, 'lp-evidence');
      item.onclick = () => { result.textContent = `${copy} ${useful ? '판단의 근거 후보로 남깁니다.' : '근거 후보에서 잠시 뺍니다.'}`; item.setAttribute('aria-pressed', String(useful)); };
      list.append(item);
    });
    panel.append(el('p', 'lp-sample-label', '예시 자료 · 주장을 바꿀 수 있는 증거 찾기'), list, result);
  }
  if (kind === 'graph') {
    const range = field('변수 x', 'input');
    range.input.type = 'range'; range.input.min = '1'; range.input.max = '10'; range.input.value = '5';
    const value = el('output', 'lp-graph-value');
    const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    graph.setAttribute('viewBox', '0 0 600 230');
    graph.setAttribute('role', 'img');
    graph.setAttribute('aria-label', '변수 x와 결과 y의 예시 관계 그래프');
    graph.classList.add('lp-graph');
    graph.innerHTML = '<path class="lp-axis" d="M55 20V190H570"/><path class="lp-curve" d="M55 180 Q260 170 570 35"/><circle class="lp-point" r="10"/><text x="565" y="215">x</text><text x="25" y="28">y</text>';
    const point = graph.querySelector('.lp-point');
    const draw = () => {
      const x = Number(range.input.value);
      const px = 55 + x / 10 * 515;
      const py = 180 - Math.pow(x / 10, 2) * 145;
      point.setAttribute('cx', px); point.setAttribute('cy', py);
      value.textContent = `x ${x} → y 약 ${Math.round(Math.pow(x, 2))}`;
    };
    range.input.oninput = draw;
    panel.append(el('p', 'lp-sample-label', '예시 모형 · 정확한 현상 모사가 아닌 관계 관찰용'), range.wrap, value, graph);
    draw();
  }
  return panel;
}

export function classroomInteraction(kind) {
  const panel = el('div', `lp-classroom-demo lp-classroom-${kind}`);
  const result = el('output', 'lp-classroom-result');
  result.setAttribute('aria-live', 'polite');
  const signal = el('span', 'lp-classroom-signal', '→');
  signal.setAttribute('aria-hidden', 'true');
  const pulse = () => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      signal.animate([{ opacity: .3, transform: 'scale(.75)' }, { opacity: 1, transform: 'scale(1.25)' }, { opacity: .7, transform: 'scale(1)' }], { duration: 450 });
    }
  };
  const input = el('div', 'lp-classroom-input');
  const visual = el('div', 'lp-classroom-visual');
  const flow = el('div', 'lp-classroom-flow');
  flow.append(input, signal, visual);

  if (kind === 'aggregate') {
    const labels = ['A 예상', 'B 예상', '아직 모름'];
    const counts = [6, 8, 4];
    input.append(el('h4', '', '학생이 답을 누르면'));
    visual.append(el('h4', '', '우리 반의 생각이 모입니다'));
    const bars = el('div', 'lp-classroom-bars');
    const rows = labels.map(label => {
      const row = el('div', 'lp-classroom-bar');
      const track = el('div', 'lp-classroom-track');
      const fill = el('span', 'lp-classroom-fill');
      const number = el('b');
      track.append(fill); row.append(el('span', '', label), track, number); bars.append(row);
      return { fill, number };
    });
    const draw = () => {
      const total = counts.reduce((sum, count) => sum + count, 0);
      rows.forEach(({ fill, number }, index) => {
        fill.style.width = `${counts[index] / total * 100}%`;
        number.textContent = `${counts[index]}명`;
      });
      result.textContent = `예시 ${total}명 · ${labels.map((label, i) => `${label} ${counts[i]}명`).join(' / ')}`;
    };
    labels.forEach((label, index) => {
      const choice = button(`${label} +1`, 'lp-classroom-choice');
      choice.onclick = () => { counts[index]++; draw(); pulse(); };
      input.append(choice);
    });
    visual.append(bars);
    draw();
  }

  if (kind === 'branch') {
    input.append(el('h4', '', '지금 나의 이해도는?'));
    visual.append(el('h4', '', '선택에 맞는 다음 과제'));
    const routes = el('div', 'lp-classroom-routes');
    const options = [
      ['아직 헷갈려요', '개념 다시 보기', '벽과 기둥 중 어느 부분이 건물의 무게를 받는지 다시 찾아보세요.'],
      ['이해했어요', '새 문제 도전', '기둥의 위치는 유지하고 내부 벽만 옮기면, 어떤 공간을 만들 수 있을까요?'],
    ];
    const task = el('p', 'lp-classroom-task', '왼쪽에서 이해도를 골라보세요.');
    const choices = [], cards = [];
    options.forEach(([label, title, question], index) => {
      const choice = button(label, 'lp-classroom-choice');
      choice.setAttribute('aria-pressed', 'false');
      const card = el('div', 'lp-classroom-route');
      card.append(el('span', 'lp-classroom-route-line'), el('strong', '', title));
      card.dataset.active = 'false';
      choices.push(choice); cards.push(card);
      choice.onclick = () => {
        choices.forEach((node, i) => node.setAttribute('aria-pressed', String(i === index)));
        cards.forEach((node, i) => { node.dataset.active = String(i === index); });
        task.textContent = question;
        result.textContent = `${label} → ${title}`;
        pulse();
      };
      input.append(choice); routes.append(card);
    });
    visual.append(routes, task);
    result.textContent = '예시 · 선택을 바꾸면 다음 과제도 바뀝니다.';
  }

  if (kind === 'graph') {
    input.append(el('h4', '', '수요·공급을 움직이면'));
    visual.append(el('h4', '', '균형가격과 거래량이 달라집니다'));
    const svgNode = (tag, attrs = {}, text) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svg = svgNode('svg', { viewBox: '0 0 360 300', role: 'img', class: 'lp-market-graph' });
    const plot = svgNode('svg', { x: 46, y: 24, width: 280, height: 220, viewBox: '0 0 280 220' });
    plot.append(svgNode('path', { class: 'lp-market-grid', d: 'M70 0V220 M140 0V220 M210 0V220 M0 55H280 M0 110H280 M0 165H280' }));
    const curves = {}, originals = {}, labels = {}, choices = [];
    for (const [curve, path, labelY] of [['D', 'M0 0L280 220', 190], ['S', 'M0 220L280 0', 40]]) {
      originals[curve] = svgNode('path', { class: 'lp-market-old', d: path });
      curves[curve] = svgNode('g', { class: `lp-market-curve lp-market-${curve.toLowerCase()}` });
      labels[curve] = svgNode('text', { x: 212, y: labelY }, curve);
      curves[curve].append(svgNode('path', { d: path }), labels[curve]);
      plot.append(originals[curve], curves[curve]);
    }
    const oldPoint = svgNode('circle', { class: 'lp-market-old-point', cx: 140, cy: 110, r: 4 });
    const oldLabel = svgNode('text', { class: 'lp-market-old-label', x: 147, y: 128 }, 'E₀');
    const guides = svgNode('path', { class: 'lp-market-guides' });
    const point = svgNode('g', { class: 'lp-market-equilibrium' });
    point.append(svgNode('circle', { cx: 140, cy: 110, r: 5 }), svgNode('text', { x: 148, y: 103 }, 'E'));
    plot.append(guides, oldPoint, oldLabel, point);
    svg.append(plot, svgNode('path', { class: 'lp-market-axis', d: 'M46 18V244H332' }), svgNode('text', { x: 8, y: 18 }, '가격 P'), svgNode('text', { x: 250, y: 280 }, '거래량 Q'), svgNode('text', { x: 28, y: 260 }, '0'));
    visual.append(svg);
    const moves = [['D-L', '수요 감소', -16, 0], ['D-R', '수요 증가', 16, 0], ['S-L', '공급 감소', 0, -16], ['S-R', '공급 증가', 0, 16]];
    const draw = (move = '') => {
      const [, name = '처음', demand = 0, supply = 0] = moves.find(item => item[0] === move) || [];
      // P = 100 - Q + demand, P = Q - supply.
      const quantity = (100 + demand + supply) / 2, price = quantity - supply;
      for (const [curve, shift] of [['D', demand], ['S', supply]]) {
        curves[curve].style.transform = `translateX(${shift * 2.8}px)`;
        originals[curve].setAttribute('visibility', shift === 0 ? 'hidden' : 'visible');
        labels[curve].textContent = curve + (shift ? '′' : '');
      }
      point.style.transform = `translate(${(quantity - 50) * 2.8}px, ${(50 - price) * 2.2}px)`;
      guides.setAttribute('d', `M${quantity * 2.8} 220V${(100 - price) * 2.2}H0`);
      [oldPoint, oldLabel].forEach(node => node.setAttribute('visibility', move ? 'visible' : 'hidden'));
      choices.forEach(node => node.setAttribute('aria-pressed', String(node.dataset.move === move)));
      svg.setAttribute('aria-label', `${name}: 균형가격 ${price}, 균형거래량 ${quantity}. 이동 전 가격과 거래량은 모두 50.`);
      result.textContent = `예시 모형 · ${name} · 균형가격 50${move ? ` → ${price}` : ''} · 균형거래량 50${move ? ` → ${quantity}` : ''}`;
    };
    for (const [curve, title] of [['D', '수요'], ['S', '공급']]) {
      const group = el('div', `lp-market-controls lp-market-${curve.toLowerCase()}`);
      group.setAttribute('role', 'group');group.setAttribute('aria-label', `${title} 이동`);
      group.append(el('strong', '', title));
      moves.filter(([move]) => move.startsWith(curve)).forEach(([move, name]) => {
        const choice = button(move.endsWith('L') ? '← 감소' : '증가 →', 'lp-classroom-choice');
        choice.dataset.move = move;choice.setAttribute('aria-label', name);
        choice.onclick = () => { draw(move);pulse(); };
        choices.push(choice);group.append(choice);
      });
      input.append(group);
    }
    const reset = button('처음으로', 'lp-classroom-choice lp-market-reset');
    reset.onclick = () => { draw();pulse(); };input.append(reset);
    draw();
  }
  panel.append(flow, result);
  return panel;
}

function freedomsLab() {
  const { lab, stage } = labShell('다섯 가지 자유', '질문을 눌러 직접 작동시켜 보기', '각 실험은 수업 설계 원리를 보여 주는 작은 예시입니다.');
  const tabs = el('div', 'lp-freedom-tabs');
  const panelHost = el('div');
  freedomData.forEach(([title, copy, kind], index) => {
    const tab = button(`${title}?`, 'lp-freedom-tab');
    tab.setAttribute('aria-pressed', String(index === 0));
    tab.onclick = () => {
      tabs.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', 'false'));
      tab.setAttribute('aria-pressed', 'true');
      panelHost.replaceChildren(el('h3', '', title), el('p', 'lp-panel-copy', copy), freedomPanel(kind));
    };
    tabs.append(tab);
    if (index === 0) tab.click();
  });
  stage.append(tabs, panelHost);
  return lab;
}

function conditionsLab() {
  const { lab, stage } = labShell('수업 준비 점검', '기기보다 먼저 확인할 것', '네 항목을 확인하면 다음 준비가 필요한 지점을 바로 볼 수 있습니다.');
  const items = [
    ['학습 목표', '화면이 요구할 학생의 사고를 한 문장으로 정했다.'],
    ['접속 환경', '학생 기기와 학교 네트워크에서 열어 봤다.'],
    ['개인정보', '꼭 필요한 정보만 받고 공개 범위를 정했다.'],
    ['교사 운영', '시작·중지·결과 공개 방법을 정했다.'],
  ];
  const status = el('div', 'lp-readiness');
  const checks = items.map(([name, copy]) => {
    const label = el('label', 'lp-check');
    const input = el('input'); input.type = 'checkbox';
    label.append(input, el('span', '', name), el('small', '', copy));
    stage.append(label);
    return input;
  });
  const update = () => {
    const done = checks.filter(item => item.checked).length;
    status.textContent = done === 4 ? '4/4 · 수업 장면을 작게 시험해 볼 준비가 되었습니다.' : `${done}/4 · 다음으로 확인할 항목: ${items[checks.findIndex(item => !item.checked)]?.[0] || ''}`;
    status.style.setProperty('--ready', `${done / 4 * 100}%`);
  };
  checks.forEach(item => item.onchange = update);
  stage.prepend(status);
  update();
  return lab;
}

function basicsLab() {
  const { lab, stage } = labShell('작동 경로', '한 번의 입력이 지나가는 네 자리', '각 자리를 눌러 학생의 입력이 어디로 이동하는지 따라가 보세요.');
  const flow = el('div', 'lp-system-flow');
  const explanation = el('div', 'lp-output');
  [
    ['프론트엔드', '학생이 예상과 근거를 입력합니다.'],
    ['서버', '입력을 받고 정해 둔 규칙을 처리합니다.'],
    ['저장소', '응답과 진행 상태를 남깁니다.'],
    ['대시보드', '교사가 학급 분포를 보고 공개를 제어합니다.'],
  ].forEach(([name, copy], index) => {
    const step = button(name, 'lp-flow-step');
    step.onclick = () => {
      flow.querySelectorAll('button').forEach((item, itemIndex) => item.setAttribute('aria-current', itemIndex <= index ? 'step' : 'false'));
      explanation.replaceChildren(el('span', 'lp-output-label', `${index + 1} / 4`), el('p', '', copy));
    };
    flow.append(step);
    if (index === 0) step.click();
  });
  const role = field('누가, 언제?', 'input', '예: 학생 30명이 실험 전에');
  const action = field('무엇을 하나요?', 'input', '예: 예상과 이유를 입력한다');
  const response = field('화면은 어떻게 반응하나요?', 'input', '예: 전체 분포를 보여준다');
  const prompt = el('div', 'lp-prompt-output');
  const build = () => {
    const values = [role, action, response].map(item => item.input.value.trim());
    prompt.textContent = values.every(Boolean) ? `${values[0]} ${values[1]}. 화면은 ${values[2]}. 교사는 시작과 결과 공개를 제어한다.` : '세 칸을 채우면 코딩 에이전트에 전달할 첫 요청이 만들어집니다.';
  };
  [role, action, response].forEach(item => item.input.oninput = build);
  stage.append(flow, explanation, el('h3', 'lp-subhead', '수업 장면을 요청문으로 바꾸기'), role.wrap, action.wrap, response.wrap, prompt);
  build();
  return lab;
}

const ticketLevels = ['잘 이해했어요', '조금 헷갈려요', '다시 배우고 싶어요'];

export function summarizeTickets(tickets) {
  const counts = [0, 0, 0];
  for (const ticket of tickets) {
    if (Number.isInteger(ticket.level) && ticket.level >= 0 && ticket.level < counts.length) counts[ticket.level] += 1;
  }
  return counts;
}

function basicsStudio() {
  const lessons = [
    {
      title: '학생이 쓸 화면이 없다',
      wish: '종이로 받던 퇴장 티켓을 학생이 휴대전화에서 작성하게 만들고 싶습니다.',
      prompt: '수업 끝에 학생이 이해도를 세 가지 중 하나로 고르고 남은 질문을 적는 퇴장 티켓 화면을 만들어줘. 이해도를 고르지 않으면 안내해줘.',
      concept: '프론트엔드',
      explanation: '학생이 보고 누르는 화면입니다. 버튼을 누르면 선택이 표시되고, 입력이 빠졌다면 화면에서 바로 알려줍니다.',
    },
    {
      title: '제출한 답이 사라진다',
      wish: '학생이 화면을 다시 열어도 제출한 답이 남아 있어야 합니다.',
      prompt: '제출한 이해도와 질문을 저장해줘. 화면은 API로 서버에 응답을 보내고, 다시 열 때 저장된 응답을 불러오게 해줘.',
      concept: '서버와 데이터베이스',
      explanation: '브라우저는 API라는 약속으로 서버에 응답을 보냅니다. 서버의 백엔드가 처리해 데이터베이스에 남기고, 다시 열 때 읽어 옵니다.',
    },
    {
      title: '답은 모였지만 읽기 어렵다',
      wish: '선생님이 전체 이해도와 남은 질문을 한눈에 보고 다음 수업을 정하고 싶습니다.',
      prompt: '저장된 학생 응답을 교사용 화면에 보여줘. 이해도별 인원과 학생들이 남긴 질문을 함께 볼 수 있게 구성해줘.',
      concept: '교사 대시보드',
      explanation: '같은 저장 데이터를 교사의 판단에 맞게 다시 보여 주는 화면입니다. 학생 입력, 저장, 교사 확인이 하나의 웹앱으로 이어집니다.',
    },
  ];
  const tickets = [
    { level: 0, question: '' },
    { level: 0, question: '' },
    { level: 1, question: '분모가 다를 때 왜 통분하나요?' },
    { level: 2, question: '분수를 더하는 순서를 다시 보고 싶어요.' },
  ];
  const browserChrome = '<div class="lp-win-titlebar" aria-hidden="true"><div class="lp-win-tab"><span class="lp-win-favicon">T</span><span>수업 마무리 티켓</span><span class="lp-win-tab-close">×</span></div><div class="lp-win-controls"><span>─</span><span>□</span><span>×</span></div></div><div class="lp-win-toolbar" aria-hidden="true"><span>←</span><span>→</span><span>↻</span><div class="lp-win-address"><span>ⓘ</span><span>classroom.example/exit-ticket</span></div><span>⋯</span></div><div class="lp-win-demo-tag">가상 실습 페이지 · 실제 사이트와 연결되지 않습니다</div>';
  const studio = el('section', 'lp-basics');
  studio.id = 'basics-demo';
  studio.innerHTML = [
    '<nav class="lp-build-toc" aria-label="실습 목차"><div class="lp-build-toc-heading"><span>실습 목차</span><p>한 가지 앱을 세 번 고칩니다</p></div><div class="lp-build-steps" role="group" aria-label="제작 단계"><button type="button" data-lesson="0"><small>01</small>학생 화면</button><button type="button" data-lesson="1"><small>02</small>응답 저장</button><button type="button" data-lesson="2"><small>03</small>교사 화면</button></div></nav>',
    '<div class="lp-build-sequence">',
    '<section class="lp-build-preview lp-build-before" aria-label="비포 화면"><div class="lp-build-preview-head"><span>BEFORE · 지금 화면</span><strong data-before-title></strong></div><div class="lp-build-browser">' + browserChrome + '<div class="lp-build-surface" data-before-surface></div></div></section>',
    '<div class="lp-build-arrow" aria-hidden="true"><span>↓</span></div>',
    '<section class="lp-build-writing" aria-label="문제 상황과 프롬프트"><div class="lp-build-writing-inner"><span class="lp-build-step-label" data-step-label></span><h3 data-title></h3><div class="lp-build-wish"><span>고치고 싶은 점</span><p data-wish></p></div><label for="lp-build-prompt">AI에게 어떻게 요청할까요?</label><textarea id="lp-build-prompt" rows="5" maxlength="600" placeholder="고칠 화면과 바뀌어야 할 동작을 적어 보세요."></textarea><button type="button" class="lp-build-example" data-example>예시 프롬프트 보기</button><div class="lp-build-actions"><button type="button" data-run>예시 결과 화면 보기 ↓</button><p class="lp-build-message" data-message role="status"></p></div></div></section>',
    '<section class="lp-build-preview lp-build-after" data-after hidden aria-label="애프터 화면"><div class="lp-build-preview-head"><span>AFTER · 달라진 화면</span><strong data-after-title></strong></div><div class="lp-build-browser">' + browserChrome + '<div class="lp-build-surface" data-after-surface></div></div><div class="lp-build-concept" data-concept><span>이번에 배운 개념</span><strong></strong><p></p></div><button type="button" class="lp-build-next" data-next>다음 장면으로 →</button></section>',
    '</div><p class="lp-build-footnote">준비된 결과 화면을 보여 주는 시뮬레이션입니다. 작성한 프롬프트와 응답은 AI나 서버로 전송되지 않으며, 페이지를 닫으면 사라집니다.</p>',
  ].join('');

  const prompt = studio.querySelector('#lp-build-prompt');
  const beforeSurface = studio.querySelector('[data-before-surface]');
  const afterSurface = studio.querySelector('[data-after-surface]');
  const message = studio.querySelector('[data-message]');
  const drafts = ['', '', ''];
  const revealed = [false, false, false];
  let current = 0;
  let unlocked = 0;
  let localTicket = null;
  const studentInputs = { before: { level: null, question: '' }, after: { level: null, question: '' } };

  function showStudent(surface, stored, kind) {
    const input = studentInputs[kind];
    surface.innerHTML = [
      '<div class="lp-ticket-app"><span class="lp-ticket-eyebrow">학생용 · 수업 마무리</span><h4>오늘 배운 내용,<br>어느 정도 이해했나요?</h4><p>하나를 선택하고, 남은 질문이 있다면 적어 주세요.</p>',
      '<div class="lp-ticket-levels" role="group" aria-label="이해도 선택"><button type="button" data-level="0">잘 이해했어요</button><button type="button" data-level="1">조금 헷갈려요</button><button type="button" data-level="2">다시 배우고 싶어요</button></div>',
      '<label>남은 질문<textarea rows="2" maxlength="160" placeholder="예: 분모가 다르면 왜 통분하나요?"></textarea></label>',
      '<div class="lp-ticket-row"><button type="button" data-submit>응답 제출</button><button type="button" data-reopen>화면 다시 열기</button></div><p class="lp-ticket-status" data-ticket-status role="status"></p></div>',
    ].join('');
    surface.querySelector('textarea').value = input.question;
    surface.querySelector('textarea').oninput = event => { input.question = event.target.value; };
    surface.querySelectorAll('[data-level]').forEach(item => {
      item.setAttribute('aria-pressed', String(Number(item.dataset.level) === input.level));
      item.onclick = () => {
        input.level = Number(item.dataset.level);
        surface.querySelectorAll('[data-level]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === item)));
      };
    });
    const status = surface.querySelector('[data-ticket-status]');
    status.textContent = stored
      ? '저장된 응답 ' + Math.max(0, tickets.length - 4) + '건 · 화면을 다시 열어도 남아 있습니다.'
      : localTicket ? '방금 제출했습니다. 화면을 다시 열어 확인해 보세요.' : current === 1 ? '이전 화면에서 작성한 응답이 보이지 않습니다.' : '아직 제출한 응답이 없습니다.';
    surface.querySelector('[data-submit]').onclick = () => {
      if (input.level === null) { status.textContent = '먼저 이해도를 선택해 주세요.'; return; }
      const ticket = { level: input.level, question: input.question.trim() };
      if (stored) tickets.push(ticket);
      else localTicket = ticket;
      status.textContent = stored ? '응답이 저장되었습니다. 화면을 다시 열어 확인해 보세요.' : '방금 제출했습니다. 화면을 다시 열어 확인해 보세요.';
    };
    surface.querySelector('[data-reopen]').onclick = () => {
      if (!stored) localTicket = null;
      input.level = null;
      input.question = '';
      showStudent(surface, stored, kind);
    };
  }

  function showRaw(surface) {
    surface.innerHTML = '<div class="lp-raw-view"><span class="lp-ticket-eyebrow">저장된 응답</span><h4>답은 모였지만<br>교사가 볼 화면은 없습니다.</h4><div class="lp-raw-list"></div><p>각 응답을 하나씩 읽어야 학급의 상태를 알 수 있습니다.</p></div>';
    const host = surface.querySelector('.lp-raw-list');
    tickets.slice(-4).reverse().forEach(ticket => {
      const row = el('div');
      row.append(el('span', '', ticketLevels[ticket.level]), el('p', '', ticket.question || '남긴 질문 없음'));
      host.append(row);
    });
  }

  function showDashboard(surface) {
    const counts = summarizeTickets(tickets);
    surface.innerHTML = '<div class="lp-dashboard"><span class="lp-ticket-eyebrow">교사용 · 학급 현황</span><h4>오늘의 퇴장 티켓</h4><p class="lp-dashboard-total">총 <strong data-total></strong>명의 응답</p><div class="lp-dashboard-counts"></div><div class="lp-dashboard-questions"><strong>다음 수업에서 살펴볼 질문</strong><div data-questions></div></div></div>';
    surface.querySelector('[data-total]').textContent = tickets.length;
    const countHost = surface.querySelector('.lp-dashboard-counts');
    counts.forEach((count, index) => {
      const box = el('div');
      box.append(el('span', '', ticketLevels[index]), el('strong', '', count + '명'));
      countHost.append(box);
    });
    const questions = tickets.map(ticket => ticket.question).filter(Boolean).slice(-3).reverse();
    const host = surface.querySelector('[data-questions]');
    if (!questions.length) host.append(el('p', '', '아직 남긴 질문이 없습니다.'));
    else questions.forEach(question => host.append(el('p', '', question)));
  }

  function drawSurface(surface, isAfter) {
    surface.replaceChildren();
    if (!isAfter && current === 0) {
      surface.innerHTML = '<div class="lp-ticket-empty"><span class="lp-ticket-eyebrow">수업 마무리 · 비포</span><h4>오늘 수업은<br>어땠나요?</h4><p>지금은 종이 티켓으로 받습니다. 학생이 휴대전화에서 답할 곳은 아직 없습니다.</p><div aria-hidden="true"><span></span><span></span><span></span></div></div>';
    } else if (current === 2) {
      if (isAfter) showDashboard(surface);
      else showRaw(surface);
    } else {
      showStudent(surface, current === 1 && isAfter, isAfter ? 'after' : 'before');
    }
  }

  function draw() {
    const lesson = lessons[current];
    studio.querySelector('[data-step-label]').textContent = '제작 단계 ' + (current + 1) + ' / 3';
    studio.querySelector('[data-title]').textContent = lesson.title;
    studio.querySelector('[data-wish]').textContent = lesson.wish;
    prompt.value = drafts[current];
    studio.querySelector('[data-before-title]').textContent = ['학생이 입력할 곳이 없는 화면', '다시 열면 답이 사라지는 화면', '한눈에 보기 어려운 응답 목록'][current];
    studio.querySelector('[data-after-title]').textContent = ['학생이 작성하는 화면', '답이 남는 화면', '학급을 보는 교사 화면'][current];
    studio.querySelectorAll('[data-lesson]').forEach((item, index) => {
      item.disabled = index > unlocked;
      item.setAttribute('aria-current', index === current ? 'step' : 'false');
      item.dataset.complete = String(revealed[index]);
    });
    const concept = studio.querySelector('[data-concept]');
    concept.querySelector('strong').textContent = lesson.concept;
    concept.querySelector('p').textContent = lesson.explanation;
    studio.querySelector('[data-after]').hidden = !revealed[current];
    studio.querySelector('[data-next]').hidden = current === 2 || !revealed[current];
    drawSurface(beforeSurface, false);
    if (revealed[current]) drawSurface(afterSurface, true);
  }

  studio.querySelectorAll('[data-lesson]').forEach((item, index) => {
    item.onclick = () => {
      if (index > unlocked) return;
      drafts[current] = prompt.value;
      current = index;
      if (current === 1) localTicket = null;
      studentInputs.before = { level: null, question: '' };
      studentInputs.after = { level: null, question: '' };
      message.textContent = '화면을 보고 이번에 바꿀 점을 프롬프트로 적어 보세요.';
      draw();
    };
  });
  studio.querySelector('[data-example]').onclick = () => {
    prompt.value = lessons[current].prompt;
    drafts[current] = prompt.value;
    prompt.focus();
    message.textContent = '예시를 참고해 문장을 고쳐 써도 됩니다.';
  };
  studio.querySelector('[data-run]').onclick = () => {
    drafts[current] = prompt.value.trim();
    if (!drafts[current]) { message.textContent = '먼저 고치고 싶은 점을 한 문장으로 적어 주세요.'; prompt.focus(); return; }
    revealed[current] = true;
    unlocked = Math.max(unlocked, Math.min(current + 1, 2));
    draw();
    message.textContent = '아래에 준비된 애프터 화면이 나타났습니다. 직접 눌러 보세요.';
    studio.querySelector('[data-after]').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  studio.querySelector('[data-next]').onclick = () => studio.querySelector('[data-lesson="' + (current + 1) + '"]').click();
  message.textContent = '먼저 비포 화면을 살펴보세요.';
  draw();
  return studio;
}

function examplesLab() {
  const { lab, stage } = labShell('사례 비교', '어떤 자유가 수업을 바꾸는가', '사례를 골라 학생 행동과 화면 반응을 나란히 확인하세요.');
  const cases = [
    ['실험 예상', '학생이 결과를 예상하고 이유를 적습니다.', '모으면', '학급 분포와 실제 결과를 함께 보여줍니다.'],
    ['정책 실험', '학생이 제한된 예산에서 정책을 고릅니다.', '반응하면', '선택에 따라 예산과 집단 반응이 달라집니다.'],
    ['지역 탐구', '학생이 지역 문제를 판단할 근거를 고릅니다.', '찾으면', '출처와 시점이 확인된 자료를 비교합니다.'],
    ['변수 탐구', '학생이 변수 사이 관계를 예상합니다.', '보이면', '값을 바꾸면 그래프가 함께 움직입니다.'],
  ];
  const select = el('select');
  select.setAttribute('aria-label', '비교할 수업 사례');
  cases.forEach((item, index) => { const option = el('option', '', item[0]); option.value = index; select.append(option); });
  const comparison = el('div', 'lp-case-comparison');
  const draw = () => {
    const [name, action, freedom, response] = cases[Number(select.value)];
    const before = el('article');
    const after = el('article');
    before.append(el('span', 'lp-output-label', `${name} · 학생`), el('p', '', action));
    after.append(el('span', 'lp-output-label', `${freedom}? · 화면`), el('p', '', response));
    comparison.replaceChildren(before, after);
  };
  select.onchange = draw;
  const apply = field('내 수업에 적용한다면', 'textarea', '학생은 무엇을 하고, 화면은 어떻게 반응하나요?');
  const feedback = el('p', 'lp-live-value', '학생의 행동과 화면의 반응을 함께 적어 보세요.');
  apply.input.oninput = () => { feedback.textContent = apply.input.value.trim().length >= 20 ? '좋습니다. 이제 수업 전에 이 장면 하나만 먼저 시험해 보세요.' : '구체적인 학생 행동과 화면 반응을 한 문장에 담아 보세요.'; };
  stage.append(select, comparison, apply.wrap, feedback);
  draw();
  return lab;
}

function redesignLab() {
  const { lab, stage } = labShell('재설계 렌즈', '한 아이디어를 다섯 번 다르게 보기', '렌즈 하나를 고르고 학생 행동과 화면 반응을 구체화하세요.');
  const lenses = freedomData.map(([title]) => title);
  const picker = el('div', 'lp-choice-row');
  let active = lenses[0];
  const idea = field('처음 아이디어', 'textarea', '처음 떠올린 수업자료나 활동');
  const action = field('학생의 행동', 'textarea', '학생은 무엇을 선택·입력·조작하나요?');
  const reaction = field('화면의 반응', 'textarea', '그 행동에 화면은 어떻게 반응하나요?');
  const output = el('div', 'lp-output');
  const update = () => {
    const filled = [idea, action, reaction].map(item => item.input.value.trim());
    output.replaceChildren(el('span', 'lp-output-label', `${active}? 렌즈로 재설계`), el('p', '', filled.every(Boolean) ? `${filled[0]} — 학생은 ${filled[1]} 화면은 ${filled[2]}` : '세 칸을 채우면 처음 아이디어와 새 설계를 비교할 수 있습니다.'));
  };
  lenses.forEach((name, index) => {
    const choice = button(`${name}?`, 'lp-chip');
    choice.setAttribute('aria-pressed', String(index === 0));
    choice.onclick = () => { active = name; picker.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', 'false')); choice.setAttribute('aria-pressed', 'true'); update(); };
    picker.append(choice);
  });
  [idea, action, reaction].forEach(item => item.input.oninput = update);
  stage.append(picker, idea.wrap, action.wrap, reaction.wrap, output);
  update();
  return lab;
}

function customLab() {
  const { lab, stage } = labShell('생각 정리', '핵심을 내 말로 바꾸기', '배운 내용에서 수업에 가져갈 한 가지를 적어 보세요.');
  const note = field('나의 메모', 'textarea', '오늘 바꿔 보고 싶은 수업 장면');
  const count = el('span', 'lp-live-value', '0자');
  note.input.maxLength = 500;
  note.input.oninput = () => { count.textContent = `${note.input.value.length}/500자`; };
  stage.append(note.wrap, count);
  return lab;
}

const labByExperience = { opening: openingLab, architecture: architectureLab, freedoms: freedomsLab, conditions: conditionsLab, basics: basicsLab, examples: examplesLab, redesign: redesignLab, custom: customLab };

function renderQuiz(section) {
  const article = el('article', 'lp-quiz');
  article.append(el('span', 'lp-section-kind', '빠른 확인'), el('h2', '', section.title), el('p', '', section.body));
  const choices = el('div', 'lp-quiz-options');
  const feedback = el('p', 'lp-quiz-feedback');
  (Array.isArray(section.options) ? section.options : []).forEach((option, index) => {
    const choice = button(option, 'lp-quiz-option');
    choice.onclick = () => {
      choices.querySelectorAll('button').forEach(item => { item.removeAttribute('data-result'); item.disabled = false; });
      const correct = index === Number(section.correctIndex);
      choice.dataset.result = correct ? 'correct' : 'wrong';
      feedback.textContent = `${correct ? '맞았습니다.' : '다시 살펴보세요.'} ${TEXT(section.explanation)}`.trim();
      feedback.dataset.result = correct ? 'correct' : 'wrong';
    };
    choices.append(choice);
  });
  article.append(choices, feedback);
  return article;
}

function renderReflection(section) {
  const article = el('article', 'lp-reflection');
  const note = field(section.prompt || '생각을 적어 보세요.', 'textarea');
  const feedback = el('p', 'lp-live-value', '작성 내용은 이 브라우저 안에만 머뭅니다.');
  note.input.oninput = () => { feedback.textContent = note.input.value.trim() ? '생각을 적었습니다. 다음 내용과 연결해 보세요.' : '작성 내용은 이 브라우저 안에만 머뭅니다.'; };
  article.append(el('span', 'lp-section-kind', '개인 성찰'), el('h2', '', section.title), el('p', '', section.body), note.wrap, feedback);
  return article;
}

function renderLegacy(section, index) {
  const article = el('article', `lp-content lp-content-${section.type}`);
  article.append(el('span', 'lp-section-kind', section.kicker || ({ content: '핵심 내용', video: '함께 보기' }[section.type] || '함께 참여')));
  article.append(el('h2', '', section.title));
  if (section.body) {
    const body = el('div', 'lp-prose');
    TEXT(section.body).split('\n').filter(Boolean).forEach(line => {
      const parts = line.split(/\s+\|\s+/);
      const p = el('p');
      if (parts.length > 1) p.append(el('strong', '', parts.shift()), document.createTextNode(` ${parts.join(' | ')}`));
      else p.textContent = line;
      body.append(p);
    });
    article.append(body);
  }
  if (section.type === 'video') {
    const source = youtubeEmbed(section.videoUrl);
    if (source) {
      const wrap = el('div', 'lp-video');
      const iframe = el('iframe'); iframe.src = source; iframe.title = section.title || '학습 영상'; iframe.loading = 'lazy'; iframe.allowFullscreen = true; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      wrap.append(iframe); article.append(wrap);
    } else article.append(el('p', 'lp-notice', '지원되는 YouTube 영상 주소를 확인해 주세요.'));
  }
  const sourceUrl = safeLink(section.sourceUrl);
  if (sourceUrl) { const link = el('a', 'lp-source', '자료 출처 열기 ↗'); link.href = sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link); }
  if (['postit', 'redesign', 'compare', 'vote'].includes(section.type)) {
    const activity = el('div', 'lp-session-activity');
    activity.dataset.sessionActivity = section.type === 'postit' ? 'initial' : section.type;
    activity.dataset.sectionIndex = index;
    article.append(activity);
  }
  return article;
}

export function mountTransferVisual(transfer) {
  const buttons = [...transfer.querySelectorAll('button')];
  const captions = [...transfer.querySelectorAll('[data-transfer-caption]')];
  const images = [...transfer.querySelectorAll('svg')];
  const descriptions = [
    ['구조벽이 공간의 경계를 고정합니다.', '종이 응답을 걷고 정리해야 합니다.'],
    ['철근콘크리트로 하중 지지와 공간 구획을 나눕니다.', '코딩 에이전트로 응답이 모이는 화면을 직접 만듭니다.'],
  ];
  const show = index => {
    transfer.dataset.mode = index === 0 ? 'before' : 'after';
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    captions.forEach((caption, i) => {
      caption.textContent = descriptions[index][i];
      images[i].setAttribute('aria-label', descriptions[index][i]);
    });
  };
  buttons.forEach((button, index) => { button.onclick = () => show(index); });
  show(0);
}

export function mountArchitectureSlides(story, stopVideo) {
  const nav = story.querySelector('.lp-story-nav');
  const tabs = [...nav.querySelectorAll('button')];
  const slides = [...story.querySelectorAll('.lp-story-section')];
  nav.setAttribute('role', 'tablist');
  let current = -1;

  function show(index) {
    if (index < 0 || index >= slides.length || index === current) return;
    if (current === 0) stopVideo();
    current = index;
    slides.forEach((slide, i) => {
      const selected = i === current;
      slide.hidden = !selected;
      tabs[i].setAttribute('aria-selected', String(selected));
      tabs[i].tabIndex = selected ? 0 : -1;
    });
  }

  tabs.forEach((tab, index) => {
    tab.id = `${slides[index].id}-tab`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', slides[index].id);
    slides[index].setAttribute('role', 'tabpanel');
    slides[index].setAttribute('aria-labelledby', tab.id);
    slides[index].tabIndex = 0;
    tab.onclick = () => show(index);
  });
  nav.onkeydown = event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (index < 0) return;
    event.preventDefault();
    show(index);
    tabs[index].focus();
  };
  const hash = typeof location === 'undefined' ? '' : location.hash;
  show(Math.max(0, slides.findIndex(slide => `#${slide.id}` === hash)));
}

function architectureStory() {
  const story = el('div', 'lp-architecture-story');
  story.innerHTML = `
    <nav class="lp-story-nav" aria-label="건축에서 수업으로"><button type="button">01 영상</button><button type="button">02 구조</button><button type="button">03 다섯 원칙</button><button type="button">04 수업</button></nav>
    <section id="architecture-watch" class="lp-story-section lp-story-watch">
      <div class="lp-story-heading"><span>01 / 함께 보기</span><h2>먼저, 이 집을 보자.</h2><p>르 코르뷔지에의 건축을 살펴본 뒤 한 가지를 질문해 봅시다. 이 형태는 어떤 기술이 있었기에 가능했을까요?</p></div>
      <div class="lp-story-video"></div>
      <p class="lp-story-caption">영상은 2분 49초부터 시작합니다. 재생되지 않으면 <a href="https://youtu.be/Ad-VWkbih1c?t=169" target="_blank" rel="noopener noreferrer">YouTube에서 보기 ↗</a></p>
    </section>
    <section id="architecture-shift" class="lp-story-section lp-story-shift">
      <div class="lp-story-heading"><span>02 / 제약이 바뀌는 순간</span><h2>건물의 무게를<br>벽이 떠받치지 않아도 된다면?</h2><p>철근콘크리트와 기둥·슬래브 구조는 하중을 받는 역할을 벽에서 분리했습니다. 벽의 위치가 공간의 운명을 정하지 않아도 되는 순간, 설계의 선택지가 달라집니다.</p></div>
      <div class="lp-story-lab"></div>
      <p class="lp-story-bridge">새 재료의 의미는 재료 자체의 성능에서 끝나지 않습니다. <strong>이전에는 어려웠던 공간을 설계할 수 있게 된 것</strong>이 핵심입니다.</p>
    </section>
    <section id="architecture-points" class="lp-story-section lp-story-points">
      <div class="lp-story-heading"><span>03 / 새 기술이 열어 준 선택지</span><h2>다섯 원칙은<br>다섯 개의 설계 가능성이다.</h2><p>처음 철근콘크리트로 설계한다면 무엇부터 검토할 수 있을까요? 원칙을 눌러 건물에서 달라진 부분을 확인해 보세요.</p></div>
      <div class="lp-story-explorer">
        <div class="lp-story-point-list" role="group" aria-label="근대 건축의 5원칙"></div>
        <div class="lp-story-point-view">
          <div class="lp-story-diagram lp-story-before">
            <div class="lp-story-diagram-label"><small>BEFORE</small><strong>벽이 하중을 받는 구조</strong></div>
            <svg class="lp-story-building lp-story-house" viewBox="0 0 560 360" role="img" aria-label="내력벽 구조에서 선택한 원칙과 관련된 제약을 강조합니다">
              <rect class="before-sky" width="560" height="360"/>
              <path class="before-ground" d="M0 316H560"/>
              <g class="before-roof"><path d="M88 124L280 48L472 124"/></g>
              <g class="before-floors"><path d="M112 124H448M112 212H448M112 316H448"/></g>
              <g class="before-facade"><path d="M122 124V212M438 124V212"/></g>
              <g class="before-plan"><path d="M280 124V316"/></g>
              <g class="before-groundwall"><path d="M122 212V316M438 212V316"/></g>
              <g class="before-window"><path d="M157 155H219V190H157Z M341 155H403V190H341Z"/></g>
            </svg>
            <svg class="lp-story-building lp-story-special lp-story-plan" viewBox="0 0 560 360" role="img" aria-label="벽식 구조 평면도: 굵은 내력벽이 방을 고정합니다">
              <rect width="560" height="360" fill="#f3eee7"/>
              <rect x="51" y="39" width="458" height="282" fill="#fbf8f2" stroke="#a98d76" stroke-width="20"/>
              <path d="M280 50V310M62 180H280M280 222H498" fill="none" stroke="#df6c43" stroke-width="22"/>
              <text x="280" y="352" text-anchor="middle" fill="#775c4b" font-size="18" font-weight="700">방의 경계를 정하는 내력벽</text>
            </svg>
            <svg class="lp-story-building lp-story-special lp-story-facade" viewBox="0 0 560 360" role="img" aria-label="내력벽 정면도: 하중을 받는 두꺼운 외벽에 작은 창들이 뚫려 있습니다">
              <rect width="560" height="360" fill="#f3eee7"/>
              <rect x="69" y="66" width="422" height="241" fill="#cdb9a4" stroke="#a78b73" stroke-width="11"/>
              <path d="M69 184H491M210 66V307M350 66V307" fill="none" stroke="#b6a18b" stroke-width="5"/>
              <g fill="#f3eee7" stroke="#927761" stroke-width="9"><rect x="105" y="112" width="67" height="70"/><rect x="247" y="112" width="67" height="70"/><rect x="389" y="112" width="67" height="70"/><rect x="246" y="223" width="68" height="84"/></g>
              <path d="M69 307H491" fill="none" stroke="#df6c43" stroke-width="13"/>
              <text x="280" y="351" text-anchor="middle" fill="#775c4b" font-size="18" font-weight="700">외벽 자체가 하중을 지탱</text>
            </svg>
          </div>
          <div class="lp-story-diagram lp-story-after">
            <div class="lp-story-diagram-label"><small>AFTER</small><strong>기둥·슬래브 구조</strong></div>
            <svg class="lp-story-building lp-story-house" viewBox="0 0 560 360" role="img" aria-label="기둥과 슬래브 구조에서 선택한 건축 원칙을 강조합니다">
              <rect class="building-sky" width="560" height="360"/>
              <path class="building-ground" d="M0 316H560"/>
              <g class="building-roof"><path d="M98 76H466V103H98Z"/><path d="M128 75V54M151 75V48M176 75V57M364 75V53M387 75V44M410 75V56"/><path d="M116 75Q139 54 162 75M355 75Q381 47 413 75"/></g>
              <g class="building-slabs"><path d="M106 105H456M106 212H456M106 316H456"/></g>
              <g class="building-pilotis"><path d="M128 213V316M227 213V316M335 213V316M434 213V316"/></g>
              <g class="building-facade"><path d="M106 105V212M456 105V212M187 105V212M375 105V212"/></g>
              <g class="building-window"><path d="M118 137H444V177H118Z"/><path d="M205 137V177M293 137V177M379 137V177"/></g>
              <g class="building-plan"><path d="M227 212V158M335 212V181"/></g>
              <path class="building-path" d="M50 286H490"/>
            </svg>
            <svg class="lp-story-building lp-story-special lp-story-plan" viewBox="0 0 560 360" role="img" aria-label="기둥 구조 평면도: 기둥 사이에서 내부 벽을 자유롭게 배치합니다">
              <rect width="560" height="360" fill="#e7efea"/>
              <rect x="51" y="39" width="458" height="282" fill="#f8fbf8" stroke="#8cae9e" stroke-width="8"/>
              <path d="M168 42V143H347V220M79 225H242V318M352 318V260Q400 210 482 230" fill="none" stroke="#df6c43" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M280 42V185H462" fill="none" stroke="#b9ccbf" stroke-width="6" stroke-dasharray="12 12"/>
              <g fill="#286e59">${[68,280,492].flatMap(x => [56,180,304].map(y => `<circle cx="${x}" cy="${y}" r="13"/>`)).join('')}</g>
              <text x="280" y="352" text-anchor="middle" fill="#2c6a57" font-size="18" font-weight="700">기둥 사이에서 벽 배치를 선택</text>
            </svg>
            <svg class="lp-story-building lp-story-special lp-story-facade" viewBox="0 0 560 360" role="img" aria-label="자유로운 입면 정면도: 기둥 구조 앞에 구조와 독립된 외벽과 창을 배치합니다">
              <rect width="560" height="360" fill="#e7efea"/>
              <g fill="none" stroke="#4e7867" stroke-width="14"><path d="M69 67H491M69 307H491M98 67V307M280 67V307M462 67V307"/></g>
              <path d="M117 104H484V276H79V155Q79 113 117 104Z" fill="#d5e9df" fill-opacity=".87" stroke="#df6c43" stroke-width="8"/>
              <rect x="120" y="151" width="229" height="48" fill="#a3c9c1" stroke="#367a69" stroke-width="5"/>
              <circle cx="406" cy="223" r="29" fill="#a3c9c1" stroke="#367a69" stroke-width="5"/>
              <text x="280" y="352" text-anchor="middle" fill="#2c6a57" font-size="18" font-weight="700">외벽과 창을 구조와 따로 설계</text>
            </svg>
          </div>
          <div class="lp-story-point-copy" aria-live="polite"></div>
        </div>
      </div>
      <p class="lp-story-diagram-note">두 그림은 구조에 따른 설계 선택지를 비교하기 위한 개념도입니다.</p>
      <p class="lp-story-editorial">르 코르뷔지에의 ‘근대 건축의 5원칙’은 새로운 외관을 나열한 목록을 넘어, <strong>새로운 구조가 건축가에게 열어 준 자유</strong>를 읽는 방법이 됩니다.</p>
    </section>
    <section id="architecture-classroom" class="lp-story-section lp-story-classroom">
      <div class="lp-story-heading"><span>04 / 건축에서 수업으로</span><h2>교사에게도<br>비슷한 순간이 왔다.</h2><p>교사는 이전에도 다양한 수업을 상상했습니다. 다만 구현하려면 시간, 기술, 기존 교수매체의 형태라는 장벽을 넘어야 했습니다. 코딩 에이전트는 그 장벽을 낮춥니다.</p></div>
      <div class="lp-story-transfer" aria-label="건축과 수업의 변화 비교">
        <div class="lp-transfer-modes" role="group" aria-label="변화 전후 비교"><button type="button">바뀌기 전</button><button type="button">도구가 바뀐 뒤</button></div>
        <div class="lp-transfer-pair">
          <article class="lp-transfer-card">
            <h4>건축가의 공간</h4>
            <svg viewBox="0 0 360 230" role="img">
              <rect class="lp-transfer-floor" x="35" y="25" width="290" height="180" rx="4"/>
              <g class="lp-transfer-before" aria-hidden="true">
                <path class="lp-transfer-wall" d="M180 25V205 M35 115H325"/>
                <text x="107" y="78">방</text><text x="250" y="78">방</text><text x="107" y="170">방</text><text x="250" y="170">방</text>
              </g>
              <g class="lp-transfer-after" aria-hidden="true">
                <path class="lp-transfer-new-wall" d="M110 25V85H225 M255 205V155"/>
                <g class="lp-transfer-columns">${[48,180,312].flatMap(x => [38,192].map(y => `<circle cx="${x}" cy="${y}" r="8"/>`)).join('')}</g>
                <path class="lp-transfer-open-path" d="M60 168C100 120 150 165 180 125S250 90 295 60"/>
                <text class="lp-transfer-space-label" x="200" y="182">열린 평면</text>
              </g>
            </svg>
            <p data-transfer-caption></p>
          </article>
          <article class="lp-transfer-card">
            <h4>교사의 수업</h4>
            <svg viewBox="0 0 360 230" role="img">
              <g class="lp-transfer-before" aria-hidden="true">
                <g class="lp-transfer-papers">
                  <path d="M116 61L234 47L249 184L131 198Z"/><path d="M106 43L224 55L209 192L91 180Z"/><rect x="119" y="38" width="118" height="148" rx="5"/>
                  <path class="lp-transfer-paper-lines" d="M139 67H214 M139 87H214 M139 107H194 M139 147H204"/>
                </g>
                <text x="180" y="217">걷기 · 분류 · 집계</text>
              </g>
              <g class="lp-transfer-after" aria-hidden="true">
                <path class="lp-transfer-links" d="M66 59L145 105 M294 59L215 105 M66 181L145 132 M294 181L215 132"/>
                <g class="lp-transfer-students">${[[38,30],[266,30],[38,152],[266,152]].map(([x,y]) => `<rect x="${x}" y="${y}" width="56" height="58" rx="8"/><path d="M${x+14} ${y+19}h28 M${x+14} ${y+30}h20 M${x+14} ${y+41}h24"/>`).join('')}</g>
                <rect class="lp-transfer-dashboard" x="126" y="72" width="108" height="94" rx="10"/>
                <g class="lp-transfer-dashboard-bars"><rect x="143" y="119" width="15" height="29" rx="3"/><rect x="173" y="99" width="15" height="49" rx="3"/><rect x="203" y="110" width="15" height="38" rx="3"/></g>
                <text x="180" y="217">응답이 모이는 화면</text>
              </g>
            </svg>
            <p data-transfer-caption></p>
          </article>
        </div>
      </div>
      <div class="lp-story-studio">
        <div class="lp-story-studio-heading"><h3>학생의 행동이 화면을 바꾼다면?</h3><p>세 가지 수업 장면을 직접 시험해 보세요. 예시는 저장되지 않습니다.</p></div>
        <div class="lp-story-case-list" role="group" aria-label="수업 장면 고르기"></div>
        <div class="lp-story-case-view"></div>
      </div>
      <div class="lp-story-question"><span>그래서 질문은</span><p class="lp-story-old-question">“AI로 무엇을 만들 수 있는가?”</p><strong>“이제 어떤 수업을 설계할 수 있게 되었는가?”</strong></div>
      <p class="lp-story-sources">건축 설명 자료: <a href="https://www.fondationlecorbusier.fr/dossier-thematique/vocabulaire-corbuseen/" target="_blank" rel="noopener noreferrer">Fondation Le Corbusier · Les cinq points ↗</a></p>
    </section>`;

  const video = story.querySelector('.lp-story-video');
  const play = button('', 'lp-story-video-play');
  const poster = el('img');
  poster.src = '/studies/architecture-video-thumb-max.jpg';
  poster.alt = '';
  poster.loading = 'lazy';
  play.append(poster, el('span', '', '▶  이 페이지에서 영상 재생'));
  play.onclick = () => {
    const iframe = el('iframe');
    iframe.src = `${youtubeEmbed('https://youtu.be/Ad-VWkbih1c?t=169')}&autoplay=1`;
    iframe.title = '근대 건축의 5원칙 함께 보기';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    video.replaceChildren(iframe);
  };
  video.append(play);
  story.querySelector('.lp-story-lab').append(architectureLab());

  const points = [
    ['필로티', '지상층까지 이어지는 내력벽 때문에 아래 공간을 활짝 비우기 어려웠습니다.', '건물을 기둥 위에 올리면 지상층이 열린다.', '땅 위의 공간을 보행과 정원에 돌려줄 수 있습니다.'],
    ['옥상 정원', '경사진 지붕에서는 옥상을 생활 공간으로 쓰기 어려웠습니다.', '평평한 지붕이 새로운 생활 공간이 된다.', '지붕 위에 정원과 휴식 공간을 계획할 수 있습니다.'],
    ['자유로운 평면', '하중을 받는 내부 벽이 방의 위치와 크기를 제한했습니다.', '내부 벽이 하중을 떠받칠 필요가 줄어든다.', '방의 경계를 생활 방식에 맞게 더 자유롭게 정할 수 있습니다.'],
    ['수평창', '하중을 받는 외벽에는 길고 연속된 창을 내기 어려웠습니다.', '구조에 매이지 않은 외벽에 긴 창을 낸다.', '빛과 시야를 가로로 길게 끌어들일 수 있습니다.'],
    ['자유로운 입면', '외벽이 하중을 맡아 바깥 모습을 구조와 따로 설계하기 어려웠습니다.', '외벽을 구조와 분리해 다룰 수 있다.', '건물의 바깥 모습을 구조벽의 위치와 별도로 설계할 수 있습니다.'],
  ];
  const list = story.querySelector('.lp-story-point-list');
  const view = story.querySelector('.lp-story-point-view');
  const copy = story.querySelector('.lp-story-point-copy');
  const beforeLabel = story.querySelector('.lp-story-before .lp-story-diagram-label strong');
  const afterLabel = story.querySelector('.lp-story-after .lp-story-diagram-label strong');
  points.forEach(([name, constraint, idea, possibility], index) => {
    const item = button(`${String(index + 1).padStart(2, '0')}  ${name}`, 'lp-story-point-button');
    item.setAttribute('aria-pressed', String(index === 0));
    item.onclick = () => {
      list.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === item)));
      view.dataset.point = String(index + 1);
      beforeLabel.textContent = index === 2 ? '내력벽이 고정한 평면' : index === 4 ? '하중을 받는 외벽' : '벽이 하중을 받는 구조';
      afterLabel.textContent = index === 2 ? '기둥 사이의 자유로운 평면' : index === 4 ? '구조와 분리한 외벽' : '기둥·슬래브 구조';
      const comparison = el('div', 'lp-story-point-contrast');
      const before = el('div'); before.append(el('b', '', '이전 · 벽식 구조'), el('p', '', constraint));
      const after = el('div'); after.append(el('b', '', '이후 · 기둥·슬래브'), el('p', '', possibility));
      comparison.append(before, after);
      copy.replaceChildren(el('small', '', `${String(index + 1).padStart(2, '0')} / 05`), el('h3', '', name), el('p', 'lp-story-point-idea', idea), comparison);
    };
    list.append(item);
    if (index === 0) item.click();
  });
  const cases = [['생각 모으기', 'aggregate'], ['선택에 반응하기', 'branch'], ['변수 움직이기', 'graph']];
  const caseList = story.querySelector('.lp-story-case-list');
  const caseView = story.querySelector('.lp-story-case-view');
  const scenes = cases.map(([label, kind]) => {
    const scene = classroomInteraction(kind);
    scene.setAttribute('role', 'region');
    scene.setAttribute('aria-label', label);
    caseView.append(scene);
    return scene;
  });
  cases.forEach(([label], index) => {
    const item = button(label, 'lp-story-case-button');
    item.onclick = () => {
      caseList.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === item)));
      scenes.forEach((scene, i) => { scene.hidden = i !== index; });
    };
    caseList.append(item);
    if (index === 0) item.click();
  });
  mountTransferVisual(story.querySelector('.lp-story-transfer'));
  mountArchitectureSlides(story, () => { if (video.querySelector('iframe')) video.replaceChildren(play); });
  return story;
}

export function renderLearningPage(target, page, { resourceCardsOnly = false } = {}) {
  if (!(target instanceof Element)) throw new TypeError('renderLearningPage target must be a DOM Element.');
  const data = page && typeof page === 'object' ? page : {};
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const theme = ['sage', 'clay', 'blue', 'gold'].includes(data.theme) ? data.theme : 'blue';
  const experience = labByExperience[data.experience] ? data.experience : 'custom';
  const isBasics = data.id === 'page-15ed1180b965';
  const isArchitecture = data.id === 'page-cdd378b10c79';
  const isResources = data.id === 'page-20eeb5cdab19';
  const resources = isResources ? parseResourceLinks(data.content) : null;
  const root = el('main', `learning-page lp-theme-${theme}${sections.length || isBasics || isArchitecture || isResources ? '' : ' lp-standalone'}${isBasics ? ' lp-basics-page' : ''}${isArchitecture ? ' lp-architecture-page' : ''}${isResources ? ' lp-resource-page' : ''}`);

  const hero = el('header', 'lp-page-intro');
  const overview = el('div', 'lp-page-overview');
  overview.append(el('p', '', isArchitecture ? '철근콘크리트가 건축가에게 열어 준 가능성을 살펴보고, 코딩 에이전트가 교사의 수업 설계에 던지는 질문으로 이어갑니다.' : isBasics ? '수업 마무리 티켓을 세 번의 프롬프트로 고쳐 보며 학생 화면, 응답 저장, 교사 대시보드가 어떻게 이어지는지 확인합니다.' : resources ? resources.intro || '직접 만든 자료들을 모아 공유합니다.' : data.content || data.description || '소개할 내용을 준비 중입니다.'));
  hero.append(el('h1', '', data.title || '학습 페이지'), overview);

  if (data.id === 'page-9eb2deff689d') {
    root.classList.remove('lp-standalone');
    root.classList.add('lp-tools-page');
    root.append(hero, toolConnectionLab());
    target.replaceChildren(root);
    return root;
  }

  if (data.id === HTML_LAB_PAGE_ID) {
    root.classList.remove('lp-standalone');root.classList.add('lp-html-page');
    hero.querySelector('h1').textContent = 'HTML에서 웹 프로젝트까지';
    overview.hidden = true;
    root.append(hero, webProjectLab());target.replaceChildren(root);return root;
  }

  if (data.id === 'page-b6afb8c12a41') {
    root.classList.remove('lp-standalone');
    root.classList.add('lp-red-brick-page');
    const comparison = el('div', 'lp-red-brick-comparison');
    comparison.setAttribute('role', 'region');
    comparison.setAttribute('aria-label', 'Before와 After 비교');
    const controls = el('div', 'lp-red-brick-controls');
    controls.setAttribute('role', 'tablist');
    controls.setAttribute('aria-label', '비교할 버전');
    const tabs = [button('Before'), button('After')];
    controls.append(...tabs);
    const before = el('section', 'lp-red-brick-panel');
    const after = el('section', 'lp-red-brick-panel');
    const frame = el('iframe', 'lp-red-brick-frame');
    frame.src = '/studies/red-brick/index.html';
    frame.title = 'Before — 빨간 벽돌집 짓기 교사 대시보드';
    frame.onload = () => {
      const doc = frame.contentDocument;
      doc.documentElement.classList.add('workshop-embed');
      const modal = doc.querySelector('#restoreModal .modal');
      const resize = () => {
        if (!frame.getClientRects().length) return;
        const height = Math.max(doc.body.getBoundingClientRect().height, modal.getBoundingClientRect().height + 64);
        frame.style.height = `${Math.ceil(height) + 2}px`;
      };
      const observer = new ResizeObserver(resize);
      observer.observe(doc.body);
      observer.observe(modal);
      resize();
    };
    const source = el('a', 'lp-red-brick-source', 'GitHub 원본 ↗');
    source.href = 'https://github.com/yadoran-2025/rice-basket/red-brick/tree/446b6e026a500456467e4e7f16b153d401ad55ca';
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    before.append(frame, source);
    const afterFrame = el('iframe', 'lp-red-brick-frame');
    afterFrame.src = 'https://yadoran-2025.github.io/red-brick/#setup';
    afterFrame.title = 'After — 빨간 벽돌집 짓기 교사 대시보드';
    afterFrame.loading = 'lazy';
    afterFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    const afterLink = el('a', 'lp-red-brick-source', '새 창으로 열기 ↗');
    afterLink.href = afterFrame.src;
    afterLink.target = '_blank';
    afterLink.rel = 'noopener noreferrer';
    const student = el('section', 'lp-red-brick-student');
    student.append(el('h3', '', '학생 화면'));
    const connect = el('form', 'lp-red-brick-student-connect');
    const studentLabel = el('label', '', '교사 화면의 ‘학생 화면 열기’ 링크 주소');
    const studentAddress = el('input');
    studentAddress.type = 'url'; studentAddress.required = true; studentAddress.maxLength = 2048;
    studentAddress.placeholder = '학생 화면 링크 주소 붙여넣기';
    studentLabel.append(studentAddress);
    const connectButton = button('연결'); connectButton.type = 'submit';
    const studentStatus = el('p', 'lp-red-brick-student-status');
    studentStatus.setAttribute('role', 'status');
    connect.append(studentLabel, connectButton);
    const studentFrame = el('iframe', 'lp-red-brick-frame');
    studentFrame.src = 'https://yadoran-2025.github.io/rice-basket/red-brick/rice-basket/?student=1#auction';
    studentFrame.title = 'After — 빨간 벽돌집 짓기 학생 화면';
    studentFrame.loading = 'lazy';
    studentFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    connect.onsubmit = event => {
      event.preventDefault();
      try { studentFrame.src = redBrickStudentUrl(studentAddress.value); studentStatus.textContent = '학생 화면을 연결했습니다.'; }
      catch { studentStatus.textContent = '교사 화면의 ‘학생 화면 열기’ 링크 주소를 복사해 붙여 넣어 주세요.'; }
    };
    student.append(connect, studentStatus, studentFrame);
    after.append(afterFrame, afterLink, student);
    const slides = [before, after];
    tabs.forEach((tab, index) => {
      tab.id = `red-brick-tab-${index}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `red-brick-panel-${index}`);
      slides[index].id = `red-brick-panel-${index}`;
      slides[index].setAttribute('role', 'tabpanel');
      slides[index].setAttribute('aria-labelledby', tab.id);
      slides[index].tabIndex = 0;
      tab.onclick = () => show(index);
    });
    let current = -1;
    const show = index => {
      if (index < 0 || index >= slides.length || index === current) return;
      current = index;
      slides.forEach((slide, position) => {
        const selected = position === current;
        slide.hidden = !selected;
        tabs[position].setAttribute('aria-selected', String(selected));
        tabs[position].tabIndex = selected ? 0 : -1;
      });
    };
    controls.onkeydown = event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (index < 0) return;
      event.preventDefault();
      show(index);
      tabs[index].focus();
    };
    comparison.append(controls, before, after);
    show(0);
    root.append(hero, comparison);
    target.replaceChildren(root);
    return root;
  }

  if (isResources) {
    root.append(hero, resourceGallery(resources.links, resourceCardsOnly));
    target.replaceChildren(root);
    return root;
  }

  if (isArchitecture) {
    root.append(hero, architectureStory());
    target.replaceChildren(root);
    return root;
  }

  if (isBasics) {
    root.append(hero, basicsStudio());
    target.replaceChildren(root);
    return root;
  }

  if (!sections.length) {
    root.append(hero);
    target.replaceChildren(root);
    return root;
  }

  const nav = el('nav', 'lp-topic-nav');
  nav.setAttribute('aria-label', '이 페이지의 주제');
  const labLink = el('a', '', '직접 해보기'); labLink.href = '#lp-lab'; nav.append(labLink);
  sections.forEach((section, index) => {
    const link = el('a', '', section.title || `내용 ${index + 1}`);
    link.href = `#lp-section-${index}`;
    nav.append(link);
  });

  const body = el('div', 'lp-body');
  const lab = labByExperience[experience]();
  lab.id = 'lp-lab';
  body.append(lab);
  const content = el('section', 'lp-sections');
  if (sections.length) {
    const heading = el('div', 'lp-section-heading');
    heading.append(el('span', 'lp-kicker', 'READ & REFLECT'), el('h2', '', '개념을 연결해 보기'));
    content.append(heading);
    sections.forEach((section, index) => {
      const node = section.type === 'quiz' ? renderQuiz(section) : section.type === 'reflection' ? renderReflection(section) : renderLegacy(section, index);
      node.id = `lp-section-${index}`;
      content.append(node);
    });
  } else content.append(el('p', 'lp-notice', '아직 추가된 학습 내용이 없습니다.'));
  body.append(content);
  root.append(hero, nav, body);
  target.replaceChildren(root);
  return root;
}
