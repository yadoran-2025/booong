function el(tag, className = '', text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className = 'button') { const node = el('button', className, text); node.type = 'button'; return node; }
function field(text, value = '', multiline = false) {
  const label = el('label', 'survey-field', text), input = el(multiline ? 'textarea' : 'input');
  input.value = value; label.append(input);
  return { label, input };
}
function link(text, href, className = 'button') { const node = el('a', className, text); node.href = href; return node; }
const QUESTION_TYPES = [['choice', '객관식'], ['multiple', '복수 선택'], ['scale', '5점 척도'], ['text', '주관식']];

function renderSurveyResponses(root, survey, data) {
  root.replaceChildren(el('h2', '', `응답 ${data.responses.length}개`));
  data.responses.forEach((response, index) => {
    const card = el('article', 'survey-result-card'), answers = el('dl', 'survey-response-details');
    card.append(el('h3', '', `응답 ${index + 1}`));
    for (const question of survey.questions) {
      const value = response.answers[question.id];
      const answer = Array.isArray(value) ? value.join(', ') : question.type === 'scale' && value ? `${value}점` : value;
      answers.append(el('dt', '', question.title), el('dd', '', answer || '미응답'));
    }
    card.append(answers);root.append(card);
  });
  if (!data.responses.length) root.append(el('p', 'survey-empty', '아직 응답이 없습니다.'));
}

export function renderSurveyResults(root, data) {
  root.replaceChildren(el('h2', '', `응답 ${data.total}개`));
  for (const [index, question] of data.questions.entries()) {
    const card = el('article', 'survey-result-card');card.append(el('h3', '', `${index + 1}. ${question.title}`), el('p', 'survey-meta', `응답 ${question.answered}개${question.type === 'multiple' ? ' · 복수 선택' : ''}`));
    if (question.type !== 'text') {
      if (question.type === 'scale' && Number.isFinite(question.average)) card.append(el('p', 'survey-average', `평균 ${question.average.toFixed(1)} / 5점`));
      for (const option of question.options) {
        const row = el('div', 'survey-bar-row'), caption = el('div', 'survey-bar-caption');
        const percent = question.answered ? Math.round(option.count / question.answered * 100) : 0;
        caption.append(el('span', '', question.type === 'scale' ? `${option.label}점` : option.label), el('b', '', `${option.count}개 · ${percent}%`));
        const track = el('div', 'survey-bar-track'), fill = el('div', 'survey-bar-fill');fill.style.width = `${percent}%`;track.append(fill);row.append(caption, track);card.append(row);
      }
    } else {
      const list = el('ul', 'survey-text-answers');question.texts.forEach(text => list.append(el('li', '', text)));card.append(list);
    }
    if (!question.answered) card.append(el('p', 'survey-meta', '아직 응답이 없습니다.'));
    root.append(card);
  }
}

