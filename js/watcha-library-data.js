export const WATCHA_PROFILES = [
  { id: 'WwRqoyDgkV5lz', name: '야도란', url: 'https://pedia.watcha.com/ko/users/WwRqoyDgkV5lz' },
  { id: '6ewxa7ae1WvQ1', name: '도선생', url: 'https://pedia.watcha.com/ko/users/6ewxa7ae1WvQ1' },
  { id: '36lvX8ERWLvXd', name: '현석 김', url: 'https://pedia.watcha.com/ko/users/36lvX8ERWLvXd' },
  { id: 'djaxbZM08xLw8', name: '김민석', url: 'https://pedia.watcha.com/ko/users/djaxbZM08xLw8' },
];

export const EXTRA_SOURCES = [
  {id:'millie', name:'밀리의 서재', manual:true, browseUrl:'https://www.millie.co.kr/v3/search'},
  {id:'sejong', name:'국립세종도서관', browseUrl:'https://sejong.nl.go.kr/search/searchStorage.do?menuId=O201&upperMenuId=O200'},
  {id:'gyeonggi-cyber', name:'경기도사이버도서관', browseUrl:'https://ebook.library.kr/category'},
];

export function sourceSearchUrl(id, isbn, title = '') {
  if (id === 'suwon') return 'https://mob.suwonlib.go.kr/search?' + new URLSearchParams({searchWord:isbn || title});
  if (id === 'gyeonggi') return 'https://www.library.kr/ggl/search/search-list?' + new URLSearchParams({search_text:isbn || title});
  if (id === 'yongin') return yonginUrl(isbn, 1, title);
  if (id === 'millie') return 'https://www.millie.co.kr/v3/search/result/' + encodeURIComponent(title || isbn || '');
  if (id === 'sejong') return 'https://sejong.nl.go.kr/search/searchStorage.do?' + new URLSearchParams({kwd:isbn || title, subCategory:'book', menuId:'O201', upperMenuId:'O200'});
  if (id === 'gyeonggi-cyber') return 'https://ebook.library.kr/search?' + new URLSearchParams(isbn ? {isbn, contentType:'EB'} : {keyword:title});
  throw new Error('Unknown source');
}

export function yonginUrl(isbn, page = 1, title = '') {
  const params = new URLSearchParams({searchType:'DETAIL', searchCategory:'BOOK', searchKey5:isbn ? 'ISBN' : 'TITLE', searchKeyword5:isbn || title, currentPageNo:String(page), searchRecordCount:'50'});
  YONGIN_LIBRARIES.forEach(library => params.append('searchLibraryArr', library.code));
  return 'https://lib.yongin.go.kr/sanghyeon/menu/11732/program/30013/plusSearchResultList.do?' + params;
}

// Suwon's public /getLibInfoList search catalogue, checked 2026-10-03.
export const SUWON_LIBRARIES = [
  ['141025','선경'], ['141024','중앙'], ['141549','창룡'], ['141572','화서다산'],
  ['141552','호매실'], ['141093','서수원'], ['141542','한림'], ['141550','버드내'],
  ['141092','북수원'], ['141537','대추골'], ['141557','일월'], ['141551','광교홍재'],
  ['141301','태장마루'], ['141595','광교푸른숲'], ['141596','매여울'], ['141612','망포글빛'],
  ['141085','슬기샘어린이'], ['141086','지혜샘어린이'], ['141087','바른샘어린이'],
  ['141064','한아름'], ['141138','반달어린이'], ['341147','사랑샘'], ['141107','희망샘'], ['741159','인도래'],
].map(([code, branch]) => ({id:`suwon:${code}`, code, branch, name:branch+'도서관'}));

// The 21 city libraries in Yongin's public detailed search, checked 2026-10-03.
export const YONGIN_LIBRARIES = [
  ['MA','용인중앙'], ['MI','구갈희망누리'], ['MD','구성'], ['MK','기흥'], ['MY','남사'],
  ['MF','동백'], ['NA','동천'], ['ML','모현'], ['MM','보라'], ['NU','보정'], ['MO','상현'],
  ['MZ','서농'], ['NB','성복'], ['MB','수지'], ['MJ','양지해밀'], ['NN','영덕'],
  ['MX','이동꿈틀'], ['ME','죽전'], ['MP','청덕'], ['MC','포곡'], ['MN','흥덕'],
].map(([code, branch]) => ({id:`yongin:${code}`, code, branch, name:branch+'도서관'}));

export function selectedLibraryResults(book, selectedIds) {
  const libraries = book.result?.libraries || [];
  return selectedIds.map(id => {
    const branch = [...SUWON_LIBRARIES, ...YONGIN_LIBRARIES].find(library => library.id === id);
    if (!branch) return libraries.find(library => library.id === id) || {id, status:'unknown', copies:[]};
    const regionId = id.split(':')[0];
    const region = libraries.find(library => library.id === regionId);
    const branchName = name => String(name).trim().replace(/도서관$/, '').replace(regionId === 'yongin' ? /^용인/ : /^$/, '');
    const copies = (region?.copies || []).filter(copy => copy.branchCode
      ? copy.branchCode === branch.code : branchName(copy.branch) === branchName(branch.branch));
    const status = !region || region.status === 'error' ? 'error'
      : copies.some(copy => copy.status === 'available') ? 'available'
      : region.status === 'unknown' || copies.some(copy => copy.status === 'unknown') ? 'unknown'
      : copies.length ? 'unavailable' : 'not_held';
    return {...region, id, name:branch.name, status, copies};
  });
}

