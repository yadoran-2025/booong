export const HTML_LAB_PAGE_ID = 'page-dfbb5ddf684f';
export const FIRST_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>나의 첫 웹페이지</title>
</head>
<body>
  <h1>안녕하세요!</h1>
  <p>내가 만든 첫 웹페이지입니다.</p>
  <ul>
    <li>제목을 바꿔 보세요.</li>
    <li>목록에 한 줄을 더 넣어 보세요.</li>
  </ul>
</body>
</html>`;

function el(tag, className = '', text) {
  const node = document.createElement(tag);node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className = 'button') { const node = el('button', className, text);node.type = 'button';return node; }
function windowHeading(title) {
  const heading = el('div', 'html-window-heading'), dots = el('span', 'html-window-dots');dots.setAttribute('aria-hidden', 'true');
  dots.append(el('i'), el('i'), el('i'));heading.append(dots, el('h2', '', title));return heading;
}

export function htmlFileLab() {
  const lab = el('section', 'html-lab');lab.setAttribute('aria-label', 'HTML 파일 만들기 체험');
  const folder = el('section', 'html-folder'), editor = el('section', 'html-editor'), browser = el('section', 'html-browser');
  browser.hidden = true;
  folder.append(windowHeading('파일 탐색기'));
  const folderBody = el('div', 'html-folder-body'), folderName = el('div', 'html-folder-path', '문서 › 내 첫 웹페이지');
  const create = button('+ index.html 만들기', 'button primary'), file = button('index.html', 'html-file');file.hidden = true;
  file.setAttribute('aria-label', 'index.html을 브라우저로 열기');
  file.setAttribute('aria-description', '더블클릭하거나 Enter 키로 엽니다.');file.title = '더블클릭하여 브라우저로 열기';
  file.textContent = '';const fileIcon = el('span', 'html-file-icon', '</>');fileIcon.setAttribute('aria-hidden', 'true');file.append(fileIcon, el('span', '', 'index.html'));
  const open = button('브라우저로 열기');open.disabled = true;
  const folderToolbar = el('div', 'html-folder-toolbar');folderToolbar.append(create, open);
  const sidebar = el('div', 'html-folder-sidebar');sidebar.setAttribute('aria-hidden', 'true');sidebar.append(el('span', '', '문서'), el('strong', 'html-folder-name', '내 첫 웹페이지'));
  const files = el('div', 'html-files'), folderEmpty = el('p', 'html-folder-empty', '이 폴더는 비어 있습니다.');files.append(file, folderEmpty);
  folderBody.append(sidebar, files);folder.append(folderName, folderToolbar, folderBody);

  const editorHeading = windowHeading('텍스트 편집기'), editorTab = el('div', 'html-editor-tab', '새 문서');
  const source = el('textarea', 'html-source');source.setAttribute('aria-label', 'index.html 내용');source.spellcheck = false;source.maxLength = 12000;source.disabled = true;
  source.placeholder = '연습 폴더에 index.html을 먼저 만들어 주세요.';
  const save = button('파일에 저장', 'button primary');save.disabled = true;
  const download = el('a', 'button', 'HTML 파일 내려받기');download.download = 'index.html';download.hidden = true;
  const actions = el('div', 'html-editor-actions'), status = el('p', 'html-status');status.setAttribute('role', 'status');
  actions.append(save, download);editor.append(editorHeading, editorTab, source, actions, status);

  const browserHeading = windowHeading('브라우저'), browserTab = el('div', 'html-browser-tab', '새 탭'), refresh = button('새로고침');refresh.disabled = true;
  refresh.setAttribute('aria-label', '새로고침');refresh.title = '새로고침';
  const address = el('div', 'html-address', 'about:blank'), browserToolbar = el('div', 'html-browser-toolbar');browserToolbar.append(refresh, address);
  const frame = el('iframe', 'html-preview');frame.title = '저장한 index.html을 브라우저로 연 화면';frame.hidden = true;
  frame.setAttribute('sandbox', '');frame.referrerPolicy = 'no-referrer';
  const browserStatus = el('p', 'html-status');browserStatus.setAttribute('role', 'status');
  browser.append(browserHeading, browserTab, browserToolbar, frame, browserStatus);
  const workspace = el('div', 'html-workspace'), desktopBar = el('div', 'html-desktop-bar', '연습용 컴퓨터');workspace.append(desktopBar, folder, editor, browser);
  const takeaway = el('div', 'html-takeaway');
  takeaway.append(el('h2', '', '같은 문서, 두 가지 모습'), el('p', '', '편집기에서는 HTML의 글과 태그를 고치고, 브라우저에서는 그 문서가 만든 화면을 봅니다. 컴퓨터에서도 내려받은 index.html을 브라우저로 열어 볼 수 있습니다.'));
  lab.append(workspace, takeaway);

  let created = false, saved = '', opened = false, displayed = '';
  const updateDownload = () => { download.href = `data:text/html;charset=utf-8,${encodeURIComponent(saved)}`; };
  const showFile = () => {
    if (!created) return;
    opened = true;displayed = saved;browser.hidden = false;frame.hidden = false;refresh.disabled = false;
    address.textContent = 'file:///내 첫 웹페이지/index.html';address.title = address.textContent;browserTab.textContent = 'index.html';
    // Learner HTML stays in an opaque frame without scripts or remote resources.
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">${saved}`;
    browserStatus.textContent = '브라우저가 저장된 HTML 문서를 읽어 화면으로 보여 줍니다.';
    if (source.value !== saved) browserStatus.textContent = '저장하지 않은 수정은 아직 이 화면에 나타나지 않습니다.';
    browser.scrollIntoView({ block: 'nearest' });refresh.focus({ preventScroll: true });
  };
  create.onclick = () => {
    if (created) return;
    created = true;saved = FIRST_HTML;source.value = saved;source.disabled = false;open.disabled = false;
    create.hidden = true;file.hidden = false;folderEmpty.hidden = true;editorTab.textContent = 'index.html';download.hidden = false;updateDownload();
    status.textContent = 'index.html이 생겼습니다. 파일을 더블클릭하면 브라우저가 열립니다.';
    file.focus();
  };
  source.oninput = () => {
    save.disabled = source.value === saved;
    status.textContent = save.disabled ? '파일에 저장된 내용과 같습니다.' : '아직 파일에 저장하지 않은 수정이 있습니다.';
    if (opened) browserStatus.textContent = displayed !== saved ? '저장된 파일이 바뀌었습니다. 새로고침하면 반영됩니다.' : source.value !== saved ? '문서를 고쳐도 열린 화면은 그대로입니다. 파일에 저장한 뒤 새로고침해 보세요.' : '브라우저가 마지막으로 읽은 파일을 보여 주고 있습니다.';
  };
  save.onclick = () => {
    if (!created) return;
    saved = source.value;save.disabled = true;updateDownload();status.textContent = 'index.html에 저장했습니다.';
    browserStatus.textContent = opened ? '저장된 파일이 바뀌었습니다. 새로고침하면 반영됩니다.' : '이제 파일을 브라우저로 열어 보세요.';
  };
  open.onclick = refresh.onclick = file.ondblclick = showFile;
  file.onclick = event => { if (event.detail === 0) showFile(); };
  return lab;
}
