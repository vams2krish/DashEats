import { useEffect, useRef } from 'react';
import RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import {
  energyUsedPercent,
  refillCost,
  remainingRangeMiles,
  VEHICLE_SPECS,
  type Powertrain,
} from './vehicleSpecs';
import { loadDashCarAsset } from './blenderAssets';
import {
  addWorld,
  createRouteArrows,
  makePedestrian,
  makeTargetMarker,
  makeVehicle,
  ROAD_X,
  ROAD_Z,
  WORLD_EDGE,
  type VehicleVisual,
} from './worldBuilder';

export type WeatherMode = 'clear' | 'rain' | 'storm';
export type CameraMode = 'chase' | 'cockpit';
export type ControlMode = 'keyboard' | 'touch' | 'wheel';

export interface WorldTarget {
  x: number;
  z: number;
  label: string;
}

export interface Telemetry {
  speed: number;
  fuel: number;
  heading: number;
  distance: number;
  tickets: number;
  collisions: number;
  damage: number;
  wrongWay: boolean;
  nearStation: boolean;
  refuelCost: number;
  rangeMiles: number;
}

interface SimulationCanvasProps {
  autoDrive: boolean;
  cameraMode: CameraMode;
  controlMode: ControlMode;
  driving: boolean;
  night: boolean;
  onTelemetry: (telemetry: Telemetry) => void;
  powertrain: Powertrain;
  routeTarget: WorldTarget;
  weather: WeatherMode;
}

interface TrafficAgent {
  body: RAPIER.RigidBody;
  direction: 1 | -1;
  lane: number;
  police: boolean;
  speed: number;
  vertical: boolean;
  visual: VehicleVisual;
}

interface PedestrianAgent {
  body: RAPIER.RigidBody;
  direction: 1 | -1;
  phase: number;
  visual: THREE.Group;
}

const FIXED_STEP = 1 / 60;

function quaternionFromYaw(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function buildRoute(start: THREE.Vector3, target: WorldTarget) {
  const points = [start.clone().setY(0.06)];
  points.push(new THREE.Vector3(start.x, 0.06, target.z));
  points.push(new THREE.Vector3(target.x, 0.06, target.z));
  return points;
}

function routeDirection(position: THREE.Vector3, route: THREE.Vector3[]) {
  let bestDistance = Infinity;
  let bestDirection = new THREE.Vector3(0, 0, -1);
  let bestTarget = route.at(-1) ?? position;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segment = end.clone().sub(start);
    const lengthSq = segment.lengthSq();
    if (lengthSq < 0.001) continue;
    const amount = THREE.MathUtils.clamp(position.clone().sub(start).dot(segment) / lengthSq, 0, 1);
    const closest = start.clone().addScaledVector(segment, amount);
    const distance = closest.distanceToSquared(position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDirection = segment.normalize();
      bestTarget = amount > 0.82 && index + 2 < route.length ? route[index + 2] : end;
    }
  }
  return { direction: bestDirection, target: bestTarget };
}

function trafficShouldStop(agent: TrafficAgent, agents: TrafficAgent[], elapsed: number) {
  const coordinate = agent.vertical ? agent.body.translation().z : agent.body.translation().x;
  const intersections = agent.vertical ? ROAD_Z : ROAD_X;
  const green = agent.vertical ? elapsed % 16 < 8 : elapsed % 16 >= 8;
  if (!green) {
    for (const intersection of intersections) {
      const ahead = (intersection - coordinate) * agent.direction;
      if (ahead > 3.5 && ahead < 15) return true;
    }
  }
  return agents.some((other) => {
    if (other === agent || other.vertical !== agent.vertical || other.lane !== agent.lane || other.direction !== agent.direction) return false;
    const otherCoordinate = other.vertical ? other.body.translation().z : other.body.translation().x;
    let ahead = (otherCoordinate - coordinate) * agent.direction;
    if (ahead < -WORLD_EDGE) ahead += WORLD_EDGE * 2;
    return ahead > 0 && ahead < 10;
  });
}

