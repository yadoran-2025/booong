import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const target = new URL('../assets/vendor/three/', import.meta.url);
const source = new URL('../node_modules/three/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['examples/jsm/geometries/RoundedBoxGeometry.js', 'build/three.core.js', 'build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/utils/SkeletonUtils.js']) {
  const contents = (await readFile(new URL(file, source), 'utf8'))
    .replaceAll("from 'three'", "from './three.module.js'")
    .replaceAll("from '../utils/", "from './");
  await writeFile(new URL(file.split('/').at(-1), target), contents);
}
await copyFile(new URL('LICENSE', source), new URL('LICENSE', target));
console.log('Vendored Three.js and GLTFLoader from the pinned npm dependency.');
