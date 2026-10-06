import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const {catalogueOnly,cachedSnapshot,freshLoanSource,loanResults} = new Function((await readFile(new URL('../js/watcha-library-cache.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'') + '\nreturn {catalogueOnly,cachedSnapshot,freshLoanSource,loanResults};')();
import { WATCHA_PROFILES, SUWON_LIBRARIES, YONGIN_LIBRARIES, EXTRA_SOURCES, sourceSearchUrl, selectedLibraryResults, selectedAvailability, normalizeIsbn, parseWishPage, parseRatedPage, isbnFromWatchaHtml, bookInfoFromWatchaHtml, normalizeCopies, parseYonginPage } from '../js/watcha-library-data.js';
import { fetchWishPage, fetchBook, lookupAvailability, sourceText, parseSejongCopies, normalizeCyberBooks } from '../lib/watcha-library.js';

assert.equal(normalizeIsbn('978-89-374-4880-5'), '9788937448805');
assert.equal(normalizeIsbn('89 374 4880 7'), '9788937448805');
assert.equal(normalizeIsbn('0-8044-2957-X'), '9780804429573');
for (const value of ['', '9788937448806', '1234567890', 'foo9788937448805', '9788937448805 03300']) assert.equal(normalizeIsbn(value), null);
const coverUrl='https://an2-img.amz.wtchn.net/image/v2/book-cover.jpg?jwt=public-image';
const wish = { metadata: { total_count: 21 }, result: { next_uri: '/api/users/WwRqoyDgkV5lz/contents/books/wishes?order=updated&page=2&size=20', result: [{ content: { code: 'boTEST1', content_type: 'books', title: '<책>', year: 2026, poster:{medium:coverUrl} } }] } };
assert.deepEqual(parseWishPage(wish, 1, 1).books, [{ id: 'boTEST1', title: '<책>', year: 2026, url: 'https://pedia.watcha.com/ko/contents/boTEST1', coverUrl }]);
for (const medium of [undefined,'javascript:alert(1)','http://an2-img.amz.wtchn.net/cover.jpg','https://evil.example/cover.jpg','https://an2-img.amz.wtchn.net.evil.example/cover.jpg']) {
  const content={...wish.result.result[0].content,poster:{medium}};
  assert.equal(parseWishPage({...wish,result:{...wish.result,result:[{content}]}},1,1).books[0].coverUrl,null);
}
assert.equal(parseWishPage(wish, 1, 1).nextPage, 2);
assert.throws(() => parseWishPage({ result: { result: [] } }, 1));
assert.throws(() => parseWishPage({metadata:{total_count:1099},result:{result:[],next_uri:null}},1));
assert.throws(() => parseWishPage({...wish,result:{...wish.result,next_uri:null}},1));
assert.throws(() => parseWishPage({ ...wish, result: { ...wish.result, next_uri: '/bad' } }, 1));
const ratedPage={metadata:{total_count:1},result:{next_uri:null,result:[{content:wish.result.result[0].content,user_content_action:{user_code:WATCHA_PROFILES[0].id,content_code:'boTEST1',rating:7,rate_created_at:'2026-07-13T19:05:34+09:00'}}]}};
assert.equal(parseRatedPage(ratedPage,1,WATCHA_PROFILES[0].id).books[0].rating,3.5,'Convert the source ten-point scale to five stars');
for(const rating of [0,11,3.5,null,'7'])assert.throws(()=>parseRatedPage({...ratedPage,result:{...ratedPage.result,result:[{...ratedPage.result.result[0],user_content_action:{...ratedPage.result.result[0].user_content_action,rating}}]}},1,WATCHA_PROFILES[0].id));
assert.throws(()=>parseRatedPage(ratedPage,1,WATCHA_PROFILES[1].id),'Never attribute another profile rating to this person');
assert.throws(()=>parseRatedPage({...ratedPage,result:{...ratedPage.result,result:[{...ratedPage.result.result[0],user_content_action:{...ratedPage.result.result[0].user_content_action,content_code:'bOTHER0'}}]}},1,WATCHA_PROFILES[0].id));
assert.deepEqual(parseRatedPage({metadata:{total_count:0},result:{result:[],next_uri:null}},1,WATCHA_PROFILES[0].id).books,[]);
const kyobo = 'http://www.kyobobook.co.kr/cooper/redirect_over.jsp?next_url=https://www.kyobobook.co.kr/product?barcode=9788937448805';
const html = `<h1>책</h1><a href="https://redirect.watcha.com/galaxy/${Buffer.from(kyobo).toString('base64url')}">교보</a>`;
const sampleInfo={title:'테스트 책',authors:['첫 저자','둘째 저자'],description:'첫 문단\n\n다음 문단',genres:['사회과학'],published:'2020',publisher:'출판사'};
const metadataHtml = `<script type="application/ld+json">${JSON.stringify({'@type':'Book',url:'https://pedia.watcha.com/ko/contents/boTEST1',name:sampleInfo.title,author:sampleInfo.authors.map(name=>({name})),description:'첫 문단\\n\\n다음 문단',genre:sampleInfo.genres,datePublished:'2020',publisher:{name:'출판사'}})}</script>`;
assert.deepEqual(bookInfoFromWatchaHtml(html+metadataHtml,'boTEST1'),sampleInfo);
assert.deepEqual(bookInfoFromWatchaHtml(metadataHtml,'bOTHER0').authors,[],'Ignore metadata belonging to another book');
assert.deepEqual(bookInfoFromWatchaHtml('<script type="application/ld+json">broken</script>'+html,'boTEST1').authors,[],'Missing or malformed optional metadata must not break ISBN lookup');
assert.equal(isbnFromWatchaHtml(html), '9788937448805');
assert.equal(isbnFromWatchaHtml('광고 ISBN 9788937448805'), null);
const other = 'https://www.kyobobook.co.kr/?barcode=9788937448805&other=9780804429573';
assert.equal(isbnFromWatchaHtml(`<a href="https://redirect.watcha.com/galaxy/${Buffer.from(other).toString('base64url')}">구매</a>`), '9788937448805');
const copies = [{ BOOK_KEY:'1', LIB_NAME: '북수원', ISBN: '9788937448805', LOAN_CODE: 'OK', CALL_NO: '326', SHELF_LOC_NAME: '종합자료실' }, { BOOK_KEY:'2', LIB_NAME: '북수원', ISBN: '9788937448805', LOAN_CODE: 'OUT_ON_LOAN' }, { BOOK_KEY:'3', LIB_NAME: '광교', ISBN: '9788937448805', LOAN_CODE: 'NOT_ALLOWED', USE_LIMIT_CODE: 'CD' }, { BOOK_KEY:'4', LIB_NAME: '새도서관', ISBN: '9788937448805', LOAN_CODE: 'NEW_CODE' }];
assert.equal(normalizeCopies(copies, '9788937448805').status, 'available');
assert.equal(normalizeCopies(copies.slice(1), '9788937448805').status, 'unknown');
assert.equal(normalizeCopies(copies.slice(3), '9788937448805').status, 'unknown');
assert.equal(normalizeCopies([{...copies[0],LOAN_CODE:'constructor'}], '9788937448805').status, 'unknown');
assert.equal(normalizeCopies([], '9788937448805').status, 'not_held');
assert.equal(normalizeCopies([{...copies[0], ISBN:'9780804429573'}], '9788937448805').status, 'unknown');
const resultHtml = `<div class="result_screen">검색결과 총<strong class="highlight">2</strong> 건</div><div class="bookList listViewStyle"><ul class="listWrap"><li><div class="book_info barList info03"><div><p>중앙도서관</p><p>종합자료실</p></div></div><div class="status"><p>대출불가<span>(상호대차중)</span></p></div><button onclick="fnCollectionBookList(1, '2', 'BO', '9788937448805', 'MA');"></button></li><li><div class="book_info barList info03"><div><p>동천도서관</p><p>자료실2</p></div></div><div class="status"><p>대출가능<span>(비치중)</span></p></div><button onclick="fnCollectionBookList(3, '4', 'BO', '9788937448805', 'NA');"></button></li></ul></div>`;
assert.equal(parseYonginPage(resultHtml, '9788937448805').copies.length, 2);
assert.equal(parseYonginPage(resultHtml, '9788937448805').copies[0].LOAN_CODE, 'OTHER_LOAN');
const yonginWithCallNo = resultHtml.replace('<li>', '<li><div class="book_info barList info02"><div><p>민음사</p><p>2026</p><p>359.11-전94ㅇ</p></div></div>');
assert.equal(parseYonginPage(yonginWithCallNo, '9788937448805').copies[0].CALL_NO, '359.11-전94ㅇ');
assert.equal(parseYonginPage(resultHtml, '9788937448805').copies[0].CALL_NO, '', 'Missing call numbers must not break loan lookups');
assert.throws(() => parseYonginPage(resultHtml.replace(/fnCollectionBookList/g,'changed'), '9788937448805'));
assert.throws(() => parseYonginPage('<html>점검중</html>', '9788937448805'));
assert.equal(parseYonginPage(resultHtml.replace(/총<strong[^>]*>2/, '총<strong>0').replace(/<li>[\s\S]*<\/li>/, ''), '9788937448805').total, 0);

const selectionBook={result:{isbn:'9788937448805',libraries:[{id:'gyeonggi',status:'unavailable'},{id:'suwon',status:'available'},{id:'yongin',status:'not_held'}]}};
selectionBook.result.libraries=selectionBook.result.libraries.map(library=>({...library,name:library.id,copies:[],sourceUrl:'https://example.com',checkedAt:new Date().toISOString()}));
assert.equal(selectedAvailability(selectionBook,['suwon']),'available');
assert.equal(selectedAvailability(selectionBook,['gyeonggi','yongin']),'unavailable','An available unselected region must not make the card green');
assert.equal(selectedAvailability(selectionBook,['gyeonggi','suwon']),'available','Any selected available region makes the card green');
assert.equal(selectedAvailability(selectionBook,[]),'unselected');
assert.equal(selectedAvailability({},['suwon']),'pending');
assert.equal(selectedAvailability({...selectionBook,loading:true},['suwon']),'available','Keep the last successful availability while refreshing');
assert.equal(selectedAvailability({result:{isbn:null}},['suwon']),'unknown');
assert.equal(selectedAvailability({error:'offline'},['suwon']),'unknown');
assert.equal(selectedAvailability({result:{isbn:'9788937448805',libraries:[{id:'gyeonggi',status:'unavailable'},{id:'suwon',status:'error'}]}},['gyeonggi','suwon']),'unknown','A failed selected region must never be painted as unavailable');
assert.equal(selectedAvailability({result:{isbn:'9788937448805',libraries:[{id:'suwon',status:'available'},{id:'yongin',status:'unknown'}]}},['suwon','yongin']),'available');
assert.equal(selectedAvailability(selectionBook,['missing']),'unknown');

const sejongHtml = `<p>ISBN 9788937448805</p><table><caption>권별정보 안내</caption><input id="REGIST_NO_0" value="SE0000844741"><input id="SHELV_STTUS_0" value="1"><input id="USE_LMTT_CODE_0" value="GM"><input id="CNT_LON_RESVE_0" value="0"><input id="SHELF_CODE_NM_0" value="일반자료실"><input id="RQEST_NO_0" value="326.34"></table>`;
const cyberData = {httpStatus:'OK', data:{totalElements:1, contents:[{ISBN:'9788937448805',CONTENT_TYPE:'EB',SERVICE_USE_YN:'Y',LOANABLE:'1',TITLE:'책',L_CATEGORY_NAME:'소설'}]}};
assert.equal(normalizeCopies(parseSejongCopies(sejongHtml,'9788937448805'),'9788937448805').status,'unavailable');
assert.equal(normalizeCopies(parseSejongCopies(sejongHtml.replace('value="1"','value="2"'),'9788937448805'),'9788937448805').status,'available');
assert.equal(normalizeCopies(parseSejongCopies(sejongHtml.replace('value="1"','value="2"').replace('CNT_LON_RESVE_0" value="0"','CNT_LON_RESVE_0" value="2"'),'9788937448805'),'9788937448805').status,'unavailable');
assert.throws(()=>parseSejongCopies('<html>점검중</html>','9788937448805'));
assert.equal(normalizeCyberBooks(cyberData,'9788937448805').status,'available');
assert.equal(normalizeCyberBooks({...cyberData,data:{...cyberData.data,contents:[{...cyberData.data.contents[0],LOANABLE:'0'}]}},'9788937448805').status,'unavailable');
assert.equal(normalizeCyberBooks(cyberData,'9780804429573').status,'unknown');
assert.equal(normalizeCyberBooks({httpStatus:'OK',data:{totalElements:0,contents:[]}},'9788937448805').status,'not_held');
assert.throws(()=>normalizeCyberBooks({httpStatus:'OK',data:{totalElements:2,contents:[]}},'9788937448805'));
assert.ok(sourceSearchUrl('millie',null,'책 & 제목').endsWith(encodeURIComponent('책 & 제목')));
for (const [id,key] of [['suwon','searchWord'],['gyeonggi','search_text'],['yongin','searchKeyword5'],['sejong','kwd'],['gyeonggi-cyber','isbn']]) {
  assert.equal(new URL(sourceSearchUrl(id,'9791190314466','서울의 어느 집')).searchParams.get(key),'9791190314466','Open this edition in the library search');
  const titleKey=id==='gyeonggi-cyber' ? 'keyword' : key;
  assert.equal(new URL(sourceSearchUrl(id,null,'책 & 제목')).searchParams.get(titleKey),'책 & 제목','Encode title fallback without splitting query parameters');
}
assert.equal(new URL(sourceSearchUrl('yongin','9791190314466')).searchParams.get('searchKey5'),'ISBN');
assert.equal(new URL(sourceSearchUrl('yongin',null,'책 제목')).searchParams.get('searchKey5'),'TITLE');
assert.deepEqual(new URL(sourceSearchUrl('yongin','9791190314466')).searchParams.getAll('searchLibraryArr'),YONGIN_LIBRARIES.map(library=>library.code));

const originalFetch = globalThis.fetch;
let seen = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input); seen.push(url);
  assert.ok(options.signal);
  assert.equal(options.redirect, 'error');
  if (url.pathname.endsWith('/wishes')) return Response.json({...wish, result:{...wish.result,next_uri: wish.result.next_uri.replace('WwRqoyDgkV5lz',url.pathname.split('/')[3]),result:Array.from({length:20},(_,i)=>({content:{...wish.result.result[0].content,code:'b'+String(i).padStart(6,'0')}}))}});
  if (url.hostname === 'pedia.watcha.com') return new Response(html);
  if (url.hostname === 'mob.suwonlib.go.kr') { assert.equal(options.body.get('book_form_code'), 'BK'); return Response.json({ libList: [], bookList: copies }); }
  if (url.hostname === 'www.library.kr') return Response.json({ RESULT:'SUCCESS', RESULT_BOOK_LIST:{ TOTAL_COUNT:1, BOOK_LIST:[copies[1]] } });
  if (url.hostname === 'lib.yongin.go.kr') { assert.equal(url.searchParams.get('searchKey5'), 'ISBN'); assert.equal(url.searchParams.getAll('searchLibraryArr').length, 21); return new Response(resultHtml); }
  if (url.hostname === 'sejong.nl.go.kr') return url.pathname.startsWith('/openapi/') ? Response.json({result:{total:1,fdata:{storageVo:[{key_id:'SH1_KMO202609800',manage_code:'SJ',isbn:'9788937448805'}]}}}) : new Response(sejongHtml);
  if (url.hostname === 'ebook.library.kr') return Response.json(cyberData);
  throw new Error('Unexpected source');
};
try {
  assert.equal((await fetchWishPage(1)).total, 21);
  assert.equal((await fetchWishPage(1,'6ewxa7ae1WvQ1')).profile.name, '도선생');
  assert.match(seen.at(-1).pathname, /\/users\/6ewxa7ae1WvQ1\//);
  assert.equal((await fetchWishPage(1,'36lvX8ERWLvXd')).profile.name, '현석 김');
  assert.match(seen.at(-1).pathname, /\/users\/36lvX8ERWLvXd\//);
  await assert.rejects(fetchWishPage(1,'unregistered'));
  assert.equal((await fetchBook('boTEST1')).isbn, '9788937448805');
  const availability = await lookupAvailability('9788937448805');
  assert.deepEqual(availability.map(r=>r.status), ['unavailable','available','available','unknown','unavailable','available']);
  assert.ok(availability.every(r=>r.checkedAt && r.sourceUrl));
  globalThis.fetch = async input => String(input).includes('www.library.kr') ? Response.json({RESULT:'SUCCESS',RESULT_BOOK_LIST:{TOTAL_COUNT:2,BOOK_LIST:[copies[1]]}}) : new Response(resultHtml);
  assert.equal((await lookupAvailability('9788937448805'))[0].status,'error','Repeated catalog pages must not falsely complete');
  globalThis.fetch = async input => String(input).includes('lib.yongin.go.kr') ? new Response(resultHtml.replace(/총<strong[^>]*>2/, '총<strong>3')) : new Response('failure',{status:503});
  assert.equal((await lookupAvailability('9788937448805'))[2].status,'error','Repeated Yongin pages must not falsely complete');
  globalThis.fetch = async () => new Response('maintenance', {status:503});
  assert.ok((await lookupAvailability('9788937448805')).every(r=>r.status === (r.id === 'millie' ? 'unknown' : 'error')));
  globalThis.fetch = async () => new Response('x'.repeat(2_100_000));
  await assert.rejects(sourceText('https://pedia.watcha.com/ko/contents/boTEST1'));
  for (const [status,errorCode] of [[401,'access_denied'],[403,'access_denied'],[429,'rate_limited'],[503,'service_unavailable'],[404,'http_error']]) {
    globalThis.fetch = async () => new Response('blocked',{status,headers:{'Retry-After':'120'}});
    const [result] = await lookupAvailability('9788937448805',['suwon']);
    assert.equal(result.status,'error'); assert.equal(result.errorCode,errorCode); assert.equal(result.httpStatus,status);
    assert.match(result.message,new RegExp(`HTTP ${status}`));
    assert.equal(selectedAvailability({result:{isbn:'9788937448805',libraries:[result]}},['suwon:141025']),'unknown','A blocked source never becomes unavailable/not-held');
    if (status === 429) assert.equal(result.retryAfter,120);
  }
  for (const [failure,errorCode] of [[new DOMException('Timed out','TimeoutError'),'timeout'],[new TypeError('Failed to fetch'),'connection_error']]) {
    globalThis.fetch = async () => {throw failure;};
    const [result] = await lookupAvailability('9788937448805',['suwon']);
    assert.equal(result.status,'error'); assert.equal(result.errorCode,errorCode); assert.equal(result.httpStatus,undefined);
  }
  globalThis.fetch = async () => new Response('<html>CAPTCHA / login required</html>');
  assert.equal((await lookupAvailability('9788937448805',['suwon']))[0].errorCode,'invalid_response','HTTP 200 with a challenge page is still a lookup failure');
  globalThis.fetch = async () => Response.json({unexpected:'schema'});
  assert.equal((await lookupAvailability('9788937448805',['suwon']))[0].errorCode,'invalid_response');
  globalThis.fetch = async () => Response.json({libList:[],bookList:[]});
  assert.equal((await lookupAvailability('9788937448805',['suwon']))[0].status,'not_held','Only a valid empty catalogue response means no holdings');
} finally { globalThis.fetch = originalFetch; }
console.log('Watcha library: ISBN, pagination, linked ISBN, copy states, source schema failures and bounded reads passed.');

const { exportJWK, generateKeyPair, SignJWT } = await import('jose');
const { MEMBER_PROFILE_SHEET_URL } = await import('../js/member-data.js');
const { publicKey, privateKey } = await generateKeyPair('RS256');
const key = { ...await exportJWK(publicKey), kid:'watcha-test', alg:'RS256', use:'sig' };
const token = email => new SignJWT({ email, email_verified:true, auth_time:Math.floor(Date.now()/1000), firebase:{sign_in_provider:'google.com'} }).setProtectedHeader({alg:'RS256',kid:key.kid}).setSubject('test').setAudience('yadoran-2025').setIssuer('https://securetoken.google.com/yadoran-2025').setIssuedAt().setExpirationTime('5m').sign(privateKey);
let sourceCalls = 0;
globalThis.fetch = async input => {
  const url = new URL(input);
  if (url.hostname === 'www.googleapis.com') return Response.json({keys:[key]});
  const sheet = new URL(url); sheet.searchParams.delete('_');
  if (sheet.href === MEMBER_PROFILE_SHEET_URL) return new Response('id,admin\nDo,admin@example.com\n');
  sourceCalls++;
  if (url.pathname === '/ko/contents/boTEST1') return new Response(html+metadataHtml);
  return Response.json({...wish, result:{...wish.result,next_uri: wish.result.next_uri.replace('WwRqoyDgkV5lz',url.pathname.split('/')[3]),result:Array.from({length:20},(_,i)=>({content:{...wish.result.result[0].content,code:'b'+String(i).padStart(6,'0')}}))}});
};
try {
  const {default:handler}=await import('../api/watcha-library.js');
  async function request(query, bearer, method='GET') {
    const headers=new Map(),res={ setHeader(k,v){headers.set(k,v);},end(body){this.body=JSON.parse(body);} };
    await handler({method,url:'/api/watcha-library?'+query,headers:bearer?{authorization:'Bearer '+bearer}:{}},res);
    assert.equal(headers.get('Cache-Control'),'no-store');
    return res;
  }
  assert.equal((await request('action=wishes')).statusCode,401);
  assert.equal((await request('action=collection&kind=ratings')).statusCode,401);
  assert.equal((await request('action=sync-history')).statusCode,401);
  assert.equal((await request('action=sync-history',undefined,'POST')).statusCode,401);
  assert.equal((await request('action=info&id=boTEST1')).statusCode,401);
  assert.equal((await request('action=wishes','forged')).statusCode,401);
  assert.equal((await request('action=wishes',await token('other@example.com'))).statusCode,403);
  assert.equal(sourceCalls,0);
  const valid=await token('admin@example.com');
  for(const q of ['action=collection&kind=unknown','action=collection&kind=ratings&kind=wishes','action=wishes&kind=ratings','action=wishes&page=0','action=wishes&page=1e2','action=book&id=../../private','action=availability&isbn=9788937448806','action=wishes&page=1&page=2','action=wishes&url=https://evil.example','action=nope','action=constructor','action=__proto__','action=wishes&profile=unregistered','action=book&id=boTEST1&sources=unknown','action=info&id=boTEST1&sources=suwon','action=availability&isbn=9788937448805&sources=unknown','action=availability&isbn=9788937448805&sources=sejong,sejong','action=availability&isbn=9788937448805&sources=','action=wishes&profile=constructor','action=wishes&profile=6ewxa7ae1WvQ1&profile=WwRqoyDgkV5lz']) assert.equal((await request(q,valid)).statusCode,400,q);
  assert.equal(sourceCalls,0);
  assert.equal((await request('action=sync-history&at=2026',valid,'POST')).statusCode,400,'Clients cannot supply their own execution timestamp');
  assert.equal((await request('action=sync-history&action=sync-history',valid)).statusCode,400);
  assert.equal((await request('action=sync-history',valid,'DELETE')).statusCode,405);
  assert.equal((await request('action=sync-history',valid)).statusCode,503);
  assert.equal((await request('action=sync-history',valid,'POST')).statusCode,503);
  assert.equal((await request('action=wishes&page=1',valid)).body.total,21);
  assert.equal(sourceCalls,1);
  assert.equal((await request('action=wishes&profile=6ewxa7ae1WvQ1',valid)).body.profile.name,'도선생');
  assert.equal((await request('action=wishes&profile=36lvX8ERWLvXd',valid)).body.profile.name,'현석 김');
  assert.equal((await request('action=wishes&profile=djaxbZM08xLw8',valid)).body.profile.name,'김민석');
  const beforeInfo=sourceCalls;
  assert.deepEqual((await request('action=info&id=boTEST1',valid)).body.info.authors,sampleInfo.authors);
  assert.equal(sourceCalls-beforeInfo,1,'Book information must fetch only the book page, without library lookups');
  assert.equal((await request('action=info&id=../secret',valid)).statusCode,400);
  assert.equal((await request('action=info&id=boTEST1&url=https://evil.example',valid)).statusCode,400);
  assert.equal((await request('action=wishes',valid,'POST')).statusCode,405);
  const savedNodeEnv=process.env.NODE_ENV, savedPreview=process.env.BOOONG_WATCHA_PREVIEW;
  async function previewRequest(host, query='action=wishes&page=1&preview=1') {
    const res={setHeader(){},end(body){this.body=JSON.parse(body)}};
    await handler({method:'GET',url:'/api/watcha-library?'+query,headers:{host}},res);
    return res;
  }
  try {
    process.env.NODE_ENV='development';delete process.env.BOOONG_WATCHA_PREVIEW;
    assert.equal((await previewRequest('127.0.0.1:8765')).statusCode,401);
    process.env.BOOONG_WATCHA_PREVIEW='1';process.env.NODE_ENV='production';
    assert.equal((await previewRequest('127.0.0.1:8765')).statusCode,401,'Production must never allow preview');
    process.env.NODE_ENV='development';
    assert.equal((await previewRequest('booong.vercel.app')).statusCode,401);
    assert.equal((await previewRequest('127.0.0.1:8765','action=wishes')).statusCode,401);
    assert.equal((await previewRequest('127.0.0.1:8765')).statusCode,200,'Local explicit preview must not require Google login');
    assert.equal((await previewRequest('localhost:8765')).statusCode,200);
  } finally {
    if(savedNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=savedNodeEnv;
    if(savedPreview===undefined)delete process.env.BOOONG_WATCHA_PREVIEW;else process.env.BOOONG_WATCHA_PREVIEW=savedPreview;
  }
} finally { globalThis.fetch=originalFetch; }
console.log('Watcha API: trusted admin, fixed sources, validation, unauthenticated denial and no-store passed.');

// Run the real page controller against a tiny DOM stub to exercise asynchronous account changes.
const controllerSource=await readFile(new URL('../js/watcha-library.js',import.meta.url),'utf8');
const rendererSource=controllerSource.match(/const renderedCards = new WeakMap\(\);[\s\S]*?(?=\nfunction bookInfoMarkup)/)[0];
// The existing controller stub has no DOM tree; exercise the real keyed renderer below.
const uiSource=controllerSource.replace(rendererSource, `function renderBookCards(filtered, emptyMessage) { root.querySelector('[data-books]').innerHTML = filtered.map(book=>bookMarkup(book)).join('') || '<p class="analytics__empty">' + emptyMessage + '</p>'; }\n`).replace(/^import .*;\n/gm,'').replace(/if \(root\) \{[\s\S]*$/, '')+'\nreturn {init,checkBook:(book,isbn)=>checkBook(book,epoch,isbn),getBooks:()=>books,getBusy:()=>busy,getSelected:()=>selectedLibraries,bookMarkup,renderBooks,setLibraries:ids=>{selectedLibraries=ids;renderBooks()},selectProfile:id=>{selectedProfiles=[id];return init()},selectProfiles:ids=>{selectedProfiles=ids;return init()},getCombined:combinedBooks,getKind:()=>collectionKind,setKind:kind=>{collectionKind=kind;return init()},retryBook,bookInfoMarkup,fillBookSources:id=>fillBookSources(id,epoch),fillSelectedSource:()=>fillSelectedSource(epoch),libraryPickerMarkup,toggleFavorite,toggleCart,cartItemsMarkup,cartLibraryPickerMarkup,fillCartLibrary:(id,refresh=false)=>fillCartLibrary(id,epoch,refresh),getCart:()=>[...cart.values()],getFavorites:()=>favoriteLibraries,refresh:()=>init(true),retryAll:()=>operation(run=>batch(books,run))};';
const controls=new Map();
function element(){return {innerHTML:'',textContent:'',value:'',checked:false,hidden:false,disabled:false,listeners:{},setAttribute(name,value){this[name]=value},focus(){},addEventListener(type, listener){this.listeners[type]=listener},querySelectorAll(){return []},replaceChildren(child){this.innerHTML=child.innerHTML},querySelector(selector){if(!controls.has(selector)) controls.set(selector,element());return controls.get(selector)}};}
const uiRoot=element();uiRoot.innerHTML='OLD ACCOUNT BOOK';
const chooseLibrary=id=>controls.get('[data-libraries]').listeners.click({target:{closest:selector=>selector==='[data-library]' ? {dataset:{library:id}} : null}});
const gates=[];let uiQueries=[],failBook=true;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const page=await new AsyncFunction('setTimeout','document','adminFetch','requireAdmin','adminAccountId','onAdminAccountChange','esc','normalizeIsbn','location','WATCHA_PROFILES','readCache','writeCache','selectedAvailability','localStorage','SUWON_LIBRARIES','selectedLibraryResults','YONGIN_LIBRARIES','EXTRA_SOURCES','sourceSearchUrl','cachedSnapshot','freshLoanSource','writeLoanCache',uiSource)(
  (callback, delay) => { if (delay < 60000) queueMicrotask(callback); return 0; },
  {querySelector:()=>uiRoot,createElement:()=>element()},
  async url=>{const q=new URL(url,'http://localhost').searchParams;if(q.get('action')==='sync-history')return Response.json({lastFullSyncAt:null});uiQueries.push(q);if(q.get('action')==='wishes')return Response.json({profile:{name:'test',url:'https://pedia.watcha.com'},total:0,nextPage:null,books:[],checkedAt:new Date().toISOString()}); if(failBook){failBook=false;return Response.json({message:'network failed'},{status:502})}return Response.json({isbn:'9788937448805',libraries:[]});},
  container=>new Promise(resolve=>gates.push(value=>{if(!value)container.innerHTML='STALE DENIAL';resolve(value)})),
  ()=>null,()=>{},String,normalizeIsbn,{hostname:'booong.example'},WATCHA_PROFILES,async()=>null,async()=>true,selectedAvailability,{getItem:()=>null,setItem(){}},SUWON_LIBRARIES,selectedLibraryResults,YONGIN_LIBRARIES,EXTRA_SOURCES,sourceSearchUrl,cachedSnapshot,freshLoanSource,async()=>true);
const older=page.init();
assert.doesNotMatch(uiRoot.innerHTML,/OLD ACCOUNT BOOK/,'Changing account must immediately remove prior results');
const newer=page.init();gates[1](true);await newer;
gates[0](false);await older;
assert.match(uiRoot.innerHTML,/watcha-hero/,'A stale authorization denial must not overwrite a newer session');
const corrected={id:'boTEST1',title:'book',manual:true,result:{isbn:'9788937448805'}};
await page.checkBook(corrected,'9788937448805');
assert.equal(corrected.error,'network failed');
await page.checkBook(corrected);
assert.equal(uiQueries.at(-1).get('action'),'availability','A failed request must retain the manually corrected ISBN');
assert.equal(uiQueries.at(-1).get('isbn'),'9788937448805');
console.log('Watcha UI: immediate account clearing, stale denial isolation and manual ISBN retry passed.');

// Full collection, per-profile cache, manual refresh and interrupted background work.
const cartPreferences=new Map();
const cache=new Map(), savedLoans=new Map(), bulkQueries=[], cacheReads=[];
const fixtureIsbn = id => {
  const prefix = '978' + String([...id].reduce((value,char)=>(value*31+char.charCodeAt(0)) % 1_000_000_000,0)).padStart(9,'0');
  return prefix + ((10 - [...prefix].reduce((sum,char,index)=>sum+Number(char)*(index%2?3:1),0)%10)%10);
};
let holdWishlist=false, releaseWishlist, failSecondPage=false, limitInfo=false, holdAvailability=0, heldSource='gyeonggi', blockedLoans=0, loanFixtureStatus='available', failAvailability=false, failureStatus=502, failureReason, failureAction='availability', failureRetryAfter=120, failureRetryHeader;
const releaseAvailability=[];
const bulk=await new AsyncFunction('setTimeout','document','adminFetch','requireAdmin','adminAccountId','onAdminAccountChange','esc','normalizeIsbn','location','WATCHA_PROFILES','readCache','writeCache','selectedAvailability','localStorage','SUWON_LIBRARIES','selectedLibraryResults','YONGIN_LIBRARIES','EXTRA_SOURCES','sourceSearchUrl','cachedSnapshot','freshLoanSource','writeLoanCache',uiSource)(
  (callback, delay) => { if (delay < 60000) queueMicrotask(callback); return 0; },
  {querySelector:()=>uiRoot,createElement:()=>element()},
  async url=>{
    const q=new URL(url,'http://localhost').searchParams;if(q.get('action')==='sync-history')return Response.json({lastFullSyncAt:null});bulkQueries.push(q);
    if (q.get('action')==='availability' && q.get('sources')===heldSource && holdAvailability > 0) { holdAvailability--; await new Promise(resolve=>releaseAvailability.push(resolve)); }
    if (failAvailability && q.get('action')===failureAction) return Response.json(failureReason ? {reason:failureReason} : {message:'live request failed',...(failureStatus===429 ? {retryAfter:failureRetryAfter} : {})},{status:failureStatus,headers:failureRetryHeader ? {'Retry-After':failureRetryHeader} : undefined});
    if (blockedLoans && ['availability','book'].includes(q.get('action'))) return Response.json({isbn:'9788937448805',libraries:[{
      id:q.get('sources'),name:'조회 기관',status:'error',copies:[],sourceUrl:'https://mob.suwonlib.go.kr/search',
      errorCode:blockedLoans===429 ? 'rate_limited' : 'access_denied',httpStatus:blockedLoans,
      message:`도서관 조회 실패 (HTTP ${blockedLoans})`,checkedAt:new Date().toISOString(),
    }]});
    if (q.get('action')==='info' && limitInfo) return Response.json({retryAfter:90,message:'limited'},{status:429});
    if(q.get('action')==='wishes'){
      const profile=WATCHA_PROFILES.find(p=>p.id===q.get('profile'));
      const second=Number(q.get('page'))===2;
      if (holdWishlist && !second) { holdWishlist=false;await new Promise(resolve=>releaseWishlist=resolve); }
      if (failSecondPage && second) return Response.json({message:'page failed'},{status:502});
      return Response.json({profile,total:21,nextPage:second?null:2,checkedAt:new Date().toISOString(),books:Array.from({length:second?1:20},(_,i)=>({id:'b'+String(i+(second?20:0)).padStart(6,'0'),title:'book '+i,coverUrl,url:'https://pedia.watcha.com/ko/contents/bTEST'}))});
    }
    const isbn=q.get('isbn') || fixtureIsbn(q.get('id'));
    return Response.json({isbn,libraries:q.has('sources') ? q.get('sources').split(',').map(id=>({id,name:'조회 기관',status:loanFixtureStatus,copies:id==='suwon' ? [{branch:'선경',branchCode:'141025',status:loanFixtureStatus,label:loanFixtureStatus==='available'?'대출 가능':'대출중'}] : [],sourceUrl:EXTRA_SOURCES.some(source=>source.id===id) ? sourceSearchUrl(id,isbn) : 'https://mob.suwonlib.go.kr/search',checkedAt:new Date().toISOString()})) : [], ...(['book','info'].includes(q.get('action')) ? {info:{...sampleInfo,isbn}} : {})});
  },async()=>true,()=>null,()=>{},String,normalizeIsbn,{hostname:'booong.example'},WATCHA_PROFILES,async (id,options)=>{cacheReads.push({id,...options});return cachedSnapshot(cache.get(options.kind==='ratings' ? 'ratings:'+id : id))},async(id,value)=>{cache.set(value.kind==='ratings' ? 'ratings:'+id : id,structuredClone(cachedSnapshot(value)));return true},selectedAvailability,{getItem:key=>cartPreferences.get(key) || (key.endsWith('regions')?JSON.stringify(['suwon']):null),setItem:(key,value)=>cartPreferences.set(key,value)},SUWON_LIBRARIES,selectedLibraryResults,YONGIN_LIBRARIES,EXTRA_SOURCES,sourceSearchUrl,cachedSnapshot,freshLoanSource,async result=>{if(result?.isbn)savedLoans.set(result.isbn,structuredClone(result));return true;});
await bulk.init();
assert.deepEqual(bulk.getSelected(),[SUWON_LIBRARIES[0].id],'Use one specific library after migrating the old whole-city choice');
assert.equal(bulk.getBooks().length,21,'Automatically load every wishlist page');
assert.equal(bulkQueries.filter(q=>q.get('action')==='book').length,21,'Check every loaded book');
assert.equal(cache.get(WATCHA_PROFILES[0].id).books.length,21,'Persist the full list and ISBNs');
assert.ok(bulkQueries.filter(query=>query.get('action')==='book').every(query=>query.get('sources')==='suwon'),'Initial book lookup must target only the selected city');
assert.doesNotMatch(uiRoot.innerHTML,/다음 20권/);
const beforeBranchSwitch=bulkQueries.length;
const checkedTimes=bulk.getBooks().map(book=>book.result.libraries[0].checkedAt);
chooseLibrary('suwon:141092');
await bulk.fillSelectedSource();
assert.equal(bulkQueries.length,beforeBranchSwitch,'Changing Suwon branches reuses the current city results without API calls');
assert.equal(selectedAvailability(bulk.getBooks()[0],['suwon:141092']),'unavailable','Filter the reused copies for the newly selected branch');
assert.deepEqual(bulk.getBooks().map(book=>book.result.libraries[0].checkedAt),checkedTimes,'Reusing city results preserves their actual check times');
chooseLibrary('suwon:141025');
assert.equal(selectedAvailability(bulk.getBooks()[0],bulk.getSelected()),'available');
assert.equal(bulkQueries.length,beforeBranchSwitch,'Returning to the original branch also reuses the same results');
const cachedCalls=bulkQueries.length;await bulk.init();
assert.equal(bulkQueries.length-cachedCalls,0,'A return visit reuses fresh loan results without requests');
assert.ok(bulkQueries.slice(cachedCalls).every(query=>query.get('action')==='availability'));
await bulk.selectProfile(WATCHA_PROFILES[1].id);
assert.equal(bulkQueries.filter(q=>q.get('action')==='wishes').at(-1).get('profile'),WATCHA_PROFILES[1].id);
assert.equal(cache.size,2,'Keep the two profiles separate');
const refreshCalls=bulkQueries.length;await bulk.refresh();
assert.equal(bulkQueries.length-refreshCalls,2,'List sync fetches wishlist pages without refreshing loan states');
assert.ok(bulkQueries.slice(refreshCalls).every(query=>query.get('action')==='wishes'));
assert.ok(bulk.getBooks().every(book=>book.result),'List sync retains previous loan results');
console.log('Watcha UI: full automatic collection, two-account cache and manual refresh passed.');

// Corrections survive refresh cancellation even when the next list has not arrived.
bulk.getBooks()[20].manualIsbn='9788937448805';
cache.set(WATCHA_PROFILES[1].id,{...cache.get(WATCHA_PROFILES[1].id),books:structuredClone(bulk.getBooks())});
const beforeCancelledSync=bulkQueries.length;
holdWishlist=true;const interrupted=bulk.refresh();
while(!releaseWishlist)await new Promise(resolve=>setImmediate(resolve));
await bulk.refresh();releaseWishlist();await interrupted;
assert.equal(bulk.getBooks()[20].manualIsbn,'9788937448805','Repeated refresh must retain manual corrections');
assert.ok(bulkQueries.slice(beforeCancelledSync).every(query=>query.get('action')==='wishes'),'Repeated list sync never starts loan checks');
// A failed pagination + row retry must leave the previous complete snapshot usable.
failSecondPage=true;await bulk.refresh();
assert.equal(bulk.getBooks().length,20);
await bulk.checkBook(bulk.getBooks()[0]);
// Use the actual operation entry to exercise its final persistence.
await bulk.retryAll();
assert.equal(cache.get(WATCHA_PROFILES[1].id).books.length,21,'Never overwrite a complete cache with a partial collection');
failSecondPage=false;const retainedCalls=bulkQueries.length;await bulk.init();
assert.equal(bulk.getBooks().length,21);
assert.equal(bulkQueries.length-retainedCalls,1,'Only the corrected edition missing a saved result is checked');
console.log('Watcha UI: cancelled refresh corrections and partial-list cache protection passed.');

// Existing saved results gain cover metadata without repeating completed library lookups.
const oldCache=structuredClone(cache.get(WATCHA_PROFILES[1].id));
for (const book of oldCache.books) delete book.coverUrl;
cache.set(WATCHA_PROFILES[1].id,oldCache);
const beforeCovers=bulkQueries.length;await bulk.init();
assert.equal(bulkQueries.length-beforeCovers,2,'Backfill covers without repeating fresh loan checks');
assert.equal(bulk.getBooks()[0].coverUrl,coverUrl);
assert.equal(bulk.getBooks()[20].manualIsbn,'9788937448805');
assert.ok(bulk.getBooks().every(book=>book.result),'Keep saved library results during cover backfill');
assert.match(bulk.bookMarkup(bulk.getBooks()[0]),/<img[^>]+loading="lazy"/);
assert.match(bulk.bookMarkup(bulk.getBooks()[0]),/referrerpolicy="no-referrer"/);
assert.match(bulk.bookMarkup({...bulk.getBooks()[0],coverUrl:null}),/표지 없음/);
assert.doesNotMatch(bulk.bookMarkup({...bulk.getBooks()[0],coverUrl:null}),/<img/);
console.log('Watcha covers: source validation, lazy images, missing covers and cache backfill passed.');

const metadataCache=structuredClone(cache.get(WATCHA_PROFILES[1].id));
for (const book of metadataCache.books) { delete book.info; if (book.result) delete book.result.info; }
cache.set(WATCHA_PROFILES[1].id,metadataCache);
const beforeMetadata=bulkQueries.length;
await bulk.init();
assert.equal(bulkQueries.length-beforeMetadata,21,'Backfill book information without repeating fresh loan checks');
assert.equal(bulkQueries.slice(beforeMetadata).filter(query=>query.get('action')==='info').length,21);
assert.ok(bulk.getBooks().every(book=>book.info.authors[0]===sampleInfo.authors[0]));
assert.ok(bulk.getBooks().every(book=>book.result),'Keep loan results while adding author metadata');
assert.equal(bulk.getBooks()[20].manualIsbn,'9788937448805','Keep manual corrections through metadata backfill');
assert.match(bulk.bookMarkup(bulk.getBooks()[0]),/data-open-book=/);
assert.match(bulk.bookMarkup(bulk.getBooks()[0]),/첫 저자 · 둘째 저자/);
assert.doesNotMatch(bulk.bookMarkup(bulk.getBooks()[0]),/<details/,'Loan details belong in the book dialog');
assert.match(bulk.bookInfoMarkup(bulk.getBooks()[0]),/책 소개/);
assert.ok(bulk.bookInfoMarkup(bulk.getBooks()[0]).indexOf('책 소개') < bulk.bookInfoMarkup(bulk.getBooks()[0]).indexOf('data-info-loans'),'Present book information before optional loan details');
assert.match(bulk.bookInfoMarkup(bulk.getBooks()[0]),/<details class="watcha-info__loans"><summary>/,'Keep loan details collapsed when the book opens');
assert.match(bulk.bookInfoMarkup(bulk.getBooks()[0]),/data-info-loans/,'The book dialog includes loan details and retry controls');
const afterMetadata=bulkQueries.length;await bulk.init();
assert.equal(bulkQueries.length-afterMetadata,0,'Reuse fresh loans and saved authors on return');
console.log('Watcha book information: authors, metadata-only cache backfill, preserved loans, title trigger and combined book/loan dialog passed.');

const limitedCache=structuredClone(cache.get(WATCHA_PROFILES[1].id));
for (const book of limitedCache.books) { delete book.info; if (book.result) delete book.result.info; }
cache.set(WATCHA_PROFILES[1].id,limitedCache);limitInfo=true;
const beforeLimit=bulkQueries.length;await bulk.init();
assert.equal(bulkQueries.slice(beforeLimit).filter(query=>query.get('action')==='info').length,1,'Pause metadata immediately on a rate limit');
assert.match(controls.get('[data-info-status]').textContent,/제한/);
assert.ok(bulk.getBooks().every(book=>book.result),'Rate limiting book metadata must not erase saved loan results');
limitInfo=false;await bulk.init();
assert.ok(bulk.getBooks().every(book=>book.info),'Resume missing metadata without losing the list');

// Checkbox changes recolor cached results without fetching or automatically hiding books.
const beforeSelection=bulkQueries.length;
bulk.setLibraries(['suwon']);
assert.match(bulk.bookMarkup({...bulk.getBooks()[0],...selectionBook}),/data-state="available"/);
bulk.setLibraries(['gyeonggi']);
assert.match(bulk.bookMarkup({...bulk.getBooks()[0],...selectionBook}),/data-state="unavailable"/);
bulk.setLibraries([]);
assert.match(bulk.bookMarkup({...bulk.getBooks()[0],...selectionBook}),/data-state="unselected"/);
assert.equal(bulkQueries.length,beforeSelection,'Region selection must only change the display');
assert.match(uiRoot.innerHTML,/<fieldset[^>]+data-libraries/);
assert.doesNotMatch(uiRoot.innerHTML,/<select data-library>/);
assert.match(bulk.bookInfoMarkup({...bulk.getBooks()[0],...selectionBook}),/data-check=/);
assert.doesNotMatch(bulk.bookMarkup({...bulk.getBooks()[0],...selectionBook}),/<details[^>]* open/,'Start with compact collapsed details');
console.log('Watcha UI: selected library colors, uncertainty, empty selection and compact details passed.');

const branchBook={result:{isbn:'9788937448805',libraries:[{id:'suwon',name:'수원시 도서관',status:'available',copies:[{branch:'북수원',status:'available',label:'대출 가능'},{branch:'광교홍재',status:'unavailable',label:'대출중'}],sourceUrl:'https://mob.suwonlib.go.kr/search',checkedAt:new Date().toISOString()}]}};
assert.equal(selectedAvailability(branchBook,['suwon:141092']),'available');
assert.equal(selectedAvailability(branchBook,['suwon:141551']),'unavailable','Other available Suwon branches do not make a checked loaned branch green');
assert.equal(selectedAvailability(branchBook,['suwon:141025']),'unavailable','A complete response without copies means not held at that branch');
assert.equal(selectedLibraryResults(branchBook,['suwon:141092'])[0].name,'북수원도서관');
assert.equal(selectedLibraryResults(branchBook,['suwon:141092'])[0].copies.length,1);
assert.equal(selectedAvailability({result:{isbn:'9788937448805',libraries:[{id:'suwon',status:'error',copies:[]}]}},['suwon:141092']),'unknown');
assert.equal(selectedAvailability({result:{isbn:'9788937448805',libraries:[{id:'suwon',status:'unknown',copies:[]}]}},['suwon:141092']),'unknown');
assert.equal(SUWON_LIBRARIES.length,24);
bulk.setLibraries(['suwon:141092']);
assert.match(bulk.bookInfoMarkup({...bulk.getBooks()[0],...branchBook}),/북수원도서관/);
assert.doesNotMatch(bulk.bookMarkup({...bulk.getBooks()[0],...branchBook}).split('<details')[0],/수원시 도서관/,'The compact card must name the actual available branch');
assert.match(uiRoot.innerHTML,/data-library="suwon:141025"/);
assert.match(uiRoot.innerHTML,/class="watcha-books"/);
console.log('Watcha Suwon: individual branch selection, legacy copy names, failed sources and compact grid passed.');
const namedCopy={...branchBook,result:{...branchBook.result,libraries:[{...branchBook.result.libraries[0],copies:[{branch:'changed name',branchCode:'141092',status:'available',label:'대출 가능'}]}]}};
assert.equal(selectedAvailability(namedCopy,['suwon:141092']),'available','Use stable branch code before display name');
const whitespaceCopy={...branchBook,result:{...branchBook.result,libraries:[{...branchBook.result.libraries[0],copies:[{branch:' 북수원도서관 ',status:'available',label:'대출 가능'}]}]}};
assert.equal(selectedAvailability(whitespaceCopy,['suwon:141092']),'available','Trim legacy branch names before suffix matching');
const unmatched={...branchBook,result:{...branchBook.result,libraries:[{...branchBook.result.libraries[0],copies:[...branchBook.result.libraries[0].copies,{branch:'추가 도서관',status:'available',label:'대출 가능'}]}]}};
assert.match(bulk.bookInfoMarkup({...bulk.getBooks()[0],...unmatched}),/추가 도서관/,'Do not drop copies outside the fixed picker catalogue');

// Both accounts combine their lists, deduplicate common content, and filter by one branch.
const loanable = {...branchBook.result, libraries:[{...branchBook.result.libraries[0], copies:[{branch:'선경',branchCode:'141025',status:'available',label:'대출 가능'}]}]};
const common = {info:sampleInfo,id:'bCOMMON',title:'common',coverUrl:null,url:'https://pedia.watcha.com/ko/contents/bCOMMON',result:loanable};
const left = {...common,id:'bLEFT00',title:'left',result:branchBook.result};
const right = {...common,id:'bRIGHT0',title:'right'};
cache.set(WATCHA_PROFILES[0].id,{version:1,total:2,books:[common,left]});
cache.set(WATCHA_PROFILES[1].id,{version:1,total:2,books:[structuredClone(common),right]});
controls.get('[data-available]').checked=true;
bulk.setLibraries(['suwon:141025']);
const beforeCombined=bulkQueries.length;
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
assert.equal(bulkQueries.length-beforeCombined,0,'Different content IDs with the same ISBN reuse a fresh response');
assert.equal(bulk.getCombined().length,3,'Common Watcha content appears once');
assert.deepEqual(bulk.getCombined().find(book=>book.id===common.id).profileIds,WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
assert.match(controls.get('[data-books]').innerHTML,/data-book="bCOMMON"/);
assert.match(controls.get('[data-books]').innerHTML,/data-book="bRIGHT0"/);
assert.doesNotMatch(controls.get('[data-books]').innerHTML,/data-book="bLEFT00"/,'Keep a fresh negative result until explicitly refreshed');
assert.match(controls.get('[data-books]').innerHTML,/야도란[\s\S]*도선생/,'Show both owners on a shared book');
assert.match(uiRoot.innerHTML,/data-profile-id="WwRqoyDgkV5lz" aria-pressed="true"/);
assert.match(uiRoot.innerHTML,/data-profile-id="6ewxa7ae1WvQ1" aria-pressed="true"/);
cache.set(WATCHA_PROFILES[2].id,{version:1,total:2,books:[structuredClone(common),{...common,id:'bTHIRD0',title:'third'}]});
const beforeThird=bulkQueries.length;
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,3).map(profile=>profile.id));
assert.equal(bulkQueries.length-beforeThird,0,'Reuse the same ISBN across all three profiles');
assert.equal(bulk.getCombined().length,4,'Three profiles deduplicate common books and retain exclusive books');
assert.deepEqual(bulk.getCombined().find(book=>book.id===common.id).profileIds,WATCHA_PROFILES.slice(0,3).map(profile=>profile.id));
assert.match(uiRoot.innerHTML,/data-profile-id="36lvX8ERWLvXd" aria-pressed="true"/);
assert.match(controls.get('[data-books]').innerHTML,/현석 김/);
cache.set(WATCHA_PROFILES[3].id,{version:1,total:2,books:[structuredClone(common),{...common,id:'bFOURT0',title:'fourth'}]});
const beforeFourth=bulkQueries.length;
await bulk.selectProfiles(WATCHA_PROFILES.map(profile=>profile.id));
assert.equal(bulkQueries.length-beforeFourth,0,'Reuse the same ISBN across all four profiles');
assert.equal(bulk.getCombined().length,5);
assert.deepEqual(bulk.getCombined().find(book=>book.id===common.id).profileIds,WATCHA_PROFILES.map(profile=>profile.id));
assert.match(uiRoot.innerHTML,/data-profile-id="djaxbZM08xLw8" aria-pressed="true"/);
assert.match(controls.get('[data-books]').innerHTML,/김민석/);
await bulk.retryBook(common.id,'9788937448805');
assert.equal(cache.get(WATCHA_PROFILES[0].id).books[0].result.isbn,'9788937448805');
assert.equal(cache.get(WATCHA_PROFILES[1].id).books[0].manualIsbn,'9788937448805','A correction to common content survives in both profile caches');
await bulk.selectProfiles([WATCHA_PROFILES[1].id]);
assert.equal(bulk.getCombined().length,2,'Turning off a profile removes its exclusive books');
await bulk.selectProfiles([]);
assert.equal(bulk.getCombined().length,0);
assert.match(controls.get('[data-count]').textContent,/선택/);
console.log('Watcha combined UI: multi-profile union, duplicate ownership, branch availability, shared corrections and empty selection passed.');

// A loanable copy elsewhere in Yongin must not qualify the selected branch.
const yonginBook={result:{isbn:'9788937448805',libraries:[{id:'yongin',name:'용인시 도서관',status:'available',sourceUrl:'https://lib.yongin.go.kr/',checkedAt:new Date().toISOString(),copies:[
  {branch:'수지도서관',branchCode:'MB',status:'available',label:'대출 가능'},
  {branch:'상현도서관',branchCode:'MO',status:'unavailable',label:'대출중'},
  {branch:'중앙도서관',status:'available',label:'대출 가능'},
]}]}};
assert.equal(YONGIN_LIBRARIES.length,21);
assert.equal(new Set(YONGIN_LIBRARIES.map(library=>library.code)).size,21);
assert.equal(selectedAvailability(yonginBook,['yongin:MB']),'available');
assert.equal(selectedAvailability(yonginBook,['yongin:MO']),'unavailable');
assert.equal(selectedAvailability(yonginBook,['yongin:MN']),'unavailable');
assert.equal(selectedLibraryResults(yonginBook,['yongin:MN'])[0].status,'not_held');
assert.equal(selectedLibraryResults(yonginBook,['yongin:MA'])[0].copies.length,1,'Legacy central-library name maps to Yongin Central');
assert.equal(selectedLibraryResults(yonginBook,['yongin:MB'])[0].name,'수지도서관');
assert.equal(selectedLibraryResults(yonginBook,['suwon:141024'])[0].copies.length,0,'Do not confuse Suwon and Yongin Central');
for(const status of ['error','unknown']) assert.equal(selectedAvailability({result:{isbn:'9788937448805',libraries:[{id:'yongin',status,copies:[]}]}},['yongin:MB']),'unknown');
bulk.setLibraries(['yongin:MB']);
assert.match(bulk.bookInfoMarkup({...common,...yonginBook}),/수지도서관/);
assert.doesNotMatch(bulk.libraryPickerMarkup(),/data-library="yongin"/,'Only individual Yongin branches appear in the picker');
for(const library of YONGIN_LIBRARIES) assert.ok(bulk.libraryPickerMarkup().includes(`data-library="${library.id}"`));
console.log('Watcha Yongin: all 21 branches, isolated availability, legacy names and unknown states passed.');

// Favorites are independent of the selected branch and survive controller recreation.
const preferences=new Map();
let favoriteApiCalls=0;
const createFavoritePage=()=>new AsyncFunction('setTimeout','document','adminFetch','requireAdmin','adminAccountId','onAdminAccountChange','esc','normalizeIsbn','location','WATCHA_PROFILES','readCache','writeCache','selectedAvailability','localStorage','SUWON_LIBRARIES','selectedLibraryResults','YONGIN_LIBRARIES','EXTRA_SOURCES','sourceSearchUrl','cachedSnapshot','freshLoanSource','writeLoanCache',uiSource)(
  (callback, delay) => { if (delay < 60000) queueMicrotask(callback); return 0; },
  {querySelector:()=>uiRoot,createElement:()=>element()},async()=>{favoriteApiCalls++;throw new Error('Unexpected fetch')},async()=>true,()=>null,()=>{},String,normalizeIsbn,{hostname:'booong.example'},WATCHA_PROFILES,async()=>null,async()=>true,selectedAvailability,
  {getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)},SUWON_LIBRARIES,selectedLibraryResults,YONGIN_LIBRARIES,EXTRA_SOURCES,sourceSearchUrl,cachedSnapshot,freshLoanSource,async()=>true);
const favoritesPage=await createFavoritePage();
const shelfPicker=favoritesPage.cartLibraryPickerMarkup('sejong');
assert.doesNotMatch(shelfPicker,/<select|<option/,'The shelf exposes common library choices as buttons');
assert.match(shelfPicker,/data-cart-library="sejong" aria-pressed="true"/);
assert.match(shelfPicker,/data-cart-more aria-expanded="false" aria-controls="watcha-cart-more"/);
assert.match(shelfPicker,/id="watcha-cart-more"[^>]* hidden/,'Other branches start in a secondary grouped picker');
for (const library of [...SUWON_LIBRARIES,...YONGIN_LIBRARIES]) assert.ok(shelfPicker.includes(`data-cart-library="${library.id}"`),'Every branch remains reachable');
assert.equal(shelfPicker.split('class="watcha-cart-actions"')[0].replace(/aria-pressed="(true|false)"/g,''),favoritesPage.cartLibraryPickerMarkup('millie').split('class="watcha-cart-actions"')[0].replace(/aria-pressed="(true|false)"/g,''),'Shelf button order is independent of the selected common library');
const primaryIds=markup=>[...markup.matchAll(/data-library="([^"]+)"/g)].map(match=>match[1]);
const pickerRows=page=>page.libraryPickerMarkup().split('<details')[0];
assert.deepEqual(primaryIds(pickerRows(favoritesPage)),['gyeonggi','millie','sejong','gyeonggi-cyber'],'Without favorites, show only the four fixed defaults');
for (const id of ['sejong','millie','gyeonggi-cyber','gyeonggi']) {
  favoritesPage.setLibraries([id]);
  assert.deepEqual(primaryIds(pickerRows(favoritesPage)),['gyeonggi','millie','sejong','gyeonggi-cyber'],'Selecting a fixed library does not reorder the buttons');
}
favoritesPage.setLibraries(['suwon:141572']);
assert.deepEqual(primaryIds(pickerRows(favoritesPage)),['gyeonggi','millie','sejong','gyeonggi-cyber','suwon:141572'],'A selected branch stays visible after the fixed defaults without reordering them');
const beforeFavoriteSelection=[...favoritesPage.getSelected()];
favoritesPage.toggleFavorite('yongin:MB');
favoritesPage.toggleFavorite('suwon:141025');
favoritesPage.toggleFavorite('unknown');
assert.deepEqual(favoritesPage.getFavorites(),['yongin:MB','suwon:141025']);
assert.deepEqual(primaryIds(pickerRows(favoritesPage)),['suwon:141025','yongin:MB','gyeonggi','millie','sejong','gyeonggi-cyber','suwon:141572'],'Favorites precede the fixed defaults and selected extra branch');
assert.equal((pickerRows(favoritesPage).match(/class="watcha-library-group"/g)||[]).length,1,'Favorites and fixed defaults share one wrapping row');
assert.deepEqual(favoritesPage.getSelected(),beforeFavoriteSelection,'Starring a library does not change where to borrow');
assert.equal(favoriteApiCalls,0,'Favorite changes must not call external services');
favoritesPage.setLibraries(['yongin:MB']);
assert.deepEqual(primaryIds(pickerRows(favoritesPage)),['suwon:141025','yongin:MB','gyeonggi','millie','sejong','gyeonggi-cyber'],'A selected favorite stays in the shared row without duplication');
favoritesPage.toggleFavorite('sejong');
favoritesPage.setLibraries(['sejong']);
assert.deepEqual(primaryIds(pickerRows(favoritesPage)),['suwon:141025','yongin:MB','sejong','gyeonggi','millie','gyeonggi-cyber'],'A favorited default moves ahead of the other fixed defaults without duplication');
favoritesPage.toggleFavorite('sejong');
const restoredFavorites=await createFavoritePage();
assert.deepEqual(restoredFavorites.getFavorites(),['suwon:141025','yongin:MB']);
assert.match(restoredFavorites.libraryPickerMarkup(),/data-favorite="yongin:MB" aria-pressed="true"/);
restoredFavorites.toggleFavorite('yongin:MB');
assert.deepEqual((await createFavoritePage()).getFavorites(),['suwon:141025']);
preferences.set('booong:watcha-library:favorite-libraries','["invalid","yongin:MB","yongin:MB"]');
assert.deepEqual((await createFavoritePage()).getFavorites(),['yongin:MB'],'Ignore invalid and duplicate stored IDs');
preferences.set('booong:watcha-library:regions','["yongin"]');
assert.deepEqual((await createFavoritePage()).getSelected(),['yongin:MA'],'Migrate the old aggregate Yongin selection to an individual branch');
console.log('Watcha favorites: add/remove, browser persistence, validated IDs, no fetch and independent selection passed.');

// Enrich old cached books only for the selected new provider, preserving other results.
bulk.setLibraries(['gyeonggi']);
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
const beforeNewSource = bulkQueries.length;
for (const book of bulk.getBooks()) book.result.libraries = [{id:'gyeonggi',name:'경기도서관',status:'unavailable',copies:[],sourceUrl:'https://www.library.kr',checkedAt:new Date().toISOString()}];
const savedManualIsbns = bulk.getBooks().map(book => book.manualIsbn);
bulk.setLibraries(['sejong']);
await bulk.fillSelectedSource();
assert.deepEqual(bulk.getBooks().map(book => book.manualIsbn),savedManualIsbns,'Source enrichment must not create manual ISBN corrections');
const newCalls = bulkQueries.slice(beforeNewSource);
assert.ok(newCalls.length > 0);
assert.ok(newCalls.every(query => query.get('action') === 'availability' && query.get('sources') === 'sejong'));
assert.ok(bulk.getBooks().every(book => book.result.libraries.some(library => library.id === 'gyeonggi') && book.result.libraries.some(library => library.id === 'sejong')));
const afterNewSource = bulkQueries.length;
await bulk.fillSelectedSource();
assert.equal(bulkQueries.length,afterNewSource,'Completed source enrichment must not repeat');
bulk.setLibraries(['millie']);
assert.match(bulk.bookMarkup(bulk.getBooks()[0]),/로그인 후 확인/);
assert.match(bulk.bookInfoMarkup(bulk.getBooks()[0]),/millie\.co\.kr\/v3\/search\/result/);
assert.equal(selectedAvailability(bulk.getBooks()[0],['millie']),'unknown');
await bulk.fillSelectedSource();
assert.equal(bulkQueries.length,afterNewSource,'Manual Millie search must not call loan APIs');
for (const source of EXTRA_SOURCES) assert.ok(bulk.libraryPickerMarkup().includes(`data-library="${source.id}"`));
console.log('New sources: scoped cache enrichment, retained original loans, source picker and honest Millie login state passed.');

// Fresh persisted provider results are reused; details query only missing providers.
const recent = new Date().toISOString();
const statusBook=id=>({...common,id,coverUrl:null,manualIsbn:'9788937448805',result:{isbn:'9788937448805',libraries:[
  {id:'gyeonggi',status:'available',copies:[],sourceUrl:'https://example.com',checkedAt:recent},
  {id:'yongin',status:'not_held',copies:[],sourceUrl:'https://example.com',checkedAt:recent}
]}});
const orderedBooks=['bNEWOLD','bFRESH0','bOLDEST','bMISSED','bFRESH1','bFRESH2','bFRESH3','bFRESH4','bFRESH5','bFRESH6'].map(statusBook);
cache.set(WATCHA_PROFILES[0].id,{version:1,total:10,books:orderedBooks});
cache.set(WATCHA_PROFILES[1].id,{version:1,total:10,books:structuredClone(orderedBooks)});
bulk.setLibraries(['gyeonggi']);
const beforeScoped=bulkQueries.length;
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
const scopedCalls=bulkQueries.slice(beforeScoped);
assert.equal(scopedCalls.length,0,'Fresh persisted loan results avoid automatic requests');
assert.ok(scopedCalls.every(query=>query.get('action')==='availability' && query.get('sources')==='gyeonggi'));
assert.ok(bulk.getCombined().every(book=>book.result.libraries.some(source=>source.id==='yongin')),'Keep fresh results from other institutions');
const beforeDetails=bulkQueries.length;
await bulk.fillBookSources('bFRESH0');
const detailCall=bulkQueries.slice(beforeDetails);
assert.equal(detailCall.length,1);
assert.equal(detailCall[0].get('sources'),'gyeonggi-cyber','Opening loan details checks only missing providers');
await bulk.fillBookSources('bFRESH0');
assert.equal(bulkQueries.length,beforeDetails+1,'Reopening loan details reuses fresh results');
assert.ok(cache.get(WATCHA_PROFILES[0].id).books.every(book=>book.result?.libraries?.length),'Browser snapshots retain fresh loan results');
console.log('Watcha cached UI: persistent loan reuse, missing-provider requests, shared ISBN reuse and cached detail reopen passed.');

// A library switch must stop dequeuing the old provider after the eight in-flight books.
loanResults.clear();
for (const book of bulk.getBooks()) {
  book.result.libraries = book.result.libraries.filter(source=>source.id !== 'sejong');
  book.result.libraries = book.result.libraries.filter(source=>source.id !== 'gyeonggi');
}
holdAvailability=8;
const beforeSwitch=bulkQueries.length;
const oldJob=bulk.fillSelectedSource();
for (let ticks=0; releaseAvailability.length<8 && ticks<20; ticks++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(releaseAvailability.length,8,'Start eight simultaneous lookups');
assert.equal(bulkQueries.length-beforeSwitch,8,'Keep the remaining books queued while eight requests are in flight');
chooseLibrary('sejong');
for (const release of releaseAvailability.splice(0)) release();
await oldJob;
for (let ticks=0; bulk.getBusy() && ticks<20; ticks++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(bulk.getBusy(),false,'The replacement library job must finish');
const switchedCalls=bulkQueries.slice(beforeSwitch);
assert.equal(switchedCalls.filter(query=>query.get('sources') === 'gyeonggi').length,8,'Stop the old queue without discarding its in-flight results');
assert.ok(switchedCalls.some(query=>query.get('sources') === 'sejong'),'Continue with the newly selected provider');

// Changing branches during a lookup keeps the existing city queue running.
loanResults.clear();
for (const book of bulk.getBooks()) book.result.libraries = book.result.libraries.filter(source=>source.id !== 'suwon');
heldSource='suwon';holdAvailability=8;
bulk.setLibraries(['suwon:141025']);
const beforeCityQueue=bulkQueries.length;
const cityJob=bulk.fillSelectedSource();
for (let ticks=0; releaseAvailability.length<8 && ticks<20; ticks++) await new Promise(resolve=>setImmediate(resolve));
assert.equal(releaseAvailability.length,8);
chooseLibrary('suwon:141092');
assert.equal(bulkQueries.length-beforeCityQueue,8,'A branch switch starts no duplicate city requests');
for (const release of releaseAvailability.splice(0)) release();
await cityJob;
assert.equal(bulkQueries.length-beforeCityQueue,10,'Continue the same queue and look up each book once');
assert.ok(bulk.getCombined().every(book=>book.result.libraries.some(source=>source.id==='suwon')));
heldSource='gyeonggi';

// Yongin branches reuse city-wide copies and preserve their lookup timestamps too.
await bulk.fillBookSources('bFRESH0');
bulk.setLibraries(['yongin:MB']);
await bulk.fillSelectedSource();
const yonginTimes=bulk.getBooks().map(book=>book.result.libraries.find(source=>source.id==='yongin').checkedAt);
const beforeYonginSwitch=bulkQueries.length;
chooseLibrary('yongin:MO');
await bulk.fillSelectedSource();
assert.equal(bulkQueries.length,beforeYonginSwitch,'Changing Yongin branches makes no API calls');
assert.deepEqual(bulk.getBooks().map(book=>book.result.libraries.find(source=>source.id==='yongin').checkedAt),yonginTimes);
console.log('Watcha performance: library switching stops old work and starts the new scoped queue.');

// Firebase snapshots bypass legacy pagination; a combined refresh checks shared books once.
const cloudTime = new Date().toISOString();
const cloudBook = book => ({...structuredClone(book),result:{...book.result,libraries:book.result.libraries.map(source=>({...source,checkedAt:cloudTime}))}});
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',cloudMigrated:true,total:2,checkedAt:cloudTime,books:[cloudBook(common),cloudBook(left)]});
cache.set(WATCHA_PROFILES[1].id,{version:1,storage:'firebase',cloudMigrated:true,total:2,checkedAt:cloudTime,books:[cloudBook(common),cloudBook(right)]});
bulk.setLibraries(['suwon:141025']);
const beforeCloud = bulkQueries.length;
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
assert.equal(bulkQueries.length-beforeCloud,0,'Cloud book snapshots reuse fresh browser results');
assert.equal(bulk.getCombined().length,3);
assert.match(controls.get('[data-cache]').textContent,/도서관 조회/);
const afterCloud = bulkQueries.length;
await bulk.refresh();
assert.equal(bulkQueries.length,afterCloud,'Cloud list sync must not query any library or metadata');
await bulk.init(false,true);
const cloudRefresh = bulkQueries.slice(afterCloud);
assert.equal(cloudRefresh.length,1,'Refresh the common ISBN with a new live request');
assert.ok(cloudRefresh.every(query=>query.get('action')==='availability' && query.get('sources')==='suwon' && query.get('refresh')==='1'));
cache.set(WATCHA_PROFILES[0].id,{...cache.get(WATCHA_PROFILES[0].id),storage:'offline',storageError:'저장된 목록 표시 중 · 대출 상태 미확인'});
const beforeOffline = bulkQueries.length;
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
assert.equal(bulkQueries.length,beforeOffline,'Do not start lookups when the server cache is unavailable');
assert.equal(controls.get('[data-status]').textContent,'저장된 목록 표시 중 · 대출 상태 미확인');
assert.notEqual(controls.get('[data-cache]').textContent,controls.get('[data-status]').textContent,'Show the offline notice only once');
console.log('Watcha cloud UI: authoritative Firebase snapshots, source-only shared refresh, deduplication and explicit offline fallback passed.');

// Rated books sort by reader count, then the selected readers' average rating.
const wishesBeforeRated=structuredClone(cache.get(WATCHA_PROFILES[0].id));
const lowerAverage={...common,id:'bLOWAVG'};
cache.set('ratings:'+WATCHA_PROFILES[0].id,{version:1,storage:'firebase',kind:'ratings',total:3,books:[{...left,rating:1.5},{...lowerAverage,rating:5},{...common,rating:4.5}]});
cache.set('ratings:'+WATCHA_PROFILES[1].id,{version:1,storage:'firebase',kind:'ratings',total:3,books:[{...right,rating:4},{...lowerAverage,rating:1.5},{...common,rating:3}]});
const beforeReadingSwitch=bulkQueries.length;
await bulk.setKind('ratings');
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
const ratedCombined=bulk.getCombined();
assert.equal(ratedCombined.length,4);
assert.equal(ratedCombined[0].id,common.id,'Two readers rank before the single-reader books despite source order');
assert.deepEqual(ratedCombined.map(book=>book.id),[common.id,lowerAverage.id,right.id,left.id],'Reader count comes first; ties use the average of all selected readers, including single-reader books');
assert.deepEqual(ratedCombined[0].ratings,{[WATCHA_PROFILES[0].id]:4.5,[WATCHA_PROFILES[1].id]:3});
const ratedCard=bulk.bookMarkup(ratedCombined[0]);
assert.match(ratedCard,/야도란[\s\S]*★ 4\.5/);assert.match(ratedCard,/도선생[\s\S]*★ 3\.0/);
assert.match(bulk.bookInfoMarkup(ratedCombined[0]),/야도란[\s\S]*★ 4\.5/);
assert.deepEqual(cache.get(WATCHA_PROFILES[0].id),wishesBeforeRated,'Reading rated books never overwrites the wishlist browser snapshot');
assert.ok(cacheReads.slice(-2).every(read=>read.kind==='ratings'));
await bulk.setKind('wishes');
assert.equal(bulkQueries.length,beforeReadingSwitch,'Switching reading modes and back reuses finished loans');
assert.equal(bulk.getKind(),'wishes');
assert.deepEqual(bulk.getCombined().find(book=>book.id===common.id).ratings,{[WATCHA_PROFILES[0].id]:4.5,[WATCHA_PROFILES[1].id]:3},'Wishlist books show the matching personal ratings from read collections');
assert.deepEqual(bulk.getCombined().map(book=>book.id),[common.id,left.id,right.id],'Wishlist ordering keeps its original shared-interest order');
assert.match(uiRoot.innerHTML,/<button[^>]+data-refresh[^>]*><span>목록 동기화<\/span><small[^>]+data-sync-age/,'Put the shared execution date inside the sync button');
assert.match(uiRoot.innerHTML,/data-collection-kind="ratings"/);
// City sections list available branches only and collapse duplicate copies into a count.
const compactLoanBook={...common,result:{isbn:'9788937448805',libraries:[
 {id:'suwon',name:'수원시 도서관',status:'available',sourceUrl:'https://mob.suwonlib.go.kr/search',copies:[{branch:'선경',branchCode:'141025',status:'available'},{branch:'선경',branchCode:'141025',status:'available'},{branch:'창룡',branchCode:'141549',status:'unavailable'}]},
 {id:'yongin',name:'용인시 도서관',status:'available',sourceUrl:'https://lib.yongin.go.kr',copies:[{branch:'수지',branchCode:'MB',status:'available'},{branch:'동천',branchCode:'NA',status:'unknown'}]},
]}};
const compact=bulk.bookInfoMarkup(compactLoanBook).split('data-info-loans>')[1].split('</details>')[0];
const originalLinks=[...compact.matchAll(/<h3>([^<]+)<\/h3><a href="([^"]+)"/g)].map(([,name,href])=>({name,url:new URL(href)}));
for (const [index,id,key] of [[0,'suwon','searchWord'],[1,'yongin','searchKeyword5'],[2,'gyeonggi','search_text'],[3,'sejong','kwd'],[4,'gyeonggi-cyber','isbn']]) {
  assert.equal(originalLinks[index].url.href,sourceSearchUrl(id,compactLoanBook.result.isbn),'Replace old cached homepage links and generate links for providers not loaded yet');
  assert.equal(originalLinks[index].url.searchParams.get(key),compactLoanBook.result.isbn);
}
assert.match(compact,/<h3>수원시 도서관<\/h3>/);assert.match(compact,/<h3>용인시 도서관<\/h3>/);
assert.match(compact,/선경도서관<\/span><small>2권/);assert.match(compact,/수지도서관/);assert.doesNotMatch(compact,/창룡|동천|소장본/);
// Wishlist membership stays selected-account-specific; any registered reader may add a rating.
cache.set('ratings:'+WATCHA_PROFILES[2].id,{version:1,storage:'firebase',kind:'ratings',total:2,books:[{...common,rating:2.5},{...common,id:'bREADONLY',rating:5}]});
cache.set('ratings:'+WATCHA_PROFILES[3].id,{version:1,storage:'firebase',kind:'ratings',total:2,books:[{...common,rating:.5},{...left,rating:null}]});
const beforeWishlistRatings=bulkQueries.length;
const wishlistBeforeRatings=structuredClone(cache.get(WATCHA_PROFILES[0].id));
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
const wishlistCommon=bulk.getCombined().find(book=>book.id===common.id);
assert.deepEqual(wishlistCommon.profileIds,[WATCHA_PROFILES[0].id],'Reader badges do not change wishlist ownership or interest counts');
assert.deepEqual(wishlistCommon.ratings,Object.fromEntries(WATCHA_PROFILES.map((profile,index)=>[profile.id,[4.5,3,2.5,.5][index]])),'Include readers even when their wishlist account is unselected');
assert.deepEqual(bulk.getCombined().map(book=>book.id),[common.id,left.id],'Read-only books and ratings must not change wishlist membership or ordering');
for (const markup of [bulk.bookMarkup(wishlistCommon),bulk.bookInfoMarkup(wishlistCommon)]) {
  assert.match(markup,/현석 김[\s\S]*★ 2\.5/);assert.match(markup,/김민석[\s\S]*★ 0\.5/);
  assert.equal((markup.match(/class="chip chip--gray">야도란/g)||[]).length,1,'Show a person who both wishes and rated the book only once');
  assert.match(markup,/읽은 책 평점/);
}
assert.equal(bulk.getCombined().find(book=>book.id===left.id).ratings[WATCHA_PROFILES[3].id],undefined,'Never render an absent rating as zero stars');
assert.equal(bulkQueries.length,beforeWishlistRatings,'Joining saved ratings must not trigger metadata or library lookups for other readers');
assert.deepEqual(cache.get(WATCHA_PROFILES[0].id),wishlistBeforeRatings,'Keep ratings as a display join instead of writing another person’s rating into the wishlist');
await bulk.setKind('ratings');
assert.deepEqual(bulk.getCombined().find(book=>book.id===common.id).ratings,{[WATCHA_PROFILES[0].id]:4.5},'The read-books view continues to use only its selected accounts');
await bulk.setKind('wishes');
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
for(const profile of WATCHA_PROFILES)cache.delete('ratings:'+profile.id);
console.log('Watcha wishlist ratings: matching book IDs, unselected readers, card/detail parity, absent ratings and list/cache isolation passed.');
console.log('Watcha reading UI: mode isolation, per-person stars, shared-interest sorting, inline sync age and compact available city branches passed.');

// Fresh same-ISBN results are reused; explicit refresh still shares requests within a batch.
const duplicates=Array.from({length:12},(_,index)=>({...common,id:'bDUPL'+String(index).padStart(2,'0'),title:'edition '+index,info:{...sampleInfo,authors:['author '+index]},result:{isbn:'9788937448805',libraries:[]}}));
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:duplicates.length,books:duplicates});
bulk.setLibraries(['suwon:141025']);
const beforeDuplicates=bulkQueries.length;
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
assert.equal(bulkQueries.length-beforeDuplicates,0,'Fresh ISBN results are shared across collections without requests');
assert.equal(bulk.getCombined().length,12,'Keep every book row while sharing loan data');
assert.ok(bulk.getBooks().every((book,index)=>book.info.authors[0]==='author '+index && selectedAvailability(book,['suwon:141025'])==='available'),'Preserve individual metadata and apply the response to every book');
loanFixtureStatus='unavailable';
const beforeFreshDuplicates=bulkQueries.length;
await bulk.init(false,true);
assert.equal(bulkQueries.length-beforeFreshDuplicates,1,'Explicit refresh starts a fresh live request');
assert.ok(bulk.getBooks().every(book=>selectedAvailability(book,['suwon:141025'])==='unavailable'),'Show changed live status, never the previous batch result');
const correctedDuplicates=structuredClone(duplicates);
for(const book of correctedDuplicates.slice(0,2)) book.manualIsbn='9788937448805';
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:12,books:correctedDuplicates});
const beforeCorrections=bulkQueries.length;
await bulk.init(false,true);
assert.equal(bulkQueries.length-beforeCorrections,3,'Keep separate correction IDs while sharing ordinary ISBN requests');
assert.deepEqual(bulkQueries.slice(beforeCorrections).filter(query=>query.has('id')).map(query=>query.get('id')).sort(),correctedDuplicates.slice(0,2).map(book=>book.id),'Persist each manual correction independently');
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:12,books:duplicates});
failAvailability=true;
const beforeFailedDuplicates=bulkQueries.length;
await bulk.init(false,true);
assert.equal(bulkQueries.length-beforeFailedDuplicates,1,'Share a failed live response without a request storm');
assert.ok(bulk.getBooks().every(book=>book.error==='live request failed'),'Every matching book shows the failure without old successful loan data');
failAvailability=false;loanFixtureStatus='available';
console.log('Watcha ISBN performance: cross-wave sharing, explicit refresh, per-book metadata, separate corrections and shared failures passed.');

