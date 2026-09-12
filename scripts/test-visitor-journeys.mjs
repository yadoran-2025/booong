import assert from "node:assert/strict";
import { summarizeAnalyticsInsights, summarizeVisitorJourneys, summarizeWeeklyLessonClicks } from "../js/visitor-journeys.js";

const stats = summarizeVisitorJourneys(
  { dashboard: { a: {}, b: {} }, about: { c: {} } },
  {
    lesson: { groupId: "lesson", title: "인구 땅따먹기", totalClicks: 3 },
    legacyLesson: { groupId: "legacyLesson", title: "인구 땅따먹기", totalClicks: 2 },
  },
  { lesson: { a: {}, c: {}, d: {} }, legacyLesson: { a: {}, d: {} } },
);

assert.equal(stats.uniqueVisitors, 4);
assert.equal(stats.dashboardClickVisitors, 1);
assert.equal(stats.conversionRate, 0.5);
assert.deepEqual(stats.resources[0], { title: "인구 땅따먹기", type: "자료", visitors: 3, fromDashboard: 1, clicks: 5 });

const weeklyLessons = summarizeWeeklyLessonClicks(
  { lesson: { groupId: "lesson", title: "인구 땅따먹기" }, legacyLesson: { groupId: "legacyLesson", title: "인구 땅따먹기" } },
  { lesson: { a: { lastClickedAt: 20 }, b: { lastClickedAt: 5 } }, legacyLesson: { a: { firstClickedAt: 20 }, c: { lastClickedAt: 20 } } },
  10,
);
assert.deepEqual(weeklyLessons, [{ title: "인구 땅따먹기", visitors: 2 }]);

const insights = summarizeAnalyticsInsights({
  pages: { about: { title: "소개" } },
  pageVisitors: {
    dashboard: { a: { firstSeenAt: 100 }, b: { firstSeenAt: 200 }, c: { firstSeenAt: 300 } },
    about: { c: {} },
  },
  groupClicks: {
    currentA: { title: "자료 A", type: "game", totalClicks: 4 },
    legacyA: { title: "자료 A", type: "game", totalClicks: 3 },
    currentB: { title: "자료 B", type: "lesson", totalClicks: 2 },
  },
  groupClickVisitors: {
    currentA: {
      a: { count: 2, firstClickedAt: 1000, lastClickedAt: 86401000 },
      b: { count: 1, firstClickedAt: 2000, lastClickedAt: 2000 },
    },
    legacyA: { a: { count: 2, firstClickedAt: 1000, lastClickedAt: 86401000 } },
    currentB: {
      b: { count: 1, firstClickedAt: 3000, lastClickedAt: 3000 },
      c: { count: 1, firstClickedAt: 4000, lastClickedAt: 4000 },
    },
  },
}, [
  { title: "자료 A", kind: "game", subjects: ["사회"], unitKeys: ["사회::경제"], makers: ["kim"] },
  { title: "자료 B", kind: "lesson", subjects: ["정치"], unitKeys: ["정치::민주주의"], makers: ["lee"] },
]);

assert.deepEqual(insights.reach, [{ title: "자료 A", visitors: 2 }, { title: "자료 B", visitors: 2 }]);
assert.deepEqual(insights.exploration, { visitors: 3, single: 2, multiple: 1, average: 4 / 3 });
assert.equal(insights.pairs[0].count, 1);
assert.deepEqual(insights.firstResources, [{ title: "자료 A", visitors: 2 }, { title: "자료 B", visitors: 1 }]);
assert.deepEqual(insights.repeat.resources[0], { title: "자료 A", repeated: 1, crossDay: 1 });
assert.deepEqual(insights.types, [{ label: "게임", visitors: 2 }, { label: "수업", visitors: 2 }]);
console.log("visitor journey tests passed");
