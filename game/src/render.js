// Lanternkeep — every pixel the player sees. Canvas only: the night coast,
// the stone road, the plots, the lantern towers, the gloom, the lighthouse
// beam, the HUD, the shop, and the four screens (title, playing, paused,
// results). render() only reads the world; it never changes it. It also
// fills ui with the clickable rectangles input.js hit-tests.

import { CANVAS_H, CANVAS_W, LIGHTHOUSE, PALETTE, PATH, PATH_WIDTH, PLOTS, PLOT_RADIUS, TOWERS, TOWER_ORDER, WAVES } from './config.js';
import { pointAt, waveHpMul } from './enemies.js';
import { towerStats, upgradeCost, sellValue } from './towers.js';
import { makeRng, range } from './random.js';
import { waveProgress } from './world.js';

const HUD_H = 46;
const SHOP_Y = 516;
const SHOP_H = 84;

// Stars and cobbles are seeded once per world so the scene is stable.
const starCache = new Map();
function starsFor(seed) {
  if (!starCache.has(seed)) {
    const rng = makeRng(seed * 7919 + 13);
    const stars = [];
    for (let i = 0; i < 110; i++) {
      stars.push({ x: rng() * CANVAS_W, y: rng() * 330, r: 0.5 + rng() * 1.3, tw: rng() * Math.PI * 2 });
    }
    starCache.set(seed, stars);
  }
  return starCache.get(seed);
}

// Cobbles along the path, fixed for every game.
const COBBLES = (() => {
  const rng = makeRng(7);
  const pts = [];
  let d = 8;
  const total = (() => {
    let len = 0;
    for (let i = 0; i < PATH.length - 1; i++) len += Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]);
    return len;
  })();
  while (d < total) {
    const p = pointAt(d);
    const nx = Math.cos(p.angle + Math.PI / 2);
    const ny = Math.sin(p.angle + Math.PI / 2);
    const off = (rng() - 0.5) * (PATH_WIDTH - 14);
    pts.push({ x: p.x + nx * off, y: p.y + ny * off, w: 5 + rng() * 5, h: 3 + rng() * 3, a: p.angle + (rng() - 0.5) * 0.6, s: 0.5 + rng() * 0.5 });
    d += 15 + rng() * 9;
  }
  return pts;
})();

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.2, y, x - s * 0.6, y - s, x, y - s * 0.25);
  ctx.bezierCurveTo(x + s * 0.6, y - s, x + s * 1.2, y, x, y + s * 0.9);
  ctx.fill();
}

