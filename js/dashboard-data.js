import { parseCSV } from "./api.js";

const DASHBOARD_SHEET_URLS = {
  groups: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1091433397&single=true&output=csv",
  units: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1789849359&single=true&output=csv",
};

const DASHBOARD_CONFIG_CACHE_KEY = "booong-dashboard-config-v3";
const DASHBOARD_CONFIG_CACHE_TTL = 10 * 60 * 1000;

const SCHOOL_BY_SUBJECT = {
  사회1: "중학교",
  사회2: "중학교",
  통합사회1: "고등학교",
  통합사회2: "고등학교",
  사회와문화: "고등학교",
  정치: "고등학교",
  법과사회: "고등학교",
  경제: "고등학교",
  국제관계의이해: "고등학교",
  금융과경제생활: "고등학교",
};

const SUBJECT_LABELS = {
  사회와문화: "사회와 문화",
  법과사회: "법과 사회",
  국제관계의이해: "국제 관계의 이해",
  금융과경제생활: "금융과 경제생활",
};

export async function loadDashboardConfig(options = {}) {
  const useCache = options.cache !== false;
  const cached = useCache ? loadCachedDashboardConfig() : null;
  if (cached) return cached;

  const local = await loadLocalDashboardConfig();

  try {
    const merged = mergeDashboardCatalog(local, await loadSheetDashboardCatalog());
    if (useCache) saveCachedDashboardConfig(merged);
    return merged;
  } catch (error) {
    console.warn(`Dashboard catalog load failed, using ${options.fallbackConfig ? "existing catalog" : "local lessons index"}:`, error);
    return options.fallbackConfig || local;
  }
}

export async function loadLocalDashboardConfig() {
  let config = { dashboard: {}, groups: [], games: [], tools: [], notices: [] };

  try {
    const res = await fetch(`lessons/index.json?_=${Date.now()}`, { cache: "no-store" });
    if (res.ok) config = await res.json();
  } catch (err) {
    console.error("Dashboard config load failed:", err);
  }

  return normalizeDashboardConfig(config);
}

export function loadCachedDashboardConfig() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const { ts, config } = JSON.parse(raw);
    if (!ts || Date.now() - ts > DASHBOARD_CONFIG_CACHE_TTL) return null;
    return normalizeDashboardConfig(config);
  } catch {
    return null;
  }
}

function saveCachedDashboardConfig(config) {
  try {
    sessionStorage.setItem(DASHBOARD_CONFIG_CACHE_KEY, JSON.stringify({ ts: Date.now(), config }));
  } catch {}
}

export function normalizeDashboardConfig(config = {}) {
  const normalized = {
    ...config,
    groups: normalizeGroups(config.groups || []),
    games: normalizeGames(config.games || []),
  };
  return {
    ...normalized,
    schemaVersion: 3,
    catalog: normalized.catalog || buildLegacyDashboardCatalog(normalized.groups, normalized.games),
  };
}

export function mergeDashboardCatalog(localConfig, catalog) {
  return {
    ...localConfig,
    schemaVersion: 3,
    catalog,
  };
}

export function isJsonLessonUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    return new URL(raw, "https://booong.local/").pathname.toLowerCase().endsWith(".json");
  } catch {
    return false;
  }
}

