import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Run against npm run serve, using an already-installed Playwright runtime.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("booong-comment-notice", "never");
    localStorage.setItem("booong-teacher-profile-v1", JSON.stringify({ school: "중학교", subject: "사회2" }));
  });
  await page.goto("http://127.0.0.1:8765/index.html#lesson-library");
  const emptyChapter = page.locator('[data-unit="사회2::I. 헌법과 국가기관"]');
  await emptyChapter.waitFor();
  assert.match(await emptyChapter.innerText(), /I\. 헌법과 국가기관\s+수업 0개/, 'Chapter buttons include their lesson count');
  assert.equal(await page.locator('.curation-library-hint').count(), 0, 'The redundant curriculum hint is removed');
  await emptyChapter.click();
  const references = page.locator('.curation-library-references');
  assert.equal(await references.locator('[data-curriculum-subject]').count(), 1);
  assert.equal(await references.locator('[data-evaluation-subject]').count(), 1);
  for (const width of [390, 614, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await references.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const heading = document.querySelector('.curation-library-head h1').getBoundingClientRect();
      const buttons = [...element.querySelectorAll('button:not([hidden])')].map(button => {
        const bounds = button.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, radius: getComputedStyle(button).borderRadius };
      });
      return { top: rect.top, headingBottom: heading.bottom, viewport: innerWidth, buttons };
    });
    assert.ok(layout.top >= layout.headingBottom, 'Reference chips sit below the heading');
    assert.ok(layout.buttons.every(button => button.left >= 0 && button.right <= layout.viewport), 'Reference chips stay inside the viewport');
    assert.ok(layout.buttons.every(button => parseFloat(button.radius) > 20), 'Reference actions use pill corners');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('[data-library-empty]').isVisible(), true, 'An empty chapter shows its empty notice');
  assert.equal(await page.locator('[data-library-grid]').isVisible(), false);
  await page.locator('[data-middle-select]').selectOption({ index: 1 });
  await references.locator('[data-curriculum-subject]').click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '닫기', exact: false }).click();
  await page.locator('.unit-tab[data-unit=""]').click();
  assert.equal(await page.locator('[data-library-empty]').isVisible(), false);
  await page.locator('[data-unit="사회2::III. 시장과 가격"]').click();
  await references.locator('[data-curriculum-subject="사회2"][data-curriculum-chapter="III. 시장과 가격"][data-curriculum-middle=""]').click();
  await page.getByRole("tab", { name: "성취수준", exact: true }).click();
  const blocks = page.locator('#curriculum-panel-3 .achievement-block');
  assert.equal(await blocks.count(), 4);
  for (const index of [0, 3]) {
    const block = blocks.nth(index);
    await block.locator("[data-copy-achievement]").click();
    await block.getByRole("status").filter({ hasText: "복사했어요" }).waitFor();
    const copied = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const html = await (await item.getType("text/html")).text();
      const plain = await (await item.getType("text/plain")).text();
      const documentCopy = new DOMParser().parseFromString(html, "text/html");
      const table = documentCopy.querySelector("table");
      return { html, plain, rows: table.rows.length, spans: [...table.querySelectorAll('[rowspan="3"]')].length, referenceSpan: table.tBodies[0].rows[0].cells[0].rowSpan, headerSpan: table.tHead.rows[0].cells[1].colSpan, width: table.getAttribute("width") };
    });
    assert.equal(copied.rows, index ? 16 : 6);
    assert.equal(copied.spans, index ? 5 : 0);
    assert.equal(copied.referenceSpan, index ? 15 : 5);
    assert.equal(copied.headerSpan, index ? 3 : 2);
    assert.equal(copied.width, "600");
    assert.ok(!copied.html.includes("한글 표 복사"));
    const lines = copied.plain.split("\n");
    assert.equal(lines.length, index ? 16 : 6);
    assert.ok(lines.every(line => line.split("\t").length === (index ? 4 : 3)));
    assert.ok(lines.slice(1).every(line => line.split("\t")[0] === lines[1].split("\t")[0]), "Merged reference text is retained in every plain-text row");
    assert.deepEqual(lines.slice(1).map(line => line.split("\t")[1]), [..."ABCDE"].flatMap(level => index ? [level, level, level] : [level]));
    assert.match(copied.html, /시장/);
  }
  // Embedded-browser fallback must still copy HTML with merged cells.
  await page.evaluate(() => { navigator.clipboard.write = async () => { throw new Error("Blocked in this test"); }; });
  const domain = blocks.nth(3);
  await domain.locator("[data-copy-achievement]").click();
  await domain.getByRole("status").filter({ hasText: "복사했어요" }).waitFor();
  assert.ok(await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await (await item.getType("text/html")).text()).includes('rowspan="3"');
  }));
  // A rejected fallback reports failure and restores focus without temporary nodes.
  await page.evaluate(() => { document.execCommand = () => false; });
  await domain.locator("[data-copy-achievement]").click();
  await domain.getByRole("status").filter({ hasText: "복사하지 못했습니다" }).waitFor();
  assert.equal(await domain.locator("[data-copy-achievement]").isEnabled(), true);
  assert.equal(await page.locator('.standards-dialog [contenteditable="true"]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.hasAttribute("data-copy-achievement")), true);
  for (const width of [1440, 613, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await blocks.first().evaluate(block => block.scrollWidth > block.clientWidth), false, "Mobile overflow stays inside the table scroll area");
  }
  await page.setViewportSize({ width: 1100, height: 844 });
  await blocks.first().screenshot({ path: "/tmp/booong-original-achievement-table.png" });
  console.log("Achievement copy: HTML/plain text, table widths, merged levels, embedded-browser fallback and failure recovery passed.");
} finally { await browser.close(); }
