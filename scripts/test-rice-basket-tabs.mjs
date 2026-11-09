import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adminReturnPath } from '../js/admin-return.js';
const source = fs.readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
  .replace(/^if \(root[^\n]*\) renderAdmin\(\);$/m, 'await renderAdmin();');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const render = new AsyncFunction('document', 'getAuth', 'firebaseApp', 'fetch', 'escapeHtml', 'location', 'adminReturnPath', source);
const auth = { currentUser: { uid: 'operator', email: 'operator@example.com', getIdToken: async () => 'test-token' }, authStateReady: async () => {} };
const root = { innerHTML: '', dataset: {}, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], querySelector: () => ({addEventListener(){}}) };
let destination;
const location = {origin: 'https://booong.vercel.app', search: '', replace: url => {destination=url;}};
await render({querySelector:()=>root}, ()=>auth, {}, async()=>new Response('{}'), String, location, adminReturnPath);
const research = root.innerHTML.match(/<section class="admin-tool-group" aria-labelledby="admin-erp-title">([\s\S]*?)<\/section>/)?.[1];
assert.ok(research, '연구소 운영 그룹 유지');
assert.match(research, /href="research-erp.html"/);
assert.match(research, /href="\/studies\/\?admin=1&amp;tab=classes"/);
assert.doesNotMatch(research, /target="_blank"/, '연구소 도구는 현재 탭에서 연다');
assert.doesNotMatch(root.innerHTML, /<iframe|role="tablist"|admin-rice-panel/, '운영자 홈에 임베드하지 않는다');
location.search='?tab=rice-basket';
await render({querySelector:()=>root}, ()=>auth, {}, async()=>new Response('{}'), String, location, adminReturnPath);
assert.equal(destination,'/studies/?admin=1&tab=classes', '기존 탭 링크도 독립 경로로 이어진다');
auth.currentUser=null;location.search='';
await render({querySelector:()=>root}, ()=>auth, {}, async()=>{throw new Error('비로그인 요청 금지');}, String, location, adminReturnPath);
assert.match(root.innerHTML,/href="\/index.html"/,'쌀바구니 하위 경로의 로그인 안내도 실제 수업 준비실로 돌아간다');
assert.doesNotMatch(root.innerHTML,/href="index.html"/);
console.log('Rice basket navigation: 연구소 운영 배치·현재 탭 이동·임베드 제거·기존 링크 호환 검사 통과');
