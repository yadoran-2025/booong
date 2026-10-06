import "./textbook-pdf-compat.js";
import { clearTextbookRanges, createTextbookRange, TEXTBOOK_RANGE_SIZE } from "./textbook-range.js";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/";
let renderer;
const documents = new Map();
const observers = new Map();
let account, watchingAccount = false;

async function pdfRenderer() {
  renderer ||= import(`${PDFJS}legacy/build/pdf.mjs`).then(pdf => {
    pdf.GlobalWorkerOptions.workerSrc = new URL("./textbook-pdf-worker.js", import.meta.url).href;
    return pdf;
  }).catch(error => { renderer = null; throw error; });
  return renderer;
}

export function forgetTextbookPdf(url) {
  const entry = documents.get(url);
  documents.delete(url);
  entry?.controller.abort();
  entry?.task?.destroy().catch(() => {});
}

export async function fetchTextbookData(url, options = {}) {
  const target = new URL(url, location.origin);
  const preview = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    && target.origin === location.origin && target.searchParams.get("preview") === "1";
  if (preview) return fetch(target, { ...options, cache: "no-store" });
  const { adminFetch } = await import("./admin.js");
  return adminFetch(target, options);
}

function loadPdf(url) {
  if (documents.has(url)) return documents.get(url).promise;
  const entry = { task: null, controller: new AbortController() };
  documents.set(url, entry);
  entry.promise = (async () => {
    const query = new URL(url, location.origin);
    query.searchParams.set("format", "json");
    if (query.searchParams.get("preview") !== "1") {
      const { adminAccountId, onAdminAccountChange } = await import("./admin.js");
      if (!watchingAccount) {
        watchingAccount = true; account = adminAccountId();
        onAdminAccountChange(uid => {
          if (uid === account) return;
          account = uid; clearTextbookRanges();
          for (const key of documents.keys()) forgetTextbookPdf(key);
          for (const [viewer, cleanup] of observers) {
            cleanup(); viewer.replaceChildren();
            const message = document.createElement("p");
            message.setAttribute("role", "alert"); message.textContent = "Google 계정이 변경되었습니다. 새로고침 후 다시 로그인해주세요.";
            viewer.append(message);
          }
          observers.clear();
        });
      }
    }
    const refresh = async () => {
      const response = await fetchTextbookData(query, { signal: entry.controller.signal });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) clearTextbookRanges();
        throw new Error(response.status === 401 ? "Google 계정으로 로그인 후 다시 열어주세요." : response.status === 403 ? "운영자 권한이 있는 Google 계정만 열람할 수 있습니다." : "PDF에 연결하지 못했습니다. 다시 열어주세요.");
      }
      return response.json();
    };
    const signed = await refresh();
    const pdf = await pdfRenderer();
    if (documents.get(url) !== entry) throw new Error("Viewer closed");
    const range = await createTextbookRange(pdf, signed, refresh, entry.controller, error => {
      forgetTextbookPdf(url);
      for (const viewer of document.querySelectorAll("[data-pdf-url]")) if (viewer.dataset.pdfUrl === url) {
        observers.get(viewer)?.(); observers.delete(viewer); viewer.replaceChildren();
        const message = document.createElement("p");
        message.setAttribute("role", "alert"); message.textContent = error.message;
        viewer.append(message);
      }
    });
    if (documents.get(url) !== entry) { range.abort(); throw new Error("Viewer closed"); }
    entry.task = pdf.getDocument({
      range, cMapUrl: `${PDFJS}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${PDFJS}standard_fonts/`, wasmUrl: `${PDFJS}wasm/`,
      isEvalSupported: false, rangeChunkSize: TEXTBOOK_RANGE_SIZE, disableStream: true, disableAutoFetch: true,
    });
    return entry.task.promise;
  })().catch(error => {
    if (documents.get(url) === entry) forgetTextbookPdf(url);
    throw error;
  });
  return entry.promise;
}

