const scenarios = [
  {
    label: 'Google Drive', prompt: '내 Drive에서 토론 수업 자료를 찾아, 학생용 웹 활동을 만들어줘.',
    query: '토론 수업', tool: 'Google Drive · 파일 검색',
    sources: [
      { title: '토론 수업 운영안', before: '학생은 주장을 세우고 자료를 조사합니다.', quote: '주장 → 근거 → 예상 반론 순서로 작성합니다.', after: '짝과 의견을 교환하며 근거를 점검합니다.', use: '주장·근거·반론 입력칸' },
      { title: '토론 평가 기준', before: '학생의 작성 과정과 결과를 함께 살펴봅니다.', quote: '근거의 적절성과 반론에 대한 응답을 확인합니다.', after: '수정할 부분을 스스로 찾아 고쳐 씁니다.', use: '제출 전 자기 점검' },
    ],
    result: '운영안의 작성 순서 [1]와 평가 기준의 자기 점검 [2]을 넣어 학생용 활동을 만들었습니다.',
  },
  {
    label: 'Gmail', prompt: 'Gmail에서 다음 연수 안내 메일을 찾아, 준비할 일을 정리해줘.',
    query: '연수 안내', tool: 'Gmail · 메일 검색',
    sources: [
      { title: '교사 연수 안내', before: '연수 운영팀 · 선생님, 안녕하세요.', quote: '11월 20일 오후 2시, 컴퓨터실에서 진행합니다.', after: '참여가 어려우시면 담당자에게 알려 주세요.', use: '일시·장소' },
      { title: '연수 준비물 안내', before: '연수 운영팀 · 실습 준비 안내입니다.', quote: '노트북과 수업 아이디어 한 가지를 준비해 주세요.', after: '별도 프로그램 설치 없이 브라우저로 실습합니다.', use: '준비물 목록' },
    ],
    result: '안내 메일 [1]에서 일정과 장소를, 준비물 메일 [2]에서 챙길 것을 확인했습니다.',
  },
  {
    label: 'Browser Use', prompt: '교육청 사이트에서 토론 수업 자료를 찾아, 핵심 내용을 정리해줘.',
    query: '토론 수업', tool: 'Browser · 화면 읽기와 클릭',
    sources: [
      { title: '토론 수업 가이드', before: '수업 자료실 · 수업 운영 자료', quote: '질문 만들기 → 근거 모으기 → 토론하기', after: '서로 다른 관점을 비교하며 자신의 생각을 다듬습니다.', use: '수업의 세 단계' },
    ],
    result: '자료실에서 가이드를 열어 확인했습니다 [1]. 질문을 정하고, 근거를 모은 뒤, 토론하는 흐름입니다.',
  },
];