// Full sync loads both collections for every account without changing the displayed selection.
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',cloudMigrated:true,total:2,checkedAt:cloudTime,books:[cloudBook(common),cloudBook(left)]});
for (const profile of WATCHA_PROFILES.slice(1)) cache.set(profile.id,{version:1,storage:'firebase',cloudMigrated:true,total:0,checkedAt:cloudTime,books:[]});
const beforeFullSync = cacheReads.length, beforeFullSyncQueries = bulkQueries.length;
await bulk.init(true, false, true);
const fullSyncReads = cacheReads.slice(beforeFullSync);
assert.deepEqual(fullSyncReads.map(read=>read.id),[...WATCHA_PROFILES,...WATCHA_PROFILES].map(profile=>profile.id),'Full sync includes both collections for every registered account');
assert.ok(fullSyncReads.every(read=>read.refresh),'Each registered collection must be refreshed');
assert.equal(bulkQueries.length,beforeFullSyncQueries,'Full list sync makes no library or metadata requests');
assert.equal(bulk.getCombined().length,2,'Full sync must preserve the displayed account selection');
assert.match(uiRoot.innerHTML,new RegExp(`data-profile-id="${WATCHA_PROFILES[1].id}" aria-pressed="false"`));
console.log('Watcha full sync: both collections refreshed for every account while preserving selected accounts.');

