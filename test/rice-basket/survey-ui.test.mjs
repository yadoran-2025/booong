import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountSurvey, renderSurveyResults } from '../../rice-basket/survey.js';
import { surveyResults } from '../../lib/rice-basket/survey.mjs';

function environment(t, search) {
  class Node {
    constructor(tag) { this.tag = tag; }
    children = [];attributes = {};style = {};isConnected = true;className = '';_text = '';
    classList = { add: name => { this.className += ` ${name}`; }, remove: name => { this.className = this.className.replace(name, ''); } };
    set textContent(value) { this._text = String(value);this.children = []; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    get lastElementChild() { return this.children.at(-1); }
    querySelector(selector) { return walk(this).slice(1).find(node => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tag === selector); }
    addEventListener() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
    select() {}
  }
  const document = { createElement: tag => new Node(tag), hidden: false };
  const title = new Node('h1'), intro = new Node('p'), root = new Node('main');
  const header = new Node('header'), overview = new Node('div');overview.append(intro);header.append(title, overview);root.append(header);
  root.querySelector = selector => selector.endsWith('h1') ? title : selector === '.lp-page-intro' ? header : selector === '.lp-page-overview' ? overview : intro;
  const storage = new Map(), intervals = [], events = {}, clipboard = [];
  const values = { document, navigator: { clipboard: { writeText: async text => clipboard.push(text) } }, window: { addEventListener(name, callback) { events[name] = callback; } }, location: { search, href: `http://localhost:3001/studies/?p=page-4a2b86a58156${search}` }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, setInterval: callback => { intervals.push(callback); } };
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original);else delete globalThis[key]; });
  }
  return { root, title, intervals, storage, events, clipboard };
}
function walk(node) { return [node, ...node.children.flatMap(walk)]; }
function byText(root, text) { return walk(root).find(node => node.tag === 'button' && node._text === text); }
function byClass(root, name) { return walk(root).find(node => node.className.split(' ').includes(name)); }
const survey = { id: 'survey1', sessionId: '', title: '사용자가 쓴 제목', description: '소개', admin: false, open: true, published: true, shareResults: true, total: 0, revision: 1, version: 1, responses: [], questions: [
  { id: 'q1', title: '선택 질문', type: 'choice', required: true, options: ['선택 A', '선택 B'] },
  { id: 'q2', title: '의견', type: 'text', required: false, options: [] },
] };

test('연수 선택에서 연수 홈 대신 해당 연수의 설문 작성·관리 화면으로 연결한다', async t => {
  const { root, title } = environment(t, '&survey=new');
  const requests = [];
  await mountSurvey(root, null, async route => {
    requests.push(route);
    if (route !== '/api/admin') return { admin: true, surveys: [] };
    return { sessions: [{ id: 'training1', name: '첫 연수', school: '학교', lectureDate: '2026-11-06' }, { id: 'training2', name: '다른 연수' }] };
  });
  assert.equal(title.textContent, '연수별 설문 관리');
  assert.deepEqual(requests, ['/api/admin', '/api/surveys?session=training1', '/api/surveys?session=training2']);
  assert.equal(byClass(root, 'survey-editor'), undefined);
  const links=walk(root).filter(node=>node.tag==='a');
  assert.deepEqual(links.map(node=>node.textContent),['설문 만들기','설문 만들기']);
  assert.deepEqual(links.map(node=>{const url=new URL(node.href);assert.equal(url.searchParams.get('p'),'page-4a2b86a58156');assert.equal(url.searchParams.get('admin'),'1');assert.equal(url.searchParams.has('manage'),false);return [url.searchParams.get('s'),url.searchParams.get('survey')];}),[['training1','new'],['training2','new']]);
});

test('참가자에게는 연수 목록을 노출하지 않고 받은 공유 링크를 안내한다', async t => {
  const { root } = environment(t, '');
  await mountSurvey(root, null, async () => { throw new Error('권한 없음'); });
  assert.match(root.textContent, /연수 공유 링크/);
  assert.equal(byClass(root, 'survey-list'), undefined);
});

test('선택한 연수의 설문만 요청하고 새 설문 링크에도 연수를 유지한다', async t => {
  const { root, title } = environment(t, '&s=training2');
  await mountSurvey(root, 'training2', async route => {
    assert.equal(route, '/api/surveys?session=training2');
    return { admin: true, surveys: [] };
  }, { name: '두 번째 연수' });
  assert.equal(title.textContent, '두 번째 연수 설문');
  const links = walk(root).filter(node => node.tag === 'a');
  assert.equal(links.length, 1, '빈 목록에서는 첫 설문 만들기만 제공한다');
  assert.match(byClass(root, 'survey-list-empty').textContent, /첫 설문/);
  const url = new URL(links[0].href);
  assert.equal(url.searchParams.get('s'), 'training2');
  assert.equal(url.searchParams.get('survey'), 'new');
});

