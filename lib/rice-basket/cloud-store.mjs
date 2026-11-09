import { contentStorage } from '../booong-content-storage.js';

export const WORKSHOP_CACHE_MS = 3000;

export function createCloudStore(client = contentStorage, now = Date.now) {
  let cached, pending, expires = 0, generation = 0;
  const clear = () => { generation++; cached = pending = undefined; expires = 0; };
  async function load({ fresh = false } = {}) {
    if (!fresh && cached && now() < expires) return structuredClone(cached);
    if (!pending) {
      const version = generation;
      pending = client.read('workshop').then(({ data, etag }) => {
        if (!data) throw new Error('배포 저장소가 초기화되지 않았습니다.');
        if (data.schemaVersion !== 3 || !Array.isArray(data.pages) || !Array.isArray(data.sessions)) throw new Error('배포 저장소 형식이 올바르지 않습니다.');
        if (version !== generation) return load({ fresh });
        cached = structuredClone({ data, etag });
        expires = now() + WORKSHOP_CACHE_MS;
        return cached;
      }).finally(() => { if (version === generation) pending = undefined; });
    }
    return structuredClone(await pending);
  }
  // shortcut: one document per app; use a transactional database if concurrent writes become frequent.
  return {
    load,
    async save(state) {
      clear();
      try {
        const result = await client.write('workshop', state.data, state.etag);
        state.etag = result.etag;
      } finally { clear(); }
    },
  };
}
