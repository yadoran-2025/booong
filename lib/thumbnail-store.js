import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, THUMBNAIL_MAX_BYTES, THUMBNAIL_MIME_TYPE } from "../js/thumbnail-data.js";

const manifestPath = "booong-thumbnails/manifest.json";
export const validThumbnailId = id => typeof id === "string" && /^[\p{L}\p{N}_-]{1,240}$/u.test(id) && !["__proto__", "constructor", "prototype"].includes(id);
export const validImageId = id => typeof id === "string" && /^[0-9a-f-]{36}\.(?:png|webp)$/.test(id);

export class ThumbnailError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateThumbnailWebp(bytes) {
  const invalid = () => new ThumbnailError(400, "800×500 WebP 이미지를 사용해주세요. 최대 크기는 2MB입니다.");
  if (!Buffer.isBuffer(bytes) || bytes.length < 30 || bytes.length > THUMBNAIL_MAX_BYTES
    || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP"
    || bytes.readUInt32LE(4) + 8 !== bytes.length) throw invalid();
  let width, height, canvasWidth, canvasHeight, frames = 0;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw invalid();
    const type = bytes.toString("latin1", offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    const end = start + size + (size % 2);
    if (end > bytes.length || type === "ANIM" || type === "ANMF") throw invalid();
    if (type === "VP8X") {
      if (size !== 10 || canvasWidth || (bytes[start] & 2)) throw invalid();
      canvasWidth = bytes.readUIntLE(start + 4, 3) + 1;
      canvasHeight = bytes.readUIntLE(start + 7, 3) + 1;
    } else if (type === "VP8 ") {
      if (size < 10 || (bytes[start] & 1) || bytes.toString("hex", start + 3, start + 6) !== "9d012a") throw invalid();
      width = bytes.readUInt16LE(start + 6) & 0x3fff;
      height = bytes.readUInt16LE(start + 8) & 0x3fff;
      frames++;
    } else if (type === "VP8L") {
      if (size < 5 || bytes[start] !== 0x2f || (bytes[start + 4] >> 5)) throw invalid();
      const dimensions = bytes.readUInt32LE(start + 1);
      width = (dimensions & 0x3fff) + 1;
      height = ((dimensions >>> 14) & 0x3fff) + 1;
      frames++;
    }
    offset = end;
  }
  if (frames !== 1 || width !== THUMBNAIL_WIDTH || height !== THUMBNAIL_HEIGHT
    || (canvasWidth && (canvasWidth !== width || canvasHeight !== height))) throw invalid();
}

export function nextThumbnailRecord(current, expectedRevision, url, restore = false) {
  if ((current?.revision || null) !== expectedRevision) throw new ThumbnailError(409, "다른 곳에서 수정했습니다. 목록을 새로고침한 뒤 다시 저장해주세요.");
  if (restore && !current) throw new ThumbnailError(400, "복원할 이전 이미지가 없습니다.");
  // shortcut: keep one previous image; add a version picker if full history is needed.
  return { url: restore ? current.previousUrl : url, previousUrl: current?.url || null, revision: randomUUID() };
}

export function createThumbnailStore({ directory, token } = {}) {
  let queue = Promise.resolve();
  const options = () => ({ token, access: "private" });
  async function load() {
    if (directory) {
      try { return { thumbnails: JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) }; }
      catch (error) { if (error.code === "ENOENT") return { thumbnails: {} }; throw error; }
    }
    if (!token) throw new ThumbnailError(503, "썸네일 저장소를 연결해주세요.");
    const result = await get(manifestPath, { ...options(), useCache: false, headers: { "accept-encoding": "identity" } });
    if (!result) return { thumbnails: {} };
    if (result.statusCode !== 200) throw new Error("Thumbnail store unavailable");
    return { thumbnails: await new Response(result.stream).json(), etag: result.blob.etag };
  }
  async function save(id, expectedRevision, bytes, restore) {
    const state = await load();
    let record = nextThumbnailRecord(state.thumbnails[id], expectedRevision, null, restore);
    if (!restore) {
      validateThumbnailWebp(bytes);
      const name = `${randomUUID()}.webp`;
      if (directory) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, name), bytes, { flag: "wx" });
        record.url = `/api/lesson-thumbnails?image=${name}`;
      } else {
        await put(`booong-thumbnails/images/${name}`, bytes, { ...options(), contentType: THUMBNAIL_MIME_TYPE, addRandomSuffix: false });
        record.url = `/api/lesson-thumbnails?image=${name}`;
      }
    }
    state.thumbnails[id] = record;
    if (directory) {
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `${randomUUID()}.json`);
      await writeFile(temporary, JSON.stringify(state.thumbnails));
      await rename(temporary, join(directory, "manifest.json"));
    } else {
      try {
        // shortcut: one manifest for this gallery; use per-record storage if edits become frequent.
        await put(manifestPath, JSON.stringify(state.thumbnails), { ...options(), contentType: "application/json", addRandomSuffix: false,
          ...(state.etag ? { ifMatch: state.etag } : { allowOverwrite: false }) });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) throw new ThumbnailError(409, "목록이 변경되었습니다. 새로고침한 뒤 다시 저장해주세요.");
        throw error;
      }
    }
    return record;
  }
  return {
    load,
    save(id, revision, bytes, restore = false) {
      if (!validThumbnailId(id)) throw new ThumbnailError(400, "수업 ID를 확인해주세요.");
      const task = queue.then(() => save(id, revision, bytes, restore));
      queue = task.catch(() => {});
      return task;
    },
    async image(name) {
      if (!validImageId(name)) throw new ThumbnailError(404, "이미지를 찾지 못했습니다.");
      if (!directory) {
        if (!token) throw new ThumbnailError(503, "썸네일 저장소를 연결해주세요.");
        const result = await get(`booong-thumbnails/images/${name}`, options());
        if (!result || result.statusCode !== 200) throw new ThumbnailError(404, "이미지를 찾지 못했습니다.");
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      }
      try { return await readFile(join(directory, name)); }
      catch (error) { if (error.code === "ENOENT") throw new ThumbnailError(404, "이미지를 찾지 못했습니다."); throw error; }
    },
  };
}
