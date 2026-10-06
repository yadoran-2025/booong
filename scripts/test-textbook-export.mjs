import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { currentResearchRange, selectedResearchPages, researchPrompt, researchZip, renderTextbookChapterCapture } from "../js/textbook-export.js";
import { renderTextbookExportPage } from "../js/textbook-pdf.js";

const source = { selected: true, publisher: "창비", bookId: "changbi-integrated2-2022", bookTitle: "통합사회2 교사용", revision: "2022", school: "고등학교", unitTitle: "사회 정의와 불평등", chapterTitle: "사회 불평등 현상", printedStart: 84, printedEnd: 91, start: 84, end: 85 };
const pages = selectedResearchPages([source, { ...source, selected: false, start: NaN }]);
assert.deepEqual(pages.map(page => [page.printed, page.pageNumber]), [[84, 1], [85, 2]], "Printed pages map into the selected chapter PDF");
assert.throws(() => selectedResearchPages([{ ...source, start: 83 }]), /쪽수를 확인/);
assert.throws(() => selectedResearchPages([{ ...source, start: 86 }]), /쪽수를 확인/);
assert.throws(() => selectedResearchPages([{ ...source, end: 85.5 }]), /쪽수를 확인/);
assert.throws(() => selectedResearchPages([]), /하나 이상/);
assert.throws(() => selectedResearchPages([{ ...source, printedEnd: 110, end: 94 }]), /총 10쪽/);
assert.equal(selectedResearchPages([source, { ...source, publisher: "리베르스쿨" }]).length, 4);
const viewer = { closest: () => ({ getBoundingClientRect: () => ({ top: 100, bottom: 640, left: 0, right: 640 }) }), querySelectorAll: () => [
  { dataset: { pdfSheet: "3" }, getBoundingClientRect: () => ({ top: -200, bottom: 40, left: 0, right: 200 }) },
  { dataset: { pdfSheet: "4" }, getBoundingClientRect: () => ({ top: 140, bottom: 600, left: 0, right: 200 }) },
] };
assert.deepEqual(currentResearchRange(viewer, source, 2), { start: 86, end: 87 }, "Current spread follows scroll position");
assert.deepEqual(currentResearchRange(null, { ...source, printedEnd: 84 }, 2), { start: 84, end: 84 }, "Odd last pages remain valid");
const prompt = researchPrompt([{ ...pages[0], filename: "changbi_p84.png", text: "사회 불평등" }], "자료를 비교해줘");
assert.match(prompt, /창비.*통합사회2 교사용.*2022 개정/);
assert.match(prompt, /인쇄된 쪽수: 84쪽/); assert.match(prompt, /자료를 비교해줘/); assert.match(prompt, /사회 불평등/);
assert.doesNotMatch(prompt, /X-Goog|storage.googleapis.com|preview=1/);
assert.match(researchPrompt([{ ...pages[0], filename: "page.png" }], ""), /추출된 본문이 없습니다/);

