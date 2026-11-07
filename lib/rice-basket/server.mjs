import { AsyncLocalStorage } from 'node:async_hooks';
import { createCloudStore } from './cloud-store.mjs';
import { BlobPreconditionFailedError } from '@vercel/blob';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { surveyDefinition, surveyAnswers, surveyResults } from './survey.mjs';
import { WEB_APPS_PAGE_ID, webAppDefinitions } from '../../rice-basket/web-app-config.js';

const requestState = new AsyncLocalStorage();
const blob = await import('@vercel/blob');
const cloudStore = createCloudStore({
  get: (path, options) => blob.get(path, { ...options, token: process.env.RICE_BASKET_BLOB_READ_WRITE_TOKEN }),
  put: (path, body, options) => blob.put(path, body, { ...options, token: process.env.RICE_BASKET_BLOB_READ_WRITE_TOKEN }),
});
const currentStore = () => requestState.getStore().data;
const legacyTypes = ['content', 'video', 'postit', 'redesign', 'compare', 'vote'];
// ponytail: 500 notes per workshop page; paginate if a single workshop needs more.
const boardPageIds = new Set(['page-0a0c2f1d230e', 'page-b6afb8c12a41']);
const surveyPageId = 'page-4a2b86a58156';

function newSession(name, pageIds, gridColumns = 3, blocks = [], school = '', lectureDate = '') {
  return {
    id: crypto.randomBytes(5).toString('hex'), name, school, lectureDate, pageIds: [...pageIds], gridColumns,
    blocks: structuredClone(blocks), currentIndex: 0, votingOpen: false, resultsVisible: false,
    generation: 0, participants: [], notesByPage: {}, createdAt: Date.now(),
  };
}

async function save() { const state = requestState.getStore();return state.storage.save(state); }

