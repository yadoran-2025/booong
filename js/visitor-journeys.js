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
  const explorationDistribution = [1, 2, 3, 4].map(count => ({
    label: count === 4 ? "4개 이상" : `${count}개`,
    visitors: explorationCounts.filter(value => count === 4 ? value >= count : value === count).length,
  })).filter(item => item.visitors);
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
  const leadTimeDistribution = [
    { label: "1분 이내", min: 0, max: 60_000 },
    { label: "1–10분", min: 60_000, max: 600_000 },
    { label: "10–60분", min: 600_000, max: 3_600_000 },
    { label: "1시간 이후", min: 3_600_000, max: Infinity },
  ].map(bucket => ({ label: bucket.label, visitors: leadTimes.filter(value => value >= bucket.min && value < bucket.max).length }))
    .filter(item => item.visitors);
  return {
    reach: resourceList.map(({ title, visitorCount }) => ({ title, visitors: visitorCount })),
    concentrationRate: resourceVisits ? resourceList.slice(0, 3).reduce((total, item) => total + item.visitorCount, 0) / resourceVisits : 0,
    exploration: {
      visitors: explorationCounts.length,
      single: singleResource,
      multiple: explorationCounts.length - singleResource,
      average: explorationCounts.length ? resourceVisits / explorationCounts.length : 0,
      distribution: explorationDistribution,
    },
    pairs: pairs.sort((a, b) => b.count - a.count || a.first.localeCompare(b.first, "ko")),
    firstResources: [...firstResources].map(([title, visitors]) => ({ title, visitors })).sort((a, b) => b.visitors - a.visitors || a.title.localeCompare(b.title, "ko")),
    leadTime: {
      visitors: leadTimes.length,
      medianMs: sortedLeadTimes.length ? sortedLeadTimes[Math.floor(sortedLeadTimes.length / 2)] : 0,
      sameDayRate: leadTimes.length ? sameDayClicks / leadTimes.length : 0,
      distribution: leadTimeDistribution,
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

export function summarizeDecisionAnalytics(analytics = {}, catalog = [], now = Date.now(), filters = { maker: "", type: "" }) {
  const groups = analytics.groupClicks || {};
  const groupVisitors = analytics.groupClickVisitors || {};
  const dailyRecords = analytics.daily || {};
  const resources = new Map();
  const resourcesById = new Map();
  const resourcesByTitle = new Map();

  const addCatalogResource = (item, index) => {
    const id = String(item?.id || item?.groupId || item?.resourceId || "").trim();
    const title = String(item?.title || id).trim();
    if (!title) return;
    const resource = {
      key: `catalog:${id || index}`,
      title,
      type: normalizeResourceType(item?.kind || item?.type),
      makers: normalizeLabels(item?.makers || item?.maker),
      subjects: normalizeLabels(item?.subjects || item?.subject),
      unitKeys: normalizeLabels(item?.unitKeys || item?.unitKey),
      visitors: new Map(),
    };
    resources.set(resource.key, resource);
    [id, item?.groupId, item?.resourceId].filter(Boolean).forEach(value => resourcesById.set(String(value), resource));
    [title, ...normalizeLabels(item?.aliases), ...normalizeLabels(item?.legacyTitles)].forEach(value => {
      if (!resourcesByTitle.has(String(value))) resourcesByTitle.set(String(value), resource);
    });
  };
  catalog.forEach(addCatalogResource);

  const observedIds = new Set([
    ...Object.keys(groups),
    ...Object.keys(groupVisitors),
    ...Object.values(dailyRecords).flatMap(record => Object.keys(record?.groupClicks || {})),
  ]);
  observedIds.forEach(groupId => {
    const group = groups[groupId] || {};
    const title = String(group.title || groupId).trim();
    let resource = resourcesById.get(groupId)
      || resourcesById.get(String(group.groupId || ""))
      || resourcesByTitle.get(title);
    if (!resource) {
      resource = {
        key: `observed:${title}`,
        title,
        type: normalizeResourceType(group.type || group.kind),
        makers: normalizeLabels(group.makers || group.maker),
        subjects: normalizeLabels(group.subjects || group.subject),
        unitKeys: normalizeLabels(group.unitKeys || group.unitKey),
        visitors: new Map(),
      };
      resources.set(resource.key, resource);
      resourcesByTitle.set(title, resource);
    } else {
      resource.makers = mergeLabels(resource.makers, normalizeLabels(group.makers || group.maker));
      resource.subjects = mergeLabels(resource.subjects, normalizeLabels(group.subjects || group.subject));
      resource.unitKeys = mergeLabels(resource.unitKeys, normalizeLabels(group.unitKeys || group.unitKey));
    }
    resourcesById.set(groupId, resource);
    if (!resourcesByTitle.has(title)) resourcesByTitle.set(title, resource);
  });

  Object.entries(groupVisitors).forEach(([groupId, visitors]) => {
    const resource = resourcesById.get(groupId);
    if (!resource) return;
    Object.entries(visitors || {}).forEach(([visitorId, visit]) => {
      const current = resource.visitors.get(visitorId) || { first: Infinity, last: -Infinity };
      const first = positiveFinite(visit?.firstClickedAt);
      const last = positiveFinite(visit?.lastClickedAt);
      if (first !== null) current.first = Math.min(current.first, first);
      if (last !== null) current.last = Math.max(current.last, last);
      resource.visitors.set(visitorId, current);
    });
  });

  const today = dayKey(now);
  const currentDates = dateRange(addDays(today, -7), 7);
  const previousDates = dateRange(addDays(today, -14), 7);
  const periodDates = [...previousDates, ...currentDates];
  const firstGroupClicksDate = Object.keys(dailyRecords).sort()
    .find(date => dailyRecords[date]?.groupClicks && typeof dailyRecords[date].groupClicks === "object");
  const availability = new Map(periodDates.map(date => [date,
    Boolean(firstGroupClicksDate && date >= firstGroupClicksDate && Object.hasOwn(dailyRecords, date)),
  ]));
  const missingDates = periodDates.filter(date => !availability.get(date));
  const currentComplete = currentDates.every(date => availability.get(date));
  const previousComplete = previousDates.every(date => availability.get(date));
  const complete = currentComplete && previousComplete;

  const resourceDailyViews = new Map([...resources.values()].map(resource => [resource.key, new Map(periodDates.map(date => [date, 0]))]));
  periodDates.forEach(date => {
    if (!availability.get(date)) return;
    Object.entries(dailyRecords[date]?.groupClicks || {}).forEach(([groupId, value]) => {
      const resource = resourcesById.get(groupId);
      if (!resource) return;
      const views = Number(value);
      if (Number.isFinite(views) && views > 0) {
        resourceDailyViews.get(resource.key).set(date, resourceDailyViews.get(resource.key).get(date) + views);
      }
    });
  });

  const allResources = [...resources.values()];
  const options = {
    makers: [...new Set(allResources.flatMap(resource => resource.makers))].sort(compareKorean),
    types: [...new Set(allResources.map(resource => resource.type))].sort(compareKorean),
  };
  const makerFilter = String(filters?.maker || "").trim();
  const typeFilter = String(filters?.type || "").trim();
  const normalizedTypeFilter = typeFilter ? normalizeResourceType(typeFilter) : "";
  const filteredResources = allResources.filter(resource =>
    (!makerFilter || resource.makers.includes(makerFilter))
    && (!typeFilter || resource.type === normalizedTypeFilter));

  const periodTotal = (resource, dates) => dates.reduce((sum, date) => sum + resourceDailyViews.get(resource.key).get(date), 0);
  const cumulativeVisitors = new Set(filteredResources.flatMap(resource => [...resource.visitors.keys()]));
  const currentTotal = currentDates.reduce((sum, date) => sum + filteredResources.reduce((dailySum, resource) => dailySum + resourceDailyViews.get(resource.key).get(date), 0), 0);
  const previousTotal = previousDates.reduce((sum, date) => sum + filteredResources.reduce((dailySum, resource) => dailySum + resourceDailyViews.get(resource.key).get(date), 0), 0);

  const resultResources = filteredResources.map(resource => {
    const visitors = resource.visitors.size;
    const crossDayVisitors = [...resource.visitors.values()].filter(visit =>
      Number.isFinite(visit.first) && Number.isFinite(visit.last) && visit.last >= visit.first && dayKey(visit.first) !== dayKey(visit.last)).length;
    const rawCurrent = periodTotal(resource, currentDates);
    const rawPrevious = periodTotal(resource, previousDates);
    return {
      key: resource.key,
      title: resource.title,
      type: resource.type,
      makers: resource.makers,
      subjects: resource.subjects,
      unitKeys: resource.unitKeys,
      visitors,
      crossDayVisitors,
      repeatRate: visitors ? crossDayVisitors / visitors : null,
      current: currentComplete ? rawCurrent : null,
      previous: previousComplete ? rawPrevious : null,
      change: complete ? rawCurrent - rawPrevious : null,
      currentShare: currentComplete && currentTotal ? rawCurrent / currentTotal : null,
      previousShare: previousComplete && previousTotal ? rawPrevious / previousTotal : null,
      shareChange: complete && currentTotal && previousTotal ? rawCurrent / currentTotal - rawPrevious / previousTotal : null,
      daily: periodDates.map(date => ({ date, views: availability.get(date) ? resourceDailyViews.get(resource.key).get(date) : null, available: availability.get(date) })),
      pairs: [],
      _visitors: resource.visitors,
    };
  });

  // ponytail: pair scan is quadratic in resources; use a visitor-to-resource index if the catalog grows large.
  resultResources.forEach(resource => {
    resource.pairs = resultResources.filter(other => other !== resource).map(other => {
      const count = [...resource._visitors.keys()].filter(visitorId => other._visitors.has(visitorId)).length;
      return { title: other.title, count, rate: resource.visitors ? count / resource.visitors : 0 };
    }).filter(pair => pair.count > 0)
      .sort((left, right) => right.count - left.count || right.rate - left.rate || compareKorean(left.title, right.title));
  });
  resultResources.forEach(resource => delete resource._visitors);
  resultResources.sort((left, right) => right.visitors - left.visitors || compareKorean(left.title, right.title));

  const visitorResourceCounts = new Map();
  filteredResources.forEach(resource => resource.visitors.forEach((_, visitorId) => {
    visitorResourceCounts.set(visitorId, (visitorResourceCounts.get(visitorId) || 0) + 1);
  }));
  const explorationCounts = [...visitorResourceCounts.values()];
  const single = explorationCounts.filter(count => count === 1).length;
  const distribution = [1, 2, 3, 4].map(count => ({
    label: count === 4 ? "4개 이상" : `${count}개`,
    visitors: explorationCounts.filter(value => count === 4 ? value >= 4 : value === count).length,
  })).filter(item => item.visitors > 0);

  const summarizeDimension = key => {
    const labels = new Map();
    filteredResources.forEach(resource => resource[key].forEach(label => {
      const current = labels.get(label) || { label, resourceCount: 0, current: 0, previous: 0 };
      current.resourceCount += 1;
      current.current += periodTotal(resource, currentDates);
      current.previous += periodTotal(resource, previousDates);
      labels.set(label, current);
    }));
    return [...labels.values()].map(item => ({
      label: item.label,
      resourceCount: item.resourceCount,
      current: currentComplete ? item.current : null,
      previous: previousComplete ? item.previous : null,
      change: complete ? item.current - item.previous : null,
    })).sort((left, right) => (right.current ?? -1) - (left.current ?? -1) || right.resourceCount - left.resourceCount || compareKorean(left.label, right.label));
  };

  const highlights = [];
  const growing = complete ? resultResources.filter(resource => resource.change > 0)
    .sort((left, right) => right.change - left.change || compareKorean(left.title, right.title))[0] : null;
  if (growing) highlights.push({
    title: `${growing.title} 열람 증가`,
    body: `최근 완료 7일 열람이 직전 7일보다 ${growing.change}회 늘었습니다. 두 기간의 14일 기록이 모두 있는 경우에만 표시합니다.`,
  });
  const repeating = resultResources.filter(resource => resource.visitors >= 10 && resource.crossDayVisitors >= 3)
    .sort((left, right) => right.repeatRate - left.repeatRate || right.crossDayVisitors - left.crossDayVisitors || compareKorean(left.title, right.title))[0];
  if (repeating) highlights.push({
    title: `${repeating.title}의 반복 이용`,
    body: `누적 ${repeating.visitors}개 브라우저 중 ${repeating.crossDayVisitors}개가 다른 날짜에도 열었습니다. 누적 10개·다른 날짜 재열람 3개 브라우저 이상일 때만 이 신호를 표시합니다.`,
  });
  const multiple = explorationCounts.length - single;
  if (explorationCounts.length) highlights.push({
    title: "여러 자료 탐색",
    body: `자료를 연 ${explorationCounts.length}개 브라우저 중 ${multiple}개가 두 개 이상의 자료를 열었습니다. 클릭 순서나 학습 효과는 알 수 없습니다.`,
  });

  return {
    resources: resultResources,
    period: {
      currentDates,
      previousDates,
      currentLabel: periodLabel(currentDates),
      previousLabel: periodLabel(previousDates),
      complete,
      currentComplete,
      missingDates,
    },
    totals: {
      visitors: cumulativeVisitors.size,
      resourceCount: filteredResources.length,
      current: currentComplete ? currentTotal : null,
      previous: previousComplete ? previousTotal : null,
      change: complete ? currentTotal - previousTotal : null,
    },
    exploration: {
      visitors: explorationCounts.length,
      single,
      multiple,
      average: explorationCounts.length ? explorationCounts.reduce((sum, count) => sum + count, 0) / explorationCounts.length : 0,
      distribution,
    },
    subjects: summarizeDimension("subjects"),
    units: summarizeDimension("unitKeys"),
    daily: periodDates.map(date => ({
      date,
      views: availability.get(date) ? filteredResources.reduce((sum, resource) => sum + resourceDailyViews.get(resource.key).get(date), 0) : null,
      available: availability.get(date),
    })),
    highlights: highlights.slice(0, 3),
    options,
  };
}

function normalizeResourceType(value) {
  return String(value || "").trim().toLowerCase() === "game" || String(value || "").trim() === "게임" ? "game" : "lesson";
}

function normalizeLabels(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(item => String(item).trim()).filter(Boolean))];
}

function mergeLabels(left, right) {
  return [...new Set([...left, ...right])];
}

function positiveFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 8.64e15 ? number : null;
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dateRange(start, length) {
  return Array.from({ length }, (_, index) => addDays(start, index));
}

function periodLabel(dates) {
  return dates.length ? `${dates[0]} – ${dates.at(-1)}` : "";
}

function compareKorean(left, right) {
  return String(left).localeCompare(String(right), "ko");
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