test('참가자의 빈 설문 목록에는 만들기 버튼을 표시하지 않는다', async t => {
  const { root } = environment(t, '&s=training1');
  await mountSurvey(root, 'training1', async () => ({ admin: false, surveys: [] }));
  assert.match(byClass(root, 'survey-list-empty').textContent, /아직 공개된 설문이 없습니다/);
  assert.equal(walk(root).some(node => node.tag === 'a'), false);
});

test('연수 결과 목록은 공개된 설문만 표시하고 결과 화면으로 직접 연결한다', async t => {
  const { root, title } = environment(t, '&s=training1&view=results');
  await mountSurvey(root, 'training1', async route => {
    assert.equal(route, '/api/surveys?session=training1');
    return { admin: false, surveys: [{ ...survey, title: '공개 결과' }, { ...survey, id: 'private', title: '비공개 결과', shareResults: false }] };
  }, { name: '첫 연수' });
  assert.equal(title.textContent, '첫 연수 설문 결과');
  assert.match(root.textContent, /공개 결과/);assert.doesNotMatch(root.textContent, /비공개 결과/);
  const links = walk(root).filter(node => node.tag === 'a');
  assert.equal(links.length, 1);assert.equal(links[0].textContent, '결과 보기');
  const url = new URL(links[0].href);
  assert.equal(url.searchParams.get('s'), 'training1');assert.equal(url.searchParams.get('survey'), survey.id);assert.equal(url.searchParams.get('view'), 'results');
  assert.equal(url.searchParams.has('admin'), false);assert.equal(url.searchParams.has('manage'), false);
  assert.equal(byClass(root, 'survey-results'), undefined);
});

test('공개한 결과가 없으면 빈 결과 안내를 표시한다', async t => {
  const { root } = environment(t, '&s=training1&view=results');
  await mountSurvey(root, 'training1', async () => ({ admin: false, surveys: [{ ...survey, shareResults: false }] }));
  assert.match(byClass(root, 'survey-list-empty').textContent, /아직 공개된 설문 결과가 없습니다/);
  assert.equal(walk(root).some(node => node.tag === 'a'), false);
});

test('결과 링크는 응답 폼을 거치지 않고 결과를 열며 결과 목록으로 돌아간다', async t => {
  const { root } = environment(t, '&s=training1&survey=survey1&view=results');
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? { answers: { q1: '선택 A', q2: '저장한 의견' } }
    : route.includes('/results') ? { total: 1, revision: 1, open: true, questions: [] } : structuredClone(survey));
  await new Promise(setImmediate);
  assert.equal(byClass(root, 'survey-answer').hidden, true);
  assert.equal(byClass(root, 'survey-results').hidden, false);
  assert.match(byClass(root, 'survey-results').textContent, /응답 1개/);
  const back = walk(root).find(node => node.tag === 'a' && node.textContent === '← 설문 결과 목록');
  const url = new URL(back.href);assert.equal(url.searchParams.get('view'), 'results');assert.equal(url.searchParams.has('survey'), false);
  const status = walk(root).find(node => node._text === '저장한 내 응답입니다. 언제든 수정할 수 있습니다.');
  assert.equal(status.hidden, true);
  byText(root, '설문 응답').onclick();assert.equal(status.hidden, false);
});

test('빈 설문에서 직접 질문과 선택지를 작성해 저장한다', async t => {
  const { root } = environment(t, '&survey=new');let submitted;
  await mountSurvey(root, 'training1', async (route, method, body) => {
    if (method === 'POST') { submitted = { route, body };return { id: 'created' }; }
    return { admin: true, surveys: [] };
  });
  const editor = byClass(root, 'survey-editor');
  editor.children[0].querySelector('input').value = '나의 설문';
  byText(root, '+ 객관식 문항').onclick();
  const question = byClass(root, 'survey-questions').children[0];
  const name = byClass(question, 'survey-field').querySelector('input');name.value = '어떤 선택인가요?';name.oninput();
  const inputs = walk(byClass(question, 'survey-options')).filter(node => node.tag === 'input');
  inputs.forEach((input, i) => { input.value = `선택 ${i + 1}`;input.oninput(); });
  await editor.onsubmit({ preventDefault() {} });
  assert.equal(submitted.route, '/api/surveys?session=training1');
  assert.equal(new URL(location.href).searchParams.get('s'), 'training1');
  assert.equal(submitted.body.title, '나의 설문');
  assert.deepEqual(submitted.body.questions[0].options, ['선택 1', '선택 2']);
  assert.equal(submitted.body.questions[0].required, true);
  assert.match(location.href, /survey=created/);
  assert.equal(new URL(location.href).searchParams.get('view'),'results');
});

