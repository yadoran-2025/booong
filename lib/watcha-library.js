import { WATCHA_PROFILES, EXTRA_SOURCES, sourceSearchUrl, yonginUrl, normalizeIsbn, parseWishPage, parseRatedPage, isbnFromWatchaHtml, bookInfoFromWatchaHtml, normalizeCopies, parseYonginPage } from '../js/watcha-library-data.js';
export { yonginUrl };

export const PAGE_SIZE = 20;
const watchaHeaders = { 'User-Agent': 'Mozilla/5.0', accept: 'application/vnd.frograms+json;version=2.1.0', 'x-frograms-app-code': 'Galaxy', 'x-frograms-client': 'Galaxy-Web-App', 'x-frograms-client-version': '2.1.0', 'x-frograms-version': '2.1.0', 'x-frograms-galaxy-language': 'ko' };

export async function sourceText(url, options = {}) {
  const signal = AbortSignal.timeout(8000);
  let response;
  try { response = await fetch(url, { ...options, signal, redirect:'error', cache:'no-store' }); }
  catch (cause) {
    const error = new Error('Source unavailable', {cause});
    error.reason = signal.aborted || cause.name === 'TimeoutError' ? 'timeout' : 'connection_error';
    throw error;
  }
  if (!response.ok) {
    const error = new Error('Source unavailable');
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }
  if (Number(response.headers.get('content-length')) > 2_097_152) throw new Error('Source too large');
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_097_152) throw new Error('Source too large');
      chunks.push(value);
    }
  } catch (cause) {
    const error = new Error('Source unavailable', {cause});
    error.reason = signal.aborted || cause.name === 'TimeoutError' ? 'timeout'
      : cause instanceof TypeError ? 'connection_error' : 'invalid_response';
    throw error;
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
const sourceJson = async (url, options) => JSON.parse(await sourceText(url, options));

function lookupError(error) {
  const httpStatus = Number.isInteger(error.status) ? error.status : undefined;
  const errorCode = httpStatus === 429 ? 'rate_limited' : [401,403].includes(httpStatus) ? 'access_denied'
    : httpStatus >= 500 ? 'service_unavailable' : httpStatus ? 'http_error' : error.reason || 'invalid_response';
  const messages = {
    rate_limited:'도서관이 조회 요청을 제한했습니다. 잠시 후 다시 확인해주세요.',
    access_denied:'도서관이 조회 접근을 거부했습니다. 대출 가능 여부를 확인하지 못했습니다.',
    timeout:'도서관 응답 시간이 초과되었습니다. 대출 가능 여부를 확인하지 못했습니다.',
    connection_error:'도서관에 연결하지 못했습니다. 대출 가능 여부를 확인하지 못했습니다.',
    service_unavailable:'도서관 서버가 정상 응답하지 않았습니다. 대출 가능 여부를 확인하지 못했습니다.',
    http_error:'도서관 조회 요청이 실패했습니다. 대출 가능 여부를 확인하지 못했습니다.',
    invalid_response:'도서관 응답 형식을 확인하지 못했습니다. 차단 안내·로그인 화면 또는 검색 형식 변경일 수 있습니다.',
  };
  const wait = Number(error.retryAfter) || (Date.parse(error.retryAfter) - Date.now()) / 1000;
  return {errorCode,...(httpStatus ? {httpStatus} : {}),
    ...(errorCode === 'rate_limited' ? {retryAfter:Math.min(3600,Math.max(1,Math.ceil(wait) || 60))} : {}),
    message:messages[errorCode] + (httpStatus ? ` (HTTP ${httpStatus})` : '')};
}
const form = params => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });

export const fetchWishPage = (page, profileId = WATCHA_PROFILES[0].id) => fetchProfilePage(page, profileId, 'wishes');
export const fetchRatedPage = (page, profileId = WATCHA_PROFILES[0].id) => fetchProfilePage(page, profileId, 'ratings');

async function fetchProfilePage(page, profileId, kind) {
  const profile = WATCHA_PROFILES.find(profile => profile.id === profileId);
  if (!profile) throw new Error('Unregistered profile');
  const wishPath = `/api/users/${profile.id}/contents/books/${kind}`;
  if (!Number.isSafeInteger(page) || page < 1 || page > 500) throw new Error('Invalid page');
  const data = await sourceJson(`https://pedia.watcha.com${wishPath}?order=${kind === 'ratings' ? 'recent' : 'updated'}&page=${page}&size=${PAGE_SIZE}`, { headers: watchaHeaders });
  if (data?.result?.next_uri && !data.result.next_uri.startsWith(wishPath + '?')) throw new Error('Wishlist cursor changed account');
  return { ...(kind === 'ratings' ? parseRatedPage(data, page, profileId) : parseWishPage(data, page)), profile, checkedAt: new Date().toISOString() };
}

