import { escapeHtml } from "../utils.js";

let curriculum;
let request;
let levelsRequest;
const subjects = ["사회1", "사회2", "사회2[15개정]", "통합사회1", "통합사회2", "사회와문화", "정치", "법과사회", "경제", "국제관계의이해", "사회문제탐구", "금융과경제생활"];
const assetUrl = file => new URL(`../../assets/curriculum/${file}`, import.meta.url).href;

export async function loadCurriculum() {
  if (!request) request = fetch(new URL("../../data/curriculum.json", import.meta.url)).then(response => {
    if (!response.ok) throw new Error("교육과정 자료를 불러오지 못했습니다.");
    return response.json();
  }).then(data => {
    if (!data.chapters || !data.domains || !data.tables || !data.evaluation) throw new Error("교육과정 자료 형식을 확인해 주세요.");
    curriculum = data;
    return data;
  }).catch(error => { request = null; throw error; });
  return request;
}

export async function loadAchievementLevels() {
  if (!levelsRequest) levelsRequest = fetch(new URL("../../data/achievement-levels.json", import.meta.url)).then(response => {
    if (!response.ok) throw new Error("성취수준 자료를 불러오지 못했습니다.");
    return response.json();
  }).then(data => {
    if (!data.standards || !data.domains) throw new Error("성취수준 자료 형식을 확인해 주세요.");
    return data;
  }).catch(error => { levelsRequest = null; throw error; });
  return levelsRequest;
}

export function getCurriculumChapter(unit, data = curriculum) {
  const chapter = unit?.title?.match(/^([IVXLCDM]+)\./)?.[1];
  return data?.chapters[`${unit?.subject}:${chapter}`] || null;
}

export function getCurriculumMiddleUnits(unit) {
  return Object.values(getCurriculumChapter(unit)?.middleUnits || {}).map(item => item.title);
}

export function renderCurriculumButton(unit, middle = "") {
  if (!subjects.includes(unit?.subject) || (unit.title && !unit.title.match(/^[IVXLCDM]+\./))) return "";
  return `<button type="button" class="btn btn--ghost curriculum-action" data-curriculum-subject="${escapeHtml(unit.subject)}" data-curriculum-chapter="${escapeHtml(unit.title || "")}" data-curriculum-middle="${escapeHtml(middle)}" aria-haspopup="dialog" aria-label="${escapeHtml(middle || unit.title || `${unit.subject} 전체 단원`)} 교육과정">교육과정 <span aria-hidden="true">↗</span></button>`;
}

export function renderEvaluationButton(subject) {
  return subjects.includes(subject) ? `<button type="button" class="btn btn--ghost curriculum-action" data-evaluation-subject="${escapeHtml(subject)}" aria-haspopup="dialog">평가 문서 <span aria-hidden="true">↗</span></button>` : "";
}

export function addCurriculumCatalog(config) {
  if (!curriculum || !config.catalog) return config;
  const units = [...config.catalog.units];
  const subjectOptions = [...config.catalog.subjects];
  for (const chapter of Object.values(curriculum.chapters)) {
    const school = chapter.subject.startsWith("사회1") || chapter.subject.startsWith("사회2") ? "중학교" : "고등학교";
    if (!subjectOptions.some(item => item.value === chapter.subject)) subjectOptions.push({ school, value: chapter.subject, label: chapter.subject, order: subjectOptions.length });
    if (units.some(unit => getCurriculumChapter(unit) === chapter)) continue;
    units.push({ key: `${chapter.subject}::${chapter.title}`, school, subject: chapter.subject, title: chapter.title, order: units.length, codes: Object.values(chapter.middleUnits).map(item => item.code), middleUnits: Object.values(chapter.middleUnits).map(item => item.title) });
  }
  return { ...config, catalog: { ...config.catalog, units, subjects: subjectOptions } };
}

