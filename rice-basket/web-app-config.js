import { webAppThumbnailImage } from './web-app-thumbnail.js';

export const WEB_APPS_PAGE_ID = 'page-d5ccbf8787cd';
export const DEFAULT_WEB_APP_TYPES = Object.freeze([
  '단순한 정보 취합 및 시각화',
  '전광판 유형 (빨간벽돌집짓기, 인구 땅따먹기)',
  '학생들이 입력한 데이터 기반 전광판 (수요공급, 뉴스읽는 트레이더)',
  '디지털기기를 학생이 직접 조작하여, 개념 학습에 활용',
]);

export function validateWebAppTypes(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('유형은 최대 20개까지 등록할 수 있습니다.');
  const types = value.map((entry, index) => {
    const { id, label } = typeof entry === 'string' ? { id: `type-${index + 1}`, label: entry } : entry || {};
    if (!validWebAppTypeId(id) || typeof label !== 'string' || !label.trim() || label.trim().length > 300 || /[\r\n]/.test(label)) throw new Error('유형 이름을 300자 이내로 입력해 주세요.');
    return { id, label: label.trim() };
  });
  if (new Set(types.map(type => type.id)).size !== types.length || new Set(types.map(type => type.label)).size !== types.length) throw new Error('같은 유형이 중복되지 않게 입력해 주세요.');
  return types;
}

function validWebAppTypeId(value) { return typeof value === 'string' && /^type-[a-zA-Z0-9_-]{1,75}$/.test(value); }

export function webAppThumbnailUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':') || /^[\d.]+$/.test(host)) return '';
    // Preview services receive only the public origin, never room paths or tokens.
    // shortcut: slow apps can be captured while loading; use thumbnailUrl for an exact screen.
    return `https://image.thum.io/get/width/1200/crop/750/noanimate/${url.origin}/`;
  } catch { return ''; }
}

export function webAppDefinitions(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('웹앱은 20개까지 등록할 수 있습니다.');
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') throw new Error('웹앱을 확인해 주세요.');
    const linked = entry.lessonId !== undefined && entry.lessonId !== '';
    if (linked && (typeof entry.lessonId !== 'string' || !/^[\p{L}\p{N}_-]{1,240}$/u.test(entry.lessonId) || ['__proto__', 'constructor', 'prototype'].includes(entry.lessonId))) throw new Error('BOOONG 수업을 다시 골라 주세요.');
    if (!linked && (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.trim().length > 120)) throw new Error('BOOONG 수업을 고르거나 기존 웹앱 이름을 확인해 주세요.');
    const result = linked ? { lessonId: entry.lessonId } : { title: entry.title.trim() };
    if (entry.typeId !== undefined && entry.typeId !== '') {
      if (!validWebAppTypeId(entry.typeId)) throw new Error('웹앱 유형을 다시 골라 주세요.');
      result.typeId = entry.typeId;
    }
    for (const [key, label] of [['teacherUrl', '교사 화면'], ['studentUrl', '학생 화면']]) {
      if (linked && key === 'teacherUrl' && (entry[key] === undefined || (typeof entry[key] === 'string' && !entry[key].trim()))) continue;
      if (key === 'studentUrl' && (entry[key] === undefined || (typeof entry[key] === 'string' && !entry[key].trim()))) continue;
      let url;
      try {
        if (typeof entry[key] !== 'string' || entry[key].trim().length > 2000) throw new Error();
        url = new URL(entry[key].trim());
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      } catch { throw new Error(`${label}의 올바른 https:// 주소를 입력해 주세요.`); }
      result[key] = url.href;
    }
    if (!linked && entry.thumbnailImage) result.thumbnailImage = webAppThumbnailImage(entry.thumbnailImage);
    if (!linked && entry.thumbnailUrl) {
      let image;
      try {
        if (typeof entry.thumbnailUrl !== 'string' || entry.thumbnailUrl.length > 2000) throw new Error();
        image = new URL(entry.thumbnailUrl.trim());
        if (image.protocol !== 'https:' || image.username || image.password) throw new Error();
      } catch { throw new Error('썸네일 이미지의 올바른 https:// 주소를 입력해 주세요.'); }
      result.thumbnailUrl = image.href;
    }
    return result;
  });
}