function scenesFor(task) {
  const frames = [
    { phase: 0, scene: 'compose', ms: 800, caption: '에이전트에게 할 일을 자연어로 요청합니다.' },
    ...Array.from({ length: Math.ceil(task.prompt.length / 3) }, (_, i) => ({ phase: 0, scene: 'typing', text: task.prompt.slice(0, (i + 1) * 3), ms: 65, caption: '자료의 위치와 원하는 결과를 함께 요청합니다.' })),
    { phase: 0, scene: 'send', target: 'send', action: 'send', ms: 900, caption: '요청을 보냅니다.' },
    { phase: 1, scene: 'connected', ms: 1800, caption: '플러그인에서 작업 지침과 도구를 확인하고, MCP로 도구에 연결합니다.' },
  ];
  if (task.label === 'Browser Use') {
    frames.push(
      { phase: 2, scene: 'browser-open', ms: 1200, caption: '브라우저 도구로 사이트를 엽니다.' },
      { phase: 2, scene: 'browser-focus', target: 'browser-input', ms: 900, caption: '화면에서 검색창의 위치를 확인합니다.' },
      ...Array.from(task.query, (_, i) => ({ phase: 2, scene: 'browser-type', text: task.query.slice(0, i + 1), target: 'browser-input', ms: 180, caption: '검색창에 검색어를 입력합니다.' })),
      { phase: 2, scene: 'browser-search', target: 'browser-search', action: 'search', ms: 1000, caption: '검색 버튼으로 이동해 클릭합니다.' },
      { phase: 2, scene: 'browser-loading', ms: 850, caption: '검색 결과가 나타나기를 기다립니다.' },
      { phase: 2, scene: 'browser-results', target: 'browser-result', action: 'open-result', ms: 1800, caption: '검색 결과를 읽고 가이드를 클릭합니다.' },
      { phase: 3, scene: 'browser-article', ms: 1400, caption: '열린 페이지에서 본문을 읽습니다.' },
      { phase: 3, scene: 'evidence', source: 0, ms: 2500, caption: '답변에 쓸 문장을 확인합니다. 브라우저는 화면을 읽고 클릭하는 경로입니다.' },
      { phase: 4, scene: 'complete', ms: 0, caption: '확인한 문장을 근거로 수업 흐름을 정리합니다.' },
    );
  } else {
    frames.push(
      { phase: 2, scene: 'api-search', ms: 1400, caption: '검색 도구를 호출합니다. 서비스 웹사이트를 마우스로 조작하지 않습니다.' },
      { phase: 2, scene: 'api-results', ms: 1900, caption: '도구가 반환한 검색 결과를 앱의 자료 탭에서 확인합니다.' },
      { phase: 2, scene: 'read-source', source: 0, ms: 1300, caption: '첫 번째 자료의 본문을 읽는 도구를 호출합니다.' },
      { phase: 3, scene: 'quote-source', source: 0, ms: 2400, caption: `첫 번째 자료에서 ‘${task.sources[0].use}’의 근거를 찾습니다.` },
      { phase: 3, scene: 'read-source', source: 1, ms: 1300, caption: '두 번째 자료도 본문을 읽어 확인합니다.' },
      { phase: 3, scene: 'quote-source', source: 1, ms: 2400, caption: `두 번째 자료에서 ‘${task.sources[1].use}’의 근거를 찾습니다.` },
      { phase: 3, scene: 'evidence', source: 1, ms: 2500, caption: '두 자료의 문장을 결과에 어떻게 쓸지 연결합니다.' },
    );
    if (task.label === 'Google Drive') frames.push(
      { phase: 4, scene: 'building', ms: 1800, caption: '확인한 작성 순서와 평가 기준을 학생용 활동에 반영합니다.' },
      { phase: 4, scene: 'ready', target: 'open-preview', action: 'preview', ms: 1700, caption: '만든 활동의 미리보기를 엽니다.' },
    );
    frames.push({ phase: 4, scene: 'complete', ms: 0, caption: task.label === 'Google Drive' ? '자료에서 가져온 입력 순서와 자기 점검을 직접 사용해 보세요.' : '두 메일의 근거로 만든 준비 목록을 직접 체크해 보세요.' });
  }
  return frames;
}

function node(tag, className = '', text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text, className = 'btn btn--secondary') {
  const element = node('button', className, text);
  element.type = 'button';
  return element;
}

function group(label) {
  const element = node('div', 'tool-choice');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', label);
  return element;
}

