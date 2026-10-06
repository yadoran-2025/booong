import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { readFile } from 'node:fs/promises';
import { WATCHA_FIREBASE } from '../js/watcha-firebase-config.js';
import { WATCHA_PROFILES } from '../js/watcha-library-data.js';
import { watchaDatabase, readWatchaRecord } from '../lib/watcha-storage.js';
import { sharedCollection, sharedBook, sharedAvailability, saveWatchaCorrection, sharedSyncHistory } from '../lib/watcha-shared.js';
import { importWatchaCache, validateWatchaImport } from '../lib/watcha-import.js';

const {privateKey,publicKey} = await generateKeyPair('RS256',{extractable:true});
const savedEnv = process.env.FIREBASE_WATCHA_SERVER, originalFetch = fetch;
const credential = {type:'service_account',project_id:'yadoran-2025',client_email:'watcha-cache@yadoran-2025.iam.gserviceaccount.com',private_key:await exportPKCS8(privateKey)};
process.env.FIREBASE_WATCHA_SERVER = Buffer.from(JSON.stringify({...credential,project_id:'unrelated'})).toString('base64');
await assert.rejects(watchaDatabase('books'),/Wrong watcha/);
process.env.FIREBASE_WATCHA_SERVER = Buffer.from(JSON.stringify(credential)).toString('base64');
const data = {}, writes = [], reads = [], counts = {auth:0,wishes:0,detail:0,suwon:0,gyeonggi:0,ratings:0};
let ratedList=['bSHARED','bRATED1'], failRatedPage=false;
let list = ['bSHARED','bFIRST1'], failPage = false, libraryFailure = false, catalogueFailure = false, loan = 'OK';
const isbn = '9788937448805';
const titles = {};
let onWishlist;
function get(path) { return path.split('/').filter(Boolean).reduce((value,key) => value?.[key],data) ?? null; }
function put(path,value) { const keys = path.split('/').filter(Boolean), key = keys.pop(); let parent = data; for (const part of keys) parent = parent[part] ||= {}; parent[key] = structuredClone(value); }
globalThis.fetch = async (input,options = {}) => {
  const url = new URL(input);
  if (url.hostname === 'identitytoolkit.googleapis.com') {
    counts.auth++;
    const {payload} = await jwtVerify(JSON.parse(options.body).token,publicKey,{issuer:credential.client_email,audience:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit'});
    assert.equal(payload.uid,'watcha-cache-server'); assert.equal(payload.claims.watchaCache,true);
    return Response.json({idToken:'test-session',expiresIn:'3600'});
  }
  if (url.origin === WATCHA_FIREBASE.databaseURL) {
    assert.equal(url.searchParams.get('auth'),'test-session');
    assert.match(url.pathname,/^\/watcha(?:\/[A-Za-z0-9_-]+)*\.json$/);
    const path = url.pathname.slice('/watcha'.length,-'.json'.length).replace(/^\//,'');
    if (!options.method || options.method === 'GET') {reads.push(path);return catalogueFailure && path === 'books' ? new Response(null,{status:503}) : Response.json(get(path));}
    if (options.headers['if-match'] === 'null_etag' && get(path) !== null) return new Response('already exists',{status:412});
    const value = JSON.parse(options.body); writes.push({path,value});
    if (options.method === 'PUT') put(path,value);
    else { assert.equal(path,''); for (const [key,record] of Object.entries(value)) put(key,record); }
    assert.equal(url.searchParams.get('print'),'silent','Writes suppress Firebase response payloads');
    return new Response(null,{status:204});
  }
  if (url.pathname.endsWith('/ratings')) {
    counts.ratings++;
    const profile=url.pathname.split('/')[3],page=Number(url.searchParams.get('page'));
    assert.equal(url.searchParams.get('order'),'recent');
    if(failRatedPage && page===2)return new Response('failed',{status:503});
    const codes=profile===WATCHA_PROFILES[1].id ? ['bSHARED'] : ratedList;
    return Response.json({metadata:{total_count:codes.length},result:{next_uri:page*20<codes.length ? `${url.pathname}?order=recent&page=${page+1}&size=20` : null,result:codes.slice((page-1)*20,page*20).map(code=>({content:{code,title:code,year:2026,content_type:'books'},user_content_action:{user_code:profile,content_code:code,rating:profile===WATCHA_PROFILES[1].id?6:9}}))}});
  }
  if (url.pathname.endsWith('/wishes')) {
    counts.wishes++;
    await onWishlist?.();
    const profile = url.pathname.split('/')[3], page = Number(url.searchParams.get('page'));
    if (failPage && page === 2) return new Response('failed',{status:503});
    const codes = profile === WATCHA_PROFILES[1].id ? ['bSHARED'] : list;
    return Response.json({metadata:{total_count:codes.length},result:{next_uri:page * 20 < codes.length ? `${url.pathname}?page=${page+1}` : null,result:codes.slice((page-1)*20,page*20).map(code=>({content:{code,title:titles[code] || code,year:2026,content_type:'books'}}))}});
  }
  if (url.hostname === 'pedia.watcha.com') {
    counts.detail++;
    const kyobo = Buffer.from(`https://product.kyobobook.co.kr/detail?barcode=${isbn}`).toString('base64url');
    const metadata = {'@type':'Book',url:input,genre:url.pathname.endsWith('bSHARED') ? ['사회과학'] : []};
    return new Response(`<h1>책</h1><a href="https://redirect.watcha.com/galaxy/${kyobo}">구매</a><script type="application/ld+json">${JSON.stringify(metadata)}</script>`);
  }
  if (url.hostname === 'mob.suwonlib.go.kr') {
    counts.suwon++;
    return libraryFailure ? new Response('failed',{status:503}) : Response.json({libList:[],bookList:[{ISBN:isbn,LIB_NAME:'선경',MANAGE_CODE:'141025',LOAN_CODE:loan}]});
  }
  if (url.hostname === 'www.library.kr') { counts.gyeonggi++; return Response.json({RESULT:'NO_DATA'}); }
  throw new Error('Unexpected source: ' + url.hostname);
};
try {
  assert.deepEqual(await sharedSyncHistory(),{lastFullSyncAt:null});
  const recorded=await sharedSyncHistory(true);
  assert.ok(Number.isFinite(Date.parse(recorded.lastFullSyncAt)));
  assert.deepEqual(await sharedSyncHistory(),recorded,'Shared history survives a separate request');
  assert.deepEqual(JSON.parse(data.sync.lastFullSync),recorded);
  assert.equal(counts.wishes,0,'History reads/writes never sync wishlists');
  assert.ok(writes.every(entry=>entry.path==='sync/lastFullSync'),'History stays within the Watcha resource');
  writes.length=0;
  await assert.rejects(watchaDatabase('../other'));
  await assert.rejects(watchaDatabase('.settings/rules'));
  const first = await sharedCollection(WATCHA_PROFILES[0].id,['suwon']);
  assert.equal(reads.filter(path=>path==='books').length,1,'List sync reuses one catalogue download');
  assert.equal(first.total,2); assert.equal(first.storage,'firebase');
  await sharedCollection(WATCHA_PROFILES[1].id,['suwon']);
  assert.equal(Object.keys(data.books).length,2,'Both profiles share the same book keys');
  const before = {...counts}, writeCount = writes.length;
  await sharedCollection(WATCHA_PROFILES[0].id,['suwon']);
  assert.deepEqual(counts,before,'A stored list makes no upstream requests');
  assert.equal(writes.length,writeCount,'Reading does not rewrite the snapshot');
  const catalogueReads = reads.filter(path=>path==='books').length;
  await sharedCollection(WATCHA_PROFILES[1].id,['suwon']);
  await sharedCollection(WATCHA_PROFILES[0].id,['suwon']);
  assert.equal(reads.filter(path=>path==='books').length,catalogueReads,'Sequential profiles reuse the completed catalogue download');
  const realNow = Date.now;
  try {
    const cachedAt = realNow();
    Date.now = () => cachedAt + 59*60*1000;
    await sharedCollection(WATCHA_PROFILES[0].id);
    assert.equal(reads.filter(path=>path==='books').length,catalogueReads,'The catalogue is still reused after 59 minutes');
    const later = cachedAt + 61*60*1000;
    Date.now = () => later;
    catalogueFailure = true;
    await assert.rejects(sharedCollection(WATCHA_PROFILES[0].id),/database unavailable/);
    catalogueFailure = false;
    await sharedCollection(WATCHA_PROFILES[0].id);
    assert.equal(reads.filter(path=>path==='books').length,catalogueReads+2,'Expired catalogues reload, and failed downloads can be retried');
  } finally { Date.now = realNow; catalogueFailure = false; }
  const unchangedWrites = writes.length;
  await sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true);
  assert.deepEqual(Object.keys(writes[unchangedWrites].value),[`profiles/${WATCHA_PROFILES[0].id}`],'Unchanged wishlist updates only its check timestamp');
  titles.bFIRST1 = 'Changed title';
  const changedWrites = writes.length;
  const changed = await sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true);
  assert.equal(changed.books[1].title,'Changed title');
  assert.deepEqual(Object.keys(writes[changedWrites].value),['books/bFIRST1/listing',`profiles/${WATCHA_PROFILES[0].id}`],'Only the changed book and account snapshot are written');
  await Promise.all([sharedBook('bSHARED'),sharedBook('bSHARED')]);
  assert.equal(counts.detail,1,'Coalesce simultaneous detail requests');
  assert.deepEqual((await sharedBook('bSHARED')).info.authors,[],'Preserve empty arrays in Firebase');
  assert.deepEqual((await readWatchaRecord('books/bSHARED/detail')).info.genres,['사회과학'],'Persist Watcha genres alongside ISBN and book information');
  assert.deepEqual((await sharedCollection(WATCHA_PROFILES[1].id)).books[0].info.genres,['사회과학'],'Return saved genres with the shared collection');
  const wishSnapshot=get(`profiles/${WATCHA_PROFILES[0].id}`);
  const ratedFirst=await sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true,'ratings');
  const ratedOther=await sharedCollection(WATCHA_PROFILES[1].id,['suwon'],true,'ratings');
  assert.equal(ratedFirst.books.find(book=>book.id==='bSHARED').rating,4.5);
  assert.equal(ratedOther.books[0].rating,3,'The same book keeps each person rating independently');
  assert.equal(get(`profiles/${WATCHA_PROFILES[0].id}`),wishSnapshot,'Rated sync preserves wishlist membership');
  assert.equal(JSON.parse(get('books/bSHARED/listing')).rating,undefined,'Personal ratings never leak into shared book metadata');
  const beforeRatedCounts={...counts};
  await sharedCollection(WATCHA_PROFILES[0].id,['suwon'],false,'ratings');
  assert.deepEqual(counts,beforeRatedCounts,'Stored rated membership does not re-fetch the public source');
  const ratedSnapshot=get(`ratedProfiles/${WATCHA_PROFILES[0].id}`),ratedWrites=writes.length;
  ratedList=Array.from({length:21},(_,index)=>'bR'+String(index).padStart(5,'0'));failRatedPage=true;
  await assert.rejects(sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true,'ratings'));
  assert.equal(get(`ratedProfiles/${WATCHA_PROFILES[0].id}`),ratedSnapshot);
  assert.equal(writes.length,ratedWrites,'Incomplete rated pagination never commits partial membership or ratings');
  ratedList=['bSHARED','bRATED1'];failRatedPage=false;
  const loanReads = reads.length, loanWrites = writes.length;
  await sharedAvailability(isbn,['suwon']);
  loan = 'OUT_ON_LOAN';
  assert.equal((await sharedAvailability(isbn,['suwon']))[0].status,'unavailable');
  assert.equal(counts.suwon,2,'Every completed lookup requests the current library status again');
  assert.equal(counts.gyeonggi,0,'Never query unselected sources');
  assert.equal(reads.length,loanReads,'Live loans never read Firebase');
  assert.equal(writes.length,loanWrites,'Live loans never write Firebase');
  libraryFailure = true;
  assert.equal((await sharedAvailability(isbn,['suwon']))[0].status,'error','Failed live lookups never fall back to a successful old status');
  libraryFailure = false;
  put(`availability/suwon/${isbn}`,JSON.stringify({id:'suwon',status:'available'}));
  const legacy = {profile:WATCHA_PROFILES[0].id,books:[{id:'bFIRST1',result:{isbn,libraries:[{id:'suwon',status:'available',sourceUrl:'https://mob.suwonlib.go.kr/search'}]}}]};
  const importWrites = writes.length;
  assert.equal((await importWatchaCache(legacy)).imported,1,'Migrate only missing ISBN/book details');
  assert.ok(writes.slice(importWrites).every(write=>!write.path.startsWith('availability/')),'Legacy imports never persist loan results');
  const oldAvailabilityReads = reads.filter(path=>path.startsWith('availability')).length;
  assert.equal((await sharedCollection(WATCHA_PROFILES[0].id,['suwon'])).books[0].result.libraries.length,0,'Ignore existing Firebase loan caches');
  assert.equal(reads.filter(path=>path.startsWith('availability')).length,oldAvailabilityReads);
  assert.equal((await importWatchaCache(legacy)).imported,0,'Repeat migration never duplicates book details');
  assert.equal((await sharedBook('bFIRST1')).info.authors.length,0,'An ISBN-only migration still fetches missing book metadata');
  assert.throws(()=>validateWatchaImport({...legacy,books:[{...legacy.books[0],id:'../other'}]}));
  assert.deepEqual(validateWatchaImport({...legacy,books:[{...legacy.books[0],result:{isbn,libraries:[{sourceUrl:'javascript:alert(1)'}]}}]})[0].libraries,undefined,'Loan fields are ignored entirely');
  assert.throws(()=>validateWatchaImport({...legacy,books:Array(26).fill(legacy.books[0])}));
  assert.throws(()=>validateWatchaImport({...legacy,profile:'unregistered'}));
  await saveWatchaCorrection('bSHARED','9780804429573');
  list = ['bNEW001'];
  const refreshed = await sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true);
  assert.deepEqual(refreshed.books.map(book=>book.id),list,'Account membership reflects removals');
  const other = await sharedCollection(WATCHA_PROFILES[1].id,['suwon']);
  assert.equal(other.books[0].manualIsbn,'9780804429573','Shared corrections and books survive removal from another profile');
  assert.equal(other.books[0].result.libraries.length,0,'Never attach results from the old ISBN to a corrected edition');
  list = ['bCONCUR'];
  let releaseWishlist;
  const wishlistStarted = new Promise(resolve => {onWishlist = () => {resolve(); return new Promise(release => {releaseWishlist = release;});};});
  const concurrentOne = sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true);
  await wishlistStarted;
  const concurrentReads = reads.length;
  const concurrentTwo = sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true);
  while (reads.length < concurrentReads + 1) await new Promise(resolve => setTimeout(resolve,0));
  await new Promise(resolve => setTimeout(resolve,0));
  onWishlist = undefined; releaseWishlist();
  const concurrentResults = await Promise.all([concurrentOne,concurrentTwo]);
  assert.deepEqual(concurrentResults.map(result=>result.books.map(book=>book.id)),[['bCONCUR'],['bCONCUR']],'Coalesced sync applies new listings to each caller catalogue');
  const oldSnapshot = get(`profiles/${WATCHA_PROFILES[0].id}`), oldWrites = writes.length;
  list = Array.from({length:21},(_,index)=>'b'+String(index).padStart(6,'0')); failPage = true;
  await assert.rejects(sharedCollection(WATCHA_PROFILES[0].id,['suwon'],true));
  assert.equal(get(`profiles/${WATCHA_PROFILES[0].id}`),oldSnapshot);
  assert.equal(writes.length,oldWrites,'Incomplete pagination must not commit any memberships');
  assert.equal(counts.auth,2,'Reuse the server session and renew it after expiry without disclosing it to clients');
  const cacheSource = (await readFile(new URL('../js/watcha-library-cache.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'') + '\nreturn {readCache,writeCache,cachedSnapshot,writeLoanCache};';
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  let requested;
  const browserCache = await new AsyncFunction('adminFetch','location','fetch','indexedDB',cacheSource)(async url => {requested = new URL(url,'https://booong.example'); return Response.json(first);},{hostname:'booong.example'},null,{open(){throw new Error('Unavailable local storage');}});
  const cloud = await browserCache.readCache(WATCHA_PROFILES[0].id,{sources:'suwon',refresh:true});
  assert.equal(cloud.storage,'firebase'); assert.equal(requested.searchParams.get('refresh'),'1');
  assert.equal(requested.searchParams.get('sources'),'suwon'); assert.equal(requested.searchParams.has('preview'),false);
  const browserStore = new Map([[WATCHA_PROFILES[0].id,{version:1,...structuredClone(first),cloudMigrated:true,cloudFetchedAt:Date.now()}]]);
  const loanStore = new Map();
  const storeNames=new Set(['profiles']);let schemaVersion=1;
  const fakeDb = {close(){},objectStoreNames:{contains:name=>storeNames.has(name)},createObjectStore(name){assert.ok(!storeNames.has(name));storeNames.add(name);},transaction(storeName){
    const store = storeName === 'loans' ? loanStore : browserStore;
    const transaction = {objectStore:()=>({getAll:()=>({result:structuredClone([...store.values()])}),get:id=>({result:structuredClone(store.get(id))}),put:(value,id)=>{store.set(id,structuredClone(value));return {result:id}}})};
    queueMicrotask(()=>transaction.oncomplete());return transaction;
  }};
  const fakeIndexedDB = {open(name,version){assert.equal(name,'booong-watcha-library');const request={result:fakeDb};queueMicrotask(()=>{if(version>schemaVersion){request.onupgradeneeded();schemaVersion=version;}request.onsuccess();});return request;}};
  let browserRequests=0, browserFailure=false, reply=structuredClone(first);
  const cachedBrowser = await new AsyncFunction('adminFetch','location','fetch','indexedDB',cacheSource)(async url=>{
    browserRequests++;requested=new URL(url,'https://booong.example');
    return browserFailure ? new Response(null,{status:503}) : Response.json(reply);
  },{hostname:'booong.example'},null,fakeIndexedDB);
  assert.equal((await cachedBrowser.readCache(WATCHA_PROFILES[0].id)).fromBrowserCache,true);
  assert.equal(schemaVersion,2);assert.deepEqual([...storeNames],['profiles','loans'],'Upgrade the existing browser cache without recreating its catalogue store');
  assert.equal(browserRequests,0,'Fresh browser cache avoids Firebase and API reads');
  await cachedBrowser.readCache(WATCHA_PROFILES[0].id,{refresh:true});
  assert.equal(browserRequests,1,'Explicit list sync bypasses the browser cache');
  assert.equal(requested.searchParams.get('refresh'),'1');
  browserStore.get(WATCHA_PROFILES[0].id).cloudFetchedAt=Date.now()-16*60*1000;
  await cachedBrowser.readCache(WATCHA_PROFILES[0].id);
  assert.equal(browserRequests,2,'Expired snapshots fetch the shared list again');
  const stored=browserStore.get(WATCHA_PROFILES[0].id);
  stored.books[0].result={isbn,libraries:[{id:'suwon',status:'available'},{id:'gyeonggi',status:'not_held'}]};
  reply.books[0].result={isbn,libraries:[{id:'suwon',status:'unavailable'}]};
  const merged=await cachedBrowser.readCache(WATCHA_PROFILES[0].id,{refresh:true});
  assert.deepEqual(merged.books[0].result.libraries,[],'Discard both server and legacy browser loan results');
  assert.deepEqual(browserStore.get(WATCHA_PROFILES[0].id).books[0].result.libraries,[],'Only book metadata is written to IndexedDB');
  const repeat=await cachedBrowser.readCache(WATCHA_PROFILES[0].id);
  assert.deepEqual(repeat.books[0].result.libraries,[],'Browser cache fast path cannot restore old loan statuses');
  const loanSnapshot=structuredClone(repeat);
  const loanTime=new Date().toISOString();
  loanSnapshot.books[0].result={isbn,libraries:[
    {id:'suwon',status:'available',copies:[{branchCode:'141025',status:'available'}],checkedAt:loanTime},
    {id:'gyeonggi',status:'not_held',copies:[],checkedAt:new Date(Date.now()-16*60*1000).toISOString()},
  ]};
  await cachedBrowser.writeCache(WATCHA_PROFILES[0].id,loanSnapshot);
  const beforeReload=browserRequests;
  const reloadedBrowser=await new AsyncFunction('adminFetch','location','fetch','indexedDB',cacheSource)(async()=>{browserRequests++;throw new Error('Unexpected request');},{hostname:'booong.example'},null,fakeIndexedDB);
  const reloaded=await reloadedBrowser.readCache(WATCHA_PROFILES[0].id);
  assert.equal(browserRequests,beforeReload,'Reloading restores persisted fresh results without a request');
  assert.deepEqual(reloaded.books[0].result.libraries.map(source=>source.id),['suwon'],'Expire each provider separately');
  assert.equal(reloaded.books[0].result.libraries[0].checkedAt,loanTime,'Reusing a snapshot must not reset its check time');
  reloaded.books[0].result.libraries[0].copies[0].status='unavailable';
  assert.equal((await reloadedBrowser.readCache(WATCHA_PROFILES[0].id)).books[0].result.libraries[0].copies[0].status,'available','Rendered books cannot mutate the shared ISBN cache');
  const sameEdition=reloadedBrowser.cachedSnapshot({books:[{id:'bOTHER1',info:{isbn},rating:4.5}]}).books[0];
  assert.equal(sameEdition.result.libraries[0].status,'available','The same edition shares fresh results across reading modes');
  assert.equal(sameEdition.rating,4.5,'Loan reuse preserves personal ratings');
  const correctedEdition=reloadedBrowser.cachedSnapshot({books:[{id:'bOTHER1',manualIsbn:'9780804429573',result:reloaded.books[0].result}]}).books[0];
  assert.equal(correctedEdition.result.isbn,'9780804429573');
  assert.deepEqual(correctedEdition.result.libraries,[],'Corrected editions cannot inherit another ISBN’s results');
  const loanNow=Date.now;
  try {
    Date.now=()=>loanNow()+16*60*1000;
    assert.deepEqual(reloadedBrowser.cachedSnapshot(reloaded).books[0].result.libraries,[],'Loans expire after fifteen minutes even in memory');
  } finally { Date.now=loanNow; }
  const wishLocal=structuredClone(browserStore.get(WATCHA_PROFILES[0].id));
  reply=structuredClone(ratedFirst);
  const ratedLocal=await cachedBrowser.readCache(WATCHA_PROFILES[0].id,{kind:'ratings'});
  assert.equal(requested.searchParams.get('kind'),'ratings');
  assert.equal(ratedLocal.books[0].rating,4.5);
  assert.equal(browserStore.get('ratings:'+WATCHA_PROFILES[0].id).kind,'ratings');
  assert.deepEqual(browserStore.get(WATCHA_PROFILES[0].id),wishLocal,'Rated browser snapshots preserve wishlist snapshots');
  const beforeCachedRated=browserRequests;
  assert.equal((await cachedBrowser.readCache(WATCHA_PROFILES[0].id,{kind:'ratings'})).fromBrowserCache,true);
  assert.equal(browserRequests,beforeCachedRated);
  reply=structuredClone(first);
  browserFailure=true;
  const preserved=structuredClone(browserStore.get(WATCHA_PROFILES[0].id));
  assert.equal((await cachedBrowser.readCache(WATCHA_PROFILES[0].id,{refresh:true})).storage,'offline');
  assert.deepEqual(browserStore.get(WATCHA_PROFILES[0].id),preserved,'Failed sync retains the last complete local snapshot and its expiry');

  // Reload the actual browser cache after a failed lookup; no Firebase calls are needed.
  const failureProfile='retry-audit';
  const failureSnapshot={version:1,total:1,cloudMigrated:true,cloudFetchedAt:Date.now(),books:[{id:'bAUDIT0',result:{isbn,libraries:[{id:'suwon',status:'available',checkedAt:new Date().toISOString()}]}}]};
  await cachedBrowser.writeCache(failureProfile,failureSnapshot);
  const failedSnapshot=structuredClone(failureSnapshot);
  failedSnapshot.books[0].error='HTTP 503';
  failedSnapshot.books[0].result.libraries=[{id:'suwon',status:'error',message:'HTTP 503',errorCode:'service_unavailable',checkedAt:new Date().toISOString()}];
  await cachedBrowser.writeCache(failureProfile,failedSnapshot);
  const failureBrowser=await new AsyncFunction('adminFetch','location','fetch','indexedDB',cacheSource)(async()=>{throw new Error('Unexpected API call');},{hostname:'booong.example'},null,fakeIndexedDB);
  assert.equal((await failureBrowser.readCache(failureProfile)).books[0].result.libraries[0].status,'error','A fresh browser module must restore the failure rather than the former success');

  const noIsbnFailure={...failureSnapshot,books:[{id:'bNOISBN',result:{isbn:null,libraries:[{id:'suwon',status:'error',errorCode:'rate_limited',retryAfter:1800,checkedAt:new Date().toISOString()}]}}]};
  await cachedBrowser.writeCache(failureProfile,noIsbnFailure);
  assert.equal((await failureBrowser.readCache(failureProfile)).books[0].result.libraries[0]?.retryAfter,1800,'Keep an API failure even before ISBN metadata is available');
  const longCooldownNow=Date.now;
  try {
    Date.now=()=>longCooldownNow()+16*60*1000;
    const longCooldown={...failureSnapshot,cloudFetchedAt:Date.now(),books:[{id:'bCOOLD0',result:{isbn,libraries:[{id:'suwon',status:'error',errorCode:'rate_limited',retryAfter:1800,checkedAt:new Date(longCooldownNow()).toISOString()}]}}]};
    await cachedBrowser.writeCache(failureProfile,longCooldown);
    assert.equal((await failureBrowser.readCache(failureProfile)).books[0].result.libraries[0]?.retryAfter,1800,'A thirty-minute cooldown must survive the fifteen-minute loan-cache expiry');
  } finally { Date.now=longCooldownNow; }

  // A fresh page restores a completed book even before its collection batch is saved.
  const incrementalIsbn='9780804429573', incrementalProfile='incremental-cache-audit';
  const incrementalTime=new Date(Date.now()-2000).toISOString(), otherTime=new Date(Date.now()-1000).toISOString();
  const incrementalCatalogue={version:1,storage:'firebase',kind:'wishes',total:1,cloudMigrated:true,cloudFetchedAt:Date.now(),books:[{id:'bINCREMENTAL',info:{isbn:incrementalIsbn},result:{isbn:incrementalIsbn,libraries:[]}}]};
  browserStore.set(incrementalProfile,structuredClone(incrementalCatalogue));
  await cachedBrowser.writeLoanCache({isbn:incrementalIsbn,libraries:[{id:'suwon',status:'available',copies:[],checkedAt:incrementalTime}]});
  assert.deepEqual(browserStore.get(incrementalProfile),incrementalCatalogue,'Immediate loan saves do not rewrite the whole catalogue');
  const incrementalRequests=browserRequests;
  const createReloadedCache=()=>new AsyncFunction('adminFetch','location','fetch','indexedDB',cacheSource)(async()=>{browserRequests++;throw new Error('Unexpected API request');},{hostname:'booong.example'},null,fakeIndexedDB);
  const incrementalBrowser=await createReloadedCache();
  const incrementalReload=await incrementalBrowser.readCache(incrementalProfile);
  assert.equal(browserRequests,incrementalRequests,'Reloading an unfinished batch reuses completed results without an API request');
  assert.equal(incrementalReload.books[0].result.libraries[0].checkedAt,incrementalTime);
  await incrementalBrowser.writeLoanCache({isbn:incrementalIsbn,libraries:[{id:'gyeonggi',status:'not_held',copies:[],checkedAt:otherTime}]});
  const providerReload=await (await createReloadedCache()).readCache(incrementalProfile);
  assert.deepEqual(providerReload.books[0].result.libraries.map(source=>[source.id,source.checkedAt]),[['suwon',incrementalTime],['gyeonggi',otherTime]],'Saving another provider preserves each provider result and its original time across reloads');
  await incrementalBrowser.writeLoanCache({isbn:incrementalIsbn,libraries:[{id:'suwon',status:'error',errorCode:'service_unavailable',checkedAt:new Date().toISOString()}]});
  const failureReload=await (await createReloadedCache()).readCache(incrementalProfile);
  assert.equal(failureReload.books[0].result.libraries.find(source=>source.id==='suwon').status,'error','An immediate failed retry replaces the older success after reloading');
  assert.equal(failureReload.books[0].result.libraries.find(source=>source.id==='gyeonggi').checkedAt,otherTime);
  const persistedLoanNow=Date.now;
  try {
    Date.now=()=>persistedLoanNow()+16*60*1000;
    browserStore.get(incrementalProfile).cloudFetchedAt=Date.now();
    const expiredLoans=await (await createReloadedCache()).readCache(incrementalProfile);
    assert.deepEqual(expiredLoans.books[0].result.libraries,[],'Persisted per-book results must still expire after fifteen minutes');
  } finally { Date.now=persistedLoanNow; }
  console.log('Watcha browser cache: zero requests on repeat reads, explicit refresh, expiry, discarded loan statuses and failed-sync preservation passed.');
  console.log('Watcha Firebase: isolated credentials and paths, shared deduplication, live loans without reads/writes, corrections, empty arrays, failed-sync protection and cloud cache reads passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (savedEnv === undefined) delete process.env.FIREBASE_WATCHA_SERVER; else process.env.FIREBASE_WATCHA_SERVER = savedEnv;
}
