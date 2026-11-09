import { escapeHtml as esc } from '../js/utils.js';
const $ = selector => document.querySelector(selector);
const main = $('#main');
const state = { mode:'browse', school:'중학교', subject:'사회2', unit:'사회2::III. 시장과 가격', middle:'', domain:'일반사회', kind:'all', query:'', page:0, favorites:false };
// shortcut: prototype-only saves stay in memory; connect the existing favorites service when applying.
const saved = new Set();
let catalog;
const splitTitle = title => { const match = title.match(/^([IVXLCDM]+\.)\s*(.+)$/); return match ? [match[1],match[2]] : ['',title]; };
const subjects = () => catalog.subjects.filter(s=>s.school===state.school);
const units = () => catalog.units.filter(u=>u.subject===state.subject);
const resources = () => catalog.resources.filter(r=>r.subjects.includes(state.subject));
const isGeography = u => { const firstHalf = /^(I|II|III|IV|V|VI)\./.test(u.title); return state.subject==='사회1' ? firstHalf : !firstHalf; };
const count = unit => resources().filter(r=>r.unitKeys.includes(unit.key)).length;
const button = (label,attribute,value,active) => `<button ${attribute}="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
function renderSubjects(){
 $('#subjects').innerHTML=subjects().map(s=>button(s.label,'data-subject',s.value,s.value===state.subject)).join('');
 document.querySelectorAll('[data-school]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.school===state.school));
}
function render(){
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===state.mode));
 $('#favorites').setAttribute('aria-pressed',state.favorites);
 renderSubjects();
 if(state.mode==='overview' && !state.query && !state.favorites){renderOverview();return;}
 const unit=units().find(u=>u.key===state.unit);
 const visibleUnits=state.school==='중학교'&&!matchMedia('(max-width:760px)').matches?units().filter(u=>isGeography(u)===(state.domain==='지리')):units();
 let items=(state.favorites?catalog.resources.filter(r=>saved.has(r.id)):state.query?catalog.resources:resources()).filter(r=>(state.query||state.favorites||!state.unit||r.unitKeys.includes(state.unit)) && (!state.middle||(r.middleUnitsByKey?.[state.unit]||[]).includes(state.middle)) && (state.kind==='all'||r.kind===state.kind) && (!state.query||r.searchText.includes(state.query.toLowerCase().normalize('NFKC'))));
 const pageSize=matchMedia('(max-width:760px)').matches?3:6;
 const pages=Math.max(1,Math.ceil(items.length/pageSize)); state.page=Math.min(state.page,pages-1);
 const heading=state.favorites?'내 수업함':state.query?'검색 결과':unit?splitTitle(unit.title)[1]:`${subjects().find(s=>s.value===state.subject)?.label||state.subject} 수업`;
 main.innerHTML=`<div class="workspace"><aside class="units" aria-label="단원 선택"><h2>단원 목차</h2>${state.school==='중학교'?`<div class="domain-buttons" role="group" aria-label="영역 선택">${['일반사회','지리'].map(d=>button(d,'data-domain',d,state.domain===d)).join('')}</div>`:''}<div class="unit-list"><button class="unit-button" data-unit="" aria-pressed="${!state.unit}"><span>전체 수업</span><b>${resources().length}</b></button>${visibleUnits.map(u=>{const [n,t]=splitTitle(u.title);return `<button class="unit-button" data-unit="${esc(u.key)}" aria-pressed="${u.key===state.unit}"><span><i>${esc(n)}</i>${esc(t)}</span><b>${count(u)}</b></button>`}).join('')}</div></aside><section class="content" aria-label="수업 자료"><header class="content-head"><div><h2>${esc(heading)}</h2><span role="status">${items.length}개</span></div><div class="kind-buttons" role="group" aria-label="자료 종류">${[['all','전체'],['lesson','수업'],['game','게임']].map(([v,l])=>button(l,'data-kind',v,state.kind===v)).join('')}</div></header>${unit&&!state.query&&!state.favorites?`<div class="middle-buttons" role="group" aria-label="중단원 선택">${button('전체','data-middle','',!state.middle)}${unit.middleUnits.map(m=>button(m,'data-middle',m,state.middle===m)).join('')}</div>`:''}<div class="resources">${items.slice(state.page*pageSize,(state.page+1)*pageSize).map(renderResource).join('')}</div>${!items.length?'<p class="empty">조건에 맞는 수업이 없습니다. 다른 단원이나 검색어를 선택해 주세요.</p>':''}${items.length>pageSize?`<nav class="pager" aria-label="자료 페이지"><button data-page="${state.page-1}" ${state.page===0?'disabled':''}>← 이전</button><span>${state.page+1} / ${pages}</span><button data-page="${state.page+1}" ${state.page===pages-1?'disabled':''}>다음 →</button></nav>`:''}</section></div>`;
}
function renderResource(r){
 const fallback=/경제|금융|시장/.test(r.searchText)?'economics':/법|정치|헌법/.test(r.searchText)?'civics':'social-studies';
 const image=r.thumbnailUrl||`../assets/lesson-thumbnails/${fallback}-default-v1.jpg`;
 return `<article class="resource"><header class="resource-head"><img class="cover" src="${esc(image)}" alt=""><h3>${esc(r.title)}</h3><button class="save" data-save="${esc(r.id)}" aria-label="${esc(r.title)} 수업함에 담기" aria-pressed="${saved.has(r.id)}">${saved.has(r.id)?'★':'☆'}</button></header><div class="resource-body"><p>${esc(r.desc)}</p><div class="resource-foot"><span>${r.kind==='game'?'게임':'수업'} · ${esc(r.makers.join(', ').toUpperCase())}</span><nav class="resource-actions" aria-label="${esc(r.title)} 자료">${r.actions.map(a=>`<a class="btn btn--secondary" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)} ↗</a>`).join('')}</nav></div></div></article>`;
}
function renderOverview(){
 main.innerHTML=`<section class="overview" aria-label="단원 한눈에"><header class="content-head"><div><h2>${esc(subjects().find(s=>s.value===state.subject)?.label||state.subject)} 단원</h2><span>단원을 선택하면 수업이 열려요</span></div></header><div class="unit-grid">${units().map(u=>{const [n,t]=splitTitle(u.title);const c=count(u);return `<button class="unit-tile ${c?'has-resources':''}" data-open-unit="${esc(u.key)}"><span class="roman">${esc(n)}</span><strong>${esc(t)}</strong><div><span>수업 ${c}개</span><span aria-hidden="true">↗</span></div></button>`}).join('')}</div></section>`;
}
function reset(){state.unit=units().find(u=>count(u)>0)?.key||'';state.middle='';state.page=0;state.domain='일반사회';state.kind='all';state.favorites=false;state.query='';$('#search').value='';}
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-mode')){state.mode=b.dataset.mode;state.favorites=false;state.query='';$('#search').value='';}
 else if(b.hasAttribute('data-school')){state.school=b.dataset.school;state.subject=subjects()[0]?.value||'';reset();}
 else if(b.hasAttribute('data-subject')){state.subject=b.dataset.subject;reset();}
 else if(b.hasAttribute('data-domain')){state.domain=b.dataset.domain;state.unit='';state.middle='';state.page=0;}
 else if(b.hasAttribute('data-unit')||b.hasAttribute('data-open-unit')){state.unit=b.dataset.unit??b.dataset.openUnit;state.middle='';state.page=0;state.mode='browse';state.query='';state.favorites=false;$('#search').value='';const u=units().find(u=>u.key===state.unit);if(u)state.domain=isGeography(u)?'지리':'일반사회';}
 else if(b.hasAttribute('data-middle')){state.middle=b.dataset.middle;state.page=0;}
 else if(b.hasAttribute('data-kind')){state.kind=b.dataset.kind;state.page=0;}
 else if(b.hasAttribute('data-page')){state.page=Number(b.dataset.page);}
 else if(b.hasAttribute('data-save')){const id=b.dataset.save;saved.has(id)?saved.delete(id):saved.add(id);$('#saved-count').textContent=saved.size;b.setAttribute('aria-pressed',saved.has(id));b.textContent=saved.has(id)?'★':'☆';if(state.favorites)render();return;}
 else if(b.id==='favorites'){state.favorites=!state.favorites;state.page=0;state.kind='all';state.middle='';state.query='';$('#search').value='';}

 else return;
 render();
 const attr=['data-mode','data-school','data-subject','data-domain','data-unit','data-middle','data-kind','data-page'].find(a=>b.hasAttribute(a));
 if(attr)Array.from(document.querySelectorAll(`[${attr}]`)).find(n=>n.getAttribute(attr)===b.getAttribute(attr))?.focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{
 const group=event.target.closest('[role=group]');
 if(!group||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const buttons=Array.from(group.querySelectorAll('button')).filter(b=>!b.disabled);
 const index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();
 const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
 buttons[next].focus();
});
$('#search').addEventListener('input',event=>{state.query=event.target.value.trim();state.page=0;state.middle='';state.favorites=false;render();});
matchMedia('(max-width:760px)').addEventListener('change',()=>{state.page=0;if(catalog)render();});
try{const response=await fetch('home-compact-catalog.json');if(!response.ok)throw Error('Catalog unavailable');catalog=await response.json();render();}catch{main.innerHTML='<p class="empty" role="alert">수업 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>';}
