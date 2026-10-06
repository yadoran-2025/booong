import { adminFetch, requireAdmin, adminAccountId, onAdminAccountChange } from './admin.js';
import { escapeHtml as esc } from './utils.js';
import { normalizeIsbn, WATCHA_PROFILES, SUWON_LIBRARIES, YONGIN_LIBRARIES, EXTRA_SOURCES, sourceSearchUrl, selectedLibraryResults, selectedAvailability } from './watcha-library-data.js';
import { readCache, writeCache, writeLoanCache, cachedSnapshot, freshLoanSource } from './watcha-library-cache.js';

const root = document.querySelector('#admin-root');
const localPreview = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const libraries = [{id:'gyeonggi',name:'경기도서관'},...SUWON_LIBRARIES,...YONGIN_LIBRARIES,...EXTRA_SOURCES];
const stateLabels = {available:'대출 가능',unavailable:'대출 불가 · 미소장',unknown:'확인 필요',pending:'조회 대기',unselected:'도서관 선택 필요'};
const selectionKey = 'booong:watcha-library:regions';
let selectedLibraries = libraries.map(library => library.id);
try {
  const saved = JSON.parse(localStorage.getItem(selectionKey));
  if (Array.isArray(saved)) selectedLibraries = selectedLibraries.filter(id => saved.includes(id) || saved.includes(id.split(':')[0]));
} catch { /* Region preferences are optional when browser storage is unavailable. */ }
const favoriteKey = 'booong:watcha-library:favorite-libraries';
let favoriteLibraries = [];
try {
  const saved = JSON.parse(localStorage.getItem(favoriteKey));
  if (Array.isArray(saved)) favoriteLibraries = libraries.filter(library => saved.includes(library.id)).map(library => library.id);
} catch { /* Favorites remain usable when browser storage is unavailable. */ }
const labels = { available: '대출 가능', unavailable: '소장 · 대출 불가', not_held: '미소장', unknown: '상태 미확인', error: '조회 실패' };
const cartKey = 'booong:watcha-library:cart';
const cart = new Map();
try {
  const saved = JSON.parse(localStorage.getItem(cartKey));
  let migrated = false;
  if (Array.isArray(saved)) for (const book of saved) {
    if (!/^b[A-Za-z0-9]{6}$/.test(book?.id) || typeof book.title !== 'string' || !Array.isArray(book.libraries)) continue;
    const sources = book.libraries.filter(source => source && (['suwon','yongin'].includes(source.id) || libraries.some(library => library.id === source.id)));
    const legacyBranch = sources.find(source => source.id.includes(':'))?.id;
    const libraryIds = Array.isArray(book.libraryIds)
      ? [...new Set(book.libraryIds.filter(id => libraries.some(library => library.id === id)))]
      : [legacyBranch || selectedLibraries[0] || 'gyeonggi'];
    if (!libraryIds.length) continue;
    if (!Array.isArray(book.libraryIds)) migrated = true;
    cart.set(book.id, {id:book.id,title:book.title,isbn:normalizeIsbn(book.isbn),libraryIds,libraries:sources.map(source => ({
      id:source.id,name:libraries.find(library => library.id === source.id)?.name || ({suwon:'수원시 도서관',yongin:'용인시 도서관'})[source.id],
      status:['available','unavailable','not_held','unknown','error','pending'].includes(source.status) ? source.status : 'unknown',
      checkedAt:typeof source.checkedAt === 'string' ? source.checkedAt : '',
      message:typeof source.message === 'string' ? source.message : '',errorCode:typeof source.errorCode === 'string' ? source.errorCode : '',
      retryAfter:Number.isSafeInteger(source.retryAfter) ? source.retryAfter : undefined,
      copies:(Array.isArray(source.copies) ? source.copies : []).filter(copy => copy && typeof copy === 'object').map(copy => ({
        branch:String(copy.branch || ''),branchCode:String(copy.branchCode || ''),status:copy.status,
        location:String(copy.location || ''),callNo:String(copy.callNo || ''),label:String(copy.label || ''),
      })),
    }))});
  }
  if (migrated) localStorage.setItem(cartKey, JSON.stringify([...cart.values()]));
} catch { /* A missing or damaged cart must not prevent catalogue use. */ }
let books = [], total = 0, busy = false, epoch = 0, controller, checkedAt, complete = false;
let selectedProfile = WATCHA_PROFILES[0].id;
let selectedProfiles = [selectedProfile];
let collectionKind = 'wishes';
const profileSelectionKey = 'booong:watcha-library:profiles';
let lastFullSync, syncHistoryError = false;
try {
  const saved = JSON.parse(localStorage.getItem(profileSelectionKey));
  if (Array.isArray(saved)) selectedProfiles = WATCHA_PROFILES.filter(profile => saved.includes(profile.id)).map(profile => profile.id);
} catch { /* Optional browser preferences. */ }
selectedLibraries = [selectedLibraries[0] || 'gyeonggi'];
const collections = new Map();
const wishlistRatings = new Map();
let activeLoaded = false;
const corrections = new Map();
const infoRequests = new Map();
let infoTimer;
let selectedGenres = [], genreSignature = '';
let randomBookOrder = new Map();
let bookSort = 'popular';
const shelfIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18M21 3v18M3 18h18M6 6h3v12H6zM11 5h3v13h-3zM16 8h3v10h-3z"/></svg>';
const loanRequests = new Map();
let librarySelection = 0, loanWarning = '';
let loanRenderTimer = null;
const changedLoanBooks = new Set();
const automaticSources = ['gyeonggi', 'suwon', 'yongin', ...EXTRA_SOURCES.filter(source => !source.manual).map(source => source.id)];
const needsSources = (book, ids, refreshExpired = true) => ids.filter(id => !book.result?.libraries?.some(source => source.id === id && (!refreshExpired || freshLoanSource(source, book.result.checkedAt))))
  .filter(() => !(book.result && !book.result.isbn && !book.info?.isbn && !book.manualIsbn));

function changeLoanSource() {
  librarySelection++;
  loanWarning = '';
  rememberProfile();
  for (const collection of collections.values()) for (const book of collection.books) {
    book.result = cachedSnapshot({books:[book]}).books[0].result;
    book.error = '';
  }
}