export function createWorkMap(groups = [], games = [], resources = []) {
  const map = new Map();
  groups.forEach(group => {
    if (normalizeKind(group.kind) === "game") {
      const href = getGameWorkHref(group);
      map.set(`game:${group.id}`, {
        type: "game",
        id: group.id,
        label: group.tag || "게임",
        title: stripHtml(group.title),
        groupTitle: stripHtml(group.discipline || group.subject || "게임"),
        units: getWorkUnits(group),
        href: href || "#",
        external: /^https?:\/\//i.test(href),
        makers: getGroupMakers(group),
      });
      return;
    }

    const href = getGroupWorkHref(group);
    map.set(`lesson:${group.id}`, {
      type: "lesson",
      id: group.id,
      label: group.subject || group.discipline || "수업",
      title: stripHtml(group.title) || "수업",
      groupTitle: stripHtml(group.discipline || group.subject || "수업"),
      units: getWorkUnits(group),
      href: href || "#",
      external: /^https?:\/\//i.test(href),
      makers: getGroupMakers(group),
    });
  });
  games.forEach(game => {
    map.set(`game:${game.id}`, {
      type: "game",
      id: game.id,
      label: game.tag || "게임",
      title: stripHtml(game.title),
      groupTitle: "게임",
      units: getWorkUnits(game),
      href: game.link || "#",
      external: true,
      makers: normalizeMakers(game.makers),
    });
  });
  resources.forEach(resource => {
    const type = normalizeKind(resource.kind) === "game" ? "game" : "lesson";
    const action = (resource.actions || []).find(item => item?.href);
    const href = action?.href || "#";
    map.set(`${type}:${resource.id}`, {
      type,
      id: resource.id,
      label: resource.discipline || (type === "game" ? "게임" : "수업"),
      title: stripHtml(resource.title),
      groupTitle: stripHtml(resource.discipline || resource.sourceUnitName || (type === "game" ? "게임" : "수업")),
      units: (resource.unitKeys || []).map(key => String(key).split("::").pop()).filter(Boolean),
      href,
      external: action?.external ?? /^https?:\/\//i.test(href),
      makers: normalizeMakers(resource.makers),
    });
  });
  return map;
}

function getGroupMakers(group) {
  const lessonMakers = (group.lessons || [])
    .flatMap(lesson => normalizeMakers(lesson.makers || lesson.maker));
  const linkMakers = (group.links || [])
    .flatMap(link => normalizeMakers(link.makers || link.maker));
  return unique([
    ...normalizeMakers(group.makers || group.maker),
    ...lessonMakers,
    ...linkMakers,
  ]);
}

function getWorkUnits(item) {
  const majorUnits = splitSheetList(item.majorUnit || item["대단원"]);
  return unique(majorUnits.length ? majorUnits : splitSheetList(item.middleUnit || item["중단원"]));
}

function getGroupWorkHref(group) {
  const zeroHref = normalizeInternalPageHref(group.zeroSession?.link || group.zeroSession?.href || "");
  if (zeroHref) return zeroHref;

  const firstLesson = (group.lessons || []).find(lesson => lesson.link || lesson.href || lesson.id);
  if (!firstLesson) return "";

  return normalizeInternalPageHref(
    firstLesson.link || firstLesson.href || `?lesson=${encodeURIComponent(firstLesson.id)}`
  );
}

function getGameWorkHref(group) {
  const ownHref = group.link || group.href || "";
  if (ownHref) return ownHref;

  const firstLink = (group.links || []).find(link => link.link || link.href);
  return firstLink ? firstLink.link || firstLink.href || "" : "";
}

function normalizeInternalPageHref(href) {
  const value = String(href || "").trim();
  if (!value) return "";
  if (value.startsWith("?")) return `index.html${value}`;
  return value;
}

export function createMakerWorkMap(workMap, members = []) {
  const aliasMap = createMemberAliasMap(members);
  const makerMap = new Map();

  workMap.forEach(work => {
    normalizeMakers(work.makers).forEach(rawMaker => {
      const memberId = resolveMemberId(rawMaker, aliasMap);
      if (!memberId) return;
      if (!makerMap.has(memberId)) makerMap.set(memberId, []);
      makerMap.get(memberId).push(work);
    });
  });

  const worksByLookup = new Map();
  workMap.forEach(work => {
    [work.id, work.title].map(normalizeMakerKey).filter(Boolean).forEach(key => worksByLookup.set(key, work));
  });
  members.forEach(member => {
    const memberId = normalizeMakerKey(member?.id);
    if (!memberId) return;
    (member.making || []).map(normalizeMakerKey).filter(Boolean).forEach(key => {
      const work = worksByLookup.get(key);
      if (!work) return;
      if (!makerMap.has(memberId)) makerMap.set(memberId, []);
      if (!makerMap.get(memberId).some(item => item.type === work.type && item.id === work.id)) makerMap.get(memberId).push(work);
    });
  });

  return makerMap;
}

