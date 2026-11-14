import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: any;
  }
}

const CESIUM_VERSION = '1.134';
const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/`;

let loaderPromise: Promise<void> | null = null;

function loadCesium() {
  if (window.Cesium) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    window.CESIUM_BASE_URL = CESIUM_BASE;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = `${CESIUM_BASE}Widgets/widgets.css`;
    document.head.appendChild(stylesheet);
    const script = document.createElement('script');
    script.src = `${CESIUM_BASE}Cesium.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('CesiumJS could not be loaded.'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

interface CesiumWorldProps {
  apiKey: string;
}

export default function CesiumWorld({ apiKey }: CesiumWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let viewer: any;
    let active = true;
    const start = async () => {
      try {
        await loadCesium();
        if (!active || !containerRef.current) return;
        const Cesium = window.Cesium;
        viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayer: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
        });
        viewer.scene.globe.show = false;
        viewer.scene.fog.enabled = true;
        viewer.scene.requestRenderMode = true;
        viewer.scene.maximumRenderTimeChange = 1 / 20;
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`,
          {
            cacheBytes: 192 * 1024 * 1024,
            maximumCacheOverflowBytes: 96 * 1024 * 1024,
            maximumScreenSpaceError: 18,
            showCreditsOnScreen: true,
            skipLevelOfDetail: true,
          },
        );
        viewer.scene.primitives.add(tileset);
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(-122.4078, 37.7847, 420),
          orientation: {
            heading: Cesium.Math.toRadians(195),
            pitch: Cesium.Math.toRadians(-24),
            roll: 0,
          },
        });
        viewer.scene.requestRender();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Photorealistic tiles could not be loaded.');
      }
    };
    void start();
    return () => {
      active = false;
      viewer?.destroy();
    };
  }, [apiKey]);

  return (
    <div className="cesium-world" data-testid="cesium-world">
      <div className="cesium-mount" ref={containerRef} />
      {!error && (
        <div className="world-loading" role="status">
          <LoaderCircle className="spin" size={18} /> Streaming Google 3D Tiles
        </div>
      )}
      {error && (
        <div className="world-error" role="alert">
          <TriangleAlert size={18} /> {error}
        </div>
      )}
    </div>
  );
}
