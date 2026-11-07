export function createCloudStore(client, pathname = 'workshop/store.json') {
  // shortcut: one document per app; use a transactional database if concurrent writes become frequent.
  return {
    async load() {
      // Compression produces a weak ETag that cannot be used for conditional writes.
      const result = await client.get(pathname, { access: 'private', useCache: false, headers: { 'accept-encoding': 'identity' } });
      if (!result || result.statusCode !== 200) throw new Error('배포 저장소가 초기화되지 않았습니다.');
      const data = await new Response(result.stream).json();
      if (data.schemaVersion !== 3 || !Array.isArray(data.pages) || !Array.isArray(data.sessions)) throw new Error('배포 저장소 형식이 올바르지 않습니다.');
      return { data, etag: result.blob.etag };
    },
    async save(state) {
      const result = await client.put(pathname, JSON.stringify(state.data), {
        access: 'private', addRandomSuffix: false, allowOverwrite: true,
        contentType: 'application/json', ifMatch: state.etag,
      });
      state.etag = result.etag;
    },
  };
}
