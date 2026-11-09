import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {escapeHtml} from '../js/utils.js';
import {thumbnailUrl} from '../js/thumbnail-data.js';
import {memberFeaturedWorks} from '../js/member-data.js';

const source=readFileSync(new URL('../js/about.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^init\(\);$/m,'');
const cards=Array.from({length:4},()=>({style:{values:{},setProperty(k,v){this.values[k]=v;}},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},querySelector:()=>({}),querySelectorAll:()=>[]}));
const captions={}, buttons=cards.map(()=>({setAttribute(k,v){this[k]=v;},scrollIntoView(){this.scrolled=true;}}));
const context=vm.createContext({
 document:{getElementById:()=>({querySelectorAll:selector=>selector==='[data-gallery-card]'?cards:selector==='[data-gallery-index]'?buttons:[],querySelector:selector=>selector.startsWith('[data-gallery-index=')?buttons[Number(selector.match(/\d+/)[0])]:captions[selector]||=( {})})},
 escapeHtml,thumbnailUrl,memberFeaturedWorks,getMemberLookupKeys:member=>[member.id.toLowerCase()],location:{pathname:'/about.html',search:'',hash:''},history:{replaceState(...args){context.lastUrl=args[2];}},
});
vm.runInContext(source,context);
context.members=[{id:'CHOI',name:'최진영'},{id:'Hyum',name:'김현석'},{id:'Do',name:'이도빈'}];
vm.runInContext('state.members=members',context);
context.showGallerySlide(0);
assert.equal(context.lastUrl,'/about.html');assert.equal(cards[0]['aria-hidden'],'false');assert.equal(cards[1]['aria-hidden'],'true');
assert.equal(captions['[data-gallery-count]'].textContent,'01 / 04');
context.showGallerySlide(1);assert.equal(context.lastUrl,'#CHOI');assert.equal(captions['[data-gallery-caption]'].textContent,'최진영');assert.equal(buttons[1].scrolled,true);
context.showGallerySlide(-1);assert.equal(context.lastUrl,'#Do','처음에서 뒤로 가면 마지막 구성원으로 이동');
context.showGallerySlide(4);assert.equal(context.lastUrl,'/about.html','끝에서 앞으로 가면 소개로 이동');
assert.equal(context.galleryOffset(3,0,4),-1);assert.equal(context.galleryOffset(0,3,4),1);
context.location.hash='#hyum';assert.equal(context.getInitialSelectedMemberId(context.members),'Hyum');
context.location.hash='#%E0%A4%A';assert.equal(context.getInitialSelectedMemberId(context.members),'','잘못된 해시가 초기 화면을 중단하지 않는다');
const preview=context.renderMemberPreview({id:'x',name:'<script>name</script>',bio:'<img src=x>',interests:'경제, 정치'},1);
assert.match(preview,/&lt;script&gt;name&lt;\/script&gt;/);assert.doesNotMatch(preview,/<script>|<img src=x>/);
console.log('About gallery: intro, member navigation, wraparound, direct links and escaped previews passed.');

function eventNode(dataset = {}) {
  return { dataset, listeners:{}, isConnected:true, addEventListener(name,handler){this.listeners[name]=handler;}, setAttribute(){}, focus(){this.focused=true;}, scrollIntoView(){} };
}
const stage=eventNode(), gallery=eventNode(), dialog=eventNode(), page=eventNode();
stage.classList={add(){},remove(){}};
const media={matches:false,addEventListener(){}};page.matchMedia=()=>media;
const frames=new Map(),timers=new Map();let sequence=0,frameTime=0;
const nextFrame=()=>{const [id,callback]=frames.entries().next().value;frames.delete(id);callback(frameTime+=16);};
const finishMotion=()=>{for(const [id,callback] of [...timers]){timers.delete(id);callback();}let remaining=300;while(frames.size&&remaining--)nextFrame();assert.equal(frames.size,0,'관성 이동이 끝나면 프레임을 멈춘다');};
stage.clientHeight=500;stage.setPointerCapture=()=>{};
dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.listeners.close();};
const steps=[eventNode({galleryStep:'-1'}),eventNode({galleryStep:'1'})];
const indices=Array.from({length:4},(_,i)=>eventNode({galleryIndex:String(i)}));
const overlays=Array.from({length:4},(_,i)=>eventNode({openSlide:String(i)}));
const detail={querySelector:()=>null,scrollTop:0}, focusCard=eventNode();
const nodes={'.about-gallery':gallery,'.about-gallery__stage':stage,'.member-profile-dialog':dialog,'.member-detail':detail,'.member-card':focusCard,'[data-gallery-caption]':{},'[data-gallery-count]':{}};
const interactiveRoot={querySelector:selector=>selector.startsWith('[data-gallery-index=')?indices[Number(selector.match(/\d+/)[0])]:nodes[selector]||null,querySelectorAll:selector=>({'[data-gallery-step]':steps,'[data-gallery-index]':indices,'[data-open-slide]':overlays,'[data-gallery-card]':cards}[selector]||[])};
let clock=10000;
const interactive=vm.createContext({
  document:{getElementById:()=>interactiveRoot,addEventListener(){}},window:page,AbortController,escapeHtml,memberFeaturedWorks,
  requestAnimationFrame:callback=>{frames.set(++sequence,callback);return sequence;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:callback=>{timers.set(++sequence,callback);return sequence;},clearTimeout:id=>timers.delete(id),
  location:{pathname:'/about.html',search:'',hash:''},history:{replaceState(){}},
  Date:class extends Date{static now(){return clock;}},memberTrainingCareer:()=>[],getMemberLookupKeys:()=>[],
});
vm.runInContext(source,interactive);interactive.members=context.members;vm.runInContext('state.members=members',interactive);interactive.bindAboutGallery();
const wheel={cancelable:true,ctrlKey:false,deltaX:0,deltaY:25,deltaMode:0,preventDefault(){this.prevented=true;}};
stage.listeners.wheel(wheel);finishMotion();assert.equal(nodes['[data-gallery-count]'].textContent,'01 / 04','작은 흔들림은 원래 카드에 안착한다');
stage.listeners.wheel({...wheel,deltaY:100});nextFrame();
assert.ok(cards[0].style.values['--offset']<0&&cards[0].style.values['--offset']>-.16,'휠 입력을 프레임마다 조금씩 따라간다');
finishMotion();assert.equal(nodes['[data-gallery-count]'].textContent,'02 / 04');
stage.listeners.wheel({...wheel,deltaY:400});stage.listeners.wheel({...wheel,deltaY:400});finishMotion();
assert.equal(nodes['[data-gallery-count]'].textContent,'04 / 04','연속 입력을 버리지 않고 누적한다');
media.matches=true;stage.listeners.wheel({...wheel,deltaY:-100});assert.equal(frames.size,0);finishMotion();
assert.equal(nodes['[data-gallery-count]'].textContent,'03 / 04','모션 최소화에서는 프레임 애니메이션을 쓰지 않는다');media.matches=false;
indices[0].listeners.click();
gallery.listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(nodes['[data-gallery-count]'].textContent,'02 / 04');
gallery.listeners.keydown({key:'Home',preventDefault(){}});
stage.listeners.pointerdown({isPrimary:true,button:0,pointerId:1,clientX:300});
stage.listeners.pointermove({pointerId:1,clientX:200});stage.listeners.pointerup({pointerId:1,clientX:100});
assert.equal(nodes['[data-gallery-count]'].textContent,'02 / 04');
overlays[1].listeners.click();assert.equal(dialog.open,undefined,'스와이프 직후 합성 클릭은 프로필을 열지 않는다');
clock+=300;dialog.scrollTop=400;overlays[1].listeners.click();assert.equal(dialog.open,true);assert.match(detail.innerHTML,/최진영/);assert.equal(dialog.scrollTop,0,'프로필을 다시 열면 소개가 있는 맨 위에서 시작한다');
detail.contains=()=>true;focusCard.focused=false;dialog.scrollTop=120;interactive.renderMemberDetail();assert.equal(focusCard.focused,true,'프로필 자료가 갱신되어도 키보드 초점을 화면 안에 유지한다');assert.equal(dialog.scrollTop,120);detail.contains=()=>false;
dialog.close();assert.equal(overlays[1].focused,true,'프로필을 닫으면 원래 카드로 초점을 돌린다');
interactive.document.activeElement={closest:()=>({dataset:{galleryCard:'1'}})};
stage.listeners.click({target:{closest:selector=>selector==='[data-gallery-card]'?{dataset:{galleryCard:'2'}}:null}});
assert.equal(nodes['[data-gallery-count]'].textContent,'03 / 04');assert.equal(stage.focused,true,'옆 카드로 이동할 때 숨길 카드 안에 초점을 남기지 않는다');
indices[0].listeners.click();overlays[0].listeners.click();stage.listeners.click({target:{closest:()=>overlays[0]}});
assert.equal(nodes['[data-gallery-count]'].textContent,'02 / 04','소개 카드 버튼의 버블링으로 이동을 되돌리지 않는다');
console.log('About gallery: damped wheel, idle snapping, reduced motion, keyboard, swipe and profile focus passed.');

const careerMember={id:'CHOI',career:['오래된 학교(2022)','직전 학교(2024)','현재 학교(2026-)','(예정) 다음 학교(2027-)']};
const affiliations=context.memberAffiliations(careerMember);
assert.equal(affiliations.map(item=>item.place).join(','),'현재 학교,직전 학교');
const careerPreview=context.renderMemberPreview(careerMember,1);
assert.ok(careerPreview.indexOf('현재 학교')<careerPreview.indexOf('직전 학교'));
assert.doesNotMatch(careerPreview,/오래된 학교|다음 학교/);
assert.equal(context.memberAffiliations({}).length,0);
assert.equal(context.memberAffiliations({career:['유일한 학교(2024-)']}).length,1);
context.work={id:'group-5',type:'lesson',title:'대표 <콘텐츠>',href:'https://example.com/work',external:true};
vm.runInContext("state.makerWorkMap.set('choi',[work]);state.thumbnails['group-5']={url:'/api/lesson-thumbnails?image=custom.webp'};",context);
const featured=context.renderFeaturedWork({id:'CHOI'});
assert.match(featured,/대표 콘텐츠/);assert.match(featured,/대표 &lt;콘텐츠&gt;/);assert.match(featured,/image=custom.webp/);assert.match(featured,/href="https:\/\/example.com\/work"/);
assert.equal(context.renderFeaturedWork({id:'none'}),'');
assert.doesNotMatch(context.renderMemberPreview({id:'none',name:'이름'},2),/소속·활동/);
const fullInterests=context.renderMemberPreview({id:'CHOI',bio:'나의 캐치프레이즈',interests:'첫 관심사, 두 번째, 세 번째, 네 번째도 표시',career:['현재 학교(2026-)']},1);
assert.match(fullInterests,/네 번째도 표시/);assert.match(fullInterests,/gallery-card__bio">나의 캐치프레이즈/);
assert.ok(fullInterests.indexOf('나의 캐치프레이즈')<fullInterests.indexOf('첫 관심사')&&fullInterests.indexOf('네 번째도 표시')<fullInterests.indexOf('현재 학교'),'캐치프레이즈와 관심사를 경력보다 먼저 표시한다');
context.moreWorks=[context.work,{...context.work,id:'two',title:'두 번째'},{...context.work,id:'three',title:'세 번째'},{...context.work,id:'four',title:'네 번째'}];
vm.runInContext("state.makerWorkMap.set('choi',moreWorks)",context);
assert.equal((context.renderFeaturedWork({id:'CHOI'}).match(/data-preview-work/g)||[]).length,3);
const chosen=context.renderFeaturedWork({id:'CHOI',featuredWorkIds:['lesson:three','lesson:group-5','lesson:unowned']});
assert.ok(chosen.indexOf('세 번째')<chosen.indexOf('대표 &lt;콘텐츠&gt;'));assert.doesNotMatch(chosen,/unowned/);
assert.equal(context.renderFeaturedWork({id:'CHOI',featuredWorkIds:[]}), '');
const scrollableWheel={...wheel,prevented:false,target:{closest:()=>({scrollTop:0,clientHeight:100,scrollHeight:400})}};
stage.listeners.wheel(scrollableWheel);assert.equal(scrollableWheel.prevented,false,'긴 카드 내용은 세로 스크롤로 끝까지 읽을 수 있다');
gallery.listeners.keydown({...scrollableWheel,key:'PageDown',preventDefault(){throw new Error('긴 카드의 키보드 스크롤을 가로채지 않는다');}});
console.log('Member previews show available affiliation and a published work with managed thumbnails.');