for (const [name, query, changed, destination] of [
  ['빈 새 설문', 'new', false, null],
  ['작성 중인 새 설문', 'new', true, null],
  ['기존 설문 편집', 'survey1&edit=1', true, 'survey1'],
]) test(`${name} 취소는 저장·유효성 검사 없이 이전 화면으로 이동한다`, async t => {
  const { root, events } = environment(t, `&s=training1&survey=${query}`);
  const requests = [];
  await mountSurvey(root, 'training1', async (route, method) => {
    requests.push({ route, method });
    return query === 'new' ? { admin: true, surveys: [] } : { ...structuredClone(survey), admin: true };
  });
  if (changed) byText(root, '+ 주관식 문항').onclick();
  let blocked = false;
  events.beforeunload({ preventDefault() { blocked = true; } });
  assert.equal(blocked, changed, '일반 이동에서는 미저장 변경을 보호한다');
  const cancel = byText(root, '취소');
  assert.equal(cancel.type, 'button');
  cancel.onclick();
  const destinationUrl = new URL(location.href);
  assert.equal(destinationUrl.searchParams.get('survey'), destination);
  assert.equal(destinationUrl.searchParams.get('s'), 'training1');
  assert.equal(destinationUrl.searchParams.get('p'), 'page-4a2b86a58156');
  assert.equal(destinationUrl.searchParams.has('edit'), false);
  blocked = false;
  events.beforeunload({ preventDefault() { blocked = true; } });
  assert.equal(blocked, false, '명시적 취소는 미저장 경고로 이동을 막지 않는다');
  assert.equal(requests.length, 1, '취소는 저장 요청을 보내지 않는다');
});

test('참여자는 익명 응답을 제출하고 자신의 응답만 확인한다', async t => {
  const { root, title } = environment(t, '&survey=survey1');let posted;
  await mountSurvey(root, 'training1', async (route, method, body) => {
    if (route.split('?')[0].endsWith('/my-response')) return { answers: null };
    if (route.split('?')[0].endsWith('/responses')) { posted = body;return { saved: true }; }
    if (route.includes('/results')) return { total: 1, revision: 2, open: true, questions: [{ id: 'q2', title: '意見', type: 'text', answered: 1, texts: ['<img onerror=alert(1)>'], options: [] }] };
    return structuredClone(survey);
  });
  assert.equal(title.textContent, survey.title);
  assert.equal(byClass(root, 'survey-management').hidden, true);
  const form = byClass(root, 'survey-answer');
  walk(form).find(node => node.name === 'q1' && node.value === '선택 B').checked = true;
  walk(form).find(node => node.name === 'q2').value = '실제 의견';
  await form.onsubmit({ preventDefault() {} });
  assert.deepEqual(posted.answers, { q1: '선택 B', q2: '실제 의견' });
  assert.match(posted.token, /^[a-f0-9]{32}$/);
  assert.equal(posted.version, 1);
  assert.equal(byClass(root, 'survey-answer-fields').disabled, true);
  assert.equal(byText(root, '내 응답 수정').hidden, false);
  assert.equal(byText(root, '결과 보기').hidden, false);
  byText(root, '결과 보기').onclick();await new Promise(setImmediate);
  assert.equal(byClass(root, 'survey-results').hidden, false);
  assert.match(byClass(root,'survey-disclosure').textContent,/이름 없이 집계/);
});

test('마감 후에도 제출 기록을 복구하고 내 응답을 수정한다', async t => {
  const { root } = environment(t, '&survey=survey1');
  let posted;
  await mountSurvey(root, 'training1', async (route, method, body) => {
    if (route.includes('/my-response')) return { answers: { q1: '선택 A', q2: '저장한 의견' } };
    if (route.includes('/responses')) { posted = body;return { saved: true }; }
    return { ...structuredClone(survey), open: false, shareResults: false };
  });
  assert.equal(walk(root).find(node => node.name === 'q2').value, '저장한 의견');
  assert.equal(byText(root, '수정 저장').hidden, true);
  assert.equal(byText(root, '내 응답 수정').hidden, false);
  assert.equal(byText(root, '결과 보기').hidden, true);
  assert.equal(byClass(root, 'survey-answer-fields').disabled, true);
  byText(root, '내 응답 수정').onclick();
  assert.equal(byClass(root, 'survey-answer-fields').disabled, false);
  assert.equal(byText(root, '수정 저장').disabled, false);
  walk(root).find(node => node.name === 'q2').value = '마감 후 수정';
  await byClass(root, 'survey-answer').onsubmit({ preventDefault() {} });
  assert.equal(posted.answers.q2, '마감 후 수정');
  assert.equal(byClass(root, 'survey-personal-link').hidden, false);
});


test('운영자 응답 링크에서는 관리 권한 매개변수를 제거한다', async t => {
  const { root } = environment(t, '&s=training1&manage=1&survey=survey1&view=results');
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? {answers:null} : route.includes('/results') ? {total:0, revision:1, open:true, questions:[]} : {...structuredClone(survey),admin:true});
  const share=walk(root).find(node=>node.tag==='input'&&node.readOnly);
  const url=new URL(share.value);
  assert.equal(url.searchParams.get('s'),'training1');
  assert.equal(url.searchParams.get('survey'),'survey1');
  for(const flag of ['admin','manage','edit','view'])assert.equal(url.searchParams.has(flag),false);
});

