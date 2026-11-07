export const WEB_APPS_PAGE_ID = 'page-d5ccbf8787cd';

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

export function webAppDefinitions(value, { includeTeacher = true } = {}) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('웹앱은 20개까지 등록할 수 있습니다.');
  return value.map(entry => {
    if (!entry || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.trim().length > 120) throw new Error('웹앱 이름을 120자 이내로 입력해 주세요.');
    const result = { title: entry.title.trim() };
    for (const [key, label] of [['teacherUrl', '교사 화면'], ['studentUrl', '학생 화면']]) {
      if (key === 'teacherUrl' && !includeTeacher) continue;
      let url;
      try {
        if (typeof entry[key] !== 'string' || entry[key].trim().length > 2000) throw new Error();
        url = new URL(entry[key].trim());
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      } catch { throw new Error(`${label}의 올바른 https:// 주소를 입력해 주세요.`); }
      result[key] = url.href;
    }
    if (includeTeacher && entry.thumbnailUrl) {
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
