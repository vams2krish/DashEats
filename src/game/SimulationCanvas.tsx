import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type WeatherMode = 'clear' | 'rain' | 'storm';
export type CameraMode = 'chase' | 'cockpit';
export type ControlMode = 'keyboard' | 'touch' | 'wheel';

export interface Telemetry {
  speed: number;
  fuel: number;
  heading: number;
  distance: number;
  tickets: number;
}

interface SimulationCanvasProps {
  autoDrive: boolean;
  cameraMode: CameraMode;
  controlMode: ControlMode;
  driving: boolean;
  night: boolean;
  onTelemetry: (telemetry: Telemetry) => void;
  weather: WeatherMode;
}

function makeCar(color: number, police = false) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.52, 3.65),
    new THREE.MeshStandardMaterial({ color, metalness: 0.38, roughness: 0.28 }),
  );
  body.position.y = 0.62;
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.56, 1.82),
    new THREE.MeshStandardMaterial({ color: 0x1a252d, metalness: 0.2, roughness: 0.16 }),
  );
  cabin.position.set(0, 1.08, -0.12);
  cabin.castShadow = true;
  car.add(cabin);

  const tireGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 16);
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.9 });
  for (const x of [-0.91, 0.91]) {
    for (const z of [-1.12, 1.12]) {
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.4, z);
      car.add(tire);
    }
  }

  const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff302c });
  for (const x of [-0.58, 0.58]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.05), tailMaterial);
    tail.position.set(x, 0.67, 1.84);
    car.add(tail);
  }

  if (police) {
    const lightbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.12, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x4aa8ff }),
    );
    lightbar.position.set(0, 1.43, 0);
    lightbar.name = 'lightbar';
    car.add(lightbar);
  }
  return car;
}

function addRoad(scene: THREE.Scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 460),
    new THREE.MeshStandardMaterial({ color: 0x23352e, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x272c30, roughness: 0.87 });
  for (const x of [-72, 0, 72]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 460), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.018, 0);
    road.receiveShadow = true;
    scene.add(road);
  }
  for (const z of [-96, 48, 144]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(460, 18), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, z);
    scene.add(road);
  }

  const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xf7d55b });
  for (const x of [-72, 0, 72]) {
    for (let z = -220; z < 220; z += 12) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 5.5), laneMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.035, z);
      scene.add(line);
    }
  }
}

function addBuildings(scene: THREE.Scene) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x8d9da2, roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ color: 0xd7c9a8, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0x6f7b86, roughness: 0.72 }),
  ];
  const transforms: Array<{ x: number; z: number; w: number; d: number; h: number; material: number }> = [];
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let x = -204; x <= 204; x += 24) {
    for (let z = -204; z <= 204; z += 24) {
      const nearVerticalRoad = [-72, 0, 72].some((roadX) => Math.abs(x - roadX) < 18);
      const nearHorizontalRoad = [-96, 48, 144].some((roadZ) => Math.abs(z - roadZ) < 18);
      if (nearVerticalRoad || nearHorizontalRoad) continue;
      transforms.push({
        x: x + (random() - 0.5) * 5,
        z: z + (random() - 0.5) * 5,
        w: 11 + random() * 8,
        d: 11 + random() * 8,
        h: 8 + random() * 42,
        material: Math.floor(random() * materials.length),
      });
    }
  }
  materials.forEach((material, index) => {
    const items = transforms.filter((item) => item.material === index);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    const matrix = new THREE.Matrix4();
    items.forEach((item, itemIndex) => {
      matrix.compose(
        new THREE.Vector3(item.x, item.h / 2, item.z),
        new THREE.Quaternion(),
        new THREE.Vector3(item.w, item.h, item.d),
      );
      mesh.setMatrixAt(itemIndex, matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

function addTrafficLights(scene: THREE.Scene) {
  const lights: THREE.Mesh[] = [];
  for (const z of [-96, 48, 144]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 5.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x343b3d }),
    );
    pole.position.set(7.6, 2.75, z + 7.5);
    scene.add(pole);
    const signal = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.55, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x171b1c }),
    );
    signal.position.set(7.6, 5.05, z + 7.5);
    scene.add(signal);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x36e683 }),
    );
    bulb.position.set(7.6, 5.05, z + 7.2);
    bulb.userData.phase = z;
    scene.add(bulb);
    lights.push(bulb);
  }
  return lights;
}

