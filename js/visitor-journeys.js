export function summarizeVisitorJourneys(pageVisitors = {}, groups = {}, groupVisitors = {}) {
  const dashboardVisitors = new Set(Object.keys(pageVisitors.dashboard || {}));
  const allVisitors = new Set();
  const clickedVisitors = new Set();

  Object.values(pageVisitors).forEach(value => Object.keys(value || {}).forEach(id => allVisitors.add(id)));
  const resourceGroups = Object.entries(groups)
    .filter(([, group]) => group?.groupId)
    .map(([groupId, group]) => {
      const visitorIds = Object.keys(groupVisitors[groupId] || {});
      visitorIds.forEach(id => {
        allVisitors.add(id);
        clickedVisitors.add(id);
      });
      return {
        groupId,
        title: group.title || groupId,
        type: group.type || "자료",
        visitorIds,
        clicks: Number(group.totalClicks) || 0,
      };
    });
  const groupedResources = new Map();
  resourceGroups.forEach(item => {
    const key = `${item.type}\u0000${item.title}`;
    const current = groupedResources.get(key) || { title: item.title, type: item.type, visitorIds: new Set(), clicks: 0 };
    item.visitorIds.forEach(id => current.visitorIds.add(id));
    current.clicks += item.clicks;
    groupedResources.set(key, current);
  });
  const resources = [...groupedResources.values()]
    .map(item => ({
      title: item.title,
      type: item.type,
      visitors: item.visitorIds.size,
      fromDashboard: [...item.visitorIds].filter(id => dashboardVisitors.has(id)).length,
      clicks: item.clicks,
    }))
    .sort((a, b) => b.visitors - a.visitors || b.clicks - a.clicks || a.title.localeCompare(b.title, "ko"));
  const dashboardClickVisitors = [...clickedVisitors].filter(id => dashboardVisitors.has(id)).length;

  return {
    uniqueVisitors: allVisitors.size,
    dashboardVisitors: dashboardVisitors.size,
    clickedVisitors: clickedVisitors.size,
    dashboardClickVisitors,
    conversionRate: dashboardVisitors.size ? dashboardClickVisitors / dashboardVisitors.size : 0,
    resources,
  };
}

export function summarizeWeeklyLessonClicks(groups = {}, groupVisitors = {}, startAt = 0) {
  const lessons = new Map();
  Object.entries(groups).forEach(([groupId, group]) => {
    if (!group?.groupId) return;
    const visitorIds = Object.entries(groupVisitors[groupId] || {})
      .filter(([, visitor]) => Math.max(Number(visitor?.firstClickedAt) || 0, Number(visitor?.lastClickedAt) || 0) >= startAt)
      .map(([visitorId]) => visitorId);
    if (!visitorIds.length) return;
    const key = `${group.type || "자료"}\u0000${group.title || groupId}`;
    const current = lessons.get(key) || { title: group.title || groupId, visitorIds: new Set() };
    visitorIds.forEach(visitorId => current.visitorIds.add(visitorId));
    lessons.set(key, current);
  });
  return [...lessons.values()]
    .map(item => ({ title: item.title, visitors: item.visitorIds.size }))
    .sort((a, b) => b.visitors - a.visitors || a.title.localeCompare(b.title, "ko"));
}

export function summarizeResourceViewTrends(analytics = {}) {
  const groups = analytics.groupClicks || {};
  const recordedDays = Object.entries(analytics.daily || {}).sort(([left], [right]) => left.localeCompare(right));
  const firstRecordedDay = recordedDays.findIndex(([, value]) => value?.groupClicks);
  const daily = (firstRecordedDay < 0 ? [] : recordedDays.slice(firstRecordedDay))
    .map(([date, value]) => {
      const resources = new Map();
      Object.entries(value?.groupClicks || {}).forEach(([groupId, views]) => {
        const title = groups[groupId]?.title || groupId;
        resources.set(title, (resources.get(title) || 0) + (Number(views) || 0));
      });
      return { date, resources };
    });
  const titles = [...new Set(daily.flatMap(item => [...item.resources.keys()]))]
    .sort((left, right) => left.localeCompare(right, "ko"));
  const series = [{
    title: "전체 자료",
    daily: daily.map(item => ({ period: item.date, views: [...item.resources.values()].reduce((sum, views) => sum + views, 0) })),
  }, ...titles.map(title => ({
    title,
    daily: daily.map(item => ({ period: item.date, views: item.resources.get(title) || 0 })),
  }))];

  const summarized = series.map(item => {
    return {
      ...item,
      total: item.daily.reduce((sum, point) => sum + point.views, 0),
      weekdays: item.daily.filter(item => ![0, 6].includes(new Date(`${item.period}T12:00:00Z`).getUTCDay())),
      weekly: aggregatePeriods(item.daily, item => getWeekStart(item.period)),
      monthly: aggregatePeriods(item.daily, item => item.period.slice(0, 7)),
    };
  });
  return [summarized[0], ...summarized.slice(1).sort((left, right) => right.total - left.total || left.title.localeCompare(right.title, "ko"))];
}