export function getMemberLookupKeys(member) {
  return [
    member?.id,
    member?.code,
    member?.maker,
    ...(Array.isArray(member?.aliases) ? member.aliases : []),
  ].map(normalizeMakerKey).filter(Boolean);
}

export function normalizeMakers(value) {
  if (Array.isArray(value)) return unique(value.map(normalizeMakerKey).filter(Boolean));
  return unique(String(value || "")
    .split(/[,\n;/|]+/)
    .map(normalizeMakerKey)
    .filter(Boolean));
}

export function buildDashboardCatalog(groupRows = [], unitRows = []) {
  const diagnostics = { unknownUnitCodes: [], duplicateUnitCodes: [], duplicateResourceIds: [] };
  const unitsByCode = new Map();
  const unitsByKey = new Map();
  const subjectsByValue = new Map();

  unitRows.forEach(row => {
    const code = normalizeUnitCode(row["단원_코드"]);
    if (code == null) return;
    if (unitsByCode.has(code)) {
      diagnostics.duplicateUnitCodes.push(code);
      return;
    }

    const subject = String(row["과목"] || "").trim();
    const school = SCHOOL_BY_SUBJECT[subject];
    unitsByCode.set(code, school ? { code, subject, school, majorUnit: String(row["대단원"] || "").trim(), middleUnit: String(row["중단원"] || "").trim() } : null);
    if (!school) return;

    if (!subjectsByValue.has(subject)) {
      subjectsByValue.set(subject, { school, value: subject, label: SUBJECT_LABELS[subject] || subject, order: subjectsByValue.size });
    }
    const key = `${subject}::${String(row["대단원"] || "").trim()}`;
    if (!unitsByKey.has(key)) {
      unitsByKey.set(key, { key, school, subject, title: String(row["대단원"] || "").trim(), order: unitsByKey.size, codes: [], middleUnits: [] });
    }
    const unit = unitsByKey.get(key);
    unit.codes.push(code);
    const middleUnit = String(row["중단원"] || "").trim();
    if (middleUnit) unit.middleUnits.push(middleUnit);
  });

  const resourceIds = new Set();
  const resources = [];
  groupRows.forEach(row => {
    const title = String(row.group_title || "").trim();
    if (!title || !isPublished(row.published)) return;
    const unitCodes = splitSheetList(row["단원_코드"]).map(normalizeUnitCode).filter(code => code != null);
    const id = createResourceId(title, unitCodes);
    if (resourceIds.has(id)) {
      diagnostics.duplicateResourceIds.push(id);
      return;
    }
    resourceIds.add(id);

    const joinedUnits = [];
    unitCodes.forEach(code => {
      const unit = unitsByCode.get(code);
      if (!unit) {
        if (!diagnostics.unknownUnitCodes.includes(code)) diagnostics.unknownUnitCodes.push(code);
        return;
      }
      joinedUnits.push(unit);
    });
    const subjects = unique(joinedUnits.map(unit => unit.subject));
    const schools = unique([...joinedUnits.map(unit => unit.school), ...splitSheetList(row.school)]);
    const unitKeys = unique(joinedUnits.map(unit => `${unit.subject}::${unit.majorUnit}`));
    const makers = normalizeMakers(row.maker);
    const actions = [
      createResourceAction("teacher", "교사용 자료", row.teacher_link),
      createResourceAction("worksheet", "활동지", row.worksheet_link),
    ].filter(Boolean);
    const sourceUnitName = String(row["단원명"] || "").trim();
    resources.push({
      id,
      title,
      desc: String(row.desc || "").trim(),
      sourceUnitName,
      kind: normalizeKind(row.kind),
      discipline: String(row.discipline || "").trim(),
      makers,
      isNew: normalizeNewFlag(getNewFlagValue(row)),
      unitCodes,
      unitKeys,
      subjects,
      schools,
      actions,
      searchText: [title, row.desc, row.discipline, ...subjects, ...joinedUnits.flatMap(unit => [unit.majorUnit, unit.middleUnit]), sourceUnitName, ...makers]
        .filter(Boolean).join(" ").normalize("NFKC").toLowerCase(),
    });
  });

  const visibleSubjects = new Set(resources.flatMap(resource => resource.subjects));
  return { subjects: [...subjectsByValue.values()].filter(subject => visibleSubjects.has(subject.value)), units: [...unitsByKey.values()], resources, diagnostics };
}

