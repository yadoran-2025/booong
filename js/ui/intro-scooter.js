import * as THREE from '../../assets/vendor/three/three.module.js';
import { createScooterModel } from './scooter-model.js';

const IMAGE_WIDTH = 1586;
const IMAGE_HEIGHT = 992;
// Follow the center of the single C bend painted into the landscape.
const ROAD = [
  [.27, .90], [.362, .857], [.431, .827], [.501, .796], [.567, .766],
  [.624, .736], [.668, .706], [.700, .675], [.722, .645], [.732, .615],
  [.734, .595], [.731, .575], [.723, .554], [.709, .534], [.686, .514],
  [.649, .494], [.590, .474], [.547, .462], [.534, .457],
];

export function createIntroRoute() {
  const camera = new THREE.PerspectiveCamera(42, IMAGE_WIDTH / IMAGE_HEIGHT, .1, 150);
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const points = ROAD.map(([x, y]) => {
    ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
    return ray.ray.intersectPlane(ground, new THREE.Vector3());
  });
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = 1200;
  return { camera, curve };
}

export function sampleIntroRoute(curve, progress) {
  const u = THREE.MathUtils.clamp(progress, 0, 1);
  const position = curve.getPointAt(u);
  // Use the axle span for heading, so a tight bend cannot spin the whole bike at one point.
  const halfWheelbase = .32 / curve.getLength();
  const rearU = Math.max(0, u - halfWheelbase);
  const frontU = Math.min(1, u + halfWheelbase);
  const direction = curve.getPointAt(frontU).sub(curve.getPointAt(rearU));
  const rearTangent = curve.getTangentAt(rearU);
  const frontTangent = curve.getTangentAt(frontU);
  const turn = Math.atan2(rearTangent.clone().cross(frontTangent).y, rearTangent.dot(frontTangent));
  const banking = THREE.MathUtils.smoothstep(u, .14, .24);
  return { position, heading: Math.atan2(direction.x, direction.z), bank: banking ? banking * THREE.MathUtils.clamp(turn * .08, -.04, .04) : 0 };
}

export async function createIntroScooter(art, signal) {
  const { camera, curve } = createIntroRoute();
  const renderCamera = camera.clone();
  const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'home-intro__canvas';
  const dispose = () => {
    scene.traverse(node => {
      node.geometry?.dispose();
      for (const material of [].concat(node.material || [])) {
        material.map?.dispose();
        material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
  signal.addEventListener('abort', dispose, { once: true });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa29d90, 3));
  const sun = new THREE.DirectionalLight(0xfff4de, 3);
  sun.position.set(-4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 40 });
  sun.shadow.bias = -.001;
  sun.shadow.normalBias = .03;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const scooter = new THREE.Group();
  scene.add(scooter);
  const { model, wheels, wheelRadius } = createScooterModel();
  scooter.add(model);
  if (signal.aborted) { dispose(); return null; }
  art.append(renderer.domElement);
  art.dataset.renderer = 'three';
  let lastWidth = 0;
  let lastHeight = 0;
  return {
    render(progress) {
      camera.clearViewOffset();
      const ride = sampleIntroRoute(curve, progress);
      scooter.position.copy(ride.position);
      // Position and steering share one smoothed progress value; separate rotation lag causes skidding.
      scooter.rotation.set(0, ride.heading, ride.bank, 'YXZ');
      for (const wheel of wheels) wheel.rotation.x = progress * curve.getLength() / wheelRadius;
      const projected = ride.position.clone().project(camera);
      const width = art.clientWidth;
      const height = art.clientHeight;
      if (!width || !height) return;
      const fit = Math.max(width / IMAGE_WIDTH, height / IMAGE_HEIGHT);
      const imageWidth = IMAGE_WIDTH * fit;
      const imageHeight = IMAGE_HEIGHT * fit;
      const offsetX = (width - imageWidth) / 2;
      const offsetY = (imageHeight - height) * parseFloat(getComputedStyle(art.querySelector('.home-intro__landscape')).objectPosition.split(' ')[1]) / 100;
      // The painted city has parallel verticals. Center the rider in its own camera
      // before placing it on the road, avoiding the apparent lean at the image edge.
      const depth = ride.position.clone().sub(camera.position).dot(cameraDirection);
      renderCamera.position.copy(ride.position).addScaledVector(cameraDirection, -depth);
      renderCamera.lookAt(ride.position);
      renderCamera.setViewOffset(imageWidth, imageHeight,
        -offsetX - projected.x * imageWidth / 2,
        offsetY + projected.y * imageHeight / 2, width, height);
      if (width !== lastWidth || height !== lastHeight) {
        renderer.setSize(width, height, false);
        lastWidth = width;
        lastHeight = height;
      }
      renderer.render(scene, renderCamera);
      art.dataset.heading = ride.heading.toFixed(3);
      art.dataset.bank = ride.bank.toFixed(4);
      art.dataset.renderedProgress = progress.toFixed(3);
    },
  };
}
