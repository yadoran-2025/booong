import { loadDashboardConfig } from '../js/dashboard-data.js';
import { loadManagedThumbnails, thumbnailUrl } from '../js/thumbnail-data.js';

function safeUrl(value, origin) {
  try {
    if (!value) return '';
    const url = new URL(value, origin);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function webAppLessons(config, thumbnails, origin) {
  return (config.catalog?.resources || []).flatMap(resource => {
    const teacherUrl = safeUrl(resource.actions?.find(action => action.key === 'teacher')?.href, origin);
    return teacherUrl ? [{ id: resource.id, title: resource.title, teacherUrl, thumbnailUrl: safeUrl(thumbnailUrl(resource, thumbnails[resource.id]), origin), searchText: `${resource.title} ${resource.searchText || ''}`.normalize('NFKC').toLowerCase() }] : [];
  });
}

export async function loadWebAppLessons() {
  const [config, thumbnails] = await Promise.all([loadDashboardConfig({ cache: false }), loadManagedThumbnails().catch(() => ({}))]);
  if (config.catalogUnavailable) throw new Error('BOOONG 수업 목록을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.');
  return webAppLessons(config, thumbnails, location.origin);
}

export function resolveWebApp(entry, lessons) {
  if (!entry.lessonId) return entry;
  const lesson = lessons.find(lesson => lesson.id === entry.lessonId);
  return { ...entry, title: lesson?.title || '연결된 수업을 찾을 수 없습니다.', teacherUrl: entry.teacherUrl || lesson?.teacherUrl || '', thumbnailUrl: lesson?.thumbnailUrl || '' };
}
