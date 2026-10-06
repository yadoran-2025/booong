import { fetchWishPage, fetchRatedPage, fetchBook, lookupAvailability } from './watcha-library.js';
import { WATCHA_PROFILES, EXTRA_SOURCES } from '../js/watcha-library-data.js';
import { watchaDatabase, readWatchaRecord, writeWatchaRecord } from './watcha-storage.js';

export const WATCHA_SOURCE_IDS = ['gyeonggi','suwon','yongin',...EXTRA_SOURCES.map(source => source.id)];
const pending = new Map();

export async function sharedSyncHistory(record = false) {
  if (!record) return await readWatchaRecord('sync/lastFullSync') || {lastFullSyncAt:null};
  const history = {lastFullSyncAt:new Date().toISOString()};
  await writeWatchaRecord('sync/lastFullSync', history);
  return history;
}
// ponytail: coalesce requests in one server instance; separate instances may repeat a lookup,
// but stable Firebase keys keep storage deduplicated. Add distributed locks if traffic warrants it.
async function once(key, work) {
  if (!pending.has(key)) pending.set(key, work());
  const request = pending.get(key);
  try { return await request; }
  finally { if (pending.get(key) === request) pending.delete(key); }
}

export async function sharedBook(id) {
  return once('book:' + id, async () => {
    const saved = await readWatchaRecord(`books/${id}/detail`);
    if (saved?.info) return saved;
    const fetched = await fetchBook(id);
    const book = {...fetched,isbn:fetched.isbn || saved?.isbn || null,...(saved?.manualIsbn ? {manualIsbn:saved.manualIsbn} : {})};
    await writeWatchaRecord(`books/${id}/detail`, book);
    return book;
  });
}

export async function sharedAvailability(isbn, sourceIds = WATCHA_SOURCE_IDS) {
  // Only simultaneous requests share work; completed loan results are never cached.
  return Promise.all(sourceIds.map(source => once(`availability:${source}:${isbn}`, async () => {
    const [result] = await lookupAvailability(isbn, [source]);
    return result;
  })));
}

async function syncProfile(profileId, catalogue, kind) {
  const {snapshot,collected} = await once(`profile:${kind}:${profileId}`, async () => {
    const collected = [], ids = new Set(); let page = 1, total, checkedAt;
    do {
      const result = await (kind === 'ratings' ? fetchRatedPage : fetchWishPage)(page, profileId);
      if (total !== undefined && result.total !== total || result.books.some(book => ids.has(book.id))) throw new Error('Wishlist changed while collecting');
      total = result.total; checkedAt = result.checkedAt; page = result.nextPage;
      for (const book of result.books) { ids.add(book.id); collected.push(book); }
      // Pace rated pages to stay within Watcha's public request limit.
      if (kind === 'ratings' && page !== null) await new Promise(resolve=>setTimeout(resolve,750));
    } while (page !== null);
    if (collected.length !== total) throw new Error('Incomplete wishlist');
    const changes = {};
    for (const {rating,ratedAt,...book} of collected) {
      const listing = JSON.stringify(book);
      if (catalogue[book.id]?.listing !== listing) changes[`books/${book.id}/listing`] = listing;
    }
    const snapshot = {bookIds:collected.map(book => book.id),total,checkedAt,...(kind === 'ratings' ? {ratings:Object.fromEntries(collected.map(book=>[book.id,{score:book.rating,...(book.ratedAt ? {ratedAt:book.ratedAt} : {})}]))} : {})};
    changes[`${kind === 'ratings' ? 'ratedProfiles' : 'profiles'}/${profileId}`] = JSON.stringify(snapshot);
    // Commit membership only after every page is verified; details of removed/shared books survive.
    await watchaDatabase('', 'PATCH', changes);
    return {snapshot,collected};
  });
  for (const {rating,ratedAt,...book} of collected) catalogue[book.id] = {...catalogue[book.id],listing:JSON.stringify(book)};
  return snapshot;
}

export async function sharedCollection(profileId, sourceIds = ['gyeonggi'], refresh = false, kind = 'wishes') {
  const profile = WATCHA_PROFILES.find(profile => profile.id === profileId);
  if (!profile || !['wishes','ratings'].includes(kind)) throw new Error('Unregistered profile or collection');
  let snapshot = await readWatchaRecord(`${kind === 'ratings' ? 'ratedProfiles' : 'profiles'}/${profileId}`);
  const catalogue = await once('catalogue', () => watchaDatabase('books')) || {};
  if (!snapshot || refresh) snapshot = await syncProfile(profileId, catalogue, kind);
  const books = snapshot.bookIds.map(id => {
    const entry = catalogue?.[id];
    if (!entry?.listing) throw new Error('Incomplete stored wishlist');
    const book = JSON.parse(entry.listing), detail = entry.detail ? JSON.parse(entry.detail) : null;
    if (kind === 'ratings') {
      const rating = snapshot.ratings?.[id];
      if (!(rating?.score >= .5 && rating.score <= 5 && Number.isInteger(rating.score * 2))) throw new Error('Missing personal rating');
      book.rating = rating.score;
      book.ratedAt = rating.ratedAt;
    }
    if (detail) {
      book.info = detail.info;
      book.manualIsbn = detail.manualIsbn;
      book.manual = Boolean(detail.manualIsbn);
      const isbn = detail.manualIsbn || detail.isbn;
      book.result = {...detail, isbn, libraries:[]};
    }
    return book;
  });
  return {storage:'firebase',kind,profile,books,total:snapshot.total,checkedAt:snapshot.checkedAt,complete:true};
}

export async function saveWatchaCorrection(id, isbn) {
  const detail = await sharedBook(id);
  await writeWatchaRecord(`books/${id}/detail`, {...detail, manualIsbn:isbn});
}
