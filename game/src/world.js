// Lanternkeep — the world: one state object and a fixed 1/60s step.
// Everything the game is (gold, lives, waves, enemies, towers, shots,
// particles) lives here; render only reads it, input only calls its verbs.
// Sound is decoupled: step() pushes plain events, main.js turns them into
// audio. That keeps the simulation pure and deterministic per seed.

import { ECONOMY, PLOTS, TOWERS, WAVES } from './config.js';
import { bossDeathSpawns, createEnemy, hurtEnemy, updateEnemy } from './enemies.js';
import { makeRng } from './random.js';
import {
  acquireTarget,
  applyProjectileHit,
  createTower,
  fireTower,
  sellValue,
  towerStats,
  upgradeCost,
} from './towers.js';

export function createWorld(seed) {
  return {
    seed,
    rng: makeRng(seed),
    time: 0,
    gold: ECONOMY.startGold,
    lives: ECONOMY.startLives,
    score: 0,
    kills: 0,
    towersBuilt: 0,
    // Wave 1 is the next one to play; phase 'build' means "between waves".
    wave: 1,
    phase: 'build',
    buildTimer: ECONOMY.buildTime,
    spawnQueue: [],
    spawnTimer: 0,
    waveTotal: 0,
    waveKills: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    particles: [],
    floaters: [],
    bolts: [],
    shake: 0,
    result: null, // 'won' | 'lost'
    timePlayed: 0,
    events: [], // drained by main.js every frame (sound + banners)
  };
}

// ---------------------------------------------------------------------------
// Verbs: the only ways input (or the autopilot) changes the world.
// ---------------------------------------------------------------------------

export function startWave(world) {
  if (world.phase !== 'build' || world.result) return false;
  const bonus = Math.max(0, Math.ceil(world.buildTimer)) * ECONOMY.earlyBonusPerSec;
  if (bonus > 0) {
    world.gold += bonus;
    world.events.push({ type: 'bonus', gold: bonus });
  }
  const def = WAVES[world.wave - 1];
  // Flatten the groups into one timed spawn queue.
  const queue = [];
  let at = 0.5;
  for (const g of def.groups) {
    for (let i = 0; i < g.count; i++) {
      queue.push({ type: g.type, at });
      at += g.gap;
    }
    at += 1.5;
  }
  world.spawnQueue = queue;
  world.spawnTimer = 0;
  world.waveTotal = queue.length;
  world.waveKills = 0;
  world.phase = 'wave';
  world.events.push({ type: 'wave', wave: world.wave, name: def.name });
  return true;
}

export function buildTower(world, plotIndex, type) {
  if (world.result) return false;
  const plot = PLOTS[plotIndex];
  if (!plot || world.towers.some((t) => t.plotIndex === plotIndex)) return false;
  const cost = TOWERS[type].cost;
  if (world.gold < cost) {
    world.events.push({ type: 'deny' });
    return false;
  }
  world.gold -= cost;
  world.towers.push(createTower(type, plotIndex, plot.x, plot.y));
  world.towersBuilt++;
  world.events.push({ type: 'build', kind: type });
  return true;
}

export function upgradeTower(world, plotIndex) {
  if (world.result) return false;
  const tower = world.towers.find((t) => t.plotIndex === plotIndex);
  if (!tower || tower.level >= 3) return false;
  const cost = upgradeCost(tower);
  if (world.gold < cost) {
    world.events.push({ type: 'deny' });
    return false;
  }
  world.gold -= cost;
  tower.invested += cost;
  tower.level++;
  world.events.push({ type: 'upgrade', kind: tower.type });
  burst(world, tower.x, tower.y - 10, '#ffd76a', 10, 60);
  return true;
}

export function sellTower(world, plotIndex) {
  if (world.result) return false;
  const i = world.towers.findIndex((t) => t.plotIndex === plotIndex);
  if (i === -1) return false;
  const tower = world.towers[i];
  world.gold += sellValue(tower);
  world.towers.splice(i, 1);
  world.events.push({ type: 'sell', gold: sellValue(tower) });
  return true;
}

// ---------------------------------------------------------------------------
// Particles and floating text. Small helpers the world and towers share.
// ---------------------------------------------------------------------------

export function burst(world, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = world.rng() * Math.PI * 2;
    const v = speed * (0.3 + world.rng() * 0.7);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 20,
      ttl: 0.45 + world.rng() * 0.3,
      max: 0.75,
      size: 1.5 + world.rng() * 2.5,
      color,
      grav: 120,
    });
  }
}

export function puff(world, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    world.particles.push({
      x: x + (world.rng() - 0.5) * 14,
      y: y + (world.rng() - 0.5) * 14,
      vx: (world.rng() - 0.5) * 24,
      vy: -14 - world.rng() * 22,
      ttl: 0.6 + world.rng() * 0.4,
      max: 1,
      size: 4 + world.rng() * 6,
      color,
      grav: -30,
    });
  }
}

function floater(world, x, y, text, color) {
  world.floaters.push({ x, y, text, color, ttl: 1.1, max: 1.1 });
}

// ---------------------------------------------------------------------------
// Damage: one place where an enemy takes a hit, so kills, gold, score,
// boss splits and sounds all stay consistent.
// ---------------------------------------------------------------------------

