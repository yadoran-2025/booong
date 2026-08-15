export const FAVORITES_STORAGE_KEY = "booong-favorite-resources-v1";

export function normalizeFavoriteIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(id => String(id || "").trim()).filter(Boolean))];
}

export function loadFavoriteIds(storage = globalThis.localStorage) {
  try {
    return normalizeFavoriteIds(JSON.parse(storage?.getItem(FAVORITES_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids, storage = globalThis.localStorage) {
  const normalized = normalizeFavoriteIds(ids);
  try {
    storage?.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    return loadFavoriteIds(storage);
  }
  return normalized;
}

export function toggleFavoriteId(ids, id) {
  const normalized = normalizeFavoriteIds(ids);
  const target = String(id || "").trim();
  if (!target) return normalized;
  return normalized.includes(target)
    ? normalized.filter(item => item !== target)
    : [...normalized, target];
}