test('비공개 설문 결과는 운영자가 확인하며 응답 HTML은 실행하지 않는다', async t => {
  const { root } = environment(t, '&s=training1&manage=1&survey=survey1&view=results');
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? {answers:null} : route.includes('/responses') ? {revision:2, responses:[{answers:{q1:'선택 A',q2:'<img onerror=alert(1)>'}}]} : {...structuredClone(survey),admin:true,shareResults:false});
  await new Promise(setImmediate);
  const results=byClass(root,'survey-responses');
  assert.equal(results.hidden,false);
  assert.match(results.textContent,/<img onerror=alert\(1\)>/);
  assert.ok(!walk(results).some(node=>node.tag==='img'));
});

test('공개하지 않은 설문은 참가자가 결과 화면으로 전환할 수 없다',async t=>{
  const {root}=environment(t,'&s=training1&survey=survey1&view=results');
  let resultReads=0;
  await mountSurvey(root,'training1',async route=>{
    if(route.includes('/results')){resultReads++;throw new Error('비공개');}
    return route.includes('/my-response')?{answers:null}:{...structuredClone(survey),shareResults:false};
  });
  byText(root,'결과 보기').onclick();await new Promise(setImmediate);
  assert.equal(resultReads,0);assert.equal(byClass(root,'survey-results').hidden,true);
});

test('운영자는 공유 화면의 집계 공개를 직접 끌 수 있다',async t=>{
  const {root}=environment(t,'&s=training1&manage=1&survey=survey1');let settings;
  await mountSurvey(root,'training1',async(route,method,body)=>{
    if(method==='PATCH'){settings=body;return {shareResults:false};}
    if(route.includes('/results'))return {total:0,revision:1,open:true,questions:[]};
    return route.includes('/my-response')?{answers:null}:{...structuredClone(survey),admin:true};
  });
  const share=byText(root,'참가자 공개');assert.equal(share.attributes['aria-pressed'],'true');
  await byText(root,'운영자만').onclick();await new Promise(setImmediate);
  assert.deepEqual(settings,{shareResults:false});assert.equal(share.attributes['aria-pressed'],'false');
  assert.equal(byText(root,'운영자만').attributes['aria-pressed'],'true');
});

const newQuestions=[
  {id:'qmulti',title:'활용할 기능',type:'multiple',required:true,options:['A','B','C']},
  {id:'qscale',title:'만들 자신감',type:'scale',required:true,options:[]},
];

test('설문 작성에서 복수 선택과 5점 척도를 추가하고 그대로 저장한다',async t=>{
  const {root}=environment(t,'&survey=new');let posted;
  await mountSurvey(root,'training1',async(route,method,body)=>{
    if(method==='POST'){posted=body;return {id:'new-types'};}
    return {admin:true,surveys:[]};
  });
  byText(root,'+ 복수 선택 문항').onclick();
  let question=byClass(root,'survey-questions').children[0];
  const title=byClass(question,'survey-field').querySelector('input');title.value='활용할 기능';title.oninput();
  walk(byClass(question,'survey-options')).filter(node=>node.tag==='input').forEach((input,i)=>{input.value=['A','B'][i];input.oninput();});
  byText(root,'+ 5점 척도 문항').onclick();
  question=byClass(root,'survey-questions').children[1];
  const scaleTitle=byClass(question,'survey-field').querySelector('input');scaleTitle.value='만들 자신감';scaleTitle.oninput();
  assert.equal(byClass(question,'survey-options').hidden,true);
  assert.equal(byText(question,'5점 척도').attributes['aria-pressed'],'true');
  byClass(root,'survey-editor').children[0].querySelector('input').value='연수 확인';
  await byClass(root,'survey-editor').onsubmit({preventDefault(){}});
  assert.deepEqual(posted.questions.map(q=>q.type),['multiple','scale']);
  assert.deepEqual(posted.questions[0].options,['A','B']);
  assert.deepEqual(posted.questions[1].options,[]);
});

test('복수 선택·척도 응답을 복구하고 수정한 배열과 점수를 제출한다',async t=>{
  const {root}=environment(t,'&s=training1&survey=survey1');let posted;
  await mountSurvey(root,'training1',async(route,method,body)=>{
    if(route.includes('/my-response'))return {answers:{qmulti:['A','C'],qscale:'2'}};
    if(route.includes('/responses')){posted=body;return {saved:true};}
    return {...structuredClone(survey),questions:structuredClone(newQuestions)};
  });
  const form=byClass(root,'survey-answer');
  const multiple=walk(form).filter(node=>node.name==='qmulti'),scale=walk(form).filter(node=>node.name==='qscale');
  assert.deepEqual(multiple.filter(input=>input.checked).map(input=>input.value),['A','C']);
  assert.equal(scale.find(input=>input.checked).value,'2');
  assert.ok(multiple.every(input=>input.type==='checkbox'&&!input.required),'필수 복수 선택은 모든 체크박스를 필수로 만들지 않는다');
  assert.ok(scale.every(input=>input.type==='radio'&&input.required));
  byText(root,'내 응답 수정').onclick();
  multiple.forEach(input=>{input.checked=input.value!=='A';});scale.forEach(input=>{input.checked=input.value==='5';});
  await form.onsubmit({preventDefault(){}});
  assert.deepEqual(posted.answers,{qmulti:['B','C'],qscale:'5'});
});

