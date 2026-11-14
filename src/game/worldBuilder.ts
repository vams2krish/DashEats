import RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';

export const ROAD_X = [-72, 0, 72];
export const ROAD_Z = [-96, 48, 144];
export const WORLD_EDGE = 225;

export interface VehicleVisual {
  group: THREE.Group;
  wheels: THREE.Group[];
}

export interface SignalBulb {
  mesh: THREE.Mesh;
  vertical: boolean;
  offset: number;
}

function setShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function makeVehicle(color: number, police = false, van = false): VehicleVisual {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.42, roughness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x12232d, metalness: 0.18, roughness: 0.12 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(van ? 1.88 : 1.76, van ? 0.78 : 0.58, van ? 4.15 : 3.72), paint);
  body.position.y = van ? 0.02 : -0.06;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(van ? 1.62 : 1.45, van ? 1 : 0.58, van ? 2.55 : 1.82), glass);
  cabin.position.set(0, van ? 0.82 : 0.48, van ? -0.2 : 0.08);
  group.add(cabin);

  const wheels: THREE.Group[] = [];
  const tireGeometry = new THREE.CylinderGeometry(van ? 0.36 : 0.33, van ? 0.36 : 0.33, 0.25, 18);
  for (const [x, z] of [[-0.91, 1.18], [0.91, 1.18], [-0.91, -1.18], [0.91, -1.18]]) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeometry, trim);
    tire.rotation.z = Math.PI / 2;
    wheel.add(tire);
    wheel.position.set(x, -0.55, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  for (const [x, front] of [[-0.58, true], [0.58, true], [-0.58, false], [0.58, false]] as const) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.15, 0.06),
      new THREE.MeshBasicMaterial({ color: front ? 0xfff2b0 : 0xff3b32 }),
    );
    lamp.position.set(x, -0.02, front ? 1.89 : -1.89);
    group.add(lamp);
  }
  if (police) {
    const lightbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.13, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x3d9dff }),
    );
    lightbar.position.set(0, 0.86, 0);
    lightbar.name = 'lightbar';
    group.add(lightbar);
  }
  setShadows(group);
  return { group, wheels };
}

export function makePedestrian(color: number) {
  const group = new THREE.Group();
  const clothing = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9b6648, roughness: 0.82 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 8), clothing);
  body.position.y = 1.08;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.7;
  group.add(head);
  for (const x of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.15), clothing);
    leg.position.set(x, 0.44, 0);
    leg.name = x < 0 ? 'leg-left' : 'leg-right';
    group.add(leg);
  }
  setShadows(group);
  return group;
}

function addRoads(scene: THREE.Scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), new THREE.MeshStandardMaterial({ color: 0x274236, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x292d2f, roughness: 0.92 });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x818985, roughness: 0.96 });
  for (const x of ROAD_X) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(24, 460), sidewalkMaterial);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(x, 0.012, 0);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 460), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.025, 0);
    scene.add(sidewalk, road);
  }
  for (const z of ROAD_Z) {
    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(460, 24), sidewalkMaterial);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(0, 0.014, z);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(460, 18), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.028, z);
    scene.add(sidewalk, road);
  }
  const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xf4cd51 });
  for (const x of ROAD_X) {
    for (let z = -220; z < 220; z += 12) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 5.3), laneMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.042, z);
      scene.add(line);
    }
  }
  for (const z of ROAD_Z) {
    for (let x = -220; x < 220; x += 12) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 0.17), laneMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.044, z);
      scene.add(line);
    }
  }
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xe8e9e5 });
  for (const x of ROAD_X) {
    for (const z of ROAD_Z) {
      for (let stripe = -7; stripe <= 7; stripe += 2) {
        const a = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 3.5), stripeMaterial);
        a.rotation.x = -Math.PI / 2;
        a.position.set(x + stripe, 0.048, z + 10.2);
        const b = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.8), stripeMaterial);
        b.rotation.x = -Math.PI / 2;
        b.position.set(x + 10.2, 0.049, z + stripe);
        scene.add(a, b);
      }
    }
  }
}

