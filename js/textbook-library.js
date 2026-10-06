export function getTextbookSection(library, bookId, unitKey, chapter = -1) {
  if (!Number.isInteger(chapter) || chapter < -1) return null;
  const book = library.books?.find(item => item.id === bookId);
  const unit = book?.units.find(item => item.key === unitKey);
  const section = chapter === -1 ? unit : unit?.chapters[chapter];
  return book && section ? { book, section } : null;
}

export function textbooksForUnit(library, unitKey) {
  return (library.books || []).filter(book => book.units.some(unit => unit.key === unitKey));
}