export function renderContentTable(table) {
  const content = cell => cell.items.length > 1 ? `<ul>${cell.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : escapeHtml(cell.items[0] || "–");
  return `<table class="curriculum-table${table.columns > 3 ? " curriculum-table--wide" : ""}"><caption class="sr-only">교육과정 내용 체계 원문 표</caption>${table.widths ? `<colgroup>${table.widths.map(width => `<col style="width:${width}%">`).join("")}</colgroup>` : ""}<tbody>${table.rows.map(row => `<tr>${row.map(cell => {
    const tag = cell.header ? "th" : "td";
    return `<${tag} rowspan="${cell.rowspan}" colspan="${cell.colspan}"${cell.header ? ` scope="${cell.column < 2 ? "row" : "col"}"` : ""}>${content(cell)}</${tag}>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
}

const referenceText = text => text.replace(/\s/g, "").replace(/\(일사\]/g, "(일사)").replace(/-0(\d)\]/g, "-$1]");
export function selectCurriculumStandards(domain, middle) {
  const standards = middle ? domain.standards.filter(item => middle.standards.includes(item.code)) : domain.standards;
  const commentary = middle ? domain.commentary.filter(item => standards.some(standard => referenceText(item.text).includes(referenceText(standard.code)))) : domain.commentary;
  return { standards, commentary };
}

function paragraphList(items, className = "considerations") {
  return `<ul class="${className}">${items.map(item => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>`;
}

export function achievementClipboard(table) {
  const copy = table.cloneNode(true);
  copy.removeAttribute("class");
  copy.setAttribute("border", "1");
  copy.setAttribute("cellpadding", "6");
  copy.setAttribute("cellspacing", "0");
  copy.setAttribute("width", "600");
  copy.style.cssText = "border-collapse:collapse;width:450pt;table-layout:fixed;font-size:10pt;line-height:1.5;";
  copy.querySelectorAll("[class]").forEach(cell => cell.removeAttribute("class"));
  const widths = [...copy.querySelectorAll("col")].map(column => 6 * Number.parseFloat(column.getAttribute("width")));
  copy.querySelectorAll("col").forEach((column, index) => {
    column.setAttribute("width", String(widths[index]));
    column.style.width = `${widths[index] * 0.75}pt`;
  });
  const pending = [];
  const plain = [...copy.rows].map(row => {
    const values = [];
    let column = 0;
    const carry = () => {
      while (pending[column]?.remaining) {
        values[column] = pending[column].text;
        pending[column].remaining -= 1;
        column += 1;
      }
    };
    for (const cell of row.cells) {
      carry();
      const value = cell.textContent.trim();
      const width = widths.slice(column, column + cell.colSpan).reduce((sum, item) => sum + item, 0);
      cell.setAttribute("width", String(width));
      const reference = cell.dataset.achievementColumn === "reference";
      const shaded = cell.tagName === "TH";
      cell.style.cssText = `border:1px solid #000;padding:6pt;vertical-align:${reference || shaded ? "middle" : "top"};width:${width * 0.75}pt;${shaded ? "background:#EBF2FF;" : ""}${reference ? "text-align:left;" : ""}`;
      for (let span = 0; span < cell.colSpan; span++) {
        values[column + span] = span ? "" : value;
        if (cell.rowSpan > 1) pending[column + span] = { text: span ? "" : value, remaining: cell.rowSpan - 1 };
      }
      column += cell.colSpan;
    }
    carry();
    return values.join("\t");
  }).join("\n");
  copy.querySelectorAll("[data-achievement-column]").forEach(cell => cell.removeAttribute("data-achievement-column"));
  return { html: `<html><head><meta charset="utf-8"></head><body><!--StartFragment-->${copy.outerHTML}<!--EndFragment--></body></html>`, plain };
}

async function copyAchievementTable(table, host) {
  const { html, plain } = achievementClipboard(table);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })]);
      return;
    } catch (_) { /* Embedded browsers may require the synchronous copy command. */ }
  }
  const selection = window.getSelection();
  const ranges = [...Array(selection.rangeCount)].map((_, index) => selection.getRangeAt(index).cloneRange());
  const target = document.createElement("div");
  target.contentEditable = "true";
  target.style.cssText = "position:fixed;left:-10000px;top:0;";
  target.innerHTML = html;
  host.appendChild(target);
  const range = document.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges(); selection.addRange(range);
  target.focus();
  let copied = false;
  const onCopy = event => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", plain);
    copied = true;
  };
  document.addEventListener("copy", onCopy);
  try {
    if (!document.execCommand("copy") || !copied) throw new Error("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
  } finally {
    document.removeEventListener("copy", onCopy);
    target.remove();
    selection.removeAllRanges(); ranges.forEach(saved => selection.addRange(saved));
  }
}

