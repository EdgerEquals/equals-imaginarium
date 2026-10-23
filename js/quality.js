// Adaptive quality tiers: measure frame time, step pixel ratio / particle count / bloom / nebula octaves.
export const MAX_PARTICLES = 24000;
export const TIERS = [
  { pr: 2.0, count: 1.0, bloom: true, oct: 5 },
  { pr: 1.5, count: 0.7, bloom: true, oct: 5 },
  { pr: 1.25, count: 0.5, bloom: true, oct: 4 },
  { pr: 1.0, count: 0.34, bloom: true, oct: 3 },
  { pr: 0.8, count: 0.2, bloom: false, oct: 3 },
  { pr: 0.6, count: 0.12, bloom: false, oct: 2 },
];

export class Quality {
  constructor(onChange) {
    this.onChange = onChange;
    const forced = new URLSearchParams(location.search).get('q');
    const mobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android/i.test(navigator.userAgent);
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
    let t = 1;
    if (mobile || mem <= 4 || cores <= 4) t = 3;
    if (mem <= 2 || cores <= 2) t = 4;
    this.locked = forced !== null && TIERS[+forced] !== undefined;
    this.tier = this.locked ? +forced : t;
    this.ceiling = mobile ? 2 : 0; // best tier allowed; lowered whenever we have to step down
    this.n = 0; this.sum = 0; this.good = 0; this.skip = 45;
  }
  get current() { return TIERS[this.tier]; }
  sample(dt) {
    if (this.locked || this.skip-- > 0) return;
    this.sum += dt; if (++this.n < 60) return;
    const ms = (this.sum / this.n) * 1000; this.n = 0; this.sum = 0;
    if (ms > 24 && this.tier < TIERS.length - 1) { this.ceiling = this.tier + 1; this.set(this.tier + 1); }
    else if (ms < 17.8 && this.tier > this.ceiling) { if (++this.good >= 4) this.set(this.tier - 1); }
    else this.good = 0;
  }
  set(t) { this.tier = t; this.good = 0; this.skip = 30; this.onChange(TIERS[t], t); }
}
