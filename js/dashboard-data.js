import { parseCSV } from "./api.js";

const DASHBOARD_SHEET_URLS = {
  groups: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1091433397&single=true&output=csv",
  lessons: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=0&single=true&output=csv",
};

const DASHBOARD_CONFIG_CACHE_KEY = "booong-dashboard-config-v2";
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

  let config = await loadLocalDashboardConfig();

  try {
    const sheetGroups = await loadSheetLessonGroups();
    if (sheetGroups.length) {
      config = {
        ...config,
        groups: sheetGroups,
        games: [],
      };
    }
  } catch (err) {
    console.warn("Sheet lesson list load failed, using lessons/index.json:", err);
  }

  const normalized = normalizeDashboardConfig(config);
  if (useCache) saveCachedDashboardConfig(normalized);
  return normalized;
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
  return {
    ...config,
    groups: normalizeGroups(config.groups || []),
    games: normalizeGames(config.games || []),
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

export function createWorkMap(groups = [], games = []) {
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
      href: game.link || "#",
      external: true,
      makers: normalizeMakers(game.makers),
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
    if (middleUnit && !unit.middleUnits.includes(middleUnit)) unit.middleUnits.push(middleUnit);
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
      searchText: [title, row.discipline, ...subjects, ...joinedUnits.flatMap(unit => [unit.majorUnit, unit.middleUnit]), sourceUnitName, ...makers]
        .filter(Boolean).join(" ").normalize("NFKC").toLowerCase(),
    });
  });

  return { subjects: [...subjectsByValue.values()], units: [...unitsByKey.values()], resources, diagnostics };
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
  const href = String(value || "").trim();
  return href ? { key, label, href, external: /^https?:\/\//i.test(href) } : null;
}

async function loadSheetLessonGroups() {
  const [groupText, lessonText] = await Promise.all([
    fetchSheetText(DASHBOARD_SHEET_URLS.groups),
    fetchSheetText(DASHBOARD_SHEET_URLS.lessons),
  ]);
  const groupRows = csvToObjects(groupText);
  const lessonRows = csvToObjects(lessonText);
  return buildLessonGroups(groupRows, lessonRows);
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

function buildLessonGroups(groupRows, lessonRows) {
  const groupsById = new Map(groupRows.map(row => [row.group_id, row]));
  const publishedLessons = lessonRows
    .filter(row => row.lesson_id && row.group_id && isPublished(row.published))
    .sort(compareByOrder)
    .map(row => {
      const groupRow = groupsById.get(row.group_id) || {};
      const lessonMakers = normalizeMakers(row.maker);
      return {
        id: row.lesson_id,
        groupId: row.group_id,
        label: row.label || "차시",
        title: row.lesson_title || "수업",
        desc: row.desc || "",
        jsonPath: row.json_path || "",
        link: getExternalLessonRowLink(row),
        sourceUrl: getLessonRowSourceUrl(row),
        order: parseOrder(row.order),
        makers: lessonMakers.length ? lessonMakers : normalizeMakers(groupRow.maker),
      };
    });

  const lessonsByGroup = publishedLessons.reduce((acc, lesson) => {
    if (!acc[lesson.groupId]) acc[lesson.groupId] = [];
    return acc;
  }, {});

  publishedLessons.forEach(lesson => {
    if (!lessonsByGroup[lesson.groupId]) lessonsByGroup[lesson.groupId] = [];
    lessonsByGroup[lesson.groupId].push(pruneEmpty({
      id: lesson.id,
      label: lesson.label,
      title: lesson.title,
      desc: lesson.desc,
      link: getLessonLink(lesson),
      href: lesson.link,
      jsonPath: lesson.jsonPath,
      sourceUrl: lesson.sourceUrl,
      makers: lesson.makers,
    }));
  });

  return groupRows
    .filter(row => row.group_id && isPublished(row.published))
    .sort(compareByOrder)
    .map(row => {
      const kind = normalizeKind(row.kind);
      const lessons = lessonsByGroup[row.group_id] || [];
      return pruneEmpty({
        id: row.group_id,
        kind,
        discipline: row.discipline,
        subject: row.subject,
        school: row.school,
        majorUnit: row["대단원"],
        middleUnit: row["중단원"],
        title: row.group_title || (kind === "game" ? "게임" : "수업"),
        desc: row.desc || "",
        tag: kind === "game" ? "게임" : "",
        link: row.game_link || row.main_link || "",
        worksheet: row.worksheet_link || "",
        isNew: normalizeNewFlag(getNewFlagValue(row)),
        makers: normalizeMakers(row.maker),
        zeroSession: kind === "lesson" ? {
          label: "0차시",
          title: "지도안 및 수업자료",
          desc: "수업 지도안과 현장 읽기 자료",
          link: row.teacher_link || "",
        } : null,
        lessons: kind === "lesson" ? lessons : [],
        links: kind === "game" ? lessons : [],
      });
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

function getLessonLink(lesson) {
  if (lesson.link) return lesson.link;
  if (lesson.id) return `?lesson=${encodeURIComponent(lesson.id)}`;
  if (!lesson.jsonPath) return "";
  const match = lesson.jsonPath.match(/(?:^|\/)([^/]+)\.json$/i);
  return match ? `?lesson=${encodeURIComponent(match[1])}` : "";
}

function getLessonRowLink(row) {
  return row.link_url || row.link || row.href || row.url || row.game_link || row.main_link || "";
}

function getExternalLessonRowLink(row) {
  const link = getLessonRowLink(row);
  return isJsonLessonUrl(link) ? "" : link;
}

function getLessonRowSourceUrl(row) {
  const link = getLessonRowLink(row);
  if (isJsonLessonUrl(link)) return link;
  return isJsonLessonUrl(row.json_path) ? row.json_path : "";
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

function compareByOrder(a, b) {
  return parseOrder(a.order) - parseOrder(b.order);
}

function parseOrder(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return value === "game" ? "game" : "lesson";
}

function normalizeMakerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function pruneEmpty(value) {
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    if (child === "" || child == null) return;
    if (Array.isArray(child) && !child.length) return;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const pruned = pruneEmpty(child);
      if (Object.keys(pruned).length) out[key] = pruned;
      return;
    }
    out[key] = child;
  });
  return out;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}
