// Lanternkeep — boot and the main loop. Fixed 1/60s simulation steps, the
// screen state machine (title / playing / paused / won / lost), ?shot= and
// ?seed= handling for screenshots, the best score in localStorage, and the
// drain that turns world events into sound and banners.

import { CANVAS_H, CANVAS_W } from './config.js';
import { buildTower, createWorld, sellTower, startWave, step, upgradeTower } from './world.js';
import { draw } from './render.js';
import { Sfx } from './audio.js';
import { attachInput } from './input.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot');

const BEST_KEY = 'lanternkeep-best';
function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}
function saveBest(score) {
  try {
    if (score > loadBest()) localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Best score is a nicety, never a failure.
  }
}

const sfx = new Sfx();
let world = createWorld(seed);
const ui = {
  screen: 'title',
  selectedPlot: null,
  selectedShop: null,
  hover: null,
  hoverPlot: null,
  speed: 1,
  paused: false,
  muted: false,
  banner: null,
  bestScore: loadBest(),
  hudButtons: [],
  shopCards: [],
  panelButtons: [],
  titleButton: null,
  endButton: null,
  startButton: null,
};

const BANNER_SUBS = {
  1: 'They come from the dark.',
  2: 'More of them, closer together.',
  3: 'Quick feet on the old road.',
  4: 'The tide does not slow.',
  5: 'A Gloom Lord walks the road.',
  6: 'Wisps flicker between the stones.',
  7: 'Stone hides behind stone.',
  8: 'The wisps dance tonight.',
  9: 'Iron will, iron tread.',
  10: 'The Lord has come back.',
  11: 'The longest night of the year.',
  12: 'The last night. Hold the light.',
};

function resetRun() {
  world = createWorld(seed);
  ui.selectedPlot = null;
  ui.selectedShop = null;
  ui.banner = null;
  ui.paused = false;
  ui.screen = 'playing';
  ui.bestScore = loadBest();
}

const api = {
  begin() {
    resetRun();
    sfx.waveHorn();
  },
  startWave() {
    if (ui.screen !== 'playing') return;
    startWave(world);
  },
  togglePause() {
    if (ui.screen === 'playing') {
      ui.paused = true;
      ui.screen = 'paused';
    } else if (ui.screen === 'paused') {
      ui.paused = false;
      ui.screen = 'playing';
    }
  },
  toggleMute() {
    ui.muted = !ui.muted;
    sfx.setMuted(ui.muted);
  },
  toggleSpeed() {
    ui.speed = ui.speed === 1 ? 2 : 1;
  },
  restart() {
    resetRun();
  },
};

attachInput(canvas, () => world, ui, sfx, api);

// Auto-pause when the tab is hidden, so a wave never runs away unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.screen === 'playing') api.togglePause();
});

function drainEvents() {
  for (const ev of world.events.splice(0)) {
    if (ev.type === 'shoot') sfx.shoot(ev.kind);
    else if (ev.type === 'kill') sfx.coin();
    else if (ev.type === 'leak') sfx.alarm();
    else if (ev.type === 'build' || ev.type === 'upgrade') sfx.build();
    else if (ev.type === 'sell') sfx.coin();
    else if (ev.type === 'deny') sfx.deny();
    else if (ev.type === 'bonus') sfx.coin();
    else if (ev.type === 'clear') sfx.coin();
    else if (ev.type === 'win') sfx.win();
    else if (ev.type === 'lose') sfx.lose();
    else if (ev.type === 'wave') {
      sfx.waveHorn();
      ui.banner = {
        text: `Wave ${ev.wave} — ${ev.name}`,
        sub: BANNER_SUBS[ev.wave] || 'Hold the road.',
        t: 2.4,
      };
    }
  }
}

function syncScreen() {
  if (world.result === 'won' && ui.screen === 'playing') {
    ui.screen = 'won';
    ui.bestScore = Math.max(ui.bestScore, world.score);
    saveBest(world.score);
  } else if (world.result === 'lost' && ui.screen === 'playing') {
    ui.screen = 'lost';
    ui.bestScore = Math.max(ui.bestScore, world.score);
    saveBest(world.score);
  }
}

let lastStatus = '';
function syncStatus() {
  const text =
    ui.screen === 'title'
      ? 'Lanternkeep. Press Space or click to light the first wave.'
      : ui.screen === 'won'
        ? `Victory. Score ${world.score}. Press R to play again.`
        : ui.screen === 'lost'
          ? `The light has fallen on wave ${world.wave}. Score ${world.score}. Press R to play again.`
          : `Wave ${world.wave} of 12, ${world.lives} lives, ${world.gold} gold, score ${world.score}, ${world.kills} gloom slain.`;
  if (text !== lastStatus) {
    lastStatus = text;
    statusEl.textContent = text;
  }
}

// Test and screenshot hook: the world and ui, live, for automation.
window.__LK = {
  get world() {
    return world;
  },
  get ui() {
    return ui;
  },
  sfx,
  api,
  verbs: { buildTower, upgradeTower, sellTower, startWave, step, createWorld },
  version: 1,
};

// ---------------------------------------------------------------------------
// Screenshot mode: stage the scene, render two frames, signal ready.
// ---------------------------------------------------------------------------
if (shot) {
  stageShot(shot, world, ui);
  for (let i = 0; i < 2; i++) {
    if (ui.screen === 'playing') {
      step(world, 1 / 60);
    } else if (world.result) {
      step(world, 1 / 60);
    } else {
      world.time += 1 / 60;
    }
    drainEvents();
    draw(ctx, world, ui);
  }
  syncStatus();
  window.__shotReady = true;
} else {
  // -------------------------------------------------------------------------
  // The live loop: fixed steps, scaled by the speed toggle.
  // -------------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (ui.banner) {
      ui.banner.t -= dt;
      if (ui.banner.t <= 0) ui.banner = null;
    }

    if (ui.screen === 'playing' && !ui.paused) {
      acc += dt * ui.speed;
      while (acc >= 1 / 60) {
        step(world, 1 / 60);
        acc -= 1 / 60;
      }
      drainEvents();
      syncScreen();
    } else if (ui.screen === 'won' || ui.screen === 'lost') {
      step(world, dt); // let the last particles settle
      drainEvents();
    } else if (ui.screen === 'title') {
      world.time += dt; // the beam keeps sweeping behind the title
    }

    draw(ctx, world, ui);
    syncStatus();
  }
  requestAnimationFrame(frame);
}
