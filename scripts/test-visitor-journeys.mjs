import assert from "node:assert/strict";
import { summarizeAnalyticsInsights, summarizeDecisionAnalytics, summarizeResourceViewTrends, summarizeVisitorJourneys, summarizeWeeklyLessonClicks } from "../js/visitor-journeys.js";

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

const trends = summarizeResourceViewTrends({
  groupClicks: {
    currentA: { title: "자료 A" },
    legacyA: { title: "자료 A" },
    currentB: { title: "자료 B" },
  },
  daily: {
    "2026-08-30": { views: 9 },
    "2026-08-31": { groupClicks: { currentA: 2 } },
    "2026-09-01": { groupClicks: { currentA: 1, legacyA: 2, currentB: 4 } },
    "2026-09-02": { views: 3 },
    "2026-09-05": { groupClicks: { currentA: 2, currentB: 1 } },
  },
});
assert.deepEqual(trends[0], {
  title: "전체 자료",
  total: 12,
  daily: [
    { period: "2026-08-31", views: 2 },
    { period: "2026-09-01", views: 7 },
    { period: "2026-09-02", views: 0 },
    { period: "2026-09-05", views: 3 },
  ],
  weekdays: [
    { period: "2026-08-31", views: 2 },
    { period: "2026-09-01", views: 7 },
    { period: "2026-09-02", views: 0 },
  ],
  weekly: [{ period: "2026-08-31", views: 12 }],
  monthly: [{ period: "2026-08", views: 2 }, { period: "2026-09", views: 10 }],
});
assert.deepEqual(trends[1], {
  title: "자료 A",
  total: 7,
  daily: [
    { period: "2026-08-31", views: 2 },
    { period: "2026-09-01", views: 3 },
    { period: "2026-09-02", views: 0 },
    { period: "2026-09-05", views: 2 },
  ],
  weekdays: [
    { period: "2026-08-31", views: 2 },
    { period: "2026-09-01", views: 3 },
    { period: "2026-09-02", views: 0 },
  ],
  weekly: [{ period: "2026-08-31", views: 7 }],
  monthly: [{ period: "2026-08", views: 2 }, { period: "2026-09", views: 5 }],
});
assert.equal(summarizeResourceViewTrends({ groupClicks: { a: { title: "가" } }, daily: { "2026-09-01": { groupClicks: { a: 1 } } } })[0].title, "전체 자료");

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
assert.deepEqual(insights.exploration, {
  visitors: 3,
  single: 2,
  multiple: 1,
  average: 4 / 3,
  distribution: [{ label: "1개", visitors: 2 }, { label: "2개", visitors: 1 }],
});
assert.equal(insights.pairs[0].count, 1);
assert.deepEqual(insights.firstResources, [{ title: "자료 A", visitors: 2 }, { title: "자료 B", visitors: 1 }]);
assert.deepEqual(insights.leadTime.distribution, [{ label: "1분 이내", visitors: 3 }]);
assert.deepEqual(insights.repeat.resources[0], { title: "자료 A", repeated: 1, crossDay: 1 });
assert.deepEqual(insights.types, [{ label: "게임", visitors: 2 }, { label: "수업", visitors: 2 }]);

const decisionNow = Date.parse("2026-09-21T15:00:00Z"); // 2026-09-22 00:00 KST
const decisionDates = Array.from({ length: 14 }, (_, index) => `2026-09-${String(index + 8).padStart(2, "0")}`);
const decisionDaily = Object.fromEntries(decisionDates.map(date => [date, { groupClicks: {} }]));
decisionDaily["2026-09-08"].groupClicks = { currentA: 2, currentB: 1 };
decisionDaily["2026-09-09"] = { views: 99 }; // after collection began: recorded zero group clicks
decisionDaily["2026-09-10"].groupClicks = { legacyA: 1 };
decisionDaily["2026-09-15"].groupClicks = { currentA: 1 };
decisionDaily["2026-09-16"].groupClicks = { legacyA: 2 };
decisionDaily["2026-09-17"].groupClicks = { currentB: 3 };