function addBuildings(scene: THREE.Scene, world: RAPIER.World) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = [0x778b93, 0xb9a887, 0x596b78, 0xbfc6c0].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06 }),
  );
  const sets: Array<Array<{ x: number; z: number; w: number; d: number; h: number }>> = materials.map(() => []);
  let seed = 1729;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let x = -204; x <= 204; x += 24) {
    for (let z = -204; z <= 204; z += 24) {
      if (ROAD_X.some((road) => Math.abs(x - road) < 18) || ROAD_Z.some((road) => Math.abs(z - road) < 18)) continue;
      if (x > 77 && x < 112 && z > 44 && z < 92) continue;
      const outer = Math.abs(x) > 150 || Math.abs(z) > 170;
      const item = {
        x: x + (random() - 0.5) * 5,
        z: z + (random() - 0.5) * 5,
        w: 10 + random() * 8,
        d: 10 + random() * 8,
        h: outer ? 5 + random() * 8 : 10 + random() * 38,
      };
      sets[Math.floor(random() * materials.length)].push(item);
      world.createCollider(RAPIER.ColliderDesc.cuboid(item.w / 2, item.h / 2, item.d / 2).setTranslation(item.x, item.h / 2, item.z));
    }
  }
  sets.forEach((items, index) => {
    const mesh = new THREE.InstancedMesh(geometry, materials[index], items.length);
    const matrix = new THREE.Matrix4();
    items.forEach((item, itemIndex) => {
      matrix.compose(new THREE.Vector3(item.x, item.h / 2, item.z), new THREE.Quaternion(), new THREE.Vector3(item.w, item.h, item.d));
      mesh.setMatrixAt(itemIndex, matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.24, 2.2, 7);
  const crownGeometry = new THREE.SphereGeometry(1.05, 8, 6);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4430, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x3d7650, roughness: 0.94 });
  for (let z = -190; z <= 190; z += 28) {
    for (const x of ROAD_X) {
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.set(x + 12.4, 1.1, z);
      const crown = new THREE.Mesh(crownGeometry, crownMaterial);
      crown.position.set(x + 12.4, 2.85, z);
      scene.add(trunk, crown);
      world.createCollider(RAPIER.ColliderDesc.cylinder(1.1, 0.24).setTranslation(x + 12.4, 1.1, z));
    }
  }
}

function addLandmarks(scene: THREE.Scene, world: RAPIER.World) {
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xe9731a, roughness: 0.68 });
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.72, 0.55), barrierMaterial);
  barrier.position.set(4.8, 0.36, 101.5);
  barrier.castShadow = true;
  scene.add(barrier);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.4, 0.36, 0.28).setTranslation(4.8, 0.36, 101.5));

  const station = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(22, 0.55, 15), new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.2 }));
  canopy.position.set(91, 5.5, 68);
  station.add(canopy);
  for (const x of [84, 98]) {
    for (const z of [64, 72]) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.75), new THREE.MeshStandardMaterial({ color: 0xe9ece8 }));
      pump.position.set(x, 1.1, z);
      station.add(pump);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 1.1, 0.38).setTranslation(x, 1.1, z));
    }
  }
  for (const x of [81, 101]) {
    for (const z of [61, 75]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 5.3, 8), new THREE.MeshStandardMaterial({ color: 0xf5f5ef }));
      column.position.set(x, 2.65, z);
      station.add(column);
      world.createCollider(RAPIER.ColliderDesc.cylinder(2.65, 0.24).setTranslation(x, 2.65, z));
    }
  }
  setShadows(station);
  scene.add(station);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#10171a';
    context.fillRect(0, 0, 512, 192);
    context.fillStyle = '#f7bd22';
    context.font = '700 52px Arial';
    context.textAlign = 'center';
    context.fillText('DASHFUEL', 256, 76);
    context.fillStyle = '#fff';
    context.font = '700 31px Arial';
    context.fillText('$4.79  |  EV $0.43', 256, 138);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }));
  sign.position.set(82, 6.6, 80);
  sign.rotation.y = -0.35;
  scene.add(sign);

  const hotel = new THREE.Mesh(new THREE.BoxGeometry(25, 24, 16), new THREE.MeshStandardMaterial({ color: 0xa3afb2, roughness: 0.72 }));
  hotel.position.set(-92, 12, 48);
  scene.add(hotel);
  world.createCollider(RAPIER.ColliderDesc.cuboid(12.5, 12, 8).setTranslation(-92, 12, 48));
  const awning = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 4.5), new THREE.MeshStandardMaterial({ color: 0xb62f35 }));
  awning.position.set(-92, 3.3, 57.2);
  scene.add(awning);

  const house = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 12), new THREE.MeshStandardMaterial({ color: 0xd8d0bd, roughness: 0.84 }));
  house.position.set(91, 4, -96);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 5, 4), new THREE.MeshStandardMaterial({ color: 0x6e3f37 }));
  roof.position.set(91, 10.4, -96);
  roof.rotation.y = Math.PI / 4;
  scene.add(house, roof);
  world.createCollider(RAPIER.ColliderDesc.cuboid(7.5, 4, 6).setTranslation(91, 4, -96));
}

function addTrafficLights(scene: THREE.Scene) {
  const bulbs: SignalBulb[] = [];
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x343a3d, roughness: 0.75 });
  for (const x of ROAD_X) {
    for (const z of ROAD_Z) {
      for (const vertical of [true, false]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.4, 9), poleMaterial);
        pole.position.set(x + (vertical ? 7.4 : -7.4), 2.7, z + (vertical ? 7.4 : -7.4));
        const signal = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.42, 0.5), poleMaterial);
        signal.position.copy(pole.position).setY(4.9);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshBasicMaterial({ color: 0x35df81 }));
        bulb.position.copy(signal.position);
        bulb.position.z += vertical ? -0.27 : 0;
        bulb.position.x += vertical ? 0 : 0.3;
        scene.add(pole, signal, bulb);
        bulbs.push({ mesh: bulb, vertical, offset: ((x + z + 300) / 72) % 4 });
      }
    }
  }
  return bulbs;
}

export function addWorld(scene: THREE.Scene, world: RAPIER.World) {
  world.createCollider(RAPIER.ColliderDesc.cuboid(230, 0.12, 230).setTranslation(0, -0.12, 0).setFriction(1.25));
  addRoads(scene);
  addBuildings(scene, world);
  addLandmarks(scene, world);
  return { signalBulbs: addTrafficLights(scene), stationPosition: new THREE.Vector3(91, 0, 68) };
}

export function makeTargetMarker(color: number) {
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 10, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.18;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.55, 8, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  beam.position.y = 4;
  marker.add(ring, beam);
  return marker;
}

export function createRouteArrows(scene: THREE.Scene, route: THREE.Vector3[]) {
  const arrows: THREE.Mesh[] = [];
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const direction = route[index + 1].clone().sub(start);
    const distance = direction.length();
    direction.normalize();
    for (let offset = 10; offset < distance; offset += 13) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 1.8, 3),
        new THREE.MeshBasicMaterial({ color: 0xf4bd22, transparent: true, opacity: 0.88 }),
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.y = Math.atan2(direction.x, direction.z);
      arrow.position.copy(start).addScaledVector(direction, offset).setY(0.12);
      arrow.scale.y = 0.12;
      scene.add(arrow);
      arrows.push(arrow);
    }
  }
  return arrows;
}
