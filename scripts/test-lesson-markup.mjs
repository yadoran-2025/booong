import assert from "node:assert/strict";
import { parseLessonMarkup, stringifyLessonMarkup } from "../js/lesson-markup.js";

const assertJsonEqual = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

const basics = parseLessonMarkup(`
## Chapter
### Section
Paragraph one

Paragraph two

---

[[alpha]]

[[alpha]] ~ [[beta]]

[[alpha==Alpha caption]]

{{Text box body}}

{{broken text box
`);

assert.equal(basics.errors.length, 1);
assert.equal(basics.warnings.length, 0);
assert.equal(stringifyLessonMarkup(basics.blocks.slice(0, 1)), "## Chapter");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(1, 2)), "### Section");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(2, 3)), "Paragraph one\n\nParagraph two");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(3, 4)), "---");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(4, 5)), "[[alpha]]");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(5, 6)), "[[alpha]] ~ [[beta]]");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(6, 7)), "[[alpha==Alpha caption]]");
assert.equal(stringifyLessonMarkup(basics.blocks.slice(7, 8)), "{{Text box body}}");

const basicRoundTrip = parseLessonMarkup(stringifyLessonMarkup(basics.blocks));
assert.deepEqual(basicRoundTrip.blocks, basics.blocks);
assert.equal(basicRoundTrip.errors.length, 0);

const caseBlock = parseLessonMarkup(`
[사례
사례 본문
---
두 번째 문단
[[case-img]]
{{사례 안 텍스트박스}}
[[https://example.com/block-link]]
자료 뒤 본문
<답>
정답 1
정답 2
</답>
<댓>
]
`);
assert.equal(caseBlock.errors.length, 0);
assert.equal(caseBlock.blocks.length, 1);
assert.equal(caseBlock.blocks[0].type, "사례");
assert.equal(caseBlock.blocks[0].body, "사례 본문\n\n두 번째 문단\n\n자료 뒤 본문");
assertJsonEqual(caseBlock.blocks[0].materials, ["case-img", "https://example.com/block-link"]);
assertJsonEqual(
  caseBlock.blocks[0].flow.map(item => item.type),
  ["text", "divider", "text", "materials", "textBox", "materials", "text", "answer", "comment"],
);
assertJsonEqual(caseBlock.blocks[0].answer, ["정답 1", "정답 2"]);

const questionBlock = parseLessonMarkup(`
[발문
질문입니다.
[[question-ref]]
<답>
답입니다.
</답>
]
`);
assert.equal(questionBlock.errors.length, 0);
assert.equal(questionBlock.blocks[0].type, "발문");
assert.equal(questionBlock.blocks[0].prompts.length, 1);
assert.equal(questionBlock.blocks[0].prompts[0].q, "질문입니다.");
assertJsonEqual(questionBlock.blocks[0].prompts[0].materials, ["question-ref"]);
assert.equal(questionBlock.blocks[0].prompts[0].answer, "답입니다.");

const conceptBlock = parseLessonMarkup(`
[개념
개념 설명
[[concept-image]]
]
`);
assert.equal(conceptBlock.errors.length, 0);
assert.equal(conceptBlock.blocks[0].type, "개념");
assert.equal(conceptBlock.blocks[0].body, "개념 설명");
assertJsonEqual(conceptBlock.blocks[0].materials, ["concept-image"]);

const problemBlock = parseLessonMarkup(`
[문제
250611[경제]
<답>
해설입니다.
</답>
]
`);
assert.equal(problemBlock.errors.length, 0);
assert.equal(problemBlock.blocks[0].type, "기출문제");
assertJsonEqual(problemBlock.blocks[0].items, [{ image: "250611[경제]", answer: "해설입니다." }]);

const groupedObjects = parseLessonMarkup(`[[alpha]] ~ {{quote body}}`);
assert.equal(groupedObjects.errors.length, 0);
assert.equal(groupedObjects.blocks[0].type, "그룹");
assert.equal(groupedObjects.blocks[0].layout, "row");
assertJsonEqual(groupedObjects.blocks[0].items, ["alpha", { type: "텍스트박스", body: "quote body" }]);

const malformedNested = parseLessonMarkup(`
[사례
[발문
중첩
]
]
`);
assert.equal(malformedNested.errors.length, 2);

const unclosed = parseLessonMarkup("[사례\n본문");
assert.equal(unclosed.errors.length, 0);
assert.equal(unclosed.warnings.length, 1);

const fullRoundTripSource = [
  stringifyLessonMarkup(caseBlock.blocks),
  stringifyLessonMarkup(questionBlock.blocks),
  stringifyLessonMarkup(conceptBlock.blocks),
  stringifyLessonMarkup(problemBlock.blocks),
].join("\n\n");
const fullRoundTrip = parseLessonMarkup(fullRoundTripSource);
assert.equal(fullRoundTrip.errors.length, 0);
assertJsonEqual(fullRoundTrip.blocks, [
  ...caseBlock.blocks,
  ...questionBlock.blocks,
  ...conceptBlock.blocks,
  ...problemBlock.blocks,
]);