export async function mountSurvey(root, sessionId, api, session = null) {
  root.classList.add('lp-survey-page');
  root.classList.remove('lp-standalone');
  const heading = root.querySelector('.lp-page-intro h1'), intro = root.querySelector('.lp-page-overview p');
  const sessionName = session?.name || '';
  intro.textContent = '설문을 만들고, 응답을 모아 함께 살펴보세요.';
  const host = el('section', 'survey-host');root.append(host);
  const params = new URLSearchParams(location.search), id = params.get('survey');
  let managing = params.has('admin') || params.has('manage') || !sessionId;
  let dirty = false;
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  const urlFor = (survey = '', extra = {}) => {
    const url = new URL(location.href);
    for (const key of ['survey', 'edit', 'view', 'admin', 'manage']) url.searchParams.delete(key);
    if (managing) url.searchParams.set('admin', '1');
    if (sessionId) url.searchParams.set('s', sessionId);
    if (survey) url.searchParams.set('survey', survey);
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
    url.hash = '';return url.href;
  };
  const scope = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
  const showError = error => { host.replaceChildren(el('p', 'survey-error', error.message)); };
  const publicUrlFor = survey => {
    const url = new URL(urlFor(survey));
    for (const key of ['admin', 'manage', 'edit', 'view']) url.searchParams.delete(key);
    return url.href;
  };
  const copyLink = async (input, status, message) => {
    try { await navigator.clipboard.writeText(input.value);status.textContent = message; }
    catch { input.focus();input.select();status.textContent = '선택된 주소를 복사해 주세요.'; }
  };
  const summaryCard = (survey, extra = {}, heading = 'h2') => {
    const card = el('article', 'survey-card survey-summary'), content = el('div', 'survey-summary-content');
    content.append(el('p', 'survey-meta', `응답 ${survey.total}개`), el(heading, '', survey.title));
    if (survey.description) content.append(el('p', 'survey-summary-description', survey.description));
    const actions = el('div', 'survey-row');
    actions.append(link(extra.view === 'results' ? '결과 보기' : '설문 열기', urlFor(survey.id, extra)));
    card.append(content, actions);return card;
  };

  function editor(survey) {
    heading.textContent = survey ? '설문 편집' : '새 설문 만들기';
    intro.textContent = survey?.total ? '응답이 있어 제목과 소개만 수정할 수 있습니다.' : '직접 문항을 작성한 뒤 저장하고 응답을 열어 주세요.';
    const form = el('form', 'survey-editor'), list = el('div', 'survey-questions'), details = el('div', 'survey-details');
    const title = field('설문 제목', survey?.title), description = field('소개', survey?.description, true);
    title.input.required = true;title.input.maxLength = 120;description.input.maxLength = 1000;description.input.rows = 2;
    const questions = structuredClone(survey?.questions || []);
    let serial = 1;
    const locked = Boolean(survey?.total);
    const status = el('p', 'survey-status'); status.setAttribute('role', 'status');
    const renderQuestions = () => {
      list.replaceChildren();
      questions.forEach((question, index) => {
        const card = el('fieldset', 'survey-question'); card.disabled = locked;
        card.append(el('legend', '', `문항 ${index + 1}`));
        const name = field('질문', question.title);name.input.required = true;name.input.maxLength = 200;
        name.input.oninput = () => { question.title = name.input.value; };
        const types = el('div', 'survey-types'); types.setAttribute('role', 'group'); types.setAttribute('aria-label', `문항 ${index + 1} 유형`);
        const options = el('div', 'survey-options');
        const drawOptions = () => {
          const selectable = question.type === 'choice' || question.type === 'multiple';
          options.replaceChildren();options.hidden = !selectable;
          question.options.forEach((value, i) => {
            const row = el('div', 'survey-option-edit'), option = field(`선택지 ${i + 1}`, value);
            option.input.maxLength = 160;option.input.required = selectable;
            option.input.oninput = () => { question.options[i] = option.input.value; };
            const remove = button('삭제', 'text-button');remove.setAttribute('aria-label', `문항 ${index + 1} 선택지 ${i + 1} 삭제`);
            remove.onclick = () => { question.options.splice(i, 1);dirty = true;drawOptions(); };
            row.append(option.label, remove);options.append(row);
          });
          const add = button('+ 선택지 추가'); add.disabled = question.options.length >= 10;
          add.onclick = () => { question.options.push('');dirty = true;drawOptions(); };options.append(add);
        };
        for (const [type, label] of QUESTION_TYPES) {
          const choice = button(label);choice.setAttribute('aria-pressed', String(question.type === type));
          choice.onclick = () => {
            question.type = type;if (['choice', 'multiple'].includes(type) && !question.options.length) question.options = ['', ''];
            dirty = true;
            [...types.children].forEach(node => node.setAttribute('aria-pressed', String(node === choice)));drawOptions();
          };
          types.append(choice);
        }
        const required = el('label', 'survey-check'), checkbox = el('input');checkbox.type = 'checkbox';checkbox.checked = question.required;
        checkbox.onchange = () => { question.required = checkbox.checked;dirty = true; };required.append(checkbox, el('span', '', '필수 응답'));
        const remove = button('문항 삭제', 'text-button danger');remove.onclick = () => { questions.splice(index, 1);dirty = true;renderQuestions(); };
        const actions = el('div', 'survey-row');actions.append(required, remove);
        card.append(name.label, types, options, actions);list.append(card);drawOptions();
      });
    };
    const addButtons = el('div', 'survey-row survey-add-buttons');
    addButtons.setAttribute('role','group');addButtons.setAttribute('aria-label','문항 추가');
    for (const [type, label] of QUESTION_TYPES) {
      const add = button(`+ ${label} 문항`);add.disabled = locked;
      add.onclick = () => {
        if (questions.length >= 20) { status.textContent = '문항은 20개까지 작성할 수 있습니다.';return; }
        while (questions.some(question => question.id === `q${serial}`)) serial++;
        questions.push({ id: `q${serial++}`, title: '', type, required: true, options: ['choice', 'multiple'].includes(type) ? ['', ''] : [] });dirty = true;renderQuestions();
        list.lastElementChild.querySelector('input').focus();
      };addButtons.append(add);
    }
    const save = button('설문 저장', 'button primary');save.type = 'submit';
    const cancel = button('취소');
    cancel.onclick = () => { dirty = false;location.href = urlFor(survey?.id || ''); };
    const actions = el('div', 'survey-row survey-editor-actions');actions.append(cancel, save);
    details.append(title.label,description.label);
    form.append(details, list, addButtons, actions, status);
    form.addEventListener('input', () => { dirty = true; });
    form.onsubmit = async event => {
      event.preventDefault();save.disabled = true;status.textContent = '저장 중…';
      try {
        const data = await api(survey ? `/api/surveys/${survey.id}${scope}` : `/api/surveys${scope}`, survey ? 'PUT' : 'POST', {
          title: title.input.value, description: description.input.value, questions, ...(survey ? { revision: survey.revision } : {}),
        });
        dirty = false;location.href = urlFor(data.id, { view: 'results' });
      } catch (error) { status.textContent = error.message; }
      finally { save.disabled = false; }
    };
    host.replaceChildren(form);renderQuestions();
  }

  try {
    if (!sessionId) {
      heading.textContent = '연수별 설문 관리';intro.textContent = '연수별로 설문을 만들고 관리하세요.';
      let data;
      try { data = await api('/api/admin'); }
      catch { host.append(el('p', 'survey-empty', '참가자는 안내받은 연수 공유 링크로 접속해 주세요.'), link('관리자 로그인', '/studies/?admin=1&tab=classes'));return; }
      const list = el('div', 'survey-list survey-session-list');host.append(list);
      await Promise.all([...data.sessions].sort((a, b) => (b.lectureDate || '').localeCompare(a.lectureDate || '')).map(async session => {
        const card = el('article', 'survey-card survey-session'), header = el('div', 'survey-session-heading'), info = el('div', 'survey-summary-content');
        info.append(el('p', 'survey-meta', [session.school, session.lectureDate].filter(Boolean).join(' · ')), el('h2', '', session.name));
        header.append(info, link('설문 만들기',urlFor('new',{s:session.id}),'button primary'));
        const surveys = el('div', 'survey-list survey-summaries');card.append(header, surveys);list.append(card);
        const load = async () => {
          const status = el('p', 'survey-status', '설문을 불러오는 중…');status.setAttribute('role', 'status');surveys.replaceChildren(status);
          try {
            const data = await api(`/api/surveys?session=${encodeURIComponent(session.id)}`);
            surveys.replaceChildren(...data.surveys.map(survey => summaryCard(survey, { s: session.id }, 'h3')));
            if (!data.surveys.length) surveys.append(el('p', 'survey-status', '아직 만든 설문이 없습니다.'));
          } catch (error) {
            const retry = button('다시 불러오기');retry.onclick = load;
            surveys.replaceChildren(el('p', 'survey-error', error.message), retry);
          }
        };
        await load();
      }));
      if (!data.sessions.length) host.append(el('p', 'survey-empty', '먼저 연수를 만들어 주세요.'), link('연수 만들기', '/studies/?admin=1&new=1'));
      return;
    }
    if (!id || id === 'new') {
      const data = await api(`/api/surveys${scope}`);
      managing = data.admin;
      if (id === 'new') {
        if (!data.admin) throw new Error('설문 작성은 관리자만 할 수 있습니다.');
        editor(null);return;
      }
      const resultsOnly = !data.admin && params.get('view') === 'results';
      const surveys = resultsOnly ? data.surveys.filter(survey => survey.shareResults) : data.surveys;
      if (resultsOnly) heading.textContent = `${sessionName ? sessionName + ' ' : ''}설문 결과`;
      else if (sessionName) heading.textContent = `${sessionName} 설문`;
      intro.hidden = true;
      if (!surveys.length) {
        const empty = el('div', 'survey-list-empty');
        empty.append(el('h2', '', data.admin ? '첫 설문을 만들어 보세요' : resultsOnly ? '아직 공개된 설문 결과가 없습니다.' : '아직 공개된 설문이 없습니다.'));
        if (data.admin) empty.append(link('+ 새 설문 만들기', urlFor('new'), 'button primary'));
        host.append(empty);return;
      }
      const actions = el('div', 'survey-row survey-list-toolbar');
      actions.append(el('p', '', `설문 ${surveys.length}개`));
      if (data.admin) actions.append(link('+ 새 설문 만들기', urlFor('new'), 'button primary'));
      const list = el('div', 'survey-list survey-summaries');
      for (const survey of surveys) list.append(summaryCard(survey, resultsOnly ? { view: 'results' } : {}));
      host.append(actions, list);return;
    }
    let survey = await api(`/api/surveys/${encodeURIComponent(id)}${scope}`);
    managing = survey.admin;
    if (params.get('edit') === '1') {
      if (!survey.admin) throw new Error('설문 편집은 관리자만 할 수 있습니다.');
      editor(survey);return;
    }
    heading.textContent = survey.title;intro.textContent = survey.description;
    const fromResults = !survey.admin && params.get('view') === 'results';
    const back = link(fromResults ? '← 설문 결과 목록' : '← 설문 목록', urlFor('', fromResults ? { view: 'results' } : {}), 'text-link');
    const configure = button('설정');
    if (survey.admin) {
      root.classList.add('lp-survey-admin');
      const header = root.querySelector('.lp-page-intro'), overview = root.querySelector('.lp-page-overview');
      const titleRow = el('div', 'survey-detail-heading');titleRow.append(heading, configure);
      const context = el('div', 'survey-context');context.setAttribute('aria-label', '소속 연수');
      if (sessionName) context.append(el('strong', '', sessionName));
      const details = [session?.school, session?.lectureDate?.replaceAll('-', '.')].filter(Boolean).join(' · ');
      if (details) context.append(el('span', '', details));
      context.hidden = !sessionName && !details;overview.hidden = !survey.description;
      header.replaceChildren(back, context, titleRow, overview);
    } else host.append(back);
    const status = el('p', 'survey-status');status.setAttribute('role', 'status');
    const management = el('div', 'survey-management');
    const share = button('참가자 공개'), privateResults = button('운영자만');
    const shareBox = field('공개 설문 링크');shareBox.input.readOnly = true;shareBox.input.value = publicUrlFor(survey.id);
    const copy = button('설문 링크 복사', 'button primary');shareBox.label.hidden = true;shareBox.label.classList.add('survey-link-recovery');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(shareBox.input.value);shareBox.label.hidden = true;status.textContent = '설문 링크를 복사했습니다.'; }
      catch { shareBox.label.hidden = false;shareBox.input.focus();shareBox.input.select();status.textContent = '선택된 주소를 복사해 주세요.'; }
    };
    const preview = link('참가자 설문 열기 ↗', shareBox.input.value);preview.target = '_blank';preview.rel = 'noopener noreferrer';
    const toolbar = el('div', 'survey-detail-toolbar'), linkActions = el('div', 'survey-row');
    linkActions.append(copy, preview);toolbar.append(linkActions);
    const settings = el('div', 'survey-settings'), visibility = el('div', 'survey-setting');
    const visibilityChoices = el('div', 'survey-setting-choices');visibilityChoices.setAttribute('role', 'group');visibilityChoices.setAttribute('aria-label', '결과 공개');
    visibilityChoices.append(privateResults, share);visibility.append(el('h2', '', '결과 공개'), visibilityChoices);
    const privacy = el('p', 'survey-setting-help', '참가자에게 공개하면 설문의 결과 보기에서 집계와 주관식 답변을 볼 수 있습니다.');
    visibility.append(privacy);settings.append(visibility);
    management.append(settings);management.hidden = !survey.admin;
    const dialog = el('dialog', 'confirm-dialog survey-settings-dialog'), dialogHeading = el('div', 'survey-dialog-heading'), dismiss = button('닫기');
    const dialogTitle = el('h2', '', '설문 설정');dialogTitle.id = 'survey-settings-heading';dialog.setAttribute('aria-labelledby', dialogTitle.id);
    const settingsStatus = el('p', 'survey-status');settingsStatus.setAttribute('role', 'status');
    const editSurvey = link('설문 편집', urlFor(survey.id, { edit: '1' })), dialogActions = el('div', 'survey-dialog-actions');dialogActions.append(editSurvey);
    dialogHeading.append(dialogTitle, dismiss);dialog.append(dialogHeading, management, settingsStatus, dialogActions);
    configure.onclick = () => { settingsStatus.textContent = '';dialog.showModal(); };
    dismiss.onclick = () => dialog.close();
    dialog.oncancel = event => { if (share.disabled) event.preventDefault(); };
    editSurvey.onclick = event => { if (share.disabled) event.preventDefault(); };
    if (survey.admin) host.append(toolbar, shareBox.label, dialog);else host.append(management);

    const tabs = el('div', 'survey-tabs');tabs.setAttribute('role', 'group');tabs.setAttribute('aria-label', '설문 화면');
    const answerTab = button('설문 응답'), resultsTab = button('결과 보기'), responsesTab = button('개별 답변');responsesTab.hidden = !survey.admin;
    answerTab.hidden = survey.admin;
    tabs.append(answerTab, resultsTab, responsesTab);tabs.hidden = survey.admin;host.append(tabs, status);
    const form = el('form', 'survey-answer'), results = el('div', 'survey-results'), responses = el('div', 'survey-results survey-responses');responses.hidden = true;
    const disclosure = el('p', 'survey-disclosure');
    const fields = el('fieldset', 'survey-answer-fields'), submit = button('응답 제출', 'button primary'), edit = button('내 응답 수정');edit.hidden = true;submit.type = 'submit';
    fields.disabled = submit.disabled = true;
    const controls = new Map();
    for (const [index, question] of (survey.admin ? [] : survey.questions).entries()) {
      const card = el('fieldset', 'survey-question');
      const hints = [question.type === 'multiple' ? '복수 선택' : '', question.required ? '필수' : ''].filter(Boolean);
      card.append(el('legend', '', `${index + 1}. ${question.title}${hints.length ? ` (${hints.join(' · ')})` : ''}`));
      const inputs = [];
      if (question.type !== 'text') {
        const choices = question.type === 'scale' ? ['1', '2', '3', '4', '5'] : question.options;
        const group = el('div', question.type === 'scale' ? 'survey-scale' : 'survey-choices');
        for (const option of choices) {
          const label = el('label', 'survey-radio'), input = el('input');input.type = question.type === 'multiple' ? 'checkbox' : 'radio';input.name = question.id;input.value = option;input.required = question.required && question.type !== 'multiple';
          label.append(input, el('span', '', question.type === 'scale' ? `${option}점` : option));group.append(label);inputs.push(input);
        }
        card.append(group);
      } else {
        const input = el('textarea');input.name = question.id;input.required = question.required;input.maxLength = 1000;input.rows = 4;
        input.setAttribute('aria-label', question.title);card.append(input);inputs.push(input);
      }
      controls.set(question.id, inputs);fields.append(card);
    }
    const personalLink = el('div', 'survey-personal-link'), personalBox = field('내 응답 수정 링크'), copyPersonal = button('내 수정 링크 복사');
    personalBox.input.readOnly = true;personalLink.hidden = true;
    const personalRow = el('div', 'survey-share');personalRow.append(personalBox.label, copyPersonal);
    personalLink.append(personalRow, el('p', 'survey-disclosure', '다른 기기에서 수정하려면 이 링크를 보관하세요. 링크를 가진 사람은 내 응답을 보고 수정할 수 있습니다.'));
    form.append(disclosure, fields, submit, edit, personalLink);host.append(form, results, responses);
    let submitted = false, hasResponse = false, resultRevision = null, responseRevision = null, loading = false;
    let mode = survey.admin ? 'responses' : params.get('view') || 'answer';
    if (!['answer', 'results', 'responses'].includes(mode)) mode = 'answer';
    const key = `survey-response:${survey.id}`;
    const incomingToken = survey.admin ? null : new URLSearchParams(new URL(location.href).hash.slice(1)).get('response');
    if (incomingToken !== null && !/^[a-f0-9]{32}$/.test(incomingToken)) throw new Error('내 응답 수정 링크가 올바르지 않습니다. 보관한 링크를 다시 확인해 주세요.');
    let token = incomingToken;
    if (!survey.admin && !token) try { token = localStorage.getItem(key); } catch {}
    if (!survey.admin && !/^[a-f0-9]{32}$/.test(token || '')) {
      token = [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(key, token); } catch {}
    }
    if (!survey.admin) {
      const personalUrl = new URL(publicUrlFor(survey.id));personalUrl.hash = new URLSearchParams({ response: token }).toString();personalBox.input.value = personalUrl.href;
    }
    copyPersonal.onclick = () => copyLink(personalBox.input, status, '내 응답 수정 링크를 복사했습니다.');
    const paintState = () => {
      share.setAttribute('aria-pressed',String(survey.shareResults));privateResults.setAttribute('aria-pressed',String(!survey.shareResults));
      disclosure.textContent=(survey.shareResults?'응답은 설문의 결과 보기에서 이름 없이 집계됩니다.':'응답은 운영자만 확인할 수 있습니다.')+' 이 브라우저나 내 수정 링크에서 언제든 답을 수정할 수 있습니다.';
      fields.disabled = submitted;submit.hidden = submitted;submit.disabled = false;
      submit.textContent = hasResponse ? '수정 저장' : '응답 제출';
      edit.hidden = !submitted;personalLink.hidden = !hasResponse;resultsTab.hidden = survey.admin || !survey.shareResults;
    };
    const refreshResults = async () => {
      if ((!survey.admin&&!survey.shareResults) || loading) return;loading = true;
      try {
        const data = await api(`/api/surveys/${survey.id}/results${scope}${resultRevision === null ? '' : `&revision=${resultRevision}`}`);
        if (data.unchanged) return;
        resultRevision = data.revision;paintState();
        renderSurveyResults(results,data);
      } catch (error) { results.replaceChildren(el('p', 'survey-error', error.message));resultRevision = null; }
      finally { loading = false; }
    };
    const refreshResponses = async () => {
      if (!survey.admin || loading) return;loading = true;
      try {
        const data = await api(`/api/surveys/${survey.id}/responses${scope}${responseRevision === null ? '' : `&revision=${responseRevision}`}`);
        if (data.unchanged) return;
        survey = { ...survey, ...data };paintState();
        renderSurveyResponses(responses, survey, data);responseRevision = data.revision;
      } catch (error) { responses.replaceChildren(el('p', 'survey-error', error.message));responseRevision = null; }
      finally { loading = false; }
    };
    const activate = next => {
      const denied = next === 'responses' && !survey.admin || next === 'results' && !survey.admin && !survey.shareResults;
      mode = survey.admin ? 'responses' : denied ? 'answer' : next;
      form.hidden = mode !== 'answer';results.hidden = mode !== 'results';responses.hidden = mode !== 'responses';
      status.hidden = mode !== 'answer';
      answerTab.setAttribute('aria-pressed', String(mode === 'answer'));resultsTab.setAttribute('aria-pressed', String(mode === 'results'));responsesTab.setAttribute('aria-pressed', String(mode === 'responses'));
      if (mode === 'results') refreshResults();
      if (mode === 'responses') refreshResponses();
    };
    const settingsChange = async body => {
      share.disabled = privateResults.disabled = dismiss.disabled = true;
      try { survey = { ...survey, ...await api(`/api/surveys/${survey.id}${scope}`, 'PATCH', body) };settingsStatus.textContent = '설정을 저장했습니다.';resultRevision = null;paintState(); }
      catch (error) { settingsStatus.textContent = error.message;paintState(); }
      finally { share.disabled = privateResults.disabled = dismiss.disabled = false; }
    };
    share.onclick = () => { if (!survey.shareResults) return settingsChange({ shareResults: true }); };
    privateResults.onclick = () => { if (survey.shareResults) return settingsChange({ shareResults: false }); };
    answerTab.onclick = () => activate('answer');resultsTab.onclick = () => activate('results');responsesTab.onclick = () => activate('responses');
    edit.onclick = () => { submitted = false;paintState(); };
    form.onsubmit = async event => {
      event.preventDefault();if (survey.admin) return;submit.disabled = true;status.textContent = '제출 중…';
      const answers = Object.fromEntries(survey.questions.map(question => {
        const inputs = controls.get(question.id);
        return [question.id, question.type === 'multiple' ? inputs.filter(input => input.checked).map(input => input.value) : question.type === 'text' ? inputs[0].value : inputs.find(input => input.checked)?.value || ''];
      }));
      try {
        await api(`/api/surveys/${survey.id}/responses${scope}`, 'POST', { token, version: survey.version, answers });
        submitted = true;hasResponse = true;dirty = false;resultRevision = responseRevision = null;paintState();status.textContent = '응답을 저장했습니다.';
      } catch (error) { status.textContent = error.message;submit.disabled = false; }
    };
    form.addEventListener('input', () => { dirty = true; });
    const mine = survey.admin ? { answers: null } : await api(`/api/surveys/${survey.id}/my-response${scope}`, 'POST', { token });
    if (incomingToken && !mine.answers) throw new Error('이 수정 링크의 응답을 찾을 수 없습니다. 보관한 링크를 다시 확인해 주세요.');
    if (mine.answers) {
      try { localStorage.setItem(key, token); } catch {}
      for (const question of survey.questions) for (const input of controls.get(question.id)) {
        if (question.type === 'multiple') input.checked = (mine.answers[question.id] || []).includes(input.value);
        else if (question.type === 'text') input.value = mine.answers[question.id] || '';
        else input.checked = input.value === mine.answers[question.id];
      }
      submitted = hasResponse = true;status.textContent = '저장한 내 응답입니다. 언제든 수정할 수 있습니다.';
    }
    paintState();activate(mode);
    const timer = setInterval(() => {
      if (!host.isConnected) return clearInterval(timer);
      if (document.hidden) return;
      if (mode === 'results') refreshResults();
      if (mode === 'responses') refreshResponses();
    }, 3000);
  } catch (error) { showError(error); }
}
