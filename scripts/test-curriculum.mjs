import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { escapeHtml } from "../js/utils.js";
import { loadCurriculum, loadAchievementLevels, renderAchievementLevels, addCurriculumCatalog, getCurriculumChapter, renderCurriculumButton, renderEvaluationButton, renderContentTable, selectCurriculumStandards } from "../js/ui/curriculum.js";
const data = JSON.parse(readFileSync(new URL("../data/curriculum.json", import.meta.url), "utf8"));
const levels = JSON.parse(readFileSync(new URL("../data/achievement-levels.json", import.meta.url), "utf8"));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: true, json: async () => data });
  await loadCurriculum();
  globalThis.fetch = async () => ({ ok: true, json: async () => levels });
  assert.equal(await loadAchievementLevels(), levels);
} finally { globalThis.fetch = originalFetch; }
const fallback = addCurriculumCatalog({ catalog: { units: [], subjects: [], resources: [] } });
assert.equal(fallback.catalog.units.length, 74);
assert.equal(fallback.catalog.subjects.length, 12);
assert.equal(addCurriculumCatalog(fallback).catalog.units.length, 74);
assert.equal(data.units.length, 233);
assert.equal(Object.keys(data.chapters).length, 74);
assert.equal(Object.keys(data.evaluation).length, 12);
assert.equal(new Set(data.units.map(item => item.code)).size, 233);
for (const unit of data.units) {
  const chapter = data.chapters[unit.chapter];
  const domain = data.domains[chapter.domain];
  const middle = chapter.middleUnits[unit.number];
  assert.equal(middle.code, unit.code);
  assert.equal(domain.version, chapter.subject.includes("15개정") ? 2015 : 2022);
  assert.ok(getCurriculumChapter({ subject: chapter.subject, title: chapter.title }, data));
  const { standards } = selectCurriculumStandards(domain, middle);
  assert.equal(standards.length, middle.standards.length);
  assert.ok(standards.every(item => item.text.length > 15 && item.page > 0));
  assert.ok(domain.tableIds.length);
  assert.ok(renderCurriculumButton({ subject: chapter.subject, title: chapter.title }, middle.title).includes("aria-haspopup"));
  if (domain.version === 2022) {
    const html = renderAchievementLevels(domain, standards, levels, null);
    assert.equal((html.match(/이 표 원문 ↗/g) || []).length, standards.length === 1 ? 0 : standards.length);
    for (const standard of standards) {
      const record = levels.standards[standard.code];
      assert.deepEqual(record.rows.map(row => row.level), [...'ABCDE'], standard.code);
      assert.ok(record.rows.every(row => row.text.length > 10));
      assert.equal(record.source, data.evaluation[chapter.subject].url);
      assert.ok(html.includes(standard.code));
      assert.ok(record.standard.startsWith(standard.code));
      assert.match(html, /data-achievement-column="reference" rowspan="5"/);
      assert.match(html, /scope="colgroup" colspan="2">성취기준별 성취수준/);
    }
    assert.ok(!html.includes('영역별 성취수준'), 'Middle units only show their connected standards');
  }
}
assert.equal(Object.keys(levels.standards).length, 196);
assert.equal(Object.keys(levels.domains).length, 62);
for (const chapter of Object.values(data.chapters)) {
  const domain = data.domains[chapter.domain];
  if (domain.version !== 2022) continue;
  const record = levels.domains[chapter.domain];
  assert.deepEqual(record.rows.map(row => `${row.level}:${row.category}`), [...'ABCDE'].flatMap(level => ['지식·이해', '과정·기능', '가치·태도'].map(category => `${level}:${category}`)), chapter.domain);
  assert.equal(record.source, data.evaluation[chapter.subject].url);
  assert.ok(renderAchievementLevels(domain, domain.standards, levels, chapter.domain).includes('rowspan="3"'));
  assert.ok(renderAchievementLevels(domain, domain.standards, levels, chapter.domain).includes('data-achievement-column="reference" rowspan="15"'));
  assert.equal((renderAchievementLevels(domain, domain.standards, levels, chapter.domain).match(/이 표 원문 ↗/g) || []).length, domain.standards.length + 1);
}
for (const record of [...Object.values(levels.standards), ...Object.values(levels.domains)]) {
  assert.equal(record.pages.length, record.printedPages.length);
  assert.ok(record.pages.every(page => Number.isInteger(page) && page > 0));
  const doc = Object.values(data.evaluation).find(item => item.url === record.source);
  const offset = doc.sourcePages[0] === 1 || doc.url.includes('integrated') ? 4 : 6;
  assert.deepEqual(record.printedPages, record.pages.map(page => page + doc.sourcePages[0] - 1 - offset));
}
assert.equal(levels.standards['[9사(일사)09-03]'].rows[0].text, '수요와 공급을 변화시키는 요인을 사례를 통해 분석하고, 시장 가격의 변동에 대한 대응 방안을 계획하면서 경제 문제 해결에 적극적으로 참여하려는 태도를 지닌다.');
assert.deepEqual(levels.standards['[9사(일사)09-03]'].printedPages, [42]);
assert.ok(levels.domains['middle:1'].rows.find(row => row.level === 'D' && row.category === '과정·기능').text.includes('대처하는 시민의 자질에 대해 탐색할 수 있다.'), 'Domain cell continues across PDF pages');
assert.match(levels.standards['[10통사1-04-02]'].rows[2].text, /^문화 변동의 사례들을 조사하여/, 'Text crossing a PDF cell border is not duplicated into the next level');
assert.equal(levels.domains['통합사회1:5'].title, '생활공간의 변화');
for (const domain of Object.values(data.domains)) {
  for (const field of ["standards", "commentary", "considerations", "teaching", "assessment"]) {
    assert.ok(domain[field].every(item => !/(?<!\d)\d{1,3}\s+사회(?=\s|$)/.test(item.text)), "PDF page headings stay out of curriculum paragraphs");
  }
}
const market = data.chapters['사회2:III'];
const sample = JSON.parse(readFileSync(new URL('../mockups/market-price-curriculum.json', import.meta.url), 'utf8'));
const normalized = text => text.replace(/\s/g, '');
const marketDomain = data.domains[market.domain];
const selected = selectCurriculumStandards(marketDomain, market.middleUnits[3]);
assert.equal(selected.standards[0].code, sample.standard.code);
assert.equal(normalized(selected.standards[0].text), normalized(sample.standard.text));
assert.equal(normalized(selected.commentary[0].text), normalized(sample.standard.commentary));
assert.equal(marketDomain.considerations.length, 5);
assert.equal(selectCurriculumStandards(marketDomain).standards.length, 3);
assert.deepEqual(data.chapters['경제:II'].middleUnits[2].standards, ['[12경제02-03]']);
assert.deepEqual(data.chapters['경제:II'].middleUnits[3].standards, ['[12경제02-02]']);
for (const [id, table] of Object.entries(data.tables)) {
  const occupied = new Set();
  table.rows.forEach((row, r) => row.forEach(cell => {
    assert.ok(cell.rowspan > 0 && cell.colspan > 0, id);
    assert.ok(cell.column + cell.colspan <= table.columns, id);
    for (let rr = r; rr < r + cell.rowspan; rr++) for (let cc = cell.column; cc < cell.column + cell.colspan; cc++) {
      assert.ok(!occupied.has(`${rr}:${cc}`), `${id} overlapping cell`);
      occupied.add(`${rr}:${cc}`);
    }
  }));
  for (let r = 0; r < table.rows.length; r++) for (let c = 0; c < table.columns; c++) assert.ok(occupied.has(`${r}:${c}`), `${id} missing cell ${r}:${c}`);
  assert.ok(renderContentTable(table).includes('rowspan='));
  assert.ok(table.widths.every(width => Number.isFinite(width) && width > 0));
  assert.ok(table.rows.flatMap(row => row.flatMap(cell => cell.items)).every(text => !/^\d+$/.test(text)), `${id} has a PDF page footer`);
}
for (const [id, expected] of [["2022:114:0", 10], ["2022:215:0", 8], ["2022:293:0", 7]]) {
  const skill = data.tables[id].rows.find(row => row.some(cell => cell.items.join("").replace(/\s/g, "") === "과정⋅기능"));
  assert.equal(skill.at(-1).items.length, expected, `${id} keeps process skills across page breaks`);
}
for (const [subject, doc] of Object.entries(data.evaluation)) {
  assert.ok(existsSync(new URL(`../assets/curriculum/${doc.url}`, import.meta.url)), subject);
  assert.match(doc.sourceUrl, /^https:\/\/ncic\.re\.kr\/bbs\/standard\/view\//);
  assert.equal(doc.version, subject.includes('15개정') ? 2015 : 2022);
  assert.ok(renderEvaluationButton(subject));
}
assert.equal(renderEvaluationButton('기타'), '');
assert.equal(renderCurriculumButton({ subject: '기타', title: '-' }), '');
assert.equal(renderCurriculumButton({ subject: '사회2', title: '-' }), '');
const viewContext = vm.createContext({ curriculum: data, escapeHtml, getCurriculumChapter, selectCurriculumStandards, renderContentTable, renderAchievementLevels, assetUrl: file => `/assets/curriculum/${file}` });
const curriculumSource = readFileSync(new URL('../js/ui/curriculum.js', import.meta.url), 'utf8');
vm.runInContext(curriculumSource.slice(curriculumSource.indexOf('function paragraphList('), curriculumSource.indexOf('\nexport function achievementClipboard(')), viewContext);
vm.runInContext(curriculumSource.slice(curriculumSource.indexOf('function curriculumView('), curriculumSource.indexOf('\nfunction evaluationView(')), viewContext);
vm.runInContext(curriculumSource.slice(curriculumSource.indexOf('function evaluationView('), curriculumSource.indexOf('\nexport function bindCurriculum(')), viewContext);
for (const subject of Object.keys(data.evaluation)) {
  const doc = data.evaluation[subject];
  const evaluation = viewContext.evaluationView(subject);
  assert.ok(evaluation.includes(escapeHtml(doc.title)));
  assert.ok(evaluation.includes(escapeHtml(doc.publisher)));
  assert.ok(evaluation.includes(`${doc.date} 배포`));
  assert.ok(evaluation.includes(escapeHtml(doc.scope)));
  assert.ok(evaluation.includes(doc.scope.includes('발췌') ? `공식 합본 ${doc.sourcePages[0]}∼${doc.sourcePages[1]}쪽` : '원문입니다.'));
  assert.equal((evaluation.match(/<p[ >]/g) || []).length, 1, 'Document context stays in a single paragraph');
  assert.doesNotMatch(evaluation, /<br>/, 'Publisher and release date do not add visible rows');
  assert.match(evaluation, /class="btn btn--primary"[^>]*target="_blank" rel="noopener"/);
  assert.ok(evaluation.includes(`href="/assets/curriculum/${doc.url}"`));
  assert.ok(evaluation.includes(`href="${escapeHtml(doc.sourceUrl)}"`));
  assert.match(renderCurriculumButton({ subject }), /data-curriculum-chapter=""/);
  const chapters = Object.values(data.chapters).filter(chapter => chapter.subject === subject);
  const domains = chapters.map(chapter => data.domains[chapter.domain]);
  const view = viewContext.curriculumView({ dataset: { curriculumSubject: subject, curriculumChapter: '', curriculumMiddle: '' } }, levels);
  assert.equal(view.subtitle, '전체 단원');
  assert.equal(view.tabs.length, subject.includes('15개정') ? 3 : 4);
  assert.equal((view.tabs[0].body.match(/class="standard-item"/g) || []).length, domains.reduce((count, domain) => count + domain.standards.length, 0));
  assert.equal((view.tabs[2].body.match(/<table /g) || []).length, new Set(domains.flatMap(domain => domain.tableIds)).size, 'Shared content tables appear once');
  for (const chapter of chapters) assert.ok(view.tabs[0].body.includes(escapeHtml(chapter.title)));
  for (const tab of view.tabs) assert.ok((tab.printedPages || tab.pages).every(page => Number.isFinite(page) && page > 0));
  if (view.tabs[3]) assert.equal((view.tabs[3].body.match(/class="achievement-block"/g) || []).length, domains.reduce((count, domain) => count + domain.standards.length + 1, 0));
}
console.log('Curriculum: 233 middle units, 74 chapters, original merged tables, 196 achievement-level mappings, 62 domain-level tables and 12 evaluation attachments passed.');
