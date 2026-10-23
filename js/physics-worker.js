// Background physics: hero-body dynamics (rigidly bounded) + first-person camera drift.
// Main thread only sends input and reads back state via transferable Float32Arrays.
'use strict';
const STEP = 1 / 120, MAX_SUB = 24;
let C = [0, 0, -12], R = 7.5, bodies = [], acc = 0, t = 0;
const cam = { p: [0, 0, 0], v: [0, 0, 0] };
const CAM_R = 0.55, CAM_BOUND = 64;

function len(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }

function boundBody(b) {
  const dx = b.p[0] - C[0], dy = b.p[1] - C[1], dz = b.p[2] - C[2], d = len(dx, dy, dz) || 1e-6;
  if (d + b.r > R) {
    const nx = dx / d, ny = dy / d, nz = dz / d, k = R - b.r;
    b.p[0] = C[0] + nx * k; b.p[1] = C[1] + ny * k; b.p[2] = C[2] + nz * k;
    const vn = b.v[0] * nx + b.v[1] * ny + b.v[2] * nz;
    if (vn > 0) { b.v[0] -= 2 * vn * nx; b.v[1] -= 2 * vn * ny; b.v[2] -= 2 * vn * nz; }
  }
}

function sub(h, m) {
  t += h;
  const hb = h * m.bodyScale;
  // --- camera drift ---
  const th = m.thrust, a = m.accel;
  cam.v[0] += th[0] * a * h; cam.v[1] += th[1] * a * h; cam.v[2] += th[2] * a * h;
  if (m.idle) { // gentle idle sway so the space keeps breathing
    const s = 0.05 * m.bodyScale;
    cam.v[0] += Math.sin(t * 0.13) * s * h; cam.v[1] += Math.sin(t * 0.083 + 1.0) * s * h; cam.v[2] += Math.sin(t * 0.05 + 2.0) * s * h;
  }
  const damp = Math.exp(-1.6 * h);
  cam.v[0] *= damp; cam.v[1] *= damp; cam.v[2] *= damp;
  const ox = cam.p[0] - C[0], oy = cam.p[1] - C[1], oz = cam.p[2] - C[2], od = len(ox, oy, oz);
  if (od > CAM_BOUND) { const k = (od - CAM_BOUND) * 0.9 * h / od; cam.v[0] -= ox * k; cam.v[1] -= oy * k; cam.v[2] -= oz * k; }
  const sp = len(cam.v[0], cam.v[1], cam.v[2]), vmax = m.vmax;
  if (sp > vmax) { const k = vmax / sp; cam.v[0] *= k; cam.v[1] *= k; cam.v[2] *= k; }
  cam.p[0] += cam.v[0] * h; cam.p[1] += cam.v[1] * h; cam.p[2] += cam.v[2] * h;

  // --- hero bodies ---
  for (const b of bodies) {
    for (let i = 0; i < 3; i++) b.v[i] += (C[i] - b.p[i]) * 0.004 * hb; // weak centring
    let s = len(b.v[0], b.v[1], b.v[2]);
    if (s < 1e-4) { b.v[0] = 0.1; s = 0.1; }
    const k = 1 + (b.target - s) / s * Math.min(1, 0.25 * hb);         // ease to cruise speed
    b.v[0] *= k; b.v[1] *= k; b.v[2] *= k;
    b.p[0] += b.v[0] * hb; b.p[1] += b.v[1] * hb; b.p[2] += b.v[2] * hb;
    b.ang += b.w * hb;
    boundBody(b);
  }
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const A = bodies[i], B = bodies[j];
    const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], dz = B.p[2] - A.p[2], d = len(dx, dy, dz), min = A.r + B.r;
    if (d < min && d > 1e-6) {
      const nx = dx / d, ny = dy / d, nz = dz / d, ov = min - d, ia = 1 / A.m, ib = 1 / B.m, sum = ia + ib;
      A.p[0] -= nx * ov * ia / sum; A.p[1] -= ny * ov * ia / sum; A.p[2] -= nz * ov * ia / sum;
      B.p[0] += nx * ov * ib / sum; B.p[1] += ny * ov * ib / sum; B.p[2] += nz * ov * ib / sum;
      const vr = (B.v[0] - A.v[0]) * nx + (B.v[1] - A.v[1]) * ny + (B.v[2] - A.v[2]) * nz;
      if (vr < 0) { const J = -2 * vr / sum; A.v[0] -= J * ia * nx; A.v[1] -= J * ia * ny; A.v[2] -= J * ia * nz; B.v[0] += J * ib * nx; B.v[1] += J * ib * ny; B.v[2] += J * ib * nz; }
      boundBody(A); boundBody(B);
    }
  }
  // camera bumps into (and nudges) bodies
  for (const b of bodies) {
    const dx = cam.p[0] - b.p[0], dy = cam.p[1] - b.p[1], dz = cam.p[2] - b.p[2], d = len(dx, dy, dz), min = b.r + CAM_R;
    if (d < min && d > 1e-6) {
      const nx = dx / d, ny = dy / d, nz = dz / d;
      cam.p[0] = b.p[0] + nx * min; cam.p[1] = b.p[1] + ny * min; cam.p[2] = b.p[2] + nz * min;
      const vn = (cam.v[0] - b.v[0]) * nx + (cam.v[1] - b.v[1]) * ny + (cam.v[2] - b.v[2]) * nz;
      if (vn < 0) {
        cam.v[0] -= 1.3 * vn * nx; cam.v[1] -= 1.3 * vn * ny; cam.v[2] -= 1.3 * vn * nz;
        const push = 0.6 * vn / b.m; b.v[0] += push * nx; b.v[1] += push * ny; b.v[2] += push * nz;
      }
    }
  }
}

function write(buf) {
  buf[0] = cam.p[0]; buf[1] = cam.p[1]; buf[2] = cam.p[2]; buf[3] = cam.v[0]; buf[4] = cam.v[1]; buf[5] = cam.v[2];
  let o = 6;
  for (const b of bodies) {
    const h = b.ang * 0.5, s = Math.sin(h);
    buf[o] = b.p[0]; buf[o + 1] = b.p[1]; buf[o + 2] = b.p[2];
    buf[o + 3] = b.ax[0] * s; buf[o + 4] = b.ax[1] * s; buf[o + 5] = b.ax[2] * s; buf[o + 6] = Math.cos(h);
    o += 7;
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    C = m.centre; R = m.bound; cam.p = m.cam.slice(); cam.v = [0, 0, 0];
    bodies = m.bodies.map((b) => ({ ...b, p: b.p.slice(), v: b.v.slice(), ax: b.ax.slice(), ang: 0 }));
    return;
  }
  if (m.type === 'step') {
    const iv = m.impulse; cam.v[0] += iv[0]; cam.v[1] += iv[1]; cam.v[2] += iv[2];
    acc = Math.min(acc + m.dt, STEP * MAX_SUB);
    while (acc >= STEP) { sub(STEP, m); acc -= STEP; }
    write(m.buf);
    self.postMessage({ type: 'state', buf: m.buf }, [m.buf.buffer]);
  }
};