// Missing metadata in unselected profiles is collected once per book during full sync.
const missingInfo = book => { const value = cloudBook(book); delete value.info; delete value.result.info; return value; };
cache.set(WATCHA_PROFILES[1].id,{version:1,storage:'firebase',total:2,books:[missingInfo(common),missingInfo(right)]});
cache.set(WATCHA_PROFILES[2].id,{version:1,storage:'firebase',total:2,books:[missingInfo(right),missingInfo({...common,id:'bTHIRD0'})]});
const beforeMetadataSync = bulkQueries.length;
await bulk.init(true,false,true);
const metadataSync = bulkQueries.slice(beforeMetadataSync);
assert.deepEqual(metadataSync.map(query=>query.get('id')).sort(),['bCOMMON','bRIGHT0','bTHIRD0']);
assert.ok(metadataSync.every(query=>query.get('action')==='info'),'Full sync collects metadata without querying loans');
for (const profile of WATCHA_PROFILES) assert.ok(cache.get(profile.id).books.every(book=>book.info.genres[0]==='사회과학'),'Save genres for selected and unselected profiles');
const afterMetadataSync = bulkQueries.length;
await bulk.init(true,false,true);
assert.equal(bulkQueries.length,afterMetadataSync,'Reuse saved metadata on repeated full sync');
assert.equal(bulk.getCombined().length,2,'Metadata sync preserves displayed account selection');