export function buildLegacyDashboardCatalog(groups = [], games = []) {
  const unitsByKey = new Map();
  const subjectsByValue = new Map();
  const resourceIds = new Set();
  const resources = [];

  [...groups, ...games].forEach((item, order) => {
    const title = String(item?.title || "").trim();
    if (!title) return;
    const subjects = splitSheetList(item.subject);
    const schools = splitSheetList(item.school);
    const majorUnits = splitSheetList(item.majorUnit || item["대단원"]);
    const middleUnits = splitSheetList(item.middleUnit || item["중단원"]);
    const unitSubjects = subjects.length ? subjects : [""];
    const unitTitles = majorUnits.length ? majorUnits : ["단원 미지정"];
    const unitKeys = unique(unitSubjects.flatMap(subject => unitTitles.map(title => `${subject}::${title}`)));
    const schoolsBySubject = new Map(unitSubjects.map((subject, index) => [
      subject,
      schools[index] || schools[0] || SCHOOL_BY_SUBJECT[subject] || "기타",
    ]));

    unitSubjects.filter(Boolean).forEach(subject => {
      if (!subjectsByValue.has(subject)) {
        subjectsByValue.set(subject, { school: schoolsBySubject.get(subject), value: subject, label: SUBJECT_LABELS[subject] || subject, order: subjectsByValue.size });
      }
    });
    unitKeys.forEach((key, index) => {
      if (!unitsByKey.has(key)) {
        const [subject, title] = key.split("::");
        unitsByKey.set(key, { key, school: schoolsBySubject.get(subject) || "기타", subject, title, order: unitsByKey.size, codes: [], middleUnits: [] });
      }
      const middleUnit = middleUnits[index] || (middleUnits.length === 1 ? middleUnits[0] : "");
      if (middleUnit && !unitsByKey.get(key).middleUnits.includes(middleUnit)) unitsByKey.get(key).middleUnits.push(middleUnit);
    });

    const id = createResourceId(title, [order]);
    if (resourceIds.has(id)) return;
    resourceIds.add(id);
    const kind = normalizeKind(item.kind);
    const actions = [
      createResourceAction("teacher", kind === "game" ? "게임 열기" : "교사용 자료", kind === "game" ? getGameWorkHref(item) : getGroupWorkHref(item)),
      createResourceAction("worksheet", "활동지", item.worksheet),
    ].filter(Boolean);
    const makers = normalizeMakers(item.makers || item.maker);
    resources.push({
      id,
      title,
      desc: String(item.desc || "").trim(),
      sourceUnitName: "",
      kind,
      discipline: String(item.discipline || "").trim(),
      makers,
      isNew: normalizeNewFlag(item.isNew ?? item.new),
      unitCodes: [],
      unitKeys,
      subjects,
      schools: unique(unitKeys.map(key => unitsByKey.get(key)?.school).filter(Boolean)),
      actions,
      searchText: [title, item.discipline, ...subjects, ...majorUnits, ...middleUnits, ...makers].filter(Boolean).join(" ").normalize("NFKC").toLowerCase(),
    });
  });

  return { subjects: [...subjectsByValue.values()], units: [...unitsByKey.values()], resources, diagnostics: { unknownUnitCodes: [], duplicateUnitCodes: [], duplicateResourceIds: [] } };
}

function normalizeUnitCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const code = Number(raw);
  return Number.isSafeInteger(code) && code >= 0 ? code : null;
}

function splitSheetList(value) {
  return String(value || "").split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);
}