const decisionAnalytics = {
  groupClicks: {
    currentA: { groupId: "currentA", title: "자료 A", type: "game" },
    legacyA: { groupId: "legacyA", title: "자료 A", type: "game" },
    currentB: { groupId: "currentB", title: "자료 B", type: "lesson" },
  },
  groupClickVisitors: {
    currentA: {
      shared: { firstClickedAt: Date.parse("2026-09-08T10:00:00+09:00"), lastClickedAt: Date.parse("2026-09-08T11:00:00+09:00") },
      invalidFirst: { firstClickedAt: 0, lastClickedAt: Date.parse("2026-09-10T10:00:00+09:00") },
    },
    legacyA: {
      shared: { firstClickedAt: Date.parse("2026-09-08T12:00:00+09:00"), lastClickedAt: Date.parse("2026-09-10T12:00:00+09:00") },
      invalidLast: { firstClickedAt: Date.parse("2026-09-08T12:00:00+09:00"), lastClickedAt: Infinity },
    },
    currentB: { shared: {}, onlyB: {} },
  },
  daily: decisionDaily,
};
const decisionCatalog = [
  { id: "currentA", title: "자료 A", kind: "game", makers: ["kim"], subjects: ["사회"], unitKeys: ["사회::경제"] },
  { id: "currentB", title: "자료 B", kind: "lesson", makers: ["lee"], subjects: ["정치"], unitKeys: ["정치::민주주의"] },
  { id: "unused", title: "미사용 자료", kind: "lesson", makers: ["park"], subjects: ["사회"], unitKeys: ["사회::경제"] },
];
const decisions = summarizeDecisionAnalytics(decisionAnalytics, decisionCatalog, decisionNow);

assert.deepEqual(decisions.period.currentDates, ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"]);
assert.equal(decisions.period.complete, true);
assert.deepEqual(decisions.totals, { visitors: 4, resourceCount: 3, current: 6, previous: 4, change: 2 });
assert.deepEqual(decisions.options, { makers: ["kim", "lee", "park"], types: ["game", "lesson"] });
assert.equal(decisions.daily.find(item => item.date === "2026-09-09").views, 0);

const decisionA = decisions.resources.find(item => item.title === "자료 A");
const decisionB = decisions.resources.find(item => item.title === "자료 B");
const unusedDecision = decisions.resources.find(item => item.title === "미사용 자료");
assert.equal(decisionA.visitors, 3); // shared browser is deduplicated across current and legacy IDs
assert.equal(decisionA.crossDayVisitors, 1); // invalid/non-positive timestamps cannot create a cross-day visit
assert.equal(decisionA.current, 3);
assert.equal(decisionA.previous, 3);
assert.equal(decisionA.currentShare, 0.5);
assert.equal(decisionA.previousShare, 0.75);
assert.deepEqual(decisionA.pairs, [{ title: "자료 B", count: 1, rate: 1 / 3 }]);
assert.deepEqual(decisionB.pairs, [{ title: "자료 A", count: 1, rate: 1 / 2 }]);
assert.equal(unusedDecision.visitors, 0);
assert.equal(unusedDecision.daily.length, 14);
assert.equal(decisions.highlights.some(item => item.title.includes("반복 이용")), false);
assert.deepEqual(decisions.subjects.find(item => item.label === "사회"), { label: "사회", resourceCount: 2, current: 3, previous: 3, change: 0 });

const repeatVisitors = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`repeat-${index}`, {
  firstClickedAt: Date.parse("2026-09-08T10:00:00+09:00"),
  lastClickedAt: Date.parse(index < 3 ? "2026-09-09T10:00:00+09:00" : "2026-09-08T11:00:00+09:00"),
}]));
const repeatDecisions = summarizeDecisionAnalytics({
  groupClicks: { currentA: { groupId: "currentA", title: "자료 A", type: "game" } },
  groupClickVisitors: { currentA: repeatVisitors },
  daily: decisionDaily,
}, [decisionCatalog[0]], decisionNow);
const repeatHighlight = repeatDecisions.highlights.find(item => item.title.includes("반복 이용"));
assert.ok(repeatHighlight);
assert.match(repeatHighlight.body, /누적 10개·다른 날짜 재열람 3개 브라우저 이상/);
assert.ok(repeatDecisions.highlights.length <= 3);

