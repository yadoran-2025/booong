import { publicFetch, operatorFetch, requireAdmin, onAdminAccountChange, adminAccountId } from './operator.js';
import { renderLearningPage, parseResourceLinks, resourceCards, resourceUrl } from './learning.js';
import { WEB_APPS_PAGE_ID } from './web-app-config.js';
import { loadMembers } from '../js/member-data.js';

const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const sessionId = params.get('s');
const pageId = params.get('p');
const admin = params.has('admin');
const operatorMode = admin || !sessionId || params.has('manage');
const ideaBoardPageId = 'page-0a0c2f1d230e';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const experiences = { opening:'아이디어 시작하기', architecture:'건축 구조 실험', freedoms:'다섯 가지 자유 실험', conditions:'수업 준비 점검', basics:'웹앱 구조·요청문 실습', examples:'수업 사례 탐색', redesign:'수업 재설계', custom:'직접 구성' };
let pages = [], sessions = [], dirty = false, revision = 0, pollTimer;
let currentSession, person, token;
let authGeneration = 0;
const hrefPage = (id, sid = '') => `/studies/?${operatorMode ? 'admin=1&' : ''}p=${encodeURIComponent(id)}${sid ? `&s=${encodeURIComponent(sid)}` : ''}`;
const sharedSessionUrl = id => `/studies/?s=${encodeURIComponent(id)}`;
function sessionAdminLinks(id) {
  const base = `/studies/?admin=1&s=${encodeURIComponent(id)}`;
  return `<nav class="session-admin-nav" aria-label="연수 관리"><a class="button" href="${base}" ${!pageId?'aria-current="page"':''}>연수 구성</a><a class="button" href="/studies/?admin=1&p=page-4a2b86a58156&s=${encodeURIComponent(id)}" ${pageId==='page-4a2b86a58156'?'aria-current="page"':''}>설문 관리</a><a class="button" href="${sharedSessionUrl(id)}" target="_blank" rel="noopener noreferrer">연수생 화면 열기 ↗</a></nav>`;
}
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(()=>el.classList.remove('visible'),4000); }
async function api(path, method='GET', body) {
  const account = operatorMode ? adminAccountId() : null;
  for(let attempt=0;;attempt++){
  const res = await (operatorMode ? operatorFetch : publicFetch)(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const result = await res.json();if(operatorMode&&account!==adminAccountId())throw new Error('Google 계정이 변경되었습니다.'); if(operatorMode&&(res.status===401||res.status===403)){app.replaceChildren();clearInterval(pollTimer);await requireAdmin(app,'/api/admin?refresh=1');}if(!res.ok){if(result.retryable&&attempt<2)continue;throw new Error(result.error || '요청을 처리하지 못했습니다.');}return result;
  }
}
function setDirty() { dirty=true; revision++; const el=document.querySelector('#save-status'); if(el) el.textContent='저장하지 않은 변경 내용'; }
function errorView(error) { app.innerHTML=`<main class="error-page"><h1>페이지를 열 수 없습니다</h1><p>${escapeHtml(error.message)}</p><a class="button" href="${sessionId&&!operatorMode?`/studies/?s=${encodeURIComponent(sessionId)}`:'/studies/?admin=1'}">${sessionId&&!operatorMode?'강연 목차로':'관리 화면으로'}</a></main>`; }
function adminShell(content, tab='pages') {
  app.className='admin-app'; app.innerHTML=`<header class="app-header"><a class="wordmark" href="/studies/?admin=1">쌀바구니 관리</a><nav aria-label="관리 메뉴"><a class="${tab==='pages'?'active':''}" href="/studies/?admin=1">내용요소</a><a class="${tab==='classes'?'active':''}" href="/studies/?admin=1&tab=classes">연수 출강 리스트</a><a class="${tab==='surveys'?'active':''}" href="/studies/?admin=1&p=page-4a2b86a58156">연수별 설문 관리</a></nav><a class="text-link" href="/admin.html">운영자 화면</a></header><main class="admin-main">${content}</main>`;

}
function cardArt(page) {
  const e=page.experience;
  if(e==='architecture') return '<svg viewBox="0 0 240 120" aria-hidden="true"><path d="M32 95V35H208V95M20 35L120 8L220 35M72 35V95M168 35V95"/><path class="art-dash" d="M34 65H208"/><rect x="90" y="50" width="55" height="35" rx="2"/></svg>';
  if(e==='freedoms'||e==='examples') return '<svg viewBox="0 0 240 120" aria-hidden="true"><path d="M35 85L75 52L120 75L164 30L205 50"/><circle cx="35" cy="85" r="7"/><circle cx="75" cy="52" r="7"/><circle cx="120" cy="75" r="7"/><circle cx="164" cy="30" r="7"/><circle cx="205" cy="50" r="7"/></svg>';
  if(e==='basics') return '<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="16" y="35" width="50" height="50" rx="5"/><rect x="95" y="35" width="50" height="50" rx="5"/><rect x="174" y="35" width="50" height="50" rx="5"/><path d="M66 60H95M145 60H174M80 54L87 60L80 66M158 54L165 60L158 66"/></svg>';
  if(e==='conditions') return '<svg viewBox="0 0 240 120" aria-hidden="true"><path d="M55 25L64 34L81 16M55 61L64 70L81 52M55 97L64 106L81 88M108 25H184M108 61H160M108 97H180"/></svg>';
  return '<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="28" y="30" width="60" height="60" rx="6"/><rect x="152" y="30" width="60" height="60" rx="6"/><path d="M103 60H136M126 50L137 60L126 70M43 49H73M43 62H66M168 49H196M168 62H190"/></svg>';
}
function pageCard(page,{sid='',manage=false,number=0}={}) {
  const url=hrefPage(page.id,sid);
  const preview=page.id==='page-20eeb5cdab19'?parseResourceLinks(page.content).intro:String(page.content||page.description||'');
  const excerpt=`${escapeHtml(preview.slice(0,280))}${preview.length>280?'…':''}`;
  const title=`${number?`<span class="page-title-number">${String(number).padStart(2,'0')}</span>`:''}<a href="${url}">${escapeHtml(page.title)}</a>`;
  const deleteButton=manage?`<button class="text-button danger" data-delete-page="${escapeHtml(page.id)}" aria-label="${escapeHtml(page.title)} 삭제">삭제</button>`:'';
  const actions=manage?`<div class="page-card-actions"><button class="text-button" data-edit-page="${escapeHtml(page.id)}" aria-label="${escapeHtml(page.title)} 수정" aria-haspopup="dialog" aria-controls="page-form-dialog">수정</button>${deleteButton}</div>`:'';
  if (!page.sections?.length) return `<article class="page-card blank-card"><div class="blank-card-main"><h2>${title}</h2>${preview?`<p>${excerpt}</p>`:''}</div>${actions}</article>`;
  return `<article class="page-card theme-${page.theme||'sage'}"><a class="card-art" href="${url}" tabindex="-1">${cardArt(page)}<span>${escapeHtml(experiences[page.experience]||'학습 페이지')}</span></a><div class="card-copy"><h2>${title}</h2><p>${excerpt}</p><div class="card-bottom"><span>${page.sections?.length||0}개 학습 섹션</span><a href="${url}">내용요소 열기 ↗</a></div>${actions}</div></article>`;
}
function pageLibrary() {
  adminShell(`<div class="view-heading library-heading"><div><p class="eyebrow">직접 해 보며 배우는 공간</p><h1>내용요소</h1><p>제목과 내용을 작성하고, 필요하면 코덱스에서 페이지를 더 개발하세요.</p></div><button id="add-page" class="button primary" type="button" aria-haspopup="dialog" aria-controls="page-form-dialog">+ 내용요소 추가</button></div><dialog id="page-form-dialog" class="confirm-dialog page-form-dialog" aria-labelledby="page-form-heading"><form id="add-page-form" class="add-page-form"><h2 id="page-form-heading">새 내용요소</h2><div class="add-page-fields"><label for="new-page-title">제목<input id="new-page-title" maxlength="120" required></label><label for="new-page-content">내용<textarea id="new-page-content" maxlength="20000" rows="7" required></textarea><small id="resource-format" class="help" hidden>이 페이지의 링크는 소개 문장 아래에 한 줄씩 ‘제목 | 한 줄 소개 | https://주소’ 형식으로 입력하세요.</small></label></div><p id="page-form-error" class="danger" role="alert"></p><div class="add-page-actions"><button class="button primary" type="submit">추가</button><button id="cancel-add-page" class="text-button" type="button">취소</button></div></form></dialog><div class="library-layout"><aside class="library-sidebar"><label class="search-label">내용요소 찾기<input id="search" type="search" placeholder="제목 또는 내용으로 검색"></label><div class="library-sidebar-top"><span id="library-count"></span><label class="library-sort-control"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11M3 10h8M3 14h5M18 5v13m-3-3 3 3 3-3"/></svg><select id="library-sort" aria-label="정렬 기준"><option value="default">직접 정한 순서</option><option value="name">가나다순</option><option value="sections">섹션 많은순</option></select></label></div><nav id="library-index" aria-label="내용요소 목록"></nav></aside><div id="page-library" class="library-stack"></div></div>`);
  const indexNav=document.querySelector('#library-index');
  const libraryPages=()=>pages.filter(page=>page.id!=='page-4a2b86a58156');
  let sorting=null,savingOrder=false;
  async function movePage(id,toIndex){
    const next=libraryPages(),fromIndex=next.findIndex(p=>p.id===id);
    if(savingOrder||fromIndex<0||toIndex<0||toIndex>=next.length||fromIndex===toIndex)return;
    const [page]=next.splice(fromIndex,1);next.splice(toIndex,0,page);
    let index=0;
    const ordered=pages.map(page=>page.id==='page-4a2b86a58156'?page:next[index++]);
    savingOrder=true;indexNav.setAttribute('aria-busy','true');
    indexNav.querySelectorAll('[data-sort-page]').forEach(handle=>handle.disabled=true);
    try{pages=(await api('/api/pages/order','PUT',{pageIds:ordered.map(p=>p.id)})).pages;toast('내용요소 순서를 저장했습니다.');}
    catch(e){toast(e.message)}
    finally{savingOrder=false;indexNav.removeAttribute('aria-busy');draw();[...indexNav.querySelectorAll('[data-sort-page]')].find(handle=>handle.dataset.sortPage===id)?.focus({preventScroll:true});}
  }
  function cancelSort(){
    if(!sorting)return;
    const {handle,pointerId}=sorting;sorting=null;
    indexNav.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(row=>row.classList.remove('is-dragging','drop-before','drop-after'));
    if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);
  }
  indexNav.onpointerdown=event=>{
    const handle=event.target.closest('[data-sort-page]');
    if(!handle||handle.disabled||event.button!==0||sorting)return;
    event.preventDefault();handle.focus({preventScroll:true});
    sorting={handle,pointerId:event.pointerId,id:handle.dataset.sortPage,x:event.clientX,y:event.clientY,toIndex:libraryPages().findIndex(p=>p.id===handle.dataset.sortPage),dragging:false};
    handle.setPointerCapture(event.pointerId);
  };
  indexNav.onpointermove=event=>{
    if(!sorting||sorting.pointerId!==event.pointerId)return;
    if(!sorting.dragging&&Math.hypot(event.clientX-sorting.x,event.clientY-sorting.y)<5)return;
    event.preventDefault();sorting.dragging=true;
    const rows=[...indexNav.children],others=rows.filter(row=>row.dataset.pageId!==sorting.id);
    const horizontal=window.matchMedia('(max-width:690px)').matches;
    const before=others.find(row=>{const rect=row.getBoundingClientRect();return horizontal?event.clientX<rect.left+rect.width/2:event.clientY<rect.top+rect.height/2;});
    sorting.toIndex=before?others.indexOf(before):others.length;
    rows.forEach(row=>row.classList.remove('is-dragging','drop-before','drop-after'));
    rows.find(row=>row.dataset.pageId===sorting.id)?.classList.add('is-dragging');
    if(before)before.classList.add('drop-before');else others.at(-1)?.classList.add('drop-after');
  };
  indexNav.onpointerup=event=>{
    if(!sorting||sorting.pointerId!==event.pointerId)return;
    const {id,toIndex,dragging}=sorting;cancelSort();if(dragging)movePage(id,toIndex);
  };
  indexNav.onpointercancel=indexNav.onlostpointercapture=cancelSort;
  indexNav.onkeydown=event=>{
    if(event.key==='Escape')return cancelSort();
    const handle=event.target.closest('[data-sort-page]');
    if(!handle||handle.disabled||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();cancelSort();movePage(handle.dataset.sortPage,libraryPages().findIndex(p=>p.id===handle.dataset.sortPage)+(event.key==='ArrowUp'?-1:1));
  };
  const draw=()=>{
    cancelSort();
    const q=document.querySelector('#search').value.trim().toLowerCase();
    const list=libraryPages().filter(p=>(p.title+' '+(p.content||p.description||'')).toLowerCase().includes(q));
    const sort=document.querySelector('#library-sort').value;
    if(sort==='name')list.sort((a,b)=>a.title.localeCompare(b.title,'ko'));
    if(sort==='sections')list.sort((a,b)=>(b.sections?.length||0)-(a.sections?.length||0));
    const order=new Map(libraryPages().map((p,i)=>[p.id,i+1]));
    const canMove=sort==='default'&&!q&&!savingOrder;
    document.querySelector('#library-count').textContent=`${list.length}개 내용요소`;
    indexNav.innerHTML=list.map(p=>`<div class="library-index-item" data-page-id="${escapeHtml(p.id)}"><button type="button" class="library-drag-handle" data-sort-page="${escapeHtml(p.id)}" ${canMove?'':'disabled'} aria-label="${escapeHtml(p.title)} 순서 변경" aria-description="드래그하거나 위아래 방향키로 순서를 바꿀 수 있습니다. 검색과 정렬을 해제하면 사용할 수 있습니다." aria-keyshortcuts="ArrowUp ArrowDown"><span aria-hidden="true">⠿</span></button><a href="#library-${encodeURIComponent(p.id)}"><span class="library-number">${String(order.get(p.id)).padStart(2,'0')}</span><span>${escapeHtml(p.title)}${p.sections?.length?`<small>${escapeHtml(experiences[p.experience]||'학습 페이지')} · ${p.sections.length}개 섹션</small>`:''}</span></a></div>`).join('');
    document.querySelector('#page-library').innerHTML=list.map(p=>`<div id="library-${escapeHtml(p.id)}">${pageCard(p,{manage:true,number:order.get(p.id)})}</div>`).join('')||'<p class="empty">내용요소가 없습니다. 위의 추가 버튼으로 만들어 주세요.</p>';
    document.querySelectorAll('[data-edit-page]').forEach(button=>button.onclick=()=>openForm(pages.find(p=>p.id===button.dataset.editPage)));
    document.querySelectorAll('[data-delete-page]').forEach(button=>button.onclick=async()=>{const page=pages.find(p=>p.id===button.dataset.deletePage);if(!confirm(`「${page.title}」 내용요소를 삭제할까요?`))return;button.disabled=true;try{await api(`/api/pages/${page.id}`,'DELETE');pages=pages.filter(p=>p.id!==page.id);draw()}catch(e){toast(e.message);button.disabled=false}});
  };
  document.querySelector('#search').oninput=draw;
  document.querySelector('#library-sort').onchange=draw;
  const addButton=document.querySelector('#add-page'), addForm=document.querySelector('#add-page-form');
  const formDialog=document.querySelector('#page-form-dialog'),formError=document.querySelector('#page-form-error');
  const cancelForm=document.querySelector('#cancel-add-page'),submitForm=addForm.querySelector('[type=submit]');
  const titleInput=document.querySelector('#new-page-title'), contentInput=document.querySelector('#new-page-content');
  let editingPageId=null;
  function openForm(page){
    editingPageId=page?.id||null;
    titleInput.value=page?.title||'';contentInput.value=page?.content||'';document.querySelector('#resource-format').hidden=page?.id!=='page-20eeb5cdab19';
    document.querySelector('#page-form-heading').textContent=page?'내용요소 수정':'새 내용요소';
    submitForm.textContent=page?'저장':'추가';formError.textContent='';
    formDialog.showModal();titleInput.focus({preventScroll:true});
  }
  addButton.onclick=()=>openForm(null);
  cancelForm.onclick=()=>formDialog.close();
  formDialog.oncancel=event=>{if(submitForm.disabled)event.preventDefault()};
  formDialog.onclose=()=>{
    const id=editingPageId;editingPageId=null;addForm.reset();formError.textContent='';
    const trigger=id?[...document.querySelectorAll('[data-edit-page]')].find(button=>button.dataset.editPage===id):addButton;
    trigger?.focus({preventScroll:true});
  };
  addForm.onsubmit=async event=>{
    event.preventDefault();if(submitForm.disabled)return;
    const title=titleInput.value.trim(),content=contentInput.value.trim();formError.textContent='';
    if(!title||!content){formError.textContent='제목과 내용을 모두 입력해 주세요.';(!title?titleInput:contentInput).focus();return}
    const id=editingPageId;submitForm.disabled=cancelForm.disabled=true;
    try{
      const result=await api(id?`/api/pages/${id}`:'/api/pages',id?'PATCH':'POST',{title,content});
      if(!id){location.href=hrefPage(result.id);return}
      pages=pages.map(page=>page.id===id?result:page);formDialog.close();draw();toast('제목과 내용을 저장했습니다.');
    }catch(e){formError.textContent=e.message}finally{submitForm.disabled=cancelForm.disabled=false}
  };
  draw();
}
function classLibrary() {
  adminShell(`<div class="view-heading"><div><p class="eyebrow">학교별 출강 일정</p><h1>연수 출강 리스트</h1><p>학교와 출강일을 기록하고 수업 구성을 관리하세요.</p></div><a href="/studies/?admin=1&new=1" class="button primary">+ 새 연수 만들기</a></div><label class="search-label">수업 찾기<input id="class-search" type="search" placeholder="수업 또는 학교 이름으로 검색"></label><div class="class-grid" id="class-list"></div><dialog id="delete-class-dialog" class="confirm-dialog" aria-labelledby="delete-class-title" aria-describedby="delete-class-description"><h2 id="delete-class-title">연수를 삭제할까요?</h2><p id="delete-class-description">「<strong id="delete-class-name"></strong>」 연수와 참가자 응답·포스트잇이 삭제됩니다. 내용요소는 유지됩니다.</p><p id="delete-class-error" role="alert"></p><div class="dialog-actions"><button id="cancel-delete-class" type="button" class="button">취소</button><button id="confirm-delete-class" type="button" class="button danger-primary">연수 삭제</button></div></dialog>`,'classes');
  const list=document.querySelector('#class-list');
  const dialog=document.querySelector('#delete-class-dialog');
  const cancel=document.querySelector('#cancel-delete-class');
  const confirmDelete=document.querySelector('#confirm-delete-class');
  let pendingId,trigger;
  function draw(){
    const q=document.querySelector('#class-search').value.trim().toLowerCase();
    list.innerHTML=sessions.filter(s=>(s.name+' '+(s.school||'')).toLowerCase().includes(q)).sort((a,b)=>(b.lectureDate||'').localeCompare(a.lectureDate||'')||b.createdAt-a.createdAt).map(s=>`<article class="class-card"><span class="eyebrow">${escapeHtml(s.school||'학교 미입력')} · ${escapeHtml(s.lectureDate?.replaceAll('-','.')||'출강일 미입력')}</span><h2><a href="/studies/?admin=1&s=${s.id}">${escapeHtml(s.name)}</a></h2><p>${s.pageCount??0}개 페이지 · ${s.gridColumns||3}열 그리드</p><div class="class-card-actions"><div class="class-card-manage"><a class="button primary" href="/studies/?admin=1&s=${s.id}" aria-label="${escapeHtml(s.name)} 연수 수정">연수 수정</a><a class="button" href="/studies/?admin=1&p=page-4a2b86a58156&s=${s.id}">설문 관리</a></div><div class="class-card-footer"><a class="text-link" href="/studies/?s=${s.id}" target="_blank" rel="noopener">연수생 화면 열기 ↗</a><button class="text-button danger" data-delete-class="${s.id}" aria-label="${escapeHtml(s.name)} 연수 삭제">연수 삭제</button></div></div></article>`).join('')||'<p class="empty">수업이 없습니다. 필요한 학습 페이지를 골라 첫 수업을 만들어 보세요.</p>';
  }
  list.onclick=event=>{
    const button=event.target.closest('button[data-delete-class]');
    if(!button||!list.contains(button))return;
    const session=sessions.find(s=>s.id===button.dataset.deleteClass);
    if(!session)return toast('연수를 찾을 수 없습니다. 목록을 새로 열어 주세요.');
    pendingId=session.id;trigger=button;
    document.querySelector('#delete-class-name').textContent=session.name;
    document.querySelector('#delete-class-error').textContent='';
    dialog.showModal();cancel.focus();
  };
  cancel.onclick=()=>dialog.close();
  dialog.onclose=()=>{pendingId=null;if(trigger?.isConnected)trigger.focus();trigger=null};
  confirmDelete.onclick=async()=>{
    if(!pendingId)return;
    confirmDelete.disabled=cancel.disabled=true;
    try{await api(`/api/sessions/${pendingId}`,'DELETE');sessions=sessions.filter(s=>s.id!==pendingId);dialog.close();draw();toast('연수를 삭제했습니다.')}catch(e){document.querySelector('#delete-class-error').textContent=e.message}finally{confirmDelete.disabled=cancel.disabled=false}
  };
  document.querySelector('#class-search').oninput=draw;draw();
}
async function classEditor() {
  const existing=sessionId?await api(`/api/sessions/${sessionId}`):null;
  let selected=existing?[...existing.pageIds]:[];
  let memberCodes=[...(existing?.memberCodes||[])];
  adminShell(`<div class="class-editor">
    <a class="back-link" href="/studies/?admin=1&tab=classes">← 연수 출강 리스트</a>
    <div class="view-heading class-editor-heading"><h1>${existing?'연수 수정':'새 연수 만들기'}</h1><div class="class-editor-save"><span id="save-status" role="status"></span><button id="save-class" class="button primary">${existing?'변경 저장':'연수 만들기'}</button></div></div>
    <div class="class-settings" role="group" aria-label="연수 기본 정보">
      <label>연수 이름<input id="class-name" maxlength="100" value="${escapeHtml(existing?.name||'')}" placeholder="예: 잠원중학교 0331 연수"></label>
      <label>학교<input id="class-school" maxlength="120" value="${escapeHtml(existing?.school||'')}" placeholder="예: 잠원중학교"></label>
      <label>출강일<input id="class-date" type="date" value="${escapeHtml(existing?.lectureDate||'')}"></label>
      <fieldset class="segmented"><legend>목차 열 수</legend>${[1,2,3,4].map(n=>`<button type="button" data-columns="${n}" aria-pressed="${n===(existing?.gridColumns||3)}">${n}열</button>`).join('')}</fieldset>
      <fieldset class="class-members"><legend>연수자</legend><div id="class-members" class="class-member-options" aria-live="polite"></div></fieldset>
    </div>
    <div class="compose-layout">
      <section class="page-picker"><h2>내용요소 선택</h2><input id="pick-search" aria-label="내용요소 검색" placeholder="내용요소 검색"><div id="page-options"></div><button id="refresh-pages" class="text-button">목록 새로고침</button></section>
      <section class="composition"><div class="section-heading"><h2>진행 순서</h2><span id="selected-count"></span></div><ol id="selected-pages" class="class-selected-list"></ol></section>
    </div>
    ${existing?sessionSharePanel(existing):''}
  </div>`,'classes');
  let columns=existing?.gridColumns||3;
  function drawOptions(){const q=document.querySelector('#pick-search').value.trim().toLowerCase();document.querySelector('#page-options').innerHTML=pages.filter(p=>p.id!=='page-4a2b86a58156'&&(p.title+' '+(p.content||p.description||'')).toLowerCase().includes(q)).map(p=>`<label class="page-option"><input type="checkbox" value="${p.id}" ${selected.includes(p.id)?'checked':''}><span><strong>${escapeHtml(p.title)}</strong></span></label>`).join('');document.querySelectorAll('.page-option input').forEach(input=>input.onchange=()=>{if(input.checked){if(selected.length>=30){input.checked=false;return toast('한 수업에는 30개 페이지까지 넣을 수 있습니다.')}selected.push(input.value)}else selected=selected.filter(id=>id!==input.value);setDirty();drawSelected()});}
  function drawSelected(){
    document.querySelector('#selected-count').textContent=`${selected.length}개 선택`;
    const target=document.querySelector('#selected-pages');
    target.innerHTML=selected.map((id,i)=>{const p=pages.find(p=>p.id===id);return `<li class="class-selected-page"><span class="class-selected-number">${String(i+1).padStart(2,'0')}</span><a class="class-selected-title" href="${hrefPage(p.id,existing?.id||'')}">${escapeHtml(p.title)}</a><div class="card-order"><button type="button" data-up="${id}" ${i===0?'disabled':''} aria-label="${escapeHtml(p.title)} 위로">↑</button><button type="button" data-down="${id}" ${i===selected.length-1?'disabled':''} aria-label="${escapeHtml(p.title)} 아래로">↓</button><button type="button" data-remove="${id}" aria-label="${escapeHtml(p.title)} 제외">제외</button></div></li>`}).join('')||'<li class="empty compose-empty">내용요소를 선택하세요.</li>';
    target.querySelectorAll('[data-up],[data-down],[data-remove]').forEach(b=>b.onclick=()=>{const id=b.dataset.up||b.dataset.down||b.dataset.remove;const i=selected.indexOf(id);if(b.dataset.remove)selected.splice(i,1);else{const j=i+(b.dataset.up?-1:1);[selected[i],selected[j]]=[selected[j],selected[i]]}setDirty();drawOptions();drawSelected()});
  }
  document.querySelectorAll('#class-name,#class-school,#class-date').forEach(input=>input.oninput=setDirty);
  document.querySelector('#pick-search').oninput=drawOptions;
  document.querySelector('#refresh-pages').onclick=async()=>{try{pages=(await api('/api/pages')).pages;drawOptions();drawSelected();toast('페이지 목록을 새로 불러왔습니다.')}catch(e){toast(e.message)}};
  document.querySelectorAll('[data-columns]').forEach(b=>b.onclick=()=>{columns=Number(b.dataset.columns);document.querySelectorAll('[data-columns]').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));setDirty();drawSelected()});
  document.querySelector('#save-class').onclick=async()=>{const name=document.querySelector('#class-name').value.trim(),school=document.querySelector('#class-school').value.trim(),lectureDate=document.querySelector('#class-date').value;if(!name)return toast('수업 이름을 입력해 주세요.');if(!school)return toast('학교 이름을 입력해 주세요.');if(!lectureDate)return toast('출강일을 선택해 주세요.');if(!selected.length)return toast('페이지를 하나 이상 선택해 주세요.');const button=document.querySelector('#save-class'),rev=revision;button.disabled=true;try{const result=await api(existing?`/api/sessions/${sessionId}`:'/api/sessions',existing?'PATCH':'POST',{name,school,lectureDate,memberCodes:[...memberCodes],pageIds:[...selected],gridColumns:columns});if(rev===revision)dirty=false;if(!existing){location.href=`/studies/?admin=1&s=${result.id}`;return}document.querySelector('.view-heading h1').textContent='연수 수정';document.querySelector('#save-status').textContent=dirty?'추가 변경 내용을 저장해 주세요.':'저장 완료 · 공유 화면에 반영되었습니다.';toast('연수 변경 내용을 저장했습니다.');}catch(e){toast(e.message)}finally{button.disabled=false}};
  const memberOptions=document.querySelector('#class-members');
  async function loadParticipantOptions(){
    const account=adminAccountId();
    memberOptions.textContent='구성원을 불러오는 중…';
    let members=[],failed=false;
    try{members=await loadMembers({fallbackUrl:'/members.json'});}catch{failed=true;}
    if(account!==adminAccountId()||!memberOptions.isConnected)return;
    const known=new Set(members.map(m=>m.id.toLowerCase()));
    members.push(...memberCodes.filter(code=>!known.has(code.toLowerCase())).map(id=>({id,name:''})));
    memberOptions.innerHTML=members.map(m=>`<button type="button" class="btn btn--secondary" data-training-member="${escapeHtml(m.id)}" aria-pressed="${memberCodes.some(code=>code.toLowerCase()===m.id.toLowerCase())}"><strong>${escapeHtml(m.id)}</strong>${m.name&&m.name!==m.id?`<span>${escapeHtml(m.name)}</span>`:''}</button>`).join('')+(failed?'<span role="alert">구성원 목록을 불러오지 못했습니다.</span><button type="button" class="btn btn--ghost" data-retry-members>다시 시도</button>':'');
    memberOptions.querySelectorAll('[data-training-member]').forEach(button=>button.onclick=()=>{
      const code=button.dataset.trainingMember,selected=button.getAttribute('aria-pressed')==='true';
      memberCodes=selected?memberCodes.filter(id=>id.toLowerCase()!==code.toLowerCase()):[...memberCodes,code];
      button.setAttribute('aria-pressed',String(!selected));setDirty();
    });
    memberOptions.querySelector('[data-retry-members]')?.addEventListener('click',loadParticipantOptions);
  }
  loadParticipantOptions();
  drawOptions();drawSelected();
  if(existing)bindSessionSharing();
}
function responseRows(s){return s.people.length?s.people.map(p=>`<article class="response-row"><strong>${escapeHtml(p.name)}${s.resultsVisible?` <span>${s.counts[p.id]||0}표</span>`:''}</strong><div><small>첫 아이디어</small><p>${escapeHtml(p.initial||'아직 제출하지 않음')}</p></div><div><small>재설계</small><p>${escapeHtml(p.redesign||'아직 제출하지 않음')}</p></div></article>`).join(''):'<p class="empty">아직 제출된 응답이 없습니다.</p>'}
function learningNavigation(session) {
  const index = session.pages.findIndex(page => page.id === pageId);
  const adjacent = (page, label) => page
    ? `<a class="learning-page-step" href="${hrefPage(page.id, session.id)}" aria-label="${label}: ${escapeHtml(page.title)}" title="${escapeHtml(page.title)}">${label}</a>`
    : `<span class="learning-page-step" aria-disabled="true">${label}</span>`;
  return `<footer class="learning-pagination"><nav aria-label="연수 주제 이동">${adjacent(session.pages[index - 1], '← 이전')}<ol class="learning-page-numbers">${session.pages.map((page, i) => `<li><a href="${hrefPage(page.id, session.id)}" ${i === index ? 'aria-current="page"' : ''} aria-label="${i + 1}. ${escapeHtml(page.title)}" title="${escapeHtml(page.title)}">${i + 1}</a></li>`).join('')}</ol>${adjacent(session.pages[index + 1], '다음 →')}</nav></footer>`;
}
function publicHeader(back,label,title='BOOONG의 쌀바구니',date=''){return `<header class="public-header"><a class="wordmark" href="${escapeHtml(back)}">${escapeHtml(title)}${date?`<time datetime="${escapeHtml(date)}">${escapeHtml(date.replaceAll('-','.'))}</time>`:''}</a><a class="learning-return" href="${escapeHtml(back)}"><span aria-hidden="true">←</span>${escapeHtml(label)}</a></header>`;}
function sessionQrCard(s, canEdit=false){return `<aside class="join-qr"><div class="join-qr-body"><button id="expand-class-qr" class="qr-expand" type="button" aria-label="참가자 접속 QR코드 확대" aria-haspopup="dialog" aria-controls="class-qr-dialog" title="QR코드 확대" disabled><img id="class-qr" width="120" height="120" alt="이 수업 접속 링크 QR코드"></button><div><h2>참가자 접속</h2><p>QR코드를 스캔해<br>접속하세요.</p></div></div>${canEdit?`<section class="short-link-settings"><h3>단축 링크 설정</h3><form id="short-link-form"><div class="short-link-heading"><label for="short-link">직접 등록한 단축 링크</label><a class="external-link" href="https://xn--0p4b.xn--3e0b707e/" target="_blank" rel="noopener noreferrer">숏.한국 바로가기 ↗</a></div><div><input id="short-link" type="url" maxlength="1000" placeholder="https://숏.한국/…" value="${escapeHtml(s.shortUrl||'')}"><button class="button" type="submit">저장</button></div><small>등록한 주소를 붙여 넣으세요. 비워서 저장하면 수업 원래 주소로 돌아갑니다.</small><p id="short-link-status" role="status"></p></form></section>`:''}</aside><dialog id="class-qr-dialog" class="confirm-dialog qr-dialog" aria-labelledby="class-qr-heading"><div class="qr-dialog-heading"><h2 id="class-qr-heading">${escapeHtml(s.name)}</h2><button id="close-class-qr" class="button" type="button" autofocus>닫기</button></div><img id="class-qr-large" alt="참가자 접속 QR코드"></dialog>`;}
function bindSessionQr(){
  const qr=document.querySelector('#class-qr'),qrLarge=document.querySelector('#class-qr-large'),qrDialog=document.querySelector('#class-qr-dialog'),expandQr=document.querySelector('#expand-class-qr');
  expandQr.onclick=()=>qrDialog.showModal();
  document.querySelector('#close-class-qr').onclick=()=>qrDialog.close();
  const refreshQr=async()=>{const response=await (operatorMode ? operatorFetch : publicFetch)(`/api/sessions/${sessionId}/qr`);if(!response.ok)throw new Error('QR코드를 불러오지 못했습니다.');const previous=qr.src;qr.src=URL.createObjectURL(await response.blob());qrLarge.src=qr.src;expandQr.disabled=false;if(previous?.startsWith('blob:'))URL.revokeObjectURL(previous);};
  refreshQr().catch(error=>{qr.alt=error.message;});
  const form=document.querySelector('#short-link-form');if(form)form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),status=document.querySelector('#short-link-status');button.disabled=true;status.textContent='저장 중…';try{await api(`/api/sessions/${sessionId}`,'PATCH',{shortUrl:document.querySelector('#short-link').value});await refreshQr();status.textContent='저장했습니다. QR코드에 반영되었습니다.';}catch(error){status.textContent=error.message;}finally{button.disabled=false}};
}
function sessionSharePanel(s){return `<section class="session-share-management" aria-labelledby="session-share-title"><div><h2 id="session-share-title">참가자 접속 링크</h2><label class="session-share-field">공유 주소<input id="session-share-url" readonly value="${escapeHtml(location.origin+sharedSessionUrl(s.id))}"></label><button id="copy-session-link" class="button" type="button">공유 링크 복사</button><p id="session-share-status" role="status"></p></div>${sessionQrCard(s,true)}</section>`;}
function bindSessionSharing(){
  bindSessionQr();
  document.querySelector('#copy-session-link').onclick=async()=>{
    const input=document.querySelector('#session-share-url'),status=document.querySelector('#session-share-status');
    try{await navigator.clipboard.writeText(input.value);status.textContent='참가자 공유 링크를 복사했습니다.';}
    catch{input.focus();input.select();status.textContent='선택된 주소를 복사해 주세요.';}
  };
}
async function sharedGrid(){
  const s=await api(`/api/sessions/${sessionId}`);
  app.className='shared-app';document.title=s.name;
  app.innerHTML=`<main class="shared-main"><div class="shared-welcome"><div class="shared-intro"><span class="eyebrow">이번 연수</span><h1>${escapeHtml(s.name)}</h1><p>목차에서 주제를 선택해 함께 살펴보고 실습해 보세요.</p>${s.surveyPageId?`<a class="button shared-survey-results-link" href="${hrefPage(s.surveyPageId,s.id)}&view=results">설문 결과 보기</a>`:''}</div>${sessionQrCard(s)}</div><nav class="lecture-agenda" aria-labelledby="agenda-title"><div class="agenda-heading"><h2 id="agenda-title">이번 강연의 목차</h2><p>주제를 누르면 설명과 실습 페이지가 열립니다.</p></div><ol class="page-grid shared-grid agenda-grid" style="--columns:${s.gridColumns||3}">${s.pages.map((p,i)=>`<li><a class="agenda-item" href="${hrefPage(p.id,s.id)}"><span class="agenda-number">${String(i+1).padStart(2,'0')}</span><div class="agenda-copy"><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml((p.id==='page-20eeb5cdab19'?parseResourceLinks(p.content).intro:p.content||p.description||'').slice(0,160))}</p></div><span class="agenda-open">${p.id===s.surveyPageId?'설문 열기':'주제 열기'} <span aria-hidden="true">→</span></span></a></li>`).join('')}</ol></nav></main>`;
  bindSessionQr();

}
function localActivity(target,field,page){const key=`page-practice:${page.id}:${field}`;let value='';try{value=localStorage.getItem(key)||''}catch{}target.innerHTML=`<div class="participation"><p class="activity-note">개별 체험 · 내용은 이 브라우저에만 저장됩니다.</p><form><label>나의 생각<textarea name="answer" maxlength="500" required>${escapeHtml(value)}</textarea></label><button class="button primary">이 브라우저에 저장</button><span role="status"></span></form></div>`;target.querySelector('form').onsubmit=e=>{e.preventDefault();try{localStorage.setItem(key,e.target.elements.answer.value);target.querySelector('[role=status]').textContent='저장했습니다.'}catch{target.querySelector('[role=status]').textContent='브라우저에서 저장을 허용하지 않습니다.'}};}
function ideaBoard(page){
  const feedback=page.id==='page-b6afb8c12a41';
  const webApps=page.id===WEB_APPS_PAGE_ID;
  if(page.id!==ideaBoardPageId&&!feedback&&!webApps)return;
  const root=app.querySelector('.learning-page');
  root.classList.add('lp-board-page');
  if(feedback)root.classList.add('lp-feedback-page');
  const heading=webApps?'웹앱 형태의 수업자료에는 어떤 매력이 있나요?':feedback?'이 화면에서 불편한 점은?':'우리의 수업 아이디어';
  const label=webApps?'내가 발견한 웹앱 수업자료의 매력':feedback?'불편한 점과 바꾸고 싶은 점':'만들고 싶은 수업 개요';
  const placeholder=webApps?'눈길을 끈 웹앱과 그 이유를 떠올리며, 나만의 표현으로 적어 주세요.':feedback?'어떤 버튼이 헷갈렸나요? 무엇을 먼저 보여주면 좋을까요?':'학생이 무엇을 하고, 화면은 어떻게 반응하면 좋을까요?';
  const steps=webApps?'<ol class="wa-reflection-steps"><li>아래 웹앱들을 열어 직접 살펴보세요.</li><li>수업자료로서 느낀 매력을 나만의 표현으로 정리하세요.</li><li>포스트잇에 적어 붙여 주세요.</li></ol>':'';
  const anchor=feedback||webApps?root.querySelector('.lp-page-intro'):root;
  const position=feedback||webApps?'afterend':'beforeend';
  const addCard='<button id="lp-note-add" class="lp-note-add-button" type="button" aria-label="포스트잇 추가"><span aria-hidden="true">＋</span><span>포스트잇 추가</span></button>';
  if(!sessionId){
    anchor.insertAdjacentHTML(position,`<section class="lp-board"><div class="lp-board-heading"><h2>${heading}</h2></div>${steps}<div class="lp-note-entry">${addCard}<div id="lp-note-sessions" hidden><p>포스트잇을 붙일 연수</p><div class="lp-note-session-links"></div><p role="status"></p></div></div></section>`);
    const add=root.querySelector('#lp-note-add'),picker=root.querySelector('#lp-note-sessions');
    add.onclick=async()=>{
      picker.hidden=false;add.disabled=true;
      const status=picker.querySelector('[role=status]');status.textContent='연수를 찾는 중…';
      try{
        const {sessions}=await api('/api/admin');
        const details=await Promise.all(sessions.map(session=>api(`/api/sessions/${session.id}`)));
        const matching=details.filter(session=>session.pageIds.includes(page.id));
        const links=picker.querySelector('.lp-note-session-links');links.replaceChildren();
        for(const session of matching){
          const link=document.createElement('a');link.className='button';
          link.href=`/studies/?p=${encodeURIComponent(page.id)}&s=${encodeURIComponent(session.id)}&note=1`;link.target='_blank';link.rel='noopener noreferrer';
          link.textContent=[session.name,session.school,session.lectureDate].filter(Boolean).join(' · ');
          links.append(link);
        }
        status.textContent=matching.length?'':'이 주제를 연수에 추가한 뒤 연수 공유 링크에서 열어 주세요.';
      }catch{status.textContent='참여 중인 연수의 공유 링크에서 이 주제를 열어 주세요.'}
      finally{add.disabled=false}
    };
    return;
  }
  const notesUrl=`/api/sessions/${sessionId}/pages/${page.id}/notes`;
  anchor.insertAdjacentHTML(position,`<section class="lp-board" aria-labelledby="lp-board-title"><div class="lp-board-heading"><div><h2 id="lp-board-title">${heading}</h2></div><span id="lp-note-count" aria-live="polite">0개의 포스트잇</span></div>${steps}<ul id="lp-notes" class="lp-notes lp-notes-compose" aria-label="${heading}"><li class="lp-note-add">${addCard}</li><li class="lp-note-draft" hidden><form id="lp-note-form"><label>이름 또는 별명<input name="name" maxlength="30" placeholder="예: 김교사" required></label><label>${label}<textarea name="text" maxlength="500" rows="4" placeholder="${placeholder}" required></textarea></label><small>${webApps?'이름과 내용이 이 연수의 공유 화면에 표시됩니다.':operatorMode?'운영자만 확인할 수 있습니다.':'작성한 내용은 운영자에게만 전달됩니다.'}</small><div class="lp-board-actions"><button type="submit">붙이기</button><button id="lp-note-cancel" type="button">취소</button></div></form></li></ul><p id="lp-note-status" role="status"></p></section>`);
  const form=root.querySelector('#lp-note-form'),list=root.querySelector('#lp-notes'),status=root.querySelector('#lp-note-status'),count=root.querySelector('#lp-note-count');
  const add=root.querySelector('#lp-note-add'),addItem=add.closest('li'),draft=root.querySelector('.lp-note-draft'),cancel=root.querySelector('#lp-note-cancel');
  add.setAttribute('aria-expanded','false');add.setAttribute('aria-controls','lp-note-form');
  add.onclick=()=>{draft.hidden=false;add.setAttribute('aria-expanded','true');form.elements.name.focus();};
  const closeDraft=()=>{draft.hidden=true;form.elements.text.value='';add.setAttribute('aria-expanded','false');add.focus();};
  cancel.onclick=closeDraft;
  addItem.hidden=operatorMode;
  if(params.get('note')==='1'&&!operatorMode)add.click();
  const cards=new Map();
  let refreshing,liveKey;
  const refresh=()=>refreshing ||= api(notesUrl).then(data=>{
    if(root.isConnected===false)return;
    const key=JSON.stringify(data);if(key===liveKey)return;liveKey=key;
    const {notes,recordsVisible=true}=data;
    if([...cards.keys()].some((id,index)=>notes[index]?.id!==id)){cards.clear();list.replaceChildren(addItem,draft);}
    for(const note of notes){
      let card=cards.get(note.id);
      if(!card){
        card=document.createElement('li');
        const author=document.createElement('strong'),text=document.createElement('p'),replies=document.createElement('details');
        author.textContent=note.name;text.textContent=note.text;
        replies.className='lp-note-replies';
        replies.innerHTML='<summary>댓글 0개 · 쓰기</summary><ul class="lp-comment-list"></ul><form class="lp-comment-form"><label>이름 또는 별명<input name="name" maxlength="30" required></label><label>댓글<textarea name="text" maxlength="500" rows="2" required></textarea></label><button type="submit">댓글 남기기</button><p class="lp-comment-status" role="status"></p></form>';
        const replyForm=replies.querySelector('form'),replyStatus=replies.querySelector('[role=status]');replyForm.hidden=operatorMode;
        replies.querySelector('summary').onclick=event=>{event.preventDefault();replies.open=!replies.open};
        replies.addEventListener('toggle',()=>{if(replies.open&&!replyForm.elements.name.value)replyForm.elements.name.value=form.elements.name.value});
        replyForm.onsubmit=async event=>{
          event.preventDefault();
          const button=replyForm.querySelector('button');button.disabled=true;replyStatus.textContent='등록 중…';
          try{await api(`${notesUrl}/${note.id}/comments`,'POST',{name:replyForm.elements.name.value,text:replyForm.elements.text.value});replyForm.elements.text.value='';if(refreshing)await refreshing;await refresh();replyStatus.textContent='댓글을 남겼습니다.'}
          catch(error){replyStatus.textContent=error.message}
          finally{button.disabled=false}
        };
        card.append(author,text,replies);list.append(card);cards.set(note.id,card);
      }
      const comments=note.comments||[],commentList=card.querySelector('.lp-comment-list');
      if(comments.length<commentList.children.length)commentList.replaceChildren();
      for(const comment of comments.slice(commentList.children.length)){
        const row=document.createElement('li'),author=document.createElement('b'),text=document.createElement('p');
        author.textContent=comment.name;text.textContent=comment.text;row.append(author,text);commentList.append(row);
      }
      card.querySelector('summary').textContent=`댓글 ${comments.length}개${operatorMode?'':' · 쓰기'}`;
    }
    count.textContent=recordsVisible?`${notes.length}개의 포스트잇`:'';
    status.textContent=recordsVisible?'':'다른 참가자의 기록은 운영자만 확인할 수 있습니다.';
  }).catch(error=>{liveKey=null;status.textContent=`${error.message} 잠시 후 다시 시도합니다.`}).finally(()=>{refreshing=null});
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('[type=submit]');button.disabled=cancel.disabled=true;status.textContent='붙이는 중…';
    try{await api(notesUrl,'POST',{name:form.elements.name.value,text:form.elements.text.value});closeDraft();if(refreshing)await refreshing;await refresh();status.textContent='포스트잇을 붙였습니다.'}
    catch(error){status.textContent=error.message}
    finally{button.disabled=cancel.disabled=false}
  };
  refresh();
  const timer=setInterval(()=>{
    if(root.isConnected===false)return clearInterval(timer);
    if(!document.hidden)return refresh();
  },3000);
}
async function resourceEditor(page){
  if(page.id!=='page-20eeb5cdab19')return;
  try{await api('/api/admin')}catch{return}
  const target=document.querySelector('#learning-content');
  const mount=()=>{
    const gallery=target.querySelector('.lp-resource-gallery');
    const {intro,links}=parseResourceLinks(page.content);
    const table=gallery.querySelector('.lp-resource-table'),tbody=table.tBodies[0];
    tbody.replaceChildren();table.classList.add('lp-resource-table-editable');
    const head=document.createElement('th');head.scope='col';head.textContent='관리';table.tHead.rows[0].append(head);
    const saveButton=document.createElement('button');saveButton.type='button';saveButton.className='lp-resource-save';saveButton.textContent='변경 저장';saveButton.disabled=true;
    const toolbar=document.createElement('div');toolbar.className='lp-resource-admin';toolbar.append(gallery.querySelector('.lp-resource-count'),saveButton);gallery.querySelector('.lp-resource-heading').append(toolbar);
    const footer=document.createElement('div');footer.className='lp-resource-table-footer';
    const addRow=document.createElement('button');addRow.type='button';addRow.textContent='+ 빈 행 추가';
    const status=document.createElement('p');status.setAttribute('role','status');footer.append(addRow,status);gallery.querySelector('.lp-resource-table-wrap').after(footer);
    const updatePreview=()=>{
      const preview=[...tbody.rows].flatMap(row=>{
        const [title,description,address]=[...row.querySelectorAll('input')].map(input=>input.value.trim());
        if(!title||!description||!address)return [];
        try{return [{title,description,url:resourceUrl(address)}]}catch{return []}
      });
      gallery.querySelector('.lp-resource-grid, .lp-resource-card-empty').replaceWith(resourceCards(preview));
      gallery.querySelector('.lp-resource-count').textContent=`${String(preview.length).padStart(2,'0')}개의 링크`;
    };
    const mark=()=>{setDirty();saveButton.disabled=false;status.textContent='저장하지 않은 변경 내용';updatePreview()};
    const makeRow=(entry={})=>{
      const row=document.createElement('tr');
      [['title','자료명',120],['description','한 줄 소개',300],['url','주소',2000]].forEach(([key,label,max])=>{
        const cell=document.createElement('td'),input=document.createElement('input');
        input.type='text';if(key==='url'){input.inputMode='url';input.onblur=()=>{if(input.value.trim())try{input.value=resourceUrl(input.value.trim())}catch{}}}input.required=true;input.maxLength=max;input.value=entry[key]||'';input.placeholder=key==='url'?'https://주소 또는 www.주소':label;
        input.setAttribute('aria-label',`${tbody.rows.length+1}번 ${label}`);
        cell.append(input);row.append(cell);
      });
      const cell=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',`${entry.title||'빈 행'} 삭제`);
      remove.onclick=()=>{row.remove();mark()};cell.append(remove);row.append(cell);tbody.append(row);
      return row;
    };
    links.forEach(makeRow);makeRow();
    tbody.addEventListener('input',mark);
    addRow.onclick=()=>makeRow().querySelector('input').focus();
    saveButton.onclick=async()=>{
      const next=[];
      for(const row of tbody.rows){
        const inputs=[...row.querySelectorAll('input')],values=inputs.map(input=>input.value.trim());
        if(values.every(value=>!value))continue;
        if(inputs.some(input=>!input.reportValidity())){status.textContent='빈 칸과 주소를 확인해 주세요.';return}
        if(values.some(value=>value.includes('|'))){status.textContent='| 문자는 입력할 수 없습니다.';return}
        let url;
        try{url=resourceUrl(values[2])}catch{status.textContent='올바른 웹 주소를 입력해 주세요.';return}
        next.push({title:values[0],description:values[1],url});
      }
      if(JSON.stringify(next)===JSON.stringify(links)){dirty=false;saveButton.disabled=true;status.textContent='변경 내용이 없습니다.';return}
      saveButton.disabled=true;addRow.disabled=true;table.querySelectorAll('input,button').forEach(control=>control.disabled=true);status.textContent='저장 중…';
      try{
        const latest=await api(`/api/pages/${page.id}`);
        if(latest.content!==page.content)throw new Error('다른 곳에서 내용이 바뀌었습니다. 페이지를 새로고침한 뒤 다시 수정해 주세요.');
        const content=[intro,next.map(({title,description,url})=>`${title} | ${description} | ${url}`).join('\n')].filter(Boolean).join('\n\n');
        const updated=await api(`/api/pages/${page.id}`,'PATCH',{content});
        page.content=updated.content;dirty=false;renderLearningPage(target,page);mount();toast('링크를 저장했습니다.');
      }catch(error){status.textContent=error.message;saveButton.disabled=false;addRow.disabled=false;table.querySelectorAll('input,button').forEach(control=>control.disabled=false)}
    };
  };
  mount();
}
async function learningView(){let page;if(sessionId){currentSession=await api(`/api/sessions/${sessionId}`);page=currentSession.pages.find(p=>p.id===pageId);if(!page&&currentSession.surveyPageId===pageId)page=await api(`/api/pages/${pageId}?session=${encodeURIComponent(sessionId)}`);if(!page)throw new Error('이 수업에 포함되지 않은 학습 페이지입니다.');if(!operatorMode){token=localStorage.getItem(`workshop:${sessionId}`);if(token){person=(await api(`/api/sessions/${sessionId}/me`,'POST',{token})).person;if(!person){token=null;localStorage.removeItem(`workshop:${sessionId}`)}}}}else page=await api(`/api/pages/${pageId}`);
  document.title=operatorMode?`${page.title} · 관리`:page.title;
  if(operatorMode){
    adminShell(`${page.id==='page-4a2b86a58156'?'':sessionId?sessionAdminLinks(sessionId):'<a class="back-link" href="/studies/?admin=1">← 내용요소</a>'}<div id="learning-content"></div>`,page.id==='page-4a2b86a58156'?'surveys':sessionId?'classes':'pages');
    app.classList.add('learning-app');
  }else{
    app.className='learning-app';app.innerHTML=`${publicHeader(sharedSessionUrl(sessionId),'강연 목차',sessionId?currentSession.name:undefined,sessionId?currentSession.lectureDate:'')}<div id="learning-content"></div>`;
  }
  renderLearningPage(document.querySelector('#learning-content'),page,{resourceCardsOnly:!!sessionId});ideaBoard(page);if(!sessionId)resourceEditor(page);
  if(!operatorMode&&sessionId&&currentSession.pageIds.includes(pageId)){app.classList.add('has-learning-pagination');app.insertAdjacentHTML('beforeend',learningNavigation(currentSession));}
  if(page.id==='page-4a2b86a58156'){const {mountSurvey}=await import('./survey.js');return mountSurvey(app.querySelector('.learning-page'),sessionId,api,currentSession);}
  if(page.id===WEB_APPS_PAGE_ID){
    const {mountWebApps}=await import('./web-apps.js');
    const root=app.querySelector('.learning-page'),account=adminAccountId();
    let lessons=[],catalogError='';
    if(operatorMode||page.webApps?.some(entry=>entry.lessonId)){
      try{const {loadWebAppLessons}=await import('./web-app-lessons.js');lessons=await loadWebAppLessons();}catch(error){catalogError=error.message;}
    }
    if(!root.isConnected||(operatorMode&&account!==adminAccountId()))return;
    return mountWebApps(root,page,{api,fetchQr:operatorMode?operatorFetch:publicFetch,sessionId,canEdit:operatorMode,lessons,catalogError});
  }
  const targets=[...document.querySelectorAll('[data-session-activity]')];
  function drawParticipation(){for(const target of targets){const kind=target.dataset.sessionActivity;if(currentSession?.recordsVisible===false&&['compare','vote'].includes(kind)){target.innerHTML='<p class="empty">참가자별 응답은 운영자만 확인할 수 있습니다.</p>';continue}if(!sessionId){if(['initial','redesign'].includes(kind))localActivity(target,kind,page);else target.innerHTML='<p class="empty">여러 사람의 응답 비교와 투표는 수업 공유 링크에서 참여할 수 있습니다.</p>';continue}if(['initial','redesign'].includes(kind)){if(!person){target.innerHTML=`<div class="participation"><form class="join-form"><label>이름 또는 별명<input name="name" maxlength="30" required placeholder="예: 김교사"></label><button class="button primary">이름으로 참여하기</button><p class="help">이 수업 안에서 첫 아이디어와 재설계를 연결합니다.</p></form></div>`;target.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const result=await api(`/api/sessions/${sessionId}/join`,'POST',{name:e.target.elements.name.value});token=result.token;person=result.person;localStorage.setItem(`workshop:${sessionId}`,token);drawParticipation()}catch(err){toast(err.message);b.disabled=false}}}else{target.innerHTML=`<div class="participation"><p class="activity-note">${escapeHtml(person.name)}님의 ${kind==='initial'?'첫 아이디어':'재설계'}</p>${kind==='redesign'?`<aside class="before-idea"><small>처음 생각</small><p>${escapeHtml(person.initial||'아직 첫 아이디어를 제출하지 않았습니다.')}</p></aside>`:''}<form class="answer-form"><label>${kind==='initial'?'어떤 수업자료를 만들고 싶나요?':'학생의 행동과 화면의 반응을 어떻게 바꿀까요?'}<textarea name="answer" maxlength="500" required>${escapeHtml(person[kind]||'')}</textarea></label><div class="actions"><button class="button primary">${person[kind]?'답변 수정':'답변 제출'}</button><small>500자 이내 · 운영자에게만 전달됩니다.</small></div></form></div>`;target.querySelector('form').onsubmit=async e=>{e.preventDefault();const text=e.target.elements.answer.value,b=e.target.querySelector('button');b.disabled=true;try{await api(`/api/sessions/${sessionId}/answer`,'POST',{token,field:kind,text,pageId:page.id});person[kind]=text;currentSession=await api(`/api/sessions/${sessionId}`);drawParticipation();toast('답변을 저장했습니다.')}catch(err){toast(err.message);b.disabled=false}}}}else if(kind==='compare')target.innerHTML=`<div class="participation">${responseRows(currentSession)}</div>`;else if(kind==='vote'){const candidates=currentSession.people.filter(p=>p.redesign);target.innerHTML=`<div class="participation"><p class="activity-note">${currentSession.votingOpen?'투표를 받고 있습니다.':'진행자가 투표를 열면 참여할 수 있습니다.'} · 한 사람당 한 표, 자기 아이디어도 선택 가능</p>${!person?'<p>위의 입력 활동에서 이름으로 참여한 뒤 투표해 주세요.</p>':''}<div class="vote-candidates">${candidates.map(p=>`<article><strong>${escapeHtml(p.name)}</strong><p>${escapeHtml(p.redesign)}</p>${currentSession.resultsVisible?`<b>${currentSession.counts[p.id]||0}표</b>`:''}${person?.vote===p.id?'<span class="chosen-vote">내가 선택한 아이디어</span>':''}${person&&!person.vote&&currentSession.votingOpen?`<button class="button" data-vote="${p.id}">이 아이디어에 한 표</button>`:''}</article>`).join('')||'<p class="empty">아직 제출된 재설계안이 없습니다.</p>'}</div></div>`;target.querySelectorAll('[data-vote]').forEach(b=>b.onclick=async()=>{target.querySelectorAll('[data-vote]').forEach(x=>x.disabled=true);try{await api(`/api/sessions/${sessionId}/vote`,'POST',{token,targetId:b.dataset.vote,pageId:page.id});person.vote=b.dataset.vote;currentSession=await api(`/api/sessions/${sessionId}`);drawParticipation();toast('한 표를 보냈습니다.')}catch(e){toast(e.message);drawParticipation()}});}}}
  if(operatorMode&&sessionId){
    for(const target of targets)target.hidden=true;
    return;
  }
  drawParticipation();
  if(sessionId&&targets.length){
    let liveKey=JSON.stringify([currentSession.people,currentSession.counts,currentSession.votingOpen,currentSession.resultsVisible,currentSession.generation]),refreshing=false;
    pollTimer=setInterval(async()=>{
      if(targets.every(target=>target.isConnected===false))return clearInterval(pollTimer);
      if(document.hidden||refreshing)return;
      refreshing=true;
      try{
        const next=await api(`/api/sessions/${sessionId}`);
        if(targets.every(target=>target.isConnected===false))return;
        const key=JSON.stringify([next.people,next.counts,next.votingOpen,next.resultsVisible,next.generation]);if(key===liveKey)return;
        const active=document.activeElement;if(targets.some(t=>t.contains(active))&&['TEXTAREA','INPUT'].includes(active.tagName))return;
        if(next.generation!==currentSession.generation){person=null;token=null;localStorage.removeItem(`workshop:${sessionId}`)}
        currentSession=next;liveKey=key;drawParticipation();
      }catch{}finally{refreshing=false}
    },3000);
  }
}
async function start(generation=authGeneration){
  try{
    if((operatorMode&&!await requireAdmin(app))||generation!==authGeneration)return;
    if(pageId)return await learningView();
    if(operatorMode&&sessionId&&(!admin||params.get('tab')==='responses'))return location.replace(`/studies/?admin=1&s=${encodeURIComponent(sessionId)}`);
    if(admin){
      const status=await api('/api/admin');pages=status.pages;sessions=status.sessions;
      if(sessionId||params.has('new'))return await classEditor();
      return params.get('tab')==='classes'?classLibrary():pageLibrary();
    }
    if(sessionId)return await sharedGrid();
    location.replace('/studies/?admin=1');
  }catch(e){if(generation===authGeneration)errorView(e)}
}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
if(operatorMode) onAdminAccountChange(() => { authGeneration++;clearInterval(pollTimer);app.replaceChildren();start(); });
else start();
