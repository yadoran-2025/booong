import { webAppDefinitions, webAppThumbnailUrl, DEFAULT_WEB_APP_TYPES, validateWebAppTypes } from './web-app-config.js';
import { prepareWebAppThumbnail } from './web-app-thumbnail.js';
import { resolveWebApp } from './web-app-lessons.js';

function el(tag, className = '', text) {
  const node = document.createElement(tag);node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className = 'button') { const node = el('button', className, text);node.type = 'button';return node; }
function link(text, url) { const node = el('a', 'button', text);node.href = url;node.target = '_blank';node.rel = 'noopener noreferrer';return node; }
function closeOnBackdrop(dialog, close) {
  let startedOutside = false;
  const outside = event => {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom;
  };
  dialog.onpointerdown = event => { startedOutside = event.button === 0 && outside(event); };
  dialog.onclick = event => { if (startedOutside && outside(event)) close();startedOutside = false; };
}

export function mountWebApps(root, page, { api, fetchQr, sessionId, canEdit, lessons = [], catalogError = '' }) {
  root.classList.remove('lp-standalone');root.classList.add('lp-web-apps-page');
  const host = el('section', 'wa-host');root.append(host);
  let types = validateWebAppTypes(page.webAppTypes ?? DEFAULT_WEB_APP_TYPES), typesDirty = false, typesSaving = false;
  let apps = webAppDefinitions(page.webApps || []), revision = page.webAppsRevision || 0, qrUrl = '', qrRequest = 0, dirty = false;
  const toolbar = el('div', 'wa-toolbar'), view = el('div', 'wa-groups');
  view.setAttribute('aria-label', '실습할 웹앱');
  const configure = button('웹앱 설정'), add = button('+ 웹앱 추가'), tools = el('div', 'wa-toolbar-actions');tools.hidden = !canEdit;
  const editTypes = button('유형 수정');editTypes.hidden = !canEdit;
  tools.append(add, configure, editTypes);toolbar.append(tools);toolbar.hidden = !canEdit;host.append(toolbar, view);
  const scope = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
  const route = `/api/pages/${encodeURIComponent(page.id)}`;
  const typesDialog = el('dialog', 'confirm-dialog wa-types-dialog'), typesForm = el('form'), typesDialogTitle = el('h2', '', '웹앱 유형 수정'), typeRows = el('div', 'wa-type-rows'), addType = button('+ 유형 추가'), typesStatus = el('p', 'wa-status'), typesActions = el('div', 'dialog-actions'), cancelTypes = button('취소'), saveTypes = button('저장', 'button primary');
  typesDialogTitle.id = 'wa-types-dialog-heading';typesDialog.setAttribute('aria-labelledby', typesDialogTitle.id);typesStatus.setAttribute('role', 'status');saveTypes.type = 'submit';
  typesActions.append(cancelTypes, saveTypes);typesForm.append(typesDialogTitle, typeRows, addType, typesStatus, typesActions);typesDialog.append(typesForm);host.append(typesDialog);
  const markTypes = () => { typesDirty = true;typesStatus.textContent = ''; };
  const numberTypes = () => {
    [...typeRows.children].forEach((row, index) => { row.children[0].textContent = `${index + 1}번`;row.querySelector('input[type="text"]').setAttribute('aria-label', `${index + 1}번 유형 이름`); });
    addType.disabled = typeRows.children.length >= 20;
  };
  const addTypeRow = (type = { id: `type-${crypto.randomUUID()}`, label: '' }) => {
    const row = el('div', 'wa-type-row'), number = el('span'), input = el('input'), id = el('input'), remove = button('삭제', 'text-button danger');
    input.type = 'text';input.value = type.label;input.required = true;input.maxLength = 300;input.oninput = markTypes;
    id.type = 'hidden';id.value = type.id;
    remove.setAttribute('aria-label', `${type.label || '새 유형'} 삭제`);remove.onclick = () => { if (typesSaving) return;row.remove();numberTypes();markTypes();if (apps.some(entry => entry.typeId === type.id)) typesStatus.textContent = '삭제한 유형에 속한 웹앱은 미지정으로 바뀝니다.'; };
    row.append(number, input, id, remove);typeRows.append(row);numberTypes();return input;
  };
  addType.onclick = () => { if (typesSaving || typeRows.children.length >= 20) return;addTypeRow().focus();markTypes(); };
  editTypes.onclick = () => { if (!canEdit) return;typeRows.replaceChildren();types.forEach(addTypeRow);numberTypes();typesStatus.textContent = '';typesDirty = false;typesDialog.showModal();(typeRows.querySelector('input[type="text"]') || addType).focus(); };
  cancelTypes.onclick = () => { if (typesSaving) return;typesDirty = false;typesDialog.close(); };
  closeOnBackdrop(typesDialog, () => cancelTypes.onclick());
  typesDialog.oncancel = event => { if (typesSaving) event.preventDefault();else typesDirty = false; };
  typesForm.onsubmit = async event => {
    event.preventDefault();if (!canEdit || typesSaving) return;
    let next;
    try { next = validateWebAppTypes([...typeRows.children].map(row => ({ id: row.querySelector('input[type="hidden"]').value, label: row.querySelector('input[type="text"]').value }))); }
    catch (error) { typesStatus.textContent = error.message;return; }
    typesSaving = true;const controls = [...typesForm.querySelectorAll('input,button')];controls.forEach(node => { node.disabled = true; });typesStatus.textContent = '저장 중…';
    try {
      const updated = await api(route, 'PATCH', { webAppTypes: next, webAppsRevision: revision });
      types = validateWebAppTypes(updated.webAppTypes);revision = updated.webAppsRevision;page.webAppTypes = types;page.webAppsRevision = revision;
      if (updated.webApps) { apps = webAppDefinitions(updated.webApps);page.webApps = apps; }
      typesDirty = false;typesDialog.close();draw();
    } catch (error) { typesStatus.textContent = error.message; }
    finally { typesSaving = false;controls.forEach(node => { node.disabled = false; });numberTypes(); }
  };

  const zoom = el('dialog', 'confirm-dialog qr-dialog');zoom.setAttribute('aria-labelledby', 'wa-qr-heading');
  const zoomHeader = el('div', 'qr-dialog-heading'), zoomTitle = el('h2'), zoomClose = button('닫기'), zoomImage = el('img'), zoomStatus = el('p', 'wa-status'), zoomActions = el('div', 'wa-card-actions'), studentLink = link('학생 화면 열기 ↗', ''), copy = button('링크 복사');
  zoomTitle.id = 'wa-qr-heading';zoomClose.autofocus = true;zoomImage.alt = '학생 참여 QR코드';
  zoom.id = 'wa-qr-dialog';zoomStatus.setAttribute('role', 'status');
  zoomHeader.append(zoomTitle, zoomClose);zoomActions.append(studentLink, copy);zoom.append(zoomHeader, zoomImage, zoomStatus, zoomActions);host.append(zoom);
  zoomClose.onclick = () => zoom.close();
  closeOnBackdrop(zoom, () => zoom.close());
  zoom.onclose = () => {
    qrRequest++;if (qrUrl) URL.revokeObjectURL(qrUrl);qrUrl = '';zoomImage.removeAttribute('src');
  };
  copy.onclick = async () => {
    const request = qrRequest, url = studentLink.href;
    try { await navigator.clipboard.writeText(url);if (request === qrRequest) zoomStatus.textContent = '학생 참여 링크를 복사했습니다.'; }
    catch { if (request === qrRequest) zoomStatus.textContent = '학생 화면을 열어 주소를 복사해 주세요.'; }
  };
  const showQr = async (entry, index) => {
    const request = ++qrRequest;
    if (qrUrl) URL.revokeObjectURL(qrUrl);qrUrl = '';zoomImage.removeAttribute('src');zoomImage.hidden = true;
    zoomTitle.textContent = entry.title;studentLink.href = entry.studentUrl;zoomStatus.textContent = 'QR코드 불러오는 중…';zoom.showModal();
    try {
      const response = await fetchQr(`${route}/web-apps/${index}/qr${scope}`);
      if (!response.ok) throw new Error('QR코드를 불러오지 못했습니다. 학생 화면 링크를 이용해 주세요.');
      const blob = await response.blob();
      if (request !== qrRequest || !host.isConnected || !zoom.open) return;
      qrUrl = URL.createObjectURL(blob);zoomImage.src = qrUrl;zoomImage.hidden = false;zoomStatus.textContent = '';
    } catch (error) { if (request === qrRequest && host.isConnected && zoom.open) zoomStatus.textContent = error.message; }
  };
  const draw = () => {
    view.replaceChildren();configure.hidden = !canEdit || !apps.length;add.disabled = apps.length >= 20;
    if (zoom.open) zoom.close();
    if (!apps.length) {
      const empty = el('div', 'wa-empty');empty.append(el('h2', '', canEdit ? '웹앱을 등록해 함께 실습해 보세요' : '아직 등록된 웹앱이 없습니다.'));
      view.append(empty);return;
    }
    const groups = new Map();
    apps.forEach((stored, index) => {
      const entry = resolveWebApp(stored, lessons);
      const card = el('article', 'wa-card'), body = el('div', 'wa-card-body'), actions = el('div', 'wa-card-actions');
      const preview = entry.teacherUrl ? link('', entry.teacherUrl) : el('div');preview.className = 'wa-preview';preview.setAttribute('aria-label', `${entry.title} 교사 대시보드 새 창으로 열기`);
      const media = el('div', 'wa-preview-media'), image = el('img'), loading = el('p', 'wa-preview-status', '미리보기 불러오는 중…');
      const customImage = entry.thumbnailImage || entry.thumbnailUrl;
      const thumbnail = customImage || webAppThumbnailUrl(entry.teacherUrl);
      image.alt = `${entry.title} ${customImage ? '등록한 화면' : '공개 첫 화면'} 미리보기`;image.referrerPolicy = 'no-referrer';image.decoding = 'async';image.loading = 'lazy';
      image.onload = () => { image.hidden = false;loading.hidden = true; };
      image.onerror = () => { image.hidden = true;loading.textContent = '미리보기를 불러오지 못했습니다.'; };
      if (thumbnail) image.src = thumbnail;else loading.textContent = '새 창에서 교사 화면을 열어 주세요.';
      media.append(image, loading);preview.append(media);card.append(preview);
      body.append(el('h3', '', entry.title));
      const typeIndex = types.findIndex(type => type.id === entry.typeId);
      const key = typeIndex >= 0 ? entry.typeId : '';
      if (!groups.has(key)) {
        const section = el('section', 'wa-group'), heading = el('h2', '', typeIndex >= 0 ? `${typeIndex + 1}번 유형 · ${types[typeIndex].label}` : '미지정'), gallery = el('div', 'wa-gallery');
        heading.id = `wa-group-${key || 'unassigned'}`;section.setAttribute('aria-labelledby', heading.id);section.append(heading, gallery);groups.set(key, { section, gallery });
      }
      const openUrl = entry.teacherUrl;
      if (openUrl) actions.append(link('앱 열기 ↗', openUrl));
      if (entry.studentUrl) {
        const qr = button('학생 QR');qr.setAttribute('aria-haspopup', 'dialog');qr.setAttribute('aria-controls', zoom.id);qr.setAttribute('aria-label', `${entry.title} 학생 QR`);
        qr.onclick = () => showQr(entry, index);actions.append(qr);
      }
      body.append(actions);card.append(body);groups.get(key).gallery.append(card);
    });
    [...types.map(type => type.id), ''].forEach(key => { if (groups.has(key)) view.append(groups.get(key).section); });
  };

  const dialog = el('dialog', 'confirm-dialog wa-settings');dialog.setAttribute('aria-labelledby', 'wa-settings-heading');
  const form = el('form'), title = el('h2', '', '웹앱 설정'), list = el('div', 'wa-fields'), actions = el('div', 'dialog-actions'), cancel = button('취소'), save = button('저장', 'button primary'), status = el('p', 'wa-status');
  const header = el('header', 'wa-settings-header'), heading = el('div', 'wa-settings-heading'), closeSettings = button('닫기'), rowNav = el('div', 'wa-editor-nav'), body = el('div', 'wa-settings-body'), footer = el('footer', 'wa-settings-footer');
  rowNav.setAttribute('role', 'group');rowNav.setAttribute('aria-label', '편집할 웹앱');
  title.id = 'wa-settings-heading';status.setAttribute('role', 'status');save.type = 'submit';form.noValidate = true;
  const note = el('p', 'wa-settings-note', '이 페이지를 사용하는 모든 연수에 반영됩니다.');
  heading.append(title, closeSettings);header.append(heading, note, rowNav);body.append(list);actions.append(cancel, save);footer.append(status, actions);form.append(header, body, footer);dialog.append(form);host.append(dialog);
  const mark = () => { dirty = true;status.textContent = ''; };
  let preparingImages = 0, saving = false, activeRow;
  const showRow = row => {
    activeRow = row;
    [...list.children].forEach((item, index) => { item.hidden = item !== row;rowNav.children[index]?.setAttribute('aria-pressed', String(item === row)); });
    body.scrollTop = 0;
    if (dialog.open) rowNav.children[[...list.children].indexOf(row)]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const drawRowNav = () => {
    rowNav.replaceChildren();
    [...list.children].forEach(row => {
      const lesson = lessons.find(lesson => lesson.id === row.querySelector('[name="lessonId"]').value);
      const choice = button(lesson?.title || row.querySelector('[name="title"]')?.value || '새 웹앱');choice.onclick = () => showRow(row);rowNav.append(choice);
    });
    showRow([...list.children].includes(activeRow) ? activeRow : list.children[0]);
  };
  const addRow = (entry = {}) => {
    const row = el('fieldset', 'wa-setting-row');row.append(el('legend', '', '웹앱'));
    const linked = !!entry.lessonId, legacy = !linked && !!entry.title, lesson = lessons.find(lesson => lesson.id === entry.lessonId);
    const lessonId = el('input');lessonId.type = 'hidden';lessonId.name = 'lessonId';lessonId.value = entry.lessonId || '';row.append(lessonId);
    const choose = button(linked ? '수업 변경' : legacy ? 'BOOONG 수업 연결' : 'BOOONG 수업 고르기'), picker = el('div', 'wa-lesson-picker'), searchLabel = el('label', '', 'BOOONG 수업 검색'), search = el('input'), results = el('div', 'wa-lesson-results');
    search.type = 'search';search.placeholder = '수업 이름 또는 과목';searchLabel.append(search);picker.append(searchLabel, results);
    picker.hidden = linked || legacy;choose.setAttribute('aria-expanded', String(!picker.hidden));
    const renderLessons = () => {
      results.replaceChildren();
      if (catalogError) { results.append(el('p', 'wa-status', catalogError));return; }
      const query = search.value.trim().normalize('NFKC').toLowerCase();
      const matches = lessons.filter(lesson => lesson.searchText.includes(query));
      matches.forEach(lesson => {
        const choice = button('', 'button wa-lesson-choice'), image = el('img');image.src = lesson.thumbnailUrl;image.alt = '';image.loading = 'lazy';
        choice.append(image, el('span', '', lesson.title));
        choice.onclick = () => {
          const teacherUrl = row.querySelector('[name="teacherUrl"]').value;
          let keepTeacher = false;
          try { keepTeacher = legacy && new URL(teacherUrl).origin === new URL(lesson.teacherUrl).origin; } catch {}
          const next = addRow({ lessonId: lesson.id, typeId: row.querySelector('[name="typeId"]').value, ...(keepTeacher ? { teacherUrl } : {}), studentUrl: row.querySelector('[name="studentUrl"]').value });
          row.replaceWith(next);activeRow = next;drawRowNav();mark();next.querySelector('[name="teacherUrl"]').focus();
        };
        results.append(choice);
      });
      if (!matches.length) results.append(el('p', 'wa-status', '선택할 수업이 없습니다.'));
    };
    search.value = '';search.oninput = renderLessons;search.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    choose.onclick = () => { picker.hidden = !picker.hidden;choose.setAttribute('aria-expanded', String(!picker.hidden));if (!picker.hidden) { renderLessons();search.focus(); } };
    if (linked) {
      const selected = el('div', 'wa-selected-lesson'), image = el('img');image.alt = '';image.hidden = !lesson?.thumbnailUrl;if (lesson?.thumbnailUrl) image.src = lesson.thumbnailUrl;
      selected.append(image, el('h3', '', lesson?.title || '연결된 수업을 찾을 수 없습니다.'));row.append(selected);
    }
    row.append(choose, picker);
    if (!picker.hidden) renderLessons();
    const typeGroup = el('fieldset', 'wa-type-options'), typeValue = el('input');typeValue.type = 'hidden';typeValue.name = 'typeId';typeValue.value = entry.typeId || '';
    typeGroup.append(el('legend', '', '유형'), typeValue);typeGroup.setAttribute('aria-label', `${lesson?.title || entry.title || '웹앱'} 유형`);
    const typeChoices = [{ id: '', label: '미지정' }, ...types.map((type, index) => ({ id: type.id, label: `${index + 1}번 · ${type.label}` }))];
    typeChoices.forEach(type => {
      const choice = button(type.label);choice.setAttribute('aria-pressed', String(typeValue.value === type.id));
      choice.onclick = () => { typeValue.value = type.id;[...typeGroup.querySelectorAll('button')].forEach(node => node.setAttribute('aria-pressed', String(node === choice)));mark(); };
      typeGroup.append(choice);
    });
    const fields = [...(legacy ? [['title', '웹앱 이름', 'text', 120]] : []), ['teacherUrl', '교사 링크 (필요하면 수정)', 'url', 2000], ['studentUrl', '학생 참여 URL (선택)', 'url', 2000], ...(legacy ? [['thumbnailUrl', '썸네일 이미지 URL (선택)', 'url', 2000]] : [])];
    for (const [key, text, type, max] of fields) {
      const label = el('label', '', text), input = el('input');
      input.name = key;input.type = type;input.required = key === 'title' || (key === 'teacherUrl' && legacy);input.maxLength = max;input.value = entry[key] || (key === 'teacherUrl' ? lesson?.teacherUrl || '' : '');
      if (type === 'url') input.placeholder = 'https://';
      label.append(input);row.append(label);
    }
    row.append(typeGroup);
    if (legacy) {
      const capture = el('div', 'wa-capture'), paste = button('캡처 이미지 붙여넣기'), clear = button('이미지 지우기', 'text-button'), preview = el('img'), imageValue = el('input'), imageStatus = el('p', 'wa-status');
      imageValue.type = 'hidden';imageValue.name = 'thumbnailImage';imageValue.value = entry.thumbnailImage || '';
      preview.alt = '붙여넣은 썸네일';imageStatus.setAttribute('role', 'status');
      const showImage = () => { preview.hidden = clear.hidden = !imageValue.value;if (imageValue.value) preview.src = imageValue.value;else preview.removeAttribute('src'); };
      let imageRequest = 0;
      const pasteImage = async file => {
        const request = ++imageRequest;preparingImages++;save.disabled = true;imageStatus.textContent = '이미지 준비 중…';
        try {
          const value = await prepareWebAppThumbnail(file);
          if (request !== imageRequest || !row.isConnected || !dialog.open) return;
          imageValue.value = value;showImage();mark();imageStatus.textContent = '저장을 누르면 썸네일에 적용됩니다.';
        } catch (error) { if (request === imageRequest && row.isConnected && dialog.open) imageStatus.textContent = error.message; }
        finally { preparingImages--;save.disabled = preparingImages > 0 || saving; }
      };
      row.onpaste = event => {
        const item = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
        if (item) { event.preventDefault();void pasteImage(item.getAsFile()); }
      };
      paste.onclick = async () => {
        try {
          const items = await navigator.clipboard.read();
          const item = items.find(item => item.types.some(type => ['image/png', 'image/jpeg', 'image/webp'].includes(type)));
          if (!item) throw new Error();
          await pasteImage(await item.getType(item.types.find(type => ['image/png', 'image/jpeg', 'image/webp'].includes(type))));
        } catch { imageStatus.textContent = '캡처를 복사한 뒤 이 버튼에서 ⌘V 또는 Ctrl+V를 눌러 주세요.'; }
      };
      clear.onclick = () => { imageRequest++;imageValue.value = '';showImage();mark();imageStatus.textContent = ''; };
      showImage();capture.append(paste, clear, preview, imageValue, imageStatus);row.append(capture);
    }
    const remove = button('삭제', 'text-button danger');remove.setAttribute('aria-label', `${entry.title || '웹앱'} 설정 삭제`);
    remove.onclick = () => { row.remove();drawRowNav();mark();rowNav.querySelector('button')?.focus(); };
    row.append(remove);list.append(row);
    return row;
  };
  function openSettings(addNew = false) {
    if (!canEdit || (addNew && apps.length >= 20)) return;
    list.replaceChildren();apps.forEach(addRow);status.textContent = '';dirty = false;
    title.textContent = addNew ? '웹앱 추가' : '웹앱 설정';
    const row = addNew || !apps.length ? addRow() : null;
    activeRow = row || list.children[0];drawRowNav();
    dialog.showModal();
    showRow(activeRow);
    if (row) row.querySelector('input[type="search"]').focus();
  }
  configure.onclick = () => openSettings();
  add.onclick = () => openSettings(true);
  cancel.onclick = () => { if (saving) return;dirty = false;dialog.close(); };
  closeSettings.onclick = () => cancel.onclick();closeOnBackdrop(dialog, () => cancel.onclick());
  dialog.oncancel = event => { if (saving) event.preventDefault();else dirty = false; };
  form.addEventListener('input', mark);
  window.addEventListener('beforeunload', event => { if (dirty || typesDirty) { event.preventDefault();event.returnValue = ''; } });
  form.onsubmit = async event => {
    event.preventDefault();
    if (save.disabled) return;
    for (const row of list.children) {
      const invalid = [...row.querySelectorAll('input')].find(input => !input.checkValidity());
      if (invalid) { showRow(row);invalid.reportValidity();return; }
      if (!row.querySelector('[name="lessonId"]').value && !row.querySelector('[name="title"]')) { showRow(row);status.textContent = 'BOOONG 수업을 골라 주세요.';row.querySelector('input[type="search"]').focus();return; }
    }
    let next;
    try { next = webAppDefinitions([...list.children].map(row => {
      const entry = Object.fromEntries([...row.querySelectorAll('input')].filter(input => input.name).map(input => [input.name, input.value]));
      const lesson = lessons.find(lesson => lesson.id === entry.lessonId);
      if (lesson && entry.teacherUrl.trim() === lesson.teacherUrl) delete entry.teacherUrl;
      return entry;
    })); }
    catch (error) { status.textContent = error.message;return; }
    saving = true;const controls = [...form.querySelectorAll('input,button')];controls.forEach(node => { node.disabled = true; });status.textContent = '저장 중…';
    try {
      const updated = await api(route, 'PATCH', { webApps: next, webAppsRevision: revision });
      apps = webAppDefinitions(updated.webApps);revision = updated.webAppsRevision;page.webApps = apps;page.webAppsRevision = revision;
      dirty = false;dialog.close();draw();
    } catch (error) { status.textContent = error.message; }
    finally { saving = false;controls.forEach(node => { node.disabled = false; });save.disabled = preparingImages > 0; }
  };
  draw();
}
