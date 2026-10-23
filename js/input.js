// One input system (Pointer Events + wheel + optional keys) for mouse, touch, pen and thumb.
// Touch: left half = invisible drift stick (thumb), right half = look, two fingers = pinch float.
// Mouse/pen: drag = look, right-drag = drift, wheel = float forward/back. Keys: WASD/QE, arrows.
const STICK_R = 70; // px of thumb travel for full thrust

export class Input {
  constructor(el) {
    this.el = el; this.yaw = 0; this.pitch = 0; this.yawV = 0; this.pitchV = 0;
    this.impulse = 0; this.keys = new Set(); this.ptrs = new Map(); this.pinchD = 0;
    this.lastActive = -1e9;
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opt);
    el.addEventListener('pointermove', (e) => this.move(e), opt);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => el.addEventListener(t, (e) => this.up(e)));
    el.addEventListener('wheel', (e) => this.wheel(e), opt);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => { if (KEYS[e.code]) { this.keys.add(e.code); this.touch(); e.preventDefault(); } });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.ptrs.clear(); this.el.classList.remove('drag'); });
  }
  touch() { this.lastActive = performance.now(); }
  down(e) {
    e.preventDefault(); this.el.focus({ preventScroll: true });
    try { this.el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const isTouch = e.pointerType === 'touch';
    const role = (isTouch && e.clientX < innerWidth * 0.5) || (!isTouch && e.button === 2) ? 'stick' : 'look';
    let r = role;
    if (isTouch) for (const q of this.ptrs.values()) if (q.touch && e.timeStamp - q.t < 250 && this.ptrs.size === 1) { q.role = 'look'; r = 'look'; } // two-finger pinch
    this.ptrs.set(e.pointerId, { role: r, touch: isTouch, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp });
    if (r === 'look') { this.yawV = this.pitchV = 0; this.el.classList.add('drag'); }
    this.pinchD = 0; this.touch();
  }
  looks() { const a = []; for (const p of this.ptrs.values()) if (p.role === 'look') a.push(p); return a; }
  move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y, dt = Math.max(e.timeStamp - p.t, 4) / 1000;
    p.x = e.clientX; p.y = e.clientY; p.t = e.timeStamp; this.touch();
    if (p.role !== 'look') return;
    const looks = this.looks();
    if (looks.length >= 2) { // pinch = float forward / back
      const d = Math.hypot(looks[0].x - looks[1].x, looks[0].y - looks[1].y);
      if (this.pinchD) this.impulse += (d - this.pinchD) * 0.02;
      this.pinchD = d; this.yawV = this.pitchV = 0; return;
    }
    const s = p.touch ? 0.0055 : 0.0035;
    this.yaw -= dx * s; this.pitch -= dy * s; this.clamp();
    this.yawV = -dx * s / dt; this.pitchV = -dy * s / dt;
  }
  up(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    if (p.role === 'look' && e.timeStamp - p.t > 80) this.yawV = this.pitchV = 0; // held still: no fling
    this.ptrs.delete(e.pointerId); this.pinchD = 0;
    if (!this.looks().length) this.el.classList.remove('drag');
  }
  wheel(e) {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.impulse += Math.max(-3, Math.min(3, -e.deltaY * k * 0.01)); this.touch();
  }
  clamp() { this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch)); }
  /** Advance inertia; returns thrust in camera-local space and a forward impulse. */
  update(dt) {
    const out = { thrust: [0, 0, 0], impulse: 0, idle: performance.now() - this.lastActive > 6000 };
    const looking = this.looks().length > 0;
    if (!looking) { this.yaw += this.yawV * dt; this.pitch += this.pitchV * dt; this.clamp(); }
    const k = Math.exp(-4.5 * dt); this.yawV *= k; this.pitchV *= k;
    for (const p of this.ptrs.values()) if (p.role === 'stick') {
      let x = (p.x - p.sx) / STICK_R, z = (p.y - p.sy) / STICK_R; const l = Math.hypot(x, z);
      if (l > 1) { x /= l; z /= l; }
      out.thrust[0] += x; out.thrust[2] += z;
    }
    for (const c of this.keys) { const m = KEYS[c]; if (m[0] === 'yaw') this.yaw += m[1] * 1.6 * dt; else out.thrust[m[0]] += m[1]; }
    const l = Math.hypot(...out.thrust); if (l > 1) out.thrust = out.thrust.map((v) => v / l);
    out.impulse = this.impulse; this.impulse = 0;
    return out;
  }
}
const KEYS = {
  KeyW: [2, -1], KeyS: [2, 1], KeyA: [0, -1], KeyD: [0, 1], KeyQ: [1, -1], KeyE: [1, 1], Space: [1, 1],
  ArrowUp: [2, -1], ArrowDown: [2, 1], ArrowLeft: ['yaw', 1], ArrowRight: ['yaw', -1],
};