function aggregatePeriods(points, getPeriod) {
  const periods = new Map();
  points.forEach(item => periods.set(getPeriod(item), (periods.get(getPeriod(item)) || 0) + item.views));
  return [...periods].map(([period, views]) => ({ period, views }));
}

function getWeekStart(period) {
  const date = new Date(`${period}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export function summarizeAnalyticsInsights(analytics = {}, catalog = [], now = Date.now()) {
  const pageVisitors = analytics.pageVisitors || {};
  const groups = analytics.groupClicks || {};
  const groupVisitors = analytics.groupClickVisitors || {};
  const catalogByTitle = new Map(catalog.map(item => [item.title, item]));
  const resources = new Map();

  Object.entries(groups).forEach(([groupId, group]) => {
    if (!group?.title) return;
    const current = resources.get(group.title) || {
      title: group.title,
      type: catalogByTitle.get(group.title)?.kind || group.type || "lesson",
      visitors: new Map(),
      clicks: 0,
    };
    current.clicks = Math.max(current.clicks, Number(group.totalClicks) || 0);
    Object.entries(groupVisitors[groupId] || {}).forEach(([visitorId, visit]) => {
      const existing = current.visitors.get(visitorId) || { first: Infinity, last: 0, count: 0 };
      existing.first = Math.min(existing.first, Number(visit.firstClickedAt) || Infinity);
      existing.last = Math.max(existing.last, Number(visit.lastClickedAt) || Number(visit.firstClickedAt) || 0);
      existing.count = Math.max(existing.count, Number(visit.count) || 1);
      current.visitors.set(visitorId, existing);
    });
    resources.set(group.title, current);
  });

  const resourceList = [...resources.values()]
    .map(item => ({ ...item, visitorCount: item.visitors.size }))
    .sort((a, b) => b.visitorCount - a.visitorCount || a.title.localeCompare(b.title, "ko"));
  const visitorResources = new Map();
  resourceList.forEach(resource => resource.visitors.forEach((visit, visitorId) => {
    const current = visitorResources.get(visitorId) || [];
    current.push({ title: resource.title, ...visit });
    visitorResources.set(visitorId, current);
  }));

  const resourceVisits = resourceList.reduce((total, item) => total + item.visitorCount, 0);
  const explorationCounts = [...visitorResources.values()].map(items => items.length);
  const singleResource = explorationCounts.filter(count => count === 1).length;
  const pairs = [];
  for (let left = 0; left < resourceList.length; left += 1) {
    for (let right = left + 1; right < resourceList.length; right += 1) {
      const first = resourceList[left];
      const second = resourceList[right];
      const count = [...first.visitors.keys()].filter(id => second.visitors.has(id)).length;
      if (count) pairs.push({ first: first.title, second: second.title, count });
    }
  }

  const firstResources = new Map();
  const leadTimes = [];
  let sameDayClicks = 0;
  const dashboardVisitors = pageVisitors.dashboard || {};
  visitorResources.forEach((items, visitorId) => {
    const first = [...items].sort((a, b) => a.first - b.first || a.title.localeCompare(b.title, "ko"))[0];
    firstResources.set(first.title, (firstResources.get(first.title) || 0) + 1);
    const seenAt = Number(dashboardVisitors[visitorId]?.firstSeenAt) || 0;
    if (!seenAt || !Number.isFinite(first.first) || first.first < seenAt) return;
    leadTimes.push(first.first - seenAt);
    if (dayKey(first.first) === dayKey(seenAt)) sameDayClicks += 1;
  });

  const repeatedVisitors = new Set();
  const crossDayVisitors = new Set();
  const repeatResources = resourceList.map(resource => {
    let repeated = 0;
    let crossDay = 0;
    resource.visitors.forEach((visit, visitorId) => {
      if (visit.count > 1) { repeated += 1; repeatedVisitors.add(visitorId); }
      if (dayKey(visit.first) !== dayKey(visit.last)) { crossDay += 1; crossDayVisitors.add(visitorId); }
    });
    return { title: resource.title, repeated, crossDay };
  }).filter(item => item.repeated || item.crossDay)
    .sort((a, b) => b.repeated - a.repeated || b.crossDay - a.crossDay || a.title.localeCompare(b.title, "ko"));

  const dates = Object.keys(analytics.daily || {}).sort();
  const currentDay = dayKey(now);
  const clickDates = dates.filter(date => date < currentDay && analytics.daily[date]?.groupClicks).slice(-6);
  const recentDates = clickDates.slice(-3);
  const previousDates = clickDates.slice(-6, -3);
  const dailyTitles = date => Object.entries(analytics.daily?.[date]?.groupClicks || {}).reduce((totals, [groupId, count]) => {
    const title = groups[groupId]?.title || groupId;
    totals[title] = (totals[title] || 0) + (Number(count) || 0);
    return totals;
  }, {});
  const sumPeriod = period => period.reduce((totals, date) => {
    Object.entries(dailyTitles(date)).forEach(([title, count]) => { totals[title] = (totals[title] || 0) + count; });
    return totals;
  }, {});
  const recentTotals = sumPeriod(recentDates);
  const previousTotals = sumPeriod(previousDates);
  const recentInterest = [...new Set([...Object.keys(recentTotals), ...Object.keys(previousTotals)])]
    .map(title => ({ title, current: recentTotals[title] || 0, previous: previousTotals[title] || 0, change: (recentTotals[title] || 0) - (previousTotals[title] || 0) }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.current - a.current || a.title.localeCompare(b.title, "ko"));

  const weekdays = new Map();
  dates.forEach(date => {
    const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" }).format(new Date(`${date}T12:00:00+09:00`));
    const current = weekdays.get(weekday) || { weekday, days: 0, views: 0 };
    current.days += 1;
    current.views += Number(analytics.daily[date]?.views) || 0;
    weekdays.set(weekday, current);
  });
  const weekdayStats = [...weekdays.values()].map(item => ({ ...item, average: item.days ? item.views / item.days : 0 }))
    .sort((a, b) => b.average - a.average);

  const subjectStats = groupCatalogVisitors(resourceList, catalogByTitle, item => item.subjects || []);
  const unitStats = groupCatalogVisitors(resourceList, catalogByTitle, item => item.unitKeys || []);
  const typeStats = groupResourceVisitors(resourceList, resource => resource.type === "game" ? "게임" : "수업");
  const makerStats = groupCatalogVisitors(resourceList, catalogByTitle, item => item.makers || []);
  const pageStats = Object.entries(pageVisitors).map(([key, visitors]) => ({
    key,
    title: analytics.pages?.[key]?.title || key,
    visitors: Object.keys(visitors || {}).length,
  })).filter(item => item.key !== "dashboard")
    .sort((a, b) => b.visitors - a.visitors || a.title.localeCompare(b.title, "ko"));

  const sortedLeadTimes = leadTimes.sort((a, b) => a - b);
  return {
    reach: resourceList.map(({ title, visitorCount }) => ({ title, visitors: visitorCount })),
    concentrationRate: resourceVisits ? resourceList.slice(0, 3).reduce((total, item) => total + item.visitorCount, 0) / resourceVisits : 0,
    exploration: {
      visitors: explorationCounts.length,
      single: singleResource,
      multiple: explorationCounts.length - singleResource,
      average: explorationCounts.length ? resourceVisits / explorationCounts.length : 0,
    },
    pairs: pairs.sort((a, b) => b.count - a.count || a.first.localeCompare(b.first, "ko")),
    firstResources: [...firstResources].map(([title, visitors]) => ({ title, visitors })).sort((a, b) => b.visitors - a.visitors || a.title.localeCompare(b.title, "ko")),
    leadTime: {
      visitors: leadTimes.length,
      medianMs: sortedLeadTimes.length ? sortedLeadTimes[Math.floor(sortedLeadTimes.length / 2)] : 0,
      sameDayRate: leadTimes.length ? sameDayClicks / leadTimes.length : 0,
    },
    repeat: { visitors: repeatedVisitors.size, crossDayVisitors: crossDayVisitors.size, resources: repeatResources },
    recent: { currentDates: recentDates, previousDates, resources: recentInterest },
    weekdays: weekdayStats,
    subjects: subjectStats,
    units: unitStats,
    types: typeStats,
    pages: pageStats,
    makers: makerStats,
  };
}

function groupCatalogVisitors(resources, catalogByTitle, getGroups) {
  const groups = new Map();
  resources.forEach(resource => (getGroups(catalogByTitle.get(resource.title) || {}) || []).forEach(label => {
    const visitors = groups.get(label) || new Set();
    resource.visitors.forEach((_, visitorId) => visitors.add(visitorId));
    groups.set(label, visitors);
  }));
  return [...groups].map(([label, visitors]) => ({ label, visitors: visitors.size }))
    .sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label, "ko"));
}

function groupResourceVisitors(resources, getGroup) {
  const groups = new Map();
  resources.forEach(resource => {
    const label = getGroup(resource);
    const visitors = groups.get(label) || new Set();
    resource.visitors.forEach((_, visitorId) => visitors.add(visitorId));
    groups.set(label, visitors);
  });
  return [...groups].map(([label, visitors]) => ({ label, visitors: visitors.size }))
    .sort((a, b) => b.visitors - a.visitors || a.label.localeCompare(b.label, "ko"));
}

function dayKey(value) {
  if (!Number.isFinite(Number(value))) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Number(value)));
}