export async function renderTextbookExportPage(pdf, pageNumber, { width, includeText = true } = {}) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error("Invalid export page");
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width ? width / base.width : 2400 / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({ canvasContext: canvas.getContext("2d"), viewport, background: "rgb(255,255,255)" }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Image export failed");
    const content = includeText ? await page.getTextContent().catch(() => ({ items: [] })) : { items: [] };
    const text = content.items.map(item => typeof item.str === "string" ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
    return { blob, text };
  } finally { canvas.width = 0; canvas.height = 0; }
}

export async function exportTextbookPage(url, pageNumber) {
  return renderTextbookExportPage(await loadPdf(url), pageNumber);
}

export async function exportTextbookChapter(url, columns, onProgress) {
  const { renderTextbookChapterCapture } = await import("./textbook-export.js");
  return renderTextbookChapterCapture(await loadPdf(url), columns, onProgress);
}

export function mountTextbookPdfs(root) {
  for (const [viewer, cleanup] of observers) if (!viewer.isConnected) {
    cleanup(); observers.delete(viewer);
  }
  const viewers = [...root.querySelectorAll("[data-pdf-url]")];
  const active = new Set(viewers.map(viewer => viewer.dataset.pdfUrl));
  // ponytail: retain only currently visible PDFs, rather than caching every textbook in memory.
  for (const url of documents.keys()) if (!active.has(url)) forgetTextbookPdf(url);
  for (const viewer of viewers) {
    if (viewer.dataset.pdfMounted) continue;
    viewer.dataset.pdfMounted = "1";
    loadPdf(viewer.dataset.pdfUrl).then(async pdf => renderTextbookPages(viewer, pdf, await pdfRenderer())).then(cleanup => {
      if (!cleanup) return;
      if (viewer.isConnected) observers.set(viewer, cleanup); else cleanup();
    }).catch(error => {
      if (!viewer.isConnected) return;
      viewer.replaceChildren();
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.className = "textbook__muted";
      message.textContent = /로그인|운영자 권한|PDF에 연결/.test(error.message) ? error.message : "PDF를 표시하지 못했습니다. ‘다시 열기’를 눌러주세요.";
      viewer.append(message);
    });
  }
}

export function resizeTextbookPdf(viewer) {
  observers.get(viewer)?.resize();
}