function drawCoin(ctx, x, y, r) {
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // The glyph is centred on the coin; restore the caller's alignment after.
  const prevAlign = ctx.textAlign;
  const prevBaseline = ctx.textBaseline;
  const prevFont = ctx.font;
  ctx.fillStyle = '#b8860b';
  ctx.font = `bold ${Math.round(r * 1.1)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', x, y + 0.5);
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBaseline;
  ctx.font = prevFont;
}

// ---------------------------------------------------------------------------
// The board: sky, sea, road, plots, lighthouse.
// ---------------------------------------------------------------------------

function drawBoard(ctx, world) {
  // Night sky.
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Stars, gently twinkling.
  const stars = starsFor(world.seed);
  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(world.time * 1.4 + s.tw));
    ctx.fillStyle = '#cdd8ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // Moon, top right, over the sea.
  const mx = 845;
  const my = 52;
  const mg = ctx.createRadialGradient(mx, my, 4, mx, my, 46);
  mg.addColorStop(0, 'rgba(240, 236, 200, 0.55)');
  mg.addColorStop(1, 'rgba(240, 236, 200, 0)');
  ctx.fillStyle = mg;
  ctx.fillRect(mx - 46, my - 46, 92, 92);
  ctx.fillStyle = '#f2ecd0';
  ctx.beginPath();
  ctx.arc(mx, my, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 175, 140, 0.5)';
  ctx.beginPath();
  ctx.arc(mx - 5, my - 3, 4, 0, Math.PI * 2);
  ctx.arc(mx + 6, my + 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // The sea, a dark band along the right edge under the lighthouse.
  ctx.fillStyle = PALETTE.sea;
  ctx.fillRect(928, 0, 32, CANVAS_H);
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const y = 30 + i * 62 + Math.sin(world.time * 0.7 + i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(932, y);
    ctx.lineTo(956, y + 6);
    ctx.stroke();
  }

  // Grass tufts and pebbles for texture (seeded, stable).
  const rng = makeRng(world.seed * 31 + 5);
  ctx.strokeStyle = 'rgba(90, 120, 90, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 46; i++) {
    const x = rng() * CANVAS_W;
    const y = 60 + rng() * 440;
    if (nearPath(x, y, 26) || nearPlot(x, y, 30)) continue;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - 5);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 3, y - 6);
    ctx.stroke();
  }

  drawPath(ctx);
  drawPlots(ctx, world);
  drawLighthouse(ctx, world);
}

function nearPath(x, y, pad) {
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x1, y1] = PATH[i];
    const [x2, y2] = PATH[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    if (Math.hypot(x - px, y - py) < PATH_WIDTH / 2 + pad) return true;
  }
  return false;
}

function nearPlot(x, y, pad) {
  return PLOTS.some((p) => Math.hypot(x - p.x, y - p.y) < PLOT_RADIUS + pad);
}

function drawPath(ctx) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Edge, then the road, then cobbles.
  ctx.strokeStyle = PALETTE.pathEdge;
  ctx.lineWidth = PATH_WIDTH + 6;
  ctx.beginPath();
  PATH.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = PALETTE.path;
  ctx.lineWidth = PATH_WIDTH;
  ctx.beginPath();
  PATH.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  for (const c of COBBLES) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    ctx.fillStyle = `rgba(120, 128, 170, ${0.25 + 0.35 * c.s})`;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
}

function drawPlots(ctx, world) {
  for (let i = 0; i < PLOTS.length; i++) {
    const p = PLOTS[i];
    const taken = world.towers.some((t) => t.plotIndex === i);
    ctx.fillStyle = taken ? PALETTE.plot : PALETTE.plotEmpty;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.plotRing;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!taken) {
      ctx.strokeStyle = 'rgba(154, 165, 207, 0.5)';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLOT_RADIUS - 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawLighthouse(ctx, world) {
  const lx = LIGHTHOUSE.x;
  const ly = LIGHTHOUSE.y;
  // Rock at its foot.
  ctx.fillStyle = '#1a2038';
  ctx.beginPath();
  ctx.ellipse(lx, ly + 26, 34, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // The sweeping beam, under the tower's glow but over the ground. Two
  // opposite beams, so one of them always washes across the board.
  const beamAngle = world.time * 0.45;
  ctx.save();
  ctx.translate(lx, ly - 104);
  ctx.globalCompositeOperation = 'lighter';
  for (const [ang, alpha] of [[beamAngle, 0.2], [beamAngle + Math.PI, 0.14]]) {
    ctx.save();
    ctx.rotate(ang);
    const beam = ctx.createLinearGradient(0, 0, 640, 0);
    beam.addColorStop(0, `rgba(255, 205, 110, ${alpha})`);
    beam.addColorStop(1, 'rgba(255, 205, 110, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(640, -52);
    ctx.lineTo(640, 52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Tower: cream and amber bands, wider at the foot.
  const bands = ['#f4ead2', '#ff9a3c', '#f4ead2', '#ff9a3c'];
  for (let i = 0; i < 4; i++) {
    const y0 = ly - 100 + i * 25;
    const w0 = 30 - i * 2;
    const w1 = 30 - (i + 1) * 2;
    ctx.fillStyle = bands[i];
    ctx.beginPath();
    ctx.moveTo(lx - w0 / 2, y0);
    ctx.lineTo(lx + w0 / 2, y0);
    ctx.lineTo(lx + w1 / 2, y0 + 25);
    ctx.lineTo(lx - w1 / 2, y0 + 25);
    ctx.closePath();
    ctx.fill();
  }
  // Gallery and lamp room.
  ctx.fillStyle = '#232946';
  ctx.fillRect(lx - 15, ly - 106, 30, 6);
  const glow = ctx.createRadialGradient(lx, ly - 116, 2, lx, ly - 116, 34);
  glow.addColorStop(0, 'rgba(255, 220, 130, 0.95)');
  glow.addColorStop(1, 'rgba(255, 220, 130, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(lx - 34, ly - 150, 68, 68);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(lx - 10, ly - 128, 20, 22);
  ctx.fillStyle = '#232946';
  ctx.beginPath();
  ctx.moveTo(lx - 13, ly - 128);
  ctx.lineTo(lx, ly - 140);
  ctx.lineTo(lx + 13, ly - 128);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Towers, enemies, shots, particles.
// ---------------------------------------------------------------------------

function drawTowers(ctx, world) {
  for (const t of world.towers) {
    const def = TOWERS[t.type];
    const flick = 0.85 + 0.15 * Math.sin(world.time * 9 + t.plotIndex * 2.4);
    // Warm pool of light on the ground.
    const pool = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 44);
    pool.addColorStop(0, def.glow + '44');
    pool.addColorStop(1, def.glow + '00');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 44, 0, Math.PI * 2);
    ctx.fill();

    // Stone base and pole.
    ctx.fillStyle = '#3a3f5c';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#565d85';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x, t.y - 16);
    ctx.stroke();

    // The lantern: glass, cap, flame. Level 3 gets a crown ring.
    const hy = t.y - 24;
    const gw = 9 + t.level * 2;
    const gh = 11 + t.level * 2;
    const glow = ctx.createRadialGradient(t.x, hy, 1, t.x, hy, 26 + t.level * 4);
    glow.addColorStop(0, def.glow);
    glow.addColorStop(1, def.glow + '00');
    ctx.globalAlpha = 0.55 * flick;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(t.x, hy, 26 + t.level * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = def.color;
    rr(ctx, t.x - gw / 2, hy - gh / 2, gw, gh, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(t.x - 1, hy - 1, 2.2 * flick, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#232946';
    ctx.beginPath();
    ctx.moveTo(t.x - gw / 2 - 2, hy - gh / 2);
    ctx.lineTo(t.x, hy - gh / 2 - 6);
    ctx.lineTo(t.x + gw / 2 + 2, hy - gh / 2);
    ctx.closePath();
    ctx.fill();
    if (t.level >= 3) {
      ctx.strokeStyle = def.glow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, hy, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Level pips.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < t.level ? def.color : '#3a3f5c';
      ctx.beginPath();
      ctx.arc(t.x - 8 + i * 8, t.y + 17, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Muzzle flash.
    if (t.flash > 0) {
      ctx.fillStyle = 'rgba(255, 250, 220, 0.9)';
      ctx.beginPath();
      ctx.arc(t.x, hy, 5 + t.flash * 30, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawEnemies(ctx, world) {
  for (const e of world.enemies) {
    const wob = Math.sin(e.bob) * 0.12;
    // Shadow blob.
    ctx.fillStyle = e.body;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.radius, e.radius * (0.86 + wob), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Frosted: a cyan rim while slowed.
    if (world.time < e.slowUntil) {
      ctx.strokeStyle = 'rgba(127, 227, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Glowing eyes, facing the way it walks.
    const fx = Math.cos(e.angle);
    const fy = Math.sin(e.angle);
    const px = -fy;
    const py = fx;
    for (const s of [-1, 1]) {
      const ex = e.x + fx * e.radius * 0.35 + px * s * e.radius * 0.38;
      const ey = e.y + fy * e.radius * 0.35 + py * s * e.radius * 0.38;
      ctx.fillStyle = e.eye;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.6, e.radius * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.type === 'boss') {
      // Horns and a jagged crown.
      ctx.fillStyle = '#3a2a55';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + s * e.radius * 0.7, e.y - e.radius * 0.5);
        ctx.lineTo(e.x + s * e.radius * 1.15, e.y - e.radius * 1.25);
        ctx.lineTo(e.x + s * e.radius * 0.95, e.y - e.radius * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Health bar when hurt.
    if (e.hp < e.maxHp) {
      const w = e.radius * 2;
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 4);
      ctx.fillStyle = pct > 0.5 ? '#7fd86a' : pct > 0.25 ? '#ffd76a' : '#ff5d5d';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w * pct, 4);
    }
  }
}

function drawProjectiles(ctx, world) {
  for (const p of world.projectiles) {
    if (p.kind === 'ember') {
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'frost') {
      ctx.fillStyle = '#7fe3ff';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(world.time * 6);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    } else if (p.kind === 'storm') {
      ctx.fillStyle = '#c99aff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(201, 154, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Chain lightning bolts.
  for (const b of world.bolts) {
    const a = Math.max(0, b.ttl / b.max);
    ctx.strokeStyle = `rgba(255, 240, 180, ${0.35 * a})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    b.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 240, ${0.95 * a})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    b.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }
}

