import assert from 'node:assert/strict';
import { pickJourneyLessons, projectJourneyStop } from '../mockups/lesson-journey.js';

const items = [
  { id: 'a', subject: '사회2', unit: '시장', hasScreenshot: false },
  { id: 'b', subject: '사회2', unit: '시장', hasScreenshot: true },
  { id: 'c', subject: '사회2', unit: '경제', hasScreenshot: false },
  { id: 'd', subject: '사회2', unit: '인구', hasScreenshot: true },
  { id: 'e', subject: '사회2', unit: '세계', hasScreenshot: false },
];
assert.deepEqual(pickJourneyLessons([]), []);
assert.deepEqual(pickJourneyLessons(items.slice(0, 1)).map(i => i.id), ['a']);
assert.deepEqual(pickJourneyLessons(items.slice(0, 3)).map(i => i.id), ['b', 'c']);
assert.deepEqual(pickJourneyLessons(items).map(i => i.id), ['b', 'd', 'e']);
assert.equal(items[0].id, 'a');
for (const [width, height] of [[1232, 707], [769, 707], [356, 331.5], [286, 300]]) {
  for (const progress of [.12, .48, .86]) {
    const point = projectJourneyStop(progress, width, height);
    assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height, 'stations stay on the visible painted road');
  }
}
assert.deepEqual(projectJourneyStop(-1, 1232, 707), projectJourneyStop(0, 1232, 707));
assert.deepEqual(projectJourneyStop(2, 1232, 707), projectJourneyStop(1, 1232, 707));
console.log('Lesson journey: representative units, screenshot preference, and road projection passed.');
