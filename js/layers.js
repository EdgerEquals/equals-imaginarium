// The three layers that share the single canvas: nebula (back), swarm (middle), heroes (front).
import * as THREE from 'three';

export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 2.39996… rad

// Site identity, sRGB hex -> linear via THREE.Color.
export const PALETTE = {
  ink: new THREE.Color('#0f1220'), ink2: new THREE.Color('#1a1e33'), cream: new THREE.Color('#f4f1ea'),
  amber: new THREE.Color('#ffb547'), coral: new THREE.Color('#ff6b4a'), sky: new THREE.Color('#7cc4ff'),
};

const OUT = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- BACK: domain-warped fBm nebula, deterministic hash noise, view-ray based ----------
export function createNebula(camera) {
  const P = PALETTE;
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uOct: { value: 5 },
      uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
      cInk: { value: P.ink }, cInk2: { value: P.ink2 }, cSky: { value: P.sky },
      cAmber: { value: P.amber }, cCoral: { value: P.coral }, cCream: { value: P.cream },
    },
    vertexShader: /* glsl */`
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform int uOct; uniform mat4 uInvProj; uniform mat4 uCamWorld;
      uniform vec3 cInk, cInk2, cSky, cAmber, cCoral, cCream;
      varying vec2 vNdc;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 6; i++) { if (i >= uOct) break; s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
        return s;
      }
      void main() {
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); v /= v.w;
        vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
        vec3 p = dir * 2.2; float t = uTime * 0.01;
        vec3 q = vec3(fbm(p + vec3(0.0, 0.0, t)), fbm(p + vec3(5.2, 1.3, -t)), fbm(p + vec3(2.1, 7.7, t * 0.618)));
        float n = fbm(p + 1.8 * q);
        float m = fbm(p * 0.6 - 1.2 * q + 3.0 + t * 0.382);
        vec3 col = mix(cInk, cInk2, smoothstep(0.25, 0.75, n));
        col = mix(col, cSky * 0.22, smoothstep(0.55, 0.95, n) * q.x);
        col += cAmber * 0.10 * smoothstep(0.62, 0.98, m) * q.y;
        col += cCoral * 0.045 * pow(smoothstep(0.35, 0.8, n * q.z * 1.6), 2.0);
        // sparse cream stars on a 3D cell lattice of the view sphere
        vec3 sp = dir * 170.0; vec3 cell = floor(sp);
        vec3 off = vec3(hash(cell + 1.3), hash(cell + 7.1), hash(cell + 3.7)) - 0.5;
        float d = length(fract(sp) - 0.5 - off * 0.6);
        float star = step(0.986, hash(cell)) * (1.0 - smoothstep(0.0, 0.09, d));
        col += cCream * star * (0.35 + 0.65 * hash(cell + 9.9));
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, material };
}

// ---------- MIDDLE: GPU-driven orbit swarm, one clock, golden-ratio periods ----------
// Orbit centres sit off-screen / far away so streams sweep through the viewer's space without bound.
export const ORBIT_CENTRES = [
  new THREE.Vector3(0, 0, -12), new THREE.Vector3(70, -22, -90), new THREE.Vector3(-95, 34, -40),
  new THREE.Vector3(24, 56, 75), new THREE.Vector3(-34, -64, 22),
];
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createSwarm(max) {
  const rand = rng(1618);
  const orbit = new Float32Array(max * 4), axis = new Float32Array(max * 4), color = new Float32Array(max * 3), size = new Float32Array(max);
  const P = PALETTE, cols = [P.cream, P.cream, P.sky, P.sky, P.amber, P.coral, P.cream, P.sky];
  // Each centre has a dominant plane so particles form coherent sweeping streams.
  const planes = ORBIT_CENTRES.map((_, k) => new THREE.Vector3(Math.sin(k * GOLDEN_ANGLE), Math.cos(k * 1.7) * 1.4, Math.cos(k * GOLDEN_ANGLE)).normalize());
  const a = new THREE.Vector3(), lnPhi = Math.log(PHI);
  for (let i = 0; i < max; i++) {
    // Golden-ratio low-discrepancy assignment keeps every draw-range prefix evenly spread.
    const c = Math.floor(((i * PHI) % 1) * ORBIT_CENTRES.length);
    const dist = ORBIT_CENTRES[c].length();
    const r = c === 0 ? 9 + 60 * Math.pow(rand(), 1.6) : Math.max(6, dist * (0.55 + 0.9 * rand()));
    const n = Math.max(0, Math.round(1.5 * Math.log(r / 4) / lnPhi)); // Kepler-ish: T = base * phi^n
    a.copy(planes[c]).addScaledVector(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5), 0.55).normalize();
    orbit.set([r, n, (i * GOLDEN_ANGLE) % (Math.PI * 2), (rand() - 0.5) * r * 0.12], i * 4);
    axis.set([a.x, a.y, a.z, c], i * 4);
    const col = cols[Math.floor(rand() * cols.length)];
    color.set([col.r, col.g, col.b], i * 3);
    size[i] = 0.08 + 0.3 * Math.pow(rand(), 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3)); // unused, sizes the draw
  g.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
  g.setAttribute('aAxis', new THREE.BufferAttribute(axis, 4));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBase: { value: 6.0 }, uScale: { value: 500 }, uPR: { value: 1 }, uGain: { value: 1.25 },
      uCentres: { value: ORBIT_CENTRES } },
    vertexShader: /* glsl */`
      attribute vec4 aOrbit; attribute vec4 aAxis; attribute vec3 aColor; attribute float aSize;
      uniform float uTime, uBase, uScale, uPR; uniform vec3 uCentres[${ORBIT_CENTRES.length}];
      varying vec3 vCol; varying float vFade;
      const float PHI = 1.618033988749895; const float TAU = 6.283185307179586;
      void main() {
        vec3 ax = normalize(aAxis.xyz);
        vec3 ref = abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 u = normalize(cross(ax, ref)); vec3 w = cross(ax, u);
        float period = uBase * pow(PHI, aOrbit.y);
        float ang = aOrbit.z + TAU * fract(uTime / period);
        vec3 pos = uCentres[int(aAxis.w + 0.5)] + aOrbit.x * (cos(ang) * u + sin(ang) * w)
                 + ax * aOrbit.w * sin(ang * 3.0 + aOrbit.z);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        float dist = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(dist, 0.05), 0.0, 40.0 * uPR);
        vFade = smoothstep(0.4, 3.0, dist) * (1.0 - smoothstep(70.0, 190.0, dist)); // near + depth fade
        vCol = aColor;
      }`,
    fragmentShader: /* glsl */`
      uniform float uGain; varying vec3 vCol; varying float vFade;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float r2 = r * r; float a = (exp(-r2 * 40.0) + 0.22 * exp(-r2 * 9.0)) * (1.0 - smoothstep(0.42, 0.5, r)); // soft core + own halo
        if (a * vFade < 0.003) discard;
        gl_FragColor = vec4(vCol * a * vFade * uGain, 1.0);
        ${OUT}
      }`,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  return { points, material, geometry: g, setCount: (n) => g.setDrawRange(0, n) };
}

// ---------- FRONT: hand-made hero bodies (positions come from the physics worker) ----------
export const HERO_CENTRE = [0, 0, -12];
export const HERO_BOUND = 7.5;

export function createHeroes(renderer) {
  const P = PALETTE;
  // Tiny procedural environment so the 150 mm-sphere steel reads as metal (no extra modules/files).
  const env = new THREE.Scene(); env.background = P.ink.clone();
  const panel = (c, i, x, y, z, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  panel(P.cream, 1.7, 0, 6, 0, 5); panel(P.amber, 1.2, 6, 1, 2, 3); panel(P.sky, 1.1, -6, -1, -2, 4); panel(P.coral, 0.9, 1, -2, 6, 2); panel(P.ink2, 1, 0, -6, 0, 8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(env, 0.03).texture; pmrem.dispose();

  const steel = new THREE.MeshPhysicalMaterial({ color: 0xd8dbe4, metalness: 1, roughness: 0.14, clearcoat: 0.3 });
  const glowMat = (c, k) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, metalness: 0.2 });
  const bodies = [];
  const add = (obj, r, m) => { bodies.push({ obj, r, m }); };

  add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), steel), 1.0, 3.0);                  // the 150 mm sphere, scaled up
  add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 16, 160), glowMat(P.amber, 2.0)), 1.55, 1.0); // ring
  add(new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.025, 12, 200), glowMat(P.sky, 1.8)), 2.15, 0.8);  // outer ring
  const eq = new THREE.Group();                                                                      // '=' form
  const bar = new THREE.CapsuleGeometry(0.15, 1.3, 8, 24);
  const b1 = new THREE.Mesh(bar, new THREE.MeshStandardMaterial({ color: P.cream, roughness: 0.35, metalness: 0.1 }));
  const b2 = new THREE.Mesh(bar, glowMat(P.amber, 0.5));
  b1.rotation.z = b2.rotation.z = Math.PI / 2; b1.position.y = 0.27; b2.position.y = -0.27; eq.add(b1, b2);
  add(eq, 0.95, 1.4);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), glowMat(P.coral, 3.0)), 0.42, 0.6);       // coral bead

  const group = new THREE.Group();
  bodies.forEach((b) => group.add(b.obj));
  const lights = [new THREE.HemisphereLight(P.sky, P.ink, 0.35), new THREE.PointLight(P.amber, 6, 40, 2)];
  lights[1].position.set(...HERO_CENTRE); lights.forEach((l) => group.add(l));
  return { group, bodies, envMap };
}
