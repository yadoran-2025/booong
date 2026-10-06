import { loadDashboardConfig } from "./dashboard-data.js";
import { createSubjectOptions, SCHOOL_OPTIONS } from "./teacher-profile.js";
import { escapeHtml as escape } from "./utils.js";
import { getTextbookSection, textbooksForUnit } from "./textbook-library.js";
import { mountTextbookPdfs, forgetTextbookPdf, resizeTextbookPdf, exportTextbookChapter } from "./textbook-pdf.js";
import { currentResearchRange, openTextbookResearch, downloadTextbookFile } from "./textbook-export.js";

const SAMPLE_UNIT = "사회2::III. 시장과 가격";
const BOOKS = ["교과서 A", "교과서 B", "교과서 C"];
const root = typeof document === "undefined" ? null : document.querySelector("#admin-root");

export function selectTextbookUnits(catalog, school, subject, query = "") {
  const needle = query.trim().toLocaleLowerCase();
  return (catalog.units || []).filter(unit => unit.school === school && unit.subject === subject
    && [unit.title, ...(unit.middleUnits || [])].join(" ").toLocaleLowerCase().includes(needle));
}

export function toggleTextbookSelection(books, book) {
  if (books.includes(book)) return books.length > 1 ? books.filter(value => value !== book) : books;
  return books.length < 2 ? [...books, book] : books;
}

export function createTextbookSubjectOptions(catalog) {
  const labels = new Map((catalog.subjects || []).map(subject => [subject.value, subject.label]));
  return createSubjectOptions({ subjects: [...(catalog.units || [])
    .map(unit => ({ school: unit.school, value: unit.subject, label: labels.get(unit.subject) })), ...(catalog.subjects || [])] });
}

export function isLocalTextbookPreview(url) {
  const parsed = new URL(url);
  return ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && parsed.searchParams.get("preview") === "1";
}

export function createTextbookLink(url, library, bookId, unitKey, chapter = -1) {
  const book = library.books.find(item => item.id === bookId);
  const unitIndex = book?.units.findIndex(item => item.key === unitKey) ?? -1;
  if (unitIndex < 0 || !getTextbookSection(library, bookId, unitKey, chapter)) return null;
  const link = new URL("/textbook-analysis.html", url);
  link.searchParams.set("book", bookId);
  link.searchParams.set("unit", String(unitIndex + 1));
  if (chapter >= 0) link.searchParams.set("chapter", String(chapter + 1));
  if (isLocalTextbookPreview(url)) link.searchParams.set("preview", "1");
  return link.toString();
}

export function readTextbookLink(url, library) {
  const params = new URL(url).searchParams;
  const book = library.books.find(item => item.id === params.get("book"));
  if (!book || !/^[1-9]\d*$/.test(params.get("unit") || "")) return null;
  const unit = book.units[Number(params.get("unit")) - 1];
  const chapter = params.has("chapter") ? /^[1-9]\d*$/.test(params.get("chapter")) ? Number(params.get("chapter")) - 1 : NaN : -1;
  return unit && getTextbookSection(library, book.id, unit.key, chapter) ? { book, unit, chapter } : null;
}

export const defaultTextbookColumns = (bookCount, mobile) => bookCount === 1 && !mobile ? 2 : 1;

export const clampTextbookZoom = zoom => Math.min(300, Math.max(80, Math.round(zoom)));

