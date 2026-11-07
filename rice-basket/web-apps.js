import { webAppDefinitions, webAppThumbnailUrl } from './web-app-config.js';

function el(tag, className = '', text) {
  const node = document.createElement(tag);node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className = 'button') { const node = el('button', className, text);node.type = 'button';return node; }
function link(text, url) { const node = el('a', 'button', text);node.href = url;node.target = '_blank';node.rel = 'noopener noreferrer';return node; }

export function mountWebApps(root, page, { api, fetchQr, sessionId, canEdit }) {
  root.classList.remove('lp-standalone');root.classList.add('lp-web-apps-page');
  const host = el('section', 'wa-host');root.append(host);
  let apps = webAppDefinitions(page.webApps || [], { includeTeacher: canEdit }), revision = page.webAppsRevision || 0, active = -1, qrUrl = '', qrRequest = 0, dirty = false;
  const toolbar = el('div', 'wa-toolbar'), nav = el('div', 'wa-apps'), view = el('div');
  nav.setAttribute('role', 'group');nav.setAttribute('aria-label', '실습할 웹앱');
  const configure = button('웹앱 설정');configure.hidden = !canEdit;
  toolbar.append(nav, configure);host.append(toolbar, view);
  const scope = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
  const route = `/api/pages/${encodeURIComponent(page.id)}`;

  const zoom = el('dialog', 'confirm-dialog qr-dialog');zoom.setAttribute('aria-labelledby', 'wa-qr-heading');
  const zoomHeader = el('div', 'qr-dialog-heading'), zoomTitle = el('h2'), zoomClose = button('닫기'), zoomImage = el('img');
  zoomTitle.id = 'wa-qr-heading';zoomClose.autofocus = true;zoomImage.alt = '학생 참여 QR코드';
  zoomHeader.append(zoomTitle, zoomClose);zoom.append(zoomHeader, zoomImage);host.append(zoom);
  zoomClose.onclick = () => zoom.close();

  const select = index => {
    if (active === index) return;
    active = index;const entry = apps[index], request = ++qrRequest;
    if (qrUrl) URL.revokeObjectURL(qrUrl);qrUrl = '';zoomImage.removeAttribute('src');
    view.replaceChildren();
    [...nav.children].forEach((node, i) => node.setAttribute('aria-pressed', String(i === index)));
    if (!entry) {
      const empty = el('div', 'wa-empty');empty.append(el('h2', '', canEdit ? '웹앱을 등록해 함께 실습해 보세요' : '아직 등록된 웹앱이 없습니다.'));
      if (canEdit) { const add = button('+ 웹앱 등록', 'button primary');add.onclick = openSettings;empty.append(add); }
      view.append(empty);return;
    }
    const layout = el('div', `wa-layout${canEdit ? '' : ' wa-student-only'}`);
    if (canEdit) {
      const dashboard = el('section', 'wa-dashboard'), heading = el('div', 'wa-panel-heading');
      heading.append(el('h2', '', entry.title), link('새 창으로 열기 ↗', entry.teacherUrl));
      const preview = link('', entry.teacherUrl);preview.className = 'wa-preview';preview.setAttribute('aria-label', `${entry.title} 교사 대시보드 새 창으로 열기`);
      const media = el('div', 'wa-preview-media'), image = el('img'), loading = el('p', 'wa-preview-status', '미리보기 불러오는 중…');
      const thumbnail = entry.thumbnailUrl || webAppThumbnailUrl(entry.teacherUrl);
      image.alt = `${entry.title} ${entry.thumbnailUrl ? '등록한 화면' : '공개 첫 화면'} 미리보기`;image.referrerPolicy = 'no-referrer';image.decoding = 'async';image.hidden = true;
      image.onload = () => { image.hidden = false;loading.hidden = true; };
      image.onerror = () => { image.hidden = true;loading.textContent = '미리보기를 불러오지 못했습니다.'; };
      if (thumbnail) image.src = thumbnail;else loading.textContent = '새 창에서 교사 화면을 열어 주세요.';
      const caption = el('div', 'wa-preview-caption');caption.append(el('span', '', entry.thumbnailUrl ? '등록한 이미지' : '공개 첫 화면'), el('strong', '', '교사 화면 열기 ↗'));
      media.append(image, loading);preview.append(media, caption);
      dashboard.append(heading, preview);layout.append(dashboard);
    }
    const join = el('aside', 'wa-join'), qrButton = button('', 'qr-expand'), image = el('img'), status = el('p', 'wa-status');
    join.setAttribute('aria-label', `${entry.title} 학생 참여`);status.setAttribute('role', 'status');
    qrButton.disabled = true;qrButton.setAttribute('aria-label', '학생 참여 QR코드 확대');qrButton.setAttribute('aria-haspopup', 'dialog');qrButton.title = 'QR코드 확대';
    image.alt = '학생 참여 QR코드';image.width = image.height = 216;qrButton.append(image);
    qrButton.onclick = () => { zoomTitle.textContent = entry.title;zoom.showModal(); };
    const copy = button('링크 복사');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(entry.studentUrl);status.textContent = '학생 참여 링크를 복사했습니다.'; }
      catch { status.textContent = '학생 화면을 열어 주소를 복사해 주세요.'; }
    };
    join.append(el('h2', '', '학생 참여'), qrButton, link('학생 화면 열기 ↗', entry.studentUrl), copy, status);
    layout.append(join);view.append(layout);
    fetchQr(`${route}/web-apps/${index}/qr${scope}`).then(async response => {
      if (!response.ok) throw new Error('QR코드를 불러오지 못했습니다. 학생 화면 링크를 이용해 주세요.');
      const blob = await response.blob();
      if (request !== qrRequest || !host.isConnected) return;
      qrUrl = URL.createObjectURL(blob);image.src = zoomImage.src = qrUrl;qrButton.disabled = false;
    }).catch(error => { if (request === qrRequest && host.isConnected) status.textContent = error.message; });
  };
  const draw = () => {
    nav.replaceChildren();configure.hidden = !canEdit || !apps.length;
    apps.forEach((entry, index) => {
      const choice = button(entry.title);choice.onclick = () => select(index);nav.append(choice);
    });
    const next = Math.max(0, Math.min(active, apps.length - 1));active = -1;select(next);
  };

  const dialog = el('dialog', 'confirm-dialog wa-settings');dialog.setAttribute('aria-labelledby', 'wa-settings-heading');
  const form = el('form'), title = el('h2', '', '웹앱 설정'), list = el('div', 'wa-fields'), add = button('+ 웹앱 추가'), actions = el('div', 'dialog-actions'), cancel = button('취소'), save = button('저장', 'button primary'), status = el('p', 'wa-status');
  title.id = 'wa-settings-heading';status.setAttribute('role', 'status');save.type = 'submit';
  const note = el('p', 'wa-settings-note', '이 페이지를 사용하는 모든 연수에 반영됩니다. 같은 방·수업의 교사 URL과 학생 URL을 넣어 주세요.');
  actions.append(cancel, save);form.append(title, note, list, add, status, actions);dialog.append(form);host.append(dialog);
  const mark = () => { dirty = true;status.textContent = ''; };
  const addRow = (entry = {}) => {
    const row = el('fieldset', 'wa-setting-row');row.append(el('legend', '', '웹앱'));
    for (const [key, text, type, max] of [['title', '웹앱 이름', 'text', 120], ['teacherUrl', '교사 대시보드 URL', 'url', 2000], ['studentUrl', '학생 참여 URL', 'url', 2000], ['thumbnailUrl', '썸네일 이미지 URL (선택)', 'url', 2000]]) {
      const label = el('label', '', text), input = el('input');
      input.name = key;input.type = type;input.required = key !== 'thumbnailUrl';input.maxLength = max;input.value = entry[key] || '';
      if (type === 'url') input.placeholder = 'https://';
      label.append(input);row.append(label);
    }
    const remove = button('삭제', 'text-button danger');remove.setAttribute('aria-label', `${entry.title || '웹앱'} 설정 삭제`);
    remove.onclick = () => { row.remove();add.disabled = list.children.length >= 20;mark(); };
    row.append(remove);list.append(row);add.disabled = list.children.length >= 20;
    return row;
  };
  function openSettings() {
    if (!canEdit) return;
    list.replaceChildren();(apps.length ? apps : [{}]).forEach(addRow);status.textContent = '';dirty = false;dialog.showModal();
  }
  configure.onclick = openSettings;
  add.onclick = () => { const row = addRow();mark();row.querySelector('input').focus(); };
  cancel.onclick = () => { dirty = false;dialog.close(); };
  dialog.oncancel = event => { if (save.disabled) event.preventDefault();else dirty = false; };
  form.addEventListener('input', mark);
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault();event.returnValue = ''; } });
  form.onsubmit = async event => {
    event.preventDefault();
    let next;
    try { next = webAppDefinitions([...list.children].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.name, input.value])))); }
    catch (error) { status.textContent = error.message;return; }
    const controls = [...form.querySelectorAll('input,button')];controls.forEach(node => { node.disabled = true; });status.textContent = '저장 중…';
    try {
      const updated = await api(route, 'PATCH', { webApps: next, webAppsRevision: revision });
      apps = webAppDefinitions(updated.webApps);revision = updated.webAppsRevision;page.webApps = apps;page.webAppsRevision = revision;
      dirty = false;dialog.close();draw();
    } catch (error) { status.textContent = error.message; }
    finally { controls.forEach(node => { node.disabled = false; });add.disabled = list.children.length >= 20; }
  };
  draw();
}