// Blocked lookups remain visible as failures, even with the available-only filter on.
for (const status of [403,429]) {
  blockedLoans=status;
  cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:12,books:Array.from({length:12},(_,index)=>({...common,id:'bBLOCK'+String(index).padStart(2,'0'),info:{...sampleInfo,isbn:fixtureIsbn(String(index))},result:{isbn:fixtureIsbn(String(index)),libraries:[]}}))});
  controls.get('[data-available]').checked=true;
  bulk.setLibraries(['suwon:141025']);
  const start=bulkQueries.length;
  await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
  assert.equal(bulkQueries.length-start,8,'Stop additional requests after the eight in-flight blocked responses');
  assert.match(controls.get('[data-status]').textContent,new RegExp(`HTTP ${status}.*중단`));
  assert.match(controls.get('[data-totals]').textContent,/조회 실패 8권/);
  assert.match(controls.get('[data-books]').innerHTML,/data-book="bBLOCK00"/,'Failed lookups remain visible with the available-only filter');
  assert.equal(controls.get('[data-count]').textContent,'빌릴 수 있는 책 0권');
  assert.match(controls.get('[data-totals]').textContent,/확인 필요 12권/,'Unconfirmed counts stay visible in the secondary summary');
  assert.doesNotMatch(controls.get('[data-books]').innerHTML,/빌릴 수 있는 책이 없습니다/);
  const failed=bulk.getBooks().find(book=>book.result?.libraries?.some(source=>source.status==='error'));
  assert.match(bulk.bookMarkup(failed),/조회 실패/);
  assert.match(bulk.bookMarkup(failed),new RegExp(`HTTP ${status}`),'Show the failure reason without opening the book dialog');
  assert.match(bulk.bookMarkup(failed),/data-check=/,'Provide a retry on the failed card');
  assert.match(bulk.bookMarkup(failed),/도서관에서 직접 확인/,'Provide a direct library fallback');
  assert.doesNotMatch(bulk.bookMarkup(failed),/× |소장 · 대출 불가/);
  assert.match(bulk.bookInfoMarkup(failed),new RegExp(`HTTP ${status}`));
  assert.equal(selectedAvailability(failed,['suwon:141025']),'unknown');
  chooseLibrary('suwon:141092');
  await bulk.fillSelectedSource();
  assert.equal(bulkQueries.length-start,8,'Switching branches must not restart a rate-limited or denied city queue');
  bulk.setLibraries(['suwon:141025']);
}
blockedLoans=0;
console.log('Watcha errors: HTTP rejection/rate limiting, timeout, network and invalid responses stay separate from loan states; blocked queues stop and filtered lists report failures.');