test('공통 집계 화면은 복수 선택 응답 기준 비율과 5점 평균·분포를 표시한다',t=>{
  const {root}=environment(t,'');
  const data=surveyResults({questions:newQuestions,responses:[{answers:{qmulti:['A','B'],qscale:'5'}},{answers:{qmulti:['B'],qscale:'3'}},{answers:{qmulti:[],qscale:''}}]});
  renderSurveyResults(root,data);
  assert.match(root.textContent,/복수 선택/);
  assert.match(root.textContent,/1개 · 50%/);assert.match(root.textContent,/2개 · 100%/);
  assert.match(root.textContent,/평균 4\.0 \/ 5점/);
  for(const score of ['1점','2점','3점','4점','5점'])assert.ok(root.textContent.includes(score));
  renderSurveyResults(root,surveyResults({questions:newQuestions,responses:[]}));
  assert.doesNotMatch(root.textContent,/평균|NaN/);
  assert.match(root.textContent,/아직 응답이 없습니다/);
});

test('다른 기기에서는 개인 수정 링크의 토큰으로 같은 응답을 불러오고 다시 저장한다', async t => {
  const { root, storage } = environment(t, '&s=training1&survey=survey1');
  const token = 'd'.repeat(32);
  location.href += `#response=${token}`;
  storage.set('survey-response:survey1', 'e'.repeat(32));
  let posted;
  await mountSurvey(root, 'training1', async (route, method, body) => {
    if (route.includes('/my-response')) { assert.equal(body.token, token);return { answers: { q1: '선택 A', q2: '다른 기기의 응답' } }; }
    if (route.includes('/responses')) { posted = body;return { saved: true }; }
    return structuredClone(survey);
  });
  assert.equal(storage.get('survey-response:survey1'), token);
  assert.equal(walk(root).find(node => node.name === 'q2').value, '다른 기기의 응답');
  const input = walk(byClass(root, 'survey-personal-link')).find(node => node.tag === 'input');
  assert.equal(new URL(input.value).hash, `#response=${token}`);
  assert.equal(new URL(input.value).searchParams.has('response'), false, '비밀값은 서버로 전달되는 query에 넣지 않는다');
  byText(root, '내 응답 수정').onclick();
  walk(root).find(node => node.name === 'q2').value = '다른 기기에서 수정';
  await byClass(root, 'survey-answer').onsubmit({ preventDefault() {} });
  assert.equal(posted.token, token);
  assert.equal(posted.answers.q2, '다른 기기에서 수정');
});

for (const token of ['wrong', 'f'.repeat(32)]) test(`잘못되거나 없는 수정 링크는 새 응답으로 바꾸지 않는다: ${token}`, async t => {
  const { root, storage } = environment(t, '&s=training1&survey=survey1');
  const original = 'a'.repeat(32);storage.set('survey-response:survey1', original);
  location.href += `#response=${token}`;
  let writes = 0;
  await mountSurvey(root, 'training1', async (route, method) => {
    if (route.includes('/my-response')) return { answers: null };
    if (route.includes('/responses')) writes++;
    return structuredClone(survey);
  });
  assert.match(byClass(root, 'survey-error').textContent, /수정 링크/);
  assert.equal(byClass(root, 'survey-answer'), undefined);
  assert.equal(storage.get('survey-response:survey1'), original);
  assert.equal(writes, 0);
});

test('예전에 마감한 설문에도 처음 온 참가자가 새 응답을 제출할 수 있다', async t => {
  const { root } = environment(t, '&s=training1&survey=survey1');
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? { answers: null } : { ...structuredClone(survey), open: false });
  assert.equal(byText(root, '응답 제출').disabled, false);
  assert.equal(byClass(root, 'survey-answer-fields').disabled, false);
  assert.equal(byClass(root, 'survey-personal-link').hidden, true);
});

test('운영자는 개별 답변을 응답별로 보고 변경된 내용만 다시 불러온다', async t => {
  const { root, intervals } = environment(t, '&s=training1&manage=1&survey=survey1&view=responses');
  let revision = 2, reads = 0;
  await mountSurvey(root, 'training1', async route => {
    if (route.includes('/my-response')) return { answers: null };
    if (route.includes('/responses')) {
      reads++;
      if (new URL(route, 'http://local').searchParams.get('revision') === String(revision)) return { unchanged: true, revision };
      return { revision, responses: [{ answers: { q1: '선택 B', q2: `<img onerror=alert(1)> ${revision}` } }] };
    }
    return { ...structuredClone(survey), admin: true, shareResults: false };
  });
  await new Promise(setImmediate);
  const responses = byClass(root, 'survey-responses');
  assert.equal(responses.hidden, false);
  assert.equal(byText(root, '개별 답변').attributes['aria-pressed'], 'true');
  assert.match(responses.textContent, /선택 B/);
  assert.match(responses.textContent, /<img onerror=alert\(1\)> 2/);
  assert.equal(walk(responses).some(node => node.tag === 'img'), false);
  intervals[0]();await new Promise(setImmediate);assert.equal(reads, 2);
  revision = 3;intervals[0]();await new Promise(setImmediate);
  assert.match(responses.textContent, /<img onerror=alert\(1\)> 3/);
});

