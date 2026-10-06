import { adminAccess } from './admin.js';
import { sendJson } from '../lib/dorms-auth.js';
import { fetchWishPage, fetchBook, lookupAvailability } from '../lib/watcha-library.js';
import { WATCHA_PROFILES, EXTRA_SOURCES, normalizeIsbn } from '../js/watcha-library-data.js';
import { watchaStorageConfigured } from '../lib/watcha-storage.js';
import { sharedCollection, sharedBook, sharedAvailability, saveWatchaCorrection, sharedSyncHistory } from '../lib/watcha-shared.js';
import { importWatchaCache, validateWatchaImport } from '../lib/watcha-import.js';

async function importBody(req) {
  let raw = '';
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 2_097_152) throw new Error('Cache import too large');
  }
  if (Buffer.byteLength(raw) > 2_097_152) throw new Error('Cache import too large');
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  const params = new URL(req.url, 'https://booong.invalid').searchParams;
  const action = params.get('action');
  if (!(action === 'sync-history' ? ['GET','POST'] : [action === 'import' ? 'POST' : 'GET']).includes(req.method)) return sendJson(res, 405, { reason: 'method_not_allowed' });
  const preview = process.env.NODE_ENV === 'development' && process.env.BOOONG_WATCHA_PREVIEW === '1'
    && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(req.headers.host || '') && params.get('preview') === '1';
  if (!preview) {
    const access = await adminAccess(req);
    if (access.status !== 200) return sendJson(res, access.status, access.body);
  }
  if (action === 'sync-history') {
    if (preview && req.method === 'POST' && req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return sendJson(res,403,{reason:'invalid_origin'});
    if ([...params.keys()].some(key=>!['action',...(preview ? ['preview'] : [])].includes(key) || params.getAll(key).length !== 1)) return sendJson(res,400,{reason:'invalid_request'});
    if (!watchaStorageConfigured()) return sendJson(res,503,{reason:'storage_not_configured'});
    try { return sendJson(res,200,await sharedSyncHistory(req.method === 'POST')); }
    catch { return sendJson(res,503,{reason:'storage_unavailable'}); }
  }
  if (action === 'import') {
    if (preview && req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return sendJson(res,403,{reason:'invalid_origin'});
    if ([...params.keys()].some(key=>!['action',...(preview ? ['preview'] : [])].includes(key) || params.getAll(key).length !== 1)) return sendJson(res,400,{reason:'invalid_request'});
    let body;
    try { body = await importBody(req); validateWatchaImport(body); }
    catch { return sendJson(res,400,{reason:'invalid_cache_import'}); }
    if (!watchaStorageConfigured()) return sendJson(res,503,{reason:'storage_not_configured'});
    try { return sendJson(res,200,await importWatchaCache(body)); }
    catch { return sendJson(res,503,{reason:'storage_unavailable'}); }
  }
  const allowed = action === 'collection' ? ['action','profile','sources','refresh','kind'] : action === 'wishes' ? ['action', 'page', 'profile'] : action === 'book' ? ['action','id','sources','refresh'] : action === 'info' ? ['action','id'] : action === 'availability' ? ['action', 'isbn', 'sources','refresh','id'] : null;
  if (!allowed || [...params.keys()].some(key => !(allowed.includes(key) || preview && key === 'preview') || params.getAll(key).length !== 1) || req.url.length > 512) return sendJson(res, 400, { reason: 'invalid_request' });
  const page = params.get('page') || '1', id = params.get('id'), isbn = normalizeIsbn(params.get('isbn'));
  const profileId = params.has('profile') ? params.get('profile') : WATCHA_PROFILES[0].id;
  const sources = params.has('sources') ? params.get('sources').split(',') : null;
  const refresh = params.get('refresh') === '1';
  const kind = params.get('kind') || 'wishes';
  if (!['wishes','ratings'].includes(kind)) return sendJson(res,400,{reason:'invalid_request'});
  if (params.has('refresh') && !['0','1'].includes(params.get('refresh'))) return sendJson(res,400,{reason:'invalid_request'});
  if (sources && (!sources.length || new Set(sources).size !== sources.length || sources.some(id => !['gyeonggi','suwon','yongin',...EXTRA_SOURCES.map(source => source.id)].includes(id)))) return sendJson(res, 400, {reason:'invalid_request'});
  if (['wishes','collection'].includes(action) && (!WATCHA_PROFILES.some(profile => profile.id === profileId) || !/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 500)
    || ['book', 'info'].includes(action) && !/^b[A-Za-z0-9]{6}$/.test(id || '')
    || action === 'availability' && (!isbn || params.has('id') && !/^b[A-Za-z0-9]{6}$/.test(id))) return sendJson(res, 400, { reason: 'invalid_request' });
  try {
    if (action === 'collection') {
      if (!watchaStorageConfigured()) return sendJson(res,503,{reason:'storage_not_configured',message:'Firebase 공유 저장소가 연결되지 않았습니다.'});
      return sendJson(res,200,await sharedCollection(profileId,sources || ['gyeonggi'],refresh,kind));
    }
    if (action === 'wishes') return sendJson(res, 200, await fetchWishPage(Number(page), profileId));
    const shared = watchaStorageConfigured();
    if (action === 'info') return sendJson(res, 200, await (shared ? sharedBook(id) : fetchBook(id)));
    const book = action === 'book' ? await (shared ? sharedBook(id) : fetchBook(id)) : { isbn };
    if (shared && action === 'availability' && id) await saveWatchaCorrection(id,isbn);
    const lookupIsbn = book.manualIsbn || book.isbn;
    const libraries = lookupIsbn ? await (shared ? sharedAvailability(lookupIsbn,sources || undefined) : lookupAvailability(lookupIsbn,sources)) : [];
    return sendJson(res, 200, { ...book, isbn:lookupIsbn, libraries, checkedAt: new Date().toISOString(), ...(shared ? {storage:'firebase'} : {}) });
  } catch (error) {
    if (error.status === 429) {
      const retryAfter = Math.min(3600, Math.max(60, Number(error.retryAfter) || 60));
      res.setHeader('Retry-After', String(retryAfter));
      return sendJson(res, 429, {reason:'source_rate_limited', retryAfter, message:'왓챠의 요청 제한으로 잠시 기다리고 있습니다. 책 정보는 이후 이어서 확인합니다.'});
    }
    return sendJson(res, 502, { reason: 'source_unavailable', message: '공개 자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