const missingDaily = { ...decisionDaily };
delete missingDaily["2026-09-18"];
const incomplete = summarizeDecisionAnalytics({ ...decisionAnalytics, daily: missingDaily }, decisionCatalog, decisionNow);
assert.equal(incomplete.period.currentComplete, false);
assert.deepEqual(incomplete.period.missingDates, ["2026-09-18"]);
assert.equal(incomplete.totals.current, null);
assert.equal(incomplete.totals.previous, 4);
assert.equal(incomplete.totals.change, null);
assert.deepEqual(incomplete.daily.find(item => item.date === "2026-09-18"), { date: "2026-09-18", views: null, available: false });

const lateCollectionDaily = Object.fromEntries(decisionDates.map(date => [date, { views: 1 }]));
lateCollectionDaily["2026-09-10"] = { groupClicks: { currentA: 1 } };
const lateCollection = summarizeDecisionAnalytics({ ...decisionAnalytics, daily: lateCollectionDaily }, decisionCatalog, decisionNow);
assert.equal(lateCollection.daily.find(item => item.date === "2026-09-09").available, false);
assert.deepEqual(lateCollection.daily.find(item => item.date === "2026-09-11"), { date: "2026-09-11", views: 0, available: true });

const makerFiltered = summarizeDecisionAnalytics(decisionAnalytics, decisionCatalog, decisionNow, { maker: "kim", type: "" });
assert.deepEqual(makerFiltered.resources.map(item => item.title), ["자료 A"]);
assert.deepEqual(makerFiltered.totals, { visitors: 3, resourceCount: 1, current: 3, previous: 3, change: 0 });
assert.deepEqual(makerFiltered.options, decisions.options);
const lessonFiltered = summarizeDecisionAnalytics(decisionAnalytics, decisionCatalog, decisionNow, { maker: "", type: "lesson" });
assert.deepEqual(lessonFiltered.resources.map(item => item.title), ["자료 B", "미사용 자료"]);

const emptyDecisions = summarizeDecisionAnalytics({}, [], decisionNow);
assert.deepEqual(emptyDecisions.resources, []);
assert.deepEqual(emptyDecisions.exploration, { visitors: 0, single: 0, multiple: 0, average: 0, distribution: [] });
assert.equal(emptyDecisions.totals.current, null);
const zeroDaily = Object.fromEntries(decisionDates.map(date => [date, { groupClicks: {} }]));
const zeroUse = summarizeDecisionAnalytics({ daily: zeroDaily }, [decisionCatalog[2]], decisionNow);
assert.equal(zeroUse.totals.current, 0);
assert.equal(zeroUse.resources[0].currentShare, null);
assert.equal(zeroUse.resources[0].repeatRate, null);
const invalidTimes = summarizeDecisionAnalytics({
  groupClicks: { a: { title: "자료 A" } },
  groupClickVisitors: { a: {
    reversed: { firstClickedAt: Date.parse("2026-09-10"), lastClickedAt: Date.parse("2026-09-08") },
    outOfRange: { firstClickedAt: Date.parse("2026-09-08"), lastClickedAt: 1e20 },
  } },
}, [], decisionNow);
assert.equal(invalidTimes.resources[0].crossDayVisitors, 0);
console.log("visitor journey tests passed");