// Keep uncertain and in-flight books until a live lookup establishes a negative result.
const [uncertainBook,,inFlightBook,availableBook,absentBook]=bulk.getBooks();
const loanResult=(status,copies=[])=>({isbn:'9788937448805',libraries:[{id:'suwon',status,copies}]});
inFlightBook.result=null;inFlightBook.error='';inFlightBook.loading=true;
availableBook.result=loanResult('available',[{branchCode:'141025',status:'available'}]);
absentBook.result=loanResult('not_held');
bulk.renderBooks();
for(const book of [uncertainBook,inFlightBook,availableBook])assert.ok(controls.get('[data-books]').innerHTML.includes(`data-book="${book.id}"`));
assert.ok(!controls.get('[data-books]').innerHTML.includes(`data-book="${absentBook.id}"`));
assert.equal(controls.get('[data-count]').textContent,'빌릴 수 있는 책 1권');
assert.match(controls.get('[data-totals]').textContent,/확인 필요/);
uncertainBook.result=loanResult('not_held');uncertainBook.error='';bulk.renderBooks(uncertainBook);
assert.ok(!controls.get('[data-books]').innerHTML.includes(`data-book="${uncertainBook.id}"`),'Remove an uncertain book only after its absence is confirmed');
inFlightBook.result=loanResult('unavailable',[{branchCode:'141025',status:'unavailable'}]);inFlightBook.loading=false;bulk.renderBooks(inFlightBook);
assert.ok(!controls.get('[data-books]').innerHTML.includes(`data-book="${inFlightBook.id}"`),'Remove a loading book after a confirmed unavailable response');
delete uncertainBook.result;uncertainBook.loading=true;bulk.renderBooks(uncertainBook);
assert.ok(controls.get('[data-books]').innerHTML.includes(`data-book="${uncertainBook.id}"`),'A new lookup puts the uncertain book back in the list');
console.log('Watcha available-only list: uncertain/loading cards retained, confirmed negatives removed, retry restored and separate counts passed.');

