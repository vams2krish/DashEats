import * as THREE from 'three';

export interface AnimatedAsset {
  mixer: THREE.AnimationMixer;
  root: THREE.Group;
}

export async function loadDashCarAsset(): Promise<AnimatedAsset> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/assets/blender/dashcar.glb');
  const root = gltf.scene;
  root.name = 'DashCar_Blender';
  root.position.y = -0.7;
  root.rotation.y = Math.PI;
  root.traverse((object) => {
    if (object.name.startsWith('Wheel_')) object.visible = false;
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  return { mixer, root };
}