export function bindTextbookPinch(root, getZoom, setZoom) {
  const pending = new Map();
  let gesture, touchPinch;
  const bookAt = event => {
    const canvas = event.target.closest?.(".textbook__canvas");
    return canvas?.querySelector("[data-pdf-url], .textbook__sample-pages") ? Number(canvas.closest("[data-book-viewer]").dataset.bookViewer) : null;
  };
  function queue(book, zoom) {
    const entry = pending.get(book);
    if (entry) { entry.zoom = Math.min(300, Math.max(80, zoom)); return; }
    const next = { zoom: Math.min(300, Math.max(80, zoom)), timer: null };
    pending.set(book, next);
    setZoom(book, clampTextbookZoom(next.zoom));
    // ponytail: redraw at most every 100 ms during a pinch; reuse the existing PDF renderer.
    next.timer = setTimeout(() => {
      pending.delete(book);
      if (getZoom(book) !== clampTextbookZoom(next.zoom)) setZoom(book, clampTextbookZoom(next.zoom));
    }, 100);
  }
  root.addEventListener("wheel", event => {
    if (!event.ctrlKey || gesture || touchPinch || !Number.isFinite(event.deltaY)) return;
    const book = bookAt(event);
    if (book == null) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 640 : 1);
    queue(book, (pending.get(book)?.zoom ?? getZoom(book)) * Math.exp(-pixels * 0.01));
  }, { passive: false });
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  root.addEventListener("touchstart", event => {
    if (event.touches.length !== 2) { touchPinch = null; return; }
    const book = bookAt({ target: event.touches[0].target });
    if (book == null || bookAt({ target: event.touches[1].target }) !== book) return;
    const start = distance(event.touches);
    if (!start) return;
    event.preventDefault();
    gesture = null;
    touchPinch = { book, zoom: getZoom(book), distance: start };
  }, { passive: false });
  root.addEventListener("touchmove", event => {
    if (!touchPinch || event.touches.length !== 2) return;
    event.preventDefault();
    queue(touchPinch.book, touchPinch.zoom * distance(event.touches) / touchPinch.distance);
  }, { passive: false });
  for (const type of ["touchend", "touchcancel"]) root.addEventListener(type, event => {
    if (event.touches.length !== 2) touchPinch = null;
  }, { passive: false });
  root.addEventListener("gesturestart", event => {
    if (touchPinch) { event.preventDefault(); return; }
    const book = bookAt(event);
    if (book == null) return;
    event.preventDefault(); gesture = { book, zoom: getZoom(book) };
  }, { passive: false });
  root.addEventListener("gesturechange", event => {
    if (touchPinch) { event.preventDefault(); return; }
    if (!gesture || !Number.isFinite(event.scale) || event.scale <= 0) return;
    event.preventDefault(); queue(gesture.book, gesture.zoom * event.scale);
  }, { passive: false });
  root.addEventListener("gestureend", event => {
    if (!gesture) return;
    event.preventDefault(); gesture = null;
  }, { passive: false });
}