// Real checkbox events combine genres with title and availability filters without requests.
const genreBook = (id, title, genres, status='available') => ({...common,id,title,info:{...sampleInfo,genres,isbn:fixtureIsbn(id)},result:{isbn:fixtureIsbn(id),libraries:[{id:'gyeonggi',status,copies:[],checkedAt:new Date().toISOString()}]}});
const genreBooks = [genreBook('bGEN001','소설 책',['소설','소설']),genreBook('bGEN002','경제 책',['경제서']),genreBook('bGEN003','과학 소설',[' SF ','소설'],'unavailable'),genreBook('bGEN004','분류 없는 책',[])];
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:4,books:genreBooks});
cache.set(WATCHA_PROFILES[1].id,{version:1,storage:'firebase',total:2,books:[structuredClone(genreBooks[0]),structuredClone(genreBooks[2])]});
bulk.setLibraries(['gyeonggi']);
controls.get('[data-available]').checked=false;
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
bulk.getBooks().find(book=>book.id==='bGEN003').result.libraries[0].status='unavailable';
const genreRequests = bulkQueries.length;
const genreControl = controls.get('[data-genres]');
const chooseGenre = (genre, checked=true) => genreControl.listeners.change({target:{dataset:{genre},checked}});
assert.equal(controls.get('[data-genres-summary]').textContent,'전체');
assert.match(genreControl.innerHTML,/data-genre="소설">소설 <span>2<\/span>/,'Count a shared/multigenre book once per genre');
assert.match(genreControl.innerHTML,/data-genre="미분류">미분류 <span>1<\/span>/);
chooseGenre('소설');
assert.equal(controls.get('[data-genres-summary]').textContent,'소설','Selected genres remain readable when the picker is collapsed');
assert.match(controls.get('[data-books]').innerHTML,/bGEN001/);
assert.match(controls.get('[data-books]').innerHTML,/bGEN003/);
assert.doesNotMatch(controls.get('[data-books]').innerHTML,/bGEN002|bGEN004/);
bulk.renderBooks({id:'bGEN002'});
assert.doesNotMatch(controls.get('[data-books]').innerHTML,/bGEN002/,'A background loan update cannot insert a book excluded by genre');
chooseGenre('경제서');
assert.equal(controls.get('[data-genres-summary]').textContent,'소설, 경제서');
assert.match(controls.get('[data-count]').textContent,/책 3권/,'Multiple selections match any selected genre');
controls.get('[data-search]').value='과학';bulk.renderBooks();
assert.match(controls.get('[data-count]').textContent,/책 1권/);
controls.get('[data-available]').checked=true;bulk.renderBooks();
assert.match(controls.get('[data-count]').textContent,/책 0권/);
assert.match(controls.get('[data-books]').innerHTML,/조건에 맞는 책이 없습니다/);
controls.get('[data-search]').value='';controls.get('[data-available]').checked=false;
chooseGenre('소설',false);chooseGenre('경제서',false);chooseGenre('미분류');
assert.match(controls.get('[data-books]').innerHTML,/bGEN004/);
assert.doesNotMatch(controls.get('[data-books]').innerHTML,/bGEN001|bGEN002|bGEN003/);
genreControl.listeners.change({target:{dataset:{},hasAttribute:name=>name==='data-genres-all'}});
assert.equal(controls.get('[data-genres-summary]').textContent,'전체','Reset also clears the collapsed selection summary');
assert.match(controls.get('[data-count]').textContent,/책 4권/);
assert.equal(bulkQueries.length,genreRequests,'Filtering never fetches book or loan information');
// Shuffle the selected, deduplicated list without changing filters or stored books.
assert.match(uiRoot.innerHTML,/data-sort="random"[^>]*>랜덤<\/button>/);
assert.doesNotMatch(uiRoot.innerHTML,/data-shuffle/);
assert.match(uiRoot.innerHTML,/data-cart-open[^>]*>\s*<svg/,'The shelf opener shows only its icon');
const visibleIds = () => [...controls.get('[data-books]').innerHTML.matchAll(/<article[^>]*data-book="([^"]+)"/g)].map(match => match[1]);
const defaultOrder = visibleIds();
const storedOrder = bulk.getBooks().map(book => book.id);
const shuffleButton = controls.get('[data-sort="random"]');
const chooseSort = sort => controls.get('[data-sort-options]').listeners.click({target:{closest:selector=>selector==='[data-sort]' ? {dataset:{sort}} : null}});
const originalRandom = Math.random;
try {
  chooseSort('alphabetical');
  assert.deepEqual(visibleIds(),['bGEN002','bGEN003','bGEN004','bGEN001'],'Korean alphabetical sorting orders the deduplicated titles');
  bulk.renderBooks({id:'bGEN002'});
  assert.deepEqual(visibleIds(),['bGEN002','bGEN003','bGEN004','bGEN001'],'Live updates preserve alphabetical sorting');
  chooseSort('popular');
  assert.deepEqual(visibleIds(),defaultOrder,'Popular sorting puts books wanted by two people before those wanted by one');
  Math.random = () => 0;
  chooseSort('random');
  const shuffledOrder = visibleIds();
  assert.deepEqual(shuffledOrder,[...defaultOrder.slice(1),defaultOrder[0]],'Use Fisher–Yates to mix the full selected list');
  assert.deepEqual([...shuffledOrder].sort(),[...defaultOrder].sort(),'Shuffle keeps each selected book exactly once');
  assert.deepEqual(bulk.getBooks().map(book => book.id),storedOrder,'Stored list order stays unchanged');
  bulk.renderBooks({id:'bGEN002'});
  assert.deepEqual(visibleIds(),shuffledOrder,'Live results preserve the shuffled order');
  chooseGenre('소설');
  assert.deepEqual(visibleIds(),shuffledOrder.filter(id=>['bGEN001','bGEN003'].includes(id)),'Genre filters preserve the shuffled order');
  controls.get('[data-search]').value='과학'; bulk.renderBooks();
  assert.deepEqual(visibleIds(),['bGEN003']);
  assert.equal(shuffleButton.disabled,true,'Disable shuffle for a single visible book');
  controls.get('[data-available]').checked=true; bulk.renderBooks();
  assert.deepEqual(visibleIds(),[],'Shuffle respects title, genre and availability together');
  assert.equal(shuffleButton.disabled,true,'Disable shuffle for an empty list');
  controls.get('[data-search]').value=''; controls.get('[data-available]').checked=false;
  chooseGenre('소설',false);
  Math.random = () => 0.999;
  chooseSort('random');
  assert.deepEqual(visibleIds(),defaultOrder,'Another click generates a fresh shuffle');
  assert.equal(shuffleButton.disabled,false);
  chooseSort('alphabetical');
  chooseSort('popular');
  assert.deepEqual(visibleIds(),defaultOrder,'Leaving random sorting restores the selected sort instead of the old shuffle');
  assert.equal(bulkQueries.length,genreRequests,'Shuffle makes no API requests');
} finally { Math.random = originalRandom; }
console.log('Watcha shuffle: selected books, deduplication, repeated clicks, stable updates, filters and no requests passed.');
chooseGenre('미분류');
const pendingGenreBook = genreBook('bGEN005','분류 확인 중',[]); delete pendingGenreBook.info;
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:1,books:[pendingGenreBook]});
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
assert.match(controls.get('[data-count]').textContent,/책 0권/,'New metadata immediately moves a book out of the unclassified filter');
assert.match(genreControl.innerHTML,/data-genre="사회과학">사회과학 <span>1<\/span>/);
assert.match(genreControl.innerHTML,/data-genre="미분류">미분류 <span>0<\/span>/,'Keep a selected empty genre available to uncheck');
console.log('Watcha genres: native checkbox events, multi-selection, deduplicated counts, title/loan intersections, unclassified books and reset passed.');

// Exercise the production renderer with a minimal DOM tree that tracks node identities.
const cardList = {children:[], moves:0, get firstElementChild(){return this.children[0]},
  insertBefore(row, before){ row.remove(); const index=before ? this.children.indexOf(before) : this.children.length; this.children.splice(index,0,row); row.parent=this; this.moves++; },
  replaceChildren(...rows){for(const row of this.children)row.parent=null;this.children=rows;for(const row of rows)row.parent=this;}
};
function cardNode() {return {dataset:{},parent:null,textContent:'',remove(){if(this.parent){const siblings=this.parent.children;siblings.splice(siblings.indexOf(this),1);this.parent=null;}}};}
function parseCard(html) {
  const row=cardNode(); row.dataset={book:html.match(/data-book="([^"]+)"/)[1],state:html.match(/data-state="([^"]+)"/)[1]};
  const patterns = {
    '.watcha-book__state':/<span class="watcha-book__state"[^>]*>[\s\S]*?<\/span>/,
    '.watcha-book__meta':/<div class="watcha-book__meta">[\s\S]*?<\/div>/,
    '.watcha-book__owners':/<div class="watcha-book__owners">[\s\S]*?<\/div>/,
    '.watcha-book__locations':/<div class="watcha-book__locations">[\s\S]*?<\/div>/,
    '[data-cart-book]':/<button[^>]*data-cart-book="[^"]+"[^>]*>[\s\S]*?<\/button>/,
    '.watcha-book__recovery':/<section class="watcha-book__recovery"[^>]*>[\s\S]*?<\/section>/,
    '[data-open-book]':/<button class="watcha-book__open"[^>]*>[\s\S]*?<\/button>/,
    '.watcha-book__cover':/<span class="watcha-book__cover">[\s\S]*?<\/span>(?:<img[^>]*>)?<\/span>/,
  };
  row.parts=new Map(Object.entries(patterns).map(([selector,pattern])=>{
    const outerHTML=html.match(pattern)?.[0];
    return [selector,outerHTML ? {outerHTML,textContent:outerHTML.replace(/<[^>]*>/g,''),
      attributes:{'aria-label':outerHTML.match(/aria-label="([^"]*)"/)?.[1]},
      getAttribute(name){return this.attributes[name]},setAttribute(name,value){this.attributes[name]=value},
      replaceWith(incoming){incoming.replaceWith=this.replaceWith;row.parts.set(selector,incoming)}
    } : null];
  }));
  row.querySelector=selector=>row.parts.get(selector);
  return row;
}
const cardDocument={createElement(tag){
  if(tag==='template')return {content:{},set innerHTML(html){this.content.firstElementChild=parseCard(html)}};
  return cardNode();
}};
const renderCards=new Function('root','document','bookMarkup',rendererSource+'\nreturn renderBookCards;')({querySelector:()=>cardList},cardDocument,bulk.bookMarkup);
const stableA=genreBook('bSTABL1','첫 책',['소설']),stableB=genreBook('bSTABL2','둘째 책',['SF']);
renderCards([stableA,stableB],'없음');
const originalCard=cardList.children[0],originalButton=originalCard.querySelector('[data-open-book]'),originalCover=originalCard.querySelector('.watcha-book__cover');
renderCards([stableB,stableA],'없음');
assert.equal(cardList.children[1],originalCard,'Shuffling moves the existing card without recreating it');
renderCards([stableA,stableB],'없음');
const movesBefore=cardList.moves;
stableA.loading=true; renderCards([stableA,stableB],'없음',stableA.id);
stableA.loading=false;stableA.result.libraries[0].status='unavailable';renderCards([stableA,stableB],'없음',stableA.id);
assert.equal(cardList.children[0],originalCard,'Keep the hovered card while its own loan status changes');
assert.equal(originalCard.querySelector('[data-open-book]'),originalButton,'Keep the same button between pointer down and click');
assert.equal(originalCard.querySelector('.watcha-book__cover'),originalCover,'Do not reload covers on loan updates');
assert.equal(originalCard.dataset.state,'unavailable');
assert.match(originalCard.querySelector('.watcha-book__state').textContent,/대출 불가/);
assert.equal(cardList.moves,movesBefore,'Unchanged card positions never move in the DOM');
stableA.error='connection failed';renderCards([stableA,stableB],'없음',stableA.id);
assert.match(originalCard.querySelector('.watcha-book__recovery').textContent,/다시 시도/,'Insert recovery actions when an existing card fails');
stableA.error='';renderCards([stableA,stableB],'없음',stableA.id);
assert.match(originalCard.querySelector('.watcha-book__recovery').outerHTML,/hidden/,'Remove stale recovery actions after a successful retry');
renderCards([stableA,genreBook('bSTABL0','새 책',['소설']),stableB],'없음','bSTABL0');
assert.equal(cardList.children[0],originalCard,'Adding a filtered result preserves existing cards');
renderCards([stableB],'없음');assert.deepEqual(cardList.children.map(row=>row.dataset.book),[stableB.id]);
renderCards([],'검색 결과 없음');const emptyNode=cardList.firstElementChild;
renderCards([],'검색 결과 없음');assert.equal(cardList.firstElementChild,emptyNode);
renderCards([stableA],'없음');assert.deepEqual(cardList.children.map(row=>row.dataset.book),[stableA.id]);
console.log('Watcha live card rendering: persistent cards/buttons/covers, status updates, stable positions, filtered additions/removals and empty-state recovery passed.');