export async function renderTextbookPages(viewer, pdf, { TextLayer } = {}) {
  const first = await pdf.getPage(1);
  if (!viewer.isConnected) return;
  const scroller = viewer.parentElement;
  const base = first.getViewport({ scale: 1 });
  const ratio = Math.min(devicePixelRatio || 1, 2);
  let scale, redrawTimer;
  const jobs = new Map();
  const sheets = Array.from({ length: pdf.numPages }, (_, index) => {
    const sheet = document.createElement("div");
    sheet.className = "textbook__pdf-sheet";
    sheet.dataset.pdfSheet = String(index + 1);
    sheet.setAttribute("role", "group");
    sheet.setAttribute("aria-label", `${viewer.getAttribute("aria-label")} · 책 ${Number(viewer.dataset.pdfStart) + index}쪽`);
    jobs.set(sheet, { index, base, visible: false, version: 0, task: null, textLayer: null });
    return sheet;
  });
  viewer.replaceChildren(...sheets);
  layout();
  const anchor = sheets[Number(scroller.dataset.scrollPage) - 1];
  scroller.scrollTop = anchor ? anchor.offsetTop - viewer.offsetTop + (Number(scroller.dataset.scrollFraction) || 0) * anchor.offsetHeight : Number(scroller.dataset.scrollTop) || 0;
  // ponytail: draw only nearby pages and release offscreen canvases; long books must not fill GPU memory.
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const sheet = entry.target;
      const job = jobs.get(sheet);
      cancel(job);
      job.visible = entry.isIntersecting;
      if (job.visible) draw(sheet, job, job.version);
      else release(sheet);
    }
  }, { root: scroller, rootMargin: "640px 0px" });
  sheets.forEach(sheet => observer.observe(sheet));
  const cleanup = () => {
    clearTimeout(redrawTimer);
    observer.disconnect();
    for (const job of jobs.values()) cancel(job);
    sheets.forEach(release);
  };
  cleanup.resize = () => {
    const anchor = sheets.find(sheet => sheet.offsetTop - viewer.offsetTop + sheet.offsetHeight > scroller.scrollTop);
    const fraction = anchor ? (scroller.scrollTop - (anchor.offsetTop - viewer.offsetTop)) / anchor.offsetHeight : 0;
    const oldWidth = parseFloat(viewer.style.width);
    for (const job of jobs.values()) cancel(job);
    layout();
    if (anchor) scroller.scrollTop = anchor.offsetTop - viewer.offsetTop + fraction * anchor.offsetHeight;
    scroller.scrollLeft *= parseFloat(viewer.style.width) / oldWidth;
    clearTimeout(redrawTimer);
    // ponytail: scale existing pixels immediately; redraw at rest to avoid blank frames and pinch render churn.
    redrawTimer = setTimeout(() => {
      for (const [sheet, job] of jobs) if (job.visible) { cancel(job); draw(sheet, job, job.version); }
    }, 180);
  };
  return cleanup;

  function release(sheet) {
    for (const child of sheet.children) if (child.tagName === "CANVAS") child.width = child.height = 0;
    sheet.replaceChildren();
  }

  function cancel(job) {
    job.version++;
    job.task?.cancel(); job.task = null;
    job.textLayer?.cancel(); job.textLayer = null;
  }

  function layout() {
    const padding = getComputedStyle(scroller);
    const columns = viewer.dataset.pdfColumns === "2" ? 2 : 1;
    const gap = parseFloat(getComputedStyle(viewer).columnGap) || 0;
    const totalWidth = Math.max(1, scroller.clientWidth - (parseFloat(padding.paddingLeft) || 0) - (parseFloat(padding.paddingRight) || 0)) * Number(viewer.dataset.pdfZoom) / 100;
    scale = Math.max(1, (totalWidth - gap * (columns - 1)) / columns) / base.width;
    viewer.style.width = `${totalWidth}px`;
    viewer.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    for (const [sheet, job] of jobs) {
      sheet.style.height = `${job.base.height * scale}px`;
      for (const child of sheet.children) {
        if (child.className === "textbook__text-layer") child.style.transform = `scale(${scale / Number(child.dataset.pdfScale)})`;
        else { child.style.width = `${job.base.width * scale}px`; child.style.height = `${job.base.height * scale}px`; }
      }
    }
  }

  async function draw(sheet, job, version) {
    let canvas;
    try {
      const page = job.index === 0 ? first : await pdf.getPage(job.index + 1);
      if (!sheet.isConnected || version !== job.version) return;
      job.base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });
      sheet.style.height = `${viewport.height}px`;
      canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.setAttribute("aria-hidden", "true");
      let text, textReady;
      if (TextLayer) {
        text = document.createElement("div");
        text.className = "textbook__text-layer";
        text.dataset.pdfScale = String(viewport.scale);
        text.style.width = `${viewport.width}px`; text.style.height = `${viewport.height}px`;
        text.style.setProperty("--total-scale-factor", String(viewport.scale));
        job.textLayer = new TextLayer({ container: text, viewport, textContentSource: page.streamTextContent() });
        textReady = job.textLayer.render().catch(() => { text = null; });
      }
      job.task = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await job.task.promise;
      await textReady;
      if (!sheet.isConnected || version !== job.version) return;
      release(sheet);
      sheet.replaceChildren(...(text ? [canvas, text] : [canvas]));
    } catch (error) {
      if (!sheet.isConnected || version !== job.version || error.name === "RenderingCancelledException") return;
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = "이 페이지를 표시하지 못했습니다. ‘다시 열기’를 눌러주세요.";
      sheet.replaceChildren(message);
    } finally {
      if (canvas && !canvas.isConnected) canvas.width = canvas.height = 0;
    }
  }
}
