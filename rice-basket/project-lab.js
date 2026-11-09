export const FIRST_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>나의 첫 웹페이지</title>
</head>
<body>
  <h1>나의 첫 웹페이지</h1>
  <p>HTML로 내용과 구조를 적습니다.</p>
  <button id="hello">인사하기</button>
  <p id="message">버튼을 눌러 보세요.</p>
</body>
</html>`;
export const FIRST_CSS = `body {
  font-family: sans-serif;
  background: #eef4ff;
  color: #17345c;
  padding: 28px;
}

h1 { color: #2463eb; }

button {
  padding: 12px 20px;
  border: 0;
  border-radius: 8px;
  background: #2463eb;
  color: white;
}`;
export const FIRST_JS = `const button = document.querySelector('#hello');
const message = document.querySelector('#message');

button.addEventListener('click', () => {
  message.textContent = '반가워요! JavaScript가 글을 바꿨어요.';
});`;
export const PROJECT_HTML = FIRST_HTML.replace('</head>', '  <link rel="stylesheet" href="style.css">\n</head>').replace('</body>', '  <script src="script.js" defer></script>\n</body>');

function el(tag, className = '', text) {
  const node = document.createElement(tag);node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text) { const node = el('button', 'button', text);node.type = 'button';return node; }

export function projectPreview(withAssets = false) {
  const nonce = crypto.randomUUID();
  // These fixed lesson files run in an opaque frame; external requests remain blocked.
  const html = withAssets ? PROJECT_HTML.replace('<link rel="stylesheet" href="style.css">', `<style>${FIRST_CSS}</style>`).replace('<script src="script.js" defer></script>', `<script nonce="${nonce}" src="data:text/javascript;charset=utf-8,${encodeURIComponent(FIRST_JS)}" defer></script>`) : FIRST_HTML;
  return html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`);
}

function previewFrame(title, withAssets = true) {
  const frame = el('iframe', 'html-preview');frame.title = title;frame.setAttribute('sandbox', 'allow-scripts');frame.referrerPolicy = 'no-referrer';frame.srcdoc = projectPreview(withAssets);return frame;
}

