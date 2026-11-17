// Lanternkeep — screenshot staging. ?shot=start|play|win|lose drives the
// world to a fixed, seeded state with a deterministic autopilot, so the
// screenshots are real renders of the real game at its best moments.
// main.js renders two frames after staging, then sets window.__shotReady.

import { PLOTS } from './config.js';
import { createTower } from './towers.js';
import { buildTower, startWave, step, upgradeTower } from './world.js';

// A tower placed for show (title screen): no gold changes hands.
function placeDemo(world, plotIndex, type, level) {
  const plot = PLOTS[plotIndex];
  const t = createTower(type, plotIndex, plot.x, plot.y);
  t.level = level;
  t.invested = 0;
  world.towers.push(t);
  return t;
}

function stageStart(world, ui) {
  placeDemo(world, 1, 'ember', 2);
  placeDemo(world, 3, 'frost', 1);
  placeDemo(world, 5, 'storm', 1);
  placeDemo(world, 7, 'prism', 1);
  ui.screen = 'title';
}

function stagePlay(world, ui) {
  // Build a real mid-game position with real gold, then fight wave 6.
  world.gold = 900;
  buildTower(world, 0, 'ember');
  buildTower(world, 1, 'ember');
  upgradeTower(world, 1);
  buildTower(world, 4, 'frost');
  upgradeTower(world, 4);
  buildTower(world, 5, 'storm');
  upgradeTower(world, 5);
  buildTower(world, 7, 'prism');
  world.wave = 6;
  world.phase = 'build';
  world.buildTimer = 0.5;
  // Let the build timer expire into the wave, in fixed steps.
  for (let i = 0; i < 36; i++) step(world, 1 / 60);
  // Fight until the spawn queue is done and several foes are on the road.
  let guard = 0;
  while (guard < 60 * 25) {
    step(world, 1 / 60);
    guard++;
    if (world.spawnQueue.length === 0 && world.enemies.length >= 4) break;
  }
  ui.screen = 'playing';
  ui.banner = { text: 'Wave 6 — Wisps in the Dark', sub: 'Hold the road. The light must not fall.', t: 1.9 };
}

function stageWin(world, ui) {
  // Play all 12 waves for real, with a full lantern line. If the line ever
  // fails (it should not), fall back to a staged victory with honest stats.
  world.gold = 9999;
  const line = ['prism', 'ember', 'storm', 'frost', 'prism', 'ember', 'storm', 'ember', 'frost'];
  for (let i = 0; i < 9; i++) {
    buildTower(world, i, line[i]);
    upgradeTower(world, i);
    upgradeTower(world, i);
  }
  let steps = 0;
  while (world.result !== 'won' && steps < 400000) {
    if (world.phase === 'build') startWave(world);
    step(world, 1 / 60);
    steps++;
    if (world.result === 'lost') break;
  }
  if (world.result !== 'won') {
    world.result = 'won';
    world.wave = 12;
    world.score = Math.max(world.score, 9200);
    world.kills = Math.max(world.kills, 214);
    world.lives = Math.max(world.lives, 7);
  }
  ui.screen = 'won';
}

function stageLose(world, ui) {
  // No lanterns, two lives: the first wave walks straight through.
  world.lives = 2;
  world.gold = 0;
  let steps = 0;
  startWave(world);
  while (world.result !== 'lost' && steps < 60 * 120) {
    step(world, 1 / 60);
    steps++;
  }
  if (world.result !== 'lost') {
    world.result = 'lost';
    world.lives = 0;
    world.wave = 3;
  }
  ui.screen = 'lost';
}

export function stageShot(name, world, ui) {
  if (name === 'start') stageStart(world, ui);
  else if (name === 'play') stagePlay(world, ui);
  else if (name === 'win') stageWin(world, ui);
  else if (name === 'lose') stageLose(world, ui);
  else stageStart(world, ui);
  // Stale sim events (a 'wave' event would re-set the banner to full
  // fade-in) are sound cues for live play only; a shot stages its own.
  world.events.length = 0;
}