export default function SimulationCanvas(props: SimulationCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(props);

  useEffect(() => {
    stateRef.current = props;
  }, [props]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      if (disposed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x9ec9db);
      scene.fog = new THREE.FogExp2(0x9ec9db, 0.0048);
      const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 760);
      const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      renderer.shadowMap.enabled = mount.clientWidth > 700;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      mount.appendChild(renderer.domElement);

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world.integrationParameters.dt = FIXED_STEP;
      const eventQueue = new RAPIER.EventQueue(true);
      const { signalBulbs, stationPosition } = addWorld(scene, world);

      const ambient = new THREE.HemisphereLight(0xcce9ff, 0x29332f, 2.15);
      const sun = new THREE.DirectionalLight(0xfff0ce, 3.3);
      sun.position.set(-54, 92, -38);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -90;
      sun.shadow.camera.right = 90;
      sun.shadow.camera.top = 90;
      sun.shadow.camera.bottom = -90;
      scene.add(ambient, sun);

      const player = makeVehicle(0xf3b51b);
      scene.add(player.group);
      const assetMixers: THREE.AnimationMixer[] = [];
      void loadDashCarAsset().then(({ mixer, root }) => {
        if (disposed) return;
        player.group.children.forEach((child) => {
          if (!player.wheels.includes(child as THREE.Group)) child.visible = false;
        });
        player.group.add(root);
        assetMixers.push(mixer);
      }).catch(() => {
        // The procedural vehicle remains available if a streamed GLB cannot load.
      });
      let activePowertrain = stateRef.current.powertrain;
      const chassis = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 1.05, 110)
          .setRotation(quaternionFromYaw(Math.PI))
          .setLinearDamping(0.12)
          .setAngularDamping(1.7)
          .setCanSleep(false)
          .setCcdEnabled(true)
          .setAdditionalMass(VEHICLE_SPECS[activePowertrain].massKg),
      );
      const playerCollider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.84, 0.34, 1.78)
          .setTranslation(0, -0.16, 0)
          .setFriction(0.8)
          .setRestitution(0.08)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        chassis,
      );
      const vehicle = world.createVehicleController(chassis);
      vehicle.indexUpAxis = 1;
      vehicle.setIndexForwardAxis = 2;
      const connections = [
        { x: -0.91, y: -0.32, z: 1.18 },
        { x: 0.91, y: -0.32, z: 1.18 },
        { x: -0.91, y: -0.32, z: -1.18 },
        { x: 0.91, y: -0.32, z: -1.18 },
      ];
      connections.forEach((connection, index) => {
        vehicle.addWheel(connection, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.34, 0.33);
        vehicle.setWheelSuspensionStiffness(index, 34);
        vehicle.setWheelSuspensionCompression(index, 4.8);
        vehicle.setWheelSuspensionRelaxation(index, 6.2);
        vehicle.setWheelMaxSuspensionTravel(index, 0.28);
        vehicle.setWheelMaxSuspensionForce(index, 9800);
        vehicle.setWheelFrictionSlip(index, 3.4);
        vehicle.setWheelSideFrictionStiffness(index, 1.25);
      });

      const traffic: TrafficAgent[] = [];
      const colors = [0x3e7cc4, 0xf1f2f0, 0x9b3c45, 0x252a30, 0x56a17b, 0xc9872c];
      for (let index = 0; index < 20; index += 1) {
        const vertical = index < 13;
        const direction: 1 | -1 = index % 2 === 0 ? -1 : 1;
        const road = vertical ? ROAD_X[index % ROAD_X.length] : ROAD_Z[index % ROAD_Z.length];
        const lane = road + direction * (vertical ? 3.35 : -3.35);
        const coordinate = -205 + ((index * 37) % 410);
        const police = index === 4;
        const visual = makeVehicle(police ? 0xf1f3f5 : colors[index % colors.length], police, index % 7 === 0);
        const yaw = vertical ? (direction > 0 ? 0 : Math.PI) : (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(vertical ? lane : coordinate, 0.92, vertical ? coordinate : lane)
            .setRotation(quaternionFromYaw(yaw)),
        );
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.84, 0.38, 1.78).setFriction(0.9), body);
        scene.add(visual.group);
        traffic.push({ body, direction, lane, police, speed: 8.5 + (index % 5) * 0.7, vertical, visual });
      }

      const pedestrians: PedestrianAgent[] = [];
      for (let index = 0; index < 8; index += 1) {
        const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
        const x = -11 + (index % 4) * 5;
        const z = ROAD_Z[index % ROAD_Z.length] + 10.2;
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0, z));
        world.createCollider(RAPIER.ColliderDesc.capsule(0.58, 0.28).setTranslation(0, 0.86, 0), body);
        const visual = makePedestrian([0xc84f44, 0x3d79ba, 0xe1a32d, 0x5d8c62][index % 4]);
        scene.add(visual);
        pedestrians.push({ body, direction, phase: index * 0.8, visual });
      }

      const targetMarker = makeTargetMarker(0xf3b51b);
      targetMarker.position.set(props.routeTarget.x, 0, props.routeTarget.z);
      scene.add(targetMarker);
      let activeTarget = `${props.routeTarget.x}:${props.routeTarget.z}`;
      let activeRoute = buildRoute(new THREE.Vector3(0, 0, 110), props.routeTarget);
      let routeArrows = createRouteArrows(scene, activeRoute);

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

      const rainCount = 900;
      const rainPositions = new Float32Array(rainCount * 3);
      for (let index = 0; index < rainCount; index += 1) {
        rainPositions[index * 3] = (Math.random() - 0.5) * 90;
        rainPositions[index * 3 + 1] = Math.random() * 45;
        rainPositions[index * 3 + 2] = (Math.random() - 0.5) * 100;
      }
      const rainGeometry = new THREE.BufferGeometry();
      rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
      const rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: 0xcce9ff, size: 0.09, transparent: true, opacity: 0.7 }));
      scene.add(rain);

      const keys = new Set<string>();
      const onKeyDown = (event: KeyboardEvent) => keys.add(event.code);
      const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
      const onVirtualInput = (event: Event) => {
        const detail = (event as CustomEvent<{ code: string; pressed: boolean }>).detail;
        if (detail.pressed) keys.add(detail.code);
        else keys.delete(detail.code);
      };
      let refuelRequested = false;
      const onRefuel = () => { refuelRequested = true; };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('dasheats-input', onVirtualInput);
      window.addEventListener('dasheats-refuel', onRefuel);

      let energy = 76;
      let distance = 0;
      let tickets = 0;
      let collisions = 0;
      let damage = 0;
      let refuelSpend = 0;
      let speedingSeconds = 0;
      let lastTelemetry = 0;
      let lastCollision = -10;
      let frameId = 0;
      let accumulator = 0;
      let lastFrameTime = performance.now();
      let elapsed = 0;
      const previousPosition = new THREE.Vector3(0, 1.05, 110);
      const playerPosition = previousPosition.clone();
      const playerQuaternion = new THREE.Quaternion();
      const forward = new THREE.Vector3(0, 0, -1);
      const side = new THREE.Vector3();
      const cameraTarget = new THREE.Vector3();
      const desiredCamera = new THREE.Vector3();

      const resize = () => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, mount.clientWidth < 700 ? 1.2 : 1.6));
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);

      const animate = () => {
        frameId = requestAnimationFrame(animate);
        const now = performance.now();
        const frameDt = Math.min((now - lastFrameTime) / 1000, 0.05);
        lastFrameTime = now;
        elapsed += frameDt;
        const state = stateRef.current;
        assetMixers.forEach((mixer) => mixer.update(frameDt));
        const isRain = state.weather !== 'clear';
        const isStorm = state.weather === 'storm';
        const spec = VEHICLE_SPECS[state.powertrain];

        if (state.powertrain !== activePowertrain) {
          activePowertrain = state.powertrain;
          chassis.setAdditionalMass(spec.massKg, true);
        }
        const targetKey = `${state.routeTarget.x}:${state.routeTarget.z}`;
        if (targetKey !== activeTarget) {
          routeArrows.forEach((arrow) => {
            scene.remove(arrow);
            arrow.geometry.dispose();
            (arrow.material as THREE.Material).dispose();
          });
          activeTarget = targetKey;
          activeRoute = buildRoute(playerPosition, state.routeTarget);
          routeArrows = createRouteArrows(scene, activeRoute);
          targetMarker.position.set(state.routeTarget.x, 0, state.routeTarget.z);
        }

        const bg = state.night ? 0x07121d : isStorm ? 0x53646b : isRain ? 0x76929d : 0x9ec9db;
        scene.background = new THREE.Color(bg);
        if (scene.fog) scene.fog.color.setHex(bg);
        ambient.intensity = state.night ? 0.72 : isStorm ? 1 : 2.15;
        sun.intensity = state.night ? 0.2 : isStorm ? 0.8 : 3.3;
        renderer.toneMappingExposure = state.night ? 0.82 : isStorm ? 0.84 : 1.05;
        headlights.forEach((headlight) => { headlight.intensity = state.night ? 58 : 0; });
        rain.visible = isRain;

        const bodyRotation = chassis.rotation();
        playerQuaternion.set(bodyRotation.x, bodyRotation.y, bodyRotation.z, bodyRotation.w);
        forward.set(0, 0, 1).applyQuaternion(playerQuaternion).setY(0).normalize();
        const bodyTranslation = chassis.translation();
        playerPosition.set(bodyTranslation.x, bodyTranslation.y, bodyTranslation.z);

        const gamepad = state.controlMode === 'wheel' ? navigator.getGamepads?.()[0] : null;
        let throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
        let brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
        let steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
        if (gamepad) {
          steer = -(gamepad.axes[0] ?? 0);
          throttle = Math.max(throttle, gamepad.buttons[7]?.value ?? 0);
          brake = Math.max(brake, gamepad.buttons[6]?.value ?? 0);
        }
        const guidance = routeDirection(playerPosition, activeRoute);
        if (state.autoDrive && state.driving) {
          const desired = guidance.target.clone().sub(playerPosition).setY(0).normalize();
          const angle = Math.atan2(forward.z * desired.x - forward.x * desired.z, THREE.MathUtils.clamp(forward.dot(desired), -1, 1));
          steer = THREE.MathUtils.clamp(angle * 1.45, -0.55, 0.55);
          throttle = Math.abs(angle) > 0.72 ? 0.28 : 0.66;
          brake = Math.abs(vehicle.currentVehicleSpeed()) > 19 && Math.abs(angle) > 0.45 ? 0.32 : 0;
        }
        if (!state.driving || energy <= 0) {
          throttle = 0;
          brake = 0.65;
        }
        const speedMps = Math.abs(vehicle.currentVehicleSpeed());
        if (speedMps > spec.maxSpeedMps) throttle = 0;
        const grip = isStorm ? 0.72 : isRain ? 0.86 : 1;
        for (let index = 0; index < 4; index += 1) {
          vehicle.setWheelFrictionSlip(index, 3.4 * grip);
          vehicle.setWheelBrake(index, brake * spec.brakeForce);
          vehicle.setWheelEngineForce(index, index > 1 ? throttle * spec.engineForce : 0);
          vehicle.setWheelSteering(index, index < 2 ? steer * 0.52 : 0);
        }

        accumulator = Math.min(accumulator + frameDt, FIXED_STEP * 3);
        while (accumulator >= FIXED_STEP) {
          vehicle.updateVehicle(FIXED_STEP);
          traffic.forEach((agent) => {
            const translation = agent.body.translation();
            const step = (trafficShouldStop(agent, traffic, elapsed) ? 0 : agent.speed) * FIXED_STEP * agent.direction;
            let x = translation.x + (agent.vertical ? 0 : step);
            let z = translation.z + (agent.vertical ? step : 0);
            if (x < -WORLD_EDGE) x = WORLD_EDGE;
            if (x > WORLD_EDGE) x = -WORLD_EDGE;
            if (z < -WORLD_EDGE) z = WORLD_EDGE;
            if (z > WORLD_EDGE) z = -WORLD_EDGE;
            agent.body.setNextKinematicTranslation({ x, y: 0.92, z });
          });
          const pedestrianWalk = elapsed % 16 >= 8;
          pedestrians.forEach((pedestrian) => {
            const translation = pedestrian.body.translation();
            let x = translation.x + (pedestrianWalk ? pedestrian.direction * 1.35 * FIXED_STEP : 0);
            if (x > 11 || x < -11) {
              pedestrian.direction = pedestrian.direction === 1 ? -1 : 1;
              x = THREE.MathUtils.clamp(x, -11, 11);
            }
            pedestrian.body.setNextKinematicTranslation({ x, y: 0, z: translation.z });
          });
          world.step(eventQueue);
          eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            if (started && elapsed - lastCollision >= 0.45 && (handle1 === playerCollider.handle || handle2 === playerCollider.handle)) {
              collisions += 1;
              damage = Math.min(100, damage + Math.max(3, speedMps * 0.8));
              lastCollision = elapsed;
            }
          });
          accumulator -= FIXED_STEP;
        }

        const nextTranslation = chassis.translation();
        const nextPosition = new THREE.Vector3(nextTranslation.x, nextTranslation.y, nextTranslation.z);
        const travelled = nextPosition.distanceTo(previousPosition);
        if (travelled < 4) {
          distance += travelled;
          energy = Math.max(0, energy - energyUsedPercent(spec, travelled, 1 + throttle * 0.16 + (isStorm ? 0.1 : 0)));
        }
        previousPosition.copy(nextPosition);
        player.group.position.copy(nextPosition);
        const nextRotation = chassis.rotation();
        player.group.quaternion.set(nextRotation.x, nextRotation.y, nextRotation.z, nextRotation.w);
        playerQuaternion.copy(player.group.quaternion);
        forward.set(0, 0, 1).applyQuaternion(playerQuaternion).setY(0).normalize();
        side.set(1, 0, 0).applyQuaternion(playerQuaternion).setY(0).normalize();

        player.wheels.forEach((wheel, index) => {
          const connection = vehicle.wheelChassisConnectionPointCs(index);
          const suspension = vehicle.wheelSuspensionLength(index) ?? 0.34;
          if (connection) wheel.position.set(connection.x, connection.y - suspension, connection.z);
          wheel.rotation.order = 'YXZ';
          wheel.rotation.y = vehicle.wheelSteering(index) ?? 0;
          wheel.rotation.x = -(vehicle.wheelRotation(index) ?? 0);
        });

        if (nextTranslation.y < -4 || Math.abs(nextTranslation.x) > 245 || Math.abs(nextTranslation.z) > 245) {
          chassis.setTranslation({ x: 0, y: 1.2, z: 110 }, true);
          chassis.setRotation(quaternionFromYaw(Math.PI), true);
          chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
          chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        const nearStation = nextPosition.clone().setY(0).distanceTo(stationPosition) < 17 && speedMps < 2.2;
        if (refuelRequested) {
          if (nearStation) {
            refuelSpend += refillCost(spec, energy);
            energy = 100;
          }
          refuelRequested = false;
        }
        const mph = speedMps * 2.237;
        if (mph > 45) speedingSeconds += frameDt;
        else speedingSeconds = Math.max(0, speedingSeconds - frameDt * 2);
        if (speedingSeconds > 5) {
          tickets += 1;
          speedingSeconds = 0;
        }

        traffic.forEach((agent) => {
          const position = agent.body.translation();
          const rotation = agent.body.rotation();
          agent.visual.group.position.set(position.x, position.y, position.z);
          agent.visual.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
          agent.visual.wheels.forEach((wheel) => { wheel.rotation.x -= agent.speed * frameDt * 0.75; });
          if (agent.police) {
            const lightbar = agent.visual.group.getObjectByName('lightbar') as THREE.Mesh;
            if (lightbar) (lightbar.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(elapsed * 10) > 0 ? 0x278cff : 0xff334f);
          }
        });
        pedestrians.forEach((pedestrian) => {
          const position = pedestrian.body.translation();
          pedestrian.visual.position.set(position.x, position.y, position.z);
          pedestrian.visual.rotation.y = pedestrian.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
          const stride = Math.sin(elapsed * 7 + pedestrian.phase) * 0.5;
          const left = pedestrian.visual.getObjectByName('leg-left');
          const right = pedestrian.visual.getObjectByName('leg-right');
          if (left) left.rotation.x = stride;
          if (right) right.rotation.x = -stride;
        });
        signalBulbs.forEach(({ mesh, vertical, offset }) => {
          const green = vertical ? (elapsed + offset) % 16 < 8 : (elapsed + offset) % 16 >= 8;
          (mesh.material as THREE.MeshBasicMaterial).color.setHex(green ? 0x35df81 : 0xff3e45);
        });

        const guidanceNow = routeDirection(nextPosition, activeRoute);
        const wrongWay = mph > 5 && forward.dot(guidanceNow.direction) < -0.25;
        routeArrows.forEach((arrow, index) => {
          (arrow.material as THREE.MeshBasicMaterial).color.setHex(wrongWay ? 0xff3644 : 0xf4bd22);
          arrow.position.y = 0.11 + Math.sin(elapsed * 3.2 + index * 0.45) * 0.035;
        });
        targetMarker.rotation.y += frameDt * 0.7;
        targetMarker.visible = state.driving;

        headlightTarget.position.copy(nextPosition).addScaledVector(forward, 24).setY(0.4);
        headlights.forEach((headlight) => {
          headlight.position.copy(nextPosition).addScaledVector(forward, 1.72).addScaledVector(side, headlight.userData.sideOffset).setY(nextPosition.y + 0.15);
        });
        if (rain.visible) {
          const positions = rainGeometry.attributes.position.array as Float32Array;
          for (let index = 0; index < rainCount; index += 1) {
            positions[index * 3 + 1] -= (isStorm ? 38 : 24) * frameDt;
            if (positions[index * 3 + 1] < 0) positions[index * 3 + 1] = 45;
          }
          rainGeometry.attributes.position.needsUpdate = true;
          rain.position.copy(nextPosition).setY(0);
        }

        player.group.visible = state.cameraMode !== 'cockpit';
        if (state.cameraMode === 'cockpit') {
          desiredCamera.copy(nextPosition).addScaledVector(forward, 0.62).setY(nextPosition.y + 0.68);
          camera.position.lerp(desiredCamera, 0.28);
          cameraTarget.copy(nextPosition).addScaledVector(forward, 18).setY(nextPosition.y + 0.5);
          camera.lookAt(cameraTarget);
          camera.fov = 72;
        } else {
          const portrait = camera.aspect < 0.7;
          desiredCamera.copy(nextPosition).addScaledVector(forward, portrait ? -15 : -10.5);
          desiredCamera.y += portrait ? 7.4 : 5.9;
          camera.position.lerp(desiredCamera, 0.12);
          cameraTarget.copy(nextPosition).addScaledVector(forward, 8).setY(nextPosition.y + 0.25);
          camera.lookAt(cameraTarget);
          camera.fov = 58;
        }
        camera.updateProjectionMatrix();

        if (elapsed - lastTelemetry > 0.12) {
          state.onTelemetry({
            speed: mph,
            fuel: energy,
            heading: Math.atan2(forward.x, forward.z),
            distance,
            tickets,
            collisions,
            damage,
            wrongWay,
            nearStation,
            refuelCost: refuelSpend,
            rangeMiles: remainingRangeMiles(spec, energy),
          });
          lastTelemetry = elapsed;
        }
        renderer.render(scene, camera);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(frameId);
        observer.disconnect();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('dasheats-input', onVirtualInput);
        window.removeEventListener('dasheats-refuel', onRefuel);
        world.removeVehicleController(vehicle);
        eventQueue.free();
        world.free();
        renderer.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    };

    void start();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div className="simulation-canvas" data-testid="simulation-canvas" ref={mountRef} />;
}