async function api(params, options = {}) {
  const url = '/api/watcha-library?' + new URLSearchParams(localPreview ? {...params, preview:'1'} : params);
  const response = await (localPreview ? fetch : adminFetch)(url, { signal: controller.signal, cache:'no-store', ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reasons = {
      temporarily_unavailable:'운영자 권한 명단을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      admin_not_configured:'운영자 권한 명단이 설정되지 않았습니다. 운영자 설정을 확인해주세요.',
      storage_not_configured:'공유 저장소가 연결되지 않았습니다. 운영자 설정을 확인해주세요.',
      storage_unavailable:'공유 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
    };
    const error = new Error(response.status === 401 || response.status === 403 ? '운영자 권한을 다시 확인해주세요.' : body.message || `${reasons[body.reason] || '조회 서버가 정상 응답하지 않았습니다. 잠시 후 다시 시도해주세요.'} (HTTP ${response.status})`);
    error.httpStatus = response.status;
    if (response.status === 429) {
      const header = response.headers.get('Retry-After');
      const wait = Number(body.retryAfter) || Number(header) || (Date.parse(header) - Date.now()) / 1000;
      error.retryAfter = Math.min(3600, Math.max(60, Math.ceil(wait) || 60));
    }
    throw error;
  }
  return response.json();
}
const time = (value, seconds = false) => new Date(value).toLocaleString('ko-KR', { timeZone:'Asia/Seoul', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', ...(seconds ? {second:'2-digit'} : {}) });

function syncDateLabel(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now) return '실행 기록 없음';
  return `${new Date(timestamp).toLocaleDateString('ko-KR', {timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'})} 실행`;
}

async function confirmFullSync() {
  const button = root.querySelector('[data-refresh]');
  if (button.disabled) return;
  if (!window.confirm('이 기능을 실행하면 서버비가 지불됩니다. 그래도 실행하시겠습니까?')) return;
  button.disabled = true;
  try {
    const history = await api({action:'sync-history'}, {method:'POST'});
    lastFullSync = history.lastFullSyncAt;
    syncHistoryError = false;
  } catch (error) {
    if (error.name !== 'AbortError') root.querySelector('[data-status]').textContent = '실행 기록을 저장하지 못해 동기화를 시작하지 않았습니다. 다시 시도해주세요.';
    button.disabled = false;
    return;
  }
  await init(true, false, true);
}

function renderSyncHistory() {
  const label = root.querySelector('[data-sync-age]');
  if (!label) return;
  label.textContent = syncHistoryError ? '기록 확인 실패' : lastFullSync === undefined ? '기록 확인 중' : syncDateLabel(lastFullSync);
  label.title = lastFullSync ? `마지막 실행 ${time(lastFullSync)}` : '';
}

async function refreshSyncHistory() {
  const run = epoch;
  try {
    const history = await api({action:'sync-history'});
    if (run !== epoch) return;
    lastFullSync = history.lastFullSyncAt;
    syncHistoryError = false;
  } catch (error) {
    if (run !== epoch || error.name === 'AbortError') return;
    syncHistoryError = true;
  }
  renderSyncHistory();
}

function libraryButton(library) {
  const name = library.id === 'gyeonggi' || EXTRA_SOURCES.some(source => source.id === library.id) ? library.name : library.name.replace(/도서관$/, '');
  const favorite = favoriteLibraries.includes(library.id);
  return `<span class="watcha-library-choice"><button type="button" class="watcha-choice" data-library="${library.id}" aria-pressed="${selectedLibraries.includes(library.id)}">${esc(name)}</button><button type="button" class="watcha-favorite" data-favorite="${library.id}" aria-pressed="${favorite}" aria-label="${esc(library.name)} 즐겨찾기 ${favorite ? '해제' : '추가'}" title="즐겨찾기 ${favorite ? '해제' : '추가'}">${favorite ? '★' : '☆'}</button></span>`;
}

const primaryLibraryIds = ['gyeonggi', 'millie', 'sejong', 'gyeonggi-cyber'];
function libraryPickerMarkup() {
  const favoriteIds = libraries.filter(library => favoriteLibraries.includes(library.id)).map(library => library.id);
  const frontIds = [...new Set([...favoriteIds, ...primaryLibraryIds, ...selectedLibraries])];
  const defaults = `<div class="watcha-library-group" data-library-defaults><div>${frontIds.map(id => libraryButton(libraries.find(library => library.id === id))).join('')}</div></div>`;
  const groups = [{name:'경기도서관',ids:['gyeonggi']},{name:'수원시 도서관',ids:SUWON_LIBRARIES.map(library => library.id)},{name:'용인시 도서관',ids:YONGIN_LIBRARIES.map(library => library.id)},{name:'전자책 · 국립도서관',ids:EXTRA_SOURCES.map(source => source.id)}];
  return defaults + `<details class="watcha-more-libraries"><summary data-more-libraries>즐겨찾기 등록</summary><div>${groups.map(group => `<section class="watcha-library-group"><h3>${group.name}</h3><div>${libraries.filter(library => group.ids.includes(library.id)).map(libraryButton).join('')}</div></section>`).join('')}<p class="watcha-favorite-help">★로 등록한 도서관은 고정 도서관 앞에 표시하고 이 브라우저에 저장합니다.</p></div></details>`;
}

function toggleFavorite(id) {
  if (!libraries.some(library => library.id === id)) return;
  favoriteLibraries = favoriteLibraries.includes(id) ? favoriteLibraries.filter(value => value !== id) : [...favoriteLibraries, id];
  try { localStorage.setItem(favoriteKey, JSON.stringify(favoriteLibraries)); }
  catch { root.querySelector('[data-status]').textContent = '즐겨찾기를 저장하지 못했습니다. 이 화면에서만 유지합니다.'; }
}

function rememberProfile() {
  if (activeLoaded) collections.set(selectedProfile, {...collections.get(selectedProfile),books, total, checkedAt, complete});
}

function combinedBooks() {
  rememberProfile();
  const merged = new Map();
  for (const profileId of selectedProfiles) {
    for (const book of collections.get(profileId)?.books || []) {
      const previous = merged.get(book.id);
      const owners = [...(previous?.profileIds || []), profileId];
      const ratings = {...previous?.ratings,...(Number.isFinite(book.rating) ? {[profileId]:book.rating} : {})};
      // The same Watcha content is one book; keep a finished lookup over an unfinished one.
      const preferred = previous?.result && !book.result ? previous : book;
      merged.set(book.id, {...preferred, profileIds:owners,ratings});
    }
  }
  if (collectionKind === 'wishes') for (const book of merged.values()) book.ratings = {...wishlistRatings.get(book.id)};
  const averageRating = book => {
    const ratings = Object.values(book.ratings);
    return ratings.reduce((sum, rating) => sum + rating, 0) / (ratings.length || 1);
  };
  return [...merged.values()].sort((a,b)=>b.profileIds.length-a.profileIds.length
    || (collectionKind === 'ratings' ? averageRating(b)-averageRating(a) : 0));
}

function bookGenres(book) {
  const genres = [...new Set((book.info?.genres || []).map(genre => genre.trim()).filter(Boolean))];
  return genres.length ? genres : ['미분류'];
}

function renderGenreFilters(combined) {
  root.querySelector('[data-genres-summary]').textContent = selectedGenres.length
    ? selectedGenres.slice(0,2).join(', ') + (selectedGenres.length > 2 ? ` 외 ${selectedGenres.length - 2}개` : '')
    : '전체';
  const counts = new Map(selectedGenres.map(genre => [genre, 0]));
  for (const book of combined) for (const genre of bookGenres(book)) counts.set(genre, (counts.get(genre) || 0) + 1);
  const entries = [...counts].sort(([a], [b]) => a === '미분류' ? 1 : b === '미분류' ? -1 : a.localeCompare(b, 'ko'));
  const signature = JSON.stringify(entries);
  const container = root.querySelector('[data-genres]');
  // Keep checkbox nodes stable during loan updates so keyboard focus stays on the filter.
  if (signature !== genreSignature) {
    genreSignature = signature;
    container.innerHTML = `<legend>장르 <small>여러 개 선택 가능</small></legend><div class="watcha-genres__choices"><label class="watcha-check watcha-genre"><input type="checkbox" data-genres-all>전체 <span>${combined.length}</span></label>${entries.map(([genre, count]) => `<label class="watcha-check watcha-genre"><input type="checkbox" data-genre="${esc(genre)}">${esc(genre)} <span>${count}</span></label>`).join('')}</div>`;
  }
  container.querySelector('[data-genres-all]').checked = !selectedGenres.length;
  for (const input of container.querySelectorAll('[data-genre]')) input.checked = selectedGenres.includes(input.dataset.genre);
}

function libraryMarkup(library) {
  const branches = new Map();
  for (const copy of library.copies || []) {
    if (copy.status !== 'available') continue;
    const key = copy.branchCode || copy.branch.trim();
    const known = (library.id === 'suwon' ? SUWON_LIBRARIES : library.id === 'yongin' ? YONGIN_LIBRARIES : []).find(branch=>branch.code === copy.branchCode);
    const branchName = copy.branch.trim() || library.name;
    const name = known?.name || (branchName.endsWith('도서관') ? branchName : branchName + '도서관');
    const previous = branches.get(key);
    const details = [...new Set([...(previous?.details || []), [copy.location, copy.callNo].filter(Boolean).join(' · ')])];
    branches.set(key,{name,count:(previous?.count || 0)+1,details});
  }
  const available = [...branches.values()];
  const notice = library.status === 'error' ? library.message || '조회에 실패했습니다. 다시 조회해주세요.'
    : library.status === 'unknown' ? library.message || '대출 상태 미확인 · 원문에서 확인해주세요.'
    : library.status === 'pending' ? '대출 가능 여부 확인 중'
    : available.length ? '' : '현재 대출 가능한 소장본 없음';
  const queriedAt = Date.parse(library.checkedAt);
  const queryTime = ['available','unavailable','not_held','unknown'].includes(library.status) && Number.isFinite(queriedAt) && queriedAt <= Date.now()
    ? `<p class="watcha-loan-notice">조회 <time datetime="${esc(library.checkedAt)}">${esc(time(queriedAt, true))}</time></p>` : '';
  return `<section class="watcha-library-result" data-state="${available.length ? 'available' : esc(library.status)}"><div class="watcha-library-result__head"><h3>${esc(library.name)}</h3><a href="${esc(library.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(library.name)} 원문 확인">원문 ↗</a></div>${available.length ? `<ul class="watcha-available-branches">${available.map(branch=>`<li><span>${esc(branch.name)}</span><small>${branch.count}권</small>${branch.details.map(detail=>`<span class="watcha-copy-location">${esc(detail)}</span>`).join('')}</li>`).join('')}</ul>` : ''}${notice ? `<p class="watcha-loan-notice"${library.status === 'error' ? ' role="alert"' : ''}>${esc(notice)}</p>` : ''}${queryTime}</section>`;
}

function cartBooks(libraryId = selectedLibraries[0] || 'gyeonggi') {
  return [...cart.values()].filter(book => book.libraryIds.includes(libraryId));
}

function updateCartButton() {
  const name = libraries.find(library => library.id === selectedLibraries[0])?.name || '경기도서관';
  const label = `${name} 서가 ${cartBooks().length}권 열기`;
  const button = root.querySelector('[data-cart-open]');
  button.setAttribute('aria-label',label);
  button.setAttribute('title',label);
}

function cartButtonMarkup(book, libraryId = null) {
  const added = cart.get(book.id)?.libraryIds.includes(libraryId || selectedLibraries[0] || 'gyeonggi') || false;
  return `<button class="btn btn--ghost watcha-cart-toggle" type="button" data-cart-book="${esc(book.id)}"${libraryId ? ` data-cart-library-id="${esc(libraryId)}"` : ''} aria-pressed="${added}" aria-label="${esc(book.title)} ${added ? '서가에서 빼기' : '서가에 담기'}" title="${added ? '서가에서 빼기' : '서가에 담기'}">${shelfIcon}</button>`;
}

function toggleCart(id, libraryId = selectedLibraries[0] || 'gyeonggi') {
  if (!libraries.some(library => library.id === libraryId)) return;
  const saved = cart.get(id), book = combinedBooks().find(book => book.id === id) || saved;
  if (!book) return;
  const removing = saved?.libraryIds.includes(libraryId);
  if (removing) {
    saved.libraryIds = saved.libraryIds.filter(value => value !== libraryId);
    if (!saved.libraryIds.length) cart.delete(id);
  }
  else if (saved) {
    const snapshot = cartLookupBook(saved,book);
    saved.isbn = snapshot.result.isbn;
    saved.libraries = structuredClone(snapshot.result.libraries);
    saved.libraryIds.push(libraryId);
  }
  else {
    cart.set(id, {id,title:book.title,isbn:book.manualIsbn || book.result?.isbn || book.info?.isbn,libraryIds:[libraryId],
      libraries:structuredClone((book.result?.libraries || []).map(source => ({...source,checkedAt:source.checkedAt || book.result?.checkedAt})))});
  }
  let message = removing ? '책을 이 도서관의 서가에서 뺐습니다.' : '책을 이 도서관의 서가에 담았습니다.';
  if (!saveCart()) message += ' 저장하지 못해 이 화면에서만 유지합니다.';
  root.querySelector('[data-cart-status]').textContent = message;
  updateCartButton();
  for (const button of root.querySelectorAll(`[data-cart-book="${id}"]`)) {
    const added = cart.get(id)?.libraryIds.includes(button.dataset.cartLibraryId || selectedLibraries[0] || 'gyeonggi') || false;
    button.setAttribute('title', added ? '서가에서 빼기' : '서가에 담기');
    button.setAttribute('aria-pressed', String(added));
    button.setAttribute('aria-label', `${book.title} ${added ? '서가에서 빼기' : '서가에 담기'}`);
  }
}

function saveCart() {
  try { localStorage.setItem(cartKey, JSON.stringify([...cart.values()])); return true; }
  catch { return false; }
}

function cartLookupBook(saved, loaded) {
  const isbn = loaded?.manualIsbn || loaded?.result?.isbn || loaded?.info?.isbn || saved.isbn;
  const storedSources = isbn === saved.isbn ? saved.libraries : [];
  const candidates = [...storedSources, ...(loaded?.result?.isbn === isbn ? loaded.result.libraries || [] : [])];
  const sources = new Map();
  for (const source of candidates) {
    const previous = sources.get(source.id);
    if (!previous || (Date.parse(source.checkedAt) || 0) >= (Date.parse(previous.checkedAt) || 0)) sources.set(source.id, source);
  }
  const fresh = cachedSnapshot({books:[{result:{isbn,libraries:[...sources.values()]}}]}).books[0].result;
  for (const source of fresh.libraries || []) sources.set(source.id,source);
  return {...saved,...loaded,url:loaded?.url || `https://pedia.watcha.com/ko-KR/contents/${saved.id}`,manualIsbn:loaded?.manualIsbn,result:{isbn,libraries:[...sources.values()]}};
}

function cartLibraryResult(book, id) {
  const provider = id.split(':')[0];
  const hasProvider = book.result.libraries.some(source => source.id === provider);
  const legacy = !hasProvider && book.result.libraries.find(source => source.id === id);
  const source = legacy || selectedLibraryResults(book,[id])[0];
  return {...source,name:libraries.find(library => library.id === id).name,
    ...(!hasProvider && !legacy ? {status:'pending'} : {}),
    sourceUrl:sourceSearchUrl(provider,book.result.isbn,book.title),
    ...(!book.result.isbn ? {status:'unknown',message:'ISBN을 확인하지 못했습니다. 책 정보에서 판본을 확인해주세요.'} : {}),
    ...(EXTRA_SOURCES.find(library => library.id === id)?.manual ? {status:'unknown',message:'도서관 원문에서 로그인 후 확인해주세요.'} : {})};
}

function cartItemsMarkup(libraryId = selectedLibraries[0] || 'gyeonggi') {
  const loaded = new Map(combinedBooks().map(book => [book.id,book]));
  return cartBooks(libraryId).map(saved => {
    const book = cartLookupBook(saved,loaded.get(saved.id));
    return bookMarkup(book,{libraryIds:[libraryId],shelf:true});
  }).join('') || '<p class="analytics__empty">이 도서관에 담은 책이 없습니다. 해당 도서관을 선택한 뒤 책의 서가 아이콘을 눌러 담아보세요.</p>';
}

async function fillCartLibrary(libraryId, run, refresh = false, keepGoing = () => true, onProgress = () => {}) {
  if (!libraries.some(library => library.id === libraryId)) return;
  const sourceId = libraryId.split(':')[0];
  if (!automaticSources.includes(sourceId)) return;
  const loaded = new Map(combinedBooks().map(book => [book.id,book]));
  const requests = new Map();
  for (const saved of cartBooks(libraryId)) {
    if (epoch !== run || !keepGoing()) return;
    if (!saved.libraryIds.includes(libraryId)) continue;
    const book = cartLookupBook(saved,loaded.get(saved.id));
    if (!refresh && !needsSources(book,[sourceId]).length) continue;
    if (loanRetrySeconds(book,[sourceId])) break;
    await checkBook(book,run,null,sourceId,refresh,requests);
    if (epoch !== run) return;
    if (cart.get(saved.id) === saved && saved.libraryIds.includes(libraryId)) {
      const snapshot = cartLookupBook(saved,book);
      saved.isbn = snapshot.result.isbn || saved.isbn;
      saved.libraries = structuredClone(snapshot.result.libraries);
      onProgress(saveCart());
    }
    if (book.result?.libraries?.some(source => source.id === sourceId && ['rate_limited','access_denied'].includes(source.errorCode))) break;
  }
}

function cartLibraryPickerMarkup(libraryId) {
  const frontIds = [...new Set([...favoriteLibraries, ...primaryLibraryIds, libraryId])];
  const button = library => `<button type="button" class="watcha-choice" data-cart-library="${library.id}" aria-pressed="${library.id === libraryId}">${esc(library.name)}</button>`;
  const groups = [{name:'수원시 도서관',libraries:SUWON_LIBRARIES},{name:'용인시 도서관',libraries:YONGIN_LIBRARIES}];
  return `<fieldset class="watcha-choice-group watcha-cart-controls"><legend>도서관</legend><div class="watcha-cart-library-buttons">${frontIds.map(id => button(libraries.find(library => library.id === id))).join('')}</div><div class="watcha-cart-actions"><button class="btn btn--secondary" type="button" data-cart-more aria-expanded="false" aria-controls="watcha-cart-more">다른 도서관</button><button class="btn btn--secondary" type="button" data-cart-refresh>다시 조회</button></div><div id="watcha-cart-more" class="watcha-cart-more" hidden>${groups.map(group => `<section class="watcha-library-group"><h3>${group.name}</h3><div>${group.libraries.map(button).join('')}</div></section>`).join('')}</div></fieldset>`;
}

function openCart() {
  const dialog = document.createElement('dialog'), run = epoch;
  let libraryId = selectedLibraries[0] || 'gyeonggi', selection = 0;
  dialog.className = 'watcha-info watcha-cart'; dialog.setAttribute('aria-labelledby','watcha-cart-title');
  dialog.innerHTML = `<header class="watcha-info__header"><h2 id="watcha-cart-title">서가 <span data-cart-count>${cartBooks(libraryId).length}</span>권</h2><form method="dialog"><button class="btn btn--ghost" aria-label="서가 닫기" autofocus>닫기</button></form></header><div class="watcha-info__body"><div data-cart-library-picker>${cartLibraryPickerMarkup(libraryId)}</div><p class="watcha-book__notice">도서관별로 담은 책은 이 브라우저에 저장됩니다.</p><p data-cart-query-status class="watcha-book__notice" role="status" aria-live="polite"></p><p class="watcha-cart-summary" data-cart-summary role="status" aria-live="polite"></p><div class="watcha-books" data-cart-items>${cartItemsMarkup(libraryId)}</div></div>`;
  root.append(dialog);
  const paint = () => {
    dialog.querySelector('[data-cart-items]').innerHTML = cartItemsMarkup(libraryId);
    dialog.querySelector('[data-cart-count]').textContent = cartBooks(libraryId).length;
    dialog.querySelector('[data-cart-summary]').textContent = `${libraries.find(library => library.id === libraryId).name} · 담은 책 ${cartBooks(libraryId).length}권`;
    if (!cartBooks(libraryId).length) dialog.querySelector('[data-cart-refresh]').disabled = true;
  };
  async function refresh(force = false) {
    const current = ++selection;
    const active = () => dialog.open && epoch === run && selection === current;
    const button = dialog.querySelector('[data-cart-refresh]'), status = dialog.querySelector('[data-cart-query-status]');
    button.disabled = true;
    status.textContent = automaticSources.includes(libraryId.split(':')[0]) && cartBooks(libraryId).length ? '이 도서관의 서가 정보를 확인하고 있습니다…' : '';
    paint();
    try {
      await fillCartLibrary(libraryId,run,force,active,stored => {
        if (!active()) return;
        paint();
        if (!stored) status.textContent = '조회 결과를 저장하지 못해 이 화면에서만 유지합니다.';
      });
    } catch (error) { if (active()) status.textContent = error.message; }
    finally {
      if (active()) { button.disabled = !cartBooks(libraryId).length || !automaticSources.includes(libraryId.split(':')[0]); paint(); if (status.textContent.includes('확인하고 있습니다')) status.textContent = ''; }
    }
  }
  dialog.addEventListener('close', () => { selection++; dialog.remove(); root.querySelector('[data-cart-open]').focus(); });
  dialog.addEventListener('click', event => {
    const more = event.target.closest('[data-cart-more]');
    if (more) {
      const panel = dialog.querySelector('#watcha-cart-more');
      panel.hidden = !panel.hidden;
      more.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    const library = event.target.closest('[data-cart-library]');
    if (library && libraries.some(value => value.id === library.dataset.cartLibrary)) {
      libraryId = library.dataset.cartLibrary;
      dialog.querySelector('[data-cart-library-picker]').innerHTML = cartLibraryPickerMarkup(libraryId);
      dialog.querySelector(`[data-cart-library="${libraryId}"]`).focus();
      refresh();
      return;
    }
    if (event.target.closest('[data-cart-refresh]')) { refresh(true); return; }
    const button = event.target.closest('[data-cart-book]');
    if (button) {
      const items = [...dialog.querySelectorAll('[data-cart-book]')], index = items.indexOf(button);
      toggleCart(button.dataset.cartBook, libraryId);
      paint();
      const remaining = dialog.querySelectorAll('[data-cart-book]');
      (remaining[Math.min(index, remaining.length - 1)] || dialog.querySelector('[aria-label="서가 닫기"]')).focus();
      return;
    }
    if (!event.target.closest('a,button')) {
      const card = event.target.closest('[data-cart-item]');
      if (card) openBookInfo(card.dataset.cartItem,libraryId,paint);
    } else {
      const open = event.target.closest('[data-open-book]');
      if (open) openBookInfo(open.dataset.openBook,libraryId,paint);
    }
  });
  dialog.showModal();
  refresh();
}

function bookLocationsMarkup(book, libraryIds = selectedLibraries, allCopies = false) {
  const copies = selectedLibraryResults(book, libraryIds).flatMap(library => library.copies || [])
    .filter(copy => allCopies || copy.status === 'available');
  const details = [...new Set(copies.map(copy => [copy.branch, copy.location, copy.callNo, ...(allCopies ? [copy.label || labels[copy.status]] : [])].filter(Boolean).join(' · ')))];
  const locations = [...new Set(copies.map(copy => copy.location).filter(Boolean))];
  const codes = [...new Set(copies.map(copy => copy.callNo).filter(Boolean))];
  return `<div class="watcha-book__locations" title="${esc(details.join('\n'))}">${locations.length ? `<p class="watcha-book__shelf">${esc(locations.join(' · '))}</p>` : ''}${codes.length ? `<p class="watcha-book__callno">${esc(codes.join(' · '))}</p>` : ''}</div>`;
}

function bookLoansMarkup(book) {
  const results = book.result?.libraries || [];
  const groups = [
    {id:'suwon',name:'수원시 도서관'},
    {id:'yongin',name:'용인시 도서관'},
    {id:'gyeonggi',name:'경기도서관'},
    ...EXTRA_SOURCES.filter(source=>!source.manual),
  ].map(group=>({...group,status:'pending',copies:[],...results.find(source=>source.id===group.id),
    sourceUrl:sourceSearchUrl(group.id,book.manualIsbn || book.result?.isbn || book.info?.isbn,book.title)}));
  const detail = book.error ? `<p class="watcha-book__notice" role="alert">${esc(book.error)}</p>` : book.result?.isbn ? `<p class="watcha-book__meta">ISBN ${esc(book.result.isbn)}${book.manual ? ' · 직접 입력' : ''}</p><div class="watcha-library-results">${groups.map(group => libraryMarkup(group)).join('')}</div>` : book.result ? `<p class="watcha-book__notice">ISBN을 확인하지 못했습니다. 왓챠 원문에서 판본을 확인한 뒤 입력해주세요.</p><form data-isbn-form="${esc(book.id)}" class="watcha-isbn"><label>ISBN <input name="isbn" inputmode="numeric" maxlength="20" required placeholder="ISBN 10 또는 13자리"${busy ? ' disabled' : ''}></label><button class="btn btn--ghost"${busy ? ' disabled' : ''}>조회</button></form>` : '<p class="watcha-book__notice">도서관 대출 가능 여부를 확인하고 있습니다…</p>';
  return `${book.loading ? '<p class="watcha-book__notice" role="status">대출 가능 여부 확인 중…</p>' : ''}${detail}<button class="btn btn--ghost" type="button" data-check="${esc(book.id)}"${busy || book.loading ? ' disabled' : ''}>${book.result ? '다시 조회' : '소장 조회'}</button>`;
}

function loanFailureSource(book) {
  return book.result?.libraries?.find(source => source.status === 'error'
    && selectedLibraries.some(id => id.split(':')[0] === source.id));
}


function loanFailure(book) {
  const source = loanFailureSource(book);
  return book.error || (source ? source.message || '도서관 조회에 실패했습니다.' : '');
}

function loanRetrySeconds(book, sourceIds = selectedLibraries.map(id => id.split(':')[0])) {
  return Math.max(0, ...(book.result?.libraries || [])
    .filter(source => source.status === 'error' && source.errorCode === 'rate_limited' && sourceIds.includes(source.id))
    .map(source => Math.max(0, Math.ceil((Date.parse(source.checkedAt) + (source.retryAfter || 60) * 1000 - Date.now()) / 1000)) || 0));
}

function loanRecoveryMarkup(book) {
  const failure = selectedAvailability(book, selectedLibraries) !== 'available' && loanFailure(book);
  if (!failure) return '<section class="watcha-book__recovery" hidden></section>';
  const source = loanFailureSource(book), seconds = loanRetrySeconds(book);
  const hint = source?.errorCode === 'access_denied' ? '자동 조회 접근이 거부되었습니다. 도서관 원문에서 직접 확인하거나 다른 도서관을 선택해주세요.'
    : seconds ? `${seconds}초 후 다시 시도해주세요. 기다리는 동안 도서관 원문에서 확인할 수 있습니다.`
    : source?.errorCode === 'invalid_response' ? '도서관 검색 화면이 변경되었거나 차단 안내가 반환됐을 수 있습니다. 원문에서 직접 확인해주세요.'
    : '잠시 후 다시 시도하거나 도서관 원문에서 직접 확인해주세요.';
  const sourceId = selectedSourceId(), isbn = book.manualIsbn || book.result?.isbn || book.info?.isbn;
  const url = sourceSearchUrl(sourceId, isbn, book.title);
  return `<section class="watcha-book__recovery"><p>${esc(failure)}</p><p>${esc(hint)}</p><div><button class="btn btn--secondary" type="button" data-check="${esc(book.id)}" aria-label="${esc(book.title)} 다시 시도"${busy || book.loading ? ' disabled' : ''}>다시 시도</button><a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer">도서관에서 직접 확인 ↗</a></div></section>`;
}

function bookOwnersMarkup(book) {
  if (!book.profileIds) return '';
  const people = WATCHA_PROFILES.filter(profile => book.profileIds.includes(profile.id) || Number.isFinite(book.ratings?.[profile.id]));
  return `<div class="watcha-book__owners">${people.map(profile => `<span class="chip chip--gray">${esc(profile.name)}${Number.isFinite(book.ratings?.[profile.id]) ? ` <span class="watcha-personal-rating" title="읽은 책 평점" aria-label="${esc(profile.name)}의 읽은 책 평점: 5점 만점에 ${book.ratings[profile.id]}점">★ ${book.ratings[profile.id].toFixed(1)}</span>` : ''}</span>`).join('')}</div>`;
}

function bookMarkup(book, {libraryIds = selectedLibraries, shelf = false} = {}) {
  const library = shelf ? cartLibraryResult(book,libraryIds[0]) : null;
  if (library) book = {...book,loading:false,error:'',result:{...book.result,libraries:[{...library,id:libraryIds[0].split(':')[0]}]}};
  const state = selectedAvailability(book, libraryIds);
  const failure = state !== 'available' && (shelf ? library.status === 'error' && (library.message || '조회에 실패했습니다.') : loanFailure(book));
  const stateLabel = failure ? '조회 실패' : state === 'unavailable'
    ? selectedLibraryResults(book,libraryIds).every(source => source.status === 'not_held') ? '미소장' : '소장 · 대출 불가'
    : stateLabels[state];
  const copyLabels = shelf && state === 'unavailable' ? [...new Set((library.copies || []).map(copy => copy.label).filter(Boolean))].join(' · ') : '';
  const queriedAt = Date.parse(library?.checkedAt);
  const shelfFooter = shelf ? `${library.message ? `<p class="watcha-book__notice"${failure ? ' role="alert"' : ''}>${esc(library.message)}</p>` : ''}<footer class="watcha-cart-book-footer"><small>${['available','unavailable','not_held','unknown'].includes(library.status) && Number.isFinite(queriedAt) && queriedAt <= Date.now() ? `조회 <time datetime="${esc(library.checkedAt)}">${esc(time(queriedAt,true))}</time>` : ''}</small><a href="${esc(library.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(library.name)} 원문 확인">원문 ↗</a></footer>` : '';
  const selectedSource = EXTRA_SOURCES.find(source => libraryIds.includes(source.id));
  const ownerMarkup = bookOwnersMarkup(book);
  const authorMarkup = `<span class="watcha-book__author" data-book-author title="${esc(book.info?.authors.join(' · ') || '')}">${esc(book.info ? book.info.authors.join(' · ') || '저자 정보 없음' : '저자 정보 확인 필요')}</span>`;
  return `<article class="watcha-book" data-book="${esc(book.id)}"${shelf ? ` data-cart-item="${esc(book.id)}"` : ''} data-state="${state}"><header><div class="watcha-book__media"><span class="watcha-book__cover"><span aria-hidden="true">표지 없음</span>${book.coverUrl ? `<img src="${esc(book.coverUrl)}" alt="${esc(book.title)} 표지" width="48" height="68" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>${cartButtonMarkup(book,shelf ? libraryIds[0] : null)}</div><div class="watcha-book__description"><h2><button class="watcha-book__open" type="button" data-open-book="${esc(book.id)}" aria-haspopup="dialog" aria-label="${esc(book.title)} 상세 보기">${esc(book.title)}</button></h2><div class="watcha-book__meta">${authorMarkup}${book.year ? `<span>${esc(book.year)}</span>` : ''}</div>${bookLocationsMarkup(book,libraryIds,shelf)}</div><div class="watcha-book__side"><span class="watcha-book__state"${failure ? ` title="${esc(failure)}"` : ''}>${state === 'available' ? '✓ ' : state === 'unavailable' ? '× ' : ''}${esc(book.loading && libraryIds.length ? state === 'pending' ? '조회 중' : `${stateLabel} · 갱신 중` : selectedSource?.manual ? '로그인 후 확인' : copyLabels || stateLabel)}</span>${ownerMarkup}</div></header>${shelf ? shelfFooter : loanRecoveryMarkup(book)}</article>`;
}

const renderedCards = new WeakMap();
function renderBookCards(filtered, emptyMessage, changedId) {
  const list = root.querySelector('[data-books]');
  const rows = new Map([...list.children].filter(row => row.dataset.book).map(row => [row.dataset.book, row]));
  const wanted = new Set(filtered.map(book => book.id));
  for (const row of [...list.children]) if (!wanted.has(row.dataset.book) && (filtered.length || row.dataset.book)) row.remove();
  const createRow = html => {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstElementChild;
  };
  for (const [index, book] of filtered.entries()) {
    let row = rows.get(book.id);
    if (!row || !changedId || changedId === book.id) {
      const html = bookMarkup(book), previous = row && renderedCards.get(row);
      if (!row) row = createRow(html);
      else if (previous?.html !== html) {
        const next = createRow(html);
        row.dataset.state = next.dataset.state;
        // Preserve the article, title button and cover while live results arrive.
        for (const selector of ['.watcha-book__state', '.watcha-book__meta', '.watcha-book__owners', '.watcha-book__locations', '.watcha-book__recovery']) {
          const current = row.querySelector(selector), incoming = next.querySelector(selector);
          if (current && incoming && current.outerHTML !== incoming.outerHTML) current.replaceWith(incoming);
        }
        const title = row.querySelector('[data-open-book]'), nextTitle = next.querySelector('[data-open-book]');
        if (title.textContent !== nextTitle.textContent) title.textContent = nextTitle.textContent;
        title.setAttribute('aria-label', nextTitle.getAttribute('aria-label'));
        const cartButton = row.querySelector('[data-cart-book]'), nextCartButton = next.querySelector('[data-cart-book]');
        if (cartButton && nextCartButton) {
          for (const name of ['aria-pressed','aria-label','title']) cartButton.setAttribute(name, nextCartButton.getAttribute(name));
        }
        if (previous?.coverUrl !== book.coverUrl) row.querySelector('.watcha-book__cover').replaceWith(next.querySelector('.watcha-book__cover'));
      }
      renderedCards.set(row, {html, coverUrl:book.coverUrl});
    }
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
  }
  if (!filtered.length && list.firstElementChild?.textContent !== emptyMessage) {
    const message = document.createElement('p');
    message.className = 'analytics__empty'; message.textContent = emptyMessage;
    list.replaceChildren(message);
  }
}

function bookInfoMarkup(book, error = '', libraryId = null) {
  const info = book.info;
  const facts = [['출간', info?.published || book.year], ['출판사', info?.publisher], ['분류', info?.genres.join(' · ')], ['ISBN', book.manualIsbn || book.result?.isbn || info?.isbn]].filter(([, value]) => value);
  const paragraphs = (info?.description || '왓챠피디아에서 책 소개를 제공하지 않습니다.').trim().split(/\n\s*\n/);
  const paragraph = value => `<p>${esc(value)}</p>`;
  const description = info ? `<section class="watcha-info__description"><h3>책 소개</h3>${paragraph(paragraphs[0])}${paragraphs.length > 1 ? `<details class="watcha-info__more"><summary>소개 더 보기</summary>${paragraphs.slice(1).map(paragraph).join('')}</details>` : ''}</section>` : '<p class="watcha-book__notice" role="status">책 정보를 불러오고 있습니다…</p>';
  const isbn = book.manualIsbn || book.result?.isbn || info?.isbn;
  return `<header class="watcha-info__header"><p>책 정보</p><form method="dialog"><button class="btn btn--ghost watcha-info__close" aria-label="책 정보 닫기" autofocus>닫기</button></form></header>
    <div class="watcha-info__body"><section class="watcha-info__overview"><span class="watcha-info__cover">${book.coverUrl ? `<img src="${esc(book.coverUrl)}" alt="${esc(book.title)} 표지" referrerpolicy="no-referrer">` : '표지 없음'}</span><div class="watcha-info__intro"><h2 id="watcha-info-title">${esc(info?.title || book.title)}</h2><p class="watcha-info__authors">${esc(info?.authors.join(' · ') || (info ? '저자 정보 없음' : '저자 정보를 불러오는 중…'))}</p>${bookOwnersMarkup(book)}${cartButtonMarkup(book,libraryId)}<dl>${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div></section>
    ${error ? `<p class="watcha-book__notice" role="alert">${esc(error)}</p><button class="btn btn--ghost" type="button" data-info-retry>다시 시도</button>` : description}
    <details class="watcha-info__loans"><summary><span>도서관 소장·대출 정보</span><small>대출 가능한 도서관 확인</small></summary><div data-info-loans>${bookLoansMarkup(book)}</div></details>
    <nav class="watcha-info__sources" aria-label="책 원문과 외부 서비스"><h3>관련 링크</h3><div><a class="btn btn--ghost" href="${esc(book.url)}" target="_blank" rel="noopener noreferrer">왓챠피디아 ↗</a>${EXTRA_SOURCES.map(source => `<a class="btn btn--ghost" href="${esc(sourceSearchUrl(source.id, isbn, book.title))}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ↗</a>`).join('')}</div></nav></div>`;
}

async function loadBookInfo(book, run) {
  if (book.info) return book.info;
  if (infoRequests.has(book.id)) return infoRequests.get(book.id);
  const request = (async () => {
    const result = await api({action:'info', id:book.id});
    if (epoch !== run) throw new Error('조회가 취소되었습니다.');
    if (!result.info || !Array.isArray(result.info.authors)) throw new Error('책 정보를 확인하지 못했습니다. 다시 시도해주세요.');
    book.info = result.info;
    for (const collection of collections.values()) for (const value of collection.books) if (value.id === book.id) value.info = result.info;
    const author = root.querySelector(`[data-book="${book.id}"] [data-book-author]`);
    if (author) { author.textContent = result.info.authors.join(' · ') || '저자 정보 없음'; author.title = result.info.authors.join(' · '); }
    if (selectedGenres.length) renderBooks();
    else renderGenreFilters(combinedBooks());
    return result.info;
  })();
  infoRequests.set(book.id, request);
  try { return await request; }
  finally { if (infoRequests.get(book.id) === request) infoRequests.delete(book.id); }
}

async function hydrateBookInfo(run, profileIds = null) {
  const candidates = profileIds ? [...new Map(profileIds.flatMap(id => {
    const collection = collections.get(id);
    return collection?.complete && collection.storage !== 'offline' ? collection.books.map(book => [book.id, book]) : [];
  })).values()] : combinedBooks();
  const pending = candidates.filter(book => !book.info);
  let done = 0, failed = 0, retryAfter = 0;
  if (!pending.length) return;
  for (const book of pending) {
    if (epoch !== run) return;
    try { await loadBookInfo(book, run); }
    catch (error) {
      if (epoch !== run) return;
      failed++;
      if (error.retryAfter || failed >= 3) { retryAfter = error.retryAfter || 60; break; }
    }
    done++;
    root.querySelector('[data-info-status]').textContent = `분류·저자·책 정보 저장 중 · ${done}/${pending.length}권`;
    if (done % 25 === 0) await persist(run);
    // ponytail: pace old-cache metadata reads; a shared server queue only if multi-user traffic requires it.
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  if (epoch !== run) return;
  await persist(run);
  if (epoch !== run) return;
  root.querySelector('[data-info-status]').textContent = retryAfter ? '책 정보 연결이 잠시 제한되었습니다. 기다린 뒤 자동으로 이어서 보완합니다.' : failed ? `책 정보 ${failed}권을 확인하지 못했습니다. 책을 눌러 다시 시도할 수 있습니다.` : '';
  if (retryAfter) infoTimer = setTimeout(() => { if (epoch === run) hydrateBookInfo(run, profileIds); }, retryAfter * 1000);
}

async function openBookInfo(id, libraryId = null, onCartChange = null) {
  const book = combinedBooks().find(value => value.id === id) || (cart.has(id) ? cartLookupBook(cart.get(id)) : null);
  if (!book) return;
  const run = epoch, dialog = document.createElement('dialog');
  dialog.className = 'watcha-info'; dialog.dataset.book = book.id; dialog.setAttribute('aria-labelledby', 'watcha-info-title');
  dialog.innerHTML = bookInfoMarkup(book,'',libraryId); root.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    const shelf = root.querySelector('.watcha-cart');
    (shelf ? shelf.querySelector(`[data-open-book="${id}"]`) || shelf.querySelector('[aria-label="서가 닫기"]') : root.querySelector(`[data-open-book="${id}"]`))?.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && (event.offsetX < 0 || event.offsetY < 0 || event.offsetX > dialog.clientWidth || event.offsetY > dialog.clientHeight)) dialog.close();
    const cartButton = event.target.closest('[data-cart-book]');
    if (cartButton) { toggleCart(cartButton.dataset.cartBook,libraryId || selectedLibraries[0]); onCartChange?.(); return; }
    if (event.target.closest('[data-info-retry]')) update();
    const button = event.target.closest('[data-check]');
    if (button) retryBook(button.dataset.check);
  });
  dialog.addEventListener('submit', event => {
    const form = event.target.closest('[data-isbn-form]'); if (!form) return;
    event.preventDefault(); const isbn = normalizeIsbn(form.elements.isbn.value);
    if (!isbn) { form.elements.isbn.setCustomValidity('유효한 ISBN을 입력해주세요.'); form.elements.isbn.reportValidity(); return; }
    retryBook(form.dataset.isbnForm, isbn);
  });
  dialog.addEventListener('input', event => { if (event.target.name === 'isbn') event.target.setCustomValidity(''); });
  dialog.addEventListener('toggle', event => {
    if (event.target.matches('.watcha-info__loans') && event.target.open) fillBookSources(id, run);
  }, true);
  dialog.showModal();
  function paint(error = '') {
    const expanded = dialog.querySelector('.watcha-info__loans')?.open;
    dialog.innerHTML = bookInfoMarkup(combinedBooks().find(value => value.id === id) || book, error,libraryId);
    if (expanded) dialog.querySelector('.watcha-info__loans').open = true;
  }
  async function update() {
    paint();
    try {
      book.info = await loadBookInfo(book, run);
      if (dialog.open && epoch === run) paint();
      if (epoch === run) await persist(run);
    } catch (error) { if (dialog.open && epoch === run) paint(error.message); }
  }
  if (!book.info) await update();
}

function shuffleBooks() {
  const shuffled = combinedBooks();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  randomBookOrder = new Map(shuffled.map((book, index) => [book.id, index]));
  bookSort = 'random';
  renderBooks();
}

function renderBooks(changed) {
  updateCartButton();
  const query = root.querySelector('[data-search]').value.trim().toLocaleLowerCase();
  const only = root.querySelector('[data-available]').checked;
  const combined = combinedBooks();
  renderGenreFilters(combined);
  const failures = combined.filter(loanFailure).length;
  const filtered = combined.filter(book => book.title.toLocaleLowerCase().includes(query)
    && (!selectedGenres.length || bookGenres(book).some(genre => selectedGenres.includes(genre)))
    && (!only || ['available','pending','unknown'].includes(selectedAvailability(book, selectedLibraries))));
  if (bookSort === 'alphabetical') filtered.sort((a,b) => a.title.localeCompare(b.title,'ko',{numeric:true,ignorePunctuation:true}));
  else if (bookSort === 'random') filtered.sort((a, b) => (randomBookOrder.get(a.id) ?? Infinity) - (randomBookOrder.get(b.id) ?? Infinity));
  for (const button of root.querySelectorAll('[data-sort]')) button.setAttribute('aria-pressed',String(button.dataset.sort === bookSort));
  root.querySelector('[data-sort="random"]').disabled = filtered.length < 2;
  renderBookCards(filtered, !selectedProfiles.length ? '야도란 또는 도선생을 선택해주세요.' : only && !selectedLibraries.length ? '도서관을 하나 이상 선택해주세요.' : query || selectedGenres.length ? '선택한 검색·장르·대출 조건에 맞는 책이 없습니다.' : '선택한 도서관에서 빌릴 수 있는 책이 없습니다.', changed?.id);
  const dialog = root.querySelector('.watcha-info[data-book]');
  const shown = combined.find(book => book.id === dialog?.dataset?.book);
  if (shown && (!changed?.id || changed.id === shown.id)) dialog.querySelector('[data-info-loans]').innerHTML = bookLoansMarkup(shown);
  const sourceId = selectedSourceId();
  const queryTimes = combined.flatMap(book => (book.result?.libraries || [])
    .filter(source => source.id === sourceId && ['available','unavailable','not_held','unknown'].includes(source.status))
    .map(source => Date.parse(source.checkedAt || book.result.checkedAt)))
    .filter(value => Number.isFinite(value) && value <= Date.now());
  const firstQuery = queryTimes.length ? time(Math.min(...queryTimes), true) : '';
  const lastQuery = queryTimes.length ? time(Math.max(...queryTimes), true) : '';
  const libraryName = libraries.find(library => library.id === selectedLibraries[0])?.name || '도서관';
  root.querySelector('[data-cache]').textContent = selectedLibraries.length && automaticSources.includes(sourceId)
    ? queryTimes.length ? `${libraryName} 조회 ${firstQuery === lastQuery ? lastQuery : firstQuery + ' ~ ' + lastQuery}` : `${libraryName} 조회 기록 없음`
    : '';
  const done = combined.filter(book => book.error || book.result && (!book.result.isbn || book.result.libraries?.some(library => library.id === sourceId))).length;
  const available = filtered.filter(book => selectedAvailability(book, selectedLibraries) === 'available').length;
  root.querySelector('[data-count]').textContent = selectedProfiles.length ? only ? `빌릴 수 있는 책 ${available.toLocaleString('ko-KR')}권` : `책 ${filtered.length.toLocaleString('ko-KR')}권` : '계정을 선택해주세요.';
  root.querySelector('[data-totals]').textContent = selectedProfiles.length ? [
    only && filtered.length > available ? `확인 필요 ${(filtered.length - available).toLocaleString('ko-KR')}권` : '',
    done < combined.length ? `조회 ${done.toLocaleString('ko-KR')} / ${combined.length.toLocaleString('ko-KR')}권` : `전체 ${combined.length.toLocaleString('ko-KR')}권`,
    failures ? `조회 실패 ${failures.toLocaleString('ko-KR')}권` : '',
  ].filter(Boolean).join(' · ') : '';
  root.querySelector('[data-batch]').disabled = busy || !combined.length;
  const retry = root.querySelector('[data-retry-failed]');
  retry.hidden = !combined.some(book => loanFailure(book) || needsSources(book, [sourceId], false).length);
  retry.disabled = busy || !automaticSources.includes(sourceId);
  root.querySelector('[data-more-libraries]').textContent = '즐겨찾기 등록';
}


const selectedSourceId = () => selectedLibraries[0]?.split(':')[0] || 'gyeonggi';

async function persist(run) {
  rememberProfile();
  for (const [id, collection] of collections) {
    if (epoch !== run) return;
    if (!collection.complete) continue;
    const saved = await writeCache(id.split(':').at(-1), {version:1,kind:collection.kind || collectionKind,storage:collection.storage,cloudMigrated:collection.cloudMigrated,cloudFetchedAt:collection.cloudFetchedAt,total:collection.total, checkedAt:collection.checkedAt, books:collection.books.map(({loading, ...book}) => book)});
    if (epoch === run && !saved) root.querySelector('[data-status]').textContent = '이 브라우저에 저장하지 못했습니다. 다시 방문하면 목록을 새로 조회합니다.';
  }
}

function scheduleLoanRender(book, run) {
  changedLoanBooks.add(book.id);
  if (loanRenderTimer !== null) return;
  loanRenderTimer = setTimeout(() => {
    loanRenderTimer = null;
    const changed = changedLoanBooks.size === 1 ? {id:changedLoanBooks.values().next().value} : undefined;
    changedLoanBooks.clear();
    if (epoch === run) renderBooks(changed);
  }, 100);
}

async function checkBook(book, run, isbn = book.manualIsbn || null, sourceId = null, refresh = false, lookupRequests = null) {
  if (loanRequests.has(book.id)) {
    await loanRequests.get(book.id);
    if (epoch !== run) return;
    book = combinedBooks().find(value => value.id === book.id) || book;
    if (!refresh && !isbn && !needsSources(book, (sourceId || selectedSourceId()).split(',')).length) return;
  }
  const sources = (sourceId || selectedSourceId()).split(',');
  // ponytail: scan loaded books for cooldowns; use provider deadlines if catalogue size makes this costly.
  const seconds = Math.max(loanRetrySeconds(book, sources), ...[...collections.values()].flatMap(collection => collection.books.map(value => loanRetrySeconds(value, sources))));
  if (seconds) {
    loanWarning = `도서관 요청 제한이 유지되고 있습니다. ${seconds}초 후 다시 시도하거나 도서관에서 직접 확인해주세요.`;
    root.querySelector('[data-status]').textContent = loanWarning;
    return;
  }
  const request = lookupBook(book, run, isbn, sourceId, refresh, lookupRequests);
  loanRequests.set(book.id, request);
  try { await request; }
  finally { if (loanRequests.get(book.id) === request) loanRequests.delete(book.id); }
}

async function lookupBook(book, run, isbn, sourceId, refresh, lookupRequests) {
  const correctedIsbn = isbn || book.manualIsbn;
  const requestedSources = (sourceId || selectedSourceId()).split(',');
  const oldResult = correctedIsbn && correctedIsbn !== book.result?.isbn ? null : book.result;
  const previous = oldResult ? {...oldResult,libraries:(oldResult.libraries || []).filter(source => !requestedSources.includes(source.id))} : null;
  const lookupIsbn = correctedIsbn || previous?.isbn || book.info?.isbn;
  if (isbn && !sourceId) { book.manualIsbn = isbn; corrections.set(book.id, isbn); }
  book.loading = true; book.error = ''; book.result = previous;
  const matching = [...collections.values()].flatMap(collection => collection.books.filter(value => value.id === book.id && value !== book));
  for (const value of matching) Object.assign(value, {loading:true, error:'', result:previous});
  scheduleLoanRender(book, run);
  try {
    const scope = {sources:sourceId || selectedSourceId(),...(refresh ? {refresh:'1'} : {})};
    const params = lookupIsbn ? { action:'availability', isbn:lookupIsbn, ...(book.manualIsbn ? {id:book.id} : {}), ...scope } : { action:'book', id:book.id, ...scope };
    // Share only this batch's identical live requests; correction IDs stay separate.
    const key = JSON.stringify(params);
    if (lookupRequests && !lookupRequests.has(key)) lookupRequests.set(key, api(params));
    const result = await (lookupRequests ? lookupRequests.get(key) : api(params));
    if (epoch !== run) return;
    const updatedSources = new Set(result.libraries.map(library => library.id));
    book.result = previous?.isbn === result.isbn ? {...previous,...result,libraries:[...(previous.libraries || []).filter(library => !updatedSources.has(library.id)).map(library => ({...library,checkedAt:library.checkedAt || previous.checkedAt || new Date(0).toISOString()})),...result.libraries]} : result;
    if (!sourceId) book.manual = Boolean(isbn);
    if (result.info) book.info = result.info;
    cachedSnapshot({books:[book]});
  } catch (error) {
    if (epoch === run) {
      book.error = error.message;
      const errorCode = error.httpStatus === 429 ? 'rate_limited' : [401,403].includes(error.httpStatus) ? 'access_denied'
        : error.httpStatus >= 500 ? 'service_unavailable' : error.httpStatus ? 'http_error' : error.name === 'SyntaxError' ? 'invalid_response' : 'connection_error';
      book.result = {...previous, isbn:lookupIsbn || null, libraries:[...(previous?.libraries || []), ...requestedSources.map(id => ({
        id, status:'error', copies:[], message:error.message, errorCode, checkedAt:new Date().toISOString(),
        ...(error.httpStatus ? {httpStatus:error.httpStatus} : {}), ...(error.retryAfter ? {retryAfter:error.retryAfter} : {}),
      }))]};
      cachedSnapshot({books:[book]});
    }
  }
  if (epoch === run) {
    await writeLoanCache(book.result);
    if (epoch !== run) return;
    book.loading = false;
    // Catalogues can finish loading while a saved shelf book is being checked.
    for (const value of [...collections.values()].flatMap(collection => collection.books.filter(value => value.id === book.id && value !== book))) {
      if (value.manualIsbn && value.manualIsbn !== book.result?.isbn) continue;
      Object.assign(value, {loading:false, error:book.error, result:book.result, manual:book.manual ?? value.manual, manualIsbn:book.manualIsbn || value.manualIsbn, ...(book.info ? {info:book.info} : {})});
    }
    scheduleLoanRender(book, run);
  }
}

async function batch(selected, run, sourceId = selectedSourceId(), refresh = false) {
  // ponytail: eight simultaneous public lookups; a server queue only if shared jobs become necessary.
  const initialSelection = selectedSourceId(), selection = librarySelection;
  const sources = (sourceId || initialSelection).split(',');
  if (sources.every(id => !automaticSources.includes(id))) return;
  const lookupRequests = new Map();
  let cursor = 0, done = 0;
  await Promise.all(Array.from({length:8}, async () => {
    while (cursor < selected.length && epoch === run && selectedSourceId() === initialSelection && selection === librarySelection && !loanWarning) {
      const book = selected[cursor++];
      await checkBook(book, run, null, sourceId, refresh, lookupRequests);
      if (epoch !== run) return;
      const failure = book.result?.libraries?.find(source => sources.includes(source.id)
        && ['rate_limited','access_denied'].includes(source.errorCode));
      if (failure && selectedSourceId() === initialSelection && selection === librarySelection) {
        loanWarning = `${failure.message} 추가 자동 조회를 중단했습니다.`;
      }
      done++;
      root.querySelector('[data-status]').textContent = loanWarning || '대출 상태 확인 중…';
      if (done % 25 === 0) await persist(run);
    }
  }));
}
async function fillSelectedSource(run) {
  const source = selectedSourceId();
  if (!automaticSources.includes(source) || busy || loanWarning || !selectedLibraries.length) return;
  const pending = combinedBooks().filter(book => needsSources(book, [source]).length);
  if (pending.length) await operation(value => batch(pending, value, source));
}

async function fillBookSources(id, run) {
  let book = combinedBooks().find(value => value.id === id);
  if (!book || epoch !== run) return;
  if (loanRequests.has(id)) await loanRequests.get(id);
  if (epoch !== run) return;
  book = combinedBooks().find(value => value.id === id);
  const sources = needsSources(book, automaticSources);
  if (!sources.length) return;
  await checkBook(book, run, null, sources.join(','));
  if (epoch === run) await persist(run);
}

async function operation(work) {
  if (busy) return;
  loanWarning = '';
  busy = true; const run = epoch, initialSource = selectedLibraries[0], selection = librarySelection; renderBooks();
  root.querySelector('[data-status]').textContent = '공개 자료를 확인하고 있습니다…';
  try {
    await work(run);
    if (epoch === run) {
      await persist(run);
      if (epoch === run) {
        const failures = combinedBooks().filter(loanFailure).length;
        root.querySelector('[data-status]').textContent = loanWarning || (failures ? `조회 실패 ${failures}권 · 책별 원인을 확인하고 다시 시도하거나 도서관에서 직접 확인해주세요.` : complete ? '대출 상태 확인 완료' : '불러온 책 확인 완료 · 전체 목록을 동기화해주세요.');
      }
    }
  } catch (error) { if (epoch === run) root.querySelector('[data-status]').textContent = error.message; }
  finally { if (epoch === run) { busy = false; renderBooks(); if (initialSource !== selectedLibraries[0] || selection !== librarySelection) fillSelectedSource(run); } }
}
async function loadAll(run, previous = [], deferLookup = false) {
  const savedBooks = new Map([...combinedBooks(), ...previous].map(book => [book.id, book]));
  const ids = new Set(); let nextPage = 1;
  books = []; total = 0; checkedAt = null; complete = false;
  do {
    const page = await api({action:'wishes', page:nextPage, profile:selectedProfile});
    if (epoch !== run) return;
    if (ids.size && total !== page.total || page.books.some(book => ids.has(book.id))) throw new Error('조회 중 목록이 변경되었습니다. 목록을 새로 불러와주세요.');
    total = page.total; nextPage = page.nextPage; checkedAt = page.checkedAt;
    for (const book of page.books) { ids.add(book.id); books.push({...savedBooks.get(book.id), ...book, manualIsbn:corrections.get(book.id)}); }
    renderBooks();
    root.querySelector('[data-status]').textContent = `전체 목록 불러오는 중 · ${books.length}/${total}권`;
  } while (nextPage !== null);
  if (books.length !== total) throw new Error('전체 목록을 확인하지 못했습니다. 새로 불러오기를 눌러주세요.');
  complete = true;
  await persist(run);
  if (epoch === run && !deferLookup) await batch(books.filter(book => needsSources(book, [selectedSourceId()]).length), run);
}

async function init(forceRefresh = false, refreshStatuses = false, allProfiles = false) {
  rememberProfile();
  const previous = new Map([...collections].map(([id,collection]) => [id,cachedSnapshot(collection)]));
  epoch++; controller?.abort(); controller = new AbortController();
  infoRequests.clear(); loanRequests.clear(); loanWarning = '';
  clearTimeout(loanRenderTimer); loanRenderTimer = null; changedLoanBooks.clear();
  clearTimeout(infoTimer);
  genreSignature = '';
  activeLoaded = false; collections.clear(); books = []; total = 0; checkedAt = null; busy = false; complete = false;
  const run = epoch;
  root.innerHTML = '<p class="analytics__empty" role="status">화면을 준비하고 있습니다.</p>';
  const gate = document.createElement('div');
  const allowed = localPreview || await requireAdmin(gate);
  if (run !== epoch) return;
  if (!allowed) { root.replaceChildren(gate); return; }
  root.innerHTML = `<div class="admin-shell"><nav class="analytics__nav admin-nav" aria-label="운영자 페이지 이동"><a class="analytics__brand" href="index.html">BOOONG <small>OPERATIONS</small></a><a class="analytics__back" href="admin.html">← 운영자 공간</a></nav><header class="watcha-hero"><p class="analytics__eyebrow">왓챠–도서관${localPreview ? ' · 로컬 미리보기' : ''}</p><h1>우리가 돈이 없지 독서를 안 하냐</h1></header><section class="watcha-controls" aria-label="계정과 도서관 선택"><div class="watcha-account-row"><fieldset class="watcha-choice-group" data-accounts><legend>누구의 책을 볼까요?</legend>${WATCHA_PROFILES.map(profile => `<button type="button" class="watcha-choice" data-profile-id="${profile.id}" aria-pressed="${selectedProfiles.includes(profile.id)}">${esc(profile.name)}</button>`).join('')}</fieldset><div class="watcha-sync"><button class="btn btn--secondary" type="button" data-refresh aria-label="왓챠 목록 전체 동기화" aria-describedby="watcha-sync-help" title="모든 계정의 읽고 싶은 책·읽은 책과 새 책 정보를 갱신합니다. 실행 기록은 이용자 모두에게 공유됩니다."><span>목록 동기화</span><small class="watcha-sync-age" data-sync-age role="status">${syncDateLabel(lastFullSync)}</small></button><p id="watcha-sync-help" hidden>모든 계정의 읽고 싶은 책·읽은 책과 새 책 정보를 갱신합니다. 실행 기록은 이용자 모두에게 공유됩니다.</p></div></div><fieldset class="watcha-choice-group watcha-collections" data-collections><legend class="sr-only">책 목록</legend><button type="button" class="watcha-choice" data-collection-kind="wishes" aria-pressed="${collectionKind === 'wishes'}">읽고 싶은 책</button><button type="button" class="watcha-choice" data-collection-kind="ratings" aria-pressed="${collectionKind === 'ratings'}">읽은 책 <small>평점 기록</small></button></fieldset><div class="watcha-library-row"><fieldset class="watcha-choice-group" data-libraries><legend>어디에서 빌릴까요?</legend>${libraryPickerMarkup()}</fieldset><button class="btn btn--ghost watcha-cart-toggle" type="button" data-cart-open aria-haspopup="dialog" aria-label="서가 열기">${shelfIcon}</button></div><div class="watcha-filters"><label>책 검색<input type="search" data-search placeholder="책 제목"></label><label class="watcha-check"><input type="checkbox" data-available checked> 대출 가능한 책만</label><div class="watcha-list-options"><details class="watcha-genres-filter"><summary>장르 <span data-genres-summary>전체</span></summary><fieldset class="watcha-genres" data-genres></fieldset></details><fieldset class="watcha-sort" data-sort-options><legend>정렬</legend><div><button type="button" class="watcha-choice" data-sort="popular" aria-pressed="${bookSort === 'popular'}">${collectionKind === 'ratings' ? '읽은 사람 많은 순' : '많이 담은 순'}</button><button type="button" class="watcha-choice" data-sort="random" aria-pressed="${bookSort === 'random'}" title="다시 누르면 새로 섞습니다">랜덤</button><button type="button" class="watcha-choice" data-sort="alphabetical" aria-pressed="${bookSort === 'alphabetical'}">가나다순</button></div></fieldset></div></div></section><section class="watcha-progress" aria-label="도서관 조회 결과"><div class="watcha-progress__summary"><div class="watcha-results-heading"><p data-count></p><button class="btn btn--secondary watcha-recheck" type="button" data-batch aria-label="선택한 도서관 조회하기" aria-describedby="watcha-isbn-note">조회하기</button><button class="btn btn--secondary watcha-recheck" type="button" data-retry-failed hidden>실패·대기만 재조회</button></div></div><div class="watcha-progress__meta"><p data-totals></p><p data-status role="status" aria-live="polite"></p><p data-cache></p><p data-info-status role="status"></p><p data-cart-status role="status" aria-live="polite"></p><details class="watcha-query-help"><summary>조회 기준</summary><p class="watcha-isbn-note" id="watcha-isbn-note">ISBN이 같은 판본을 조회하고 결과를 이 브라우저에 15분간 보관합니다. 최신 상태는 ‘조회하기’ 또는 ‘다시 조회’로 확인해주세요. ‘미소장’으로 표시되어도 다른 판본이나 전자책은 있을 수 있습니다.</p></details></div></section><div class="watcha-books" data-books></div><footer class="admin-footer">사회교육공동체 BOOONG <span>왓챠–도서관</span></footer></div>`;
  root.querySelector('[data-collections]').addEventListener('click', event => {
    const button = event.target.closest('[data-collection-kind]');
    if (!button || button.dataset.collectionKind === collectionKind) return;
    collectionKind = button.dataset.collectionKind;
    selectedGenres = [];
    init();
  });
  root.querySelector('[data-search]').addEventListener('input', renderBooks);
  root.querySelector('[data-available]').addEventListener('change', renderBooks);
  root.querySelector('[data-genres]').addEventListener('change', event => {
    const genre = event.target.dataset.genre;
    if (genre !== undefined) selectedGenres = event.target.checked ? [...new Set([...selectedGenres, genre])] : selectedGenres.filter(value => value !== genre);
    else if (event.target.hasAttribute('data-genres-all')) selectedGenres = [];
    renderBooks();
  });
  root.querySelector('[data-accounts]').addEventListener('click', event => {
    const button = event.target.closest('[data-profile-id]');
    if (!button) return;
    const id = button.dataset.profileId;
    selectedProfiles = selectedProfiles.includes(id) ? selectedProfiles.filter(value => value !== id) : [...selectedProfiles, id];
    try { localStorage.setItem(profileSelectionKey, JSON.stringify(selectedProfiles)); } catch { /* Optional preference. */ }
    init();
  });
  root.querySelector('[data-libraries]').addEventListener('click', event => {
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      const fromMenu = Boolean(favorite.closest('details'));
      const id = favorite.dataset.favorite;
      toggleFavorite(id);
      root.querySelector('[data-libraries]').innerHTML = '<legend>어디에서 빌릴까요?</legend>' + libraryPickerMarkup();
      if (fromMenu) root.querySelector('.watcha-more-libraries').open = true;
      (root.querySelector(fromMenu ? `.watcha-more-libraries [data-favorite="${id}"]` : `[data-library-defaults] [data-favorite="${id}"]`) || root.querySelector('[data-more-libraries]')).focus();
      renderBooks();
      return;
    }
    const button = event.target.closest('[data-library]');
    if (!button) return;
    const previousSource = selectedSourceId();
    selectedLibraries = [button.dataset.library];
    if (selectedSourceId() !== previousSource) changeLoanSource();
    root.querySelector('[data-libraries]').innerHTML = '<legend>어디에서 빌릴까요?</legend>' + libraryPickerMarkup();
    (root.querySelector(`[data-library-defaults] [data-library="${button.dataset.library}"]`) || root.querySelector('[data-more-libraries]')).focus();
    try { localStorage.setItem(selectionKey, JSON.stringify(selectedLibraries)); } catch { /* Optional preference. */ }
    if (EXTRA_SOURCES.some(source => source.id === button.dataset.library)) root.querySelector('[data-available]').checked = false;
    renderBooks();
    fillSelectedSource(epoch);
  });
  root.querySelector('[data-cart-open]').addEventListener('click', openCart);
  root.querySelector('[data-refresh]').addEventListener('click', confirmFullSync);
  root.querySelector('[data-sort-options]').addEventListener('click', event => {
    const button = event.target.closest('[data-sort]');
    if (!button || !['popular','random','alphabetical'].includes(button.dataset.sort)) return;
    bookSort = button.dataset.sort;
    if (bookSort === 'random') shuffleBooks();
    else renderBooks();
  });
  root.querySelector('[data-batch]').addEventListener('click', () => init(false, true));
  root.querySelector('[data-retry-failed]').addEventListener('click', retryFailedBooks);
  root.querySelector('[data-books]').addEventListener('click', event => {
    const cartButton = event.target.closest('[data-cart-book]');
    if (cartButton) { toggleCart(cartButton.dataset.cartBook); return; }
    const open = event.target.closest('[data-open-book]');
    if (open) { openBookInfo(open.dataset.openBook); return; }
    const button = event.target.closest('[data-check]');
    if (button) retryBook(button.dataset.check);
    else if (!event.target.closest('a,button,summary,input,form')) {
      const card = event.target.closest('.watcha-book[data-book]');
      if (card) openBookInfo(card.dataset.book);
    }
  });
  root.querySelector('[data-books]').addEventListener('error', event => {
    if (event.target.matches('.watcha-book__cover img')) event.target.remove();
  }, true);
  if (EXTRA_SOURCES.some(source => selectedLibraries.includes(source.id))) root.querySelector('[data-available]').checked = false;
  renderBooks();
  renderSyncHistory();
  refreshSyncHistory();
  const profilesToLoad = allProfiles ? WATCHA_PROFILES.map(profile => profile.id) : selectedProfiles;
  const loadProfiles = async (kind, options, profileIds = profilesToLoad) => {
    const read = async id => [id, await readCache(id,{kind,...options,onProgress:(...args)=>options.onProgress?.(id,...args)})];
    if (kind !== 'ratings' || !options.refresh) return Promise.all(profileIds.map(read));
    // Pace account syncs as well as pages so the four accounts do not hit Watcha's limit together.
    const loaded = [];
    for (const id of profileIds) loaded.push(await read(id));
    return loaded;
  };
  const cachedProfiles = await loadProfiles(collectionKind,{sources:selectedSourceId(),refresh:forceRefresh,signal:controller.signal,onProgress:(id,message,snapshot)=>{
    if (epoch !== run) return;
    if (snapshot) { collections.set(id,{...cachedSnapshot(snapshot),complete:true}); renderBooks(); }
    root.querySelector('[data-status]').textContent = message;
  }});
  if (epoch !== run) return;
  const otherKeys = [];
  let ratedProfiles = [];
  if (forceRefresh && allProfiles) {
    const otherKind = collectionKind === 'wishes' ? 'ratings' : 'wishes';
    const others = await loadProfiles(otherKind,{refresh:true,signal:controller.signal,onProgress:(id,message)=>{if(epoch===run)root.querySelector('[data-status]').textContent=message;}});
    if (epoch !== run) return;
    if (otherKind === 'ratings') ratedProfiles = others;
    for (const [id,cached] of others) {
      const key = otherKind+':'+id;
      otherKeys.push(key);
      if (cached?.version === 1 && cached.books?.length === cached.total) collections.set(key,{...cachedSnapshot(cached),kind:otherKind,complete:true});
    }
  } else if (collectionKind === 'wishes' && selectedProfiles.length) {
    ratedProfiles = await loadProfiles('ratings',{signal:controller.signal},WATCHA_PROFILES.map(profile => profile.id));
    if (epoch !== run) return;
  }
  wishlistRatings.clear();
  for (const [id, collection] of ratedProfiles) for (const book of collection?.books || []) {
    if (!Number.isFinite(book.rating)) continue;
    wishlistRatings.set(book.id,{...wishlistRatings.get(book.id),[id]:book.rating});
  }
  for (const [id, cached] of cachedProfiles) {
    if (cached?.version === 1 && Array.isArray(cached.books) && cached.books.length === cached.total) {
      for (const book of cached.books) if (!book.info && book.result?.info) book.info = book.result.info;
      collections.set(id, {...cachedSnapshot(cached), kind:collectionKind,complete:true});
    }
  }
  renderBooks();
  const refreshed = new Set();
  for (const id of selectedProfiles) {
    if (epoch !== run) return;
    selectedProfile = id;
    const cached = collections.get(id);
    books = cached?.books || []; total = cached?.total || 0; checkedAt = cached?.checkedAt; complete = Boolean(cached?.complete); activeLoaded = true;
    corrections.clear();
    for (const book of [...books, ...(previous.get(id)?.books || [])]) if (book.manualIsbn) corrections.set(book.id, book.manualIsbn);
    const responseCache = cachedProfiles.find(([value]) => value === id)?.[1];
    if (responseCache?.storage === 'offline') {
      root.querySelector('[data-status]').textContent = responseCache.storageError;
    } else if (cached?.storage === 'firebase') {
      if (refreshStatuses) await operation(async value => {
        const selected = combinedBooks().filter(book => (!book.result || book.result.isbn || loanFailure(book)) && !refreshed.has(book.id));
        await batch(selected,value,selectedSourceId(),true);
        for (const book of selected) refreshed.add(book.id);
      });
      else if (!forceRefresh) await fillSelectedSource(run);
    } else if (!forceRefresh && cached) {
      const pending = books.filter(book => !book.result && !book.error);
      if (books.some(book => !Object.hasOwn(book, 'coverUrl'))) await operation(value => loadAll(value, books, forceRefresh || refreshStatuses));
      else if (!refreshStatuses && pending.length) await operation(value => batch(pending, value));
      else if (!refreshStatuses) await fillSelectedSource(run);
    } else await operation(value => loadAll(value, books, forceRefresh || refreshStatuses));
    if (epoch !== run) return;
    rememberProfile();
  }
  if (epoch === run) {
    if (refreshStatuses) {
      const onlineIds = cachedProfiles.filter(([, value]) => value?.storage !== 'offline').map(([id]) => id);
      const pending = combinedBooks().filter(book => !refreshed.has(book.id) && book.profileIds.some(id => onlineIds.includes(id)) && (!book.result || book.result.isbn || loanFailure(book)));
      if (pending.length) await operation(value => batch(pending, value, selectedSourceId(), true));
    }
    if (epoch !== run) return;
    renderBooks();
    if (selectedProfiles.length && !root.querySelector('[data-status]').textContent) root.querySelector('[data-status]').textContent = '책 목록 불러오기 완료';
    if (forceRefresh) {
      await persist(run);
      if (epoch !== run) return;
      const failed = [...profilesToLoad,...otherKeys].filter(id => !collections.get(id)?.complete || collections.get(id)?.storage === 'offline').length;
      root.querySelector('[data-status]').textContent = failed ? `목록 동기화 ${failed}개 목록 연결 실패 · 이전 목록을 유지합니다.` : '왓챠 목록 동기화 완료';
    }
    await hydrateBookInfo(run, forceRefresh ? [...profilesToLoad,...otherKeys] : null);
  }
}

async function retryFailedBooks() {
  if (busy || !automaticSources.includes(selectedSourceId())) return;
  const combined = combinedBooks();
  const seconds = Math.max(0, ...combined.map(book => loanRetrySeconds(book)));
  if (seconds) {
    root.querySelector('[data-status]').textContent = `도서관 요청 제한이 유지되고 있습니다. ${seconds}초 후 다시 시도하거나 도서관에서 직접 확인해주세요.`;
    return;
  }
  const pending = combined.filter(book => !book.loading && (loanFailure(book) || needsSources(book, [selectedSourceId()], false).length));
  if (pending.length) await operation(run => batch(pending, run, selectedSourceId(), true));
}

async function retryBook(id, isbn) {
  if (busy) return;
  rememberProfile();
  const profileId = selectedProfiles.find(value => collections.get(value)?.books.some(book => book.id === id));
  const collection = collections.get(profileId);
  if (!collection) return;
  const book = collection.books.find(value => value.id === id);
  const seconds = loanRetrySeconds(book);
  if (seconds) {
    root.querySelector('[data-status]').textContent = `도서관 요청 제한이 유지되고 있습니다. ${seconds}초 후 다시 시도하거나 도서관에서 직접 확인해주세요.`;
    return;
  }
  selectedProfile = profileId; ({books, total, checkedAt, complete} = collection); activeLoaded = true;
  corrections.clear();
  for (const book of books) if (book.manualIsbn) corrections.set(book.id, book.manualIsbn);
  await operation(run => checkBook(books.find(book => book.id === id), run, isbn, null, true));
}
  if (root) {
  let uid = adminAccountId();
  if (!localPreview) onAdminAccountChange(value => { if (value !== uid) { uid = value; init(); } });
  window.addEventListener('focus', () => { if (root.querySelector('[data-sync-age]')) refreshSyncHistory(); });
  init();
}