test('참가자는 개별 답변 화면을 열 수 없고 수정 비밀값은 공개 링크에 섞이지 않는다', async t => {
  const { root } = environment(t, '&s=training1&survey=survey1&view=responses');
  location.href += `#response=${'b'.repeat(32)}`;
  let responseReads = 0;
  await mountSurvey(root, 'training1', async route => {
    if (route.includes('/my-response')) return { answers: { q1: '선택 A', q2: '' } };
    if (route.includes('/responses')) responseReads++;
    return structuredClone(survey);
  });
  assert.equal(byText(root, '개별 답변').hidden, true);
  byText(root, '개별 답변').onclick();await new Promise(setImmediate);
  assert.equal(byClass(root, 'survey-responses').hidden, true);
  assert.equal(responseReads, 0);
  assert.equal(byClass(root, 'survey-link-recovery'), undefined);
});

test('운영자 설문 목록은 중복 버튼 없이 설문 화면으로 연결한다', async t => {
  const { root } = environment(t, '&s=training1&manage=1');
  await mountSurvey(root, 'training1', async () => ({ admin: true, surveys: [structuredClone(survey)] }));
  const links = walk(root).filter(node => node.tag === 'a');
  const answers = links.find(node => node.textContent === '설문 열기');
  assert.equal(links.filter(node => node.textContent === '설문 열기').length, 1);
  const url = new URL(answers.href);
  assert.equal(url.searchParams.has('view'), false);
  assert.equal(url.searchParams.get('admin'), '1');assert.equal(url.searchParams.has('manage'), false);
  assert.equal(url.searchParams.get('s'), 'training1');
});

test('관리 화면에서 복사한 공개 주소는 관리 매개변수를 빼고 새 창으로 연다', async t => {
  const { root, clipboard } = environment(t, '&s=training1&manage=1&survey=survey1&view=answer');
  const token = 'c'.repeat(32);location.href += `#response=${token}`;
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? { answers: { q1: '선택 A', q2: '' } } : { ...structuredClone(survey), admin: true });
  await byText(root, '설문 링크 복사').onclick();
  const publicUrl = new URL(clipboard[0]);
  assert.equal(publicUrl.hash, '');assert.equal(byClass(root, 'survey-personal-link').hidden, true);
  assert.equal(publicUrl.searchParams.get('s'), 'training1');
  for (const url of [publicUrl]) for (const flag of ['admin', 'manage', 'edit', 'view']) assert.equal(url.searchParams.has(flag), false);
  const preview = walk(root).find(node => node.tag === 'a' && node.textContent === '참가자 설문 열기 ↗');
  assert.equal(preview.href, clipboard[0]);assert.equal(preview.target, '_blank');assert.equal(preview.rel, 'noopener noreferrer');
});

test('클립보드 권한이 없어도 주소를 선택해 직접 복사할 수 있다', async t => {
  const { root } = environment(t, '&s=training1&manage=1&survey=survey1&view=answer');
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? { answers: null } : { ...structuredClone(survey), admin: true });
  navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  const input = walk(byClass(root, 'survey-link-recovery')).find(node => node.tag === 'input');
  let selected = false;input.select = () => { selected = true; };
  await byText(root, '설문 링크 복사').onclick();
  assert.equal(selected, true);assert.equal(byClass(root, 'survey-link-recovery').hidden, false);assert.match(root.textContent, /선택된 주소를 복사/);
  navigator.clipboard.writeText = async () => {};
  await byText(root, '설문 링크 복사').onclick();
  assert.equal(byClass(root, 'survey-link-recovery').hidden, true);
});

test('설문 관리는 참가자 응답을 읽거나 브라우저 식별자를 만들지 않는다', async t => {
  const { root, storage } = environment(t, '&admin=1&s=training1&survey=survey1&view=answer');
  const requests = [];
  await mountSurvey(root, 'training1', async (route, method) => {
    requests.push({ route, method });
    if (route.includes('/results')) return { total: 0, questions: [], revision: 1, open: true };
    return { ...structuredClone(survey), admin: true };
  });
  await new Promise(setImmediate);
  assert.equal(byText(root, '설문 응답').hidden, true);
  assert.equal(byClass(root, 'survey-answer').hidden, true);
  assert.equal(byClass(root, 'survey-personal-link').hidden, true);
  assert.equal(byClass(root, 'survey-responses').hidden, false);
  assert.equal(byClass(root, 'survey-tabs').hidden, true);
  assert.equal(storage.size, 0);
  assert.equal(requests.some(({ route }) => route.includes('/my-response')), false);
  await byClass(root, 'survey-answer').onsubmit({ preventDefault() {} });
  assert.equal(requests.some(({ method }) => method === 'POST'), false);
});