export async function fetchBook(id) {
  if (!/^b[A-Za-z0-9]{6}$/.test(id)) throw new Error('Invalid book');
  const html = await sourceText(`https://pedia.watcha.com/ko/contents/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!/<h1\b/.test(html)) throw new Error('Book detail unavailable');
  const isbn = isbnFromWatchaHtml(html);
  return { id, isbn, info:{...bookInfoFromWatchaHtml(html, id), isbn} };
}

async function gyeonggi(isbn) {
  const rows = [], seen = new Set();
  let expectedTotal;
  for (let page = 1; page <= 5; page++) {
    const data = await sourceJson('https://www.library.kr/api/booksearch', form({ api_type: 'local', type: 'detail', manage_code: '141674', search_isbn_issn: isbn, display: '50', page_no: String(page) }));
    if (data.RESULT === 'NO_DATA' && !rows.length) return [];
    const result = data.RESULT_BOOK_LIST;
    if (data.RESULT !== 'SUCCESS' || !Array.isArray(result?.BOOK_LIST)) throw new Error('Gyeonggi schema changed');
    const total = Number(result.TOTAL_COUNT);
    if (!Number.isSafeInteger(total) || total < 0 || (total && !result.BOOK_LIST.length)) throw new Error('Gyeonggi result count changed');
    if (expectedTotal !== undefined && total !== expectedTotal) throw new Error('Gyeonggi total changed');
    expectedTotal = total;
    for (const copy of result.BOOK_LIST) {
      const key = String(copy.BOOK_KEY);
      if (!/^\d+$/.test(key) || seen.has(key)) throw new Error('Gyeonggi duplicate copy');
      seen.add(key);
    }
    rows.push(...result.BOOK_LIST);
    if (rows.length > total) throw new Error('Gyeonggi count mismatch');
    if (rows.length === total) return rows;
  }
  throw new Error('Gyeonggi results incomplete');
}
async function suwon(isbn) {
  const data = await sourceJson('https://mob.suwonlib.go.kr/search/get/lib/bookinfo', form({ book_isbn: isbn, book_form_code: 'BK' }));
  if (!Array.isArray(data.libList) || !Array.isArray(data.bookList)) throw new Error('Suwon schema changed');
  return data.bookList;
}
async function yongin(isbn) {
  const rows = [], seen = new Set();
  let expectedTotal;
  for (let page = 1; page <= 10; page++) {
    const result = parseYonginPage(await sourceText(yonginUrl(isbn, page)), isbn);
    if (expectedTotal !== undefined && result.total !== expectedTotal) throw new Error('Yongin total changed');
    expectedTotal = result.total;
    for (const copy of result.copies) {
      if (seen.has(copy.BOOK_KEY)) throw new Error('Yongin duplicate copy');
      seen.add(copy.BOOK_KEY);
    }
    rows.push(...result.copies);
    if (rows.length > result.total) throw new Error('Yongin count mismatch');
    if (rows.length === result.total) return rows;
  }
  throw new Error('Yongin results incomplete');
}

export function parseSejongCopies(html, isbn) {
  const table = html.match(/<table\b[^>]*>[\s\S]*?<caption>권별정보 안내<\/caption>([\s\S]*?)<\/table>/)?.[1];
  if (!table || !html.includes(isbn)) throw new Error('Sejong detail changed');
  const rows = [];
  for (const match of table.matchAll(/id="REGIST_NO_(\d+)" value="([^"]+)"/g)) {
    const field = name => table.match(new RegExp(`id="${name}_${match[1]}" value="([^"]*)"`))?.[1];
    const code = field('SHELV_STTUS'), limit = field('USE_LMTT_CODE'), reservations = field('CNT_LON_RESVE');
    // Only shelved, unrestricted copies without a reservation queue are loanable.
    const loan = code === '2' && limit === 'GM' && reservations === '0' ? 'OK'
      : code === '1' ? 'OUT_ON_LOAN' : code === '2' && (limit && limit !== 'GM' || /^\d+$/.test(reservations || '') && Number(reservations) > 0) ? 'NOT_ALLOWED' : 'UNKNOWN';
    rows.push({ISBN:isbn, BOOK_KEY:match[2], LIB_NAME:'국립세종도서관', LOAN_CODE:loan, SHELF_LOC_NAME:field('SHELF_CODE_NM') || '', CALL_NO:field('RQEST_NO') || ''});
  }
  if (!rows.length) throw new Error('Sejong copies missing');
  return rows;
}