async function start() {
  const preview = isLocalTextbookPreview(location.href);
  let libraryResponse;
  if (preview) libraryResponse = await fetch("data/textbooks.json", { cache: "no-store" });
  else {
    const { requireAdmin } = await import("./admin.js");
    // The protected catalog response also verifies access, so no separate admin request is needed.
    libraryResponse = await requireAdmin(root, "/api/textbooks?catalog=1");
    if (!libraryResponse) return;
  }
  if (!libraryResponse.ok) throw new Error("Textbook catalog unavailable");
  const library = await libraryResponse.json();
  root.innerHTML = '<p class="analytics__empty" role="status">과목과 단원 목록을 불러오고 있습니다.</p>';
  const { catalog } = await loadDashboardConfig();
  for (const book of library.books) for (const unit of book.units) {
    if (!catalog.units.some(item => item.key === unit.key)) catalog.units.push({ ...unit, school: book.school, subject: book.subject, middleUnits: unit.chapters.map(chapter => chapter.title) });
  }
  const options = createTextbookSubjectOptions(catalog);
  // ponytail: 분석 메모는 탭에만 보관. 영구 메모 저장은 별도 요구가 있을 때 추가한다.
  const notes = new Map();
  let capturing = false;
  const linked = readTextbookLink(location.href, library);
  const initialBook = linked?.book || library.books[0];
  const state = { school: initialBook?.school || "중학교", subject: initialBook?.subject || "사회2", unit: linked?.unit.key || initialBook?.units[0]?.key || SAMPLE_UNIT, books: [0], query: "", chapter: -1, zooms: Array(Math.max(3, library.books.length)).fill(100), columns: Array(Math.max(3, library.books.length)).fill(null) };
  if (!catalog.units.some(unit => unit.key === state.unit)) {
    Object.assign(state, { school: catalog.units[0]?.school || "중학교", subject: catalog.units[0]?.subject || options["중학교"][0]?.value || "", unit: catalog.units[0]?.key });
  }
  if (linked) {
    state.books = [textbooksForUnit(library, state.unit).findIndex(book => book.id === linked.book.id)];
    if (linked.chapter >= 0) state.chapter = catalog.units.find(unit => unit.key === state.unit).middleUnits.indexOf(linked.unit.chapters[linked.chapter].title);
  }
  const columnsForBook = book => state.columns[book] ?? defaultTextbookColumns(state.books.length, window.matchMedia("(max-width: 760px)").matches);
  const noteKey = book => `${state.unit}::${book}`;
  const selectedUnit = () => catalog.units.find(unit => unit.key === state.unit);
  const middles = unit => [...new Set(unit?.middleUnits || [])];
  const hasSample = unit => preview && unit?.key === SAMPLE_UNIT;
  const countBooks = unit => hasSample(unit) ? Math.max(BOOKS.length, textbooksForUnit(library, unit.key).length) : textbooksForUnit(library, unit.key).length;
  const bookChoices = () => textbooksForUnit(library, state.unit).map(book => book.publisher);
  const resetPage = () => {
    state.zooms.fill(100); state.chapter = -1;
    state.books = state.books.filter(book => book < (bookChoices().length || BOOKS.length));
    if (!state.books.length) state.books = [0];
  };
  function fileForBook(book) {
    if (state.chapter < 0) return null;
    const registered = textbooksForUnit(library, state.unit)[book];
    if (!registered) return null;
    const registeredUnit = registered.units.find(unit => unit.key === state.unit);
    const chapter = registeredUnit.chapters.findIndex(item => item.title === middles(selectedUnit())[state.chapter]);
    if (chapter < 0) return null;
    const { section } = getTextbookSection(library, registered.id, state.unit, chapter);
    const query = new URLSearchParams({ book: registered.id, unit: state.unit, chapter: String(chapter) });
    if (preview) query.set("preview", "1");
    return { ...section, bookId: registered.id, chapter, publisher: registered.publisher, bookTitle: registered.title, revision: registered.revision, school: registered.school, unitTitle: registeredUnit.title, chapterTitle: section.title, title: `${registered.title} · ${section.title}`, type: "application/pdf", url: `/api/textbooks?${query}`, remote: true };
  }

  function shareLink(book) {
    const file = fileForBook(book);
    return file ? createTextbookLink(location.href, library, file.bookId, state.unit, file.chapter) : null;
  }
  function syncLink() {
    const link = shareLink(state.books[0]);
    const url = new URL(link || location.href);
    if (!link) ["book", "unit", "chapter"].forEach(key => url.searchParams.delete(key));
    history.replaceState(null, "", url.pathname + url.search);
  }

  function unitButtons(units) {
    const unit = units.find(item => item.key === state.unit);
    return `<div class="textbook__unit-track" role="group" aria-label="대단원">${units.map(item => `<button type="button" class="textbook__unit" data-unit="${escape(item.key)}" aria-pressed="${item.key === state.unit}" aria-expanded="${item.key === state.unit}" aria-controls="textbook-chapters"><span>${escape(item.title)}</span><small>${countBooks(item) ? `<i aria-hidden="true"></i>교과서 ${countBooks(item)}종${hasSample(item) ? " · 예시" : ""}` : "아직 연결된 교과서 없음"}</small></button>`).join("") || '<p class="textbook__muted">일치하는 단원이 없습니다.</p>'}</div><ol id="textbook-chapters" class="textbook__chapters" aria-label="${escape(unit?.title || "선택한 대단원")} 중단원">${middles(unit).map((title, i) => `<li><button type="button" data-chapter="${i}" aria-pressed="${state.chapter === i}"><span class="textbook__chapter-index">${String(i + 1).padStart(2, "0")}</span><span>${escape(title.replace(/^\d+\.\s*/, ""))}</span></button></li>`).join("")}</ol>`;
  }

  function bookButtons() {
    const choices = bookChoices();
    return (choices.length ? choices : BOOKS).map((book, i) => `<button type="button" data-book="${i}" aria-pressed="${state.books.includes(i)}" ${(state.books.length === 2 && !state.books.includes(i)) || (!preview && (!choices.length || (state.chapter >= 0 && !fileForBook(i)))) ? "disabled" : ""}><span class="textbook__book-check" aria-hidden="true">${state.books.includes(i) ? "✓" : "＋"}</span>${escape(book)}</button>`).join("");
  }

  function refreshViewer(book) {
    const container = root.querySelector(`[data-book-viewer="${book}"]`);
    if (!container) return;
    const open = container.querySelector("details").open;
    const oldPdf = container.querySelector("[data-pdf-url]");
    if (oldPdf && oldPdf.dataset.pdfUrl === fileForBook(book)?.url) {
      const template = document.createElement("template");
      const unit = selectedUnit(), chapters = middles(unit);
      template.innerHTML = viewer(book, unit, chapters, Math.max(chapters.length * 2, 2));
      container.querySelector(".textbook__toolbar").replaceWith(template.content.querySelector(".textbook__toolbar"));
      const nextPdf = template.content.querySelector("[data-pdf-url]");
      oldPdf.dataset.pdfZoom = nextPdf.dataset.pdfZoom;
      oldPdf.dataset.pdfColumns = nextPdf.dataset.pdfColumns;
      resizeTextbookPdf(oldPdf);
      return;
    }
    const unit = selectedUnit();
    const chapters = middles(unit);
    const template = document.createElement("template");
    template.innerHTML = viewer(book, unit, chapters, Math.max(chapters.length * 2, 2));
    template.content.querySelector("details").open = open;
    container.replaceWith(template.content.firstElementChild);
    mountTextbookPdfs(root);
    const scroller = root.querySelector(`[data-book-viewer="${book}"] .textbook__canvas`);
    if (hasSample(unit) && state.chapter >= 0) scroller.scrollTop = scroller.querySelector(`[data-sample-page="${state.chapter * 2}"]`)?.offsetTop - scroller.firstElementChild.offsetTop || 0;
  }

  function refreshBookSelection() {
    root.querySelector(".textbook__books").innerHTML = bookButtons();
    const viewers = root.querySelector(".textbook__viewers");
    viewers.classList.toggle("textbook__viewers--compare", state.books.length === 2);
    viewers.querySelectorAll("[data-book-viewer]").forEach(container => {
      if (!state.books.includes(Number(container.dataset.bookViewer))) container.remove();
    });
    const unit = selectedUnit();
    const chapters = middles(unit);
    state.books.forEach(book => {
      if (!viewers.querySelector(`[data-book-viewer="${book}"]`)) viewers.insertAdjacentHTML("beforeend", viewer(book, unit, chapters, Math.max(chapters.length * 2, 2)));
    });
    state.books.forEach(refreshViewer);
    mountTextbookPdfs(root);
  }

  function viewer(book, unit, chapters, pages) {
    const file = fileForBook(book);
    if (file?.remote) pages = file.pdfEnd - file.pdfStart + 1;
    const sample = hasSample(unit) && !file;
    const publisher = bookChoices()[book] || BOOKS[book];
    const waiting = state.chapter < 0 && !!bookChoices()[book];
    const zoom = state.zooms[book];
    const pageColumns = columnsForBook(book);
    return `<section class="textbook__viewer" data-book-viewer="${book}" aria-label="${escape(publisher)} 열람"><header class="textbook__viewer-heading"><strong>${escape(publisher)}</strong>${file ? `<div><button type="button" class="btn btn--ghost" data-research>AI 연구용 내보내기</button><button type="button" class="btn btn--ghost" data-share="${book}">링크 복사</button><button type="button" class="btn btn--ghost" data-capture="${book}" title="소단원 전체를 한 장의 PNG 이미지로 저장" ${capturing ? "disabled" : ""}>${capturing ? "저장 중…" : "캡처 저장"}</button><button type="button" class="btn btn--ghost" data-reload="${book}">다시 열기</button></div>` : ""}</header><div class="textbook__toolbar"><span>${escape(file?.title || (sample ? "예시 지면 · 실제 교과서 아님" : waiting ? "소단원 선택 대기" : "연결된 교과서 없음"))}</span>${sample || file?.remote ? `<div class="textbook__view-controls"><div role="group" aria-label="${escape(publisher)} 쪽 보기">${[1, 2].map(columns => `<button type="button" class="btn ${pageColumns === columns ? "btn--primary" : "btn--ghost"}" data-columns="${columns}" data-viewer="${book}" aria-pressed="${pageColumns === columns}">${columns === 1 ? "한 쪽" : "두 쪽"}</button>`).join("")}</div><button type="button" class="btn btn--ghost" data-zoom="-10" data-viewer="${book}" aria-label="${escape(publisher)} 지면 축소" ${zoom <= 80 ? "disabled" : ""}>−</button><span>${zoom}%</span><button type="button" class="btn btn--ghost" data-zoom="10" data-viewer="${book}" aria-label="${escape(publisher)} 지면 확대" ${zoom >= 300 ? "disabled" : ""}>＋</button></div>` : ""}</div>
      <div class="textbook__canvas">${file ? `<div class="textbook__pdf-page" data-pdf-url="${escape(file.url)}" data-pdf-start="${file.printedStart}" data-pdf-zoom="${zoom}" data-pdf-columns="${pageColumns}" aria-label="${escape(file.title)}"><p class="textbook__muted" role="status">교과서 지면을 불러오고 있습니다.</p></div>` : sample ? `<div class="textbook__sample-pages" style="width:${zoom}%;grid-template-columns:repeat(${pageColumns}, minmax(0, 1fr))">${Array.from({ length: pages }, (_, page) => samplePage(chapters, pages, book, page)).join("")}</div>` : `<div class="textbook__empty"><h3>${waiting ? "소단원을 선택해주세요" : "아직 연결된 교과서가 없습니다"}</h3><p>${waiting ? "위 단원 목록에서 소단원을 고르면 교과서가 열립니다." : "등록된 교과서는 이곳에서 펼쳐볼 수 있습니다."}</p></div>`}</div>
      <footer class="textbook__page-controls"><span>${file?.remote ? `책 ${file.printedStart}–${file.printedEnd}쪽 · ${pages} PDF 페이지 · 아래로 스크롤해서 읽기` : sample ? `${pages}개 예시 지면 · 아래로 스크롤해서 읽기` : waiting ? "소단원을 선택한 뒤 열람할 수 있습니다." : "연결된 교과서 없음"}</span></footer>
      <details class="textbook__notes"><summary>${escape(publisher)} 분석 메모</summary><label class="sr-only" for="textbook-note-${book}">${escape(publisher)} 분석 메모</label><textarea id="textbook-note-${book}" class="field__input" rows="5" placeholder="핵심 개념, 탐구 활동, 수업 아이디어를 적어두세요" data-note="${book}">${escape(notes.get(noteKey(book)) || "")}</textarea><small>이 탭에서만 유지 · 교과서별로 작성</small></details>
    </section>`;
  }

  function render() {
    const unit = selectedUnit();
    const units = selectTextbookUnits(catalog, state.school, state.subject, state.query);
    const chapters = middles(unit);
    const pages = Math.max(chapters.length * 2, 2);
    root.classList.add("textbook");
    root.innerHTML = `<div class="textbook__inner">
      <nav class="analytics__nav textbook__nav" aria-label="페이지 이동"><a class="analytics__brand" href="index.html">BOOONG <small>TEXTBOOK</small></a><div class="textbook__nav-right"><span class="chip chip--gray">${preview ? "로컬 미리보기" : "운영자 전용"}</span><a class="analytics__back" href="index.html">← 홈으로</a></div></nav>
      <header class="textbook__hero"><div><p class="analytics__eyebrow">교과서로 시작하는 수업 준비</p><h1>교과서 분석<span>.</span></h1><p>소단원을 고르면, 교과서의 내용과 흐름이 한눈에.</p></div></header>
      <div class="textbook__notice"><span class="textbook__notice-dot" aria-hidden="true"></span><span><strong>${preview ? "로컬 미리보기" : "교과서 열람"}</strong> · 교과서 ${library.books.length}권이 연결되었습니다. 대단원을 고른 뒤 소단원을 선택하면 해당 부분이 열립니다.</span></div>
      <section class="textbook__filters" aria-label="과목 선택"><div class="textbook__school" role="group" aria-label="학교급">${SCHOOL_OPTIONS.map(({ value, label }) => `<button type="button" data-school="${value}" aria-pressed="${state.school === value}">${label}</button>`).join("")}</div><div class="textbook__subject"><span>과목</span><div class="textbook__subjects" role="group" aria-label="과목">${options[state.school].map(({ value, label }) => `<button type="button" class="btn ${value === state.subject ? "btn--primary" : "btn--secondary"}" data-subject="${escape(value)}" aria-pressed="${value === state.subject}">${escape(label)}</button>`).join("")}</div></div><span class="textbook__catalog-label">기존 교육과정 단원 기준</span></section>
      <div class="textbook__workspace">
        <aside class="textbook__units" aria-label="단원 탐색"><header><h2>단원 탐색</h2><span data-unit-count>${units.length}개</span></header><label class="textbook__search"><span class="sr-only">단원 검색</span><input class="field__input" type="search" placeholder="단원 이름으로 찾기" value="${escape(state.query)}" data-search></label><div class="textbook__unit-list">${unitButtons(units)}</div></aside>
        <section class="textbook__reading" aria-label="교과서 열람"><header class="textbook__unit-heading"><p>${escape(state.school)} <span>/</span> ${escape(options[state.school].find(item => item.value === state.subject)?.label || state.subject)}</p><h2>${escape(unit?.title || "단원을 선택해주세요")}</h2></header>
          <div class="textbook__book-picker"><div class="textbook__books" role="group" aria-label="교과서 선택">${bookButtons()}</div><p>최대 2개 선택 · 선택한 교과서를 다시 누르면 해제됩니다.</p></div>
          <div class="textbook__viewers ${state.books.length === 2 ? "textbook__viewers--compare" : ""}">${state.books.map(book => viewer(book, unit, chapters, pages)).join("")}</div>
        </section>
      </div><p class="textbook__footnote" role="status" data-status>${preview ? "로컬 미리보기에서는 Google 운영자 인증을 생략합니다." : "Google 운영자 권한을 확인한 뒤 교과서를 엽니다."} PDF가 열리지 않으면 ‘다시 열기’를 눌러주세요. 분석 메모는 이 탭에서만 유지됩니다.</p>
    </div>`;
    syncLink();
    mountTextbookPdfs(root);
    const track = root.querySelector(".textbook__unit-track");
    const activeUnit = track.querySelector('[aria-pressed="true"]');
    if (activeUnit) track.scrollLeft = activeUnit.offsetLeft - track.offsetLeft;
  }

  function samplePage(chapters, pages, bookIndex, page) {
    const title = chapters[Math.floor(page / 2)] || "단원 살펴보기";
    const activity = page % 2 === 1;
    const book = BOOKS[bookIndex];
    return `<article class="textbook__paper" data-sample-page="${page}"><div class="textbook__paper-top"><span>${escape(state.subject)} · ${book}</span><span>예시 지면</span></div><p class="textbook__paper-kicker">${activity ? "함께 탐구하기" : "개념 이해하기"}</p><h3>${escape(title.replace(/^\d+\.\s*/, ""))}</h3><p class="textbook__paper-lead">${activity ? "우리 주변의 시장을 관찰하고, 가격이 달라지는 이유를 이야기해 봅시다." : ["같은 물건도 언제, 어디에서 거래하느냐에 따라 가격이 달라집니다. 시장에서는 어떤 일이 일어나고 있을까요?", "일상 속 거래 사례를 살펴보며 시장에서 가격이 형성되는 과정을 이해해 봅시다.", "자료를 읽고 질문에 답하며 시장의 역할과 가격 변화의 원리를 찾아봅시다."][bookIndex]}</p><div class="textbook__paper-visual"><div class="textbook__market" aria-hidden="true"><span>수요</span><i>⇄</i><span>공급</span></div><p>${activity ? "자료를 해석하고 나의 생각 정리하기" : "우리의 선택이 만나는 곳, 시장"}</p></div><h4>${activity ? "탐구 활동" : "생활 속에서 만나는 경제"}</h4><p class="textbook__paper-body">${activity ? "학교 앞 가게에서 자주 사는 물건을 하나 골라 보자. 그 물건의 가격은 어떤 상황에서 변할까? 구매자의 선택과 판매자의 입장에서 각각 설명해 보자." : "시장은 재화와 서비스를 사고파는 과정에서 구매자와 판매자가 만나는 곳이다. 사람들의 다양한 선택은 거래를 통해 연결되고, 가격은 이러한 선택을 조정하는 역할을 한다."}</p><div class="textbook__paper-question"><strong>생각 열기</strong><p>${activity ? "친구의 설명과 나의 설명에서 공통점을 찾아보자." : "사람들이 더 많이 찾는 물건의 가격은 어떻게 달라질까?"}</p>${activity ? '<div class="textbook__answer-lines" aria-hidden="true"></div>' : ""}</div><footer><span>목업용 자체 작성 예시 · 실제 교과서 아님</span><strong>${page + 1} / ${pages}</strong></footer></article>`;
  }

  root.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.capture != null) {
      if (capturing) return;
      const book = Number(button.dataset.capture), file = fileForBook(book);
      if (!file) return;
      capturing = true;
      root.querySelectorAll("[data-capture]").forEach(button => { button.disabled = true; });
      button.textContent = "저장 중…";
      const check = () => {
        if (fileForBook(book)?.url !== file.url || !root.querySelector(`[data-book-viewer="${book}"] [data-pdf-url]`)) throw new Error("단원이 변경되어 캡처를 중단했습니다. 원하는 소단원에서 다시 눌러주세요.");
      };
      try {
        const blob = await exportTextbookChapter(file.url, columnsForBook(book), (page, total) => {
          check(); root.querySelector("[data-status]").textContent = `소단원 캡처 중 · ${page} / ${total}쪽`;
        });
        check();
        const name = `${file.publisher}_${file.bookTitle}_${file.chapterTitle}_${file.printedStart}-${file.printedEnd}쪽`.replace(/[\\/:*?"<>|]/g, "-");
        downloadTextbookFile(blob, `${name}.png`);
        root.querySelector("[data-status]").textContent = `소단원 전체 ${file.printedStart}–${file.printedEnd}쪽을 한 장의 이미지로 저장 요청했습니다.`;
      } catch (error) {
        root.querySelector("[data-status]").textContent = /로그인|운영자 권한|단원이 변경/.test(error.message) ? error.message : "캡처를 저장하지 못했습니다. 교과서를 다시 열고 시도해주세요.";
      } finally {
        capturing = false;
        root.querySelectorAll("[data-capture]").forEach(button => { button.disabled = false; button.textContent = "캡처 저장"; });
      }
      return;
    }
    if (button.hasAttribute("data-research")) {
      const sources = state.books.map(book => {
        const file = fileForBook(book);
        if (!file) return null;
        const viewer = root.querySelector(`[data-book-viewer="${book}"] [data-pdf-url]`);
        const range = currentResearchRange(viewer, file, columnsForBook(book));
        return { ...file, ...range, viewer };
      }).filter(Boolean);
      if (sources.length) openTextbookResearch(sources);
      else root.querySelector("[data-status]").textContent = "연결된 교과서를 선택한 뒤 내보내기를 눌러주세요.";
      return;
    }
    if (button.dataset.share != null) {
      const link = shareLink(Number(button.dataset.share));
      if (!link) return;
      const url = new URL(link);
      history.replaceState(null, "", url.pathname + url.search);
      try {
        await navigator.clipboard.writeText(link);
        button.textContent = "복사됨";
        root.querySelector("[data-status]").textContent = preview ? "로컬 미리보기 링크를 복사했습니다. 다른 사람에게 공유하려면 운영 사이트 배포가 필요합니다." : "단원 링크를 복사했습니다. 받은 사람도 Google 로그인과 운영자 권한이 필요합니다.";
      } catch {
        root.querySelector("[data-status]").textContent = "브라우저가 복사를 허용하지 않았습니다. 주소창의 단원 링크를 복사해주세요.";
      }
      return;
    }
    if (button.dataset.reload != null) {
      const book = Number(button.dataset.reload);
      forgetTextbookPdf(fileForBook(book)?.url);
      root.querySelector(`[data-book-viewer="${book}"] [data-pdf-url]`)?.remove();
      refreshViewer(book); return;
    }
    if (button.dataset.book != null) {
      state.books = toggleTextbookSelection(state.books, Number(button.dataset.book));
      refreshBookSelection(); syncLink(); root.querySelector(`[data-book="${button.dataset.book}"]`).focus(); return;
    }
    if (button.dataset.columns) {
      const book = Number(button.dataset.viewer);
      state.columns[book] = Number(button.dataset.columns);
      refreshViewer(book);
      root.querySelector(`[data-columns="${button.dataset.columns}"][data-viewer="${book}"]`).focus(); return;
    }
    if (button.dataset.zoom) {
      const book = Number(button.dataset.viewer);
      state.zooms[book] = clampTextbookZoom(state.zooms[book] + Number(button.dataset.zoom));
      refreshViewer(book);
      root.querySelector(`[data-zoom="${button.dataset.zoom}"][data-viewer="${book}"]`).focus(); return;
    }
    if (button.dataset.chapter != null) {
      state.chapter = Number(button.dataset.chapter);
      const trackPosition = root.querySelector(".textbook__unit-track").scrollLeft;
      root.querySelector(".textbook__unit-list").innerHTML = unitButtons(selectTextbookUnits(catalog, state.school, state.subject, state.query));
      root.querySelector(".textbook__unit-track").scrollLeft = trackPosition;
      state.books.forEach(refreshViewer);
      root.querySelector(".textbook__books").innerHTML = bookButtons();
      syncLink(); root.querySelector(`[data-chapter="${state.chapter}"]`).focus(); return;
    }
    if (button.dataset.school) {
      state.school = button.dataset.school;
      state.subject = options[state.school][0]?.value || "";
      state.unit = selectTextbookUnits(catalog, state.school, state.subject)[0]?.key;
      state.query = ""; resetPage();
    } else if (button.dataset.subject) {
      state.subject = button.dataset.subject; state.query = "";
      state.unit = selectTextbookUnits(catalog, state.school, state.subject)[0]?.key;
      resetPage();
    } else if (button.dataset.unit) { state.unit = button.dataset.unit; resetPage(); }
    else return;
    render();
    const attribute = [...button.attributes].find(item => item.name.startsWith("data-"));
    if (attribute) [...root.querySelectorAll(`[${attribute.name}]`)].find(item => item.getAttribute(attribute.name) === attribute.value && item.dataset.viewer === button.dataset.viewer)?.focus();
  });
  bindTextbookPinch(root, book => state.zooms[book], (book, zoom) => {
    if (!state.books.includes(book) || state.zooms[book] === zoom) return;
    state.zooms[book] = zoom; refreshViewer(book);
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => state.books.forEach(refreshViewer), 100);
  });
  root.addEventListener("input", event => {
    if (event.target.matches("[data-search]")) {
      state.query = event.target.value;
      const units = selectTextbookUnits(catalog, state.school, state.subject, state.query);
      root.querySelector(".textbook__unit-list").innerHTML = unitButtons(units);
      root.querySelector("[data-unit-count]").textContent = `${units.length}개`;
    }
    if (event.target.matches("[data-note]")) notes.set(noteKey(Number(event.target.dataset.note)), event.target.value);
  });
  render();
}

if (root) start().catch(() => { root.innerHTML = '<p class="analytics__empty" role="alert">단원 목록을 불러오지 못했습니다. 새로고침해서 다시 시도해주세요.</p>'; });
