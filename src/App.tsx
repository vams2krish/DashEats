import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraIcon,
  CarFront,
  Check,
  ChevronRight,
  CloudRain,
  Fuel,
  Gamepad2,
  Gauge,
  LocateFixed,
  Map,
  Moon,
  Navigation,
  PackageCheck,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sun,
  Volume2,
  X,
} from 'lucide-react';
import type {
  CameraMode,
  ControlMode,
  Telemetry,
  WeatherMode,
} from './game/SimulationCanvas';
import { advanceTask, isDrivingStage, type TaskEvent, type TaskStage } from './game/taskMachine';

const CesiumWorld = lazy(() => import('./components/CesiumWorld'));
const MiniMap = lazy(() => import('./components/MiniMap'));
const SimulationCanvas = lazy(() => import('./game/SimulationCanvas'));

const stageLabels: Record<TaskStage, string> = {
  offer: 'New offer',
  toPickup: 'Drive to pickup',
  pickupOtp: 'Verify pickup',
  storeWait: 'Order preparation',
  toDropoff: 'Drive to customer',
  photoProof: 'Delivery proof',
  complete: 'Delivery complete',
};

const initialTelemetry: Telemetry = { speed: 0, fuel: 76, heading: Math.PI, distance: 0, tickets: 0 };

function emitInput(code: string, pressed: boolean) {
  window.dispatchEvent(new CustomEvent('dasheats-input', { detail: { code, pressed } }));
}

function useGameAudio() {
  const audioRef = useRef<AudioContext | null>(null);
  return useCallback((tone: 'tap' | 'success' | 'alert' = 'tap') => {
    const AudioContextClass = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioRef.current ?? new AudioContextClass();
    audioRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone === 'alert' ? 'square' : 'sine';
    oscillator.frequency.value = tone === 'success' ? 740 : tone === 'alert' ? 220 : 460;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (tone === 'success' ? 0.28 : 0.12));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (tone === 'success' ? 0.28 : 0.12));
  }, []);
}

