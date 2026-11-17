// Lanternkeep — towers: what they are, who they shoot at, what a shot does.
// A tower fires either a projectile (ember, frost, storm) that the world
// flies to its target, or instant chain lightning (prism) that the world
// draws as a bolt. Damage itself is applied in enemies.js.

import { CHAIN_FALLOFF, CHAIN_JUMP_RANGE, PROJECTILE_SPEED, STORM_SHELL_SPEED, TOWERS } from './config.js';
import { hurtEnemy, slowEnemy } from './enemies.js';

export function towerDef(type) {
  return TOWERS[type];
}

export function towerStats(type, level) {
  return TOWERS[type].levels[level - 1];
}

export function towerCost(type) {
  return TOWERS[type].cost;
}

export function upgradeCost(tower) {
  if (tower.level >= 3) return 0;
  return towerStats(tower.type, tower.level).upgrade;
}

export function sellValue(tower) {
  return Math.floor(tower.invested * 0.7);
}

// One tower, built on a plot.
export function createTower(type, plotIndex, x, y) {
  return {
    type,
    plotIndex,
    x,
    y,
    level: 1,
    invested: TOWERS[type].cost,
    cooldown: 0,
    angle: -Math.PI / 2, // lanterns face up the path at first
    flash: 0, // muzzle-flash timer, for the render
    kills: 0,
  };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// Pick a target: the enemy in range furthest along the path (closest to
// the lighthouse). Towers always guard the front of the line.
export function acquireTarget(tower, enemies) {
  const stats = towerStats(tower.type, tower.level);
  const r2 = stats.range * stats.range;
  let best = null;
  for (const e of enemies) {
    if (e.dead || e.leaked) continue;
    if (dist2(tower.x, tower.y, e.x, e.y) > r2) continue;
    if (!best || e.dist > best.dist) best = e;
  }
  return best;
}

// One firing step. `fire` is a callback the world passes in:
//   fire(projectile) — queue a projectile the world will fly;
//   hit(enemy, dmg) — apply damage now and count the kill if it dies;
//   bolt(points) — draw a lightning bolt for this long;
//   puff(x, y, kind) — spawn particles at a point.
// Returns nothing; all effects go through those hooks so the world stays
// the only owner of the lists.
export function fireTower(tower, target, hooks) {
  const stats = towerStats(tower.type, tower.level);
  tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  tower.flash = 0.09;
  tower.cooldown = 1 / stats.rate;

  if (tower.type === 'prism') {
    firePrism(tower, target, stats, hooks);
    return;
  }

  // Ember, frost and storm all loose a projectile; the world flies it.
  hooks.fire({
    x: tower.x,
    y: tower.y - 14,
    target,
    lastX: target.x,
    lastY: target.y,
    speed: tower.type === 'storm' ? STORM_SHELL_SPEED : PROJECTILE_SPEED,
    dmg: stats.dmg,
    kind: tower.type,
    splash: stats.splash || 0,
    slow: stats.slow || 0,
    slowDur: stats.slowDur || 0,
    tower,
  });
}

function firePrism(tower, first, stats, hooks) {
  // Chain lightning: hop from foe to foe, losing 30% of the damage each hop.
  const hit = new Set();
  const points = [[tower.x, tower.y - 14]];
  let from = { x: tower.x, y: tower.y - 14 };
  let current = first;
  let dmg = stats.dmg;
  for (let hop = 0; hop < stats.chains && current; hop++) {
    points.push([current.x, current.y]);
    hooks.hit(current, dmg, tower);
    hit.add(current);
    dmg *= CHAIN_FALLOFF;
    // Next hop: nearest unhit enemy within jump range of the last one.
    let next = null;
    let best = CHAIN_JUMP_RANGE * CHAIN_JUMP_RANGE;
    for (const e of hooks.enemies) {
      if (e.dead || e.leaked || hit.has(e)) continue;
      const d2 = dist2(current.x, current.y, e.x, e.y);
      if (d2 < best) {
        best = d2;
        next = e;
      }
    }
    current = next;
  }
  hooks.bolt(points);
}

// Shared by the world when a projectile lands on its target.
export function applyProjectileHit(proj, hooks) {
  const target = proj.target;
  if (target && !target.dead && !target.leaked) {
    hurtOrSlow(target, proj, hooks);
  }
  if (proj.splash > 0) {
    // Storm shell: everything near the impact takes the same damage.
    const cx = target && !target.dead ? target.x : proj.lastX;
    const cy = target && !target.dead ? target.y : proj.lastY;
    for (const e of hooks.enemies) {
      if (e.dead || e.leaked || e === target) continue;
      if (dist2(cx, cy, e.x, e.y) <= proj.splash * proj.splash) {
        hurtOrSlow(e, proj, hooks);
      }
    }
    hooks.puff(cx, cy, 'blast');
  }
}

function hurtOrSlow(e, proj, hooks) {
  if (proj.slow > 0) slowEnemy(e, proj.slow, proj.slowDur, hooks.now);
  hooks.hit(e, proj.dmg, proj.tower);
}
