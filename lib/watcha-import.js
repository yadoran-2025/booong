import { WATCHA_PROFILES, normalizeIsbn } from '../js/watcha-library-data.js';
import { readWatchaRecord, watchaDatabase, writeWatchaRecord } from './watcha-storage.js';

const string = (value,limit) => typeof value === 'string' && value.length <= limit;

export function validateWatchaImport(body) {
  if (!body || !WATCHA_PROFILES.some(profile=>profile.id===body.profile) || !Array.isArray(body.books) || body.books.length > 25) throw new Error('Invalid cache import');
  return body.books.map(book => {
    if (!/^b[A-Za-z0-9]{6}$/.test(book?.id || '')) throw new Error('Invalid cache book');
    const isbn = normalizeIsbn(book.result?.isbn || book.info?.isbn);
    if (book.manualIsbn && !normalizeIsbn(book.manualIsbn)) throw new Error('Invalid corrected ISBN');
    let info = null;
    if (book.info) {
      const arrays = ['authors','genres'];
      if (arrays.some(field=>!Array.isArray(book.info[field]) || book.info[field].length > 20 || book.info[field].some(value=>!string(value,200)))) throw new Error('Invalid cached authors');
      const fields = {title:500,description:20000,published:30,publisher:200};
      if (Object.entries(fields).some(([field,limit])=>!string(book.info[field] ?? '',limit))) throw new Error('Invalid cached information');
      info = Object.fromEntries(Object.keys(fields).map(field=>[field,book.info[field] || '']));
      Object.assign(info,{authors:book.info.authors,genres:book.info.genres,isbn:normalizeIsbn(book.info.isbn)});
    }
    return {id:book.id,isbn,info,manualIsbn:normalizeIsbn(book.manualIsbn)};
  });
}

export async function importWatchaCache(body) {
  const records = validateWatchaImport(body);
  const profile = await readWatchaRecord(`profiles/${body.profile}`);
  if (!profile) throw new Error('Import requires a complete server wishlist');
  const catalogue = await watchaDatabase('books') || {};
  let imported = 0;
  await Promise.all(records.map(async record => {
    if (!profile.bookIds.includes(record.id) || !catalogue[record.id]?.listing) return;
    const entry = catalogue[record.id];
    const detail = entry.detail ? JSON.parse(entry.detail) : null;
    if (!detail && (record.info || record.isbn)) imported += await writeWatchaRecord(`books/${record.id}/detail`,{id:record.id,isbn:record.isbn,info:record.info,...(record.manualIsbn ? {manualIsbn:record.manualIsbn} : {})},true) ? 1 : 0;
  }));
  return {storage:'firebase',imported};
}