const savedDocument = globalThis.document;
let canvas, failText = false;
const pdf = { numPages: 1, getPage: async number => ({
  getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale }),
  render: ({ viewport, background }) => { assert.equal(number, 1); assert.equal(viewport.height, 2400); assert.equal(background, "rgb(255,255,255)"); return { promise: Promise.resolve() }; },
  getTextContent: async () => { if (failText) throw new Error("Missing font"); return { items: [{ str: "사회", hasEOL: true }, { str: "정의" }] }; },
}) };
try {
  globalThis.document = { createElement: () => (canvas = { getContext: () => ({}), toBlob: callback => callback(new Blob(["PNG"], { type: "image/png" })) }) };
  const exported = await renderTextbookExportPage(pdf, 1);
  assert.equal(exported.blob.type, "image/png"); assert.match(exported.text, /사회\n정의/);
  assert.equal(canvas.width, 0, "Temporary export canvas memory is released");
  failText = true; assert.equal((await renderTextbookExportPage(pdf, 1)).text, "", "Text extraction failure preserves the image");
  await assert.rejects(renderTextbookExportPage(pdf, 2), /Invalid export page/);
} finally { globalThis.document = savedDocument; }
const temp = await mkdtemp(join(tmpdir(), "booong-export-"));
try {
  const zip = await researchZip([{ name: "page.png", blob: new Blob([new Uint8Array([0, 1, 255])]) }, { name: "연구자료.txt", blob: new Blob([prompt]) }]);
  const path = join(temp, "research.zip"); await writeFile(path, new Uint8Array(await zip.arrayBuffer()));
  execFileSync("python3", ["-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read('page.png')==bytes([0,1,255]); assert '책에 인쇄된 쪽수: 84쪽' in z.read('연구자료.txt').decode('utf-8')", path]);
  const savedBitmap = globalThis.createImageBitmap, captureCanvases = [], progress = [];
  try {
    globalThis.createImageBitmap = async blob => ({ ...JSON.parse(await blob.text()), close() {} });
    globalThis.document = { createElement: () => {
      const canvas = { colors: [], getContext() { return {
        canvas, fillRect() { canvas.colors = []; },
        drawImage(image, x) { canvas.colors[x / 1200] = image.color; },
        getImageData(x, y, width, count) {
          const data = new Uint8ClampedArray(width * count * 4);
          for (let i = 0; i < width * count; i++) data.set(canvas.colors[Math.floor((i % width) / 1200)] || [255, 255, 255, 255], i * 4);
          return { data };
        },
      }; }, toBlob(callback) { callback(new Blob([JSON.stringify({ color: this.color })])); } };
      captureCanvases.push(canvas); return canvas;
    } };
    const chapter = { numPages: 3, getPage: async number => ({
      getViewport: ({ scale }) => ({ width: 600 * scale, height: 400 * scale }),
      render: ({ canvasContext, viewport }) => {
        assert.equal(viewport.width, 1200); canvasContext.canvas.color = [number * 40, 0, 0, 255];
        return { promise: Promise.resolve() };
      },
      getTextContent() { throw new Error("Image capture must not extract unused text"); },
    }) };
    const capture = await renderTextbookChapterCapture(chapter, 2, page => progress.push(page));
    const capturePath = join(temp, "chapter.png"); await writeFile(capturePath, new Uint8Array(await capture.arrayBuffer()));
    execFileSync("python3", ["-c", `import struct,zlib,sys
b=open(sys.argv[1],'rb').read(); assert b[:8]==bytes([137,80,78,71,13,10,26,10])
p=8; compressed=b''
while p<len(b):
 n=struct.unpack('>I',b[p:p+4])[0]; kind=b[p+4:p+8]; payload=b[p+8:p+8+n]
 assert zlib.crc32(kind+payload)==struct.unpack('>I',b[p+8+n:p+12+n])[0]
 if kind==b'IHDR': assert struct.unpack('>IIBBBBB',payload)==(2400,1600,8,6,0,0,0)
 if kind==b'IDAT': compressed+=payload
 p+=n+12
raw=zlib.decompress(compressed); stride=2400*4+1; assert len(raw)==1600*stride
for y in range(1600): assert raw[y*stride]==0
def pixel(x,y): return list(raw[y*stride+1+x*4:y*stride+1+x*4+4])
assert pixel(0,0)==[40,0,0,255] and pixel(1200,0)==[80,0,0,255]
assert pixel(0,800)==[120,0,0,255] and pixel(1200,800)==[255,255,255,255]
`, capturePath]);
    assert.deepEqual(progress, [1, 2, 3], "All chapter pages are captured in reading order, including an odd final page");
    assert.ok(captureCanvases.every(canvas => canvas.width === 0 && canvas.height === 0), "Capture releases each canvas after use");
    await assert.rejects(renderTextbookChapterCapture(chapter, 1, () => { throw new Error("Cancelled"); }), /Cancelled/);
    assert.ok(captureCanvases.every(canvas => canvas.width === 0 && canvas.height === 0), "Cancelled captures also release canvas memory");
    await assert.rejects(renderTextbookChapterCapture(chapter, 3), /Invalid/);
  } finally {
    globalThis.document = savedDocument;
    if (savedBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = savedBitmap;
  }
} finally { await rm(temp, { recursive: true }); }
console.log("Research ZIP and full-chapter PNG capture, page order, odd spreads, cancellation, and memory cleanup checks passed.");
