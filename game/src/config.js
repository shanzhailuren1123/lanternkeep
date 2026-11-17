// Lanternkeep — all balance numbers live here. Nothing else in the game
// hard-codes a cost, a damage value or a wave: tune it here and the whole
// game (world, towers, enemies, render, shots) follows.

export const CANVAS_W = 960;
export const CANVAS_H = 600;

// The gloom path: a winding stone road from the left edge to the lighthouse.
export const PATH = [
  [-30, 110],
  [620, 110],
  [620, 260],
  [200, 260],
  [200, 430],
  [780, 430],
  [780, 300],
  [872, 300],
];
export const PATH_WIDTH = 34;

// The lighthouse the path ends at. Enemies that reach it cost lives.
export const LIGHTHOUSE = { x: 905, y: 300 };

// Build plots: stone circles beside the road. 9 of them.
export const PLOTS = [
  { x: 150, y: 190 },
  { x: 330, y: 190 },
  { x: 510, y: 190 },
  { x: 120, y: 345 },
  { x: 330, y: 345 },
  { x: 540, y: 345 },
  { x: 300, y: 492 },
  { x: 520, y: 492 },
  { x: 700, y: 492 },
];
export const PLOT_RADIUS = 22;

// ---------------------------------------------------------------------------
// Towers. Each has 3 levels. level[0] is what you buy; upgrade cost is what
// the next level costs. rate = shots per second. slow = fraction of speed
// removed while slowed. splash = radius of the blast. chains = how many
// enemies one prism shot can hop to; each hop keeps 70% of the damage.
// ---------------------------------------------------------------------------
export const TOWERS = {
  ember: {
    key: '1',
    name: 'Ember Lantern',
    short: 'Ember',
    desc: 'Cheap, fast, short range. Single target.',
    color: '#ff9a3c',
    glow: '#ffb347',
    cost: 50,
    levels: [
      { dmg: 12, range: 95, rate: 2.0, upgrade: 45 },
      { dmg: 20, range: 105, rate: 2.3, upgrade: 90 },
      { dmg: 34, range: 115, rate: 2.8, upgrade: 0 },
    ],
  },
  frost: {
    key: '2',
    name: 'Frost Lantern',
    short: 'Frost',
    desc: 'Weak shots that slow the gloom down.',
    color: '#7fe3ff',
    glow: '#a5ecff',
    cost: 75,
    levels: [
      { dmg: 6, range: 110, rate: 1.2, slow: 0.4, slowDur: 1.6, upgrade: 65 },
      { dmg: 10, range: 120, rate: 1.3, slow: 0.5, slowDur: 1.8, upgrade: 120 },
      { dmg: 16, range: 130, rate: 1.5, slow: 0.6, slowDur: 2.2, upgrade: 0 },
    ],
  },
  storm: {
    key: '3',
    name: 'Storm Lantern',
    short: 'Storm',
    desc: 'Long range, slow shots, splash damage.',
    color: '#c99aff',
    glow: '#d9b8ff',
    cost: 120,
    levels: [
      { dmg: 26, range: 170, rate: 0.6, splash: 55, upgrade: 110 },
      { dmg: 42, range: 180, rate: 0.65, splash: 65, upgrade: 200 },
      { dmg: 68, range: 195, rate: 0.7, splash: 80, upgrade: 0 },
    ],
  },
  prism: {
    key: '4',
    name: 'Prism Lantern',
    short: 'Prism',
    desc: 'Costly chain lightning that jumps foes.',
    color: '#ffe9a8',
    glow: '#fff3c4',
    cost: 200,
    levels: [
      { dmg: 18, range: 140, rate: 0.9, chains: 3, upgrade: 180 },
      { dmg: 26, range: 150, rate: 1.0, chains: 4, upgrade: 320 },
      { dmg: 38, range: 160, rate: 1.1, chains: 5, upgrade: 0 },
    ],
  },
};
export const TOWER_ORDER = ['ember', 'frost', 'storm', 'prism'];
export const CHAIN_FALLOFF = 0.7; // damage kept per lightning hop
export const SELL_RATE = 0.7; // sell returns 70% of all gold put in

// ---------------------------------------------------------------------------
// Enemies. hp is the wave-1 value; every wave multiplies it by HP_PER_WAVE.
// speed is px per second on the path. reward is gold on kill. leak is how
// many lighthouse lives one escape costs.
// ---------------------------------------------------------------------------
export const HP_PER_WAVE = 0.2;
export const ENEMIES = {
  crawler: {
    name: 'Crawler',
    hp: 30, speed: 42, reward: 6, leak: 1, radius: 11,
    body: '#2a2f45', eye: '#ff5d5d',
  },
  swift: {
    name: 'Swift',
    hp: 18, speed: 80, reward: 7, leak: 1, radius: 9,
    body: '#33284d', eye: '#ffd23c',
  },
  bulwark: {
    name: 'Bulwark',
    hp: 130, speed: 26, reward: 12, leak: 2, radius: 16,
    body: '#1f2a3a', eye: '#ff8a5d',
  },
  wisp: {
    name: 'Wisp',
    hp: 26, speed: 55, reward: 9, leak: 1, radius: 10,
    body: '#26324a', eye: '#8ef6ff', wisp: true,
  },
  boss: {
    name: 'Gloom Lord',
    hp: 950, speed: 22, reward: 80, leak: 5, radius: 26,
    body: '#241a33', eye: '#ff3d6e',
  },
};