function drawFx(ctx, world) {
  for (const p of world.particles) {
    const a = Math.max(0, p.ttl / p.max);
    ctx.globalAlpha = a * (p.size > 4 ? 0.35 : 0.9);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of world.floaters) {
    ctx.globalAlpha = Math.max(0, f.ttl / f.max);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// HUD, shop, panels, banners.
// ---------------------------------------------------------------------------

function drawHud(ctx, world, ui) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H - 0.5);
  ctx.lineTo(CANVAS_W, HUD_H - 0.5);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = 14;
  drawCoin(ctx, x + 8, HUD_H / 2, 9);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`${world.gold}`, x + 22, HUD_H / 2 + 1);
  x += 86;

  drawHeart(ctx, x + 8, HUD_H / 2, 7, world.lives <= 3 ? '#ff5d5d' : '#ff7d9c');
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${world.lives}`, x + 22, HUD_H / 2 + 1);
  x += 64;

  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Wave', x, HUD_H / 2 - 8);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${Math.min(world.wave, WAVES.length)}/12`, x, HUD_H / 2 + 9);
  // Wave progress bar.
  const pw = 110;
  ctx.fillStyle = '#232946';
  ctx.fillRect(x + 52, HUD_H / 2 - 5, pw, 10);
  ctx.fillStyle = PALETTE.teal;
  ctx.fillRect(x + 52, HUD_H / 2 - 5, pw * waveProgress(world), 10);
  x += 52 + pw + 18;

  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Score', x, HUD_H / 2 - 8);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${world.score}`, x, HUD_H / 2 + 9);
  x += 96;

  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Kills', x, HUD_H / 2 - 8);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${world.kills}`, x, HUD_H / 2 + 9);

  // Right-hand buttons: speed, pause, mute.
  ui.hudButtons = [];
  const btns = [
    { id: 'speed', label: ui.speed === 2 ? '2×' : '1×' },
    { id: 'pause', label: ui.paused ? '▶' : '❚❚' },
    { id: 'mute', label: ui.muted ? '✕' : '♪' },
  ];
  let bx = CANVAS_W - 14;
  for (const b of btns) {
    const w = 40;
    bx -= w;
    ctx.fillStyle = '#1c2450';
    rr(ctx, bx, 8, w, 30, 7);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hudLine;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, bx + w / 2, HUD_H / 2 + 1);
    ui.hudButtons.push({ id: b.id, x: bx, y: 8, w, h: 30 });
    bx -= 8;
  }
  ctx.textAlign = 'left';
}

