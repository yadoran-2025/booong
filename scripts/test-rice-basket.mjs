import QRCode from 'qrcode';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createHandler } from '../lib/rice-basket/server.mjs';
import { createRiceBasketHandler } from '../api/rice-basket.js';
import { MEMBER_PROFILE_SHEET_URL } from '../js/member-data.js';

const originalFetch=globalThis.fetch, originalNow=Date.now;
const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
const jwk={...await exportJWK(publicKey),kid:'rice-basket-test',alg:'RS256',use:'sig'};
let allowed=true,available=true,now=originalNow(),loads=0;
Date.now=()=>now;
globalThis.fetch=async (input,options)=>{
 const url=String(input);
 if(url==='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')return new Response(JSON.stringify({keys:[jwk]}));
 if(url.startsWith(MEMBER_PROFILE_SHEET_URL))return new Response(`id,admin\nuser,${allowed?'operator@example.com':''}\n`,{status:available?200:503});
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
 assert.equal(r.headers.get('cache-control'),'no-store');
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
 assert.equal(await qr.text(),await QRCode.toString(`${base}/rice-basket/?s=training`,{type:'svg',errorCorrectionLevel:'M',margin:4,width:220}));
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
 const definition={title:'운영자가 작성한 설문',description:'',questions:[{id:'q1',title:'질문',type:'choice',required:true,options:['첫째','둘째']}]};
 const created=await request('/api/surveys?session=training',operator,'POST',definition);assert.equal(created.status,201);
 const id=created.data.id;
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,null)).status,404,'작성 중인 설문 집계는 공개하지 않는다');
 assert.deepEqual((await request('/api/surveys?session=training',null)).data.surveys,[]);
 assert.equal((await request(`/api/surveys/${id}?session=training`,null)).status,404);
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
 allowed=false;now+=31000;
 assert.equal((await request(`/api/surveys/${id}/results?session=training`,operator)).status,403,'명단에서 제외하면 기존 토큰도 차단한다');
 available=false;now+=31000;
 assert.equal((await request('/api/admin',operator)).status,503,'명단 확인 장애 시 이전 권한을 사용하지 않는다');
 console.log('Rice basket: Google 운영자 인증·비운영자 차단·기존 비밀번호 무효·자료/설문 저장·권한 회수 검사 통과');
}finally{server.close();globalThis.fetch=originalFetch;Date.now=originalNow;}
