import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { buildDashboardCatalog, createResourceId, loadSheetDashboardRows } from "../js/dashboard-data.js";
import { validThumbnailId } from "./thumbnail-store.js";

export class CatalogError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const conflict = () => new CatalogError(409, "다른 관리자가 목록을 수정했습니다. 새로고침한 뒤 다시 저장해주세요.");
const path = "booong-lessons/catalog.json";
const fields = { group_title: 200, desc: 10000, maker: 500, discipline: 100, school: 100, 단원명: 300,
  단원_코드: 3000, blog_link: 2000, teacher_link: 2000, dorms_link: 2000, thumbnail_url: 2000, thumbnail_alt: 500 };
export const lessonPublished = row => ["true", "1", "yes", "y", "공개"].includes(String(row.published || "").trim().toLowerCase());
export const lessonUnitCodes = row => String(row["단원_코드"] || "").split(/[,;\n]+/).filter(x => x.trim()).map(x => Number(x.trim())).filter(x => Number.isSafeInteger(x) && x >= 0);

export function importCatalogRows(rows, unitRows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000 || !Array.isArray(unitRows) || !unitRows.length) throw new CatalogError(400, "수업·단원 시트 내용을 확인해주세요.");
  const ids = new Set();
  const normalized = rows.filter(row => String(row.group_title || "").trim()).map(row => {
    const id = createResourceId(row.resource_id || row.group_id, row.group_title, lessonUnitCodes(row));
    if (!validThumbnailId(id) || ids.has(id)) throw new CatalogError(400, "수업 ID가 중복되거나 올바르지 않습니다. 시트를 확인해주세요.");
    ids.add(id);
    return { ...row, resource_id: id };
  });
  if (!normalized.length) throw new CatalogError(400, "가져올 수업이 없습니다.");
  const catalog = buildDashboardCatalog(normalized, unitRows);
  if (catalog.diagnostics.duplicateUnitCodes.length || catalog.diagnostics.unknownUnitCodes.length) throw new CatalogError(400, "단원 코드가 중복되거나 단원표에 없습니다. 시트를 확인해주세요.");
  return { rows: normalized, unitRows };
}

export function updateLesson(state, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CatalogError(400, "수업 내용을 확인해주세요.");
  const current = state.rows.find(row => row.resource_id === input.resource_id);
  const id = input.resource_id || `lesson-${randomUUID()}`;
  if (!validThumbnailId(id) || (!current && input.resource_id)) throw new CatalogError(400, "수업 ID를 확인해주세요.");
  const row = { ...current, resource_id: id };
  for (const [key, max] of Object.entries(fields)) {
    if (typeof input[key] !== "string" || input[key].length > max) throw new CatalogError(400, `${key === "group_title" ? "수업 제목" : "입력 내용"}을 확인해주세요.`);
    row[key] = input[key].trim();
  }
  if (!row.group_title || !["lesson", "game"].includes(input.kind) || !["TRUE", "FALSE"].includes(input.published) || !["TRUE", "FALSE"].includes(input.new)) throw new CatalogError(400, "제목·자료 유형·공개 여부를 확인해주세요.");
  Object.assign(row, { kind: input.kind, published: input.published, new: input.new });
  for (const key of ["blog_link", "teacher_link", "dorms_link", "thumbnail_url"]) {
    const value = row[key];
    if (!value) continue;
    if (/[\s\\\u0000-\u001f]/.test(value) || value.startsWith("//")) throw new CatalogError(400, "링크 주소를 확인해주세요.");
    let url;
    try { url = new URL(value, "https://booong.invalid/"); } catch { throw new CatalogError(400, "링크 주소를 확인해주세요."); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new CatalogError(400, "http 또는 https 링크를 입력해주세요.");
  }
  const rawCodes = row["단원_코드"].split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  const codes = lessonUnitCodes(row);
  const known = new Set(state.unitRows.map(unit => Number(unit["단원_코드"])));
  if (codes.length !== rawCodes.length || codes.some(code => !known.has(code)) || (lessonPublished(row) && !codes.length)) throw new CatalogError(400, "수업에 맞는 단원을 선택해주세요.");
  row["단원_코드"] = [...new Set(codes)].join(",");
  return { ...state, rows: current ? state.rows.map(item => item.resource_id === id ? row : item) : [...state.rows, row] };
}

export function createLessonCatalogStore({ directory, token, readSheets = loadSheetDashboardRows } = {}) {
  let queue = Promise.resolve();
  const options = () => ({ token, access: "private" });
  async function load() {
    if (directory) {
      try { return { state: JSON.parse(await readFile(join(directory, "catalog.json"), "utf8")) }; }
      catch (error) { if (error.code === "ENOENT") return { state: null }; throw error; }
    }
    if (!token) throw new CatalogError(503, "수업 저장소를 연결해주세요.");
    const result = await get(path, { ...options(), useCache: false, headers: { "accept-encoding": "identity" } });
    if (!result) return { state: null };
    if (result.statusCode !== 200) throw new Error("Catalog store unavailable");
    return { state: await new Response(result.stream).json(), etag: result.blob.etag };
  }
  async function mutate(input) {
    const { state, etag } = await load();
    if ((state?.revision || null) !== input.revision) throw conflict();
    let next;
    if (input.action === "import") {
      if (state) throw new CatalogError(409, "이미 시트를 가져왔습니다. 관리자 화면에서 수업을 수정해주세요.");
      const { rows, unitRows } = await readSheets();
      next = { ...importCatalogRows(rows, unitRows), importedAt: new Date().toISOString() };
    } else {
      if (input.action !== "save" || !state) throw new CatalogError(400, "먼저 기존 시트를 가져와주세요.");
      if (state.rows.length >= 5000 && !input.lesson?.resource_id) throw new CatalogError(400, "수업은 최대 5,000개까지 등록할 수 있습니다.");
      next = updateLesson(state, input.lesson);
    }
    next.revision = randomUUID();
    if (Buffer.byteLength(JSON.stringify(next)) > 8 * 1024 * 1024) throw new CatalogError(413, "수업 목록이 너무 큽니다.");
    if (directory) {
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `${randomUUID()}.json`);
      await writeFile(temporary, JSON.stringify(next));
      await rename(temporary, join(directory, "catalog.json"));
    } else {
      try {
        // shortcut: one catalog for infrequent edits; use per-record storage if concurrent editing grows.
        await put(path, JSON.stringify(next), { ...options(), contentType: "application/json", addRandomSuffix: false,
          ...(etag ? { ifMatch: etag } : { allowOverwrite: false }) });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) throw conflict();
        throw error;
      }
    }
    return next;
  }
  return { load, mutate(input) {
    const task = queue.then(() => mutate(input));
    queue = task.catch(() => {});
    return task;
  } };
}