function drawShop(ctx, world, ui) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.fillRect(0, SHOP_Y, CANVAS_W, SHOP_H);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.beginPath();
  ctx.moveTo(0, SHOP_Y + 0.5);
  ctx.lineTo(CANVAS_W, SHOP_Y + 0.5);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ui.shopCards = [];
  TOWER_ORDER.forEach((type, i) => {
    const def = TOWERS[type];
    const stats = towerStats(type, 1);
    const x = 14 + i * 160;
    const y = SHOP_Y + 8;
    const w = 150;
    const h = 68;
    const afford = world.gold >= def.cost;
    const selected = ui.selectedShop === type;
    ctx.fillStyle = selected ? '#2c3a6e' : afford ? '#1c2450' : '#141a38';
    rr(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = selected ? PALETTE.amber : PALETTE.hudLine;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    // Lantern glyph.
    ctx.fillStyle = def.color;
    rr(ctx, x + 10, y + 12, 14, 18, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x + 17, y + 21, 3, 0, Math.PI * 2);
    ctx.fill();
    // Name, key, cost, stats.
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(def.short, x + 32, y + 14);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`[${def.key}]  ${stats.dmg} dmg · ${stats.range} rng`, x + 32, y + 32);
    ctx.fillStyle = afford ? PALETTE.gold : '#8a7b4d';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${def.cost}g`, x + 32, y + 52);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '11px system-ui, sans-serif';
    const extra = type === 'frost' ? 'slows' : type === 'storm' ? 'splash' : type === 'prism' ? 'chains ×3' : 'rapid fire';
    ctx.fillText(extra, x + 92, y + 52);
    ui.shopCards.push({ type, x, y, w, h });
  });

  // Selected-plot panel, on the right of the shop bar.
  ui.panelButtons = [];
  const px = 668;
  const py = SHOP_Y + 8;
  const pw = 278;
  const ph = 68;
  ctx.fillStyle = '#141a38';
  rr(ctx, px, py, pw, ph, 9);
  ctx.fill();
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.lineWidth = 1;
  ctx.stroke();
  const plot = ui.selectedPlot;
  if (plot === null || plot === undefined) {
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Click a stone circle to build,', px + 14, py + 22);
    ctx.fillText('or pick a lantern, then a circle. Keys 1–4.', px + 14, py + 42);
  } else {
    const tower = world.towers.find((t) => t.plotIndex === plot);
    if (!tower) {
      const type = ui.selectedShop;
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(type ? `Build ${TOWERS[type].name} here — ${TOWERS[type].cost}g` : 'Empty plot — pick a lantern (1–4)', px + 14, py + 22);
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(type ? TOWERS[type].desc : 'Click a lantern card, then this circle.', px + 14, py + 42);
    } else {
      const def = TOWERS[tower.type];
      const stats = towerStats(tower.type, tower.level);
      ctx.fillStyle = def.color;
      rr(ctx, px + 12, py + 12, 14, 18, 3);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`${def.name}  ·  Lv ${tower.level}`, px + 32, py + 16);
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${stats.dmg} dmg · ${stats.range} rng · ${stats.rate}/s · ${tower.kills} kills`, px + 32, py + 34);
      // Upgrade / sell buttons.
      const up = upgradeCost(tower);
      const bw = 82;
      const bh = 26;
      const by = py + 38;
      const ux = px + 12;
      const sx = px + 104;
      ctx.fillStyle = tower.level >= 3 ? '#232946' : world.gold >= up ? '#2c5e3f' : '#232946';
      rr(ctx, ux, by, bw, bh, 6);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tower.level >= 3 ? 'MAX' : `Upgrade ${up}g`, ux + bw / 2, by + bh / 2 + 1);
      ctx.fillStyle = '#5e2c2c';
      rr(ctx, sx, by, bw, bh, 6);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(`Sell ${sellValue(tower)}g`, sx + bw / 2, by + bh / 2 + 1);
      ctx.textAlign = 'left';
      ui.panelButtons.push({ id: 'upgrade', x: ux, y: by, w: bw, h: bh });
      ui.panelButtons.push({ id: 'sell', x: sx, y: by, w: bw, h: bh });
    }
  }
}

