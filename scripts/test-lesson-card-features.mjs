import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { toggleFavoriteId } from '../js/favorites.js';

const source = readFileSync(new URL('../mockups/lesson-cards.js', import.meta.url), 'utf8');
const state = { subject: '사회2', unit: '', query: '', view: 'all', middle: '', domain: '', sort: 'unit' };
const catalog = {
  units: [{ key: '사회2::III. 시장', subject: '사회2', geo: false }, { key: '사회2::VII. 인구', subject: '사회2', geo: true }, { key: '사회1::I. 세계', subject: '사회1', geo: true }],
  resources: [
    { id: 'market', subjects: ['사회2'], unitKeys: ['사회2::III. 시장'], title: '가', searchText: 'market', middleUnitsByKey: { '사회2::III. 시장': ['2. 가격'] } },
    { id: 'population', subjects: ['사회2'], unitKeys: ['사회2::VII. 인구'], title: '나', searchText: 'population' },
    { id: 'world', subjects: ['사회1'], unitKeys: ['사회1::I. 세계'], title: '다', searchText: 'ＮＥＷ world', isNew: true },
  ],
};
const context = vm.createContext({ state, catalog, saved: ['world'], resourceUnit: r => r.unitKeys[0], subjectResources: () => catalog.resources.filter(r => r.subjects.includes(state.subject)), isGeography: u => u.geo });
vm.runInContext(source.slice(source.indexOf('function selectPreviewResources('), source.indexOf('function announce(')) + '\nthis.select = selectPreviewResources;', context);
const ids = () => Array.from(context.select(), r => r.id);
assert.deepEqual(ids(), ['market', 'population']);
state.unit = '사회2::III. 시장'; state.middle = '2. 가격';
assert.deepEqual(ids(), ['market']);
state.query = 'new';
assert.deepEqual(ids(), ['world'], 'search spans subjects and ignores the selected unit');
state.query = ''; state.view = 'favorites';
assert.deepEqual(ids(), ['world']);
state.view = 'new';
assert.deepEqual(ids(), ['world']);
state.view = 'all'; state.unit = state.middle = ''; state.domain = '지리';
assert.deepEqual(ids(), ['population']);
state.domain = ''; state.sort = 'title';
assert.deepEqual(ids(), ['market', 'population']);

const failures = [];
const storageContext = vm.createContext({ toggleFavoriteId, localStorage: { setItem() { throw new Error('quota'); } }, announce: text => failures.push(text) });
vm.runInContext(`let saved = ['market']; const SAVE_KEY = 'preview'; ${source.slice(source.indexOf('function saveLesson('), source.indexOf('function cover('))}\nthis.save = saveLesson; this.read = () => saved;`, storageContext);
storageContext.save('population');
assert.deepEqual(Array.from(storageContext.read()), ['market'], 'failed storage never reports a successful save');
assert.equal(failures.length, 1);
console.log('Lesson card features: global search, favorites, new lessons, middle units, domains, and storage failure passed.');
