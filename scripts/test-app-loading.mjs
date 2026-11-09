import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8')
  .replace(/^import .+;\n/gm, '')
  .replace(/await import\("\.\/ui\/(dashboard|lesson|guide-gallery)\.js"\)/g, 'await loadModule("$1")')
  .replace(/init\(\);\s*$/, 'this.started = init();');
for (const [query, kind, expected] of [['', '', 'dashboard'], ['?view=favorites', '', 'dashboard'], ['?lesson=example', '', 'lesson'], ['?lesson=example', 'guide-gallery', 'guide-gallery']]) {
  const loaded = [], rendered = [], tracked = [], notices = [];
  const context = vm.createContext({
    app: {}, location: { search: query }, URLSearchParams,
    trackCurrentPage: value => tracked.push(value), showCommentNotice: () => notices.push(true),
    loadDashboardConfig: async () => ({ groups: [] }), loadExternalAssets: async () => {}, isJsonLessonUrl: () => true,
    fetch: async () => ({ ok: true, json: async () => ({ kind, title: '예시 수업', sections: [] }) }),
    loadModule: async name => { loaded.push(name);return { showDashboard: async () => rendered.push('dashboard'), startLesson: () => rendered.push('lesson'), renderGuideGallery: () => rendered.push('guide-gallery') }; },
  });
  vm.runInContext(source, context);await context.started;
  assert.deepEqual(loaded, [expected]);assert.deepEqual(rendered, [expected]);
  assert.equal(tracked.length, 1);
  assert.equal(notices.length, query === '' ? 1 : 0);
}
console.log('App entry loads only the home, lesson, or gallery renderer needed by the current route.');
