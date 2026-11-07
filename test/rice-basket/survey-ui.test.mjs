import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountSurvey, mountSharedSurveyResults, renderSurveyResults } from '../../rice-basket/survey.js';
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
    focus() {}
  }
  const document = { createElement: tag => new Node(tag), hidden: false };
  const title = new Node('h1'), intro = new Node('p'), root = new Node('main');
  root.querySelector = selector => selector.endsWith('h1') ? title : intro;
  const storage = new Map(), intervals = [], events = {};
  const values = { document, window: { addEventListener(name, callback) { events[name] = callback; } }, location: { search, href: `http://localhost:3001/rice-basket/?p=page-4a2b86a58156${search}` }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, setInterval: callback => { intervals.push(callback); } };
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original);else delete globalThis[key]; });
  }
  return { root, title, intervals, storage, events };
}
function walk(node) { return [node, ...node.children.flatMap(walk)]; }
function byText(root, text) { return walk(root).find(node => node.tag === 'button' && node._text === text); }
function byClass(root, name) { return walk(root).find(node => node.className.split(' ').includes(name)); }
const survey = { id: 'survey1', sessionId: '', title: '사용자가 쓴 제목', description: '소개', admin: false, open: true, published: true, shareResults: true, total: 0, revision: 1, version: 1, questions: [
  { id: 'q1', title: '선택 질문', type: 'choice', required: true, options: ['선택 A', '선택 B'] },
  { id: 'q2', title: '의견', type: 'text', required: false, options: [] },
] };

test('연수 선택에서 연수 홈 대신 해당 연수의 설문 작성·관리 화면으로 연결한다', async t => {
  const { root, title } = environment(t, '&survey=new');
  const requests = [];
  await mountSurvey(root, null, async route => {
    requests.push(route);
    return { sessions: [{ id: 'training1', name: '첫 연수', school: '학교', lectureDate: '2026-11-06' }, { id: 'training2', name: '다른 연수' }] };
  });
  assert.equal(title.textContent, '연수별 설문');
  assert.deepEqual(requests, ['/api/admin']);
  assert.equal(byClass(root, 'survey-editor'), undefined);
  const links=walk(root).filter(node=>node.tag==='a');
  assert.deepEqual(links.map(node=>node.textContent),['설문 만들기','설문 관리','설문 만들기','설문 관리']);
  assert.deepEqual(links.map(node=>{const url=new URL(node.href);assert.equal(url.searchParams.get('p'),'page-4a2b86a58156');assert.equal(url.searchParams.get('manage'),'1');return [url.searchParams.get('s'),url.searchParams.get('survey')];}),[['training1','new'],['training1',null],['training2','new'],['training2',null]]);
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
  }, '두 번째 연수');
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

test('제출 기록을 복구하고 마감·비공개 상태를 반영한다', async t => {
  const { root } = environment(t, '&survey=survey1');
  await mountSurvey(root, 'training1', async route => route.split('?')[0].endsWith('/my-response') ? { answers: { q1: '선택 A', q2: '저장한 의견' } } : { ...structuredClone(survey), open: false, shareResults: false });
  assert.equal(walk(root).find(node => node.name === 'q2').value, '저장한 의견');
  assert.equal(byText(root, '응답 제출').hidden, true);
  assert.equal(byText(root, '내 응답 수정').hidden, true);
  assert.equal(byText(root, '결과 보기').hidden, true);
  assert.equal(byClass(root, 'survey-answer-fields').disabled, true);
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
  await mountSurvey(root, 'training1', async route => route.includes('/my-response') ? {answers:null} : route.includes('/results') ? {total:1, revision:2, open:true, questions:[{id:'q2',title:'의견',type:'text',answered:1,texts:['<img onerror=alert(1)>'],options:[]}]} : {...structuredClone(survey),admin:true,shareResults:false});
  await new Promise(setImmediate);
  const results=byClass(root,'survey-results');
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

test('참가자 공유 화면에 공개 설문의 질문·선택지 집계·주관식 답변을 표시하고 갱신한다',async t=>{
  const {root,intervals}=environment(t,'&s=training1');
  let revision=1,visible=true,reads=0;
  const api=async route=>{
    assert.equal(new URL(route,'http://local').searchParams.get('session'),'training1');
    if(!route.includes('/results'))return {surveys:[{...survey,published:visible,shareResults:true,revision}]};
    reads++;return {total:revision,questions:[{title:'선택 질문',type:'choice',answered:revision,options:[{label:'선택 A',count:revision},{label:'선택 B',count:0}]},{title:'의견',type:'text',answered:1,options:[],texts:['<img onerror=alert(1)>']}]};
  };
  await mountSharedSurveyResults(root,'training1',api);
  assert.equal(root.hidden,false);assert.match(root.textContent,/선택 질문/);assert.match(root.textContent,/1개 · 100%/);
  assert.match(root.textContent,/<img onerror=alert\(1\)>/);assert.equal(walk(root).some(node=>node.tag==='img'),false);
  const responseLink=new URL(walk(root).find(node=>node.tag==='a').href);
  assert.equal(responseLink.searchParams.get('s'),'training1');assert.equal(responseLink.searchParams.has('manage'),false);
  intervals[0]();await new Promise(setImmediate);assert.equal(reads,1,'변경이 없으면 결과를 다시 요청하지 않는다');
  revision=2;intervals[0]();await new Promise(setImmediate);assert.match(root.textContent,/응답 2개/);
  visible=false;intervals[0]();await new Promise(setImmediate);assert.equal(root.hidden,true);assert.equal(root.textContent,'');
});

test('운영자는 공유 화면의 집계 공개를 직접 끌 수 있다',async t=>{
  const {root}=environment(t,'&s=training1&manage=1&survey=survey1');let settings;
  await mountSurvey(root,'training1',async(route,method,body)=>{
    if(method==='PATCH'){settings=body;return {shareResults:false};}
    if(route.includes('/results'))return {total:0,revision:1,open:true,questions:[]};
    return route.includes('/my-response')?{answers:null}:{...structuredClone(survey),admin:true};
  });
  const share=byText(root,'공유 화면에 집계 공개');assert.equal(share.attributes['aria-pressed'],'true');
  await share.onclick();await new Promise(setImmediate);
  assert.deepEqual(settings,{shareResults:false});assert.equal(share.attributes['aria-pressed'],'false');
  assert.match(byClass(root,'survey-disclosure').textContent,/운영자만/);
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
