import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { renderTextbookPages } from "../js/textbook-pdf.js";
import { clearTextbookRanges, createTextbookRange, TEXTBOOK_RANGE_SIZE } from "../js/textbook-range.js";

const saved = { document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver, devicePixelRatio: globalThis.devicePixelRatio, getComputedStyle: globalThis.getComputedStyle };
const element = () => ({
  dataset: {}, style: { setProperty(key, value) { this[key] = value; } }, attributes: {}, children: [], isConnected: true,
  setAttribute(key, value) { this.attributes[key] = value; },
  getAttribute(key) { return this.attributes[key]; },
  replaceChildren(...children) { this.children = children; },
  append(...children) { this.children.push(...children); },
  remove() { this.removed = true; },
  getContext() { return {}; },
});
let observer;
const rendered = [], cancelled = [];
let finishSecond;
const pdf = {
  numPages: 3,
  async getPage(number) {
    return {
      getViewport({ scale }) { return { width: 300 * scale, height: 500 * scale, scale }; },
      streamTextContent() { return { items: [{ str: "도시화와 도시 문제" }] }; },
      render() {
        rendered.push(number);
        let reject;
        const promise = number === 2 ? new Promise((resolve, fail) => { finishSecond = resolve; reject = fail; }) : Promise.resolve();
        return { promise, cancel() { cancelled.push(number); reject?.(Object.assign(new Error("Cancelled"), { name: "RenderingCancelledException" })); } };
      },
    };
  },
};
const tick = () => new Promise(resolve => setImmediate(resolve));

