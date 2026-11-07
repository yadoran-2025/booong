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

export async function mountSharedSurveyResults(root, sessionId, api) {
  root.setAttribute('aria-label','설문 응답 집계');
  let revision=null,loading=false;
  const status=el('p','survey-status');status.setAttribute('role','status');
  const refresh=async()=>{
    if(loading)return;loading=true;
    try{
      const {surveys}=await api(`/api/surveys?session=${encodeURIComponent(sessionId)}`);
      const visible=surveys.filter(survey=>survey.published&&survey.shareResults);
      const next=JSON.stringify(visible.map(survey=>[survey.id,survey.revision]));
      if(next===revision){status.textContent='';return;}
      const results=await Promise.all(visible.map(survey=>api(`/api/surveys/${encodeURIComponent(survey.id)}/results?session=${encodeURIComponent(sessionId)}`)));
      if(!root.isConnected)return;
      root.replaceChildren();root.hidden=!visible.length;
      visible.forEach((survey,index)=>{
        const section=el('section','survey-shared-result'),heading=el('div','survey-row');
        const url=new URL('/rice-basket/',location.href);url.search=new URLSearchParams({p:'page-4a2b86a58156',s:sessionId,survey:survey.id});
        heading.append(el('h2','',survey.title),link('설문 응답',url.href));
        const body=el('div','survey-results');renderSurveyResults(body,results[index]);
        section.append(heading,body);root.append(section);
      });
      status.textContent='';root.append(status);revision=next;
    }catch(error){
      // A sharing change can invalidate an in-flight result; never keep old answers visible after failure.
      root.replaceChildren(status);root.hidden=false;status.textContent='설문 집계를 불러오지 못했습니다. 잠시 후 다시 확인합니다.';revision=null;
    }finally{loading=false;}
  };
  await refresh();
  const timer=setInterval(()=>{if(!root.isConnected)return clearInterval(timer);if(!document.hidden)refresh();},3000);
}

