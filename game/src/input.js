// Lanternkeep — mouse and keyboard. All clicks are hit-tested against the
// rectangles render.js leaves in ui (HUD buttons, shop cards, panel buttons,
// the Start Wave pill, the title and restart buttons). Keys: 1–4 pick a
// lantern, Esc cancels, Space starts a wave / pauses, P pauses, M mutes,
// F toggles speed, R restarts.

import { PLOTS, PLOT_RADIUS, TOWERS } from './config.js';
import { buildTower, sellTower, startWave, upgradeTower } from './world.js';

function inRect(x, y, r) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function attachInput(canvas, getWorld, ui, sfx, api) {
  function toCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function hoverPlotAt(x, y) {
    for (let i = 0; i < PLOTS.length; i++) {
      if (Math.hypot(x - PLOTS[i].x, y - PLOTS[i].y) <= PLOT_RADIUS + 6) return i;
    }
    return null;
  }

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toCanvas(e);
    ui.hover = { x, y };
    ui.hoverPlot = hoverPlotAt(x, y);
  });

  canvas.addEventListener('pointerdown', (e) => {
    sfx.ensure();
    const world = getWorld();
    const { x, y } = toCanvas(e);

    // HUD buttons work on every screen.
    for (const b of ui.hudButtons || []) {
      if (inRect(x, y, b)) {
        if (b.id === 'speed') api.toggleSpeed();
        else if (b.id === 'pause') api.togglePause();
        else if (b.id === 'mute') api.toggleMute();
        return;
      }
    }

    if (ui.screen === 'title') {
      if (inRect(x, y, ui.titleButton)) api.begin();
      return;
    }
    if (ui.screen === 'won' || ui.screen === 'lost') {
      if (inRect(x, y, ui.endButton)) api.restart();
      return;
    }
    if (ui.screen !== 'playing') return;

    // Start Wave pill (build phase).
    if (inRect(x, y, ui.startButton)) {
      api.startWave();
      return;
    }

    // Upgrade / sell panel.
    for (const b of ui.panelButtons || []) {
      if (inRect(x, y, b)) {
        if (b.id === 'upgrade' && ui.selectedPlot !== null) {
          if (upgradeTower(world, ui.selectedPlot)) sfx.build();
          else sfx.deny();
        } else if (b.id === 'sell' && ui.selectedPlot !== null) {
          if (sellTower(world, ui.selectedPlot)) sfx.coin();
          ui.selectedPlot = null;
        }
        return;
      }
    }

    // Shop cards.
    for (const card of ui.shopCards || []) {
      if (inRect(x, y, card)) {
        ui.selectedShop = ui.selectedShop === card.type ? null : card.type;
        // A plot already selected + a lantern picked: build at once.
        if (ui.selectedShop && ui.selectedPlot !== null) {
          const plot = ui.selectedPlot;
          const tower = world.towers.find((t) => t.plotIndex === plot);
          if (!tower && buildTower(world, plot, ui.selectedShop)) {
            sfx.build();
            ui.selectedShop = null;
          } else if (!tower) {
            sfx.deny();
          }
        }
        return;
      }
    }

    // Plots.
    const plot = hoverPlotAt(x, y);
    if (plot !== null) {
      const tower = world.towers.find((t) => t.plotIndex === plot);
      if (ui.selectedShop && !tower) {
        if (buildTower(world, plot, ui.selectedShop)) {
          sfx.build();
          ui.selectedShop = null;
          ui.selectedPlot = plot;
        } else {
          sfx.deny();
        }
      } else {
        ui.selectedPlot = ui.selectedPlot === plot ? null : plot;
      }
      return;
    }

    // Clicked empty ground: clear the selection.
    ui.selectedPlot = null;
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    sfx.ensure();
    const world = getWorld();
    const k = e.key.toLowerCase();

    if (k === ' ') {
      e.preventDefault();
      if (ui.screen === 'title') api.begin();
      else if (ui.screen === 'won' || ui.screen === 'lost') api.restart();
      else if (ui.screen === 'playing' && world.phase === 'build') api.startWave();
      else api.togglePause();
      return;
    }
    if (k === 'escape') {
      ui.selectedShop = null;
      ui.selectedPlot = null;
      return;
    }
    if (k === 'p') {
      api.togglePause();
      return;
    }
    if (k === 'm') {
      api.toggleMute();
      return;
    }
    if (k === 'f') {
      api.toggleSpeed();
      return;
    }
    if (k === 'r') {
      if (ui.screen !== 'title') api.restart();
      return;
    }
    if (['1', '2', '3', '4'].includes(k)) {
      const type = Object.keys(TOWERS).find((t) => TOWERS[t].key === k);
      if (!type) return;
      ui.selectedShop = ui.selectedShop === type ? null : type;
      if (ui.selectedShop && ui.selectedPlot !== null) {
        const plot = ui.selectedPlot;
        const tower = world.towers.find((t) => t.plotIndex === plot);
        if (!tower && buildTower(world, plot, ui.selectedShop)) {
          sfx.build();
          ui.selectedShop = null;
        } else if (!tower) {
          sfx.deny();
        }
      }
    }
  });
}