export function selectedAvailability(book, selectedIds) {
  if (!selectedIds.length) return 'unselected';
  if (book.loading && !book.result) return 'pending';
  if (book.error && !book.result || (book.result && !book.result.isbn)) return 'unknown';
  if (!book.result) return 'pending';
  const selected = selectedLibraryResults(book, selectedIds);
  if (selected.some(library => library?.status === 'available')) return 'available';
  return selected.every(library => library && ['unavailable', 'not_held'].includes(library.status)) ? 'unavailable' : 'unknown';
}

export function normalizeIsbn(value) {
  const isbn = String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    if ([...isbn].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11) return null;
    const prefix = '978' + isbn.slice(0, 9);
    return prefix + ((10 - [...prefix].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10) % 10);
  }
  if (!/^97[89]\d{10}$/.test(isbn)) return null;
  return [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0 ? isbn : null;
}

export function parseWishPage(data, page, size = 20, kind = 'wishes') {
  const total = data?.metadata?.total_count, rows = data?.result?.result, next = data?.result?.next_uri;
  if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(rows) || (total > 0 && !rows.length && next)) throw new Error('Wishlist schema changed');
  const offset = (page - 1) * size;
  if (rows.length !== Math.min(size, Math.max(0, total - offset)) || (total > 0 && offset >= total)
    || Boolean(next) !== (offset + rows.length < total)) throw new Error('Wishlist page incomplete');
  let nextPage = null;
  if (next) {
    const url = new URL(next, 'https://pedia.watcha.com');
    const value = url.searchParams.get('page');
    if (url.origin !== 'https://pedia.watcha.com' || !['wishes','ratings'].includes(kind) || !new RegExp(`^/api/users/[A-Za-z0-9]+/contents/books/${kind}$`).test(url.pathname) || !/^\d+$/.test(value || '') || Number(value) !== page + 1) throw new Error('Invalid wishlist cursor');
    nextPage = Number(value);
  }
  const books = rows.map(({ content: c }) => {
    if (c?.content_type !== 'books' || !/^b[A-Za-z0-9]{6}$/.test(c.code) || typeof c.title !== 'string') throw new Error('Invalid wishlist book');
    let coverUrl = null;
    try {
      const cover = new URL(c.poster?.medium || c.poster?.small);
      if (cover.origin === 'https://an2-img.amz.wtchn.net' && !cover.username && !cover.password) coverUrl = cover.href;
    } catch { /* Missing covers must not prevent loading the wishlist. */ }
    return { id: c.code, title: c.title.slice(0, 500), year: Number.isInteger(c.year) ? c.year : null, url: `https://pedia.watcha.com/ko/contents/${c.code}`, coverUrl };
  });
  if (new Set(books.map(book => book.id)).size !== books.length) throw new Error('Duplicate wishlist books');
  return { total, books, nextPage };
}

export function parseRatedPage(data, page, profileId, size = 20) {
  const parsed = parseWishPage(data, page, size, 'ratings');
  parsed.books = parsed.books.map((book, index) => {
    const action = data.result.result[index].user_content_action;
    if (action?.user_code !== profileId || action.content_code !== book.id || !Number.isInteger(action.rating) || action.rating < 1 || action.rating > 10) throw new Error('Invalid personal rating');
    return {...book,rating:action.rating / 2,...(typeof action.rate_created_at === 'string' && Number.isFinite(Date.parse(action.rate_created_at)) ? {ratedAt:action.rate_created_at} : {})};
  });
  return parsed;
}

// ISBN is taken only from the book's own linked Kyobo product, never from a title search.
export function bookInfoFromWatchaHtml(html, id) {
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(script[1]);
      const nodes = Array.isArray(data) ? data : data['@graph'] || [data];
      const book = nodes.find(node => node['@type'] === 'Book' && node.url === `https://pedia.watcha.com/ko/contents/${id}`);
      if (!book) continue;
      const authors = (Array.isArray(book.author) ? book.author : [book.author]).map(author => typeof author === 'string' ? author : author?.name).filter(name => typeof name === 'string' && name.trim()).map(name => name.trim().slice(0, 200));
      return {title:typeof book.name === 'string' ? book.name.slice(0, 500) : '', authors:[...new Set(authors)].slice(0, 20),
        description:typeof book.description === 'string' ? book.description.replace(/\\n/g, '\n').slice(0, 20000) : '',
        genres:(Array.isArray(book.genre) ? book.genre : [book.genre]).filter(genre => typeof genre === 'string').map(genre => genre.slice(0, 100)).slice(0, 20),
        published:typeof book.datePublished === 'string' ? book.datePublished.slice(0, 30) : '',
        publisher:typeof book.publisher === 'string' ? book.publisher.slice(0, 200) : typeof book.publisher?.name === 'string' ? book.publisher.name.slice(0, 200) : ''};
    } catch { /* Optional metadata must not break an otherwise valid ISBN lookup. */ }
  }
  return {title:'', authors:[], description:'', genres:[], published:'', publisher:''};
}