try {
  globalThis.devicePixelRatio = 1;
  globalThis.getComputedStyle = () => ({ paddingLeft: "16px", paddingRight: "16px", columnGap: "16px" });
  globalThis.document = { createElement: element };
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = []; observer = this; }
    observe(sheet) { this.observed.push(sheet); }
    disconnect() { this.disconnected = true; }
  };
  const viewer = element();
  viewer.dataset = { pdfStart: "150", pdfZoom: "100" };
  viewer.setAttribute("aria-label", "도시화와 도시 문제");
  viewer.parentElement = { clientWidth: 640, scrollTop: 0, dataset: { scrollTop: "800" } };
  const cleanup = await renderTextbookPages(viewer, pdf);
  assert.equal(viewer.children.length, 3, "Every PDF page gets a vertically stacked slot");
  assert.deepEqual(rendered, [], "Offscreen pages must not allocate canvases");
  assert.equal(viewer.parentElement.scrollTop, 800, "Zoom/reload preserves the reading position");
  assert.equal(observer.options.root, viewer.parentElement, "Each textbook scrolls independently");
  assert.match(viewer.children[1].attributes["aria-label"], /책 151쪽/);
  const first = viewer.children[0], second = viewer.children[1];
  observer.callback([{ target: first, isIntersecting: true }, { target: second, isIntersecting: true }]);
  await tick();
  assert.deepEqual(rendered, [1, 2]);
  observer.callback([{ target: second, isIntersecting: false }]);
  await tick();
  assert.equal(second.children.length, 0, "Offscreen canvases are released");
  assert.ok(cancelled.includes(2), "Pending offscreen rendering is cancelled");
  observer.callback([{ target: second, isIntersecting: true }]);
  await tick(); finishSecond(); await tick();
  assert.equal(second.children.length, 1, "Scrolling back renders the page again");
  assert.deepEqual(rendered, [1, 2, 2]);
  cleanup();
  assert.equal(observer.disconnected, true);
  viewer.dataset.pdfColumns = "2";
  viewer.offsetTop = 200;
  viewer.parentElement.dataset.scrollPage = "3";
  viewer.parentElement.dataset.scrollFraction = "0.25";
  let slot = 0;
  globalThis.document.createElement = () => {
    const sheet = element(), index = slot++;
    Object.defineProperties(sheet, {
      offsetHeight: { get: () => parseFloat(sheet.style.height) || 0 },
      offsetTop: { get: () => 200 + Math.floor(index / 2) * (sheet.offsetHeight + 16) },
    });
    return sheet;
  };
  const cleanupSpread = await renderTextbookPages(viewer, pdf);
  assert.ok(Math.abs(viewer.parentElement.scrollTop - (500 * 296 / 300 * 1.25 + 16)) < 0.001, "Changing the layout keeps the same page and relative position");
  assert.equal(viewer.style.gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
  assert.equal(viewer.style.width, "608px", "The pair fits the existing viewport");
  assert.equal(viewer.children.length, 3, "An odd final page stays available");
  assert.ok(Math.abs(parseFloat(viewer.children[0].style.height) - 500 * 296 / 300) < 0.001, "Each page is half the spread width, excluding the gap");
  observer.callback([{ target: viewer.children[0], isIntersecting: true }, { target: viewer.children[1], isIntersecting: true }]);
  await tick(); finishSecond(); await tick();
  assert.equal(viewer.children[0].children[0].style.width, "296px");
  assert.equal(viewer.children[1].children[0].style.width, "296px");
  const originalSheets = [...viewer.children];
  const originalSecondCanvas = viewer.children[1].children[0];
  viewer.dataset.pdfZoom = "150";
  cleanupSpread.resize();
  assert.deepEqual(viewer.children, originalSheets, "Zoom keeps the same page slots");
  assert.equal(viewer.children[1].children[0], originalSecondCanvas, "Existing pixels remain visible during a zoom");
  assert.equal(originalSecondCanvas.style.width, "448px", "Existing canvas immediately scales to the requested zoom");
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(viewer.children[1].children[0], originalSecondCanvas, "A pending sharp render never replaces the old page with a blank canvas");
  finishSecond(); await tick();
  assert.notEqual(viewer.children[1].children[0], originalSecondCanvas, "Finished sharp pixels replace the old canvas");
  viewer.dataset.pdfZoom = "160"; cleanupSpread.resize();
  cleanupSpread();
  const renderCount = rendered.length;
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(rendered.length, renderCount, "Closing a viewer cancels its queued zoom redraw");
  const textLayers = [];
  class TextLayer {
    constructor(options) { this.options = options; textLayers.push(this); }
    render() { this.options.container.textContent = this.options.textContentSource.items[0].str; return Promise.resolve(); }
    cancel() { this.cancelled = true; }
  }
  const cleanupText = await renderTextbookPages(viewer, pdf, { TextLayer });
  observer.callback([{ target: viewer.children[0], isIntersecting: true }]);
  await tick();
  assert.equal(viewer.children[0].children.length, 2, "Selectable PDF text overlays the existing canvas");
  assert.equal(viewer.children[0].children[1].textContent, "도시화와 도시 문제");
  assert.equal(viewer.children[0].children[0].getAttribute("aria-hidden"), "true");
  assert.equal(viewer.children[0].getAttribute("role"), "group", "Text is accessible, rather than hidden inside an image role");
  const oldText = viewer.children[0].children[1];
  viewer.dataset.pdfZoom = "200";
  cleanupText.resize();
  assert.equal(viewer.children[0].children[1], oldText, "Selectable text stays attached during zoom");
  const textScale = Number(oldText.style.transform.slice(6, -1));
  assert.ok(Math.abs(textScale * parseFloat(oldText.style.width) - parseFloat(viewer.children[0].children[0].style.width)) < 0.001, "Text and page pixels scale together until the sharp render is ready");
  observer.callback([{ target: viewer.children[0], isIntersecting: false }]);
  assert.equal(textLayers[0].cancelled, true, "Offscreen text layers are released along with canvases");
  cleanupText();
  console.log("One/two-page scrolling, stable zoom pixels/text, lazy rendering, cancellation, and position checks passed.");
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}

class OlderPromise extends Promise {}
OlderPromise.withResolvers = undefined;
const compat = await readFile(new URL("../js/textbook-pdf-compat.js", import.meta.url), "utf8");
runInNewContext(compat, { Promise: OlderPromise });
const resolved = OlderPromise.withResolvers();
assert.ok(resolved.promise instanceof OlderPromise);
resolved.resolve("PDF ready");
assert.equal(await resolved.promise, "PDF ready");
const rejected = OlderPromise.withResolvers();
rejected.reject(new Error("PDF failed"));
await assert.rejects(rejected.promise, /PDF failed/);
const native = Promise.withResolvers;
runInNewContext(compat, { Promise });
assert.equal(Promise.withResolvers, native, "Native implementations are preserved");
console.log("Older browser Promise support preserves resolution, rejection, subclasses, and native implementations.");