function createResourceId(title, unitCodes) {
  const slug = String(title || "resource")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  // ponytail: 동일 제목+단원코드는 중복 행으로 취급한다. 합법적 중복이 필요해지면 DB에 resource_id 열을 추가한다.
  return ["resource", slug || "untitled", ...unitCodes].join("-");
}

function createResourceAction(key, label, value) {
  const href = normalizeActionHref(value);
  return href ? { key, label, href, external: /^https?:\/\//i.test(href) } : null;
}

function normalizeActionHref(value) {
  const href = String(value || "").trim();
  if (!href || /^[\\/]{2}/.test(href)) return "";
  const scheme = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  try {
    if (scheme) return ["http", "https"].includes(scheme) ? new URL(href).href : "";
    const base = new URL("https://booong.local/");
    return new URL(href, base).origin === base.origin ? href : "";
  } catch {
    return "";
  }
}

async function loadSheetDashboardCatalog() {
  const [groupText, unitText] = await Promise.all([
    fetchSheetText(DASHBOARD_SHEET_URLS.groups),
    fetchSheetText(DASHBOARD_SHEET_URLS.units),
  ]);
  return buildDashboardCatalog(csvToObjects(groupText), csvToObjects(unitText));
}

async function fetchSheetText(url) {
  const res = await fetch(`${url}&_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function csvToObjects(text) {
  const rows = parseCSV(text).filter(row => row.some(cell => String(cell || "").trim()));
  const headers = (rows.shift() || []).map(normalizeHeader);
  return rows.map(row => {
    const out = {};
    headers.forEach((header, index) => {
      if (!header) return;
      out[header] = normalizeSheetText(row[index] || "");
    });
    return out;
  });
}

function normalizeGroups(groups) {
  return groups.map(group => {
    const makers = normalizeMakers(group.makers || group.maker);
    return {
      ...group,
      kind: normalizeKind(group.kind),
      makers,
      majorUnit: normalizeUnitText(group.majorUnit || group["대단원"]),
      middleUnit: normalizeUnitText(group.middleUnit || group["중단원"]),
      isNew: normalizeNewFlag(group.isNew ?? group.new),
      lessons: (group.lessons || []).map(lesson => {
        const lessonMakers = normalizeMakers(lesson.makers || lesson.maker);
        const rowLink = lesson.link || lesson.href || "";
        const sourceUrl = lesson.sourceUrl || (isJsonLessonUrl(rowLink) ? rowLink : "") || (isJsonLessonUrl(lesson.jsonPath) ? lesson.jsonPath : "");
        return {
          ...lesson,
          link: isJsonLessonUrl(rowLink) ? "" : lesson.link,
          href: isJsonLessonUrl(rowLink) ? "" : lesson.href,
          sourceUrl,
          makers: lessonMakers.length ? lessonMakers : makers,
        };
      }),
    };
  });
}

function normalizeGames(games) {
  return games.map(game => ({
    ...game,
    kind: "game",
    makers: normalizeMakers(game.makers || game.maker),
    majorUnit: normalizeUnitText(game.majorUnit || game["대단원"]),
    middleUnit: normalizeUnitText(game.middleUnit || game["중단원"]),
    isNew: normalizeNewFlag(game.isNew ?? game.new),
  }));
}

function createMemberAliasMap(members) {
  const map = new Map();
  members.forEach(member => {
    const id = normalizeMakerKey(member?.id);
    if (!id) return;
    getMemberLookupKeys(member).forEach(key => map.set(key, id));
  });
  return map;
}

function resolveMemberId(maker, aliasMap) {
  const key = normalizeMakerKey(maker);
  return aliasMap.get(key) || key;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeSheetText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function normalizeUnitText(value) {
  return String(value || "").trim();
}

function getNewFlagValue(row = {}) {
  return row.new ?? row["new!"] ?? row.new_flag ?? row.is_new ?? "";
}

function normalizeNewFlag(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "new", "checked", "check", "on", "o", "예", "네", "체크"].includes(normalized);
}

function isPublished(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "공개"].includes(normalized);
}

function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return value === "game" ? "game" : "lesson";
}

function normalizeMakerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}