function send(res, status, value, extra = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}
function fail(res, status, message) { send(res, status, { error: message }); }
// Public access is an exact method/path allowlist; all other routes fail before storage.
export function isPublicRequest(req) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const id = '[a-zA-Z0-9_-]+';
  if (req.method === 'GET') return new RegExp(`^/api/sessions/${id}(?:/qr)?$`).test(path)
    || (new RegExp(`^/api/pages/${id}$`).test(path) && !!url.searchParams.get('session'))
    || (new RegExp(`^/api/pages/${id}/web-apps/\\d+/qr$`).test(path) && !!url.searchParams.get('session'))
    || new RegExp(`^/api/sessions/${id}/pages/${id}/notes$`).test(path)
    || new RegExp(`^/api/surveys(?:/${id}(?:/results)?)?$`).test(path);
  return req.method === 'POST' && (new RegExp(`^/api/sessions/${id}/(?:join|me|answer)$`).test(path)
    || new RegExp(`^/api/sessions/${id}/pages/${id}/notes$`).test(path)
    || new RegExp(`^/api/surveys/${id}/(?:responses|my-response)$`).test(path));
}
function isAdmin(req) { return req.riceBasketAdmin === true; }
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  fail(res, 401, '관제 화면에 로그인해 주세요.');
  return false;
}
function findSession(id) { return currentStore().sessions.find(session => session.id === id); }
function findPage(id) { return currentStore().pages.find(page => page.id === id); }
function publicPage(page, admin = true) {
  const { notes, ...visible } = page;
  if (!admin && page.id === WEB_APPS_PAGE_ID) visible.webApps = (page.webApps || []).map(({ teacherUrl, thumbnailUrl, ...entry }) => entry);
  return visible;
}
function sessionPages(session, admin = true) { return session.pageIds.map(findPage).filter(Boolean).map(page => publicPage(page, admin)); }
function publicSession(session, admin = true) {
  if (!admin) return { id: session.id, name: session.name, school: session.school || '', lectureDate: session.lectureDate || '', pageIds: session.pageIds, pages: sessionPages(session, false), surveyPageId: findPage(surveyPageId)?.id || null, gridColumns: session.gridColumns, currentIndex: session.currentIndex, generation: session.generation || 0, votingOpen: false, resultsVisible: false, blocks: [], people: [], participantCount: 0, voteCount: 0, counts: {}, recordsVisible: false };
  const people = session.participants.map(({ id, name, initial, redesign }) => ({ id, name, initial, redesign })).filter(p => p.initial || p.redesign);
  const counts = Object.fromEntries(session.participants.reduce((map, person) => map.set(person.vote, (map.get(person.vote) || 0) + (person.vote ? 1 : 0)), new Map()));
  return {
    id: session.id, name: session.name, school: session.school || '', lectureDate: session.lectureDate || '', blocks: session.blocks, pageIds: session.pageIds,
    shortUrl: session.shortUrl || '', pages: sessionPages(session), surveyPageId: findPage(surveyPageId)?.id || null, gridColumns: session.gridColumns, currentIndex: session.currentIndex,
    generation: session.generation || 0, votingOpen: session.votingOpen, resultsVisible: session.resultsVisible,
    people, participantCount: session.participants.length, counts: session.resultsVisible ? counts : {},
    voteCount: session.participants.filter(p => p.vote).length,
  };
}
function validText(value, max = 500) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
function validLectureDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
function validBlock(block) {
  return block && legacyTypes.includes(block.type)
    && validText(block.title, 120) && typeof block.body === 'string' && block.body.length <= 5000
    && (!block.moduleId || (typeof block.moduleId === 'string' && block.moduleId.length <= 100))
    && (!block.moduleTitle || (typeof block.moduleTitle === 'string' && block.moduleTitle.length <= 100))
    && (!block.kicker || (typeof block.kicker === 'string' && block.kicker.length <= 80))
    && (!block.layout || ['plain', 'hero', 'statement', 'cards', 'steps', 'questions'].includes(block.layout))
    && (!block.sourceUrl || (typeof block.sourceUrl === 'string' && /^https:\/\/[^\s]+$/.test(block.sourceUrl)))
    && (!block.prompt || (typeof block.prompt === 'string' && block.prompt.length <= 300))
    && (!block.videoUrl || (typeof block.videoUrl === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(block.videoUrl)));
}
function validPageIds(pageIds) {
  return Array.isArray(pageIds) && pageIds.length >= 1 && pageIds.length <= 30
    && new Set(pageIds).size === pageIds.length && pageIds.every(id => typeof id === 'string' && findPage(id));
}
function blocksForPages(pageIds) {
  return pageIds.flatMap(id => findPage(id).sections.filter(section => legacyTypes.includes(section.type)).map(section => structuredClone(section)));
}
function participant(session, token) {
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  return session.participants.find(person => person.tokenHash === hash);
}
function selectedPageHas(session, pageId, type) {
  return session.pageIds.includes(pageId) && findPage(pageId)?.sections.some(section => section.type === type);
}
async function readJson(req) {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 200_000) throw new Error('요청이 너무 큽니다.');
  }
  return JSON.parse(body || '{}');
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return fail(res, 403, '허용되지 않은 요청입니다.');
    if (parts[0] === 'api' && parts[1] === 'surveys') {
      if (!findPage(surveyPageId)) return fail(res, 404, '설문 페이지를 찾을 수 없습니다.');
      const sessionId = url.searchParams.get('session');
      if (!sessionId) return fail(res, 400, '연수를 먼저 선택해 주세요.');
      if (!findSession(sessionId)) return fail(res, 404, '연수를 찾을 수 없습니다.');
      const admin = isAdmin(req);
      const summarize = survey => ({
        id: survey.id, sessionId: survey.sessionId, title: survey.title, description: survey.description,
        questions: survey.questions, open: survey.open, published: survey.published, shareResults: Boolean(survey.shareResults && (admin || survey.published)),
        total: admin || survey.published && survey.shareResults ? survey.responses.length : 0, revision: survey.revision, version: survey.version,
      });
      if (parts.length === 2) {
        if (req.method === 'GET') return send(res, 200, { surveys: (currentStore().surveys || []).filter(survey => survey.sessionId === sessionId && (admin || survey.published)).map(summarize), admin });
        if (req.method === 'POST') {
          if (!requireAdmin(req, res)) return;
          let definition;
          try { definition = surveyDefinition(await readJson(req)); } catch (error) { if (error instanceof TypeError) return fail(res, 400, error.message); throw error; }
          const survey = { ...definition, id: crypto.randomBytes(8).toString('hex'), sessionId, open: false, published: false, shareResults: true, responses: [], revision: 1, version: 1 };
          (currentStore().surveys ||= []).push(survey); await save();
          return send(res, 201, summarize(survey));
        }
        return fail(res, 405, '지원하지 않는 요청입니다.');
      }
      const survey = (currentStore().surveys || []).find(item => item.id === parts[2]);
      if (!survey || survey.sessionId !== sessionId || (!survey.published && !admin)) return fail(res, 404, '설문을 찾을 수 없습니다.');
      if (parts.length === 3) {
        if (req.method === 'GET') return send(res, 200, { ...summarize(survey), admin });
        if (!requireAdmin(req, res)) return;
        const body = await readJson(req);
        if (req.method === 'PUT') {
          if (body.revision !== survey.revision) return fail(res, 409, '다른 곳에서 설문이 바뀌었습니다. 새로고침한 뒤 다시 수정해 주세요.');
          let definition;
          try { definition = surveyDefinition(body); } catch (error) { if (error instanceof TypeError) return fail(res, 400, error.message); throw error; }
          if (survey.responses.length && JSON.stringify(definition.questions) !== JSON.stringify(survey.questions)) return fail(res, 409, '응답이 있는 설문의 문항은 바꿀 수 없습니다. 새 설문을 만들어 주세요.');
          survey.version++;
          Object.assign(survey, definition);
        } else if (req.method === 'PATCH') {
          if ((body.open !== undefined && typeof body.open !== 'boolean') || (body.shareResults !== undefined && typeof body.shareResults !== 'boolean')) return fail(res, 400, '설문 설정을 확인해 주세요.');
          if (body.open !== undefined) { survey.open = body.open; if (body.open) survey.published = true; }
          if (body.shareResults !== undefined) survey.shareResults = body.shareResults;
        } else return fail(res, 405, '지원하지 않는 요청입니다.');
        survey.revision++; await save();
        return send(res, 200, summarize(survey));
      }
      if (parts.length !== 4) return fail(res, 404, '페이지를 찾을 수 없습니다.');
      if (parts[3] === 'results' && req.method === 'GET') {
        if (!admin && (!survey.published || !survey.shareResults)) return fail(res, 403, '이 설문의 결과는 공개되지 않았습니다.');
        if (url.searchParams.get('revision') === String(survey.revision)) return send(res, 200, { unchanged: true, revision: survey.revision });
        return send(res, 200, surveyResults(survey));
      }
      if (['responses', 'my-response'].includes(parts[3]) && req.method === 'POST') {
        const body = await readJson(req);
        if (typeof body.token !== 'string' || !/^[a-f0-9]{32}$/.test(body.token)) return fail(res, 400, '응답 식별자가 올바르지 않습니다. 페이지를 다시 열어 주세요.');
        const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
        const existing = survey.responses.find(response => response.tokenHash === tokenHash);
        if (parts[3] === 'my-response') return send(res, 200, { answers: existing?.answers || null });
        if (!survey.open) return fail(res, 409, '현재 응답을 받고 있지 않습니다.');
        if (body.version !== survey.version) return fail(res, 409, '설문 문항이 바뀌었습니다. 새로고침한 뒤 다시 응답해 주세요.');
        // shortcut: 1000 responses per survey; move storage to a database for larger surveys.
        if (!existing && survey.responses.length >= 1000) return fail(res, 409, '이 설문의 응답이 가득 찼습니다.');
        let answers;
        try { answers = surveyAnswers(survey, body.answers); } catch (error) { return fail(res, 400, error.message); }
        if (existing) existing.answers = answers;
        else survey.responses.push({ tokenHash, answers });
        survey.revision++; await save();
        return send(res, existing ? 200 : 201, { saved: true });
      }
      return fail(res, 405, '지원하지 않는 요청입니다.');
    }
    if (url.pathname === '/api/admin' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, {
        pages: currentStore().pages,
        sessions: currentStore().sessions.map(s => ({ id: s.id, name: s.name, school: s.school || '', lectureDate: s.lectureDate || '', participants: s.participants.length, slideCount: s.blocks.length, pageCount: s.pageIds.length, gridColumns: s.gridColumns, createdAt: s.createdAt })),
      });
    }
    if (url.pathname === '/api/pages' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, { pages: currentStore().pages });
    }
    if (url.pathname === '/api/pages' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const { title, content } = await readJson(req);
      if (!validText(title, 120)) return fail(res, 400, '내용요소 제목을 120자 이내로 입력해 주세요.');
      if (!validText(content, 20000)) return fail(res, 400, '내용요소 내용을 20000자 이내로 입력해 주세요.');
      const now = Date.now();
      const page = { id: `page-${crypto.randomBytes(6).toString('hex')}`, title: title.trim(), content: content.trim(), description: '', theme: 'sage', experience: 'custom', sections: [], createdAt: now, updatedAt: now };
      currentStore().pages.push(page); await save();
      return send(res, 201, { id: page.id });
    }
    if (url.pathname === '/api/pages/order' && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const { pageIds } = await readJson(req);
      if (!Array.isArray(pageIds) || pageIds.length !== currentStore().pages.length || new Set(pageIds).size !== pageIds.length || pageIds.some(id => !findPage(id))) return fail(res, 400, '현재 내용요소 전체를 한 번씩 포함해 주세요.');
      currentStore().pages = pageIds.map(findPage); await save();
      return send(res, 200, { pages: currentStore().pages });
    }
    if (url.pathname === '/api/pages') return fail(res, 405, '지원하지 않는 요청입니다.');
    if (parts[0] === 'api' && parts[1] === 'pages' && parts[2]) {
      if (!isAdmin(req)) {
        const session = findSession(url.searchParams.get('session'));
        if (!session || (!session.pageIds.includes(parts[2]) && parts[2] !== surveyPageId)) return fail(res, 404, '학습 페이지를 찾을 수 없습니다.');
      }
      const page = findPage(parts[2]);
      if (!page) return fail(res, 404, '학습 페이지를 찾을 수 없습니다.');
      if (page.id === WEB_APPS_PAGE_ID && parts[3] === 'web-apps' && /^\d+$/.test(parts[4] || '') && parts[5] === 'qr' && parts.length === 6 && req.method === 'GET') {
        const entry = page.webApps?.[Number(parts[4])];
        if (!entry) return fail(res, 404, '웹앱을 찾을 수 없습니다.');
        const svg = await QRCode.toString(entry.studentUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320 });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        return res.end(svg);
      }
      if (parts[3]) return fail(res, 404, '페이지를 찾을 수 없습니다.');
      if (req.method === 'GET') return send(res, 200, publicPage(page, isAdmin(req)));
      if (req.method === 'PATCH') {
        if (!requireAdmin(req, res)) return;
        const { title, content, webApps, webAppsRevision } = await readJson(req);
        if (title === undefined && content === undefined && webApps === undefined) return fail(res, 400, '수정할 내용을 입력해 주세요.');
        if (title !== undefined && !validText(title, 120)) return fail(res, 400, '내용요소 제목을 120자 이내로 입력해 주세요.');
        if (content !== undefined && !validText(content, 20000)) return fail(res, 400, '내용요소 내용을 20000자 이내로 입력해 주세요.');
        let nextApps;
        if (webApps !== undefined) {
          if (page.id !== WEB_APPS_PAGE_ID) return fail(res, 400, '웹앱 공유 페이지에서만 설정할 수 있습니다.');
          try { nextApps = webAppDefinitions(webApps); } catch (error) { return fail(res, 400, error.message); }
          if (webAppsRevision !== (page.webAppsRevision || 0)) return fail(res, 409, '다른 곳에서 웹앱 설정이 바뀌었습니다. 새로고침한 뒤 다시 수정해 주세요.');
        }
        if (title !== undefined) page.title = title.trim();
        if (content !== undefined) page.content = content.trim();
        if (nextApps !== undefined) { page.webApps = nextApps;page.webAppsRevision = (page.webAppsRevision || 0) + 1; }
        page.updatedAt = Date.now(); await save();
        return send(res, 200, page);
      }
      if (req.method === 'DELETE') {
        if (!requireAdmin(req, res)) return;
        if (currentStore().sessions.some(session => session.pageIds.includes(page.id))) return fail(res, 409, '수업에서 사용 중인 내용요소입니다. 먼저 수업 구성에서 제외해 주세요.');
        currentStore().pages = currentStore().pages.filter(item => item.id !== page.id); await save();
        return send(res, 200, { ok: true });
      }
      return fail(res, 405, '내용요소는 코드에서 관리합니다.');
    }
    if (url.pathname === '/api/sessions' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJson(req);
      if (!validText(body.name, 100)) return fail(res, 400, '자료 이름을 입력해 주세요.');
      let pageIds;
      if (!validPageIds(body.pageIds)) return fail(res, 400, '학습 페이지를 선택해 주세요.');
      pageIds = body.pageIds;
      const gridColumns = body.gridColumns === undefined ? 3 : body.gridColumns;
      if (!Number.isInteger(gridColumns) || gridColumns < 1 || gridColumns > 4) return fail(res, 400, '열 수는 1~4 사이여야 합니다.');
      if (body.school !== undefined && body.school !== '' && !validText(body.school, 120)) return fail(res, 400, '학교 이름을 120자 이내로 입력해 주세요.');
      if (body.lectureDate !== undefined && body.lectureDate !== '' && !validLectureDate(body.lectureDate)) return fail(res, 400, '출강일을 확인해 주세요.');
      const session = newSession(body.name.trim(), pageIds, gridColumns, blocksForPages(pageIds), body.school?.trim() || '', body.lectureDate || '');
      currentStore().sessions.push(session); await save();
      return send(res, 201, { id: session.id });
    }
    if (parts[0] === 'api' && parts[1] === 'sessions' && parts[2]) {
      const session = findSession(parts[2]);
      if (!session) return fail(res, 404, '연수 자료를 찾을 수 없습니다.');
      const action = parts[3];
      if (action === 'pages' && parts[5] === 'notes' && (parts.length === 6 || (parts.length === 8 && parts[7] === 'comments'))) {
        const pageId = parts[4];
        if (!boardPageIds.has(pageId) || !session.pageIds.includes(pageId) || !findPage(pageId)) return fail(res, 404, '이 연수에 포스트잇 게시판이 없습니다.');
        const notes = session.notesByPage?.[pageId] || [];
        if (parts.length === 8) {
          const note = notes.find(item => item.id === parts[6]);
          if (!note) return fail(res, 404, '포스트잇을 찾을 수 없습니다.');
          if (req.method !== 'POST') return fail(res, 405, '지원하지 않는 요청입니다.');
          const { name, text } = await readJson(req);
          if (!validText(name, 30) || !validText(text, 500)) return fail(res, 400, '이름은 30자, 댓글은 500자 이내로 입력해 주세요.');
          // ponytail: 500 comments per note; paginate if a workshop needs more.
          if ((note.comments?.length || 0) >= 500) return fail(res, 409, '이 포스트잇의 댓글이 가득 찼습니다.');
          const comment = { name: name.trim(), text: text.trim() };
          (note.comments ||= []).push(comment); await save();
          return send(res, 201, comment);
        }
        if (req.method === 'GET') return send(res, 200, isAdmin(req) ? { notes } : { notes: [], recordsVisible: false });
        if (req.method === 'POST') {
          const { name, text } = await readJson(req);
          if (!validText(name, 30) || !validText(text, 500)) return fail(res, 400, '이름은 30자, 포스트잇 내용은 500자 이내로 입력해 주세요.');
          if (notes.length >= 500) return fail(res, 409, '게시판이 가득 찼습니다.');
          const note = { id: crypto.randomBytes(8).toString('hex'), name: name.trim(), text: text.trim() };
          session.notesByPage ||= {};
          session.notesByPage[pageId] = [...notes, note]; await save();
          return send(res, 201, note);
        }
        return fail(res, 405, '지원하지 않는 요청입니다.');
      }
      if (action === 'qr' && req.method === 'GET') {
        const publicOrigin = process.env.VERCEL || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? 'https://booong.vercel.app' : url.origin;
        const target = isAdmin(req) ? (session.shortUrl || `${url.origin}/rice-basket/?s=${session.id}`) : `${publicOrigin}/rice-basket/?s=${encodeURIComponent(session.id)}`;
        const svg = await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 220 });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        return res.end(svg);
      }
      if (!action && req.method === 'GET') return send(res, 200, publicSession(session, isAdmin(req)));
      if (action === 'me' && req.method === 'POST') {
        const { token } = await readJson(req);
        const person = participant(session, token);
        return send(res, 200, { person: person ? { id: person.id, name: person.name, initial: person.initial, redesign: person.redesign, vote: person.vote } : null });
      }
      if (action === 'join' && req.method === 'POST') {
        const { name } = await readJson(req);
        if (!validText(name, 30)) return fail(res, 400, '이름이나 별명을 30자 이내로 입력해 주세요.');
        const token = crypto.randomBytes(24).toString('base64url');
        const person = { id: crypto.randomBytes(8).toString('hex'), tokenHash: crypto.createHash('sha256').update(token).digest('hex'), name: name.trim(), initial: '', redesign: '', vote: null };
        session.participants.push(person); await save();
        return send(res, 201, { token, person: { id: person.id, name: person.name } });
      }
      if (action === 'answer' && req.method === 'POST') {
        const { token, field, text, pageId } = await readJson(req);
        const person = participant(session, token);
        if (!person) return fail(res, 401, '다시 입장해 주세요.');
        if (!['initial', 'redesign'].includes(field) || !validText(text, 500)) return fail(res, 400, '답변을 500자 이내로 입력해 주세요.');
        const expected = field === 'initial' ? 'postit' : 'redesign';
        const allowed = pageId === undefined ? session.blocks[session.currentIndex]?.type === expected : selectedPageHas(session, pageId, expected);
        if (!allowed) return fail(res, 409, pageId === undefined ? '현재는 이 답변을 받는 시간이 아닙니다.' : '선택한 페이지에서는 이 답변을 받을 수 없습니다.');
        person[field] = text.trim(); await save();
        return send(res, 200, { ok: true });
      }
      if (action === 'vote' && req.method === 'POST') {
        const { token, targetId, pageId } = await readJson(req);
        const person = participant(session, token);
        if (!person) return fail(res, 401, '다시 입장해 주세요.');
        const onVote = pageId === undefined ? session.blocks[session.currentIndex]?.type === 'vote' : selectedPageHas(session, pageId, 'vote');
        if (!session.votingOpen || !onVote) return fail(res, 409, '지금은 투표 시간이 아닙니다.');
        if (person.vote) return fail(res, 409, '이미 투표했습니다.');
        if (!session.participants.some(p => p.id === targetId && p.redesign)) return fail(res, 400, '투표할 수 없는 항목입니다.');
        person.vote = targetId; await save();
        return send(res, 200, { ok: true });
      }
      if (!requireAdmin(req, res)) return;
      if (!action && req.method === 'PATCH') {
        const body = await readJson(req);
        const next = structuredClone(session);
        if (body.shortUrl !== undefined) {
          if (typeof body.shortUrl !== 'string' || body.shortUrl.length > 1000) return fail(res, 400, '링크를 1000자 이내로 입력해 주세요.');
          const value = body.shortUrl.trim();
          if (value) {
            let link;
            try { link = new URL(value); } catch { return fail(res, 400, 'https:// 또는 http://로 시작하는 링크를 입력해 주세요.'); }
            if (!['https:', 'http:'].includes(link.protocol) || link.username || link.password) return fail(res, 400, '올바른 웹 링크를 입력해 주세요.');
          }
          next.shortUrl = value;
        }
        if (body.name !== undefined) {
          if (!validText(body.name, 100)) return fail(res, 400, '자료 이름을 확인해 주세요.');
          next.name = body.name.trim();
        }
        if (body.school !== undefined) {
          if (body.school !== '' && !validText(body.school, 120)) return fail(res, 400, '학교 이름을 120자 이내로 입력해 주세요.');
          next.school = body.school.trim();
        }
        if (body.lectureDate !== undefined) {
          if (body.lectureDate !== '' && !validLectureDate(body.lectureDate)) return fail(res, 400, '출강일을 확인해 주세요.');
          next.lectureDate = body.lectureDate;
        }
        if (body.pageIds !== undefined) {
          if (!validPageIds(body.pageIds)) return fail(res, 400, '학습 페이지를 선택해 주세요.');
          next.pageIds = [...body.pageIds];
          next.blocks = blocksForPages(next.pageIds);
          next.currentIndex = Math.min(next.currentIndex, Math.max(0, next.blocks.length - 1));
        }
        if (body.gridColumns !== undefined) {
          if (!Number.isInteger(body.gridColumns) || body.gridColumns < 1 || body.gridColumns > 4) return fail(res, 400, '열 수는 1~4 사이여야 합니다.');
          next.gridColumns = body.gridColumns;
        }
        if (body.blocks !== undefined) {
          if (!Array.isArray(body.blocks) || body.blocks.length < 1 || body.blocks.length > 80 || !body.blocks.every(validBlock)) return fail(res, 400, '슬라이드 내용을 확인해 주세요.');
          next.blocks = body.blocks.map(block => structuredClone(block));
          next.currentIndex = Math.min(next.currentIndex, next.blocks.length - 1);
        }
        if (body.currentIndex !== undefined) {
          if (!Number.isInteger(body.currentIndex) || body.currentIndex < 0 || body.currentIndex >= next.blocks.length) return fail(res, 400, '슬라이드 번호가 잘못되었습니다.');
          next.currentIndex = body.currentIndex;
        }
        if (body.votingOpen !== undefined) next.votingOpen = Boolean(body.votingOpen);
        if (body.resultsVisible !== undefined) next.resultsVisible = Boolean(body.resultsVisible);
        Object.assign(session, next); await save();
        return send(res, 200, publicSession(session, isAdmin(req)));
      }
      if (action === 'reset' && req.method === 'POST') {
        session.participants = [];
        session.notesByPage = {};
        session.generation = (session.generation || 0) + 1;
        session.currentIndex = 0;
        session.votingOpen = false;
        session.resultsVisible = false;
        await save();
        return send(res, 200, { ok: true });
      }
      if (!action && req.method === 'DELETE') {
        currentStore().sessions = currentStore().sessions.filter(s => s.id !== session.id); await save();
        return send(res, 200, { ok: true });
      }
    }
    fail(res, 404, '페이지를 찾을 수 없습니다.');
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return send(res, 409, { error: '다른 응답이 먼저 저장되었습니다. 입력은 유지되니 다시 저장해 주세요.', retryable: true });
    if (error instanceof SyntaxError) return fail(res, 400, '요청 형식이 올바르지 않습니다.');
    if (error.message === '요청이 너무 큽니다.') return fail(res, 413, error.message);
    console.error(error);
    fail(res, 500, '요청을 처리하지 못했습니다.');
  }
}

function createHandler(storage = cloudStore) { return async function handler(req, res) {
  if (!isAdmin(req) && !isPublicRequest(req)) return fail(res, 401, '운영자 Google 인증이 필요합니다.');
  if (storage === cloudStore && !process.env.RICE_BASKET_BLOB_READ_WRITE_TOKEN) return fail(res, 503, '쌀바구니 저장소가 설정되지 않았습니다.');
  try {
    const state = await storage.load();
    return await requestState.run({ ...state, storage }, () => handleRequest(req, res));
  } catch (error) {
    console.error('쌀바구니 저장소 읽기 실패:', error.message);
    return fail(res, 503, '저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
}; }
const handler = createHandler();
export { handler, createHandler };
