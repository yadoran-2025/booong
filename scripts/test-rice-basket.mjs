import QRCode from 'qrcode';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createHandler } from '../lib/rice-basket/server.mjs';
import { createRiceBasketHandler } from '../api/rice-basket.js';

const originalFetch=globalThis.fetch, originalNow=Date.now;
const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
const jwk={...await exportJWK(publicKey),kid:'rice-basket-test',alg:'RS256',use:'sig'};
const originalAdminEmails=process.env.BOOONG_ADMIN_EMAILS;
process.env.BOOONG_ADMIN_EMAILS='operator@example.com';
let now=originalNow(),loads=0;
Date.now=()=>now;
globalThis.fetch=async (input,options)=>{
 const url=String(input);
 if(url==='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')return new Response(JSON.stringify({keys:[jwk]}));
 return originalFetch(input,options);
};
const pageId='page-4a2b86a58156';
let data={schemaVersion:3,pages:[{id:pageId,title:'설문',sections:[]}],sessions:[{id:'training',shortUrl:'https://private.example/secret',name:'연수',pageIds:[pageId],participants:[{id:'secret-person',name:'PRIVATE_NAME',initial:'PRIVATE_IDEA',tokenHash:'PRIVATE_HASH',vote:'secret-person'}],blocks:[{body:'PRIVATE_DRAFT'}]}],surveys:[]};
const storage={load:async()=>{loads++;return {data:structuredClone(data)};},save:async state=>{data=structuredClone(state.data);}};
const server=createServer(createRiceBasketHandler(createHandler(storage)));
server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
async function token(changes={},aud='yadoran-2025'){
 return new SignJWT({email:'operator@example.com',email_verified:true,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'google.com'},...changes})
 .setProtectedHeader({alg:'RS256',kid:jwk.kid}).setSubject('google-operator').setAudience(aud).setIssuer('https://securetoken.google.com/yadoran-2025').setIssuedAt(Math.floor(Date.now()/1000)).setExpirationTime('5m').sign(privateKey);
}
async function request(path,identity,method='GET',body,extra={}){
 const target=new URL(path,'https://booong.invalid');target.searchParams.set('route',target.pathname);
 const r=await originalFetch(base+'/api/rice-basket?'+target.searchParams,{method,headers:{...(identity?{Authorization:`Bearer ${identity}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});
 assert.equal(r.headers.get('cache-control'),path==='/api/member-training'&&r.ok?'public, max-age=0, s-maxage=30':'no-store');
 return {status:r.status,data:await r.json()};
}
try{
 const operator=await token();
 for(const identity of [null,'forged',await token({email:'member@example.com',admin:true}),await token({email_verified:false}),await token({firebase:{sign_in_provider:'password'}}),await token({},'wrong-project')]){
  for(const route of ['/api/admin','/api/pages/'+pageId]){
   assert.ok([401,403].includes((await request(route,identity)).status));
  }
 }
 assert.equal(loads,0,'비운영자는 저장소를 읽기도 전에 차단한다');
 assert.equal((await request('/api/admin',null,'GET',null,{Cookie:'workshop_admin=old-cookie','x-rice-basket-admin':'true','x-forwarded-for':'127.0.0.1'})).status,401);
 assert.equal((await request('/api/login',operator,'POST',{password:'old-password'})).status,404);
 assert.equal((await request('/api/admin',operator)).data.pages.length,1);
 const qr=await originalFetch(base+'/api/rice-basket?route=/api/sessions/training/qr');
 assert.equal(qr.status,200);
 assert.match(qr.headers.get('content-type'),/image\/svg/);
 assert.equal(await qr.text(),await QRCode.toString(`${base}/studies/?s=training`,{type:'svg',errorCorrectionLevel:'M',margin:4,width:220}));
 const publicSession=await request('/api/sessions/training',null);
 assert.equal(publicSession.data.recordsVisible,false);
 assert.ok(!JSON.stringify(publicSession.data).includes('PRIVATE_'));
 const beforeDenied=loads;
 for(const [path,method] of [['/api/pages','GET'],['/api/sessions','POST'],['/api/sessions/training/reset','POST'],['/api/sessions/training','DELETE'],['/api/sessions/training/qr/extra','GET'],['/api/sessions/training/qr','POST'],['/api/sessions/training/vote','POST'],['/api/sessions/training/me/extra','POST'],['/api/surveys/guess/responses/extra?session=training','POST'],['/api/sessions/training','HEAD']]) {
   if(method==='HEAD') continue;
   assert.equal((await request(path,null,method)).status,401);
 }
 assert.equal(loads,beforeDenied);
 assert.equal((await request('/api/pages/unassigned?session=training',null)).status,404);
 assert.equal((await request('/api/sessions/missing',null)).status,404);
 assert.equal((await request('/api/sessions/training/join',null,'POST',{name:'new'},{Origin:'https://evil.example'})).status,403);
 assert.deepEqual((await request('/api/sessions/training',null)).data.people,[]);
 assert.equal((await request('/api/pages/'+pageId+'?session=training',null)).status,200);
 assert.equal((await request('/api/pages/'+pageId+'?session=missing',null)).status,404);
 assert.equal((await request('/api/sessions/training/extra',null)).status,401);
 const emptyHistoryLoads=loads;
 assert.deepEqual((await request('/api/member-training',null)).data,{trainings:[]});
 assert.deepEqual((await request('/api/member-training',null)).data,{trainings:[]});
 assert.equal(loads,emptyHistoryLoads+1,'공개 프로필 이력은 30초간 저장소를 다시 읽지 않는다');
 for(const body of [null,'CHOI',{},[''],['<script>'],[1],Array(51).fill('CHOI')]) {
   const before=structuredClone(data);
   assert.equal((await request('/api/sessions/training',operator,'PATCH',{name:'저장되면 안 됨',memberCodes:body})).status,400);
   assert.deepEqual(data,before,'잘못된 참가자 코드는 다른 필드도 저장하지 않는다');
 }
 assert.equal((await request('/api/sessions/training',null,'PATCH',{memberCodes:['CHOI']})).status,401);
 assert.equal((await request('/api/sessions/training',operator,'PATCH',{name:'바이브코딩 연수',school:'잠원중학교',lectureDate:'2026-09-28',memberCodes:['CHOI','choi','HOON']})).status,200);
 assert.deepEqual((await request('/api/sessions/training',operator)).data.memberCodes,['CHOI','HOON']);
 assert.deepEqual((await request('/api/member-training',null)).data,{trainings:[{name:'바이브코딩 연수',school:'잠원중학교',lectureDate:'2026-09-28',memberCodes:['CHOI','HOON']}]});
 assert.equal(data.sessions[0].participants.length,1,'BOOONG 선택은 일반 참가자 응답을 바꾸지 않는다');
 assert.equal((await request('/api/sessions/training',null)).data.memberCodes,undefined);
 assert.equal((await request('/api/sessions/training',operator,'PATCH',{school:'수정한 학교'})).status,200);
 assert.deepEqual(data.sessions[0].memberCodes,['CHOI','HOON'],'참가자 필드를 보내지 않으면 기존 선택을 유지한다');
 assert.equal((await request('/api/member-training',null)).data.trainings[0].school,'수정한 학교');
 assert.equal((await request('/api/sessions/training',operator,'PATCH',{memberCodes:[]})).status,200);
 assert.deepEqual((await request('/api/member-training',null)).data.trainings,[],'선택 해제는 이력과 캐시에서도 제거한다');
 const memberSession=await request('/api/sessions',operator,'POST',{name:'새 연수',school:'학교',lectureDate:'2026-10-01',pageIds:[pageId],memberCodes:['Do']});
 assert.equal(memberSession.status,201);
 assert.deepEqual((await request('/api/member-training',null)).data.trainings[0].memberCodes,['Do']);
 assert.equal((await request(`/api/sessions/${memberSession.data.id}`,operator,'DELETE')).status,200);
 assert.deepEqual((await request('/api/member-training',null)).data.trainings,[],'연수 삭제도 프로필에서 제거한다');
 const definition={title:'운영자가 작성한 설문',description:'',questions:[{id:'q1',title:'질문',type:'choice',required:true,options:['첫째','둘째']}]};
 const created=await request('/api/surveys?session=training',operator,'POST',definition);assert.equal(created.status,201);
 const id=created.data.id;
 data.surveys[0].open=false;data.surveys[0].published=false; // Legacy saved surveys remain answerable.
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,null)).status,200,'저장된 설문은 시작 설정 없이 사용할 수 있다');
 assert.deepEqual((await request('/api/surveys?session=training',null)).data.surveys.map(survey=>survey.id),[id]);
 assert.equal((await request(`/api/surveys/${id}?session=training`,null)).status,200);
 assert.equal((await request(`/api/surveys/${id}?session=training`,operator,'PATCH',{open:true})).status,200);
 assert.equal((await request(`/api/surveys/${id}/responses?session=training`,null,'POST',{token:'b'.repeat(32),version:1,answers:{q1:'둘째'}})).status,201);
 assert.deepEqual((await request(`/api/surveys/${id}/my-response?session=training`,null,'POST',{token:'b'.repeat(32)})).data,{answers:{q1:'둘째'}});
 assert.equal((await request(`/api/surveys/${id}?session=training`,null)).data.shareResults,true);
 assert.deepEqual((await request(`/api/surveys/${id}/my-response?session=training`,null,'POST',{token:'c'.repeat(32)})).data,{answers:null});
 const sharedResults=await request(`/api/surveys/${id}/results?session=training`,null);
 assert.equal(sharedResults.status,200);assert.equal(sharedResults.data.total,1);
 assert.equal(sharedResults.data.questions[0].options[1].count,1);
 assert.ok(!JSON.stringify(sharedResults.data).includes('tokenHash'));
 assert.ok(!JSON.stringify((await request(`/api/surveys/${id}?session=training`,null)).data).includes('tokenHash'));
 assert.equal((await request(`/api/surveys/${id}/responses?session=training`,operator,'POST',{token:'a'.repeat(32),version:1,answers:{q1:'첫째'}})).status,201);
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,operator)).data.total,2);
 const otherSession=await request('/api/sessions',operator,'POST',{name:'다른 연수',pageIds:[pageId]});
 assert.equal((await request(`/api/surveys/${id}/results?session=${otherSession.data.id}`,null)).status,404,'다른 연수의 설문 집계를 읽지 않는다');
 assert.equal((await request(`/api/surveys/${id}?session=training`,operator,'PATCH',{shareResults:false})).status,200);
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,null)).status,403,'공개를 끄면 참가자 집계 조회를 차단한다');
 assert.equal((await request(`/api/surveys/${id}?session=training`,null)).data.total,0);
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,operator)).data.total,2);
 const responsesPath=`/api/surveys/${id}/responses?session=training`;
 const privateLoads=loads;
 for(const identity of [null,'forged',await token({email:'member@example.com'})]) assert.ok([401,403].includes((await request(responsesPath,identity)).status));
 assert.equal(loads,privateLoads,'개별 응답은 운영자 확인 전 저장소를 읽지 않는다');
 const individual=await request(responsesPath,operator);
 assert.equal(individual.status,200);
 assert.deepEqual(individual.data.responses,[{answers:{q1:'둘째'}},{answers:{q1:'첫째'}}]);
 assert.ok(!JSON.stringify(individual.data).includes('tokenHash'));
 assert.equal((await request(responsesPath+`&revision=${individual.data.revision}`,operator)).data.unchanged,true);
 assert.equal((await request(`/api/surveys/${id}/responses?session=${otherSession.data.id}`,operator)).status,404);
 assert.equal((await request(`/api/surveys/${id}?session=training`,operator,'PATCH',{open:false})).status,200);
 assert.equal((await request(responsesPath,null,'POST',{token:'c'.repeat(32),version:1,answers:{q1:'둘째'}})).status,201,'예전 시작·마감 값과 관계없이 새 응답을 받는다');
 const beforeInvalid=structuredClone(data);
 for(const body of [{token:'bad',version:1,answers:{q1:'첫째'}},{token:'b'.repeat(32),version:1,answers:{q1:'없는 선택지'}},{token:'b'.repeat(32),version:0,answers:{q1:'첫째'}}]) {
  assert.ok([400,409].includes((await request(responsesPath,null,'POST',body)).status));
  assert.deepEqual(data,beforeInvalid,'잘못된 수정은 기존 응답을 보존한다');
 }
 assert.equal((await request(responsesPath,null,'POST',{token:'b'.repeat(32),version:1,answers:{q1:'첫째'}})).status,200,'마감 후에도 본인의 응답은 수정한다');
 assert.deepEqual((await request(`/api/surveys/${id}/my-response?session=training`,null,'POST',{token:'b'.repeat(32)})).data,{answers:{q1:'첫째'}});
 assert.deepEqual((await request(`/api/surveys/${id}/my-response?session=training`,null,'POST',{token:'a'.repeat(32)})).data,{answers:{q1:'첫째'}},'다른 응답은 그대로 유지한다');
 const revised=await request(responsesPath+`&revision=${individual.data.revision}`,operator);
 assert.equal(revised.data.responses.length,3,'기존 응답 수정은 새 응답을 추가하지 않는다');
 assert.deepEqual(revised.data.responses[0].answers,{q1:'첫째'});
 assert.equal(revised.data.open,true);assert.equal(revised.data.published,true);assert.equal(revised.data.shareResults,false,'개별 답변 갱신에도 현재 접수·공개 상태를 반영한다');
 assert.ok(!JSON.stringify(data).includes('b'.repeat(32)),'수정 비밀값 원문은 저장하지 않는다');
 process.env.BOOONG_ADMIN_EMAILS='second@example.com';
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,operator)).status,403,'명단에서 제외하면 기존 토큰도 차단한다');
 delete process.env.BOOONG_ADMIN_EMAILS;
 assert.equal((await request('/api/admin',operator)).status,503,'환경변수 미설정 시 이전 권한을 사용하지 않는다');
 console.log('Rice basket: Google 운영자 인증·비운영자 차단·기존 비밀번호 무효·자료/설문 저장·권한 회수 검사 통과');
}finally{if(originalAdminEmails===undefined)delete process.env.BOOONG_ADMIN_EMAILS;else process.env.BOOONG_ADMIN_EMAILS=originalAdminEmails;server.close();globalThis.fetch=originalFetch;Date.now=originalNow;}
