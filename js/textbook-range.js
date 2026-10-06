export const TEXTBOOK_RANGE_SIZE = 256 * 1024;
// ponytail: tab-only byte cache, capped at 16 MiB on small screens and 50 MiB elsewhere; no persistent private PDFs.
const limit = (typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches ? 16 : 50) * 1024 * 1024;
const chunks = new Map();
let cachedBytes = 0, generation = 0;

export function clearTextbookRanges() {
  chunks.clear(); cachedBytes = 0; generation++;
}

function cached(key) {
  const data = chunks.get(key);
  if (data) { chunks.delete(key); chunks.set(key, data); }
  return data;
}

function remember(key, data) {
  if (chunks.has(key)) return;
  while (cachedBytes + data.byteLength > limit && chunks.size) {
    const oldest = chunks.keys().next().value;
    cachedBytes -= chunks.get(oldest).byteLength;
    chunks.delete(oldest);
  }
  chunks.set(key, data); cachedBytes += data.byteLength;
}

function validate(source) {
  const url = new URL(source.url);
  if (url.origin !== "https://storage.googleapis.com" || !url.pathname.startsWith("/yadoran-2025.firebasestorage.app/booong/textbooks/")
    || !Number.isSafeInteger(source.bytes) || source.bytes <= 0 || !/^[a-f0-9]{64}$/.test(source.sha256)
    || !Number.isFinite(source.expiresAt)) throw new Error("Invalid PDF source");
  return source;
}

export async function createTextbookRange(pdf, initial, refresh, controller, onError) {
  let source = validate(initial);
  const { signal } = controller;
  const version = generation, pending = new Map();
  const key = start => `${source.sha256}:${start}`;
  const check = () => {
    signal.throwIfAborted();
    if (version !== generation) throw new Error("Google 계정이 변경되었습니다. 다시 로그인해주세요.");
  };
  async function renew() {
    const next = validate(await refresh());
    check();
    if (next.sha256 !== source.sha256 || next.bytes !== source.bytes) throw new Error("PDF가 변경되었습니다. 다시 열어주세요.");
    source = next;
  }
  async function download(begin, end) {
    check();
    if (Date.now() >= source.expiresAt - 30_000) await renew();
    const request = () => fetch(source.url, { headers: { Range: `bytes=${begin}-${end - 1}` }, cache: "no-store", referrerPolicy: "no-referrer", signal });
    let response = await request();
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel(); await renew(); response = await request();
    }
    if (response.status !== 206 || response.headers.get("Content-Range") !== `bytes ${begin}-${end - 1}/${source.bytes}`) {
      await response.body?.cancel(); throw new Error("PDF 구간을 불러오지 못했습니다. 다시 열어주세요.");
    }
    const data = new Uint8Array(await response.arrayBuffer());
    check();
    if (data.byteLength !== end - begin) throw new Error("Incomplete PDF range");
    return data;
  }
  async function read(begin, end) {
    check();
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || begin >= end || end > source.bytes) throw new Error("Invalid PDF range");
    const output = new Uint8Array(end - begin);
    const last = Math.min(Math.ceil(end / TEXTBOOK_RANGE_SIZE) * TEXTBOOK_RANGE_SIZE, source.bytes);
    for (let offset = Math.floor(begin / TEXTBOOK_RANGE_SIZE) * TEXTBOOK_RANGE_SIZE; offset < last;) {
      let data = cached(key(offset)), next = Math.min(offset + TEXTBOOK_RANGE_SIZE, source.bytes);
      if (!data) {
        let finish = next;
        while (finish < last && !chunks.has(key(finish))) finish = Math.min(finish + TEXTBOOK_RANGE_SIZE, source.bytes);
        const downloaded = await download(offset, finish);
        for (let start = offset; start < finish; start += TEXTBOOK_RANGE_SIZE) {
          const chunk = downloaded.slice(start - offset, Math.min(start + TEXTBOOK_RANGE_SIZE, finish) - offset);
          remember(key(start), chunk);
        }
        // Use the downloaded span directly: a large request can evict its own earliest cache chunks.
        data = downloaded; next = finish;
      }
      const firstByte = Math.max(begin, offset), lastByte = Math.min(end, next);
      output.set(data.subarray(firstByte - offset, lastByte - offset), firstByte - begin);
      offset = next;
    }
    check();
    return output;
  }
  const first = await read(0, Math.min(TEXTBOOK_RANGE_SIZE, source.bytes));
  return new class extends pdf.PDFDataRangeTransport {
    constructor() { super(source.bytes, first, true); }
    requestDataRange(begin, end) {
      const id = `${begin}:${end}`;
      if (pending.has(id)) return;
      const job = read(begin, end).then(data => { check(); this.onDataRange(begin, data); }).catch(error => {
        if (!signal.aborted) onError(error);
      }).finally(() => pending.delete(id));
      pending.set(id, job);
    }
    abort() { controller.abort(); }
  }();
}