test('개인 수정 링크는 참가자 화면에서만 복사하고 관리 주소를 포함하지 않는다', async t => {
  const { root, clipboard } = environment(t, '&s=training1&survey=survey1');
  location.href += `#response=${'d'.repeat(32)}`;
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? { answers: { q1: '선택 A', q2: '' } } : structuredClone(survey));
  await byText(root, '내 수정 링크 복사').onclick();
  const url = new URL(clipboard[0]);
  assert.equal(url.hash, `#response=${'d'.repeat(32)}`);
  assert.equal(url.searchParams.has('admin'), false);
  assert.equal(url.searchParams.has('manage'), false);
});

test('연수별 관리 첫 화면에서 각 연수의 설문 제목·상태·응답 수와 개별 이동을 표시한다', async t => {
  const { root } = environment(t, '&admin=1');
  await mountSurvey(root, null, async route => {
    if (route === '/api/admin') return { sessions: [{ id: 'second', name: '둘째 연수', lectureDate: '2026-11-07' }, { id: 'first', name: '첫째 연수', lectureDate: '2026-11-08' }] };
    const first = new URL(route, 'http://local').searchParams.get('session') === 'first';
    return { admin: true, surveys: first ? [
      { ...survey, id: 'before', title: '사전 경험 조사', total: 3 },
      { ...survey, id: 'after', title: '연수 만족도', open: false, published: false, total: 0 },
    ] : [{ ...survey, id: 'closed', title: '다른 연수 설문', open: false, total: 2 }] };
  });
  const sessions = walk(root).filter(node => node.className.split(' ').includes('survey-session'));
  assert.equal(sessions.length, 2);
  assert.match(sessions[0].textContent, /첫째 연수/);
  assert.match(sessions[0].textContent, /사전 경험 조사/);
  assert.match(sessions[0].textContent, /응답 3개/);
  assert.match(sessions[0].textContent, /응답 0개/);
  assert.doesNotMatch(sessions[0].textContent, /다른 연수 설문/);
  assert.match(sessions[1].textContent, /응답 2개/);
  assert.deepEqual(walk(sessions[0]).filter(node => node.tag === 'h3').map(node => node.textContent), ['사전 경험 조사', '연수 만족도']);
  for (const [index, session] of sessions.entries()) for (const node of walk(session).filter(node => node.tag === 'a')) {
    const url = new URL(node.href);
    assert.equal(url.searchParams.get('s'), index === 0 ? 'first' : 'second');
    assert.equal(url.searchParams.get('admin'), '1');
    assert.ok(url.searchParams.get('survey'));
    if (node.textContent === '답변 보기') assert.equal(url.searchParams.get('view'), 'responses');
  }
});

test('연수별 설문 조회 실패를 빈 목록과 구분하고 다른 연수는 유지한 채 다시 불러온다', async t => {
  const { root } = environment(t, '&admin=1');let failed = true;
  await mountSurvey(root, null, async route => {
    if (route === '/api/admin') return { sessions: [{ id: 'empty', name: '빈 연수' }, { id: 'retry', name: '조회할 연수' }] };
    if (route.includes('empty')) return { admin: true, surveys: [] };
    if (failed) throw new Error('설문을 불러오지 못했습니다.');
    return { admin: true, surveys: [{ ...survey, title: '복구한 설문' }] };
  });
  const sessions = walk(root).filter(node => node.className.split(' ').includes('survey-session'));
  assert.match(sessions[0].textContent, /아직 만든 설문이 없습니다/);
  assert.match(sessions[1].textContent, /불러오지 못했습니다/);
  assert.doesNotMatch(sessions[1].textContent, /아직 만든 설문/);
  failed = false;await byText(sessions[1], '다시 불러오기').onclick();
  assert.match(sessions[1].textContent, /복구한 설문/);
  assert.equal(byClass(sessions[1], 'survey-error'), undefined);
  assert.match(sessions[0].textContent, /아직 만든 설문이 없습니다/);
});

test('설문 관리 상단에 소속 연수·학교·날짜와 설문 제목을 구분하고 편집·목록 이동을 제공한다', async t => {
  const { root, title } = environment(t, '&admin=1&s=training1&survey=survey1');
  await mountSurvey(root, 'training1', async route => route.includes('/results') ? { total: 0, revision: 1, open: true, questions: [] } : { ...structuredClone(survey), admin: true }, { name: '바이브코딩 연수', school: '<잠원중학교>', lectureDate: '2026-09-28' });
  const context = byClass(root, 'survey-context');
  assert.match(context.textContent, /바이브코딩 연수/);
  assert.match(context.textContent, /<잠원중학교> · 2026\.09\.28/);
  assert.equal(walk(context).some(node => node.tag === 'img'), false);
  assert.equal(title.textContent, survey.title);
  assert.match(byClass(root, 'survey-detail-heading').textContent, /설정/);
  assert.match(byClass(root, 'survey-settings-dialog').textContent, /설문 편집/);
  const back = walk(root).find(node => node.tag === 'a' && node.textContent === '← 설문 목록');
  const url = new URL(back.href);assert.equal(url.searchParams.get('s'), 'training1');assert.equal(url.searchParams.get('survey'), null);assert.equal(url.searchParams.get('admin'), '1');
});