export function renderAchievementLevels(domain, standards, levels, includeDomain) {
  const locator = record => standards.length === 1 && !includeDomain ? "" : `<p class="source-locator">인쇄 ${record.printedPages.join(", ")}쪽 · <a href="${assetUrl(record.source)}#page=${record.pages[0]}" target="_blank" rel="noopener">이 표 원문 ↗</a></p>`;
  const table = (record, caption, reference) => {
    const categories = Boolean(record.rows[0].category);
    const widths = categories ? [15, 6, 12, 67] : [26.5, 7, 66.5];
    return `<div class="achievement-block"><div class="achievement-actions"><button type="button" class="btn btn--secondary curriculum-action" data-copy-achievement aria-label="${escapeHtml(caption)} 한글 표 복사">한글 표 복사</button><span class="source-locator" role="status" hidden></span></div><div class="table-scroll" role="region" tabindex="0" aria-label="${escapeHtml(caption)}"><table class="curriculum-table achievement-table"><caption class="sr-only">${escapeHtml(caption)}</caption><colgroup>${widths.map(width => `<col width="${width}%" style="width:${width}%">`).join("")}</colgroup><thead><tr><th scope="col" data-achievement-column="reference">${categories ? "영역" : "성취기준"}</th><th scope="colgroup" colspan="${categories ? 3 : 2}">${categories ? "영역별" : "성취기준별"} 성취수준</th></tr></thead><tbody>${record.rows.map((row, index) => `<tr>${index === 0 ? `<td data-achievement-column="reference" rowspan="${record.rows.length}">${escapeHtml(reference)}${record.note ? `<p class="achievement-note">※ ${escapeHtml(record.note)}</p>` : ""}</td>` : ""}${index === 0 || row.level !== record.rows[index - 1].level ? `<th scope="rowgroup" data-achievement-column="level" rowspan="${record.rows.filter(item => item.level === row.level).length}">${escapeHtml(row.level)}</th>` : ""}${row.category ? `<th scope="row" data-achievement-column="category">${escapeHtml(row.category)}</th>` : ""}<td>${escapeHtml(row.text)}</td></tr>`).join("")}</tbody></table></div>${locator(record)}</div>`;
  };
  return `<h3>성취기준별 성취수준</h3>${standards.map(standard => {
    const record = levels.standards[standard.code];
    if (!record) throw new Error(`${standard.code}의 성취수준 연결을 확인해 주세요.`);
    return `<article class="achievement-standard">${table(record, `${standard.code} 성취기준별 성취수준`, record.standard || `${standard.code} ${standard.text}`)}</article>`;
  }).join("")}${includeDomain ? `<h3>${escapeHtml(domain.title)} · 영역별 성취수준</h3>${levels.domains[includeDomain].title !== domain.title ? `<p class="standards-intro">평가 문서 영역명: ${escapeHtml(levels.domains[includeDomain].title)}</p>` : ""}${table(levels.domains[includeDomain], `${levels.domains[includeDomain].title} 영역별 성취수준`, levels.domains[includeDomain].title)}` : ""}`;
}