function hitEnemy(world, enemy, dmg, tower) {
  if (enemy.dead || enemy.leaked) return;
  const died = hurtEnemy(enemy, dmg);
  if (!died) return;
  if (tower) tower.kills++;
  world.kills++;
  world.waveKills++;
  world.gold += enemy.reward;
  world.score += enemy.reward * ECONOMY.killScorePerGold;
  puff(world, enemy.x, enemy.y, '#5a6285', 8);
  burst(world, enemy.x, enemy.y, '#ffd76a', 6, 70);
  floater(world, enemy.x, enemy.y - 14, `+${enemy.reward}g`, '#ffd76a');
  world.events.push({ type: 'kill', kind: enemy.type });
  // A slain Gloom Lord shatters into two wisps.
  for (const w of bossDeathSpawns(enemy, world.wave, world.rng)) {
    world.enemies.push(w);
  }
}

// ---------------------------------------------------------------------------
// The fixed step. dt is always 1/60.
// ---------------------------------------------------------------------------

export function step(world, dt) {
  world.time += dt;
  world.timePlayed += dt;

  // Particles and floating text always animate, even on end screens.
  updateFx(world, dt);
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 26);

  if (world.result) return;

  if (world.phase === 'build') {
    world.buildTimer -= dt;
    if (world.buildTimer <= 0) startWave(world);
    return;
  }

  // --- spawning ---
  world.spawnTimer += dt;
  while (world.spawnQueue.length > 0 && world.spawnQueue[0].at <= world.spawnTimer) {
    const s = world.spawnQueue.shift();
    world.enemies.push(createEnemy(s.type, world.wave, world.rng));
  }

  // --- enemies walk; leaks cost lives ---
  for (const e of world.enemies) {
    if (e.dead || e.leaked) continue;
    if (updateEnemy(e, dt, world.time) === 'leaked') {
      world.lives -= e.leak;
      world.shake = 9;
      floater(world, 830, 300, `-${e.leak} ♥`, '#ff5d5d');
      world.events.push({ type: 'leak', leak: e.leak });
      if (world.lives <= 0) {
        world.lives = 0;
        world.result = 'lost';
        world.events.push({ type: 'lose' });
        return;
      }
    }
  }
  world.enemies = world.enemies.filter((e) => !e.dead && !e.leaked);

  // --- towers acquire and fire ---
  const hooks = {
    enemies: world.enemies,
    now: world.time,
    fire: (p) => {
      world.projectiles.push(p);
      world.events.push({ type: 'shoot', kind: p.kind });
    },
    hit: (e, dmg, tower) => hitEnemy(world, e, dmg, tower),
    bolt: (points) => world.bolts.push({ points, ttl: 0.18, max: 0.18 }),
    puff: (x, y, kind) => {
      if (kind === 'blast') {
        burst(world, x, y, '#d9b8ff', 12, 90);
        puff(world, x, y, '#8a7bb8', 6);
      }
    },
  };
  for (const t of world.towers) {
    if (t.cooldown > 0) t.cooldown -= dt;
    if (t.flash > 0) t.flash -= dt;
    if (t.cooldown > 0) continue;
    const target = acquireTarget(t, world.enemies);
    if (!target) continue;
    fireTower(t, target, hooks);
  }

  // --- projectiles fly ---
  for (const p of world.projectiles) {
    if (p.target && !p.target.dead && !p.target.leaked) {
      p.lastX = p.target.x;
      p.lastY = p.target.y;
    }
    const dx = p.lastX - p.x;
    const dy = p.lastY - p.y;
    const d = Math.hypot(dx, dy);
    const move = p.speed * dt;
    if (d <= Math.max(move, 10)) {
      p.x = p.lastX;
      p.y = p.lastY;
      applyProjectileHit(p, hooks);
      p.spent = true;
    } else {
      p.x += (dx / d) * move;
      p.y += (dy / d) * move;
    }
  }
  world.projectiles = world.projectiles.filter((p) => !p.spent);

  // --- wave cleared? ---
  if (world.spawnQueue.length === 0 && world.enemies.length === 0) {
    const bonus = ECONOMY.waveBonusBase + ECONOMY.waveBonusPerWave * world.wave;
    world.gold += bonus;
    world.score += ECONOMY.waveClearScorePerWave * world.wave;
    world.events.push({ type: 'clear', wave: world.wave, gold: bonus });
    if (world.wave >= WAVES.length) {
      world.result = 'won';
      world.score += world.lives * ECONOMY.winLifeScore;
      world.events.push({ type: 'win' });
      return;
    }
    world.wave++;
    world.phase = 'build';
    world.buildTimer = ECONOMY.buildTime;
  }
}

function updateFx(world, dt) {
  for (const p of world.particles) {
    p.ttl -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.grav * dt;
  }
  world.particles = world.particles.filter((p) => p.ttl > 0);
  for (const f of world.floaters) {
    f.ttl -= dt;
    f.y -= 26 * dt;
  }
  world.floaters = world.floaters.filter((f) => f.ttl > 0);
  for (const b of world.bolts) b.ttl -= dt;
  world.bolts = world.bolts.filter((b) => b.ttl > 0);
}

// Progress through the current wave, 0..1, for the HUD bar.
export function waveProgress(world) {
  if (world.phase === 'build') return 0;
  if (world.waveTotal === 0) return 1;
  const left = world.spawnQueue.length + world.enemies.length;
  return Math.max(0, Math.min(1, 1 - left / world.waveTotal));
}
