import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "../assets/vendor/three/three.module.js";
import { createIntroRoute, sampleIntroRoute } from "../js/ui/intro-scooter.js";
import { createScooterModel } from "../js/ui/scooter-model.js";

const { camera, curve } = createIntroRoute();
const landscape = { style: { objectPosition: "50% 50%" } };
const art = { clientWidth: 390, clientHeight: 490, dataset: {}, append() {}, querySelector: () => landscape };
let renderedCamera, renderedScooter;
const introContext = vm.createContext({
  THREE: { ...THREE, WebGLRenderer: class {
    domElement = {};
    shadowMap = {};
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render(scene, camera) { camera.updateMatrixWorld(); renderedCamera = camera; renderedScooter = scene.children.find(node => node.isGroup); }
  } },
  createScooterModel,
  getComputedStyle: element => element.style,
  window: { devicePixelRatio: 1, innerWidth: 390 },
});
const introSource = readFileSync(new URL("../js/ui/intro-scooter.js", import.meta.url), "utf8")
  .replace(/^import .+;$/gm, "").replace(/^export /gm, "");
vm.runInContext(`${introSource}\nthis.createIntroScooter = createIntroScooter;`, introContext);
const rider = await introContext.createIntroScooter(art, new AbortController().signal);
for (const verticalPosition of [50, 100]) {
  landscape.style.objectPosition = `50% ${verticalPosition}%`;
  for (const [width, height] of [[390, 490], [360, 395], [760, 490], [1280, 800]]) {
    art.clientWidth = introContext.window.innerWidth = width;
    art.clientHeight = height;
    for (const progress of [0, .25, .5, .75, 1]) {
      rider.render(progress);
      assert.equal(landscape.style.objectPosition, `50% ${verticalPosition}%`, 'scrolling keeps the landscape fixed');
      const position = sampleIntroRoute(curve, progress).position;
      const painted = position.clone().project(camera);
      const rendered = position.clone().project(renderedCamera);
      const fit = Math.max(width / 1586, height / 992);
      assert.ok(Math.abs((rendered.x + 1) * width / 2 - ((painted.x + 1) * 1586 * fit / 2 + (width - 1586 * fit) / 2)) < .001, 'rider follows the fixed road horizontally');
      assert.ok(Math.abs((1 - rendered.y) * height / 2 - ((1 - painted.y) * 992 * fit / 2 + (height - 992 * fit) * verticalPosition / 100)) < .001, 'rider follows the fixed road vertically');
    }
  }
}
landscape.style.objectPosition = '50% 100%';
for (const [width, height] of [[320, 171], [360, 265], [390, 331], [430, 365], [422, 330]]) {
  art.clientWidth = width;
  art.clientHeight = height;
  rider.render(0);
  const bounds = new THREE.Box3().setFromObject(renderedScooter);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const projected = new THREE.Vector3(x, y, z).project(renderedCamera);
    assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1, 'the parked scooter fits inside the mobile artwork');
  }
}
console.log("Dashboard intro: fixed landscape and rider alignment passed.");
