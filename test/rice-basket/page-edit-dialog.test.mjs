import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../rice-basket/app.js',import.meta.url),'utf8');
function setup(){
  const nodes={};
  for(const id of ['add-page','add-page-form','page-form-dialog','page-form-error','cancel-add-page','new-page-title','new-page-content','resource-format','page-form-heading']){
    nodes[id]={value:'',textContent:'',disabled:false,focus(){context.focused=id;}};
  }
  const submit={disabled:false},form=nodes['add-page-form'],dialog=nodes['page-form-dialog'];
  form.querySelector=()=>submit;
  form.reset=()=>{nodes['new-page-title'].value=nodes['new-page-content'].value='';};
  dialog.showModal=()=>{dialog.open=true;};
  dialog.close=()=>{dialog.open=false;queueMicrotask(()=>dialog.onclose());};
  const edit={dataset:{editPage:'page-1'},focus(){context.focused='edit-page-1';}};
  const context=vm.createContext({
    document:{querySelector:selector=>nodes[selector.slice(1)],querySelectorAll:()=>[edit]},
    pages:[{id:'page-1',title:'원래 제목',content:'원래 내용'},{id:'page-2',title:'다른 자료'}],
    async api(path,method,body){context.requests.push({path,method,body});return {id:'page-1',...body};},
    requests:[],draw(){context.draws++;},draws:0,toast(){},location:{href:''},hrefPage:id=>'/rice-basket/?p='+id,
  });
  const start=source.indexOf('  const addButton=');
  vm.runInContext(source.slice(start,source.indexOf('\n  draw();\n}',start)),context);
  return {nodes,submit,form,dialog,context,save:()=>form.onsubmit({preventDefault(){}})};
}
const settle=()=>new Promise(setImmediate);

test('수정은 기존 제목·내용을 모달에 채우고 취소하면 저장 없이 카드로 포커스를 돌린다',async()=>{
  const view=setup();
  view.context.openForm(view.context.pages[0]);
  assert.equal(view.dialog.open,true);
  assert.equal(view.nodes['new-page-title'].value,'원래 제목');
  assert.equal(view.nodes['new-page-content'].value,'원래 내용');
  assert.equal(view.context.focused,'new-page-title');
  view.nodes['new-page-content'].value='저장하지 않을 내용';
  view.nodes['cancel-add-page'].onclick();await settle();
  assert.equal(view.dialog.open,false);
  assert.equal(view.context.requests.length,0);
  assert.equal(view.context.pages[0].content,'원래 내용');
  assert.equal(view.context.focused,'edit-page-1');
});

test('저장 실패 시 모달과 입력을 유지하고 오류를 모달 안에 표시한다',async()=>{
  const view=setup();view.context.openForm(view.context.pages[0]);
  view.nodes['new-page-content'].value='수정한 내용';
  view.context.api=async()=>{throw new Error('저장 실패');};
  await view.save();
  assert.equal(view.dialog.open,true);
  assert.equal(view.nodes['new-page-content'].value,'수정한 내용');
  assert.equal(view.nodes['page-form-error'].textContent,'저장 실패');
  assert.equal(view.submit.disabled,false);
  assert.equal(view.nodes['cancel-add-page'].disabled,false);
});

test('저장 중 중복 제출·닫기를 막고 성공하면 해당 카드만 갱신한다',async()=>{
  const view=setup();view.context.openForm(view.context.pages[0]);
  view.nodes['new-page-title'].value='수정한 제목';
  let finish,calls=0;
  view.context.api=async(path,method,body)=>{
    calls++;assert.equal(path,'/api/pages/page-1');assert.equal(method,'PATCH');
    return new Promise(resolve=>{finish=()=>resolve({id:'page-1',...body});});
  };
  const pending=view.save();let prevented=false;
  view.dialog.oncancel({preventDefault(){prevented=true;}});
  await view.save();
  assert.equal(prevented,true);assert.equal(calls,1);
  assert.equal(view.nodes['cancel-add-page'].disabled,true);
  finish();await pending;await settle();
  assert.equal(view.dialog.open,false);
  assert.equal(view.context.pages[0].title,'수정한 제목');
  assert.equal(view.context.pages[1].title,'다른 자료');
  assert.equal(view.context.draws,1);
  assert.equal(view.context.focused,'edit-page-1');
});

test('빈 내용은 저장하지 않으며 추가도 같은 폼으로 새 자료를 생성한다',async()=>{
  const view=setup();view.context.openForm(view.context.pages[0]);
  view.nodes['new-page-title'].value='  ';await view.save();
  assert.equal(view.context.requests.length,0);
  assert.match(view.nodes['page-form-error'].textContent,/모두 입력/);
  view.dialog.close();await settle();view.nodes['add-page'].onclick();
  assert.equal(view.dialog.open,true);
  assert.equal(view.nodes['new-page-title'].value,'');
  assert.equal(view.nodes['page-form-heading'].textContent,'새 내용요소');
  view.nodes['new-page-title'].value='새 제목';view.nodes['new-page-content'].value='새 내용';
  await view.save();
  assert.equal(view.context.requests[0].path,'/api/pages');
  assert.equal(view.context.requests[0].method,'POST');
  assert.equal(view.context.location.href,'/rice-basket/?p=page-1');
});