test('설정에는 시작·마감 없이 결과 공개 범위만 명시적으로 저장한다', async t => {
  const { root } = environment(t, '&admin=1&s=training1&survey=survey1');const changes = [];
  await mountSurvey(root, 'training1', async (route, method, body) => {
    if (method === 'PATCH') { changes.push(body);return body; }
    return { ...structuredClone(survey), admin: true };
  });
  const privateResults = byText(root, '운영자만'), shared = byText(root, '참가자 공개');
  assert.equal(byText(root, '응답 받기'), undefined);assert.equal(byText(root, '마감'), undefined);
  assert.equal(privateResults.attributes['aria-pressed'], 'false');assert.equal(shared.attributes['aria-pressed'], 'true');
  await shared.onclick();assert.equal(changes.length, 0);
  await privateResults.onclick();assert.equal(privateResults.attributes['aria-pressed'], 'true');
  await shared.onclick();assert.equal(shared.attributes['aria-pressed'], 'true');
  assert.deepEqual(changes, [{ shareResults: false }, { shareResults: true }]);
});

test('설정 저장 실패 시 선택 상태를 유지하고 모든 설정 버튼을 다시 사용할 수 있다', async t => {
  const { root } = environment(t, '&admin=1&s=training1&survey=survey1');
  await mountSurvey(root, 'training1', async (route, method) => {
    if (method === 'PATCH') throw new Error('설정 저장 실패');
    if (route.includes('/results')) return { total: 0, revision: 1, open: true, questions: [] };
    return { ...structuredClone(survey), admin: true };
  });
  await byText(root, '운영자만').onclick();
  assert.equal(byText(root, '참가자 공개').attributes['aria-pressed'], 'true');
  assert.equal(byText(root, '운영자만').attributes['aria-pressed'], 'false');
  for (const text of ['운영자만', '참가자 공개']) assert.equal(byText(root, text).disabled, false);
  assert.match(root.textContent, /설정 저장 실패/);
});

for (const view of ['', '&view=results', '&view=responses']) test(`관리 화면은 개별 답변을 바로 보여주며 집계 탭은 표시하지 않는다: ${view}`, async t => {
  const { root } = environment(t, `&admin=1&s=training1&survey=survey1${view}`);const reads = [];
  await mountSurvey(root, 'training1', async route => {
    reads.push(route);
    if (route.includes('/responses')) return { revision: 1, responses: [{ answers: { q1: '선택 A', q2: '내 응답' } }] };
    return { ...structuredClone(survey), admin: true };
  });
  await new Promise(setImmediate);
  assert.equal(byClass(root, 'survey-tabs').hidden, true);
  assert.equal(byClass(root, 'survey-results').hidden, true);
  assert.equal(byClass(root, 'survey-responses').hidden, false);
  assert.match(byClass(root, 'survey-responses').textContent, /내 응답/);
  assert.equal(reads.some(route => route.includes('/results')), false);
  assert.equal(byClass(root, 'survey-link-recovery').hidden, true);
});

test('설정 대화상자는 저장 중 닫기·Esc·편집 이동을 막고 저장 후 다시 닫을 수 있다', async t => {
  const { root } = environment(t, '&admin=1&s=training1&survey=survey1');let complete;
  await mountSurvey(root, 'training1', async (route, method, body) => {
    if (method === 'PATCH') return new Promise(resolve => { complete = () => resolve(body); });
    if (route.includes('/responses')) return { revision: 1, responses: [] };
    return { ...structuredClone(survey), admin: true };
  });
  const dialog = byClass(root, 'survey-settings-dialog');
  byText(root, '설정').onclick();assert.equal(dialog.open, true);
  const saving = byText(root, '운영자만').onclick();
  assert.equal(byText(root, '닫기').disabled, true);
  let prevented = false;dialog.oncancel({ preventDefault() { prevented = true; } });assert.equal(prevented, true);
  const edit = walk(dialog).find(node => node.tag === 'a' && node.textContent === '설문 편집');
  prevented = false;edit.onclick({ preventDefault() { prevented = true; } });assert.equal(prevented, true);
  complete();await saving;
  assert.equal(byText(root, '닫기').disabled, false);
  byText(root, '닫기').onclick();assert.equal(dialog.open, false);
  assert.equal(byText(root, '운영자만').attributes['aria-pressed'], 'true');
});