function serviceLogo(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 28');
  const paths = kind === 0
    ? [['#0066da', 'M5 27L0 18L9 2L14 11Z'], ['#00ac47', 'M9 2H19L29 19H19Z'], ['#ffba00', 'M5 27L10 18H29L24 27Z']]
    : [['#4285f4', 'M2 6L6 9V26H2Z'], ['#34a853', 'M26 9L30 6V26H26Z'], ['#ea4335', 'M2 6L16 16L30 6V1L16 11L2 1Z'], ['#fbbc04', 'M26 4L30 1V10L26 13Z']];
  for (const [fill, d] of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', fill); path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}

export function toolConnectionLab() {
  const root = node('section', 'tool-lab');
  root.setAttribute('aria-label', '코딩 에이전트가 자료를 찾아 결과를 만드는 과정');
  const toolbar = node('div', 'tool-toolbar'), agents = group('코딩 에이전트 선택'), tasks = group('연결할 도구 선택');
  const agentButtons = ['Claude Code', 'Codex'].map(name => button(name));
  const taskButtons = scenarios.map(task => button(task.label));
  const enlarge = button('크게 보기');
  agents.append(...agentButtons); tasks.append(...taskButtons); toolbar.append(agents, tasks, enlarge);
  const app = node('div', 'tool-app'), surface = app.attachShadow({ mode: 'open' });
  const style = node('link'); style.rel = 'stylesheet'; style.href = '/studies/tool-connection-app.css';
  const appBar = node('div', 'tool-app-bar'), dots = node('span', 'tool-window-dots'); dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.append(node('i'));
  const appName = node('strong', 'tool-app-name'), modes = node('div', 'tool-app-modes');
  modes.append(node('span', '', 'Chat'), node('span', '', 'Cowork'), node('strong', '', 'Code'));
  const appActions = node('div', 'tool-app-actions'); appActions.append(node('span', '', '◧'), node('span', '', '↗ Open'), node('span', '', '···'));
  appBar.append(dots, appName, modes, appActions);
  const workspace = node('div', 'tool-workspace'), sidebar = node('aside', 'tool-sidebar'); sidebar.setAttribute('aria-hidden', 'true');
  const navNew = node('div', 'tool-sidebar-item'), navScheduled = node('div', 'tool-sidebar-item'), navTools = node('div', 'tool-sidebar-item'), navHeading = node('span', 'tool-sidebar-heading');
  sidebar.append(navNew, navScheduled, navTools, navHeading, node('div', 'tool-sidebar-project', '⌄  ▱ 수업 도우미'), node('div', 'tool-sidebar-active', '자료로 수업 만들기'), node('div', 'tool-sidebar-bottom', '⚙ Settings'));
  const chat = node('article', 'tool-agent'), chatBar = node('div', 'tool-chat-bar');
  const sessionContext = node('span', 'tool-session-context');
  chatBar.append(node('strong', '', '자료로 수업 만들기'), sessionContext);
  const conversation = node('div', 'tool-conversation'), prompt = node('p', 'tool-user-message');
  const plugin = node('div', 'tool-plugin'), pluginName = node('strong', 'tool-plugin-name'), pluginCopy = node('span', 'tool-plugin-copy');
  plugin.append(pluginName, pluginCopy);
  const call = button('', 'tool-call'), callLabel = node('strong', 'tool-call-label'), callCopy = node('span', 'tool-call-copy'), callStatus = node('span', 'tool-call-status');
  call.append(callLabel, callCopy, callStatus);
  const evidence = node('div', 'tool-evidence');
  const building = node('div', 'tool-building', '◌ 학생용 활동을 만드는 중…');
  const answer = node('div', 'tool-answer'), answerText = node('p'), openPreview = button('▤ 활동 미리보기 열기', 'tool-open-preview');
  answer.append(answerText, openPreview);
  conversation.append(prompt, plugin, call, evidence, building, answer);
  const composer = node('div', 'tool-composer'), composerText = node('span', 'tool-composer-placeholder'), composerTools = node('div', 'tool-composer-tools');
  const model = node('span', 'tool-composer-model'), send = button('↑', 'tool-send'); send.setAttribute('aria-label', '예시 요청 보내기');
  composerTools.append(node('span', '', '＋'), model, send); composer.append(composerText, composerTools);
  const chatBottom = node('div', 'tool-chat-bottom'); chat.append(chatBar, conversation, composer, chatBottom);

  const panel = node('article', 'tool-panel'), panelBar = node('div', 'tool-panel-bar');
  const sourcesTab = button('자료', 'tool-panel-tab'), outputTab = button('토론 활동.html', 'tool-panel-tab'); panelBar.append(sourcesTab, outputTab);
  const sourceView = node('div', 'tool-source-view'), provider = node('div', 'tool-service-heading'), providerIcon = node('span', 'tool-service-icon'), providerTitle = node('h2');
  provider.append(providerIcon, providerTitle);
  const query = node('div', 'tool-query'), results = node('div', 'tool-results');
  const documentView = node('div', 'tool-document'), documentTitle = node('h3'), documentBefore = node('p'), documentQuote = node('mark', 'tool-source-quote'), documentAfter = node('p');
  documentView.append(documentTitle, documentBefore, documentQuote, documentAfter);
  sourceView.append(provider, query, results, documentView);
  const browserView = node('div', 'tool-browser'), address = node('div', 'tool-address', '←  →  ↻  edu.example/자료실');
  const browserBody = node('div', 'tool-browser-body'), browserHeader = node('div', 'tool-browser-header');
  browserHeader.append(node('strong', '', '교육청 수업나눔'), node('span', '', '수업자료  ·  연수자료'));
  const browserSearch = node('div', 'tool-browser-search'), browserInput = node('input'), searchButton = button('검색', 'tool-browser-submit');
  browserInput.readOnly = true; browserInput.placeholder = '검색어'; browserInput.setAttribute('aria-label', '브라우저 예시 검색어');
  browserSearch.append(browserInput, searchButton);
  const browserLoading = node('p', 'tool-browser-loading', '검색 중…'), browserResult = button('토론 수업 가이드 ↗', 'tool-browser-result');
  const browserArticle = node('div', 'tool-browser-article'), browserQuote = node('mark', 'tool-source-quote', scenarios[2].sources[0].quote);
  browserArticle.append(node('h3', '', '토론 수업 가이드'), node('p', '', '토론 수업은 다음 순서로 진행합니다.'), browserQuote, node('p', '', scenarios[2].sources[0].after));
  browserBody.append(browserHeader, node('h3', '', '수업 자료실'), browserSearch, browserLoading, browserResult, browserArticle); browserView.append(address, browserBody);

  const output = node('div', 'tool-output'), activity = node('form', 'tool-activity');
  activity.append(node('h2', '', '나의 주장, 우리의 토론'), node('p', 'tool-activity-topic', '교실에서 휴대전화를 허용해야 할까?'));
  const inputs = ['나의 주장', '주장을 뒷받침하는 근거', '예상 반론과 나의 답변'].map(label => {
    const field = node('label', 'tool-activity-field'), input = node('textarea'); input.rows = 2; input.required = true;
    field.append(node('span', '', label), input); activity.append(field); return input;
  });
  const activityOrigin = button('[1] 운영안의 작성 순서', 'tool-citation'); activity.append(activityOrigin);
  const checks = ['주장에 맞는 근거를 썼어요.', '예상 반론에 답했어요.'].map(label => {
    const field = node('label', 'tool-check'), input = node('input'); input.type = 'checkbox'; input.required = true;
    field.append(input, node('span', '', label)); activity.append(field); return input;
  });
  const rubricOrigin = button('[2] 평가 기준에서 가져온 자기 점검', 'tool-citation');
  const submit = button('작성 마치기', 'tool-activity-submit'); submit.type = 'submit';
  const activityStatus = node('p', 'tool-activity-status'); activityStatus.setAttribute('role', 'status');
  activity.append(rubricOrigin, submit, activityStatus);
  const checklist = node('div', 'tool-checklist'); checklist.append(node('h2', '', '연수 준비 목록'), node('p', '', '11월 20일 14시 · 컴퓨터실 [1]'));
  for (const label of ['노트북 챙기기 [2]', '수업 아이디어 한 가지 준비하기 [2]']) {
    const field = node('label', 'tool-check'), input = node('input'); input.type = 'checkbox'; field.append(input, node('span', '', label)); checklist.append(field);
  }
  output.append(activity, checklist); panel.append(panelBar, sourceView, browserView, output);
  const cursor = node('div', 'tool-cursor'); cursor.setAttribute('aria-hidden', 'true');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); arrow.setAttribute('viewBox', '0 0 28 32');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M3 2L3 24L9 18L14 29L19 27L14 16L23 16Z'); arrow.append(path); cursor.append(arrow);
  workspace.append(sidebar, chat, panel, cursor); surface.append(style, appBar, workspace);

  const timeline = group('과정 살펴보기'); timeline.className = 'tool-timeline';
  const stepNames = ['요청 이해', '도구 확인', '검색·실행', '근거 확인', '결과 활용'];
  const stepButtons = stepNames.map((name, i) => { const b = button('', 'tool-step'); b.append(node('span', '', String(i + 1)), node('strong', '', name)); b.setAttribute('aria-label', `${i + 1}. ${name}`); return b; });
  timeline.append(...stepButtons);
  const footer = node('div', 'tool-playback'), caption = node('p', 'tool-caption'), play = button('흐름 재생', 'btn btn--primary');
  caption.setAttribute('role', 'status'); footer.append(caption, play);
  const visual = node('div', 'tool-visual'); visual.append(toolbar, app, timeline, footer);
  const note = node('p', 'tool-example-note', '데스크톱 앱을 재구성한 예시입니다. 연결 권한이 있는 상태를 가정하며 실제 계정에는 접속하지 않습니다.');
  const sources = node('p', 'tool-sources'); sources.append(node('span', '', '공식 문서 '));
  for (const [name, href] of [['Claude Code', 'https://code.claude.com/docs/en/desktop'], ['Codex', 'https://developers.openai.com/plugins'], ['MCP', 'https://modelcontextprotocol.io/docs/learn/architecture']]) {
    const link = node('a', '', `${name} ↗`); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
  }
  const enlarged = node('dialog', 'tool-enlarged'); enlarged.setAttribute('aria-label', '도구 활용 과정 크게 보기');
  root.append(visual, note, sources, enlarged);

  let selectedAgent = 1, selectedTask = 0, frames = scenesFor(scenarios[0]), index = 0, sourceIndex = 0, panelOverride = null;
  let timer = null, playing = false, interacted = false, due = 0, remaining = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const current = () => frames[index];
  const targets = { send, 'browser-input': browserInput, 'browser-search': searchButton, 'browser-result': browserResult, 'open-preview': openPreview };
  function positionCursor() {
    if (!root.isConnected) { cursorObserver?.disconnect(); return; }
    if (current().phase >= 3) conversation.scrollTop = conversation.scrollHeight;
    const target = targets[current().target]; if (!target) return;
    const bounds = target.getBoundingClientRect(), area = workspace.getBoundingClientRect(); if (!bounds.width) return;
    cursor.style.left = `${bounds.left - area.left + bounds.width / 2 - 3}px`;
    cursor.style.top = `${bounds.top - area.top + Math.min(bounds.height / 2, 20) - 2}px`;
  }
  const cursorObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(positionCursor) : null;
  cursorObserver?.observe(workspace); cursorObserver?.observe(panel);
  function stop() {
    if (timer !== null) remaining = Math.max(0, due - Date.now());
    clearTimeout(timer); timer = null; playing = false;
    root.dataset.playing = app.dataset.playing = 'false'; app.dataset.click = 'false';
    play.textContent = index === frames.length - 1 ? '다시 재생' : '흐름 재생';
  }
  function inspectSource(i) { interacted = true; stop(); sourceIndex = i; panelOverride = 'sources'; draw(); }
  function draw() {
    const task = scenarios[selectedTask], frame = current(), { scene, phase } = frame, browser = selectedTask === 2;
    const isComplete = scene === 'complete', hasAnswer = ['ready', 'complete'].includes(scene);
    const panelOpen = phase >= 2 && scene !== 'api-search';
    const showOutput = panelOverride ? panelOverride === 'output' : isComplete && !browser;
    const highlighted = ['quote-source', 'evidence', 'building', 'ready', 'complete'].includes(scene) || panelOverride === 'sources';
    for (const host of [root, app]) { host.dataset.step = String(phase); host.dataset.scene = scene; host.dataset.task = String(selectedTask); host.dataset.agent = String(selectedAgent); host.dataset.panel = String(panelOpen); }
    app.dataset.cursor = String(!!frame.target && !reducedMotion); app.dataset.highlight = String(highlighted);
    agentButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === selectedAgent)));
    taskButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === selectedTask)));
    stepButtons.forEach((b, i) => { b.setAttribute('aria-pressed', String(i === phase)); b.dataset.done = String(i < phase); });
    appName.textContent = agentButtons[selectedAgent].textContent; app.setAttribute('role', 'group'); app.setAttribute('aria-label', `${appName.textContent} 데스크톱 화면 예시`);
    navNew.textContent = selectedAgent === 0 ? '＋ New session' : '⊕ New thread'; navScheduled.textContent = selectedAgent === 0 ? '◷ Scheduled' : '◷ Automations'; navTools.textContent = selectedAgent === 0 ? '⊞ Customize' : '⊞ Skills & plugins'; navHeading.textContent = selectedAgent === 0 ? 'Recents' : 'Threads';
    sessionContext.textContent = selectedAgent === 0 ? 'Local · 수업 도우미' : '···';
    model.textContent = selectedAgent === 0 ? 'Sonnet ▾' : 'Codex ▾'; chatBottom.textContent = selectedAgent === 0 ? 'Ask permissions · Local' : '⌁ Local · 수업 도우미';
    composerText.textContent = phase === 0 ? (frame.text || (scene === 'send' ? task.prompt : '할 일을 요청하세요…')) : '후속 작업 요청';
    composer.dataset.typing = String(scene === 'typing'); send.disabled = scene !== 'send'; prompt.textContent = task.prompt; prompt.hidden = phase === 0;
    plugin.hidden = phase < 1; pluginName.textContent = `✓ ${task.label} 플러그인`;
    pluginCopy.textContent = browser ? '작업 지침 + 브라우저 도구 · MCP 연결' : '작업 지침 + 검색·읽기 도구 · MCP 연결';
    call.hidden = phase < 2;
    callLabel.textContent = browser ? (phase >= 3 ? '✓ Browser · 본문 확인' : '◌ Browser · 화면 읽기와 클릭') : (scene === 'api-search' ? `◌ ${task.tool}` : scene === 'api-results' ? `✓ ${task.tool}` : `✓ ${task.label} · 본문 읽기`);
    callCopy.textContent = browser ? '주소 열기 → 검색창 입력 → 클릭 → 화면 읽기' : scene === 'api-search' || scene === 'api-results' ? `검색어: ${task.query}` : task.sources[sourceIndex].title;
    callStatus.textContent = browser ? '화면을 직접 조작' : scene === 'api-search' ? '검색 요청 중…' : scene === 'api-results' ? `${task.sources.length}개 결과 반환` : '도구가 반환한 본문';
    let evidenceCount = browser ? (['evidence', 'complete'].includes(scene) ? 1 : 0) : scene === 'quote-source' ? frame.source + 1 : ['evidence', 'building', 'ready', 'complete'].includes(scene) ? 2 : scene === 'read-source' && phase === 3 ? 1 : 0;
    evidence.replaceChildren(...task.sources.slice(0, evidenceCount).map((source, i) => { const b = button(`[${i + 1}] ${source.title} → ${source.use}`, 'tool-evidence-source'); b.onclick = () => inspectSource(i); return b; })); evidence.hidden = !evidenceCount;
    building.hidden = scene !== 'building'; building.textContent = '◌ 작성 순서와 자기 점검을 활동에 반영하는 중…';
    answer.hidden = !hasAnswer; answerText.textContent = task.result; openPreview.textContent = selectedTask === 0 ? '▤ 토론 활동.html 열기' : '준비 목록 열기'; openPreview.hidden = browser;
    panel.hidden = !panelOpen; sourcesTab.textContent = browser ? '◎ 브라우저' : `자료 · ${task.label}`;
    outputTab.textContent = selectedTask === 0 ? '토론 활동.html' : '준비 목록'; outputTab.hidden = browser || !hasAnswer;
    sourcesTab.setAttribute('aria-pressed', String(!showOutput)); outputTab.setAttribute('aria-pressed', String(showOutput));
    sourceView.hidden = browser || showOutput; browserView.hidden = !browser; output.hidden = !showOutput; activity.hidden = selectedTask !== 0; checklist.hidden = selectedTask !== 1;
    providerIcon.replaceChildren(...(!browser ? [serviceLogo(selectedTask)] : [])); providerTitle.textContent = task.label;
    query.textContent = `검색 도구의 반환 결과 · “${task.query}”`;
    results.replaceChildren(...task.sources.map((source, i) => { const b = button('', 'tool-result'); b.append(node('span', 'tool-file-icon', selectedTask === 0 ? '▤' : '✉'), node('strong', '', source.title), node('span', '', `[${i + 1}] ${source.use}`)); b.onclick = () => inspectSource(i); return b; }));
    results.hidden = scene !== 'api-results' || panelOverride === 'sources'; documentView.hidden = scene === 'api-results' && !panelOverride;
    documentTitle.textContent = `[${sourceIndex + 1}] ${task.sources[sourceIndex].title}`; documentBefore.textContent = task.sources[sourceIndex].before; documentQuote.textContent = task.sources[sourceIndex].quote; documentAfter.textContent = task.sources[sourceIndex].after;
    const browserScenes = ['browser-loading', 'browser-results', 'browser-article', 'evidence', 'complete'];
    browserInput.value = ['browser-type'].includes(scene) ? frame.text : browserScenes.includes(scene) || scene === 'browser-search' ? task.query : '';
    searchButton.disabled = !browserInput.value; browserLoading.hidden = scene !== 'browser-loading'; browserResult.hidden = scene !== 'browser-results'; browserArticle.hidden = phase < 3;
    caption.textContent = frame.caption;
    conversation.scrollTop = phase >= 3 ? conversation.scrollHeight : 0;
    if (cursorObserver) queueMicrotask(positionCursor);
  }
  function schedule(ms = remaining ?? current().ms) {
    remaining = null; if (!ms || !playing) return;
    due = Date.now() + ms; timer = setTimeout(advance, ms);
  }
  function setFrame(next) {
    index = next; remaining = null; panelOverride = null; app.dataset.click = 'false';
    if (current().source !== undefined) sourceIndex = current().source;
    draw(); if (index === frames.length - 1) stop(); else schedule();
  }
  function go(scene) { clearTimeout(timer); timer = null; setFrame(frames.findIndex(frame => frame.scene === scene)); }
  function advance() {
    timer = null; if (!root.isConnected) return stop();
    const frame = current();
    if (frame.action) {
      app.dataset.click = 'true'; due = Date.now() + 180;
      timer = setTimeout(() => { timer = null; targets[frame.target].click(); }, 180);
    } else setFrame(index + 1);
  }
  function start() {
    if (index === frames.length - 1) { index = 0; sourceIndex = 0; panelOverride = null; remaining = null; }
    playing = true; root.dataset.playing = app.dataset.playing = 'true'; play.textContent = '일시정지'; draw(); schedule();
  }
  function choose() {
    interacted = true; stop(); frames = scenesFor(scenarios[selectedTask]); index = sourceIndex = 0; remaining = null; panelOverride = null;
    for (const input of inputs) input.value = ''; for (const input of checks) input.checked = false; activityStatus.textContent = '';
    draw(); if (!reducedMotion) start();
  }
  send.onclick = () => go('connected'); searchButton.onclick = () => go('browser-loading'); browserResult.onclick = () => go('browser-article');
  openPreview.onclick = () => go('complete');
  call.onclick = () => { if (current().phase >= 2) { interacted = true; stop(); panelOverride = 'sources'; draw(); } };
  sourcesTab.onclick = () => { interacted = true; stop(); panelOverride = 'sources'; draw(); };
  outputTab.onclick = () => { interacted = true; stop(); panelOverride = 'output'; draw(); };
  activityOrigin.onclick = () => inspectSource(0); rubricOrigin.onclick = () => inspectSource(1);
  activity.onsubmit = event => { event.preventDefault(); activityStatus.textContent = inputs.every(input => input.value.trim()) && checks.every(input => input.checked) ? '작성과 자기 점검을 마쳤어요. 근거를 더 보완하며 토론을 시작해 보세요.' : '세 칸을 작성하고 두 가지 자기 점검을 완료해 주세요.'; };
  agentButtons.forEach((b, i) => { b.onclick = () => { selectedAgent = i; choose(); }; }); taskButtons.forEach((b, i) => { b.onclick = () => { selectedTask = i; choose(); }; });
  stepButtons.forEach((b, phase) => { b.onclick = () => { interacted = true; stop(); remaining = null; setFrame(frames.findLastIndex(frame => frame.phase === phase)); }; });
  play.onclick = () => { interacted = true; playing ? stop() : start(); };
  for (const [container, buttons] of [[agents, agentButtons], [tasks, taskButtons], [timeline, stepButtons]]) {
    container.onkeydown = event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const i = buttons.indexOf(document.activeElement), next = event.key === 'ArrowRight' ? (i + 1) % buttons.length : event.key === 'ArrowLeft' ? (i + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
      if (next < 0) return; event.preventDefault(); buttons[next].focus(); buttons[next].click();
    };
  }
  enlarge.onclick = () => { if (enlarged.open) enlarged.close(); else { app.dataset.expanded = 'true'; enlarged.append(visual); enlarged.showModal(); enlarge.textContent = '닫기'; enlarge.focus(); } };
  enlarged.onclose = () => { app.dataset.expanded = 'false'; root.prepend(visual); enlarge.textContent = '크게 보기'; enlarge.focus(); };
  draw();
  if (!reducedMotion) {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .7)) { observer.disconnect(); if (!interacted) start(); } }, { threshold: .7 });
    style.onload = () => observer.observe(app);
    if (style.sheet) observer.observe(app);
  }
  return root;
}