export function isbnFromWatchaHtml(html) {
  const found = new Set();
  for (const match of html.matchAll(/https:\/\/redirect\.watcha\.com\/galaxy\/([A-Za-z0-9_=-]+)/g)) {
    try {
      const decoded = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
      const url = new URL(decoded);
      if (!/(^|\.)kyobobook\.co\.kr$/.test(url.hostname)) continue;
      for (const code of decodeURIComponent(decoded).matchAll(/[?&]barcode=(\d{10,13})(?:&|$)/g)) {
        const isbn = normalizeIsbn(code[1]);
        if (isbn) found.add(isbn);
      }
    } catch { /* Invalid unrelated purchase links do not identify an edition. */ }
  }
  return found.size === 1 ? [...found][0] : null;
}

export const LOAN_LABELS = {
  OK: '대출 가능', OUT_ON_LOAN: '대출중', OTHER_LOAN: '상호대차중', OTHER_LOAN_READY: '상호대차 대기',
  OTHER_RETURN: '타관반납', RESERVE_LOAN_READY: '예약대출 대기', NOT_ALLOWED: '대출 불가', BROKEN: '파손',
};

export function normalizeCopies(rows, isbn) {
  if (!Array.isArray(rows)) throw new Error('Invalid copies');
  const copies = rows.filter(row => normalizeIsbn(row.ISBN) === isbn).map(row => {
    const code = row.LOAN_CODE;
    const label = Object.hasOwn(LOAN_LABELS, code) ? LOAN_LABELS[code] : '상태 미확인';
    const status = code === 'OK' && row.USE_LIMIT_CODE !== 'CD' ? 'available' : Object.hasOwn(LOAN_LABELS, code) ? 'unavailable' : 'unknown';
    return { branch: String(row.LIB_NAME || '도서관명 미확인'), branchCode: String(row.MANAGE_CODE || row.LIB_CODE || ''), status,
      label: row.USE_LIMIT_CODE === 'CD' ? '관내 열람' : label,
      location: String(row.SHELF_LOC_NAME || row.SHELF_LOC_GROUP || ''), callNo: String(row.CALL_NO || ''), returnDate: String(row.RETURN_PLAN_DATE || '') };
  });
  const status = copies.some(c => c.status === 'available') ? 'available'
    : copies.some(c => c.status === 'unknown') || rows.length !== copies.length ? 'unknown'
    : copies.length ? 'unavailable' : 'not_held';
  return { status, copies };
}

const text = value => value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function parseYonginPage(html, isbn) {
  const total = html.match(/검색결과 총\s*<strong[^>]*>([\d,]+)<\/strong>/)?.[1];
  const list = html.match(/<div class="bookList [^"]*">([\s\S]*?)<\/ul>\s*<\/div>/)?.[1];
  if (total === undefined || list === undefined) throw new Error('Yongin search schema changed');
  const copies = [];
  for (const row of list.matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/g)) {
    if (row[1].includes('noResult')) continue;
    const identity = row[1].match(/fnCollectionBookList\((\d+),\s*'\d+',\s*'BO',\s*'(\d+)',\s*'([A-Z]+)'/);
    const info = row[1].match(/class="book_info barList info03">([\s\S]*?)<\/div>\s*<\/div>/)?.[1];
    const state = row[1].match(/class="status">\s*<p>([\s\S]*?)<\/p>/)?.[1];
    if (!identity || normalizeIsbn(identity[2]) !== isbn || !info || !state) throw new Error('Yongin copy schema changed');
    const locations = [...info.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => text(m[1]));
    const publication = row[1].match(/class="book_info barList info02">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || '';
    const callNo = [...publication.matchAll(/<p>([\s\S]*?)<\/p>/g)][2]?.[1];
    const label = text(state);
    const code = /^대출가능\s*\(비치중\)$/.test(label) ? 'OK' : label.includes('상호대차중') ? 'OTHER_LOAN' : label.includes('대출중') ? 'OUT_ON_LOAN' : /^대출불가/.test(label) ? 'NOT_ALLOWED' : 'UNKNOWN';
    copies.push({ BOOK_KEY: identity[1], MANAGE_CODE: identity[3], ISBN: isbn, LIB_NAME: locations[0], SHELF_LOC_NAME: locations[1], CALL_NO: callNo ? text(callNo) : '', LOAN_CODE: code, RETURN_PLAN_DATE: row[1].match(/반납예정일:\s*([\d.]+)/)?.[1] || '' });
  }
  const count = Number(total.replace(/,/g, ''));
  if ((count && !copies.length) || (!count && copies.length)) throw new Error('Yongin result count mismatch');
  return { total: count, copies };
}
