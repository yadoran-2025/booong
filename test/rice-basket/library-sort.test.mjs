import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../rice-basket/app.js',import.meta.url),'utf8');
function setup(horizontal=false){
  const classes=()=>{const names=new Set();return {add:(...items)=>items.forEach(i=>names.add(i)),remove:(...items)=>items.forEach(i=>names.delete(i)),contains:name=>names.has(name)};};
  const rows=['a','b','c'].map((id,i)=>({dataset:{pageId:id},classList:classes(),getBoundingClientRect:()=>({top:i*60,height:60,left:i*210,width:210})}));
  const handles=rows.map(row=>({dataset:{sortPage:row.dataset.pageId},disabled:false,focus(){context.focused=this.dataset.sortPage;},setPointerCapture(){this.captured=true;},hasPointerCapture(){return this.captured;},releasePointerCapture(){this.captured=false;},closest(){return this;}}));
  const nav={children:rows,attributes:{},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},querySelectorAll(selector){return selector==='[data-sort-page]'?handles:rows;}};
  const context=vm.createContext({
    document:{querySelector:()=>nav},window:{matchMedia:()=>({matches:horizontal})},
    pages:['a','b','c'].map(id=>({id})),calls:[],messages:[],failed:false,
    async api(path,method,body){context.calls.push({path,method,body});if(context.failed)throw new Error('저장 실패');return {pages:body.pageIds.map(id=>context.pages.find(p=>p.id===id))};},
    draw(){handles.forEach(h=>h.disabled=false);},toast:message=>context.messages.push(message),
  });
  vm.runInContext(source.slice(source.indexOf('  const indexNav='),source.indexOf('  const draw=()=>{')),context);
  const pointer=(handle,x,y,extra={})=>({target:handle,pointerId:7,button:0,clientX:x,clientY:y,preventDefault(){},...extra});
  return {context,nav,handles,rows,pointer,order:()=>Array.from(context.pages,p=>p.id)};
}
const settle=()=>new Promise(setImmediate);

test('사이드바 드래그는 데스크톱과 가로 목록에서 전체 순서를 저장한다',async()=>{
  for(const horizontal of [false,true]){
    const view=setup(horizontal),{nav,handles,pointer}=view;
    nav.onpointerdown(pointer(handles[0],10,10));
    nav.onpointermove(pointer(handles[0],horizontal?650:10,200));
    assert.equal(view.rows[2].classList.contains('drop-after'),true);
    nav.onpointerup(pointer(handles[0],horizontal?650:10,200));
    await settle();
    assert.deepEqual(view.order(),['b','c','a']);
    assert.equal(view.context.calls[0].path,'/api/pages/order');
    assert.equal(view.context.calls[0].method,'PUT');
    assert.deepEqual(Array.from(view.context.calls[0].body.pageIds),['b','c','a']);
    assert.equal(view.context.focused,'a');
    assert.equal(handles[0].captured,false);
  }
});

test('아래 항목을 위로 드래그하고 키보드로도 순서를 변경한다',async()=>{
  const drag=setup();
  drag.nav.onpointerdown(drag.pointer(drag.handles[2],10,150));
  drag.nav.onpointermove(drag.pointer(drag.handles[2],10,0));
  drag.nav.onpointerup(drag.pointer(drag.handles[2],10,0));
  await settle();assert.deepEqual(drag.order(),['c','a','b']);
  const key=setup();
  key.nav.onkeydown({target:key.handles[1],key:'ArrowUp',preventDefault(){}});
  await settle();assert.deepEqual(key.order(),['b','a','c']);
  assert.equal(key.context.focused,'b');
});

test('취소·동일 위치·비활성 손잡이는 저장하지 않고 실패 시 기존 순서를 유지한다',async()=>{
  for(const cancel of ['onpointercancel','onlostpointercapture','Escape']){
    const view=setup();
    view.nav.onpointerdown(view.pointer(view.handles[0],10,10));
    view.nav.onpointermove(view.pointer(view.handles[0],10,200));
    if(cancel==='Escape')view.nav.onkeydown({key:'Escape'});else view.nav[cancel]();
    view.nav.onpointerup(view.pointer(view.handles[0],10,200));
    assert.equal(view.context.calls.length,0);
    assert.equal(view.rows.some(row=>row.classList.contains('drop-after')),false);
  }
  const view=setup();
  view.nav.onpointerdown(view.pointer(view.handles[0],10,10));
  view.nav.onpointerup(view.pointer(view.handles[0],10,10));
  await view.context.movePage('a',0);await view.context.movePage('a',-1);
  view.handles[0].disabled=true;
  view.nav.onpointerdown(view.pointer(view.handles[0],10,10));
  view.nav.onpointermove(view.pointer(view.handles[0],10,200));
  view.nav.onpointerup(view.pointer(view.handles[0],10,200));
  assert.equal(view.context.calls.length,0);
  view.context.failed=true;
  await view.context.movePage('a',2);
  assert.deepEqual(view.order(),['a','b','c']);
  assert.equal(view.context.messages.at(-1),'저장 실패');
  assert.equal(view.handles.some(h=>h.disabled),false);
});

test('카드에는 수정·삭제만 표시한다',()=>{
  const context=vm.createContext({hrefPage:()=>'/page',escapeHtml:String});
  vm.runInContext(source.slice(source.indexOf('function pageCard('),source.indexOf('function pageLibrary(')),context);
  const html=context.pageCard({id:'a',title:'제목',content:'내용'},{manage:true});
  assert.match(html,/>수정<\/button>/);assert.match(html,/>삭제<\/button>/);
  assert.doesNotMatch(html,/page-move-actions|data-move-page|제목·내용 수정/);
});