function drawRange(ctx, world, ui) {
  // Range circle for the selected tower, or the shop type over a hovered plot.
  let cx = null;
  let cy = null;
  let range = 0;
  if (ui.selectedPlot !== null && ui.selectedPlot !== undefined) {
    const tower = world.towers.find((t) => t.plotIndex === ui.selectedPlot);
    const plot = PLOTS[ui.selectedPlot];
    if (tower) {
      cx = tower.x;
      cy = tower.y;
      range = towerStats(tower.type, tower.level).range;
    } else if (ui.selectedShop && plot) {
      cx = plot.x;
      cy = plot.y;
      range = towerStats(ui.selectedShop, 1).range;
    }
  } else if (ui.hoverPlot !== null && ui.hoverPlot !== undefined && ui.selectedShop) {
    const plot = PLOTS[ui.hoverPlot];
    cx = plot.x;
    cy = plot.y;
    range = towerStats(ui.selectedShop, 1).range;
  }
  if (cx === null) return;
  ctx.fillStyle = 'rgba(255, 179, 71, 0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.55)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  // Highlight the plot itself.
  const plot = PLOTS[ui.selectedPlot ?? ui.hoverPlot];
  if (plot) {
    ctx.strokeStyle = PALETTE.amber;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(plot.x, plot.y, PLOT_RADIUS + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBuildBanner(ctx, world, ui) {
  if (world.phase !== 'build' || world.result) return;
  const secs = Math.ceil(world.buildTimer);
  const bonus = secs * 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8, 12, 30, 0.75)';
  rr(ctx, CANVAS_W / 2 - 190, HUD_H + 10, 380, 34, 17);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`Build phase — Wave ${world.wave} starts in ${secs}s`, CANVAS_W / 2, HUD_H + 28);
  // Start Wave button, floating under the bar.
  const bw = 210;
  const bh = 38;
  const bx = CANVAS_W / 2 - bw / 2;
  const by = HUD_H + 52;
  ctx.fillStyle = '#2c5e3f';
  rr(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`▶  Start Wave ${world.wave}  (+${bonus}g)`, CANVAS_W / 2, by + bh / 2 + 1);
  ui.startButton = { x: bx, y: by, w: bw, h: bh };
  ctx.textAlign = 'left';
}

function drawWaveBanner(ctx, ui) {
  if (!ui.banner || ui.banner.t <= 0) return;
  const a = Math.min(1, (2.4 - ui.banner.t) / 0.5, ui.banner.t / 0.5);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8, 12, 30, 0.6)';
  ctx.fillRect(0, 210, CANVAS_W, 84);
  ctx.fillStyle = PALETTE.amber;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(ui.banner.text, CANVAS_W / 2, 244);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(ui.banner.sub, CANVAS_W / 2, 274);
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// The four screens.
// ---------------------------------------------------------------------------

function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(6, 9, 24, ${alpha})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 15, 38, 0.94)';
  rr(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = '#3a4a8a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTitle(ctx, world, ui) {
  dim(ctx, 0.45);
  const x = 190;
  const y = 96;
  const w = 580;
  const h = 400;
  panel(ctx, x, y, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.amber;
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText('LANTERNKEEP', CANVAS_W / 2, y + 56);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'italic 17px Georgia, serif';
  ctx.fillText('a tower defence of the last lighthouse', CANVAS_W / 2, y + 92);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('The gloom climbs the old road every night. Build lantern towers', CANVAS_W / 2, y + 132);
  ctx.fillText('on the stone circles, burn it back, and keep the light alive.', CANVAS_W / 2, y + 152);
  ctx.fillText('Survive all 12 waves. If the lighthouse falls, the night wins.', CANVAS_W / 2, y + 172);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Click a circle, then a lantern (keys 1–4) · Space starts a wave', CANVAS_W / 2, y + 208);
  ctx.fillText('Ember burns fast · Frost slows · Storm splashes · Prism chains', CANVAS_W / 2, y + 228);
  if (ui.bestScore > 0) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`Best score: ${ui.bestScore}`, CANVAS_W / 2, y + 258);
  }
  // Start button.
  const bw = 220;
  const bh = 46;
  const bx = CANVAS_W / 2 - bw / 2;
  const by = y + h - 84;
  ctx.fillStyle = '#2c5e3f';
  rr(ctx, bx, by, bw, bh, 11);
  ctx.fill();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillText('▶  Light the First Wave', CANVAS_W / 2, by + bh / 2 + 1);
  ui.titleButton = { x: bx, y: by, w: bw, h: bh };
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('or press Space', CANVAS_W / 2, by + bh + 20);
  ctx.textAlign = 'left';
}

