import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../js/thumbnail-editor.js", import.meta.url), "utf8");
let account = "admin-a", requests = [], respond;
const context = vm.createContext({ URLSearchParams,
  adminAccountId: () => account,
  adminFetch: async (url, options) => { requests.push({ url, options }); return respond(); },
});
vm.runInContext(source.replace(/^import .*;\n/gm, "").replace(/^export /gm, ""), context);
respond = () => ({ ok: true, json: async () => ({ thumbnails: { lesson: { revision: "version-1" } } }) });
assert.equal((await context.readThumbnailRecords()).lesson.revision, "version-1");
assert.equal(requests.at(-1).url, "/api/lesson-thumbnails?admin=1");
const image = { type: "image/webp" };
respond = () => ({ ok: true, json: async () => ({ thumbnail: { revision: "version-2", url: "/new.webp" } }) });
const record = await context.saveThumbnail("lesson", image, false, "version-1");
assert.equal(record.revision, "version-2");
assert.equal(requests.at(-1).options.method, "POST");
assert.equal(requests.at(-1).options.headers["Content-Type"], "image/webp");
assert.equal(requests.at(-1).options.body, image);
assert.match(requests.at(-1).url, /id=lesson&revision=version-1$/);
await context.saveThumbnail("lesson", null, true, "version-2");
assert.match(requests.at(-1).url, /restore=1/);
assert.equal(requests.at(-1).options.body, undefined);
respond = () => ({ ok: false, status: 409, json: async () => ({ error: "다른 관리자가 수정했습니다." }) });
await assert.rejects(context.saveThumbnail("lesson", image, false, "stale"), error => error.status === 409);
respond = () => ({ ok: true, json: async () => { account = "admin-b"; return { thumbnail: { revision: "version-3" } }; } });
await assert.rejects(context.saveThumbnail("lesson", image, false, "version-2", "admin-a"), /계정이 변경/);
account = "admin-a";
respond = () => ({ ok: true, json: async () => { account = "admin-b"; return { thumbnails: {} }; } });
await assert.rejects(context.readThumbnailRecords("admin-a"), /계정이 변경/);
const requestCount = requests.length;
await assert.rejects(context.saveThumbnail("lesson", image, false, "version-2", "admin-a"), /계정이 변경/);
await assert.rejects(context.readThumbnailRecords("admin-a"), /계정이 변경/);
assert.equal(requests.length, requestCount, "A stale account never starts a new request");
account = "admin-a";
respond = () => ({ ok: false, json: async () => ({ error: "연결 실패" }) });
await assert.rejects(context.readThumbnailRecords(), /연결 실패/);

const lessonSource = await readFile(new URL("../js/lesson-admin.js", import.meta.url), "utf8");
assert.match(lessonSource, /openThumbnailEditor/);
assert.doesNotMatch(lessonSource, /href="thumbnail-admin/);
assert.match(lessonSource, /data-lesson-thumbnail/);
assert.match(lessonSource, /썸네일을 저장했습니다/);
assert.match(lessonSource, /data-restore-lesson-thumbnail/);
const gallerySource = await readFile(new URL("../js/thumbnail-admin.js", import.meta.url), "utf8");
assert.match(gallerySource, /openThumbnailEditor/);
assert.doesNotMatch(gallerySource, /function thumbnailCrop|canvas\.getContext/);
const html = await readFile(new URL("../lesson-admin.html", import.meta.url), "utf8");
assert.match(html, /css\/thumbnail-admin.css/);
assert.match(source, /encodeThumbnail\(canvas\)/);
assert.match(source, /onSaved\(saved\)/);
assert.match(source, /dialog\.addEventListener\("cancel"/);
console.log("Shared thumbnail editing: upload/restore requests, revisions, account isolation and both admin entry points passed.");
