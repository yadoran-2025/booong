import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getTextbookSection, textbooksForUnit } from "../js/textbook-library.js";
import { selectTextbookUnits, createTextbookSubjectOptions, isLocalTextbookPreview, createTextbookLink, readTextbookLink, toggleTextbookSelection, bindTextbookPinch, clampTextbookZoom, defaultTextbookColumns } from "../js/textbook-analysis.js";

assert.equal(defaultTextbookColumns(1, true), 1, "One textbook starts with one page on mobile");
assert.equal(defaultTextbookColumns(1, false), 2, "One textbook starts with two pages on desktop");
assert.equal(defaultTextbookColumns(2, true), 1);
assert.equal(defaultTextbookColumns(2, false), 1, "Comparison starts with one page per textbook");

const catalog = { units: [
  { key: "social", school: "중학교", subject: "사회2", title: "III. 시장과 가격", middleUnits: ["시장 가격의 결정"] },
  { key: "economy", school: "고등학교", subject: "경제", title: "시장", middleUnits: [] },
] };
assert.deepEqual(selectTextbookUnits(catalog, "중학교", "사회2", " 결정 ").map(unit => unit.key), ["social"]);
assert.deepEqual(selectTextbookUnits(catalog, "중학교", "사회2", "없는 단원"), []);
assert.deepEqual(selectTextbookUnits(catalog, "고등학교", "경제").map(unit => unit.key), ["economy"]);
assert.equal(isLocalTextbookPreview("http://127.0.0.1:8765/textbook-analysis.html?preview=1"), true);
assert.equal(isLocalTextbookPreview("http://localhost:8765/textbook-analysis.html"), false);
assert.equal(isLocalTextbookPreview("https://booong.example/textbook-analysis.html?preview=1"), false);
assert.equal(isLocalTextbookPreview("https://localhost.evil.example/textbook-analysis.html?preview=1"), false);
assert.equal(createTextbookSubjectOptions(catalog)["고등학교"].some(option => option.value === "경제"), true);
assert.deepEqual(toggleTextbookSelection([0], 1), [0, 1]);
assert.deepEqual(toggleTextbookSelection([0, 1], 2), [0, 1]);
assert.deepEqual(toggleTextbookSelection([0, 1], 0), [1]);
assert.deepEqual(toggleTextbookSelection([1], 1), [1]);
assert.deepEqual(toggleTextbookSelection([1], 2), [1, 2]);
const library = JSON.parse(await readFile(new URL("../data/textbooks.json", import.meta.url), "utf8"));
const book = library.books[0];
assert.equal(book.subject, "사회2[15개정]", "2015 textbooks must not be linked to the 2022 curriculum");
assert.equal(book.units.length, 12);
assert.equal(book.units.reduce((count, unit) => count + unit.chapters.length, 0), 37);
for (const unit of book.units) {
  assert.equal(textbooksForUnit(library, unit.key).length, 1);
  assert.equal(getTextbookSection(library, book.id, unit.key).section.path, unit.path);
  assert.equal(getTextbookSection(library, book.id, unit.key, 99), null);
  for (const section of [unit, ...unit.chapters]) {
    assert.equal(section.pdfStart, section.printedStart - 2);
    assert.equal(section.pdfEnd, section.printedEnd - 2);
    assert.ok(section.pdfStart >= unit.pdfStart && section.pdfEnd <= unit.pdfEnd);
    assert.ok(section.bytes > 0);
    assert.match(section.sha256, /^[a-f0-9]{64}$/);
  }
}
assert.equal(textbooksForUnit(library, "사회2::III. 시장과 가격").length, 0);
const imported = library.books.filter(item => item.school === "고등학교");
assert.equal(imported.length, 14);
for (const importedBook of imported) {
  assert.equal(importedBook.sourceDriveId, undefined, "Public metadata must not expose source Drive downloads");
  assert.equal(importedBook.revision, "2022 개정");
  assert.equal(importedBook.units.length, 5);
  assert.equal(importedBook.units.flatMap(unit => unit.chapters).length, importedBook.subject === "통합사회1" ? 14 : 16);
  for (const unit of importedBook.units) {
    assert.equal(textbooksForUnit(library, unit.key).length, 7);
    for (const section of [unit, ...unit.chapters]) {
      assert.ok(section.pdfStart >= unit.pdfStart && section.pdfEnd <= unit.pdfEnd);
      assert.ok(section.pdfEnd <= (importedBook.readingPages || importedBook.sourcePages));
      assert.ok(section.bytes > 0);
      assert.match(section.sha256, /^[a-f0-9]{64}$/);
      assert.ok(section.path.startsWith(`booong/textbooks/${importedBook.id}/`));
    }
    const link = createTextbookLink("https://booong.vercel.app", library, importedBook.id, unit.key, unit.chapters.length - 1);
    assert.equal(readTextbookLink(link, library).book.id, importedBook.id);
  }
}
assert.equal(getTextbookSection(library, "../private", book.units[0].key), null);
const link = createTextbookLink("https://booong.vercel.app/textbook-analysis.html?preview=1&other=secret", library, book.id, book.units[7].key, 2);
assert.equal(link, "https://booong.vercel.app/textbook-analysis.html?book=visang-social2-2015&unit=8&chapter=3");
assert.equal(readTextbookLink(link, library).unit.key, book.units[7].key);
assert.equal(readTextbookLink(link, library).chapter, 2);
for (const unit of book.units) {
  const majorLink = createTextbookLink("https://booong.vercel.app", library, book.id, unit.key);
  assert.equal(readTextbookLink(majorLink, library).chapter, -1);
  assert.ok(new URL(majorLink).pathname.length + new URL(majorLink).search.length < 512, "login return URL must fit the existing auth limit");
}
for (const query of ["book=bad&unit=1", `book=${book.id}&unit=0`, `book=${book.id}&unit=99`, `book=${book.id}&unit=1&chapter=99`, `book=${book.id}&unit=1&chapter=1e0`, `book=${book.id}&unit=1&chapter=`]) {
  assert.equal(readTextbookLink(`https://booong.vercel.app?${query}`, library), null);
}
assert.equal(createTextbookLink("https://booong.vercel.app", library, book.id, book.units[0].key, 99), null);
assert.equal(new URL(createTextbookLink("http://127.0.0.1:8765?preview=1", library, book.id, book.units[0].key)).searchParams.get("preview"), "1");
const source = await readFile(new URL("../js/textbook-analysis.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /data-attach|data-upload|createObjectURL/);
console.log("Textbook selection, preview boundary, and authenticated unit links passed.");

const listeners = new Map(), zooms = [100, 100];
const fakeRoot = { addEventListener(type, listener, options) { assert.equal(options.passive, false); listeners.set(type, listener); } };
bindTextbookPinch(fakeRoot, book => zooms[book], (book, zoom) => { zooms[book] = zoom; });
const canvas = { querySelector: () => ({}), closest: () => ({ dataset: { bookViewer: "1" } }) };
const wheel = (deltaY, ctrlKey = true, overBook = true) => ({ deltaY, ctrlKey, deltaMode: 0, target: { closest: () => overBook ? canvas : null }, preventDefault() { this.prevented = true; } });
let event = wheel(-20, false);
listeners.get("wheel")(event);
assert.equal(event.prevented, undefined, "Ordinary trackpad scrolling remains native");
event = wheel(-20, true, false); listeners.get("wheel")(event);
assert.equal(event.prevented, undefined, "Browser zoom outside the textbook stays native");
event = wheel(-20); listeners.get("wheel")(event);
assert.equal(event.prevented, true);
assert.equal(zooms[1], 122);
assert.equal(zooms[0], 100, "Pinching one textbook does not zoom the other");
listeners.get("wheel")(wheel(-20));
await new Promise(resolve => setTimeout(resolve, 120));
assert.equal(zooms[1], 149, "Continuous pinch events accumulate without repeated immediate redraws");
listeners.get("wheel")(wheel(10000));
await new Promise(resolve => setTimeout(resolve, 120));
assert.equal(zooms[1], 80);
const gesture = { ...wheel(0), scale: 2 };
listeners.get("gesturestart")(gesture);
listeners.get("gesturechange")(gesture);
listeners.get("gestureend")(gesture);
await new Promise(resolve => setTimeout(resolve, 120));
assert.equal(zooms[1], 160, "Safari gestures use their starting scale");
assert.equal(clampTextbookZoom(999), 300);
console.log("Trackpad pinch, scrolling, viewer isolation, bounds, and Safari gesture checks passed.");

const touchTarget = { closest: () => canvas };
const touch = (width, count = 2) => ({ touches: Array.from({ length: count }, (_, i) => ({ clientX: i * width, clientY: 0, target: touchTarget })), preventDefault() { this.prevented = true; } });
event = touch(100, 1); listeners.get("touchstart")(event); listeners.get("touchmove")(event);
assert.equal(event.prevented, undefined, "One-finger reading remains native scrolling");
zooms[1] = 100;
event = touch(100); listeners.get("touchstart")(event);
assert.equal(event.prevented, true, "Two fingers on a textbook start its own zoom");
event = touch(150); listeners.get("touchmove")(event);
assert.equal(event.prevented, true);
assert.equal(zooms[1], 150);
listeners.get("gesturestart")({ ...wheel(0), scale: 1 });
listeners.get("gesturechange")({ ...wheel(0), scale: 2 });
await new Promise(resolve => setTimeout(resolve, 120));
assert.equal(zooms[1], 150, "Safari gesture events do not double-apply touch zoom");
listeners.get("touchend")(touch(0, 1));
event = touch(200); listeners.get("touchmove")(event);
assert.equal(event.prevented, undefined, "Lifting a finger ends the pinch");
listeners.get("touchstart")(touch(100));
listeners.get("touchmove")(touch(200));
await new Promise(resolve => setTimeout(resolve, 120));
assert.equal(zooms[1], 300, "Mobile pinch respects the maximum zoom");
assert.equal(zooms[0], 100, "Touch zoom only changes the touched textbook");
listeners.get("touchcancel")(touch(0, 0));
event = touch(50); listeners.get("touchmove")(event);
assert.equal(event.prevented, undefined, "Cancelled touch sequences do not continue zooming");
const outside = touch(100); outside.touches[1].target = { closest: () => null };
listeners.get("touchstart")(outside); listeners.get("touchmove")(outside);
assert.equal(outside.prevented, undefined, "Touches outside or across viewers keep the browser's normal gesture");
console.log("Mobile touch pinch, native scrolling, Safari deduplication, cancellation, and zoom bounds passed.");
