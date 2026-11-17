// Lanternkeep — enemies: what they are, how they walk the path, how they
// take damage. The path is a polyline; each enemy stores how far along it
// it has travelled, so movement is one number, not a waypoint chase.

import { ENEMIES, HP_PER_WAVE, PATH } from './config.js';
import { range } from './random.js';

// Precomputed path geometry: cumulative length of each segment.
const SEGMENTS = [];
let PATH_LENGTH = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [x1, y1] = PATH[i];
  const [x2, y2] = PATH[i + 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  SEGMENTS.push({ x1, y1, x2, y2, len, start: PATH_LENGTH });
  PATH_LENGTH += len;
}

export function pathLength() {
  return PATH_LENGTH;
}

// Position (and heading) at `dist` px along the path.
export function pointAt(dist) {
  const d = Math.max(0, Math.min(dist, PATH_LENGTH));
  for (const s of SEGMENTS) {
    if (d <= s.start + s.len || s === SEGMENTS[SEGMENTS.length - 1]) {
      const t = s.len === 0 ? 0 : Math.min(1, Math.max(0, (d - s.start) / s.len));
      return {
        x: s.x1 + (s.x2 - s.x1) * t,
        y: s.y1 + (s.y2 - s.y1) * t,
        angle: Math.atan2(s.y2 - s.y1, s.x2 - s.x1),
      };
    }
  }
  const last = PATH[PATH.length - 1];
  return { x: last[0], y: last[1], angle: 0 };
}

export function waveHpMul(wave) {
  return 1 + HP_PER_WAVE * (wave - 1);
}

// One enemy, fresh at the start of the path.
export function createEnemy(type, wave, rng) {
  const def = ENEMIES[type];
  const hp = Math.round(def.hp * waveHpMul(wave));
  const p = pointAt(0);
  return {
    type,
    name: def.name,
    x: p.x,
    y: p.y,
    angle: p.angle,
    dist: 0,
    hp,
    maxHp: hp,
    speed: def.speed,
    radius: def.radius,
    reward: def.reward,
    leak: def.leak,
    body: def.body,
    eye: def.eye,
    wisp: !!def.wisp,
    // Wisp speed wobbles: each one gets its own phase.
    phase: range(rng, 0, Math.PI * 2),
    // Frost slow: until when (world time) and how strong (0..1 off speed).
    slowUntil: 0,
    slowFactor: 0,
    // Render wobble and hit flash.
    bob: range(rng, 0, Math.PI * 2),
    flash: 0,
    dead: false,
    leaked: false,
  };
}

// Effective speed right now: base, slowed by frost, wobbling for wisps.
export function enemySpeed(e, now) {
  let s = e.speed;
  if (now < e.slowUntil) s *= 1 - e.slowFactor;
  if (e.wisp) {
    // Speed surges and lags: 0.55x to 1.45x of base.
    s *= 1 + 0.45 * Math.sin(now * 2.6 + e.phase);
  }
  return Math.max(4, s);
}

// Walk the enemy forward. Returns 'leaked' when it reaches the lighthouse.
export function updateEnemy(e, dt, now) {
  e.dist += enemySpeed(e, now) * dt;
  const p = pointAt(e.dist);
  e.x = p.x;
  e.y = p.y;
  e.angle = p.angle;
  e.bob += dt * 6;
  if (e.flash > 0) e.flash -= dt;
  if (e.dist >= PATH_LENGTH) {
    e.leaked = true;
    return 'leaked';
  }
  return 'ok';
}

// Deal damage. Returns true when the enemy just died.
export function hurtEnemy(e, dmg) {
  if (e.dead) return false;
  e.hp -= dmg;
  e.flash = 0.12;
  if (e.hp <= 0) {
    e.dead = true;
    return true;
  }
  return false;
}

// Frost slow: `factor` is the fraction of speed removed, for `dur` seconds.
export function slowEnemy(e, factor, dur, now) {
  if (factor > e.slowFactor || now >= e.slowUntil) {
    e.slowFactor = factor;
  }
  e.slowUntil = Math.max(e.slowUntil, now + dur);
}

// A Gloom Lord shatters into wisps when it dies.
export function bossDeathSpawns(e, wave, rng) {
  if (e.type !== 'boss') return [];
  const out = [];
  for (let i = 0; i < 2; i++) {
    const w = createEnemy('wisp', wave, rng);
    w.dist = Math.max(0, e.dist - 30 - i * 25);
    const p = pointAt(w.dist);
    w.x = p.x;
    w.y = p.y;
    out.push(w);
  }
  return out;
}