export default function App() {
  const fastDemo = useMemo(() => new URLSearchParams(window.location.search).get('demo') === 'fast', []);
  const [stage, setStage] = useState<TaskStage>('offer');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [controlMode, setControlMode] = useState<ControlMode>('keyboard');
  const [weather, setWeather] = useState<WeatherMode>('clear');
  const [night, setNight] = useState(false);
  const [autoDrive, setAutoDrive] = useState(false);
  const [routeProgress, setRouteProgress] = useState(0);
  const [telemetry, setTelemetry] = useState<Telemetry>(initialTelemetry);
  const [waitSeconds, setWaitSeconds] = useState(8);
  const [otp, setOtp] = useState('');
  const [photoTaken, setPhotoTaken] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [googleKey, setGoogleKey] = useState(
    () => sessionStorage.getItem('dasheats.googleKey') ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  );
  const [draftKey, setDraftKey] = useState('');
  const [worldMode, setWorldMode] = useState<'sim' | 'google'>('sim');
  const [weatherLabel, setWeatherLabel] = useState('Simulated · Clear · 64°F');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const playSound = useGameAudio();
  const driving = isDrivingStage(stage);

  const advance = useCallback(
    (event: TaskEvent) => {
      setStage((current) => advanceTask(current, event));
      playSound(event === 'CONFIRM_PHOTO' ? 'success' : 'tap');
    },
    [playSound],
  );

  useEffect(() => {
    if (!driving) setAutoDrive(false);
  }, [driving]);

  useEffect(() => {
    if (!autoDrive || !driving) return;
    const timer = window.setInterval(() => {
      setRouteProgress((value) => Math.min(100, value + (fastDemo ? 5 : 2.5)));
    }, 100);
    return () => window.clearInterval(timer);
  }, [autoDrive, driving, fastDemo]);

  useEffect(() => {
    if (routeProgress < 100) return;
    if (stage === 'toPickup') advance('ARRIVE_PICKUP');
    if (stage === 'toDropoff') advance('ARRIVE_DROPOFF');
    setRouteProgress(0);
  }, [advance, routeProgress, stage]);

  useEffect(() => {
    if (stage !== 'storeWait') return;
    if (waitSeconds <= 0) {
      advance('ORDER_READY');
      setWaitSeconds(8);
      return;
    }
    const timer = window.setTimeout(() => setWaitSeconds((value) => value - 1), fastDemo ? 150 : 1000);
    return () => window.clearTimeout(timer);
  }, [advance, fastDemo, stage, waitSeconds]);

  const loadWeather = useCallback(async () => {
    if (!googleKey) {
      setShowSettings(true);
      return;
    }
    setWeatherLoading(true);
    try {
      const query = new URLSearchParams({
        key: googleKey,
        'location.latitude': '37.7847',
        'location.longitude': '-122.4078',
        unitsSystem: 'IMPERIAL',
      });
      const response = await fetch(`https://weather.googleapis.com/v1/currentConditions:lookup?${query}`);
      if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
      const data = await response.json();
      const type = String(data.weatherCondition?.type ?? 'CLEAR');
      const nextWeather: WeatherMode = type.includes('THUNDER') ? 'storm' : type.includes('RAIN') ? 'rain' : 'clear';
      setWeather(nextWeather);
      setNight(data.isDaytime === false);
      setWeatherLabel(
        `Live · ${data.weatherCondition?.description?.text ?? 'Current'} · ${Math.round(data.temperature?.degrees ?? 64)}°F`,
      );
      playSound('success');
    } catch (reason) {
      setWeatherLabel(reason instanceof Error ? reason.message : 'Live weather unavailable');
      playSound('alert');
    } finally {
      setWeatherLoading(false);
    }
  }, [googleKey, playSound]);

  const saveKey = () => {
    const value = draftKey.trim();
    if (!value) return;
    sessionStorage.setItem('dasheats.googleKey', value);
    setGoogleKey(value);
    setDraftKey('');
    setShowSettings(false);
    playSound('success');
  };

  const resetRun = () => {
    setStage('offer');
    setRouteProgress(0);
    setOtp('');
    setPhotoTaken(false);
    setWaitSeconds(8);
    setTelemetry(initialTelemetry);
    playSound('tap');
  };

  const turnCamera = () => {
    setCameraMode((mode) => (mode === 'chase' ? 'cockpit' : 'chase'));
    playSound('tap');
  };

  const direction = useMemo(() => (stage === 'toDropoff' ? 'Turn right on 5th St' : 'Continue on Market St'), [stage]);

  return (
    <main className={`game-shell weather-${weather} ${night ? 'is-night' : ''}`}>
      <section className="world-layer" aria-label="Driving simulation">
        <Suspense fallback={<div className="world-skeleton" />}>{worldMode === 'google' && googleKey ? (
            <CesiumWorld apiKey={googleKey} />
          ) : (
            <SimulationCanvas
              autoDrive={autoDrive}
              cameraMode={cameraMode}
              controlMode={controlMode}
              driving={driving}
              night={night}
              onTelemetry={setTelemetry}
              weather={weather}
            />
          )}</Suspense>
      </section>

      <header className="top-bar">
        <div className="brand-lockup" aria-label="DashEats DriverSim">
          <span className="brand-mark"><Navigation size={18} fill="currentColor" /></span>
          <div><strong>DashEats</strong><small>DRIVER SIM</small></div>
        </div>
        <div className="session-status"><span className="online-dot" /> ONLINE <b>$128.40</b></div>
        <nav className="top-actions" aria-label="View controls">
          <button className="icon-button" onClick={turnCamera} title="Switch camera" aria-label="Switch camera"><Camera size={19} /></button>
          <button className="icon-button" onClick={() => setNight((value) => !value)} title="Toggle day and night" aria-label="Toggle day and night">{night ? <Sun size={19} /> : <Moon size={19} />}</button>
          <button className="icon-button" onClick={() => void loadWeather()} title="Load live weather" aria-label="Load live weather" disabled={weatherLoading}><CloudRain className={weatherLoading ? 'spin' : ''} size={19} /></button>
          <button className="icon-button" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings"><Settings size={19} /></button>
        </nav>
      </header>

      <aside className="mission-panel" data-testid="mission-panel">
        <div className="mission-head">
          <span className="eyebrow">ACTIVE TASK · #DE-2048</span>
          <span className="pay-badge">$18.75</span>
        </div>
        <h1>{stageLabels[stage]}</h1>
        <div className="route-stop active"><span>A</span><div><b>Harbor Kitchen</b><small>91 5th Street · 0.8 mi</small></div></div>
        <div className="route-line" />
        <div className="route-stop"><span>B</span><div><b>Jordan M.</b><small>855 Bryant Street · 2.3 mi</small></div></div>
        <div className="mission-meta"><span>12 min</span><span>3.1 mi</span><span>Priority</span></div>
        {stage === 'offer' ? (
          <div className="offer-actions">
            <button className="button ghost" onClick={() => playSound('tap')}>Decline</button>
            <button className="button primary" data-testid="accept-offer" onClick={() => advance('ACCEPT')}>Accept <ChevronRight size={18} /></button>
          </div>
        ) : (
          <div className="task-progress"><span style={{ width: `${routeProgress}%` }} /></div>
        )}
      </aside>

      <aside className="map-panel">
        <Suspense fallback={<div className="mini-map map-skeleton" />}><MiniMap progress={routeProgress} /></Suspense>
        <div className="map-caption"><LocateFixed size={15} /><span>{direction}<small>in 450 ft</small></span></div>
      </aside>

      <div className="drive-status">
        <div className="speedometer"><span>{Math.round(telemetry.speed)}</span><small>MPH</small></div>
        <div className="speed-limit"><small>SPEED</small><b>35</b></div>
        <div className="vehicle-bars">
          <div><Fuel size={16} /><span><i style={{ width: `${telemetry.fuel}%` }} /></span><b>{Math.round(telemetry.fuel)}%</b></div>
          <div><ShieldAlert size={16} /><span><i className="health" style={{ width: `${100 - telemetry.tickets * 12}%` }} /></span><b>{telemetry.tickets}</b></div>
        </div>
      </div>

      <div className="weather-chip"><CloudRain size={15} /> {weatherLabel}</div>

      <div className="camera-chip"><CameraIcon size={15} /> {cameraMode === 'chase' ? 'CHASE CAM' : 'COCKPIT'}</div>

      {driving && worldMode === 'sim' && (
        <div className="autodrive-control">
          <button className={`button ${autoDrive ? 'danger' : 'primary'}`} data-testid="auto-drive" onClick={() => setAutoDrive((value) => !value)}>
            {autoDrive ? <Pause size={17} /> : <Play size={17} />}{autoDrive ? 'Pause' : 'Auto drive'}
          </button>
        </div>
      )}

      {controlMode !== 'wheel' && worldMode === 'sim' && (
        <div className="touch-controls" aria-label="Driving controls">
          <div className="steering-pad">
            <button className="control-button" aria-label="Steer left" onPointerDown={() => emitInput('ArrowLeft', true)} onPointerUp={() => emitInput('ArrowLeft', false)} onPointerLeave={() => emitInput('ArrowLeft', false)}>←</button>
            <button className="control-button" aria-label="Steer right" onPointerDown={() => emitInput('ArrowRight', true)} onPointerUp={() => emitInput('ArrowRight', false)} onPointerLeave={() => emitInput('ArrowRight', false)}>→</button>
          </div>
          <div className="pedals">
            <button className="pedal brake" aria-label="Brake" onPointerDown={() => emitInput('ArrowDown', true)} onPointerUp={() => emitInput('ArrowDown', false)} onPointerLeave={() => emitInput('ArrowDown', false)}>BRAKE</button>
            <button className="pedal throttle" aria-label="Accelerate" onPointerDown={() => emitInput('ArrowUp', true)} onPointerUp={() => emitInput('ArrowUp', false)} onPointerLeave={() => emitInput('ArrowUp', false)}>GO</button>
          </div>
        </div>
      )}

      {stage === 'pickupOtp' && (
        <div className="modal-scrim" data-testid="otp-modal">
          <section className="flow-modal" role="dialog" aria-modal="true" aria-labelledby="otp-title">
            <span className="modal-icon"><PackageCheck /></span>
            <span className="eyebrow">PICKUP CONFIRMATION</span>
            <h2 id="otp-title">Enter store PIN</h2>
            <p>Ask the counter for the four-digit order code.</p>
            <input autoFocus inputMode="numeric" maxLength={4} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="••••" aria-label="Store PIN" />
            <button className="button primary wide" data-testid="verify-otp" disabled={otp !== '4281'} onClick={() => advance('VERIFY_OTP')}><Check size={18} /> Verify pickup</button>
            <small className="test-hint">Demo PIN: 4281</small>
          </section>
        </div>
      )}

      {stage === 'storeWait' && (
        <div className="modal-scrim" data-testid="wait-modal">
          <section className="flow-modal queue-modal" role="dialog" aria-modal="true" aria-labelledby="wait-title">
            <span className="queue-number">A17</span>
            <span className="eyebrow">HARBOR KITCHEN</span>
            <h2 id="wait-title">Order is being packed</h2>
            <p>3 drivers ahead · Prep status received</p>
            <div className="wait-meter"><span style={{ width: `${(8 - waitSeconds) * 12.5}%` }} /></div>
            <b className="wait-time">00:{String(waitSeconds).padStart(2, '0')}</b>
          </section>
        </div>
      )}

      {stage === 'photoProof' && (
        <div className="modal-scrim" data-testid="photo-modal">
          <section className="flow-modal photo-modal" role="dialog" aria-modal="true" aria-labelledby="photo-title">
            <span className="eyebrow">LEAVE AT DOOR</span>
            <h2 id="photo-title">Delivery proof</h2>
            <div className={`photo-preview ${photoTaken ? 'captured' : ''}`}>
              {photoTaken ? <><PackageCheck size={42} /><span>Photo captured</span></> : <><Camera size={42} /><span>Frame package and door</span></>}
            </div>
            {!photoTaken ? (
              <button className="button primary wide" data-testid="capture-photo" onClick={() => { setPhotoTaken(true); playSound('tap'); }}><Camera size={18} /> Capture proof</button>
            ) : (
              <button className="button primary wide" data-testid="confirm-delivery" onClick={() => advance('CONFIRM_PHOTO')}><Check size={18} /> Complete delivery</button>
            )}
          </section>
        </div>
      )}

      {stage === 'complete' && (
        <div className="modal-scrim" data-testid="complete-modal">
          <section className="flow-modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <span className="result-grade">A</span>
            <span className="eyebrow">RUN COMPLETE</span>
            <h2 id="result-title">$21.25 earned</h2>
            <div className="result-grid"><span><small>Base</small><b>$18.75</b></span><span><small>Tip</small><b>$3.50</b></span><span><small>Fines</small><b>-$1.00</b></span></div>
            <div className="score-row"><span>Safety</span><b>96</b><span>On time</span><b>100</b></div>
            <button className="button primary wide" data-testid="new-run" onClick={resetRun}><RotateCcw size={18} /> New run</button>
          </section>
        </div>
      )}

      {showSettings && (
        <div className="modal-scrim settings-scrim">
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-head"><div><span className="eyebrow">DRIVER SETUP</span><h2 id="settings-title">Simulation settings</h2></div><button className="icon-button" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={19} /></button></div>
            <label>World source</label>
            <div className="segmented">
              <button className={worldMode === 'sim' ? 'selected' : ''} onClick={() => setWorldMode('sim')}><CarFront size={17} /> DriverSim</button>
              <button className={worldMode === 'google' ? 'selected' : ''} disabled={!googleKey} onClick={() => setWorldMode('google')}><Map size={17} /> Google 3D</button>
            </div>
            <label>Input</label>
            <div className="segmented three">
              <button className={controlMode === 'keyboard' ? 'selected' : ''} onClick={() => setControlMode('keyboard')}>Keys</button>
              <button className={controlMode === 'touch' ? 'selected' : ''} onClick={() => setControlMode('touch')}>Touch</button>
              <button className={controlMode === 'wheel' ? 'selected' : ''} onClick={() => setControlMode('wheel')}><Gamepad2 size={17} /> Wheel</button>
            </div>
            <label>Weather</label>
            <div className="segmented three">
              {(['clear', 'rain', 'storm'] as WeatherMode[]).map((mode) => <button key={mode} className={weather === mode ? 'selected' : ''} onClick={() => { setWeather(mode); setWeatherLabel(`Simulated · ${mode[0].toUpperCase()}${mode.slice(1)} · 64°F`); }}>{mode}</button>)}
            </div>
            <label htmlFor="google-key">Google Maps Platform key</label>
            <div className="key-row"><input id="google-key" type="password" autoComplete="off" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder={googleKey ? 'Key stored for this tab' : 'API key'} /><button className="button primary" onClick={saveKey}>Save</button></div>
            <div className="settings-footer"><Volume2 size={16} /> Audio on <span /> <Gauge size={16} /> Adaptive quality</div>
          </section>
        </div>
      )}
    </main>
  );
}