export async function mountSurvey(root, sessionId, api, sessionName = '') {
  root.classList.add('lp-survey-page');
  root.classList.remove('lp-standalone');
  const heading = root.querySelector('.lp-page-intro h1'), intro = root.querySelector('.lp-page-overview p');
  intro.textContent = '설문을 만들고, 응답을 모아 함께 살펴보세요.';
  const host = el('section', 'survey-host');root.append(host);
  const params = new URLSearchParams(location.search), id = params.get('survey');
  let dirty = false;
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  const urlFor = (survey = '', extra = {}) => {
    const url = new URL(location.href);
    for (const key of ['survey', 'edit', 'view']) url.searchParams.delete(key);
    if (sessionId) url.searchParams.set('s', sessionId);
    if (survey) url.searchParams.set('survey', survey);
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
    url.hash = '';return url.href;
  };
  const scope = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
  const showError = error => { host.replaceChildren(el('p', 'survey-error', error.message)); };

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
      heading.textContent = '연수별 설문';intro.textContent = '연수별로 설문을 만들고 관리하세요.';
      let data;
      try { data = await api('/api/admin'); }
      catch { host.append(el('p', 'survey-empty', '참가자는 안내받은 연수 공유 링크로 접속해 주세요.'), link('관리자 로그인', '/rice-basket/?admin=1&tab=classes'));return; }
      const list = el('div', 'survey-list');
      for (const session of [...data.sessions].sort((a, b) => (b.lectureDate || '').localeCompare(a.lectureDate || ''))) {
        const card = el('article', 'survey-card');
        const actions=el('div','survey-row');
        actions.append(link('설문 만들기',urlFor('new',{s:session.id,manage:'1'}),'button primary'),link('설문 관리',urlFor('',{s:session.id,manage:'1'})));
        card.append(el('p', 'survey-meta', [session.school, session.lectureDate].filter(Boolean).join(' · ')), el('h2', '', session.name),actions);list.append(card);
      }
      host.append(list);
      if (!data.sessions.length) host.append(el('p', 'survey-empty', '먼저 연수를 만들어 주세요.'), link('연수 만들기', '/rice-basket/?admin=1&new=1'));
      return;
    }
    if (!id || id === 'new') {
      const data = await api(`/api/surveys${scope}`);
      if (id === 'new') {
        if (!data.admin) throw new Error('설문 작성은 관리자만 할 수 있습니다.');
        editor(null);return;
      }
      if (sessionName) heading.textContent = `${sessionName} 설문`;
      intro.hidden = true;
      if (!data.surveys.length) {
        const empty = el('div', 'survey-list-empty');
        empty.append(el('h2', '', data.admin ? '첫 설문을 만들어 보세요' : '아직 공개된 설문이 없습니다.'));
        if (data.admin) empty.append(link('+ 새 설문 만들기', urlFor('new'), 'button primary'));
        host.append(empty);return;
      }
      const actions = el('div', 'survey-row survey-list-toolbar');
      actions.append(el('p', '', `설문 ${data.surveys.length}개`));
      if (data.admin) actions.append(link('+ 새 설문 만들기', urlFor('new'), 'button primary'));
      const list = el('div', 'survey-list survey-summaries');
      for (const survey of data.surveys) {
        const card = el('article', 'survey-card survey-summary'), content = el('div', 'survey-summary-content');
        content.append(el('p', 'survey-meta', `${survey.open ? '응답 받는 중' : survey.published ? '마감' : '작성 중'} · 응답 ${survey.total}개`), el('h2', '', survey.title));
        if (survey.description) content.append(el('p', 'survey-summary-description', survey.description));
        card.append(content, link(data.admin ? '설문 관리' : '설문 열기', urlFor(survey.id)));
        list.append(card);
      }
      host.append(actions, list);return;
    }
    let survey = await api(`/api/surveys/${encodeURIComponent(id)}${scope}`);
    if (params.get('edit') === '1') {
      if (!survey.admin) throw new Error('설문 편집은 관리자만 할 수 있습니다.');
      editor(survey);return;
    }
    heading.textContent = survey.title;intro.textContent = survey.description;
    const back = link('← 설문 목록', urlFor(), 'text-link');host.append(back);
    const status = el('p', 'survey-status');status.setAttribute('role', 'status');
    const management = el('div', 'survey-management');
    const open = button(''), share = button('공유 화면에 집계 공개');
    const shareBox = field('응답 링크');shareBox.input.readOnly = true;const shareUrl = new URL(urlFor(survey.id));for(const key of ['admin','manage','edit','view'])shareUrl.searchParams.delete(key);shareBox.input.value = shareUrl.href;
    const copy = button('링크 복사');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(shareBox.input.value);status.textContent = '응답 링크를 복사했습니다.'; }
      catch { shareBox.input.focus();shareBox.input.select();status.textContent = '선택된 주소를 복사해 주세요.'; }
    };
    const shareRow = el('div', 'survey-share');shareRow.append(shareBox.label, copy);
    const settings = el('div', 'survey-row');settings.append(open, link('설문 편집', urlFor(survey.id, { edit: '1' })), share);
    management.append(settings, shareRow);management.hidden = !survey.admin;host.append(management);

    const tabs = el('div', 'survey-tabs');tabs.setAttribute('role', 'group');tabs.setAttribute('aria-label', '설문 화면');
    const answerTab = button('설문 응답'), resultsTab = button('결과 보기');tabs.append(answerTab, resultsTab);host.append(tabs, status);
    const form = el('form', 'survey-answer'), results = el('div', 'survey-results');
    const disclosure = el('p', 'survey-disclosure');
    const fields = el('fieldset', 'survey-answer-fields'), submit = button('응답 제출', 'button primary'), edit = button('내 응답 수정');edit.hidden = true;submit.type = 'submit';
    const controls = new Map();
    for (const [index, question] of survey.questions.entries()) {
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
    form.append(disclosure, fields, submit, edit);host.append(form, results);
    let submitted = false, mode = params.get('view') === 'results' || survey.admin && params.get('view') !== 'answer' ? 'results' : 'answer', resultRevision = null, loading = false;
    const key = `survey-response:${survey.id}`;
    let token;
    try { token = localStorage.getItem(key); } catch {}
    if (!/^[a-f0-9]{32}$/.test(token || '')) {
      token = [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(key, token); } catch {}
    }
    const paintState = () => {
      open.textContent = survey.open ? '응답 마감' : '응답 받기';share.setAttribute('aria-pressed',String(survey.shareResults));
      disclosure.textContent=survey.shareResults?'응답은 연수 공유 화면에 이름 없이 집계됩니다. 이 브라우저에서는 내 응답을 확인하고 수정할 수 있습니다.':'응답은 운영자만 확인할 수 있습니다. 이 브라우저에서는 내 응답을 확인하고 수정할 수 있습니다.';
      fields.disabled = !survey.open || submitted;submit.hidden = submitted;submit.disabled = !survey.open;
      edit.hidden = !submitted || !survey.open;resultsTab.hidden = !survey.admin&&!survey.shareResults;
      if (!survey.open) status.textContent = survey.published ? '마감된 설문입니다.' : '아직 응답을 열지 않았습니다.';
    };
    const refreshResults = async () => {
      if ((!survey.admin&&!survey.shareResults) || loading) return;loading = true;
      try {
        const data = await api(`/api/surveys/${survey.id}/results${scope}${resultRevision === null ? '' : `&revision=${resultRevision}`}`);
        if (data.unchanged) return;
        resultRevision = data.revision;survey.open = data.open;paintState();
        renderSurveyResults(results,data);
      } catch (error) { results.replaceChildren(el('p', 'survey-error', error.message));resultRevision = null; }
      finally { loading = false; }
    };
    const activate = next => {
      mode = next === 'results' && !survey.admin&&!survey.shareResults ? 'answer' : next;form.hidden = mode !== 'answer';results.hidden = mode !== 'results';
      answerTab.setAttribute('aria-pressed', String(mode === 'answer'));resultsTab.setAttribute('aria-pressed', String(mode === 'results'));
      if (mode === 'results') refreshResults();
    };
    const settingsChange = async body => {
      open.disabled = share.disabled = true;
      try { survey = { ...survey, ...await api(`/api/surveys/${survey.id}${scope}`, 'PATCH', body) };status.textContent = '설정을 저장했습니다.';resultRevision = null;paintState(); }
      catch (error) { status.textContent = error.message;paintState(); }
      finally { open.disabled = share.disabled = false; }
    };
    open.onclick = () => settingsChange({ open: !survey.open });share.onclick = () => settingsChange({ shareResults: !survey.shareResults });
    answerTab.onclick = () => activate('answer');resultsTab.onclick = () => activate('results');
    edit.onclick = () => { submitted = false;paintState(); };
    form.onsubmit = async event => {
      event.preventDefault();submit.disabled = true;status.textContent = '제출 중…';
      const answers = Object.fromEntries(survey.questions.map(question => {
        const inputs = controls.get(question.id);
        return [question.id, question.type === 'multiple' ? inputs.filter(input => input.checked).map(input => input.value) : question.type === 'text' ? inputs[0].value : inputs.find(input => input.checked)?.value || ''];
      }));
      try {
        await api(`/api/surveys/${survey.id}/responses${scope}`, 'POST', { token, version: survey.version, answers });
        submitted = true;dirty = false;resultRevision = null;paintState();status.textContent = '응답을 저장했습니다.';
      } catch (error) { status.textContent = error.message;submit.disabled = !survey.open; }
    };
    form.addEventListener('input', () => { dirty = true; });
    const mine = await api(`/api/surveys/${survey.id}/my-response${scope}`, 'POST', { token });
    if (mine.answers) {
      for (const question of survey.questions) for (const input of controls.get(question.id)) {
        if (question.type === 'multiple') input.checked = (mine.answers[question.id] || []).includes(input.value);
        else if (question.type === 'text') input.value = mine.answers[question.id] || '';
        else input.checked = input.value === mine.answers[question.id];
      }
      submitted = true;status.textContent = '이 브라우저에서 제출한 응답입니다.';
    }
    paintState();activate(mode);
    setInterval(() => { if (mode === 'results' && !document.hidden) refreshResults(); }, 3000);
  } catch (error) { showError(error); }
}
