import * as THREE from '../../assets/vendor/three/three.module.js';
import * as Rounded from '../../assets/vendor/three/RoundedBoxGeometry.js';

// Built in world units: +Z is forward; wheels stay compatible with the scroll ride.
export function createScooterModel() {
  const model = new THREE.Group();
  model.name = 'BOOONG Scooter';
  const paint = new THREE.MeshPhysicalMaterial({ color: '#3478f6', roughness: .26, metalness: .12, clearcoat: 1, clearcoatRoughness: .18 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff2da', roughness: .4 });
  const leather = new THREE.MeshStandardMaterial({ color: '#594438', roughness: .7 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#253142', roughness: .85 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d4e0eb', metalness: .45, roughness: .24 });
  const lamp = new THREE.MeshPhysicalMaterial({ color: '#fff9df', emissive: '#ffdc91', emissiveIntensity: .22, roughness: .16, clearcoat: 1 });
  const amber = new THREE.MeshStandardMaterial({ color: '#ffaa3b', emissive: '#a74604', emissiveIntensity: .2, roughness: .25 });
  const red = new THREE.MeshStandardMaterial({ color: '#d94046', roughness: .25 });
  const glass = new THREE.MeshStandardMaterial({ color: '#abc6dd', metalness: .35, roughness: .15 });
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  function part(geometry, material, position, parent = model) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function oval(material, position, scale, parent = model) {
    const mesh = part(sphere, material, position, parent);
    mesh.scale.set(...scale);
    return mesh;
  }
  function box(material, position, size, radius = .02) {
    return part(new Rounded.RoundedBoxGeometry(...size, 3, radius), material, position);
  }
  function rod(material, start, end, radius = .008, parent = model) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const mesh = part(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 12), material, a.clone().add(b).multiplyScalar(.5).toArray(), parent);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return mesh;
  }
  const wheelRadius = .118;
  const wheels = [-.31, .31].map((z, index) => {
    const wheel = new THREE.Group();
    wheel.name = index ? 'WheelFront' : 'WheelRear';
    wheel.position.set(0, wheelRadius + .002, z);
    model.add(wheel);
    const tire = part(new THREE.TorusGeometry(.087, .031, 12, 40), rubber, [0, 0, 0], wheel);
    tire.rotation.y = Math.PI / 2;
    const hub = part(new THREE.CylinderGeometry(.075, .075, .062, 32), cream, [0, 0, 0], wheel);
    hub.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      const rim = part(new THREE.TorusGeometry(.066, .005, 8, 32), chrome, [side * .033, 0, 0], wheel);
      rim.rotation.y = Math.PI / 2;
      const center = part(new THREE.CylinderGeometry(.02, .02, .01, 20), chrome, [side * .036, 0, 0], wheel);
      center.rotation.z = Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        rod(chrome, [side * .035, 0, 0], [side * .035, Math.sin(angle) * .062, Math.cos(angle) * .062], .003, wheel);
      }
    }
    return wheel;
  });
  // Rounded engine cowling, low saddle and open footwell keep the retro scooter silhouette.
  oval(paint, [0, .292, -.245], [.148, .158, .225]);
  box(cream, [0, .445, -.16], [.263, .025, .379], .012);
  box(leather, [0, .475, -.16], [.256, .061, .369], .028);
  for (const side of [-1, 1]) {
    oval(cream, [side * .145, .292, -.255], [.004, .058, .12]);
    for (const y of [.275, .292, .309]) rod(chrome, [side * .15, y, -.293], [side * .15, y, -.228], .0025);
  }
  oval(chrome, [0, .304, -.449], [.067, .016, .009]);
  box(red, [0, .348, -.452], [.08, .025, .015], .01);
  box(cream, [0, .265, -.461], [.069, .043, .008], .004);
  box(paint, [0, .206, .043], [.25, .041, .33], .02);
  box(cream, [0, .23, .035], [.22, .011, .282], .005);
  for (const x of [-.065, -.025, .025, .065]) rod(chrome, [x, .237, -.067], [x, .237, .143], .0025);
  const shield = box(paint, [0, .352, .217], [.279, .282, .075], .034);
  shield.rotation.x = -.14;
  oval(paint, [0, .477, .235], [.131, .066, .051]);
  oval(cream, [0, .382, .265], [.034, .01, .003]);
  rod(chrome, [0, .29, .259], [0, .358, .274], .003);
  for (const x of [-.032, .032]) rod(chrome, [x, .12, .31], [x, .246, .298], .009);
  const fender = part(new THREE.TorusGeometry(.133, .024, 12, 32, Math.PI), paint, [0, .12, .31]);
  fender.rotation.y = Math.PI / 2;
  fender.scale.z = 1.9;
  const fenderTrim = part(new THREE.TorusGeometry(.153, .003, 8, 32, Math.PI), cream, [0, .12, .31]);
  fenderTrim.rotation.y = Math.PI / 2;
  // Round lamp, chrome grips and oval mirrors give the front a readable face.
  rod(chrome, [0, .465, .23], [0, .558, .254], .015);
  rod(chrome, [-.164, .564, .254], [.164, .564, .254], .009);
  for (const side of [-1, 1]) {
    rod(rubber, [side * .115, .564, .254], [side * .179, .564, .254], .014);
    rod(chrome, [side * .128, .564, .254], [side * .171, .663, .259], .004);
    oval(chrome, [side * .173, .675, .259], [.034, .022, .01]);
    oval(glass, [side * .173, .675, .25], [.028, .017, .003]);
    oval(chrome, [side * .105, .366, .267], [.02, .014, .012]);
    oval(amber, [side * .105, .366, .278], [.016, .01, .007]);
  }
  oval(paint, [0, .557, .274], [.075, .058, .058]);
  const bezel = part(new THREE.TorusGeometry(.046, .008, 12, 36), chrome, [0, .558, .321]);
  bezel.rotation.x = -.04;
  oval(lamp, [0, .558, .325], [.043, .043, .013]);
  return { model, wheels, wheelRadius };
}
