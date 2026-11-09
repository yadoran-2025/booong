import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "../assets/vendor/three/three.module.js";
import { renderHomeIntro } from "../js/ui/dashboard-intro.js";
import { createIntroRoute, sampleIntroRoute } from "../js/ui/intro-scooter.js";
import { createScooterModel } from "../js/ui/scooter-model.js";

const storedQuote = JSON.parse(readFileSync(new URL("../lessons/index.json", import.meta.url), "utf8")).dashboard;
assert.ok(renderHomeIntro().replace(/<br\s*\/?>/g, " ").includes(storedQuote.subtitle), "The main quote contains the full saved excerpt");
assert.match(renderHomeIntro(), /타자를 돕는 일을 도우며,<br>미래-타자의 출현에/, "The quote breaks exactly after 도우며,");
assert.ok(renderHomeIntro().includes("김원영·김초엽, 『사이보그가 되다』, 사계절, 2021"), "The quote includes its authors, title, publisher and year");
const { camera, curve } = createIntroRoute();
const route = Array.from({ length: 201 }, (_, i) => sampleIntroRoute(curve, i / 200).position.clone().project(camera));
let turnCount = 0, previousDirection = 0;
for (let i = 1; i < route.length; i++) {
  const direction = Math.sign(route[i].x - route[i - 1].x);
  if (direction && previousDirection && direction !== previousDirection) turnCount++;
  if (direction) previousDirection = direction;
  assert.ok(route[i].y > route[i - 1].y, "The rider moves continuously up the painted road");
}
assert.equal(turnCount, 1, "The road has one C-shaped bend without alternating S turns");
assert.ok(route[100].x > route[0].x && route.at(-1).x < Math.max(...route.map(point => point.x)));

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

const frames = [], events = {}, pageEvents = {};
const motionPreference = { matches: false, addEventListener() {} };
let bounds = { top: 0, bottom: 1500 }, imports = 0, draws = 0;
const section = { isConnected: true, offsetHeight: 1500, dataset: {}, getBoundingClientRect: () => bounds };
const introNodes = {
  '.home-intro': section, '.home-intro__stage': { offsetHeight: 700 }, '.home-intro__art': {},
  '.home-intro__landscape': { addEventListener() {} }, '#lesson-library': { scrollIntoView() { bounds = { top: -1600, bottom: -100 }; } },
};
const visibilityContext = vm.createContext({
  AbortController, location: { hash: '#lesson-library' },
  window: { innerHeight: 700, matchMedia: () => motionPreference, addEventListener: (name, callback) => { events[name] = callback; } },
  document: { hidden: false, addEventListener: (name, callback) => { pageEvents[name] = callback; } },
  requestAnimationFrame: callback => { frames.push(callback);return frames.length; }, cancelAnimationFrame() {},
  loadRiderModule: async () => { imports++;return { createIntroScooter: () => ({ render() { draws++; } }) }; },
});
const bindingSource = readFileSync(new URL('../js/ui/dashboard-intro.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '').replace('import("./intro-scooter.js")', 'loadRiderModule()');
vm.runInContext(bindingSource, visibilityContext);
visibilityContext.bindHomeIntro({ querySelector: selector => introNodes[selector], querySelectorAll: () => [] });
frames.shift()(0);assert.equal(imports, 0, '목록으로 바로 들어오면 화면 밖 3D를 읽지 않는다');
bounds = { top: 0, bottom: 1500 };visibilityContext.document.hidden = true;events.scroll();frames.shift()(16);
assert.equal(imports, 0, '숨긴 탭에서도 3D를 읽지 않는다');
visibilityContext.document.hidden = false;pageEvents.visibilitychange();frames.shift()(32);await new Promise(setImmediate);
assert.equal(imports, 1, '소개 화면으로 돌아오면 3D를 읽는다');
frames.shift()(48);events.scroll();frames.shift()(64);
assert.equal(imports, 1, '스크롤 중 같은 3D를 다시 만들지 않는다');assert.ok(draws > 0);
console.log('Dashboard intro loads the 3D renderer only when the intro is visible.');

section.offsetHeight = 1050;bounds = { top: -175, bottom: 875 };events.scroll();
for (let i = 0; i < 7; i++) frames.shift()(100 + i * 1000 / 60);
assert.ok(Number(section.dataset.rideProgress) > .3 && Number(section.dataset.rideProgress) < .5, "The rider responds quickly while keeping smooth movement");
for (let i = 7; i < 90 && frames.length; i++) frames.shift()(100 + i * 1000 / 60);
assert.equal(section.dataset.rideProgress, "0.500", "Half of the shorter scroll distance reaches half of the road");
bounds = { top: -350, bottom: 700 };events.scroll();
for (let i = 0; i < 90 && frames.length; i++) frames.shift()(2000 + i * 1000 / 60);
assert.equal(section.dataset.rideProgress, "1.000");
motionPreference.matches = true;events.scroll();frames.shift()(4000);
assert.equal(section.dataset.rideProgress, "0.000", "Reduced-motion users keep a stationary scooter");
console.log("Dashboard intro: full excerpt with attribution, faster scroll response and reduced-motion support passed.");
