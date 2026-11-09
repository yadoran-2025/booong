import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(host || "", /^127\.0\.0\.1:\d+$/, "Run only against the local database emulator");
const require = createRequire(new URL("../bungmo-app/package.json", import.meta.url));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { ref, get, set, update, remove, runTransaction } = require("firebase/database");
const env = await initializeTestEnvironment({ projectId: "demo-booong-analytics", database: { host: "127.0.0.1", port: Number(host.split(":")[1]), rules: await readFile(new URL("../database.rules.json", import.meta.url), "utf8") } });
const fixture = { pages: { dashboard: { key: "dashboard", title: "홈", path: "index.html", type: "page", views: 9, visitors: 4 } }, pageVisitors: { dashboard: { old: { firstSeenAt: 123 } } }, daily: { "2026-11-08": { views: 7, pages: { dashboard: 5 }, groupClicks: { one: 3 } } }, totals: { views: 42 }, groupClicks: { one: { groupId: "one", title: "수업", views: 5, totalClicks: 8, visitorCount: 2 } }, groupClickVisitors: { one: { old: { count: 3 } } }, favorites: { one: { count: 1 } }, favoriteVisitors: { one: { old: { savedAt: 456 } } } };
try {
  await env.withSecurityRulesDisabled(async ctx => set(ref(ctx.database()), { analytics: fixture, comments: { preserved: true } }));
  const db = env.unauthenticatedContext().database();
  for (const path of ["analytics", "analytics/pages", "analytics/pageVisitors", "analytics/pageVisitors/dashboard", "analytics/groupClicks", "analytics/groupClickVisitors/one", "analytics/favoriteVisitors/one", "analytics/daily/2026-11-08", "analytics/pages/dashboard/title", "comments"]) await assertFails(get(ref(db, path)));
  await assertSucceeds(get(ref(db, "analytics/pageVisitors/dashboard/old")));
  await assertSucceeds(update(ref(db, "analytics/pages/dashboard"), { title: "홈", updatedAt: 1000 }));
  for (const path of ["pages/dashboard/views", "pages/dashboard/visitors", "daily/2026-11-08/views", "daily/2026-11-08/pages/dashboard", "daily/2026-11-08/groupClicks/one", "totals/views", "groupClicks/one/views", "groupClicks/one/totalClicks", "groupClicks/one/visitorCount", "groupClickVisitors/one/old/count"]) await assertSucceeds(runTransaction(ref(db, `analytics/${path}`), value => (Number(value) || 0) + 1));
  await assertSucceeds(set(ref(db, "analytics/pageVisitors/dashboard/new"), { firstSeenAt: 1000 }));
  await assertFails(set(ref(db, "analytics/pageVisitors/dashboard/old"), { firstSeenAt: 0 }));
  await assertFails(set(ref(db, "analytics/pages/dashboard/views"), 0));
  await assertSucceeds(set(ref(db, "analytics/favoriteVisitors/one/new"), { savedAt: 1000 }));
  await assertSucceeds(runTransaction(ref(db, "analytics/favorites/one/count"), value => value + 1));
  await assertSucceeds(remove(ref(db, "analytics/favoriteVisitors/one/new")));
  await assertSucceeds(runTransaction(ref(db, "analytics/favorites/one/count"), value => value - 1));
  const reader = env.authenticatedContext("booong-analytics-reader", { booongAnalyticsRead: true }).database();
  const snapshot = (await assertSucceeds(get(ref(reader, "analytics")))).val();
  assert.equal(snapshot.pages.dashboard.views, 10); assert.equal(snapshot.totals.views, 43);
  assert.deepEqual(snapshot.pageVisitors.dashboard.old, fixture.pageVisitors.dashboard.old);
  assert.deepEqual(snapshot.favoriteVisitors.one.old, fixture.favoriteVisitors.one.old);
  assert.equal(snapshot.favorites.one.count, 1);
  await assertFails(get(ref(reader, "comments"))); await assertFails(get(ref(reader)));
  await assertFails(set(ref(reader, "analytics"), fixture));
  for (const [uid, claims] of [["booong-analytics-reader", {}], ["other-server", { booongAnalyticsRead: true }], ["normal-google-user", { email: "admin@example.com" }]]) await assertFails(get(ref(env.authenticatedContext(uid, claims).database(), "analytics")));
  console.log("Analytics rules: original records preserved, bulk reads denied, exact-leaf tracking/transactions/favorites work, dedicated reader scoped to analytics.");
} finally { await env.cleanup(); }