// ---------------------------------------------------------------------------
// The 12 waves. groups spawn one after another; within a group one enemy
// every `gap` seconds. hpMul grows with the wave on top of HP_PER_WAVE.
// ---------------------------------------------------------------------------
export const WAVES = [
  { name: 'First Shadows', groups: [{ type: 'crawler', count: 8, gap: 1.1 }] },
  { name: 'More Crawlers', groups: [{ type: 'crawler', count: 12, gap: 0.95 }] },
  {
    name: 'The Swifts Come',
    groups: [
      { type: 'crawler', count: 8, gap: 0.9 },
      { type: 'swift', count: 6, gap: 0.8 },
    ],
  },
  {
    name: 'Swift Tide',
    groups: [
      { type: 'crawler', count: 10, gap: 0.85 },
      { type: 'swift', count: 8, gap: 0.7 },
    ],
  },
  {
    name: 'The Gloom Lord Stirs',
    groups: [
      { type: 'boss', count: 1, gap: 1 },
      { type: 'crawler', count: 6, gap: 0.9 },
    ],
  },
  {
    name: 'Wisps in the Dark',
    groups: [
      { type: 'swift', count: 12, gap: 0.65 },
      { type: 'wisp', count: 5, gap: 1.0 },
    ],
  },
  {
    name: 'Bulwark Wall',
    groups: [
      { type: 'bulwark', count: 6, gap: 1.6 },
      { type: 'crawler', count: 10, gap: 0.8 },
    ],
  },
  {
    name: 'Wisp Dance',
    groups: [
      { type: 'wisp', count: 10, gap: 0.85 },
      { type: 'swift', count: 8, gap: 0.65 },
    ],
  },
  {
    name: 'Iron Tide',
    groups: [
      { type: 'bulwark', count: 8, gap: 1.4 },
      { type: 'swift', count: 12, gap: 0.6 },
    ],
  },
  {
    name: 'The Lord Returns',
    groups: [
      { type: 'boss', count: 1, gap: 1 },
      { type: 'wisp', count: 8, gap: 0.8 },
      { type: 'crawler', count: 6, gap: 0.85 },
    ],
  },
  {
    name: 'The Long Night',
    groups: [
      { type: 'swift', count: 14, gap: 0.55 },
      { type: 'bulwark', count: 8, gap: 1.3 },
      { type: 'wisp', count: 6, gap: 0.8 },
    ],
  },
  {
    name: 'The Last Night',
    groups: [
      { type: 'boss', count: 2, gap: 6 },
      { type: 'crawler', count: 10, gap: 0.8 },
      { type: 'swift', count: 10, gap: 0.6 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Economy and scoring.
// ---------------------------------------------------------------------------
export const ECONOMY = {
  startGold: 150,
  startLives: 12,
  buildTime: 12, // seconds of build phase between waves
  earlyBonusPerSec: 2, // gold per second left when you start a wave early
  waveBonusBase: 20, // wave-clear gold = base + perWave * wave
  waveBonusPerWave: 6,
  killScorePerGold: 10, // score per gold of kill reward
  waveClearScorePerWave: 100, // score per wave number on clear
  winLifeScore: 150, // score per lighthouse life left on victory
};

export const PROJECTILE_SPEED = 420;
export const STORM_SHELL_SPEED = 300;
export const CHAIN_JUMP_RANGE = 95; // how far lightning can hop

// The palette: deep-blue coast night, warm amber lamplight, teal accents.
export const PALETTE = {
  skyTop: '#0b1026',
  skyBottom: '#16204a',
  sea: '#0e1a3d',
  path: '#3a3f5c',
  pathEdge: '#4d5478',
  pathStone: '#565d85',
  plot: '#232946',
  plotRing: '#4a5178',
  plotEmpty: '#2c3357',
  hudBg: 'rgba(8, 12, 30, 0.82)',
  hudLine: '#2c3a6e',
  amber: '#ffb347',
  amberDeep: '#ff8a2a',
  teal: '#4fd8c4',
  text: '#eef1ff',
  textDim: '#9aa5cf',
  danger: '#ff5d5d',
  gold: '#ffd76a',
};