// Loan updates coalesce over 100 ms and stale page jobs cannot repaint a new account.
const renderScheduleSource=controllerSource.match(/function scheduleLoanRender[\s\S]*?(?=\nasync function checkBook)/)[0];
const queuedRenders=[], renderedChanges=[];
const renderSchedule=new Function('setTimeout','renderBooks','let epoch=1,loanRenderTimer=null;const changedLoanBooks=new Set();'+renderScheduleSource+'\nreturn {scheduleLoanRender,newEpoch:()=>{epoch++},reset:()=>{loanRenderTimer=null;changedLoanBooks.clear()}};')(
  (callback,delay)=>{assert.equal(delay,100);queuedRenders.push(callback);return queuedRenders.length;},
  changed=>renderedChanges.push(changed));
for(let index=0;index<8;index++)renderSchedule.scheduleLoanRender({id:'b'+index},1);
assert.equal(queuedRenders.length,1,'Eight loan updates schedule only one repaint');
assert.equal(renderedChanges.length,0,'Do not repaint for each arriving response');
queuedRenders.shift()();assert.deepEqual(renderedChanges,[undefined],'Multiple changed books repaint together');
renderSchedule.scheduleLoanRender({id:'bONE000'},1);queuedRenders.shift()();
assert.deepEqual(renderedChanges.at(-1),{id:'bONE000'},'A single changed book keeps the targeted renderer');
renderSchedule.scheduleLoanRender({id:'bSTALE0'},1);renderSchedule.newEpoch();queuedRenders.shift()();
assert.equal(renderedChanges.length,2,'Ignore a scheduled repaint from the previous page session');
console.log('Watcha render scheduling: coalesced updates, targeted single updates and stale-session isolation passed.');

// Confirming a full sync records an execution; cancelling must not start work or alter history.
const syncSource=controllerSource.match(/function syncDateLabel[\s\S]*?(?=\nfunction libraryButton)/)[0];
const syncRuns=[], syncRequests=[];let acceptSync=false, confirmationMessage, failHistory=false;
let serverSync={lastFullSyncAt:null};
const historyApi=async(params,options={})=>{
  syncRequests.push({params,options});
  if(failHistory)throw new Error('Server unavailable');
  if(options.method==='POST')serverSync={lastFullSyncAt:new Date().toISOString()};
  return structuredClone(serverSync);
};
function historyViewer() {
  const nodes=new Map();
  const viewer=new Function('window','root','api','init','time',"let lastFullSync,syncHistoryError=false,epoch=1;\n"+syncSource+'\nreturn {syncDateLabel,confirmFullSync,refreshSyncHistory,getLastSync:()=>lastFullSync};')(
    {confirm(message){confirmationMessage=message;return acceptSync}},
    {querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{disabled:false,textContent:'',title:''});return nodes.get(selector)}},
    historyApi,async(...args)=>{syncRuns.push(args);nodes.get('[data-refresh]').disabled=false;},String);
  return {viewer,nodes};
}
const {viewer:syncControls,nodes:syncNodes}=historyViewer();
const ageNow=Date.parse('2026-10-04T05:00:00Z');
assert.equal(syncControls.syncDateLabel(undefined,ageNow),'실행 기록 없음');
assert.equal(syncControls.syncDateLabel('invalid',ageNow),'실행 기록 없음');
assert.equal(syncControls.syncDateLabel('2026-10-05T05:00:00Z',ageNow),'실행 기록 없음');
assert.equal(syncControls.syncDateLabel('2026-10-04T01:00:00Z',ageNow),'2026. 10. 4. 실행');
assert.equal(syncControls.syncDateLabel('2026-10-01T05:00:00Z',ageNow),'2026. 10. 1. 실행');
assert.equal(syncControls.syncDateLabel('2026-10-03T15:01:00Z',ageNow),'2026. 10. 4. 실행','Use the execution date in Korea, even when the UTC date differs');
assert.equal(syncControls.syncDateLabel('2026-10-04T14:59:00Z',Date.parse('2026-10-04T15:01:00Z')),'2026. 10. 4. 실행','The execution date stays fixed across midnight in Korea');
await syncControls.confirmFullSync();
assert.equal(confirmationMessage,'이 기능을 실행하면 서버비가 지불됩니다. 그래도 실행하시겠습니까?');
assert.equal(syncRuns.length,0);assert.equal(syncRequests.length,0);assert.equal(syncControls.getLastSync(),undefined);
acceptSync=true;await syncControls.confirmFullSync();
assert.deepEqual(syncRuns,[[true,false,true]],'Confirmation runs every registered profile without loan refresh');
const syncTimestamp=serverSync.lastFullSyncAt;
assert.deepEqual(syncRequests[0],{params:{action:'sync-history'},options:{method:'POST'}});
const syncDate = new Date(syncTimestamp).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}) + ' 실행';
assert.equal(syncControls.getLastSync(),syncTimestamp);assert.equal(syncControls.syncDateLabel(syncTimestamp),syncDate);
acceptSync=false;await syncControls.confirmFullSync();
assert.equal(syncRuns.length,1);assert.equal(serverSync.lastFullSyncAt,syncTimestamp,'Cancelling preserves the server execution time');
assert.equal(syncRequests.length,1,'Cancelling sends no history request');
const {viewer:otherViewer,nodes:otherNodes}=historyViewer();
await otherViewer.refreshSyncHistory();
assert.equal(otherViewer.getLastSync(),syncTimestamp,'Another browser reads the same execution time');
assert.equal(otherNodes.get('[data-sync-age]').textContent,syncDate);
failHistory=true;acceptSync=true;await syncControls.confirmFullSync();
assert.equal(syncRuns.length,1,'Never launch a sync without successfully saving its shared history');
assert.equal(syncControls.getLastSync(),syncTimestamp);
assert.match(syncNodes.get('[data-status]').textContent,/시작하지 않았습니다/);
assert.equal(syncNodes.get('[data-refresh]').disabled,false);
await otherViewer.refreshSyncHistory();
assert.equal(otherNodes.get('[data-sync-age]').textContent,'기록 확인 실패','A failed server read is distinct from no history');
console.log('Watcha full sync confirmation: Korean calendar-day history, shared server history, confirmed runs, cancellation without requests and failed-write protection passed.');

// Retry only failed/unqueried books, keeping successful lookups and respecting Retry-After.
controls.get('[data-search]').value=''; controls.get('[data-available]').checked=false;
const recoveryBooks=Array.from({length:3},(_,index)=>({...common,id:'bRETRY'+index,info:{...sampleInfo,isbn:fixtureIsbn('retry'+index)}}));
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:3,books:recoveryBooks});
bulk.setLibraries(['gyeonggi']);
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
const [recoveryGood,recoveryFailed,recoveryPending]=bulk.getBooks();
const goodResult=structuredClone(recoveryGood.result);
recoveryFailed.error='connection failed'; recoveryFailed.result={isbn:recoveryFailed.info.isbn,libraries:[]};
recoveryPending.result={isbn:recoveryPending.info.isbn,libraries:[]};
bulk.renderBooks();
const recoverButton=controls.get('[data-retry-failed]');
assert.equal(recoverButton.hidden,false);
const beforeRecovery=bulkQueries.length;
await recoverButton.listeners.click();
assert.equal(bulkQueries.length-beforeRecovery,2,'Do not repeat successful loans or refetch the wishlist');
assert.ok(bulkQueries.slice(beforeRecovery).every(query=>query.get('action')==='availability' && query.get('sources')==='gyeonggi'));
assert.deepEqual(recoveryGood.result,goodResult,'Preserve the previously successful lookup');
assert.equal(recoveryFailed.error,''); assert.equal(recoverButton.hidden,true);

recoveryFailed.result.libraries[0]={id:'gyeonggi',status:'error',copies:[],errorCode:'rate_limited',retryAfter:120,checkedAt:new Date().toISOString(),message:'요청 제한 (HTTP 429)'};
bulk.renderBooks();
const beforeCooldown=bulkQueries.length;
await bulk.retryBook(recoveryFailed.id);
await recoverButton.listeners.click();
assert.equal(bulkQueries.length,beforeCooldown,'Neither retry entry point may bypass a source Retry-After');
assert.match(controls.get('[data-status]').textContent,/초 후 다시 시도/);
assert.match(bulk.bookMarkup(recoveryFailed),/초 후 다시 시도/);
recoveryFailed.result.libraries[0].checkedAt=new Date(Date.now()-121_000).toISOString();
await recoverButton.listeners.click();
assert.equal(bulkQueries.length-beforeCooldown,1,'After the cooldown, retry just the failed book');
assert.equal(recoverButton.hidden,true);

failAvailability=true;failureStatus=503;failureReason='temporarily_unavailable';
await bulk.retryBook(recoveryFailed.id);
assert.match(recoveryFailed.error,/운영자.*명단.*HTTP 503/,'Explain an admin allowlist outage separately from a library rejection');
assert.match(controls.get('[data-status]').textContent,/조회 실패 1권/,'A failed retry must never claim all loans are confirmed');
failAvailability=false;failureStatus=502;failureReason=undefined;
await bulk.retryBook(recoveryFailed.id);
assert.equal(recoveryFailed.error,'');
assert.equal(recoverButton.hidden,true);
console.log('Watcha recovery: selective scoped retries, preserved successful results, source cooldown, accurate HTTP 503 diagnosis and failed completion state passed.');

const expiryNow=Date.now, beforeExpiry=bulkQueries.length;
try {
  Date.now=()=>expiryNow()+16*60*1000;
  await bulk.init();
} finally { Date.now=expiryNow; }
assert.equal(bulkQueries.length-beforeExpiry,3,'Expired results are queried again for the selected provider');
assert.ok(bulkQueries.slice(beforeExpiry).every(query=>query.get('action')==='availability' && query.get('sources')==='gyeonggi'));
console.log('Watcha cache expiry: fifteen-minute snapshots refresh only the selected provider.');

// An API failure must replace the cached success, including after re-entry.
await bulk.retryAll();
failAvailability=true;failureStatus=503;
const failedRefresh=bulk.getBooks()[0];
await bulk.retryBook(failedRefresh.id);
const persistedFailure=cache.get(WATCHA_PROFILES[0].id).books.find(book=>book.id===failedRefresh.id);
assert.equal(persistedFailure.result.libraries[0]?.status,'error','A failed refresh must persist its failure instead of restoring a cached success');
const beforeFailedReentry=bulkQueries.length;
await bulk.init();
assert.equal(bulkQueries.length,beforeFailedReentry,'Keep a fresh failed lookup visible until the user retries');
assert.equal(recoverButton.hidden,false,'Re-entry must retain the retry button for an API failure');
assert.match(bulk.bookMarkup(bulk.getBooks()[0]),/조회 실패/);
failAvailability=false;failureStatus=502;
await recoverButton.listeners.click();
assert.equal(recoverButton.hidden,true);

// Cache age must not make a completed lookup eligible for failed/pending-only retry.
const completedBooks=bulk.getBooks(), completedResult=structuredClone(completedBooks[0].result);
const beforeSelectiveExpiry=bulkQueries.length, selectiveNow=Date.now;
try {
  Date.now=()=>selectiveNow()+16*60*1000;
  bulk.renderBooks();
  assert.equal(recoverButton.hidden,true,'Age alone must not reveal failed/pending retry');
  completedBooks[1].error='failed';completedBooks[1].result={isbn:completedBooks[1].info.isbn,libraries:[]};
  completedBooks[2].result={isbn:completedBooks[2].info.isbn,libraries:[]};
  bulk.renderBooks();
  await recoverButton.listeners.click();
  assert.equal(bulkQueries.length-beforeSelectiveExpiry,2,'Retry failures and unqueried books without refreshing an expired success');
  assert.deepEqual(completedBooks[0].result,completedResult);
} finally { Date.now=selectiveNow; }

// API-level 429 must stop the queue and protect every loan lookup entry point.
const apiLimitedBooks=Array.from({length:12},(_,index)=>({...common,id:'bLIMIT'+index,info:{...sampleInfo,isbn:fixtureIsbn('api-limit-'+index)}}));
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:12,books:apiLimitedBooks});
failAvailability=true;failureStatus=429;
const beforeApiLimit=bulkQueries.length;
await bulk.init();
await recoverButton.listeners.click();
assert.equal(bulkQueries.length-beforeApiLimit,8,'Stop dequeuing when the API returns 429, leaving only in-flight requests');
assert.ok(bulk.getBooks().slice(0,8).every(book=>book.result.libraries[0].retryAfter===120));
const beforeImmediateRetry=bulkQueries.length;
await recoverButton.listeners.click();
await bulk.retryBook(bulk.getBooks().at(-1).id);
await bulk.retryAll();
await bulk.fillBookSources(bulk.getBooks().at(-1).id);
assert.equal(bulkQueries.length,beforeImmediateRetry,'Batch retry, another book, full checks and details must respect the provider cooldown');
assert.match(controls.get('[data-status]').textContent,/초 후 다시 시도/);
await bulk.init();
assert.equal(bulkQueries.length,beforeImmediateRetry,'Re-entry must not resume the queue during the cooldown');
assert.equal(recoverButton.hidden,false);
failAvailability=false;failureStatus=502;
const cooldownNow=Date.now;
try {
  Date.now=()=>cooldownNow()+121_000;
  await recoverButton.listeners.click();
} finally { Date.now=cooldownNow; }
assert.equal(bulkQueries.length-beforeImmediateRetry,12,'After cooldown, recover both failed and unqueried books');
assert.equal(recoverButton.hidden,true);

failureRetryAfter=undefined;failureRetryHeader='180';failAvailability=true;failureStatus=429;
await bulk.retryBook(bulk.getBooks()[0].id);
assert.equal(bulk.getBooks()[0].result.libraries.find(source=>source.id==='gyeonggi').retryAfter,180,'Honor Retry-After headers when the JSON body omits a wait');
failureRetryAfter=120;failureRetryHeader=undefined;

// A failed book-metadata request must not be confused with a confirmed missing ISBN.
bulk.setLibraries(['sejong']);
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:1,books:[{id:'bMETA00',title:'metadata failure',coverUrl:null,url:common.url}]});
failureAction='book';failureStatus=503;limitInfo=true;
await bulk.init();
assert.equal(bulk.getBooks()[0].result.isbn,null);
assert.equal(recoverButton.hidden,false,'A missing ISBN caused by an API failure must remain retryable');
const beforeMetadataRetry=bulkQueries.filter(query=>query.get('action')==='book').length;
await controls.get('[data-batch]').listeners.click();
assert.equal(bulkQueries.filter(query=>query.get('action')==='book').length-beforeMetadataRetry,1,'Full checks must also retry failed metadata, even before an ISBN exists');
failAvailability=false;failureAction='availability';failureStatus=502;limitInfo=false;
await recoverButton.listeners.click();
assert.ok(bulk.getBooks()[0].result.isbn);
assert.equal(recoverButton.hidden,true);
console.log('Watcha retry regressions: cached API failures, expired-success exclusion, API 429 queue stops and cooldown across all lookup entry points passed.');