export default function SimulationCanvas({
  autoDrive,
  cameraMode,
  controlMode,
  driving,
  night,
  onTelemetry,
  weather,
}: SimulationCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ autoDrive, cameraMode, controlMode, driving, night, weather, onTelemetry });

  useEffect(() => {
    stateRef.current = { autoDrive, cameraMode, controlMode, driving, night, weather, onTelemetry };
  }, [autoDrive, cameraMode, controlMode, driving, night, onTelemetry, weather]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9ec9db);
    scene.fog = new THREE.FogExp2(0x9ec9db, 0.0055);
    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 750);
    const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.shadowMap.enabled = mount.clientWidth > 700;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    addRoad(scene);
    addBuildings(scene);
    const signalBulbs = addTrafficLights(scene);

    const ambient = new THREE.HemisphereLight(0xcce9ff, 0x29332f, 2.1);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff0ce, 3.3);
    sun.position.set(-54, 92, -38);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    scene.add(sun);

    const player = makeCar(0xf3b51b);
    player.position.set(-3.2, 0, 110);
    player.rotation.y = Math.PI;
    scene.add(player);
    camera.position.set(-3.2, 5.8, 120.5);
    camera.lookAt(-3.2, 1.1, 102);
    const headlightTarget = new THREE.Object3D();
    scene.add(headlightTarget);
    const headlights: THREE.SpotLight[] = [];
    for (const x of [-0.58, 0.58]) {
      const headlight = new THREE.SpotLight(0xfff0c2, 0, 55, 0.5, 0.5, 1.15);
      headlight.userData.sideOffset = x;
      headlight.target = headlightTarget;
      scene.add(headlight);
      headlights.push(headlight);
    }

    const traffic: THREE.Group[] = [];
    const trafficColors = [0x3e7cc4, 0xf1f2f0, 0x9b3c45, 0x252a30, 0x56a17b];
    for (let i = 0; i < 12; i += 1) {
      const car = makeCar(trafficColors[i % trafficColors.length]);
      car.scale.setScalar(0.86 + (i % 3) * 0.05);
      car.position.set(i % 2 === 0 ? -3.2 : 3.2, 0, -210 + i * 34);
      car.rotation.y = i % 2 === 0 ? Math.PI : 0;
      car.userData.speed = 10 + (i % 4) * 1.3;
      scene.add(car);
      traffic.push(car);
    }

    const police = makeCar(0xf2f3f5, true);
    police.position.set(3.2, 0, 52);
    police.userData.speed = 14;
    scene.add(police);

    const rainCount = 1100;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i += 1) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 90;
      rainPositions[i * 3 + 1] = Math.random() * 45;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({ color: 0xcce9ff, size: 0.09, transparent: true, opacity: 0.7 }),
    );
    rain.visible = false;
    scene.add(rain);

    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => keys.add(event.code);
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const onVirtualInput = (event: Event) => {
      const detail = (event as CustomEvent<{ code: string; pressed: boolean }>).detail;
      if (detail.pressed) keys.add(detail.code);
      else keys.delete(detail.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('dasheats-input', onVirtualInput);

    let speed = 0;
    let fuel = 76;
    let heading = Math.PI;
    let distance = 0;
    let tickets = 0;
    let speedingSeconds = 0;
    let lastTelemetry = 0;
    let frameId = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const side = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();

    const resize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mount.clientWidth < 700 ? 1.25 : 1.65));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.elapsedTime;
      const dt = Math.min(clock.getDelta(), 0.04);
      const state = stateRef.current;
      const isRain = state.weather !== 'clear';
      const isStorm = state.weather === 'storm';

      const bg = state.night ? 0x08121d : isStorm ? 0x53646b : isRain ? 0x76929d : 0x9ec9db;
      scene.background = new THREE.Color(bg);
      if (scene.fog) scene.fog.color.setHex(bg);
      ambient.intensity = state.night ? 0.72 : isStorm ? 1.0 : 2.1;
      sun.intensity = state.night ? 0.22 : isStorm ? 0.8 : 3.3;
      renderer.toneMappingExposure = state.night ? 0.82 : isStorm ? 0.84 : 1.05;
      headlights.forEach((headlight) => { headlight.intensity = state.night ? 58 : 0; });
      rain.visible = isRain;

      const gamepad = state.controlMode === 'wheel' ? navigator.getGamepads?.()[0] : null;
      let throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
      let brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
      let steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      if (gamepad) {
        steer = -(gamepad.axes[0] ?? 0);
        throttle = Math.max(throttle, gamepad.buttons[7]?.value ?? 0);
        brake = Math.max(brake, gamepad.buttons[6]?.value ?? 0);
      }
      if (state.autoDrive && state.driving) {
        throttle = 0.72;
        brake = 0;
        steer = Math.sin(elapsed * 0.32) * 0.035;
      }
      if (!state.driving) {
        throttle = 0;
        brake = 0.45;
      }

      const grip = isStorm ? 0.62 : isRain ? 0.78 : 1;
      speed += throttle * 9.5 * dt;
      speed -= brake * 17 * dt;
      speed -= (0.45 + speed * 0.028) * dt;
      speed = THREE.MathUtils.clamp(speed, 0, 27);
      heading += steer * grip * (0.35 + speed * 0.022) * dt;
      forward.set(Math.sin(heading), 0, Math.cos(heading));
      player.position.addScaledVector(forward, speed * dt);
      player.rotation.y = heading;
      side.set(forward.z, 0, -forward.x);
      headlightTarget.position.copy(player.position).addScaledVector(forward, 24).setY(0.35);
      headlights.forEach((headlight) => {
        headlight.position.copy(player.position)
          .addScaledVector(forward, 1.7)
          .addScaledVector(side, headlight.userData.sideOffset)
          .setY(0.72);
      });
      if (Math.abs(player.position.x) > 8.1) player.position.x *= 0.995;
      if (player.position.z < -210) player.position.z = 210;
      if (player.position.z > 220) player.position.z = -200;
      distance += speed * dt;
      fuel = Math.max(0, fuel - speed * dt * 0.00075);

      const mph = speed * 2.237;
      if (mph > 45) speedingSeconds += dt;
      else speedingSeconds = Math.max(0, speedingSeconds - dt * 2);
      if (speedingSeconds > 5) {
        tickets += 1;
        speedingSeconds = 0;
      }

      traffic.forEach((car, index) => {
        const direction = index % 2 === 0 ? -1 : 1;
        car.position.z += direction * car.userData.speed * dt;
        if (car.position.z < -230) car.position.z = 230;
        if (car.position.z > 230) car.position.z = -230;
      });
      police.position.z += police.userData.speed * dt;
      if (police.position.z > 230) police.position.z = -230;
      const lightbar = police.getObjectByName('lightbar') as THREE.Mesh;
      if (lightbar) (lightbar.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(elapsed * 9) > 0 ? 0x278cff : 0xff334f);

      signalBulbs.forEach((bulb, index) => {
        const phase = (elapsed + index * 3.5) % 12;
        (bulb.material as THREE.MeshBasicMaterial).color.setHex(phase < 7 ? 0x36e683 : 0xff3f43);
      });

      if (rain.visible) {
        const positions = rainGeometry.attributes.position.array as Float32Array;
        for (let i = 0; i < rainCount; i += 1) {
          positions[i * 3 + 1] -= (isStorm ? 38 : 24) * dt;
          if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] = 45;
        }
        rainGeometry.attributes.position.needsUpdate = true;
        rain.position.set(player.position.x, 0, player.position.z);
      }

      player.visible = state.cameraMode !== 'cockpit';
      if (state.cameraMode === 'cockpit') {
        desiredCamera.copy(player.position).add(new THREE.Vector3(0, 1.42, 0));
        desiredCamera.addScaledVector(forward, 0.58);
        camera.position.lerp(desiredCamera, 0.24);
        cameraTarget.copy(player.position).addScaledVector(forward, 18).setY(1.25);
        camera.lookAt(cameraTarget);
        camera.fov = 72;
      } else {
        const portrait = camera.aspect < 0.7;
        desiredCamera.copy(player.position).add(new THREE.Vector3(0, portrait ? 7.2 : 5.8, 0));
        desiredCamera.addScaledVector(forward, portrait ? -15 : -10.5);
        camera.position.lerp(desiredCamera, 0.11);
        cameraTarget.copy(player.position).addScaledVector(forward, 8).setY(1.1);
        camera.lookAt(cameraTarget);
        camera.fov = 58;
      }
      camera.updateProjectionMatrix();

      if (elapsed - lastTelemetry > 0.12) {
        state.onTelemetry({ speed: mph, fuel, heading, distance, tickets });
        lastTelemetry = elapsed;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('dasheats-input', onVirtualInput);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="simulation-canvas" data-testid="simulation-canvas" ref={mountRef} />;
}