async function sejong(isbn) {
  const rows = [], seen = new Set();
  let expectedTotal;
  for (let page = 1; page <= 5; page++) {
    const data = await sourceJson('https://sejong.nl.go.kr/openapi/searchStorage.do?' + new URLSearchParams({kwd:isbn, subCategory:'book', pageIndex:String(page), pageSize:'10'}));
    const result = data?.result, records = result?.fdata?.storageVo;
    if (!Number.isSafeInteger(result?.total) || result.total < 0 || !Array.isArray(records) || expectedTotal !== undefined && expectedTotal !== result.total) throw new Error('Sejong schema changed');
    expectedTotal = result.total;
    if (!records.length && expectedTotal) throw new Error('Sejong page incomplete');
    for (const record of records) {
      if (!/^SH1_[A-Z0-9]+$/.test(record.key_id || '') || seen.has(record.key_id)) throw new Error('Sejong duplicate record');
      seen.add(record.key_id);
      if (!String(record.isbn).split(/\s+/).some(value => normalizeIsbn(value) === isbn) || record.manage_code !== 'SJ') throw new Error('Sejong edition mismatch');
      const url = 'https://sejong.nl.go.kr/search/searchDetail.do?' + new URLSearchParams({rec_key:record.key_id, menuId:'O201', upperMenuId:'O200'});
      rows.push(...parseSejongCopies(await sourceText(url), isbn));
    }
    if (seen.size === expectedTotal) return rows;
    if (seen.size > expectedTotal) throw new Error('Sejong count mismatch');
  }
  throw new Error('Sejong results incomplete');
}

export function normalizeCyberBooks(data, isbn) {
  const result = data?.data;
  if (data?.httpStatus !== 'OK' || !Number.isSafeInteger(result?.totalElements) || result.totalElements < 0 || !Array.isArray(result.contents) || result.contents.length !== result.totalElements) throw new Error('Cyber search incomplete');
  return normalizeCopies(result.contents.map(row => ({
    ISBN:row.ISBN, LIB_NAME:'경기도사이버도서관',
    LOAN_CODE:row.CONTENT_TYPE === 'EB' && row.SERVICE_USE_YN === 'Y' ? String(row.LOANABLE) === '1' ? 'OK' : String(row.LOANABLE) === '0' ? 'OUT_ON_LOAN' : 'UNKNOWN' : 'UNKNOWN',
    SHELF_LOC_NAME:[row.TITLE, row.L_CATEGORY_NAME, row.M_CATEGORY_NAME].filter(Boolean).join(' · '),
  })), isbn);
}

async function cyber(isbn) {
  const data = await sourceJson('https://ebook.library.kr/api/service/search-engine?' + new URLSearchParams({contentType:'EB', isbn, sort:'relevance', asc:'desc', page:'1', size:'50'}));
  return normalizeCyberBooks(data, isbn);
}

export async function lookupAvailability(value, sourceIds = null) {
  const isbn = normalizeIsbn(value);
  if (!isbn) throw new Error('Invalid ISBN');
  const sources = [
    { id: 'gyeonggi', name: '경기도서관', sourceUrl: sourceSearchUrl('gyeonggi', isbn), lookup: gyeonggi },
    { id: 'suwon', name: '수원시 도서관', sourceUrl: sourceSearchUrl('suwon', isbn), lookup: suwon },
    { id: 'yongin', name: '용인시 도서관', sourceUrl: sourceSearchUrl('yongin', isbn), lookup: yongin },
    ...EXTRA_SOURCES.map(source => ({...source, sourceUrl:sourceSearchUrl(source.id, isbn),
      lookup:source.id === 'sejong' ? sejong : source.id === 'gyeonggi-cyber' ? cyber : async () => ({status:'unknown', copies:[], message:'밀리 검색은 로그인이 필요합니다. 책 제목 검색에서 제공 여부를 확인해주세요.'}),
      normalize:source.id === 'sejong' ? normalizeCopies : result => result})),
  ];
  if (sourceIds && (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length || sourceIds.some(id => !sources.some(source => source.id === id)))) throw new Error('Invalid sources');
  return Promise.all(sources.filter(source => !sourceIds || sourceIds.includes(source.id)).map(async ({ lookup, normalize = normalizeCopies, ...source }) => {
    try { return { ...source, ...normalize(await lookup(isbn), isbn), checkedAt: new Date().toISOString() }; }
    catch (error) { return {...source,status:'error',copies:[],checkedAt:new Date().toISOString(),...lookupError(error)}; }
  }));
}
