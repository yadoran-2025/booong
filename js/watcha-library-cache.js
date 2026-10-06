import { adminFetch } from './admin.js';
// Loan snapshots stay in this browser; Firebase continues to store only catalogues.
const browserCacheAge = 15 * 60 * 1000;
const loanResults = new Map();
let restoredLoans;
export function freshLoanSource(source, checkedAt) {
  const age = Date.now() - Date.parse(source.checkedAt || checkedAt);
  const maxAge = source.errorCode === 'rate_limited' ? Math.max(browserCacheAge, (source.retryAfter || 60) * 1000) : browserCacheAge;
  return age >= 0 && age < maxAge;
}
export function catalogueOnly(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.books)) return snapshot;
  return {...snapshot,books:snapshot.books.map(({loading,error,result,...book}) => ({
    ...book,...(!book.info && result?.info ? {info:result.info} : {}),
    ...(result ? {result:{isbn:result.isbn,libraries:[]}} : {}),
  }))};
}
export function cachedSnapshot(snapshot) {
  const saved = catalogueOnly(snapshot);
  if (!Array.isArray(saved?.books)) return saved;
  saved.books = saved.books.map((book, index) => {
    const result = snapshot.books[index].result;
    const isbn = book.manualIsbn || book.info?.isbn || result?.isbn;
    if (!isbn) return {...book, ...(result ? {result:{...book.result,libraries:(result.libraries || []).filter(source => source.status === 'error')}} : {})};
    const sources = new Map((loanResults.get(isbn) || []).filter(source => freshLoanSource(source)).map(source => [source.id, source]));
    for (const source of result && (!result.isbn || result.isbn === isbn) ? result.libraries || [] : []) {
      if (!freshLoanSource(source, result.checkedAt)) continue;
      const checkedAt = source.checkedAt || result.checkedAt;
      if (!sources.has(source.id) || Date.parse(checkedAt) >= Date.parse(sources.get(source.id).checkedAt)) sources.set(source.id, {...source, checkedAt});
    }
    loanResults.set(isbn, [...sources.values()]);
    return {...book, result:{...book.result, isbn, libraries:structuredClone([...sources.values()])}};
  });
  return saved;
}
async function cacheTransaction(mode, work, storeName = 'profiles') {
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('booong-watcha-library', 2);
      request.onupgradeneeded = () => {
        for (const name of ['profiles','loans']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Cache blocked'));
    });
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = work(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(mode === 'readonly' ? request.result : true);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } catch { return mode === 'readonly' ? null : false; }
  finally { db?.close(); }
}

async function restoreLoans() {
  restoredLoans ||= cacheTransaction('readonly', store => store.getAll(), 'loans').then(results => {
    if (results?.length) cachedSnapshot({books:results.map(result => ({result}))});
  });
  await restoredLoans;
}

export async function writeLoanCache(result) {
  if (!result?.isbn) return true;
  await restoreLoans();
  const saved = cachedSnapshot({books:[{result}]}).books[0].result;
  return cacheTransaction('readwrite', store => store.put({isbn:saved.isbn,libraries:saved.libraries}, saved.isbn), 'loans');
}

export async function readCache(id, {sources = 'gyeonggi', refresh = false, kind = 'wishes', signal, onProgress} = {}) {
  const local = ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  const cacheId = kind === 'ratings' ? 'ratings:' + id : id;
  await restoreLoans();
  const offline = cachedSnapshot(await cacheTransaction('readonly', store => store.get(cacheId)));
  const complete = offline?.cloudMigrated && Array.isArray(offline.books) && offline.books.length === offline.total;
  if (!refresh && complete && Date.now() - (offline.cloudFetchedAt || 0) < browserCacheAge) return {...offline,storage:'firebase',fromBrowserCache:true,storageError:undefined};
  if (Array.isArray(offline?.books) && offline.books.length === offline.total) onProgress?.('저장된 목록을 표시하고 최신 목록을 확인합니다.',offline);
  const request = local ? fetch : adminFetch;
  const query = new URLSearchParams({action:'collection',profile:id,sources,...(kind === 'ratings' ? {kind} : {}),...(refresh ? {refresh:'1'} : {}),...(local ? {preview:'1'} : {})});
  try {
    const response = await request('/api/watcha-library?' + query, {cache:'no-store',signal});
    if (!response.ok) throw new Error('공유 저장소에 연결하지 못했습니다.');
    let collection = await response.json();
    if (collection.storage !== 'firebase' || (collection.kind || 'wishes') !== kind || !Array.isArray(collection.books) || collection.books.length !== collection.total) throw new Error('저장된 목록을 확인하지 못했습니다.');
    if (kind === 'wishes' && !offline?.cloudMigrated && Array.isArray(offline?.books)) {
      const legacy = offline.books.filter(book=>book.info || book.result).map(({id,info,manualIsbn,result})=>({id,info,manualIsbn,...(result ? {result:{isbn:result.isbn}} : {})}));
      let imported = 0;
      for (let start = 0; start < legacy.length; start += 25) {
        onProgress?.(`${collection.profile.name} · 기존 책 정보를 Firebase로 옮기는 중 · ${start}/${legacy.length}권`);
        const response = await request('/api/watcha-library?action=import' + (local ? '&preview=1' : ''), {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:id,books:legacy.slice(start,start+25)}),signal,cache:'no-store',
        });
        if (!response.ok) throw new Error('기존 책 정보를 옮기지 못했습니다.');
        imported += (await response.json()).imported;
      }
      if (imported) {
        query.delete('refresh');
        const response = await request('/api/watcha-library?' + query,{cache:'no-store',signal});
        if (!response.ok) throw new Error('이전한 결과를 확인하지 못했습니다.');
        collection = await response.json();
      }
    }
    const saved = cachedSnapshot({version:1,...catalogueOnly(collection),cloudMigrated:true,cloudFetchedAt:Date.now()});
    await writeCache(id,saved);
    return saved;
  } catch (error) {
    if (signal?.aborted) return null;
    return {...offline,storage:'offline',storageError:offline ? '저장된 목록 표시 중 · 대출 상태 미확인' : 'Firebase 공유 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'};
  }
}
export const writeCache = (id, value) => cacheTransaction('readwrite', store => store.put(cachedSnapshot(value), value.kind === 'ratings' ? 'ratings:' + id : id));