function deploymentScene() {
  const root = el('section', 'deployment-scene');root.id = 'web-project-deployment';root.setAttribute('role', 'tabpanel');
  const route = el('div', 'deployment-route'), folder = el('section', 'deployment-node deployment-folder');folder.append(el('h3', '', '나의 수업 프로젝트 폴더'));
  for (const name of ['index.html', 'style.css', 'script.js']) folder.append(el('code', 'deployment-file', name));
  const host = el('section', 'deployment-node deployment-host'), hostFiles = el('div', 'deployment-host-files'), serverIcon = el('div', 'deployment-server-icon');serverIcon.setAttribute('aria-hidden', 'true');serverIcon.append(el('i'), el('i'), el('i'));host.append(el('h3', '', '호스팅 서버'), serverIcon, hostFiles);
  const publicSite = el('section', 'deployment-node deployment-public'), publicAddress = el('code', 'deployment-public-address');publicSite.append(el('h3', '', '공개 주소 (예시)'), publicAddress);
  const arrow = () => { const node = el('span', 'deployment-arrow', '→');node.setAttribute('aria-hidden', 'true');return node; };route.append(folder, arrow(), host, arrow(), publicSite);
  const actions = el('div', 'deployment-actions'), publish = button('배포해줘'), visit = button('공개 주소로 열어 보기'), stop = button('로컬 서버 끄고 새로고침');publish.className = 'button primary';actions.setAttribute('role', 'group');actions.setAttribute('aria-label', '배포 모의 실습 진행');actions.append(publish, visit, stop);
  const status = el('p', 'deployment-status');status.setAttribute('role', 'status');
  const devices = el('div', 'deployment-devices'), local = el('section', 'deployment-device'), remote = el('section', 'deployment-device'), localView = el('div', 'deployment-device-view'), remoteView = el('div', 'deployment-device-view');
  local.append(el('h3', '', '내 컴퓨터'), el('p', 'project-address', 'http://localhost:5500/'), localView);
  const remoteAddress = el('p', 'project-address');remote.append(el('h3', '', '다른 사람의 컴퓨터·휴대폰'), remoteAddress, remoteView);devices.append(local, remote);root.append(route, actions, status, devices);
  publish.onclick = () => {
    root.className = 'deployment-scene is-published';hostFiles.replaceChildren(...['index.html', 'style.css', 'script.js'].map(name => el('code', 'deployment-file', name)));
    publicAddress.textContent = 'https://my-class.example';remoteAddress.textContent = 'https://my-class.example';publish.disabled = true;visit.disabled = false;visit.className = 'button primary';
    status.textContent = '프로젝트 파일이 호스팅 서버에 올라가고 공개 주소가 생겼습니다. 다른 사람의 브라우저로 열어 보세요.';
  };
  visit.onclick = () => {
    remoteView.replaceChildren(previewFrame('다른 사람이 공개 주소로 연 웹페이지'));visit.disabled = true;stop.disabled = false;
    status.textContent = '다른 사람도 공개 주소로 같은 웹페이지를 봅니다. 이제 내 로컬 서버를 꺼 보세요.';
  };
  stop.onclick = () => {
    root.className = 'deployment-scene is-published is-local-off';localView.replaceChildren(el('p', 'deployment-empty', '내 로컬 서버가 꺼져 localhost로는 연결할 수 없습니다.'));remoteView.replaceChildren(previewFrame('다른 사람이 공개 주소로 연 웹페이지'));stop.disabled = true;
    status.textContent = '두 주소로 다시 접속했습니다. localhost는 연결되지 않지만, 공개 주소는 호스팅 서버에서 계속 열립니다.';
  };
  function reset() {
    root.className = 'deployment-scene';hostFiles.replaceChildren(el('p', '', '아직 파일이 올라가지 않았습니다.'));publicAddress.textContent = '아직 공개 주소가 없습니다.';remoteAddress.textContent = '공개 주소가 생기면 여기에 접속합니다.';
    publish.disabled = false;visit.disabled = true;stop.disabled = true;visit.className = 'button';
    status.textContent = '화면 안에서 진행하는 배포 모의 실습입니다. “배포해줘”를 눌러 보세요.';
    localView.replaceChildren(previewFrame('내 컴퓨터의 로컬 서버로 연 웹페이지'));remoteView.replaceChildren(el('p', 'deployment-empty', '다른 사람은 내 localhost 주소로 접속할 수 없습니다.'));
  }
  return { root, reset };
}