function curriculumView(button, levels) {
  if (!button.dataset.curriculumChapter) {
    const subject = button.dataset.curriculumSubject;
    const views = Object.values(curriculum.chapters).filter(chapter => chapter.subject === subject)
      .map(chapter => curriculumView({ dataset: { curriculumSubject: subject, curriculumChapter: chapter.title, curriculumMiddle: "" } }, levels));
    if (!views.length) throw new Error("이 과목의 교육과정 연결을 찾지 못했습니다.");
    return { ...views[0], title: `${subject} 교육과정`, subtitle: "전체 단원", tabs: views[0].tabs.map((tab, index) => {
      const entries = views.map(view => ({ title: view.title, tab: view.tabs[index] }));
      const unique = entries.filter((entry, position) => entries.findIndex(item => item.tab.body === entry.tab.body) === position);
      return { ...tab, pages: entries.flatMap(entry => entry.tab.pages || []),
        ...(tab.printedPages ? { printedPages: entries.flatMap(entry => entry.tab.printedPages) } : {}),
        body: unique.map(entry => `${index === 0 || tab.label === "성취수준" ? `<h3>${escapeHtml(entry.title)}</h3>` : ""}${entry.tab.body}`).join("") };
    }) };
  }
  const chapter = getCurriculumChapter({ subject: button.dataset.curriculumSubject, title: button.dataset.curriculumChapter });
  if (!chapter) throw new Error("이 단원의 교육과정 연결을 찾지 못했습니다.");
  const domain = curriculum.domains[chapter.domain];
  const middleNumber = button.dataset.curriculumMiddle.match(/^(\d+)/)?.[1];
  const middle = middleNumber ? chapter.middleUnits[String(Number(middleNumber))] : null;
  if (middleNumber && !middle) throw new Error("이 중단원의 교육과정 연결을 찾지 못했습니다.");
  const { standards, commentary } = selectCurriculumStandards(domain, middle);
  const source = curriculum.sources[domain.version];
  const printed = page => page - source.printedPageOffset;
  const tables = domain.tableIds.map(id => curriculum.tables[id]);
  const old = domain.version === 2015;
  const applied = old ? [...domain.teaching, ...domain.assessment] : domain.considerations;
  const standardPages = [...standards, ...commentary].map(item => item.page);
  const tabs = [
    { label: "성취기준·해설", page: standards[0].page, pages: standardPages, body: `<h3>성취기준</h3><div class="standards-items">${standards.map(item => `<article class="standard-item"><h4>${escapeHtml(item.code)}</h4><p>${escapeHtml(item.text)}</p></article>`).join("")}</div><h3>성취기준 해설</h3>${commentary.length ? paragraphList(commentary) : '<p class="standards-intro">이 성취기준에 별도로 제시된 해설은 없습니다.</p>'}` },
    { label: old ? "교수·학습·평가" : "적용 시 고려 사항", page: applied[0]?.page || domain.page, pages: applied.map(item => item.page), body: `<h3>${escapeHtml(domain.title)} · 대단원 공통</h3>${old ? `<h4>교수·학습 방법 및 유의 사항</h4>${paragraphList(domain.teaching)}<h4>평가 방법 및 유의 사항</h4>${paragraphList(domain.assessment)}` : paragraphList(applied)}` },
    { label: "내용 체계표", page: tables[0].page, pages: tables.flatMap(table => table.pages || [table.page]), body: `<h3>${escapeHtml(domain.tableScope)}</h3><p class="standards-intro">${old ? "2015 개정 원문의 열과 병합 셀을 유지했습니다." : "핵심 아이디어·지식⋅이해·과정⋅기능·가치⋅태도를 원문의 열과 병합 셀로 보여줍니다."}</p>${tables.map(table => `<div class="table-scroll" role="region" tabindex="0" aria-label="내용 체계표, 좌우로 스크롤">${renderContentTable(table)}</div>`).join("")}<p class="source-locator">${escapeHtml(domain.tableScope)}에 해당하는 공통 표입니다.</p>` },
  ];
  if (!old) {
    const records = standards.map(standard => levels.standards[standard.code]);
    if (!middle) records.push(levels.domains[chapter.domain]);
    const doc = curriculum.evaluation[chapter.subject];
    tabs.push({ label: "성취수준", page: records[0].pages[0], printedPages: records.flatMap(record => record.printedPages), source: { title: `${chapter.subject} · 2022 개정 교육과정 성취수준`, url: doc.url }, body: renderAchievementLevels(domain, standards, levels, middle ? null : chapter.domain) });
  }
  return { title: chapter.title, subtitle: middle?.title || "대단원 전체", version: `${chapter.subject} · ${domain.version} 개정 교육과정`, tabs, source, printed };
}

function evaluationView(subject) {
  const doc = curriculum.evaluation[subject];
  if (!doc) throw new Error("이 과목의 평가 문서를 찾지 못했습니다.");
  return `<article class="evaluation-document"><h3>${doc.version === 2015 ? "평가기준" : "성취수준"}과 예시 평가도구</h3><p class="evaluation-document__description">${escapeHtml(doc.scope)}${doc.scope.includes("발췌") ? `본으로, 공식 합본 ${doc.sourcePages[0]}∼${doc.sourcePages[1]}쪽을 담았습니다.` : `${doc.scope.endsWith("보고서") ? "" : " 자료"}의 원문입니다.`}</p><div class="curriculum-document-links"><a class="btn btn--primary" href="${assetUrl(doc.url)}" title="${escapeHtml(doc.title)}" target="_blank" rel="noopener">문서 열기 <span aria-hidden="true">↗</span></a><a class="btn btn--ghost curriculum-action" href="${escapeHtml(doc.sourceUrl)}" title="${escapeHtml(doc.publisher)} · ${escapeHtml(doc.date)} 배포" target="_blank" rel="noopener">공식 출처 <span aria-hidden="true">↗</span></a></div></article>`;
}

