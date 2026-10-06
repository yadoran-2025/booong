// Split the licensed single-mesh source into a body and two rolling wheel pivots.
// Usage: node scripts/prepare-intro-scooter.mjs /path/to/original-scooter.glb
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.ok(process.argv[2], 'Pass the original Poly by Google GLB file.');
const bytes = await readFile(process.argv[2]);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
assert.equal(gltf.nodes.length, 1, 'Expected the original single-mesh scooter.');
const binary = bytes.subarray(28 + jsonLength);
const primitive = gltf.meshes[0].primitives[0];
function attribute(index, Type, size) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
  return new Type(binary.buffer, binary.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0), accessor.count * size);
}
const positions = attribute(primitive.attributes.POSITION, Float32Array, 3);
const indices = attribute(primitive.indices, Uint16Array, 1);
const parent = Array.from({ length: positions.length / 3 }, (_, i) => i);
const find = i => parent[i] === i ? i : parent[i] = find(parent[i]);
const join = (a, b) => { parent[find(a)] = find(b); };
const vertices = new Map();
for (let i = 0; i < parent.length; i++) {
  const key = Array.from(positions.subarray(i * 3, i * 3 + 3)).map(value => value.toFixed(3)).join(',');
  if (vertices.has(key)) join(i, vertices.get(key)); else vertices.set(key, i);
}
for (let i = 0; i < indices.length; i += 3) { join(indices[i], indices[i + 1]); join(indices[i], indices[i + 2]); }
const bounds = new Map();
for (let i = 0; i < parent.length; i++) {
  const id = find(i), box = bounds.get(id) || { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let axis = 0; axis < 3; axis++) {
    box.min[axis] = Math.min(box.min[axis], positions[i * 3 + axis]);
    box.max[axis] = Math.max(box.max[axis], positions[i * 3 + axis]);
  }
  bounds.set(id, box);
}
const groups = [[], [], []];
for (let i = 0; i < indices.length; i += 3) {
  const box = bounds.get(find(indices[i]));
  const wheel = box.min[0] > -5 && box.max[0] < 5 && box.max[1] < 34;
  const group = wheel ? (box.min[2] > 0 ? 1 : 2) : 0;
  groups[group].push(...indices.subarray(i, i + 3));
}
assert.ok(groups[1].length > 500 && groups[2].length > 500, 'Both tires and hubs must be assigned to wheel pivots.');
const chunks = [binary];
let offset = binary.length;
gltf.meshes = groups.map((group, index) => {
  const array = new Uint16Array(group);
  const chunk = Buffer.alloc(Math.ceil(array.byteLength / 4) * 4);
  Buffer.from(array.buffer).copy(chunk);
  const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: array.byteLength, target: 34963 }) - 1;
  const accessor = gltf.accessors.push({ bufferView: view, componentType: 5123, count: array.length, type: 'SCALAR' }) - 1;
  chunks.push(chunk); offset += chunk.length;
  return { name: ['Body', 'FrontTire', 'RearTire'][index], primitives: [{ ...primitive, indices: accessor }] };
});
gltf.nodes = [{ name: 'Scooter', children: [1, 2, 4] }, { name: 'Body', mesh: 0 }];
for (const [name, mesh, z] of [['WheelFront', 1, 43.848146], ['WheelRear', 2, -43.250071]]) {
  const child = gltf.nodes.length + 1;
  gltf.nodes.push({ name, translation: [0, 16.45234, z], children: [child] }, { mesh, translation: [0, -16.45234, -z] });
}
gltf.buffers[0].byteLength = offset;
const json = Buffer.from(JSON.stringify(gltf));
const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(paddedJson);
const output = Buffer.alloc(28 + paddedJson.length + offset);
output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(paddedJson.length, 12); output.writeUInt32LE(0x4e4f534a, 16); paddedJson.copy(output, 20);
output.writeUInt32LE(offset, 20 + paddedJson.length); output.writeUInt32LE(0x004e4942, 24 + paddedJson.length);
Buffer.concat(chunks).copy(output, 28 + paddedJson.length);
await writeFile(new URL('../assets/models/scooter.glb', import.meta.url), output);
console.log(`Prepared rolling wheels: ${groups[1].length / 3} front and ${groups[2].length / 3} rear triangles.`);