export function projectLab() {
  const root = el('section', 'web-project-course');root.setAttribute('aria-label', '파일에서 프로젝트로 이어지는 화면 속 실습');
  const tabs = el('div', 'html-course-tabs');tabs.setAttribute('role', 'tablist');tabs.setAttribute('aria-label', '학습 단계');
  const intro = el('div', 'project-intro'), title = el('h2'), description = el('p');intro.append(title, description);
  const panel = el('div', 'project-workspace');panel.id = 'web-project-panel';panel.setAttribute('role', 'tabpanel');
  const origin = el('div', 'project-file-origin'), path = el('p', 'project-path', '내 컴퓨터의 파일');
  const files = el('div', 'project-files');files.setAttribute('role', 'group');files.setAttribute('aria-label', '내용을 살펴볼 파일');
  origin.append(path, files);
  const looseFile = el('div', 'project-loose-file');looseFile.append(el('span', '', '바탕화면에 복사한 파일'), el('code', '', 'index.html'));
  const branch = el('div', 'project-file-branch');branch.setAttribute('aria-hidden', 'true');
  const textRoute = el('div', 'project-open-route project-text-route'), edit = button('텍스트 편집기로 열기');textRoute.append(edit);
  const browserRoute = el('div', 'project-open-route project-browser-route');
  const editor = el('section', 'project-editor'), editorTitle = el('h3', '', '텍스트 편집기');
  const sourceTitle = el('p', 'project-source-title'), source = el('pre', 'project-source'), code = el('code'), sourceEmpty = el('p', 'project-editor-empty', '위의 파일을 텍스트 편집기로 열어 보세요.');source.append(code);source.tabIndex = 0;source.setAttribute('aria-label', '선택한 파일의 코드');editor.append(editorTitle, sourceTitle, sourceEmpty, source);
  const browser = el('section', 'project-browser'), browserTitle = el('h3', '', '브라우저'), address = el('p', 'project-address');
  const browserIcons = el('span', 'project-browser-icons');
  for (const [name, file] of [['Google Chrome', 'chrome.svg'], ['Microsoft Edge', 'edge.png']]) {
    const icon = el('img');icon.src = `/studies/browser-icons/${file}`;icon.alt = name;icon.title = name;icon.width = 24;icon.height = 24;browserIcons.append(icon);
  }
  browserTitle.append(browserIcons);
  const launch = button('HTML 파일을 브라우저로 열기');launch.className = 'button primary project-launch';
  const restore = button('폴더 안에서 열기');restore.className = 'button primary project-restore';browserRoute.append(launch, restore);
  const preview = el('div', 'project-preview-area'), status = el('p', 'project-browser-status');status.setAttribute('role', 'status');browser.append(browserTitle, address, status, preview);
  const tagMap = el('div', 'project-tag-map');tagMap.setAttribute('aria-label', 'HTML 태그가 화면으로 바뀌는 예');
  for (const [tag, meaning] of [['<h1>', '큰 제목'], ['<p>', '본문'], ['<button>', '버튼']]) { const pair = el('div');pair.append(el('code', '', tag), el('span', '', '→'), el('strong', '', meaning));tagMap.append(pair); }
  panel.append(origin, looseFile, branch, textRoute, browserRoute, editor, browser, tagMap);

  const comparison = el('section', 'project-comparison');comparison.id = 'web-project-comparison';comparison.setAttribute('role', 'tabpanel');
  const table = el('table'), head = el('thead'), heading = el('tr');
  for (const text of ['비교할 것', '파일을 직접 열기', '로컬 서버로 열기']) { const cell = el('th', '', text);cell.setAttribute('scope', 'col');heading.append(cell); }
  head.append(heading);const body = el('tbody');
  for (const row of [
    ['주소', 'file:///나의 수업 프로젝트 폴더/index.html', 'http://localhost:5500/'],
    ['파일을 읽는 길', '브라우저 → 컴퓨터의 파일', '브라우저 → 로컬 서버 → 프로젝트 파일'],
    ['세 파일이 함께 있을 때', 'HTML·CSS·일반 JS는 그대로 작동', '같은 화면과 같은 버튼 동작'],
    ['데이터 읽기·JS 모듈', '브라우저 보안 정책에 따라 제한될 수 있음', 'HTTP로 파일을 받아 테스트 가능']
  ]) {
    const line = el('tr');row.forEach((text, i) => { const cell = el(i ? 'td' : 'th', '', text);if (!i) cell.setAttribute('scope', 'row');line.append(cell); });body.append(line);
  }
  table.append(head, body);
  const experiment = el('div', 'project-experiment'), tryData = button('같은 데이터 파일 읽어 보기');
  const results = el('div', 'project-comparison-results'), fileResult = el('p'), serverResult = el('p');results.setAttribute('role', 'status');
  const fileCard = el('div'), serverCard = el('div');fileCard.append(el('strong', '', '파일로 열기'), fileResult);serverCard.append(el('strong', '', '로컬 서버로 열기'), serverResult);results.append(fileCard, serverCard);
  experiment.append(el('h3', '', '데이터 파일을 읽는다면?'), el('p', '', '같은 폴더에 data.json이 있다고 가정한 모의 실험입니다.'), tryData, results);comparison.append(table, experiment);
  tryData.onclick = () => {
    // File-URL restrictions vary by browser, so this is a labeled example rather than a live request.
    fileResult.textContent = '읽기 제한 예시: 보안 정책이 file:// 데이터 요청을 차단했습니다.';
    serverResult.textContent = '읽기 성공: 나의 수업 목록';
  };
  const takeaway = el('p', 'project-takeaway'), navigation = el('div', 'project-navigation'), previous = button('이전'), next = button('다음');next.className = 'button primary';navigation.setAttribute('role', 'group');navigation.setAttribute('aria-label', '학습 단계 진행');navigation.append(previous, next);
  const deployment = deploymentScene();root.append(tabs, intro, panel, comparison, deployment.root, takeaway, navigation);
  const stages = [
    ['1 HTML 한 파일', '같은 index.html, 여는 프로그램에 따라 다른 모습', '먼저 텍스트 편집기로 열어 파일 안의 글자를 보세요. 그다음 같은 파일을 브라우저로 열어 보세요.'],
    ['2 CSS·JS가 있는 폴더', 'HTML만 따로 가져가면 모양과 동작이 빠집니다', '먼저 index.html만 바탕화면에 복사해 열어 보세요. CSS·JS가 빠진 결과와 폴더 안에서 연 결과를 비교합니다.'],
    ['3 로컬 서버로 열기', '같은 프로젝트를 localhost 주소로 확인합니다', '파일 구성은 그대로입니다. “로컬 서버로 열어줘”를 눌러 실행 흐름을 확인하세요.'],
    ['4 차이 비교', '화면은 같아도, 파일을 읽는 방식이 다릅니다', '기본 HTML·CSS·JS는 파일로도 열립니다. 데이터 요청이나 JS 모듈을 쓰는 프로젝트는 로컬 서버에서 확인합니다.'],
    ['5 배포해 보기', '배포는 다른 사람도 주소로 열 수 있게 만드는 일입니다', '프로젝트 파일을 호스팅 서버에 올리고 공개 주소로 접속합니다. 이 화면 안에서 배포 전후를 비교해 보세요.']
  ];
  let stage = 0, reached = 0, selected = 'index.html', editorOpened = false;
  const buttons = stages.map(([label], index) => {
    const tab = button(label);tab.id = `web-project-tab-${index}`;tab.setAttribute('role', 'tab');tab.setAttribute('aria-controls', index === 4 ? deployment.root.id : index === 3 ? comparison.id : panel.id);tab.onclick = () => select(index);
    tab.onkeydown = event => {
      let target;
      if (event.key === 'ArrowRight') target = Math.min(stage + 1, reached);
      else if (event.key === 'ArrowLeft') target = Math.max(stage - 1, 0);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = reached;
      if (target !== undefined) { event.preventDefault();select(target);buttons[target].focus(); }
    };
    tabs.append(tab);return tab;
  });
  function showFiles() {
    const entries = stage ? [['index.html', '내용', PROJECT_HTML], ['style.css', '모양', FIRST_CSS], ['script.js', '동작', FIRST_JS]] : [['index.html', '내용', FIRST_HTML]];
    files.replaceChildren();
    for (const [name, role, text] of entries) {
      const file = button(name);file.className = 'button project-file';file.setAttribute('aria-label', name);file.setAttribute('data-type', name.split('.').at(-1));file.setAttribute('aria-pressed', String(name === selected));file.onclick = () => { selected = name;showFiles(); };files.append(file);
      if (name === selected) { sourceTitle.textContent = stage === 0 ? name : `${name} · ${role}`;code.textContent = text;source.scrollTop = 0; }
    }
  }
  function showBrowser(htmlOnly = false) {
    if (stage === 0 && !editorOpened) return;
    const isolated = stage === 1 && htmlOnly;
    const frame = previewFrame(isolated ? 'HTML만 따로 열어 모양과 동작이 빠진 웹페이지' : stage ? 'CSS와 JavaScript가 연결된 웹페이지' : 'HTML 파일을 브라우저로 연 모습', stage > 0 && !isolated);
    preview.replaceChildren(frame);address.textContent = stage === 2 ? 'http://localhost:5500/' : isolated ? 'file:///바탕화면/index.html' : 'file:///나의 수업 프로젝트 폴더/index.html';
    status.textContent = isolated ? '같은 위치에 style.css와 script.js가 없어, 모양과 버튼 동작이 빠졌습니다.' : stage === 0 ? '같은 index.html의 태그를 읽어 제목·본문·버튼으로 그렸습니다.' : stage === 1 ? '폴더 안의 CSS·JS를 함께 읽어 모양과 버튼 동작이 돌아왔습니다.' : '화면 속 로컬 서버로 연 같은 프로젝트입니다.';
    launch.setAttribute('aria-pressed', String(stage !== 1 || isolated));restore.setAttribute('aria-pressed', String(stage === 1 && !isolated));restore.hidden = stage !== 1;looseFile.hidden = !isolated;tagMap.hidden = stage !== 0;frame.focus({ preventScroll: true });
    if (stage === 1) { launch.className = 'button project-launch';restore.className = 'button project-restore'; }
    panel.scrollIntoView({ block: 'start' });
    if (stage === 2) description.textContent = '같은 폴더의 파일들을 서버가 브라우저에 보내 줍니다. 화면은 같고, 주소가 file://에서 localhost로 바뀝니다.';
  }
  function select(index) {
    if (index < 0 || index > reached || index >= stages.length) return;
    stage = index;selected = 'index.html';editorOpened = false;source.hidden = true;sourceEmpty.hidden = false;tagMap.hidden = true;looseFile.hidden = true;restore.hidden = true;restore.setAttribute('aria-pressed', 'false');edit.className = 'button primary';edit.setAttribute('aria-pressed', 'false');
    buttons.forEach((tab, i) => { tab.disabled = i > reached;tab.setAttribute('aria-selected', String(i === stage));tab.tabIndex = i === stage ? 0 : -1; });
    panel.hidden = stage >= 3;comparison.hidden = stage !== 3;deployment.root.hidden = stage !== 4;(stage === 4 ? deployment.root : stage === 3 ? comparison : panel).setAttribute('aria-labelledby', buttons[stage].id);
    title.textContent = stages[stage][1];description.textContent = stages[stage][2];previous.disabled = stage === 0;next.hidden = stage === 4;next.textContent = ['다음: CSS·JS 폴더', '다음: 로컬 서버', '다음: 차이 비교', '다음: 배포해 보기'][stage] || '다음';
    takeaway.textContent = stage === 0 ? '파일이 바뀐 것이 아닙니다. 텍스트 편집기는 글자를 그대로 보여 주고, 브라우저는 HTML 태그를 읽어 웹페이지를 그립니다.' : stage === 1 ? '브라우저가 여는 입구는 index.html입니다. 연결된 CSS·JS도 함께 전달하려면 ‘나의 수업 프로젝트 폴더’를 통째로 관리하세요.' : stage === 2 ? 'localhost는 내 컴퓨터의 확인용 주소입니다. 다른 사람과 주고받을 때는 프로젝트 폴더 전체를 함께 관리합니다.' : stage === 3 ? '로컬 서버는 웹사이트에 가까운 방식으로 프로젝트를 확인하는 환경입니다. localhost로 여는 것과 인터넷에 공개 배포하는 것은 별개입니다.' : '배포해도 HTML·CSS·JS의 역할은 같습니다. 달라지는 것은 파일이 있는 곳과 다른 사람도 접속할 수 있는 주소입니다.';
    if (stage === 4) deployment.reset();
    else if (stage === 3) {
      fileResult.textContent = '데이터 파일 읽기 결과를 비교해 보세요.';serverResult.textContent = '데이터 파일 읽기 결과를 비교해 보세요.';
    } else {
      showFiles();path.textContent = stage === 0 ? '내 컴퓨터의 파일' : '나의 수업 프로젝트 폴더';origin.className = `project-file-origin${stage === 0 ? ' is-single' : ' is-folder'}`;
      launch.disabled = stage === 0;launch.hidden = false;launch.className = 'button primary project-launch';launch.textContent = ['같은 index.html을 브라우저로 열기', 'HTML만 따로 열기', '로컬 서버로 열어줘'][stage];
      preview.replaceChildren(el('p', 'project-browser-empty', stage === 0 ? '텍스트로 본 같은 파일을, 이번에는 브라우저로 열어 봅니다.' : '위의 버튼을 눌러 브라우저에서 확인하세요.'));address.textContent = '새 탭';status.textContent = '';launch.setAttribute('aria-pressed', 'false');
    }
  }
  edit.onclick = () => { editorOpened = true;source.hidden = false;sourceEmpty.hidden = true;edit.className = 'button';edit.setAttribute('aria-pressed', 'true');launch.disabled = false;source.focus({ preventScroll: true });panel.scrollIntoView({ block: 'start' }); };
  previous.onclick = () => { select(stage - 1);buttons[stage].focus(); };
  next.onclick = () => { reached = Math.max(reached, Math.min(stage + 1, stages.length - 1));select(stage + 1);buttons[stage].focus(); };
  launch.onclick = () => showBrowser(stage === 1);restore.onclick = () => showBrowser(false);select(0);return root;
}