export function bindCurriculum(root) {
  root.querySelectorAll("[data-curriculum-subject], [data-evaluation-subject]").forEach(button => button.addEventListener("click", async () => {
    const dialog = document.createElement("dialog");
    dialog.className = button.dataset.evaluationSubject ? "standards-dialog evaluation-dialog" : "standards-dialog";
    dialog.setAttribute("aria-labelledby", "curriculum-dialog-title");
    dialog.setAttribute("aria-describedby", "curriculum-dialog-context curriculum-dialog-subtitle");
    dialog.innerHTML = `<div class="standards-frame"><header class="standards-head"><div><small id="curriculum-dialog-context" data-version>${escapeHtml(button.dataset.curriculumSubject || button.dataset.evaluationSubject || "")}</small><h2 id="curriculum-dialog-title">${escapeHtml(button.dataset.evaluationSubject ? "평가 문서" : button.dataset.curriculumChapter || `${button.dataset.curriculumSubject} 교육과정`)}</h2><p id="curriculum-dialog-subtitle" data-subtitle${button.dataset.curriculumMiddle ? "" : " hidden"}>${escapeHtml(button.dataset.curriculumMiddle || "")}</p></div><form method="dialog"><button class="btn btn--ghost curriculum-action" autofocus aria-label="닫기">${button.dataset.evaluationSubject ? '<span aria-hidden="true">×</span>' : '닫기 <span aria-hidden="true">×</span>'}</button></form></header><div data-tabs class="standards-tabs" role="tablist" aria-label="교육과정 내용"></div><div class="standards-body" aria-live="polite">자료를 불러오는 중입니다.</div><footer class="standards-foot" hidden></footer></div>`;
    root.appendChild(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); if (button.isConnected) button.focus(); }, { once: true });
    dialog.showModal();
    try {
      await loadCurriculum();
      if (!dialog.isConnected) return;
      const body = dialog.querySelector(".standards-body");
      if (button.dataset.evaluationSubject) {
        dialog.querySelector("[data-tabs]").remove();
        body.innerHTML = evaluationView(button.dataset.evaluationSubject);
        dialog.querySelector("[data-version]").textContent = `${button.dataset.evaluationSubject.replace("[15개정]", "")} · ${curriculum.evaluation[button.dataset.evaluationSubject].version} 개정`;
        return;
      }
      const levels = button.dataset.curriculumSubject.includes("15개정") ? null : await loadAchievementLevels();
      if (!dialog.isConnected) return;
      const view = curriculumView(button, levels);
      dialog.querySelector("#curriculum-dialog-title").textContent = view.title;
      dialog.querySelector("[data-version]").textContent = view.version;
      dialog.querySelector("[data-subtitle]").textContent = view.subtitle;
      dialog.querySelector("[data-subtitle]").hidden = false;
      const tabRoot = dialog.querySelector("[data-tabs]");
      tabRoot.innerHTML = view.tabs.map((tab, index) => `<button type="button" role="tab" id="curriculum-tab-${index}" aria-controls="curriculum-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${tab.label}</button>`).join("");
      body.innerHTML = view.tabs.map((tab, index) => `<section role="tabpanel" id="curriculum-panel-${index}" aria-labelledby="curriculum-tab-${index}" tabindex="0"${index ? " hidden" : ""}>${tab.body}</section>`).join("");
      body.querySelectorAll("[data-copy-achievement]").forEach(copyButton => copyButton.addEventListener("click", async () => {
        copyButton.disabled = true;
        const status = copyButton.parentElement.querySelector("[role='status']");
        status.hidden = false;
        status.textContent = "";
        try {
          await copyAchievementTable(copyButton.closest(".achievement-block").querySelector("table"), dialog);
          status.textContent = "복사했어요. 한글에서 붙여넣기(Ctrl+V / ⌘V) 하세요.";
        } catch (error) { status.textContent = error.message; }
        finally { copyButton.disabled = false; copyButton.focus(); }
      }));
      const tabs = [...tabRoot.querySelectorAll("button")];
      const footer = dialog.querySelector(".standards-foot");
      footer.hidden = false;
      function select(index) {
        tabs.forEach((tab, position) => { tab.setAttribute("aria-selected", String(position === index)); tab.tabIndex = position === index ? 0 : -1; body.children[position].hidden = position !== index; });
        const current = view.tabs[index];
        const pages = [...new Set(current.printedPages || current.pages.map(view.printed))].sort((a, b) => a - b);
        const source = current.source || view.source;
        footer.innerHTML = `<p>${escapeHtml(source.title)}<br>인쇄 ${pages.join(", ")}쪽</p><a class="btn btn--ghost curriculum-action" href="${assetUrl(source.url)}#page=${current.page}" target="_blank" rel="noopener">원문 보기 ↗</a>`;
        body.scrollTop = 0;
      }
      tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => select(index));
        tab.addEventListener("keydown", event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          select(next); tabs[next].focus();
        });
      });
      select(0);
    } catch (error) {
      console.warn("Curriculum load failed:", error);
      dialog.querySelector(".standards-body").textContent = `${error.message} 닫은 뒤 다시 시도해 주세요.`;
    }
  }));
}
