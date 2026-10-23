// Equals Imaginarium — one Three.js canvas, three layers, worker physics, adaptive quality.
import * as THREE from 'three';
import { createNebula, createSwarm, createHeroes, PALETTE, PHI, GOLDEN_ANGLE, HERO_CENTRE, HERO_BOUND } from './layers.js';
import { Input } from './input.js';
import { Quality, MAX_PARTICLES } from './quality.js';

const root = document.documentElement;
const canvas = document.getElementById('world');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const debug = (window.__ei = { frames: 0, tier: null, worker: false, bloom: false, reduced: motionQuery.matches });
const fallback = (why) => { root.classList.add('no-gl'); debug.fallback = why; };

function hasWebGL2() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } }

if (!hasWebGL2()) fallback('no-webgl2');
else { try { start(); } catch (err) { console.warn('3D unavailable, showing poster', err); fallback('init'); } }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch((e) => console.warn('sw', e)));
}

function start() {
  let reduced = motionQuery.matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.classList.remove('on'); fallback('context-lost'); });

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PALETTE.ink, 0.02);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 600);

  const nebula = createNebula(camera); scene.add(nebula.mesh);
  const swarm = createSwarm(MAX_PARTICLES); scene.add(swarm.points);
  const heroes = createHeroes(renderer); scene.add(heroes.group); scene.environment = heroes.envMap;

  // ---- physics worker (hero bodies + camera drift) ----
  const init = heroes.bodies.map((b, i) => {
    const a = i * GOLDEN_ANGLE, r = 3.2 + (i % 2) * 1.2;
    const ax = new THREE.Vector3(Math.sin(a * 1.3), Math.cos(a), Math.sin(a * 0.7) + 0.4).normalize();
    return { r: b.r, m: b.m, target: 0.35 + 0.12 * ((i * PHI) % 1), w: (0.25 + 0.3 * ((i * PHI * PHI) % 1)) * (i % 2 ? -1 : 1),
      ax: ax.toArray(), p: [HERO_CENTRE[0] + Math.cos(a) * r, HERO_CENTRE[1] + Math.sin(a) * r * 0.6, HERO_CENTRE[2] + Math.sin(a * 0.5) * 2],
      v: [Math.sin(a) * 0.4, Math.cos(a * 1.7) * 0.3, Math.cos(a) * 0.3] };
  });
  const SIZE = 6 + 7 * init.length;
  let state = new Float32Array(SIZE); const pool = [new Float32Array(SIZE), new Float32Array(SIZE)];
  init.forEach((b, i) => { state.set(b.p, 6 + i * 7); state[6 + i * 7 + 6] = 1; });
  let inFlight = false, pendDt = 0, pendImp = [0, 0, 0];
  const worker = new Worker(new URL('./physics-worker.js', import.meta.url));
  worker.onmessage = (e) => { pool.push(state); state = e.data.buf; inFlight = false; debug.worker = true; };
  worker.onerror = (e) => { e.preventDefault(); console.warn('physics worker failed', e.message); };
  worker.postMessage({ type: 'init', centre: HERO_CENTRE, bound: HERO_BOUND, cam: [0, 0, 0], bodies: init });

  function stepPhysics(dt, thrust, impulse, idle) {
    pendDt += dt; pendImp[0] += impulse.x; pendImp[1] += impulse.y; pendImp[2] += impulse.z;
    if (inFlight || !pool.length) return;
    const buf = pool.pop(); inFlight = true;
    worker.postMessage({ type: 'step', dt: pendDt, thrust: [thrust.x, thrust.y, thrust.z], impulse: pendImp,
      idle, bodyScale: reduced ? 0.06 : 1, accel: reduced ? 2.5 : 6, vmax: reduced ? 3 : 9, buf }, [buf.buffer]);
    pendDt = 0; pendImp = [0, 0, 0];
  }

  // ---- input ----
  const input = new Input(canvas);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), vThrust = new THREE.Vector3(), vImp = new THREE.Vector3();

  // ---- post-processing (lazy, after first frame) ----
  let composer = null, bloom = null, postLoading = false;
  async function loadPost() {
    if (postLoading) return; postLoading = true;
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
    const c = new EffectComposer(renderer);
    c.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.5);
    c.addPass(bloom); c.addPass(new OutputPass());
    composer = c; applyTier(quality.current); debug.bloom = true;
  }

  // ---- quality ----
  const quality = new Quality((t) => applyTier(t));
  function applyTier(t) {
    const pr = Math.min(t.pr, devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    swarm.setCount(Math.round(MAX_PARTICLES * t.count));
    nebula.material.uniforms.uOct.value = t.oct;
    if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
    if (bloom) bloom.strength = reduced ? 0.6 : 0.85;
    resize(); debug.tier = quality.tier; debug.particles = Math.round(MAX_PARTICLES * t.count);
    if (t.bloom && !composer && debug.frames > 0) loadPost().catch((e) => console.warn('post-processing unavailable', e));
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // keep at least ~62° horizontal view on portrait screens
    camera.fov = Math.min(92, Math.max(62, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) / camera.aspect))));
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    swarm.material.uniforms.uScale.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    swarm.material.uniforms.uPR.value = pr;
  }
  addEventListener('resize', resize);
  applyTier(quality.current);

  motionQuery.addEventListener('change', (e) => { reduced = debug.reduced = e.matches; applyTier(quality.current); });

  // ---- loop ----
  let raf = 0, last = performance.now(), sim = 0, lastDraw = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (reduced && now - lastDraw < 32) return; // near-still: ~30 fps cap
    const dt = Math.min((now - last) / 1000, 0.1); last = now; lastDraw = now;
    quality.sample(dt);
    sim += dt * (reduced ? 0.04 : 1);

    const inp = input.update(dt);
    euler.set(input.pitch, input.yaw, 0); camera.quaternion.setFromEuler(euler);
    vThrust.fromArray(inp.thrust).applyQuaternion(camera.quaternion);
    vImp.set(0, 0, -inp.impulse).applyQuaternion(camera.quaternion);
    stepPhysics(dt, vThrust, vImp, inp.idle && !reduced);

    camera.position.set(state[0], state[1], state[2]);
    heroes.bodies.forEach((b, i) => { const o = 6 + i * 7; b.obj.position.set(state[o], state[o + 1], state[o + 2]); b.obj.quaternion.set(state[o + 3], state[o + 4], state[o + 5], state[o + 6]); });
    camera.updateMatrixWorld();
    nebula.material.uniforms.uTime.value = sim;
    swarm.material.uniforms.uTime.value = sim;

    if (composer && quality.current.bloom) composer.render(dt); else renderer.render(scene, camera);
    if (debug.frames++ === 0) {
      canvas.classList.add('on');
      if (quality.current.bloom) setTimeout(() => loadPost().catch((e) => console.warn('post-processing unavailable', e)), 50);
    }
  }
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
}
