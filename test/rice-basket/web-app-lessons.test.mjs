import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webAppLessons, resolveWebApp } from '../../rice-basket/web-app-lessons.js';
import { webAppDefinitions } from '../../rice-basket/web-app-config.js';

const resource = { id: 'group-2', title: 'BOOONG 수업', thumbnailUrl: '/cover.jpg', actions: [{ key: 'teacher', href: '/lesson.html' }] };

test('BOOONG 교사 링크와 대표 이미지를 재사용하고 안전한 수업만 선택한다', () => {
  const lessons = webAppLessons({ catalog: { resources: [resource, { ...resource, id: 'bad', actions: [{ key: 'teacher', href: 'javascript:alert(1)' }] }, { ...resource, id: 'missing', actions: [] }] } }, { 'group-2': { url: '/managed.webp' } }, 'https://booong.example');
  assert.equal(lessons.length, 1);assert.equal(lessons[0].teacherUrl, 'https://booong.example/lesson.html');assert.equal(lessons[0].thumbnailUrl, 'https://booong.example/managed.webp');
  const stored = webAppDefinitions([{ lessonId: 'group-2', title: '복사하지 않음', thumbnailUrl: 'https://example.org/old.jpg', teacherUrl: '', studentUrl: '' }])[0];
  assert.deepEqual(stored, { lessonId: 'group-2' });
  assert.equal(resolveWebApp(stored, lessons).title, resource.title);
  lessons[0].title = '변경된 이름';lessons[0].thumbnailUrl = 'https://booong.example/new.webp';
  assert.equal(resolveWebApp(stored, lessons).title, '변경된 이름');
  assert.equal(resolveWebApp(stored, lessons).thumbnailUrl, 'https://booong.example/new.webp');
  assert.equal(resolveWebApp({ ...stored, teacherUrl: 'https://example.org/private' }, lessons).teacherUrl, 'https://example.org/private');
  const participant = resolveWebApp(stored, lessons);
  assert.equal(participant.teacherUrl, lessons[0].teacherUrl);assert.equal(participant.thumbnailUrl, lessons[0].thumbnailUrl);
  assert.equal(resolveWebApp(stored, []).teacherUrl, '');
});

test('수업 ID와 수정 링크를 검증하며 기존 직접 등록 자료를 유지한다', () => {
  for (const lessonId of [null, '../secret', '__proto__', 'a'.repeat(241)]) assert.throws(() => webAppDefinitions([{ lessonId }]));
  assert.throws(() => webAppDefinitions([{ lessonId: 'group-2', teacherUrl: 'javascript:alert(1)' }]));
  assert.deepEqual(webAppDefinitions([{ title: '기존 자료', teacherUrl: 'https://example.org/' }]), [{ title: '기존 자료', teacherUrl: 'https://example.org/' }]);
});