// The visible time describes this library's loan snapshots, independently of catalogue syncs.
const loanTimeBase = Math.floor(Date.now()/60000)*60000-60000;
const loanTimeStart = new Date(loanTimeBase-120000).toISOString();
const loanTimeEnd = new Date(loanTimeBase+1000).toISOString();
const loanTimeOther = new Date(loanTimeBase+2000).toISOString();
const formatLoanTime = value => new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const timedBook = (id,checkedAt) => ({...common,id,info:{...sampleInfo,isbn:fixtureIsbn(id)},result:{isbn:fixtureIsbn(id),libraries:[
  {id:'suwon',status:'available',copies:[],checkedAt},
  {id:'gyeonggi',status:'not_held',copies:[],checkedAt:loanTimeOther},
  {id:'sejong',status:'error',copies:[],checkedAt:loanTimeEnd},
]}});
bulk.setLibraries(['millie']);
for (const [index,profile] of WATCHA_PROFILES.slice(0,2).entries()) {
  cache.set(profile.id,{version:1,storage:'firebase',kind:'wishes',total:1,checkedAt:index ? '2026-10-03T01:00:00Z' : '2026-10-04T02:00:00Z',books:[timedBook('bQUERYTIME'+index,index ? loanTimeEnd : loanTimeStart)]});
}
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id));
assert.equal(controls.get('[data-cache]').textContent,'','Manual searches have no automatic library query timestamp');
bulk.setLibraries(['suwon:141025']);
const expectedLoanRange = `선경도서관 조회 ${formatLoanTime(loanTimeStart)} ~ ${formatLoanTime(loanTimeEnd)}`;
assert.equal(controls.get('[data-cache]').textContent,expectedLoanRange,'Display actual selected-library snapshot times, not Watcha catalogue times');
bulk.renderBooks();
assert.equal(controls.get('[data-cache]').textContent,expectedLoanRange,'Rendering cached results must not advance the query time');
bulk.setLibraries(['suwon:141092']);
assert.equal(controls.get('[data-cache]').textContent,expectedLoanRange.replace('선경도서관','북수원도서관'),'Changing branch names preserves the shared city query times');
bulk.setLibraries(['millie']);
await bulk.selectProfiles(WATCHA_PROFILES.slice(0,2).map(profile=>profile.id).reverse());
bulk.setLibraries(['suwon:141025']);
assert.equal(controls.get('[data-cache]').textContent,expectedLoanRange,'Account order must not determine the displayed query time');
bulk.setLibraries(['gyeonggi']);
assert.equal(controls.get('[data-cache]').textContent,`경기도서관 조회 ${formatLoanTime(loanTimeOther)}`,'Identify the selected library and display seconds so different queries within one minute remain distinct');
bulk.setLibraries(['sejong']);
assert.equal(controls.get('[data-cache]').textContent,'국립세종도서관 조회 기록 없음','Failed requests must not claim a successful holdings lookup');
bulk.setLibraries(['yongin:MB']);
assert.equal(controls.get('[data-cache]').textContent,'수지도서관 조회 기록 없음','Unqueried libraries must not inherit another source timestamp');
bulk.setLibraries([]);
assert.equal(controls.get('[data-cache]').textContent,'');
const libraryTimeSections = [...bulk.bookInfoMarkup(timedBook('bTIMEDIALOG',loanTimeEnd)).matchAll(/<section class="watcha-library-result"[\s\S]*?<\/section>/g)].map(match=>match[0]);
assert.ok(libraryTimeSections[0].includes(`<time datetime="${loanTimeEnd}">${formatLoanTime(loanTimeEnd)}</time>`),'The Suwon card shows its own successful query time');
assert.ok(libraryTimeSections[2].includes(`<time datetime="${loanTimeOther}">${formatLoanTime(loanTimeOther)}</time>`),'The Gyeonggi card shows its different query time within the same minute');
assert.doesNotMatch(libraryTimeSections[1],/<time /,'A pending provider must not inherit another provider timestamp');
assert.doesNotMatch(libraryTimeSections[3],/<time /,'A failed provider must not display a successful query time');
console.log('Watcha query time: selected-library timestamps, browser-cache preservation, account order and failed/unqueried sources passed.');

// Completed results must reach durable storage while other requests are still pending.
bulk.setLibraries(['millie']);
const partialBooks=Array.from({length:3},(_,index)=>({...common,id:'bPARTIALCACHE'+index,info:{...sampleInfo,isbn:fixtureIsbn('partial-cache-'+index)},result:{isbn:fixtureIsbn('partial-cache-'+index),libraries:[]}}));
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',kind:'wishes',total:3,books:partialBooks});
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
bulk.setLibraries(['gyeonggi']);heldSource='gyeonggi';holdAvailability=1;
const partialLookup=bulk.fillSelectedSource();
await new Promise(resolve=>setImmediate(resolve));
try {
  const completed=bulk.getBooks().filter(book=>book.result?.libraries.some(source=>source.id==='gyeonggi'));
  assert.equal(completed.length,2,'Keep one lookup pending so the batch cannot save its final catalogue snapshot');
  assert.ok(completed.every(book=>savedLoans.get(book.result.isbn)?.libraries.some(source=>source.id==='gyeonggi')),'Persist each finished loan lookup before the batch finishes');
  assert.ok(cache.get(WATCHA_PROFILES[0].id).books.every(book=>!book.result.libraries.length),'The per-book cache must work independently of the periodic catalogue save');
} finally { releaseAvailability.shift()();await partialLookup; }
console.log('Watcha incremental cache: completed results persist before pending lookups and the catalogue save finish.');

// Shelf locations reuse loan responses; a browser cart keeps the selected branch snapshot.
const cartBook = {...common,id:'bCART01',title:'담을 책',info:{...sampleInfo,isbn:'9788937448805'},result:{isbn:'9788937448805',libraries:[{
  id:'suwon',name:'수원시 도서관',status:'available',checkedAt:new Date().toISOString(),copies:[
    {branch:'선경',branchCode:'141025',status:'available',location:'종합자료실',callNo:'326-전94ㅇ'},
    {branch:'선경',branchCode:'141025',status:'available',location:'종합자료실',callNo:'326-전94ㅇ'},
    {branch:'광교',branchCode:'141551',status:'available',location:'다른 자료실',callNo:'999-다른책'},
  ],
}]}};
cache.set(WATCHA_PROFILES[0].id,{version:1,storage:'firebase',total:1,books:[cartBook]});
bulk.setLibraries(['suwon:141025']);
await bulk.selectProfiles([WATCHA_PROFILES[0].id]);
const cartCard = bulk.bookMarkup(bulk.getCombined()[0]);
assert.match(cartCard,/title="선경 · 종합자료실 · 326-전94ㅇ"/);
assert.doesNotMatch(cartCard,/999-다른책/,'Only show shelf codes at the selected branch');
assert.equal((cartCard.match(/<p class="watcha-book__callno">326-전94ㅇ<\/p>/g)||[]).length,1,'Collapse identical copy locations');
assert.match(bulk.bookInfoMarkup(cartBook),/326-전94ㅇ/,'Details retain shelf codes');
const requestsBeforeCart = bulkQueries.length;
controls.get('[data-books]').listeners.click({target:{closest:selector=>selector==='[data-cart-book]' ? {dataset:{cartBook:cartBook.id}} : null}});
assert.equal(bulk.getCart().length,1,'The real card click adds one book');
assert.match(bulk.bookMarkup(cartBook),/aria-pressed="true"[^>]*><svg[^>]*aria-hidden="true"/);
assert.match(controls.get('[data-cart-open]')['aria-label'],/서가 1권/);
assert.match(bulk.cartItemsMarkup(),/326-전94ㅇ/);
assert.match(bulk.cartItemsMarkup(),/<article class="watcha-book"[^>]*data-cart-item="bCART01"/,'The shelf reuses the standard book card');
assert.match(bulk.cartItemsMarkup(),/첫 저자 · 둘째 저자/,'Shelf cards reuse the loaded author information');
assert.match(bulk.cartItemsMarkup(),/data-cart-library-id="suwon:141025" aria-pressed="true"/,'Shelf card actions are scoped to the shelf library');
assert.doesNotMatch(bulk.cartItemsMarkup(),/999-다른책/);
assert.doesNotMatch(bulk.cartItemsMarkup(),/청구기호/);
const cartSaved = JSON.parse(cartPreferences.get('booong:watcha-library:cart'));
assert.deepEqual(cartSaved[0].libraryIds,['suwon:141025'],'Save the exact library where the card was shelved');
assert.ok(cartSaved[0].libraries.some(source => source.id === 'suwon'));
assert.equal(cartSaved[0].libraries.find(source => source.id === 'suwon').copies.length,3,'Store city-wide copies so sibling branches can reuse them');
bulk.setLibraries(['yongin:MB']);
assert.match(bulk.cartItemsMarkup('suwon:141025'),/data-cart-library-id="suwon:141025" aria-pressed="true"/,'A different main tab must not change the shelf card action');
assert.match(bulk.cartItemsMarkup(),/담은 책이 없습니다/,'A book saved at Suwon must not appear on the Yongin shelf');
assert.match(controls.get('[data-cart-open]')['aria-label'],/서가 0권/);
assert.match(bulk.bookMarkup(cartBook),/aria-pressed="false"[^>]*><svg[^>]*aria-hidden="true"/,'The card can be added independently at another library');
assert.doesNotMatch(bulk.cartItemsMarkup(),/선경도서관|326-전94ㅇ/,'Do not leak the previous branch when switching providers');
await bulk.fillCartLibrary('yongin:MB');
assert.equal(bulkQueries.length,requestsBeforeCart,'Adding, displaying and switching cart context make no API requests');
preferences.set('booong:watcha-library:cart',JSON.stringify([...cartSaved,{id:'invalid',title:'bad',libraries:[]},null]));
const restoredCart = await createFavoritePage();
assert.equal(restoredCart.getCart().length,1,'Restore a valid cart after page recreation and ignore invalid entries');
assert.match(restoredCart.cartItemsMarkup('suwon:141025'),/담을 책/,'Saved cart is independent of the currently loaded accounts');
assert.match(restoredCart.cartItemsMarkup('suwon:141025'),/326-전94ㅇ/);
assert.deepEqual(restoredCart.getCart()[0].libraryIds,['suwon:141025'],'Restore library-specific membership');
restoredCart.toggleCart(cartBook.id,'suwon:141025');
assert.deepEqual(JSON.parse(preferences.get('booong:watcha-library:cart')),[],'Removing saves the empty cart');
assert.match(restoredCart.cartItemsMarkup(),/담은 책이 없습니다/);

assert.match(bulk.cartItemsMarkup('suwon:141551'),/담은 책이 없습니다/,'Sibling branches have independent shelves even when they share cached holdings');
bulk.toggleCart(cartBook.id,'suwon:141551');
assert.match(bulk.cartItemsMarkup('suwon:141551'),/다른 자료실/);
assert.match(bulk.cartItemsMarkup('suwon:141551'),/999-다른책/);
assert.doesNotMatch(bulk.cartItemsMarkup('suwon:141551'),/종합자료실|326-전94ㅇ/,'Switching shelf branches changes both location and number');
const beforeSiblingShelf = bulkQueries.length;
await bulk.fillCartLibrary('suwon:141551');
assert.equal(bulkQueries.length,beforeSiblingShelf,'Fresh city responses need no extra request for sibling shelf branches');
loanResults.delete(cartBook.result.isbn);
bulk.getCart()[0].libraries = structuredClone(cartBook.result.libraries);
bulk.getBooks()[0].result = structuredClone(cartBook.result);
const beforeShelfProvider = bulkQueries.length;
bulk.toggleCart(cartBook.id,'sejong');
holdAvailability=1;heldSource='sejong';
const shelfLoading=bulk.fillCartLibrary('sejong');
const lateShelfBook=structuredClone(cartBook);lateShelfBook.result={isbn:cartBook.result.isbn,libraries:[]};
bulk.getBooks().push(lateShelfBook);
assert.equal(releaseAvailability.length,1);
releaseAvailability.shift()();await shelfLoading;
assert.ok(lateShelfBook.result.libraries.some(source=>source.id==='sejong'),'A catalogue loaded during a shelf lookup receives its fresh result');
bulk.getBooks().pop();
heldSource='gyeonggi';
const shelfQueries = bulkQueries.slice(beforeShelfProvider);
assert.equal(shelfQueries.length,1,'Look up only the one saved book at the selected new provider');
assert.equal(shelfQueries[0].get('action'),'availability');
assert.equal(shelfQueries[0].get('sources'),'sejong');
assert.match(bulk.cartItemsMarkup('sejong'),/국립세종도서관/);
assert.doesNotMatch(bulk.cartItemsMarkup('sejong'),/326-전94ㅇ|종합자료실/);
assert.ok(JSON.parse(cartPreferences.get('booong:watcha-library:cart'))[0].libraries.some(source => source.id === 'sejong'),'Save each provider lookup locally');
const beforeCachedShelf = bulkQueries.length;
await bulk.fillCartLibrary('sejong');
assert.equal(bulkQueries.length,beforeCachedShelf,'Reopening the same provider reuses its fresh result');
failAvailability=true;failureStatus=429;failureAction='availability';failureReason='source_rate_limited';
await bulk.fillCartLibrary('sejong',true);
assert.match(bulk.cartItemsMarkup('sejong'),/조회 실패|도서관 원문/,'Failed shelf lookups must not claim successful loan states');
const beforeShelfCooldown=bulkQueries.length;
await bulk.fillCartLibrary('sejong',true);
assert.equal(bulkQueries.length,beforeShelfCooldown,'Shelf refresh must honor provider cooldowns');
failAvailability=false;failureStatus=502;failureReason=undefined;
const shelfCopy = bulk.getCart()[0].libraries.find(source => source.id === 'suwon').copies[0];
shelfCopy.status='unavailable';shelfCopy.label='대출중';
bulk.getBooks()[0].result.libraries = [];
loanResults.delete(cartBook.result.isbn);
assert.match(bulk.cartItemsMarkup('suwon:141025'),/대출중/,'Shelves keep the location and number for loaned copies too');

bulk.setLibraries(['gyeonggi']);
bulk.toggleCart(cartBook.id);
assert.match(bulk.cartItemsMarkup('gyeonggi'),/담을 책/,'Adding on the Gyeonggi tab adds to the Gyeonggi shelf');
assert.match(controls.get('[data-cart-open]')['aria-label'],/서가 1권/);
bulk.setLibraries(['millie']);
assert.doesNotMatch(bulk.cartItemsMarkup(),/담을 책/,'The new Gyeonggi entry must not appear at Millie');
assert.match(controls.get('[data-cart-open]')['aria-label'],/서가 0권/);
bulk.setLibraries(['sejong']);
bulk.toggleCart(cartBook.id,'gyeonggi');
assert.doesNotMatch(bulk.cartItemsMarkup('gyeonggi'),/담을 책/);
assert.match(bulk.cartItemsMarkup('sejong'),/담을 책/,'Removing from one shelf preserves the other library memberships');
assert.match(controls.get('[data-cart-open]')['aria-label'],/서가 1권/,'Removing from another library does not change the main tab count');
assert.match(bulk.bookMarkup(cartBook),/aria-pressed="true"[^>]*><svg[^>]*aria-hidden="true"/,'The main tab icon remains shelved after removal elsewhere');
for (const libraryId of [...bulk.getCart()[0].libraryIds]) bulk.toggleCart(cartBook.id,libraryId);
assert.equal(bulk.getCart().length,0,'Repeated toggle removes rather than duplicates the book');
const legacyIsbn=fixtureIsbn('legacy-shelf');
preferences.set('booong:watcha-library:cart',JSON.stringify([{id:'bLEGACY',title:'이전 서가',isbn:legacyIsbn,libraries:[{...cartSaved[0].libraries.find(source=>source.id==='suwon'),id:'suwon:141025',copies:cartBook.result.libraries[0].copies.slice(0,2)}]}]));
const legacyShelf=await createFavoritePage();
assert.match(legacyShelf.cartItemsMarkup('suwon:141025'),/종합자료실/,'Restore the previous branch-only shelf format');
assert.match(legacyShelf.cartItemsMarkup('suwon:141025'),/326-전94ㅇ/);
assert.doesNotMatch(legacyShelf.cartItemsMarkup('suwon:141551'),/326-전94ㅇ/,'Legacy snapshots must never be shown at the wrong branch');
assert.deepEqual(legacyShelf.getCart()[0].libraryIds,['suwon:141025'],'Old branch-only entries retain their original shelf');
preferences.set('booong:watcha-library:regions','["gyeonggi"]');
preferences.set('booong:watcha-library:cart',JSON.stringify([{id:'bOLDCTY',title:'기존 공용 서가',isbn:legacyIsbn,libraries:cartSaved[0].libraries}]));
const migratedShelf=await createFavoritePage();
assert.deepEqual(migratedShelf.getCart()[0].libraryIds,['gyeonggi'],'Legacy shared entries are preserved under the currently selected library');
preferences.set('booong:watcha-library:regions','["sejong"]');
assert.deepEqual((await createFavoritePage()).getCart()[0].libraryIds,['gyeonggi'],'Persist migration so later library selection cannot move old books');
preferences.set('booong:watcha-library:cart','broken JSON');
assert.equal((await createFavoritePage()).getCart().length,0,'Damaged browser storage must not break the page');
console.log('Watcha shelf/cart: same-response call numbers, branch isolation, deduplication, card clicks, persistence, removal and no extra requests passed.');