const originalFetch = globalThis.fetch;
class RangeTransport {
  constructor(length, data, done) { this.length = length; this.initialData = data; this.progressiveDone = done; }
  onDataRange(begin, data) { this.result.resolve({ begin, data }); }
}
const source = { url: "https://storage.googleapis.com/yadoran-2025.firebasestorage.app/booong/textbooks/test/unit-01-chapter-01.pdf", bytes: TEXTBOOK_RANGE_SIZE * 4 + 13, sha256: "a".repeat(64), expiresAt: Date.now() + 300_000 };
let reads = [], renewals = 0, failures = [];
const refresh = async () => { renewals++; return { ...source, expiresAt: Date.now() + 300_000 }; };
const receive = async (transport, begin, end) => {
  transport.result = Promise.withResolvers(); transport.requestDataRange(begin, end);
  return (await transport.result.promise).data;
};
try {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.cache, "no-store");
    const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
    const begin = Number(first), end = Number(last) + 1;
    reads.push([begin, end]);
    const bytes = Uint8Array.from({ length: end - begin }, (_, index) => (begin + index) % 251);
    return new Response(bytes, { status: 206, headers: { "Content-Range": `bytes ${begin}-${end - 1}/${source.bytes}` } });
  };
  clearTextbookRanges();
  const transport = await createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), error => failures.push(error));
  assert.deepEqual(reads, [[0, TEXTBOOK_RANGE_SIZE]], "Opening a PDF fetches one small range, not the whole document");
  assert.equal(transport.progressiveDone, true, "There is no background full-file stream");
  let data = await receive(transport, TEXTBOOK_RANGE_SIZE, TEXTBOOK_RANGE_SIZE * 3);
  assert.equal(data[0], TEXTBOOK_RANGE_SIZE % 251);
  assert.equal(data.at(-1), (TEXTBOOK_RANGE_SIZE * 3 - 1) % 251);
  const count = reads.length;
  await receive(transport, TEXTBOOK_RANGE_SIZE, TEXTBOOK_RANGE_SIZE * 2);
  assert.equal(reads.length, count, "Overlapping requests reuse cached chunks");
  const copy = await createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), error => failures.push(error));
  assert.equal(reads.length, count, "Reopening a chapter reuses its first range");
  copy.initialData[0] = 255;
  const third = await createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), error => failures.push(error));
  assert.equal(third.initialData[0], 0, "PDF.js receives its own copy; transferring it cannot detach the cache");
  const expired = await createTextbookRange({ PDFDataRangeTransport: RangeTransport }, { ...source, expiresAt: 0 }, refresh, new AbortController(), error => failures.push(error));
  data = await receive(expired, TEXTBOOK_RANGE_SIZE * 4, source.bytes);
  assert.equal(data.length, 13, "The final partial chunk is preserved");
  assert.equal(renewals, 1, "Long reading sessions renew expired signed URLs automatically");
  assert.deepEqual(failures, []);
  clearTextbookRanges();
  third.requestDataRange(0, TEXTBOOK_RANGE_SIZE);
  await tick();
  assert.match(failures.at(-1).message, /계정/, "Clearing private data also invalidates old transports");
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, aborted, () => {}), { name: "AbortError" });
  globalThis.fetch = async () => new Response(new Uint8Array(10));
  await assert.rejects(createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), () => {}), /PDF 구간/, "Never silently fall back to a costly full-file HTTP 200 response");
  globalThis.fetch = async () => new Response(new Uint8Array(10), { status: 206, headers: { "Content-Range": `bytes 0-${TEXTBOOK_RANGE_SIZE - 1}/${source.bytes}` } });
  await assert.rejects(createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), () => {}), /Incomplete/);
  const savedMatchMedia = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    const mobile = await import("../js/textbook-range.js?mobile-cache-check");
    source.bytes = 17 * 1024 * 1024;
    reads = [];
    globalThis.fetch = async (url, options) => {
      const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
      const begin = Number(first), end = Number(last) + 1;
      reads.push([begin, end]);
      return new Response(new Uint8Array(end - begin), { status: 206, headers: { "Content-Range": `bytes ${begin}-${end - 1}/${source.bytes}` } });
    };
    const large = await mobile.createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), () => {});
    await receive(large, 0, source.bytes);
    const readsBeforeReopen = reads.length;
    await mobile.createTextbookRange({ PDFDataRangeTransport: RangeTransport }, source, refresh, new AbortController(), () => {});
    assert.equal(reads.length, readsBeforeReopen + 1, "A 17 MiB chapter evicts its oldest chunk from the 16 MiB mobile cache");
    mobile.clearTextbookRanges();
  } finally {
    if (savedMatchMedia === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = savedMatchMedia;
  }
} finally {
  globalThis.fetch = originalFetch;
  clearTextbookRanges();
}
console.log("On-demand ranges, overlapping cache reuse, transfer-safe copies, and signed-URL renewal checks passed.");