function drawPaused(ctx, ui) {
  dim(ctx, 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText('Paused', CANVAS_W / 2, 260);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Press P or Space to keep watch', CANVAS_W / 2, 306);
  ctx.textAlign = 'left';
}

function drawEnd(ctx, world, ui) {
  const won = world.result === 'won';
  dim(ctx, 0.55);
  const x = 220;
  const y = 110;
  const w = 520;
  const h = 360;
  panel(ctx, x, y, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = won ? PALETTE.amber : PALETTE.danger;
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText(won ? 'The Light Endures!' : 'The Light Has Fallen', CANVAS_W / 2, y + 52);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '15px Georgia, serif';
  ctx.fillText(
    won ? 'Twelve waves, and the lighthouse still burns.' : 'The gloom reached the lighthouse.',
    CANVAS_W / 2,
    y + 88,
  );
  const rows = won
    ? [
        ['Final score', `${world.score}`],
        ['Time', fmtTime(world.timePlayed)],
        ['Gloom slain', `${world.kills}`],
        ['Lanterns built', `${world.towersBuilt}`],
        ['Lives left', `${world.lives}`],
      ]
    : [
        ['Wave reached', `${Math.min(world.wave, 12)} / 12`],
        ['Score', `${world.score}`],
        ['Gloom slain', `${world.kills}`],
        ['Lanterns built', `${world.towersBuilt}`],
        ['Time', fmtTime(world.timePlayed)],
      ];
  ctx.font = '15px system-ui, sans-serif';
  rows.forEach(([label, value], i) => {
    const ry = y + 132 + i * 30;
    ctx.fillStyle = PALETTE.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 90, ry);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w - 90, ry);
  });
  ctx.textAlign = 'center';
  if (ui.bestScore > 0) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`Best score: ${ui.bestScore}`, CANVAS_W / 2, y + 292);
  }
  const bw = 200;
  const bh = 44;
  const bx = CANVAS_W / 2 - bw / 2;
  const by = y + h - 62;
  ctx.fillStyle = '#2c5e3f';
  rr(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('↻  Play Again  (R)', CANVAS_W / 2, by + bh / 2 + 1);
  ui.endButton = { x: bx, y: by, w: bw, h: bh };
  ctx.textAlign = 'left';
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export function draw(ctx, world, ui) {
  ctx.save();
  if (world.shake > 0.5) {
    ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);
  }
  drawBoard(ctx, world);
  drawTowers(ctx, world);
  drawEnemies(ctx, world);
  drawProjectiles(ctx, world);
  drawFx(ctx, world);
  ctx.restore();

  // Range preview and selection live above the board.
  if (ui.screen === 'playing' || ui.screen === 'paused') drawRange(ctx, world, ui);

  drawHud(ctx, world, ui);
  if (ui.screen === 'playing' || ui.screen === 'paused') {
    drawShop(ctx, world, ui);
    drawBuildBanner(ctx, world, ui);
    drawWaveBanner(ctx, ui);
  }
  if (ui.screen === 'title') drawTitle(ctx, world, ui);
  else if (ui.screen === 'paused') drawPaused(ctx, ui);
  else if (ui.screen === 'won' || ui.screen === 'lost') drawEnd(ctx, world, ui);
}
