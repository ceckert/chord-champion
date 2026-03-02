const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const PIXEL_RATIO = 2;
const CW = window.innerWidth, CH = window.innerHeight;
canvas.style.width  = CW + 'px';
canvas.style.height = CH + 'px';
canvas.width  = CW * PIXEL_RATIO;
canvas.height = CH * PIXEL_RATIO;
ctx.scale(PIXEL_RATIO, PIXEL_RATIO);

const VERSION = 'v10.2';
const TILE = 32;
const MAP_W = 500, MAP_H = 500;

// Generate tile map: 0=grass, 1=wall
const map = (() => {
  const m = [];
  for (let y = 0; y < MAP_H; y++) {
    m[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      // Border walls
      if (x === 0 || y === 0 || x === MAP_W-1 || y === MAP_H-1) { m[y][x] = 1; }
      // Random interior walls (~12%)
      else if (Math.random() < 0.12) { m[y][x] = 1; }
      else { m[y][x] = 0; }
    }
  }
  // Clear spawn area
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++)
      m[Math.floor(MAP_H/2)+dy][Math.floor(MAP_W/2)+dx] = 0;
  // Clear checkpoint area
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++)
      m[MAP_H-8+dy][MAP_W-8+dx] = 0;
  return m;
})();
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_COLORS = [
  '#ff6b6b','#ff9f43','#ffd32a','#a3cb38','#1289a7','#5758bb',
  '#6f1e51','#ee5a24','#009432','#0652dd','#9980fa','#fd79a8'
];

const CHORD_DEFS = [
  { name: 'Dominant 7th', notes: 4, intervals: [4,7,10], coins: 80 },
  { name: 'Major',        notes: 3, intervals: [4,7],    coins: 20 },
  { name: 'Minor',        notes: 3, intervals: [3,7],    coins: 20 },
  { name: 'Diminished',   notes: 3, intervals: [3,6],    coins: 30 },
  { name: 'Perfect 5th',  notes: 2, intervals: [7],      coins: 5  },
  { name: 'Major 3rd',    notes: 2, intervals: [4],      coins: 5  },
  { name: 'Minor 3rd',    notes: 2, intervals: [3],      coins: 5  },
  { name: 'Tritone',      notes: 2, intervals: [6],      coins: 8  },
];

// ── Gun Definitions ─────────────────────────────────────────────
const GUNS = [
  // dmg = per-bullet damage | rate = frames between shots (lower=faster) | life = bullet range
  { id:'pistol',     label:'🔫 Pistol',      dmg:24, rate:60, speed:12, spread:0,    pellets:1, color:'#fbbf24', bulletSize:5, life:55,
    tier:{ dmg:'High', rate:'Slow', range:'Medium' } },
  { id:'rifle',      label:'🎯 Rifle',        dmg:14, rate:35, speed:16, spread:0.02, pellets:1, color:'#60a5fa', bulletSize:4, life:90,
    tier:{ dmg:'Medium', rate:'Medium', range:'High' } },
  { id:'shotgun',    label:'💥 Shotgun',      dmg:40, rate:105, speed:10, spread:0.18, pellets:1, color:'#f97316', bulletSize:6, life:38,
    tier:{ dmg:'Insane', rate:'Slow', range:'Low' } },
  { id:'machinegun', label:'⚡ Machine Gun',  dmg:6,  rate:30, speed:14, spread:0.10, pellets:1, color:'#a78bfa', bulletSize:3, life:55,
    tier:{ dmg:'Low', rate:'Fast', range:'Medium' } },
];
let selectedGunId = 'pistol';
// ── Difficulty ────────────────────────────────────────────────
const DIFFICULTIES = {
  mom:    { label:'👩 Mom',   enemySpeed:0.5, enemyDmg:0.5, playerDmg:0.5 },
  easy:   { label:'😌 Easy',  enemySpeed:0.5, enemyDmg:0.5, playerDmg:1.0 },
  medium: { label:'⚔️ Medium', enemySpeed:1.0, enemyDmg:1.0, playerDmg:1.0 },
  hard:   { label:'💀 Hard',  enemySpeed:1.5, enemyDmg:1.5, playerDmg:1.0 },
};
let selectedDifficulty = 'medium';
function getDiff() { return DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.medium; }

let charPreviewAngle = 0;
let _charShowcaseRAF = null;

function runCharShowcase() {
  if (_charShowcaseRAF) cancelAnimationFrame(_charShowcaseRAF);
  function loop() {
    const cv = document.getElementById('char-showcase');
    if (!cv || document.getElementById('scr-charselect').style.display === 'none') {
      _charShowcaseRAF = null; return;
    }
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, 140, 140);
    // Floor circle
    cx.fillStyle = 'rgba(124,58,237,0.15)';
    cx.beginPath(); cx.ellipse(70, 100, 38, 14, 0, 0, Math.PI*2); cx.fill();
    cx.save();
    cx.translate(70, 80);
    cx.scale(2.5, 2.5); // scale up for showcase
    drawCharBody(cx, selectedCharacter, 0);
    // Gun arm rotates with charPreviewAngle
    cx.save();
    cx.translate(9, -1);
    cx.rotate(charPreviewAngle);
    cx.fillStyle = '#f9c74f'; cx.fillRect(0, -3, 8, 5);
    const gid = selectedGunId || 'pistol';
    if (gid === 'pistol') {
      cx.fillStyle='#374151'; cx.fillRect(7,-3,9,6);
      cx.fillStyle='#6b7280'; cx.fillRect(14,-2,4,4);
      cx.fillStyle='#fbbf24'; cx.fillRect(15,-3,2,2);
    } else if (gid === 'rifle') {
      cx.fillStyle='#292524'; cx.fillRect(7,-2,18,5);
      cx.fillStyle='#60a5fa'; cx.fillRect(13,-5,6,3);
    } else if (gid === 'shotgun') {
      cx.fillStyle='#78350f'; cx.fillRect(7,-4,14,9);
      cx.fillStyle='#f97316'; cx.fillRect(21,-4,3,9);
    } else {
      cx.fillStyle='#1c1917'; cx.fillRect(7,-4,20,8);
      cx.fillStyle='#44403c'; cx.fillRect(9,4,6,5);
    }
    cx.restore();
    cx.restore();
    // Handle A/D rotation
    if (keys['a'] || keys['arrowleft'])  charPreviewAngle -= 0.06;
    if (keys['d'] || keys['arrowright']) charPreviewAngle += 0.06;
    _charShowcaseRAF = requestAnimationFrame(loop);
  }
  _charShowcaseRAF = requestAnimationFrame(loop);
}

let selectedCharacter = 'jimmy';

function selectChar(name) {
  selectedCharacter = name;
  const nm = document.getElementById('char-showcase-name'); if(nm) nm.textContent = name.charAt(0).toUpperCase()+name.slice(1);
  ['jimmy','hanna','bob','max'].forEach(n => {
    const card = document.getElementById('cs-' + n);
    const btn = document.getElementById('btn-' + n);
    if (!card || !btn) return;
    if (n === name) {
      card.className = 'upg-card maxed';
      btn.textContent = '✓ SELECTED'; btn.classList.add('purchased');
    } else {
      card.className = 'upg-card can';
      btn.textContent = 'SELECT'; btn.classList.remove('purchased');
    }
  });
}

function startFromCharSelect() { uiPlay(); }
function setDifficulty(d) {
  selectedDifficulty = d;
  ['mom','easy','medium','hard'].forEach(k => {
    const el = document.getElementById('diff-'+k);
    if (el) el.classList.toggle('active', k === d);
  });
}

function drawCharPreview(canvasId, charName) {
  const cv = document.getElementById(canvasId); if (!cv) return;
  const cx = cv.getContext('2d'); cx.clearRect(0,0,60,80);
  cx.save(); cx.translate(30, 50);
  drawCharBody(cx, charName, 0);
  cx.restore();
}

function drawCharBody(cx, charName, frame) {
  // Shadow
  cx.fillStyle = 'rgba(0,0,0,0.18)';
  cx.beginPath(); cx.ellipse(2,14,11,5,0,0,Math.PI*2); cx.fill();

  if (charName === 'jimmy') {
    cx.fillStyle='#3b82f6'; cx.fillRect(-9,-6,18,20);
    cx.fillStyle='#93c5fd'; cx.fillRect(-9,-3,18,2); cx.fillRect(-9,3,18,2); cx.fillRect(-9,9,18,2);
    cx.fillStyle='#7c3aed'; cx.fillRect(-10,13,8,5); cx.fillRect(2,13,8,5);
    cx.fillStyle='#f9c74f'; cx.beginPath(); cx.arc(0,-12,9,0,Math.PI*2); cx.fill();
    cx.fillStyle='#78350f'; cx.beginPath(); cx.arc(0,-18,7,Math.PI,0); cx.fill();
    cx.fillRect(-4,-20,3,5); cx.fillRect(2,-22,3,6); cx.fillRect(-8,-17,3,5);
  } else if (charName === 'hanna') {
    // Hanna — lavender hoodie, longer blond hair
    cx.fillStyle='#c084fc'; cx.fillRect(-9,-6,18,20);
    cx.fillStyle='#e879f9'; cx.fillRect(-9,-3,18,2); cx.fillRect(-9,3,18,2); cx.fillRect(-9,9,18,2);
    cx.fillStyle='#f472b6'; cx.fillRect(-10,13,8,5); cx.fillRect(2,13,8,5);
    cx.fillStyle='#fde68a'; cx.beginPath(); cx.arc(0,-12,9,0,Math.PI*2); cx.fill();
    cx.fillStyle='#fbbf24';
    cx.beginPath(); cx.arc(0,-18,8,Math.PI,0); cx.fill();
    cx.fillRect(-10,-20,5,22); cx.fillRect(6,-20,4,20);
    cx.fillRect(-8,-22,5,5); cx.fillRect(2,-23,4,6);
  } else if (charName === 'bob') {
    // Bob — chubby kid, red shirt, blue shorts
    // Wider/rounder body
    cx.fillStyle='#dc2626'; cx.fillRect(-12,-6,24,22); // wider red shirt
    cx.fillStyle='#ef4444'; cx.fillRect(-12,-3,24,2); cx.fillRect(-12,5,24,2); // stripes
    cx.fillStyle='#1d4ed8'; cx.fillRect(-11,14,10,7); cx.fillRect(2,14,10,7); // blue shorts
    // Chubby head (bigger)
    cx.fillStyle='#fbbf24'; cx.beginPath(); cx.arc(0,-11,11,0,Math.PI*2); cx.fill();
    // Short dark hair
    cx.fillStyle='#292524'; cx.beginPath(); cx.arc(0,-18,8,Math.PI,0); cx.fill();
    cx.fillRect(-8,-20,16,4);
  } else {
    // Max — small goldendoodle on all fours, low to ground
    cx.save();
    cx.translate(0, 8); cx.scale(0.72, 0.72); // smaller and lower
    // Body (horizontal, low)
    cx.fillStyle='#fde68a'; cx.fillRect(-14,2,28,10);
    // Fluffy bumps
    cx.fillStyle='#fef3c7';
    for (let bx=-12; bx<=10; bx+=6) { cx.beginPath(); cx.arc(bx,5,3.5,0,Math.PI*2); cx.fill(); }
    // 4 short legs
    cx.fillStyle='#fde68a';
    cx.fillRect(-12,11,5,7); cx.fillRect(-4,11,5,7); // front legs
    cx.fillRect(4,11,5,7);  cx.fillRect(10,11,5,7);  // back legs
    // Curly tail up
    cx.fillStyle='#fef3c7'; cx.beginPath(); cx.arc(14,-2,5,0,Math.PI*2); cx.fill();
    cx.fillStyle='#fbbf24'; cx.beginPath(); cx.arc(14,-2,3,0,Math.PI*2); cx.fill();
    // Small round head
    cx.fillStyle='#fde68a'; cx.beginPath(); cx.arc(-13,-3,9,0,Math.PI*2); cx.fill();
    // Poofy head fur
    cx.fillStyle='#fef3c7';
    [-18,-13,-8].forEach(bx => { cx.beginPath(); cx.arc(bx,-9,4,0,Math.PI*2); cx.fill(); });
    // Floppy ears
    cx.fillStyle='#f59e0b'; cx.beginPath(); cx.arc(-18,2,5,0,Math.PI*2); cx.fill();
    cx.beginPath(); cx.arc(-8,2,5,0,Math.PI*2); cx.fill();
    // Snout
    cx.fillStyle='#fef9c3'; cx.fillRect(-19,-4,8,6);
    cx.fillStyle='#1c1917'; cx.beginPath(); cx.ellipse(-16,-2,3,2,0,0,Math.PI*2); cx.fill();
    // Tongue
    cx.fillStyle='#f87171'; cx.beginPath(); cx.ellipse(-16,3,2,3,0,0,Math.PI*2); cx.fill();
    cx.restore();
  }
  // Eyes (shared)
  cx.fillStyle='#1a0a2e'; cx.fillRect(-4,-14,3,3); cx.fillRect(2,-14,3,3);
  // Mouth
  cx.strokeStyle='#92400e'; cx.lineWidth=1; cx.beginPath();
  if (charName==='max') {
    // dog has snout already
  } else if (charName==='bob') {
    cx.arc(0,-9,2.5,0.4,Math.PI-0.4); cx.stroke();
  } else {
    cx.arc(0,-10,2,0.5,Math.PI-0.5); cx.stroke();
  }
}

function getSelectedGun() { return GUNS.find(g=>g.id===selectedGunId) || GUNS[0]; }

// Game State
let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'upgrades' | 'levelplan' | 'howtoplay'



function getTile(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
  return map[y][x];
}

const camera = { x: 0, y: 0 };
function worldToScreen(wx, wy) { return { x: wx - camera.x, y: wy - camera.y }; }

let savedCoins = 0; // banked MP — spent in upgrades
const player = {
  x: MAP_W / 2 * TILE, y: MAP_H / 2 * TILE,
  level: 1, ep: 0, epMax: 100, bonusUpgrades: {},
  w: 24, h: 28, speed: 3,
  hp: 150, maxHp: 150, coins: 0,
  notes: [], invincible: 0, facing: 1,
  shootCooldown: 0, shootRate: 40,
};

// Checkpoint
const checkpoint = {
  x: (MAP_W - 30) * TILE,
  y: (MAP_H - 30) * TILE,
  w: 48, h: 48,
  reached: false,
};

let mapNotes = [];
function spawnMapNote() {
  const pitch = Math.floor(Math.random() * 12);
  let x, y;
  do {
    x = (1 + Math.floor(Math.random() * (MAP_W - 2))) * TILE + TILE/2;
    y = (1 + Math.floor(Math.random() * (MAP_H - 2))) * TILE + TILE/2;
  } while (getTile(Math.floor(x/TILE), Math.floor(y/TILE)) === 1);
  mapNotes.push({ x, y, pitch, glow: 0, bobOffset: Math.random() * Math.PI * 2 });
}
for (let i = 0; i < 1200; i++) spawnMapNote();

let bullets = [];
let explosions = [];
let lightningArcs = [];
let equippedAbilities = []; // max 3
let biomeTimer = 0;        // frames in current biome
let lastBiome = 'forest';  // biome player was in last frame
let bossActive = false;    // only one boss at a time
let bossWarningTimer = 0;
let enemySpawnCap = 8;  // max non-boss enemies, increases over time  // flashing warning before spawn // id of the one active ability // { x1,y1,x2,y2,life } // { x, y, r, maxR, life, maxLife }

function triggerExplosion(x, y, radius, dmg) {
  explosions.push({ x, y, r: 4, maxR: radius, life: 20, maxLife: 20, dmg });
  // Damage all enemies in radius
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    const ecx = e.x + e.w/2, ecy = e.y + e.h/2;
    const dist = Math.sqrt((ecx-x)**2 + (ecy-y)**2);
    if (dist < radius) {
      e.hp -= dmg * (1 - dist/radius); // falloff
      if (e.hp <= 0) enemies.splice(j, 1);
    }
  }
}
function shoot(tx, ty) {
  if (player.shootCooldown > 0) return;
  const gun = getSelectedGun();
  const fireRate = Math.max(5, Math.floor(gun.rate * Math.pow(0.9, totalLevel('fire'))));
  player.shootCooldown = fireRate;
  const dx = tx - (player.x - camera.x);
  const dy = ty - (player.y - camera.y);
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  for (let p = 0; p < gun.pellets; p++) {
    const spread = (Math.random() - 0.5) * gun.spread * 2;
    const nx = dx/len, ny = dy/len;
    const sx = nx * Math.cos(spread) - ny * Math.sin(spread);
    const sy = nx * Math.sin(spread) + ny * Math.cos(spread);
    bullets.push({ x: player.x+player.w/2, y: player.y+player.h/2,
      vx: sx * gun.speed, vy: sy * gun.speed,
      life: (gun.life || 60) + totalLevel('range')*10,
      dmg: gun.dmg, color: gun.color, size: gun.bulletSize });
  }
}

let enemies = [];
let enemySpawnTimer = 0;


// =====================================================================
// BOSS DEFINITIONS — one per biome
// Each boss: type, w, h, hp, speed, dmg, phase behavior description
// =====================================================================
const BOSSES = {
  // 🌿 Forest Boss — Treant: massive, slow, stomps
  forest: {
    type: 'boss_treant', w: 64, h: 80, hp: 800, maxHp: 800,
    speed: 0.6, dmg: 30, label: '🌳 Treant'
  },
  // 🌊 Swamp Boss — Bog Queen: huge slimeling, spawns minions
  swamp: {
    type: 'boss_bogqueen', w: 72, h: 56, hp: 600, maxHp: 600,
    speed: 0.8, dmg: 25, label: '👸 Bog Queen'
  },
  // 🏜️ Desert Boss — Sandstorm King: giant scorpion, charges
  desert: {
    type: 'boss_sandking', w: 68, h: 52, hp: 700, maxHp: 700,
    speed: 1.8, dmg: 20, label: '🦂 Sandstorm King'
  },
  // ❄️ Tundra Boss — Glacier Giant: colossal yeti, freezes on hit
  tundra: {
    type: 'boss_glacier', w: 80, h: 96, hp: 1000, maxHp: 1000,
    speed: 0.5, dmg: 40, label: '🏔️ Glacier Giant'
  },
  // 🌋 Volcano Boss — Inferno Drake: fast fire dragon
  volcano: {
    type: 'boss_drake', w: 76, h: 60, hp: 650, maxHp: 650,
    speed: 2.2, dmg: 18, label: '🔥 Inferno Drake'
  },
  // 💎 Crystal Boss — Crystal Titan
  crystal: {
    type:'boss_crystaltitan', w:72,h:88,hp:900,maxHp:900,speed:0.7,dmg:35,label:'💎 Crystal Titan'
  },
  // 🌪️ Storm Boss — Tempest Drake
  storm: {
    type:'boss_tempest', w:80,h:64,hp:750,maxHp:750,speed:2.5,dmg:22,label:'🌪️ Tempest Drake'
  },
  // 🍄 Mushroom Boss — Mycelium Queen
  mushroom: {
    type:'boss_mycelqueen', w:68,h:68,hp:820,maxHp:820,speed:0.9,dmg:28,label:'🍄 Mycelium Queen'
  },
  // 🌑 Shadow Boss — Shadow Titan
  shadow: {
    type:'boss_shadowtitan', w:64,h:80,hp:1000,maxHp:1000,speed:1.6,dmg:32,label:'🌑 Shadow Titan'
  },
  // 💀 Void Boss — Void Lord: phase-shifting wraith
  void: {
    type: 'boss_voidlord', w: 60, h: 72, hp: 750, maxHp: 750,
    speed: 1.4, dmg: 28, label: '👁️ Void Lord'
  },
};

function spawnBoss(biome) {
  if (bossActive) return;
  const def = BOSSES[biome];
  if (!def) return;
  // Spawn near player but not on top
  const angle = Math.random() * Math.PI * 2;
  const dist = 300 + Math.random() * 100;
  const bx = Math.min((MAP_W-3)*TILE, Math.max(TILE*2, player.x + Math.cos(angle)*dist));
  const by = Math.min((MAP_H-3)*TILE, Math.max(TILE*2, player.y + Math.sin(angle)*dist));
  const boss = { ...def, x: bx, y: by, isBoss: true,
    phase: 1, phaseTimer: 0, spawnTimer: 0, chargeTarget: null };
  enemies.unshift(boss); // bosses go first in array
  bossActive = true;
  showNotif('⚠️ ' + def.label + ' has appeared!', '#ff4400', 240);
}

// 3×3 biome grid — void wraps the outer border
// Row 0(top): tundra | crystal | storm
// Row 1(mid): desert | forest  | swamp
// Row 2(bot): volcano| mushroom| shadow
// Outside 3×3 = void
const BIOME_GRID = [
  ['tundra',  'crystal',  'storm'  ],
  ['desert',  'forest',   'swamp'  ],
  ['volcano', 'mushroom', 'shadow' ],
];
const VOID_BORDER = 12; // tiles from edge = void

function getBiome(tx, ty) {
  if (tx < VOID_BORDER || ty < VOID_BORDER || tx >= MAP_W-VOID_BORDER || ty >= MAP_H-VOID_BORDER) return 'void';
  const col = Math.min(2, Math.floor((tx - VOID_BORDER) / Math.floor((MAP_W - VOID_BORDER*2) / 3)));
  const row = Math.min(2, Math.floor((ty - VOID_BORDER) / Math.floor((MAP_H - VOID_BORDER*2) / 3)));
  return BIOME_GRID[row][col];
}

function getBiomeAtPixel(px, py) {
  return getBiome(Math.floor(px/TILE), Math.floor(py/TILE));
}

function preSpawnEnemies(count) {
  for (let i = 0; i < count; i++) spawnEnemy(true);
}

function spawnEnemy(nearPlayer) {
  let ex, ey;
  {
    // Always spawn at the edges of the player's current camera view
    const halfW = Math.ceil(CW / 2) + TILE;
    const halfH = Math.ceil(CH / 2) + TILE;
    const cx = player.x + player.w/2;
    const cy = player.y + player.h/2;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { // top edge
      ex = cx - halfW + Math.random() * halfW * 2;
      ey = cy - halfH;
    } else if (side === 1) { // right edge
      ex = cx + halfW;
      ey = cy - halfH + Math.random() * halfH * 2;
    } else if (side === 2) { // bottom edge
      ex = cx - halfW + Math.random() * halfW * 2;
      ey = cy + halfH;
    } else { // left edge
      ex = cx - halfW;
      ey = cy - halfH + Math.random() * halfH * 2;
    }
    ex = Math.min((MAP_W-2)*TILE, Math.max(TILE, ex));
    ey = Math.min((MAP_H-2)*TILE, Math.max(TILE, ey));
    if (getTile(Math.floor(ex/TILE), Math.floor(ey/TILE)) >= 1) {
      ex = Math.min((MAP_W-2)*TILE, ex + TILE*2);
      ey = Math.min((MAP_H-2)*TILE, ey + TILE*2);
    }
  }
  const biome = getBiomeAtPixel(ex, ey); // use SPAWN location's biome for correct enemy type
  const r = Math.random();
  // ── Difficulty multipliers by biome (further = harder) ──────────
  const BIOME_MULT = { forest:1.0, swamp:1.35, desert:1.5, tundra:1.7, mushroom:1.45, crystal:1.8, storm:2.1, volcano:2.0, shadow:2.4, void:2.9 };
  const m = BIOME_MULT[biome] || 1.0;
  let type, w, h, hp, speed, dmg;

  // ── Forest (center): Crawler | Runner ──────────────────────────
  if (biome === 'forest') {
    if (r<0.55){type='crawler';   w=28;h=20;hp=Math.round(28*m); speed=0.8+r*0.4;dmg=Math.round(10*m);}
    else       {type='runner';    w=18;h=38;hp=Math.round(15*m); speed=2.2+r*0.8;dmg=Math.round(4*m);}

  // ── Swamp (mid-right): Slimeling | Bogcrawler ───────────────────
  } else if (biome === 'swamp') {
    if (r<0.55){type='slimeling'; w=36;h=24;hp=Math.round(80*m); speed=0.6+r*0.2;dmg=Math.round(12*m);}
    else       {type='bogcrawler';w=32;h=28;hp=Math.round(110*m);speed=0.5+r*0.2;dmg=Math.round(18*m);}

  // ── Desert (mid-left): Scorpling | Dunestalker ──────────────────
  } else if (biome === 'desert') {
    if (r<0.55){type='scorpling';  w=24;h=20;hp=Math.round(35*m); speed=2.5+r*0.8;dmg=Math.round(9*m);}
    else       {type='dunestalker';w=22;h=26;hp=Math.round(45*m); speed=3.0+r*0.6;dmg=Math.round(7*m);}

  // ── Tundra (top-left): Yeti | Frost Imp ─────────────────────────
  } else if (biome === 'tundra') {
    if (r<0.45){type='yeti';    w=40;h=44;hp=Math.round(140*m);speed=0.7+r*0.3;dmg=Math.round(22*m);}
    else       {type='frostimp';w=18;h=22;hp=Math.round(40*m); speed=2.8+r*0.5;dmg=Math.round(10*m);}

  // ── Crystal (top-center): Crystal Golem | Gem Sprite ────────────
  } else if (biome === 'crystal') {
    if (r<0.45){type='crystalgolem';w=38;h=42;hp=Math.round(130*m);speed=0.6+r*0.2;dmg=Math.round(20*m);}
    else       {type='gemsprite';   w=16;h=20;hp=Math.round(28*m); speed=3.2+r*0.6;dmg=Math.round(8*m);}

  // ── Storm (top-right): Wind Elemental | Storm Hawk ───────────────
  } else if (biome === 'storm') {
    if (r<0.5){type='windelemental';w=28;h=36;hp=Math.round(55*m); speed=2.2+r*0.6;dmg=Math.round(14*m);}
    else      {type='stormhawk';    w=32;h=24;hp=Math.round(45*m); speed=3.5+r*0.8;dmg=Math.round(10*m);}

  // ── Volcano (bot-left): Ember | Magma Crab ──────────────────────
  } else if (biome === 'volcano') {
    if (r<0.55){type='ember';    w=20;h=28;hp=Math.round(40*m); speed=2.8+r*0.7;dmg=Math.round(11*m);}
    else       {type='magmacrab';w=36;h=28;hp=Math.round(120*m);speed=0.6+r*0.2;dmg=Math.round(20*m);}

  // ── Mushroom (bot-center): Spore Puff | Mycelium Creep ──────────
  } else if (biome === 'mushroom') {
    if (r<0.55){type='sporepuff';     w=30;h=30;hp=Math.round(70*m); speed=0.9+r*0.3;dmg=Math.round(13*m);}
    else       {type='myceliumcreep'; w=26;h=18;hp=Math.round(55*m); speed=1.4+r*0.4;dmg=Math.round(16*m);}

  // ── Shadow (bot-right): Wraith | Void Shade ─────────────────────
  } else if (biome === 'shadow') {
    if (r<0.5){type='wraith';   w=26;h=32;hp=Math.round(60*m); speed=1.8+r*0.8;dmg=Math.round(18*m);}
    else      {type='voidshade';w=20;h=28;hp=Math.round(35*m); speed=3.5+r*0.5;dmg=Math.round(22*m);}

  // ── Void (border ring): Wraith | Void Shade (hardest) ───────────
  } else {
    if (r<0.5){type='wraith';   w=28;h=34;hp=Math.round(80*m); speed=2.0+r*0.8;dmg=Math.round(22*m);}
    else      {type='voidshade';w=22;h=30;hp=Math.round(45*m); speed=4.0+r*0.5;dmg=Math.round(28*m);}
  }
  enemies.push({ type, x:ex, y:ey, w, h, hp, maxHp:hp, speed, baseDmg:dmg, dmg, damageCooldown:0 });
}

let notification = null;
function showNotif(text, color, duration) {
  notification = { text, color, timer: duration || 120 };
}

const keys = {};
let mouseX = 0, mouseY = 0;
let mouseDown = false;

window.addEventListener('keydown', e => {
  if (['Escape','Backspace'].includes(e.key) && gameState !== 'playing') e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape') {
    if (gameState === 'playing') { gameState = 'paused'; document.getElementById('pause-overlay').style.display = 'flex'; }
    else if (gameState === 'paused') { uiResume(); }
    else { uiShow('scr-main'); }
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CW / rect.width;
  const scaleY = CH / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
});
canvas.addEventListener('mousedown', e => {
  if (gameState !== 'playing') return;
  mouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const scaleX = CW / rect.width;
  const scaleY = CH / rect.height;
  shoot((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
});
window.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (gameState === 'playing') forgeChord(); });

// HTML UI — global functions called by inline onclick handlers
function uiShow(screenId) {
  if (screenId === 'scr-main') { const el=document.getElementById('mp-display'); if(el) el.textContent='🎵 '+savedCoins+' MP'; }
  ['scr-main','scr-upgrades','scr-levelplan','scr-howtoplay','scr-charselect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const el = document.getElementById(screenId);
  if (el) el.style.display = 'flex';
  document.getElementById('ui-overlay').style.display = 'flex';
}
function uiPlay() {
  document.getElementById('ui-overlay').style.display = 'none';
  gameState = 'playing';
  interiorCooldown = 180; // prevent spawning inside a structure
  // Pre-spawn starting enemies so world feels alive immediately
  initRivers();
  initLandmarks();
  setTimeout(() => preSpawnEnemies(3), 300);
  canvas.setAttribute('tabindex', '0');
  canvas.focus();
}

function awardBossLevel() {
  player.ep = player.epMax; // fills EP bar to trigger level up on next frame
}
function openLevelUp() {
  gameState = 'paused';
  // Pick 3 random upgrades (not maxed)
  function ownedCount(list) { return list.filter(u => (u.level+(player.bonusUpgrades[u.id]||0)) > 0).length; }
  function pickFrom(list) {
    const maxOwned = ownedCount(list) >= 3;
    const valid = list.filter(u => {
      const tot = u.level+(player.bonusUpgrades[u.id]||0);
      if (tot >= u.max) return false;
      if (maxOwned && tot === 0) return false; // already have 3 types — only upgrade existing
      return true;
    });
    if (!valid.length) return null;
    return valid[Math.floor(Math.random() * valid.length)];
  }
  const picks = [
    pickFrom(UPGRADES.gun),
    pickFrom(UPGRADES.ability),
    pickFrom(UPGRADES.stats)
  ].filter(Boolean);
  const el = document.getElementById('levelup-overlay');
  const title = document.getElementById('levelup-title');
  const opts = document.getElementById('levelup-options');
  title.textContent = '⭐ Level ' + player.level + '!';
  opts.innerHTML = '';
  picks.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'buy-btn';
    btn.style.cssText = 'width:100%;margin:6px 0;padding:12px;font-size:15px;';
    const bon = player.bonusUpgrades[u.id]||0; const tot=u.level+bon;
    btn.innerHTML = '<strong>' + u.label + '</strong> <span style="color:#a78bfa">[Lv ' + tot + '→' + (tot+1) + ']</span><br><small style="color:#aaa">' + u.desc + '</small>';
    btn.onclick = () => {
      player.bonusUpgrades[u.id] = (player.bonusUpgrades[u.id] || 0) + 1;
      const total = u.level + (player.bonusUpgrades[u.id] || 0);
      // Apply stat effects immediately
      if (u.id === 'fire')  player.shootRate = Math.max(5, Math.floor(40 * Math.pow(0.9, total)));
      if (u.id === 'maxhp') { player.maxHp = 150 + total * 20; player.hp = Math.min(player.hp + 20, player.maxHp); }
      if (u.id === 'speed') player.speed = 3 + total * 0.3;
      // Auto-equip ability if picked
      if (u.id.startsWith('ab_')) {
        if (!equippedAbilities.includes(u.id) && equippedAbilities.length < 3) equippedAbilities.push(u.id);
        showNotif('🆓 ' + u.label + ' free! (Lv' + total + ')', '#a855f7', 180);
      } else {
        showNotif('🆓 ' + u.label + ' Lv' + total + '!', '#22c55e', 150);
      }
      el.style.display = 'none';
      gameState = 'playing';
    };
    opts.appendChild(btn);
  });
  el.style.display = 'flex';
}

function uiResume() {
  document.getElementById('pause-overlay').style.display = 'none';
  gameState = 'playing';
}
function uiQuit() {
  document.getElementById('pause-overlay').style.display = 'none';
  gameState = 'menu';
  uiShow('scr-main');
}
let _fromPause = false;
function uiRefundAll() {
  let refund = 0;
  ALL_UPGRADES.forEach(u => {
    if (u.level > 0) {
      // Refund all tiers: baseCost * (2^level - 1)
      refund += Math.floor(u.baseCost * (Math.pow(2, u.level) - 1));
      u.level = 0;
    }
  });
  // Reset equipped abilities
  equippedAbilities = equippedAbilities.filter(id => {
    const u = ALL_UPGRADES.find(u=>u.id===id);
    return u && (u.level + (player.bonusUpgrades[id]||0)) > 0;
  });
  // Reset stat effects
  player.shootRate = 40; player.speed = 3; player.maxHp = 150;
  player.hp = Math.min(player.hp, player.maxHp);
  savedCoins += refund;
  showNotif('↩ Refunded ' + refund + ' MP!', '#22c55e', 180);
  uiUpgrades();
}
function uiUpgradesFromPause() {
  _fromPause = true;
  document.getElementById('pause-overlay').style.display = 'none';
  uiUpgrades();
}
function uiUpgrades() {
  document.getElementById('coins-display').textContent = 'Music Points: ' + savedCoins + ' MP';
  ['gun','ability','stats'].forEach(tab => {
    const pane = document.getElementById('tab-' + tab);
    pane.innerHTML = '';
    UPGRADES[tab].forEach(u => {
      const cost = upgradeCost(u);
      const maxed = u.level >= u.max;
      const canAfford = savedCoins >= cost && !maxed;
      const card = document.createElement('div');
      const isEquipped = tab === 'ability' && equippedAbilities.includes(u.id);
      card.className = 'upg-card' + (maxed ? ' maxed' : canAfford ? ' can' : '') + (isEquipped ? ' maxed' : '');
      card.innerHTML =
        '<div class="upg-name">' + u.label + ' <span style="color:#a78bfa">[Lv ' + u.level + '/' + u.max + ']</span></div>' +
        '<div class="upg-desc">' + u.desc + '</div>';
      const dots = document.createElement('div'); dots.className = 'upg-dots';
      for (let i = 0; i < u.max; i++) {
        const d = document.createElement('div');
        d.className = 'upg-dot' + (i < u.level ? ' on' : ''); dots.appendChild(d);
      }
      card.appendChild(dots);
      if (maxed) {
        const m = document.createElement('div'); m.className = 'upg-max'; m.textContent = 'MAXED';
        card.appendChild(m);
      } else {
        const btn = document.createElement('button');
        btn.className = 'buy-btn'; btn.disabled = !canAfford;
        btn.textContent = u.level > 0 ? 'UPGRADE → Lv' + (u.level+1) + ' (' + cost + ' MP)' : 'BUY — ' + cost + ' MP';
        if (u.level > 0) btn.classList.add('purchased');
        btn.onclick = () => { if (applyUpgrade(u)) uiUpgrades(); };
        card.appendChild(btn);
      }
      // Ability tab: equip button
      if (tab === 'ability' && (u.level+(player.bonusUpgrades[u.id]||0)) > 0) {
        const equipped = equippedAbilities.includes(u.id);
        const eq = document.createElement('button');
        eq.className = 'buy-btn'; eq.style.marginTop = '4px';
        eq.style.background = equipped ? '#22c55e' : (equippedAbilities.length >= 3 ? '#374151' : '#7c3aed');
        eq.disabled = !equipped && equippedAbilities.length >= 3;
        eq.textContent = equipped ? '✅ EQUIPPED' : (equippedAbilities.length >= 3 ? '🔒 FULL (3/3)' : 'EQUIP');
        eq.onclick = () => {
          if (equipped) { equippedAbilities = equippedAbilities.filter(id => id !== u.id); }
          else if (equippedAbilities.length < 3) { equippedAbilities.push(u.id); }
          uiUpgrades();
        };
        card.appendChild(eq);
      }
      pane.appendChild(card);
    });
  });
  // patch back button to return to game if came from pause
  const backBtn = document.querySelector('#scr-upgrades .back');
  if (backBtn) backBtn.onclick = () => { if (_fromPause) { _fromPause=false; uiResume(); } else uiShow('scr-main'); };
  // Build gun selection tab
  const gunPane = document.getElementById('tab-gun-select');
  if (gunPane) {
    gunPane.innerHTML = '';
    GUNS.forEach(gun => {
      const card = document.createElement('div');
      const selected = selectedGunId === gun.id;
      card.className = 'upg-card' + (selected ? ' maxed' : ' can');
      card.style.cursor = 'pointer';
      const tierColor = t => t==='Insane' ? '#e879f9' : t==='High'||t==='Fast' ? '#4ade80' : t==='Low'||t==='Slow' ? '#f87171' : '#fbbf24';
      card.innerHTML = `<div class="upg-name">${gun.label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px">
          <div style="text-align:center;background:rgba(0,0,0,0.3);border-radius:6px;padding:6px 4px">
            <div style="font-family:monospace;font-size:10px;color:#94a3b8">DAMAGE</div>
            <div style="font-family:monospace;font-size:13px;font-weight:bold;color:${tierColor(gun.tier.dmg)}">${gun.tier.dmg}</div>
          </div>
          <div style="text-align:center;background:rgba(0,0,0,0.3);border-radius:6px;padding:6px 4px">
            <div style="font-family:monospace;font-size:10px;color:#94a3b8">FIRE RATE</div>
            <div style="font-family:monospace;font-size:13px;font-weight:bold;color:${tierColor(gun.tier.rate)}">${gun.tier.rate}</div>
          </div>
          <div style="text-align:center;background:rgba(0,0,0,0.3);border-radius:6px;padding:6px 4px">
            <div style="font-family:monospace;font-size:10px;color:#94a3b8">RANGE</div>
            <div style="font-family:monospace;font-size:13px;font-weight:bold;color:${tierColor(gun.tier.range)}">${gun.tier.range}</div>
          </div>
        </div>`;
      const btn = document.createElement('button');
      btn.className = 'buy-btn' + (selected ? ' purchased' : '');
      btn.textContent = selected ? '✓ EQUIPPED' : 'SELECT';
      btn.onclick = () => { selectedGunId = gun.id; uiUpgrades(); };
      card.appendChild(btn);
      gunPane.appendChild(card);
    });
  }
  uiShow('scr-upgrades');
}

function uiTab(tabName, btnEl) {
  ['gun','ability','stats','gun-select'].forEach(t => {
    const el = document.getElementById('tab-' + t); if (!el) return;
    el.className = 'tab-pane' + (t === tabName ? ' active' : '');
    el.style.display = t === tabName ? 'flex' : 'none';
  });
  btnEl.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
}


function forgeChord() {
  if (player.notes.length < 2) { showNotif('Need at least 2 notes!', '#ff6b6b'); return; }
  const pitches = [...new Set(player.notes)].sort((a,b) => a - b);
  let best = null;
  for (const def of CHORD_DEFS) {
    if (pitches.length < def.notes) continue;
    for (let ri = 0; ri < pitches.length; ri++) {
      const root = pitches[ri];
      const needed = [root, ...def.intervals.map(i => (root + i) % 12)];
      if (new Set(needed).size !== def.notes) continue;
      if (needed.every(n => pitches.includes(n))) { best = { def, root, needed }; break; }
    }
    if (best) break;
  }
  if (!best) {
    player.notes = [];
    showNotif('Chord Not Found! All notes lost!', '#ff6b6b', 100);
    return;
  }
  const rootName = NOTE_NAMES[best.root];
  savedCoins += best.def.coins; // permanent — never lost on death
  const usedPitches = [...best.needed];
  player.notes = player.notes.filter(p => {
    const idx = usedPitches.indexOf(p);
    if (idx !== -1) { usedPitches.splice(idx, 1); return false; }
    return true;
  });
  showNotif(rootName + ' ' + best.def.name + '! +' + best.def.coins + ' MP', '#fbbf24', 140);
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}
function resolveMapCollision(obj) {
  const m = 2;
  const l = Math.floor((obj.x+m)/TILE), r = Math.floor((obj.x+obj.w-m)/TILE);
  const t = Math.floor((obj.y+m)/TILE), b = Math.floor((obj.y+obj.h-m)/TILE);
  return getTile(l,t)||getTile(r,t)||getTile(l,b)||getTile(r,b);
}

let frame = 0;

// ── Interior Map System ───────────────────────────────────────────────────────
let interiorState = null;  // null = on world map; object = inside a structure
let interiorCooldown = 0; // prevents re-entry immediately after exit

const INTERIOR_THEMES = {
  forest:    { floor:'#5c3317', floorAlt:'#4a2a10', wall:'#3b1f0a', wallDeco:'#8B4513', accent:'#f0c060', name:'Treehouse', exit:'🪜 Ladder', intro:'You climb into the treehouse...' },
  tundra:    { floor:'#b0d4f0', floorAlt:'#8ab8e0', wall:'#4a7090', wallDeco:'#80c0e0', accent:'#aaddff', name:'Ice Cave', exit:'🕳️ Cave Exit', intro:'The ice walls hum with cold...' },
  mushroom:  { floor:'#3a1a5a', floorAlt:'#2a0e40', wall:'#1a0a2e', wallDeco:'#a855f7', accent:'#e879f9', name:'Mushroom Den', exit:'🍄 Spore Lift', intro:'Glowing spores drift around you...' },
  desert:    { floor:'#c2933a', floorAlt:'#a87820', wall:'#7a4a10', wallDeco:'#d4a050', accent:'#ffd700', name:'Pyramid Chamber', exit:'🏺 Hidden Door', intro:'Ancient carvings line the walls...' },
  swamp:     { floor:'#2a4a1a', floorAlt:'#1a3010', wall:'#0f1e0a', wallDeco:'#4a8030', accent:'#88ff44', name:'Swamp Ruins', exit:'🌿 Vine Rope', intro:'Murky water drips from the ceiling...' },
  crystal:   { floor:'#1a1a5a', floorAlt:'#0e0e40', wall:'#0a0a2e', wallDeco:'#6060ff', accent:'#88aaff', name:'Crystal Shrine', exit:'💎 Crystal Gate', intro:'The crystals sing a soft tone...' },
  storm:     { floor:'#2a2a3a', floorAlt:'#1a1a28', wall:'#0a0a18', wallDeco:'#7070ff', accent:'#aaaaff', name:'Storm Tower', exit:'⚡ Bolt Door', intro:'Static crackles on your skin...' },
  volcano:   { floor:'#3a1010', floorAlt:'#2a0808', wall:'#1a0404', wallDeco:'#ff4400', accent:'#ff8800', name:'Volcano Forge', exit:'🔥 Lava Bridge', intro:'Heat radiates from the stone...' },
  shadow:    { floor:'#1a1a1a', floorAlt:'#111111', wall:'#050505', wallDeco:'#4a0050', accent:'#cc44ff', name:'Shadow Vault', exit:'👁️ Dark Portal', intro:'Shadows writhe at the edges...' },
};

function enterInterior(lm) {
  if (interiorCooldown > 0) return;
  const theme = INTERIOR_THEMES[lm.biome] || INTERIOR_THEMES.forest;
  const iW = CW, iH = CH;
  // Spawn 3-4 enemies in interior
  const iEnemies = [];
  for (let i = 0; i < 3 + Math.floor(Math.random()*2); i++) {
    iEnemies.push({
      x: 120 + Math.random()*(iW-240), y: 120 + Math.random()*(iH-320),
      vx: (Math.random()-.5)*1.5, vy: (Math.random()-.5)*1.5,
      hp: 30, maxHp: 30, w: 24, h: 24,
      wobble: Math.random()*Math.PI*2
    });
  }
  const bDef = BOSSES[lm.biome] || BOSSES.forest;
  const iBoss = {
    ...bDef,
    x: iW*0.5, y: iH*0.30,
    hp: Math.round(bDef.hp * 0.25), maxHp: Math.round(bDef.hp * 0.25), // 25% of world hp for interior
    speed: bDef.speed * 0.7,
    dmg: Math.round(bDef.dmg * 0.6),
    phase2: false, wobble: 0, invincible: 0,
  };
  interiorState = {
    theme, biome: lm.biome, lm,
    px: iW/2, py: iH*0.72,
    enemies: iEnemies,
    boss: iBoss,
    bossDefeated: false,
    chestX: iW*0.5, chestY: iH*0.18,
    chestCollected: false,
    exitX: iW*0.5, exitY: iH*0.88,
    enterFrame: frame,
    bullets: [],
    shootCooldown: 0,
  };
  showNotif('📦 ' + theme.intro, '#fbbf24', 180);
}

function updateInterior() {
  const s = interiorState;
  if (!s) return;
  s.shootCooldown--;
  const spd = player.speed;
  let nx = s.px, ny = s.py;
  if (keys['a']||keys['arrowleft'])  nx -= spd;
  if (keys['d']||keys['arrowright']) nx += spd;
  if (keys['w']||keys['arrowup'])    ny -= spd;
  if (keys['s']||keys['arrowdown'])  ny += spd;
  const margin = 30;
  s.px = Math.max(margin, Math.min(CW-margin, nx));
  s.py = Math.max(80+margin, Math.min(CH-margin, ny));

  // Shoot
  if (mouseDown && s.shootCooldown <= 0) {
    const gun = getSelectedGun();
    s.shootCooldown = gun.rate;
    const dx = mouseX - s.px, dy = mouseY - s.py;
    const len = Math.sqrt(dx*dx+dy*dy)||1;
    s.bullets.push({ x:s.px, y:s.py, vx:dx/len*12, vy:dy/len*12, life:60, dmg:gun.dmg });
  }
  s.bullets.forEach((b,i) => {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if (b.life<=0||b.x<0||b.x>CW||b.y<80||b.y>CH) { s.bullets.splice(i,1); return; }
    s.enemies.forEach((e,ei) => {
      if (Math.abs(b.x-e.x)<e.w&&Math.abs(b.y-e.y)<e.h) {
        e.hp -= b.dmg; s.bullets.splice(i,1);
        if (e.hp<=0) { s.enemies.splice(ei,1); showNotif('+5 MP!','#22c55e',60); savedCoins+=5; }
      }
    });
  });
  s.enemies.forEach(e => {
    e.wobble += 0.05;
    const dx2=s.px-e.x, dy2=s.py-e.y, dist=Math.sqrt(dx2*dx2+dy2*dy2)||1;
    if (dist < 200) { e.x+=dx2/dist*0.8; e.y+=dy2/dist*0.8; }
    else { e.x+=e.vx+Math.sin(e.wobble)*0.5; e.y+=e.vy+Math.cos(e.wobble)*0.5; }
    e.x=Math.max(60,Math.min(CW-60,e.x)); e.y=Math.max(110,Math.min(CH-60,e.y));
    if (Math.abs(s.px-e.x)<18&&Math.abs(s.py-e.y)<18&&frame%40===0) {
      player.hp-=Math.round(5*getDiff().enemyDmg); player.invincible=30;
    }
  });
  // Boss update
  if (s.boss && !s.bossDefeated) {
    const b = s.boss;
    b.wobble += 0.05;
    if (b.invincible > 0) b.invincible--;
    // Phase 2 at 50% hp
    if (!b.phase2 && b.hp <= b.maxHp*0.5) {
      b.phase2 = true; b.speed *= 1.5;
      showNotif('⚠️ ' + b.label + ' ENRAGED!', '#ff4444', 120);
    }
    const bdx = s.px-b.x, bdy = s.py-b.y, bdist = Math.sqrt(bdx*bdx+bdy*bdy)||1;
    b.x += (bdx/bdist)*b.speed + Math.sin(b.wobble)*1.2;
    b.y += (bdy/bdist)*b.speed + Math.cos(b.wobble)*0.8;
    b.x = Math.max(40,Math.min(CW-40,b.x)); b.y = Math.max(110,Math.min(CH-80,b.y));
    // Boss hits player
    if (Math.abs(s.px-b.x)<b.w*0.6&&Math.abs(s.py-b.y)<b.h*0.6&&frame%50===0) {
      player.hp -= Math.round(b.dmg*getDiff().enemyDmg); player.invincible=40;
      showNotif('-'+Math.round(b.dmg*getDiff().enemyDmg)+' HP!','#ff4444',60);
    }
    // Bullets hit boss
    s.bullets.forEach((bl,bi) => {
      if (Math.abs(bl.x-b.x)<b.w*0.6&&Math.abs(bl.y-b.y)<b.h*0.6&&b.invincible===0) {
        b.hp -= bl.dmg; b.invincible = 8; s.bullets.splice(bi,1);
        if (b.hp <= 0) {
          s.bossDefeated = true;
          awardBossLevel(); showNotif('🏆 ' + b.label + ' defeated! +1 LEVEL!','#fbbf24',240);
          // Trigger level-up immediately inside interior
          if (player.ep >= player.epMax) {
            player.ep = 0;
            if (player.level < 99) {
              player.level++;
              player.epMax = Math.floor(100 * Math.pow(1.18, player.level - 1));
              player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.2));
              openLevelUp();
            }
          }
        }
      }
    });
  }

  // Chest collect
  const cd = Math.sqrt((s.px-s.chestX)**2+(s.py-s.chestY)**2);
  if (!s.chestCollected && cd < 40 && mouseDown) {
    s.chestCollected = true; savedCoins += 50;
    showNotif('📦 +50 MP from chest!','#fbbf24',180);
  }
  // Exit ladder
  const ed = Math.sqrt((s.px-s.exitX)**2+(s.py-s.exitY)**2);
  if (ed < 36) {
    interiorState = null; interiorCooldown = 120;
    showNotif('You leave the ' + s.theme.name + '...','#a78bfa',120);
  }
}

function drawInterior() {
  const s = interiorState;
  const t = s.theme;
  // Floor tiles
  const FTILE = 48;
  for (let ty=0; ty*FTILE<CH; ty++) {
    for (let tx=0; tx*FTILE<CW; tx++) {
      ctx.fillStyle = (tx+ty)%2===0 ? t.floor : t.floorAlt;
      ctx.fillRect(tx*FTILE, ty*FTILE, FTILE, FTILE);
    }
  }
  // Wall (top band)
  ctx.fillStyle = t.wall;
  ctx.fillRect(0, 0, CW, 80);
  // Wall border stripes
  ctx.fillStyle = t.wallDeco;
  for (let i=0; i<20; i++) { ctx.fillRect(i*60, 0, 4, 80); }
  // Wall accent line
  ctx.fillStyle = t.accent; ctx.fillRect(0, 77, CW, 4);
  // Left/right wall strips
  ctx.fillStyle = t.wall;
  ctx.fillRect(0,80,20,CH); ctx.fillRect(CW-20,80,20,CH);
  ctx.fillStyle = t.accent;
  ctx.fillRect(17,80,3,CH); ctx.fillRect(CW-20,80,3,CH);

  // Torches on wall
  [CW*0.2, CW*0.5, CW*0.8].forEach(tx2 => {
    const flicker = 0.7 + Math.sin(frame*0.15+tx2)*0.3;
    ctx.fillStyle='#5a3317'; ctx.fillRect(tx2-4,60,8,20);
    ctx.fillStyle='#ff8800'; ctx.globalAlpha=flicker;
    ctx.beginPath(); ctx.arc(tx2,58,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffcc44';
    ctx.beginPath(); ctx.arc(tx2,56,4,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // Light glow
    const grad = ctx.createRadialGradient(tx2,58,0,tx2,58,80);
    grad.addColorStop(0,'rgba(255,160,0,0.18)'); grad.addColorStop(1,'rgba(255,160,0,0)');
    ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(tx2,58,80,0,Math.PI*2); ctx.fill();
  });

  // Chest
  if (!s.chestCollected) {
    const cx2=s.chestX, cy2=s.chestY;
    const bob = Math.sin(frame*0.07)*3;
    ctx.fillStyle='#7a4a10'; ctx.fillRect(cx2-24,cy2-16+bob,48,32);
    ctx.fillStyle='#c0820a'; ctx.fillRect(cx2-24,cy2-20+bob,48,10);
    ctx.fillStyle='#ffd700'; ctx.fillRect(cx2-4,cy2-14+bob,8,8);
    // Sparkle
    const sp = Math.sin(frame*0.1)*0.5+0.5;
    ctx.fillStyle='rgba(255,220,50,'+sp+')';
    [[-20,-26],[0,-30],[20,-26]].forEach(([ox,oy])=>{
      ctx.beginPath(); ctx.arc(cx2+ox,cy2+oy+bob,3,0,Math.PI*2); ctx.fill();
    });
    ctx.fillStyle='#fbbf24'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
    ctx.fillText('LEFT CLICK',cx2,cy2-34+bob);
    ctx.fillStyle='#ffd700'; ctx.fillText('+50 MP 📦',cx2,cy2-22+bob);
  } else {
    ctx.fillStyle='#4a4a4a'; ctx.globalAlpha=0.5;
    ctx.fillRect(s.chestX-24,s.chestY-16,48,32);
    ctx.globalAlpha=1;
  }

  // Exit ladder
  const ex=s.exitX, ey=s.exitY;
  ctx.fillStyle='#8B4513'; ctx.fillRect(ex-12,ey-36,8,48); ctx.fillRect(ex+4,ey-36,8,48);
  for (let r=0;r<5;r++) { ctx.fillStyle='#cd853f'; ctx.fillRect(ex-12,ey-28+r*10,24,4); }
  const near = Math.sqrt((s.px-ex)**2+(s.py-ey)**2) < 60;
  ctx.fillStyle = near ? '#fbbf24' : '#a78bfa';
  ctx.font='bold 11px monospace'; ctx.textAlign='center';
  ctx.fillText(t.exit, ex, ey+24);
  if (near) ctx.fillText('Walk here to EXIT', ex, ey+38);

  // Enemies
  s.enemies.forEach(e => {
    ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath();
    ctx.ellipse(e.x+2,e.y+e.h,e.w*0.4,5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=t.accent; ctx.fillRect(e.x-e.w/2,e.y-e.h/2,e.w,e.h);
    ctx.fillStyle=t.wall;
    ctx.fillRect(e.x-e.w/2+4,e.y-e.h/2+6,5,5);
    ctx.fillRect(e.x+e.w/2-9,e.y-e.h/2+6,5,5);
    // HP bar
    ctx.fillStyle='#ff4444'; ctx.fillRect(e.x-16,e.y-e.h/2-8,32,4);
    ctx.fillStyle='#22c55e'; ctx.fillRect(e.x-16,e.y-e.h/2-8,Math.round(32*e.hp/e.maxHp),4);
  });

  // Boss
  if (s.boss && !s.bossDefeated) {
    const b = s.boss;
    const bsx = b.x, bsy = b.y;
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath();
    ctx.ellipse(bsx,bsy+b.h*0.5,b.w*0.5,10,0,0,Math.PI*2); ctx.fill();
    // Phase 2 aura
    if (b.phase2) {
      ctx.save(); ctx.globalAlpha=0.25+Math.sin(frame*.15)*.15;
      ctx.fillStyle='#ff4400';
      ctx.beginPath(); ctx.arc(bsx,bsy,b.w*0.9,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // Boss body (biome-colored, large)
    const bFlash = b.invincible > 0;
    ctx.fillStyle = bFlash ? '#ffffff' : s.theme.accent;
    ctx.fillRect(bsx-b.w/2, bsy-b.h/2, b.w, b.h);
    ctx.fillStyle = bFlash ? '#ffaaaa' : s.theme.wallDeco;
    ctx.fillRect(bsx-b.w/2+4, bsy-b.h/2+4, b.w-8, b.h-8);
    // Eyes
    ctx.fillStyle='#ff2222';
    ctx.beginPath(); ctx.arc(bsx-b.w*0.2,bsy-b.h*0.1,5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(bsx+b.w*0.2,bsy-b.h*0.1,5,0,Math.PI*2); ctx.fill();
    // HP bar (big)
    const bpct = Math.max(0,b.hp/b.maxHp);
    ctx.fillStyle='#1a0a2e'; ctx.fillRect(bsx-60,bsy-b.h/2-22,120,10);
    ctx.fillStyle=bpct>0.5?'#22c55e':'#ff4444';
    ctx.fillRect(bsx-60,bsy-b.h/2-22,Math.round(120*bpct),10);
    ctx.fillStyle=s.theme.accent; ctx.font='bold 11px monospace'; ctx.textAlign='center';
    ctx.fillText(b.label+(b.phase2?' ⚠️':''), bsx, bsy-b.h/2-26);
  } else if (s.bossDefeated) {
    ctx.fillStyle='#22c55e'; ctx.font='bold 13px monospace'; ctx.textAlign='center';
    ctx.fillText('🏆 BOSS DEFEATED', CW/2, CH/2-20);
  }

  // Bullets
  s.bullets.forEach(b => {
    const gun = getSelectedGun();
    ctx.fillStyle=gun.color||'#fbbf24'; ctx.fillRect(b.x-3,b.y-3,6,6);
  });

  // Player
  const sx = s.px, sy2 = s.py;
  ctx.save(); ctx.translate(sx, sy2);
  const ang = Math.atan2(mouseY-sy2, mouseX-sx);
  ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(2,18,11,5,0,0,Math.PI*2); ctx.fill();
  drawCharBody(ctx, selectedCharacter, frame);
  ctx.save(); ctx.translate(9,-1); ctx.rotate(ang);
  ctx.fillStyle='#f9c74f'; ctx.fillRect(0,-3,8,5);
  const gid=selectedGunId||'pistol';
  if(gid==='pistol'){ctx.fillStyle='#374151';ctx.fillRect(7,-3,9,6);ctx.fillStyle='#fbbf24';ctx.fillRect(15,-3,2,2);}
  else if(gid==='rifle'){ctx.fillStyle='#292524';ctx.fillRect(7,-2,18,5);ctx.fillStyle='#60a5fa';ctx.fillRect(13,-5,6,3);}
  else if(gid==='shotgun'){ctx.fillStyle='#78350f';ctx.fillRect(7,-4,14,9);ctx.fillStyle='#f97316';ctx.fillRect(21,-4,3,9);}
  else{ctx.fillStyle='#1c1917';ctx.fillRect(7,-4,20,8);ctx.fillStyle='#44403c';ctx.fillRect(9,4,6,5);}
  ctx.restore(); ctx.restore();

  // Vignette
  const vig = ctx.createRadialGradient(CW/2,CH/2,CH*0.3,CW/2,CH/2,CH*0.8);
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.6)');
  ctx.fillStyle=vig; ctx.fillRect(0,0,CW,CH);

  // Header bar
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,CW,36);
  ctx.fillStyle=t.accent; ctx.font='bold 14px monospace'; ctx.textAlign='center';
  ctx.fillText('🏠 ' + t.name + (s.enemies.length===0&&s.bossDefeated?' — Cleared!':s.bossDefeated?' (' + s.enemies.length + ' enemies)':' ⚔️ Boss alive!'), CW/2, 22);
  ctx.textAlign='left';

  // Full player HUD (HP, EP, upgrades, MP)
  drawHUD();
}


// BFS pathfinding on tile grid
function bfsPath(startX, startY, goalX, goalY) {
  const sx = Math.floor(startX/TILE), sy = Math.floor(startY/TILE);
  const gx = Math.floor(goalX/TILE), gy = Math.floor(goalY/TILE);
  if (sx === gx && sy === gy) return null;
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
  const visited = new Map();
  const key = (x,y) => x + y * MAP_W;
  const queue = [[sx, sy]];
  visited.set(key(sx, sy), null);
  let bfsSteps = 0;
  while (queue.length > 0 && bfsSteps++ < 400) {
    const [cx, cy] = queue.shift();
    if (cx === gx && cy === gy) {
      // Reconstruct path
      const path = [];
      let cur = key(cx, cy);
      while (visited.get(cur) !== null) {
        const [px2, py2] = visited.get(cur);
        path.unshift({ x: px2 * TILE + TILE/2, y: py2 * TILE + TILE/2 });
        cur = key(px2, py2);
      }
      path.push({ x: gx * TILE + TILE/2, y: gy * TILE + TILE/2 });
      return path;
    }
    for (const [dx2, dy2] of dirs) {
      const nx = cx + dx2, ny = cy + dy2;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (getTile(nx, ny) === 1) continue;
      // For diagonals, also check both adjacent tiles to avoid corner cutting
      if (dx2 !== 0 && dy2 !== 0) {
        if (getTile(cx + dx2, cy) === 1 || getTile(cx, cy + dy2) === 1) continue;
      }
      const k = key(nx, ny);
      if (!visited.has(k)) {
        visited.set(k, [cx, cy]);
        queue.push([nx, ny]);
      }
    }
  }
  return null; // no path
}

function update() {
  frame++;
  if (gameState !== 'playing') return;
  if (interiorCooldown > 0) interiorCooldown--;
  if (interiorState) { updateInterior(); return; }
  // ── Check if player walks into a landmark ──────────────────────────────────
  if (interiorCooldown === 0) {
    for (const lm of LANDMARK_INSTANCES) {
      const dist = Math.sqrt((player.x-lm.px)**2 + (player.y-lm.py)**2);
      if (dist < 55 * lm.scale) { enterInterior(lm); break; }
    }
  }

  // ── Biome timer & boss spawn ──────────────────────────────────────
  const curBiome = getBiomeAtPixel(player.x, player.y);
  if (curBiome !== lastBiome) {
    biomeTimer = 0;    // left the biome, reset timer
    lastBiome = curBiome;
    // Despawn active boss if it was for the old biome
    if (bossActive) {
      enemies = enemies.filter(e => !e.isBoss);
      bossActive = false;
      showNotif('Boss retreated...', '#888', 120);
    }
    // Pre-spawn a few enemies in the new biome so it feels inhabited
    if (curBiome !== 'forest' || enemies.length < 3) {
      setTimeout(() => preSpawnEnemies(2), 300);
    }
  } else if (!bossActive && curBiome !== 'forest') {
    biomeTimer++;
    if (biomeTimer >= 1800) { // 30s at 60fps
      biomeTimer = 0;
      bossWarningTimer = 90;
    }
  }
  if (bossWarningTimer > 0) {
    bossWarningTimer--;
    if (bossWarningTimer === 0) spawnBoss(curBiome);
  }
  // ─────────────────────────────────────────────────────────────────

  let dx = 0, dy = 0;
  if (keys['a']||keys['arrowleft'])  dx -= player.speed;
  if (keys['d']||keys['arrowright']) dx += player.speed;
  if (keys['w']||keys['arrowup'])    dy -= player.speed;
  if (keys['s']||keys['arrowdown'])  dy += player.speed;
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  if (player.frozen > 0) { player.frozen--; dx *= 0.3; dy *= 0.3; }
  if (dx > 0) player.facing = 1;
  if (dx < 0) player.facing = -1;

  const px = player.x, py = player.y;
  player.x += dx;
  if (resolveMapCollision(player)) player.x = px;
  player.y += dy;
  if (resolveMapCollision(player)) player.y = py;
  player.x = Math.max(TILE, Math.min((MAP_W-1)*TILE - player.w, player.x));
  player.y = Math.max(TILE, Math.min((MAP_H-1)*TILE - player.h, player.y));

  camera.x = player.x + player.w/2 - CW/2;
  camera.y = player.y + player.h/2 - CH/2;
  camera.x = Math.max(0, Math.min(MAP_W*TILE - CW, camera.x));
  camera.y = Math.max(0, Math.min(MAP_H*TILE - CH, camera.y));

  for (let i = mapNotes.length - 1; i >= 0; i--) {
    const n = mapNotes[i];
    n.glow = (n.glow + 0.05) % (Math.PI * 2);
    if (rectOverlap(player.x, player.y, player.w, player.h, n.x-8, n.y-8, 16, 16)) {
      const unique = new Set(player.notes);
      if (player.notes.length < 12 && !unique.has(n.pitch)) {
        player.notes.push(n.pitch);
        mapNotes.splice(i, 1);
        setTimeout(spawnMapNote, 3000);
      }
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0) { bullets.splice(i, 1); continue; }
    let hit = false;
    // Wall hit — check explosive
    if (getTile(Math.floor(b.x/TILE), Math.floor(b.y/TILE)) >= 1) {
      if (equippedAbilities.includes('ab_explode')) { const lv=totalLevel('ab_explode'); triggerExplosion(b.x, b.y, 40+lv*10, 5); }
      bullets.splice(i, 1); continue;
    }
    const dmgMult = 1 + totalLevel('dmg') * 0.2;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (rectOverlap(b.x-4, b.y-4, 8, 8, e.x, e.y, e.w, e.h)) {
        if (e.invincible) { hit = true; break; } // Void Lord phase
        let actualDmg = Math.round((b.dmg || 10) * dmgMult * getDiff().playerDmg);
        // Bleed: 1.5x damage taken
        if (e.bleeding > 0) actualDmg = Math.round(actualDmg * (e.bleedMult || 1.5));
        e.hp -= actualDmg;

        // Active ability effect (only one equipped at a time)
        for (const abId of equippedAbilities) {
        const ab = ALL_UPGRADES.find(u => u.id === abId);
        const abLv = ab ? totalLevel(ab.id) : 0;
        if (ab && abLv > 0) {
          if (ab.id === 'ab_fire') {
            e.burning = 300 + abLv*60; e.burnDmg = 3 + abLv*2;
            if (!e.wasFireNotif) { showNotif('🔥 Burning!', '#f97316', 45); e.wasFireNotif=true; }
          }
          if (ab.id === 'ab_bleed') {
            e.bleeding = 300; e.bleedMult = 1.3 + abLv*0.1;
            showNotif('🩸 Bleeding! (+' + Math.round(actualDmg*0.3) + '% dmg)', '#dc2626', 45);
          }
          if (ab.id === 'ab_freeze') {
            e.frozen = Math.min(600,(e.frozen||0)+180); e.frozenSpeedMult = Math.max(0.1, 0.55 - abLv*0.09);
            if (!e.wasFreezeNotif) { showNotif('🧊 Frozen!', '#67e8f9', 45); e.wasFreezeNotif=true; }
          }
          if (ab.id === 'ab_weaken' && !e.weakened) {
            e.weakened=400; e.dmg=Math.round((e.dmg||10)*(0.7-abLv*0.05));
            showNotif('💀 Weakened! (-' + (30+abLv*5) + '% dmg)', '#94a3b8', 55);
          }
          if (ab.id === 'ab_poison') {
            e.poisonStacks=Math.min(10,(e.poisonStacks||0)+1); e.poisonTimer=400;
            showNotif('☠️ Poison x' + e.poisonStacks, '#4ade80', 45);
          }
          if (ab.id === 'ab_leech') {
            const heal = Math.max(3, Math.ceil(actualDmg * (0.25 + abLv*0.05)));
            player.hp = Math.min(player.maxHp, player.hp + heal);
            showNotif('💚 +' + heal + ' HP', '#22c55e', 45);
          }
          if (ab.id === 'ab_knockback') {
            const kbdx=e.x-player.x,kbdy=e.y-player.y,kbl=Math.sqrt(kbdx*kbdx+kbdy*kbdy)||1;
            const kbDist = 60 + abLv*20;
            e.x+=(kbdx/kbl)*kbDist; e.y+=(kbdy/kbl)*kbDist;
            showNotif('💨 Knockback!', '#e2e8f0', 35);
          }
          if (ab.id === 'ab_magnetic') {
            const mgdx=player.x-e.x,mgdy=player.y-e.y,mgl=Math.sqrt(mgdx*mgdx+mgdy*mgdy)||1;
            e.x+=(mgdx/mgl)*(40+abLv*10); e.y+=(mgdy/mgl)*(40+abLv*10);
            showNotif('🧲 Pulled!', '#fbbf24', 35);
          }
          if (ab.id === 'ab_psychic') {
            e.psychic = 300 + abLv*60; e.psychicDmg = 8 + abLv*4;
            showNotif('🧠 Psychic!', '#a855f7', 60);
          }
          if (ab.id === 'ab_explode') {
            const splashR = 40 + abLv*10;
            const splashDmg = Math.round(actualDmg * 0.6); // 60% of bullet dmg, not extra
            triggerExplosion(b.x, b.y, splashR, splashDmg);
          }
          if (ab.id === 'ab_lightning') {
            let closest = null, closestDist = 220;
            for (const oe of enemies) {
              if (oe === e) continue;
              const d = Math.sqrt((oe.x-e.x)**2+(oe.y-e.y)**2);
              if (d < closestDist) { closestDist=d; closest=oe; }
            }
            if (closest) {
              const ldmg = Math.round(actualDmg * (0.5 + abLv*0.1));
              closest.hp -= ldmg; closest.burnFlash = 8;
              lightningArcs.push({ x1:e.x+e.w/2, y1:e.y+e.h/2, x2:closest.x+closest.w/2, y2:closest.y+closest.h/2, life:12 });
              showNotif('⚡ Chain -' + ldmg, '#fbbf24', 45);
              if (closest.hp <= 0) enemies.splice(enemies.indexOf(closest), 1);
            }
          }
        } // end ab check
        } // end equippedAbilities loop

        if (e.hp <= 0) {
          enemies.splice(j, 1);
          if (e.isBoss) { bossActive = false; awardBossLevel(); showNotif('🏆 Boss defeated! +1 LEVEL!', '#fbbf24', 240); }
          const epGain = {crawler:10,runner:8,slimeling:14,bogcrawler:18,scorpling:12,dunestalker:14,yeti:28,frostimp:12,crystalgolem:25,gemsprite:12,windelemental:16,stormhawk:14,ember:14,magmacrab:22,sporepuff:15,myceliumcreep:14,wraith:20,voidshade:20,boss_treant:200,boss_bogqueen:180,boss_sandking:190,boss_glacier:220,boss_drake:175,boss_voidlord:200}[e.type]||10;
          player.ep += epGain;
          if (player.ep >= player.epMax) {
            player.ep = 0;
            if (player.level < 99) {
              player.level++;
              player.epMax = Math.floor(100 * Math.pow(1.18, player.level - 1));
              player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.2));
              openLevelUp();
            }
          }
        }
        // explosion handled above in ab check

        // Piercing — don't mark as hit if pierce level active
        const pierceLv = totalLevel('ab_pierce') + totalLevel('pierce');
        if (pierceLv > 0 && (b.pierced||0) < pierceLv) { b.pierced = (b.pierced||0)+1; }
        else hit = true;
        break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  enemySpawnTimer++;
  enemySpawnCap = Math.min(20, 5 + Math.floor(frame / 7200)); // ramp slowly
  const spawnInterval = Math.max(60, Math.floor(300 * Math.pow(0.9, player.level - 1))); // -10% per level, min 60 frames
  if (enemySpawnTimer >= spawnInterval && enemies.filter(e=>!e.isBoss).length < enemySpawnCap) { spawnEnemy(); enemySpawnTimer = 0; }
  if (player.invincible > 0) player.invincible--;

  for (const e of enemies) {
    // Tick status effects
    if (e.frozen > 0) e.frozen--;
    const effectiveSpeed = e.frozen > 0 ? e.speed * (e.frozenSpeedMult || 0.5) : e.speed;

    // ── Boss phase behavior ─────────────────────────────────────────
    if (e.isBoss) {
      e.spawnTimer = (e.spawnTimer||0) + 1;
      // Phase 2 at 50% hp
      if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
        e.phase = 2; e.speed *= 1.5;
        showNotif('⚠️ ' + (e.label||'Boss') + ' ENRAGED!', '#ff0000', 180);
      }
      // Bog Queen spawns minions every 5s
      if (e.type === 'boss_bogqueen' && e.spawnTimer % 300 === 0 && enemies.length < 20) {
        const angle2 = Math.random()*Math.PI*2;
        enemies.push({type:'slimeling',x:e.x+Math.cos(angle2)*50,y:e.y+Math.sin(angle2)*50,w:28,h:20,hp:40,maxHp:40,speed:0.7,baseDmg:10,dmg:10});
      }
      // Glacier Giant freezes player on hit (handled in collision)
      // Sandstorm King charges at player every 4s
      if (e.type === 'boss_sandking' && e.spawnTimer % 240 === 120) {
        e.chargeTarget = { x: player.x, y: player.y };
        showNotif('⚡ Sandstorm King charges!', '#d4b020', 90);
      }
      // Void Lord flickers (becomes invincible briefly every 3s)
      if (e.type === 'boss_voidlord') {
        e.invincible = (e.spawnTimer % 180 < 30);
      }
    }
    // ────────────────────────────────────────────────────────────────
    // BFS pathfinding — psychic enemies target nearest other enemy
    let targetX = player.x + player.w/2, targetY = player.y + player.h/2;
    if (e.psychic > 0) {
      let nearest = null, nearDist = Infinity;
      for (const oe of enemies) {
        if (oe === e) continue;
        const d = Math.sqrt((oe.x-e.x)**2+(oe.y-e.y)**2);
        if (d < nearDist) { nearDist=d; nearest=oe; }
      }
      if (nearest) { targetX = nearest.x + nearest.w/2; targetY = nearest.y + nearest.h/2; }
    }
    if (!e.path || e.pathTimer <= 0) {
      e.path = bfsPath(e.x + e.w/2, e.y + e.h/2, targetX, targetY);
      e.pathTimer = 40;
    }
    e.pathTimer--;

    // Charge override for Sandstorm King
    if (e.chargeTarget) {
      const cdx = e.chargeTarget.x - e.x, cdy = e.chargeTarget.y - e.y;
      const clen = Math.sqrt(cdx*cdx+cdy*cdy)||1;
      e.x += (cdx/clen) * effectiveSpeed * 4;
      e.y += (cdy/clen) * effectiveSpeed * 4;
      if (clen < 20) e.chargeTarget = null;
    }
    // Follow path
    if (e.path && e.path.length > 0) {
      const wp = e.path[0];
      const wdx = wp.x - (e.x + e.w/2), wdy = wp.y - (e.y + e.h/2);
      const wlen = Math.sqrt(wdx*wdx + wdy*wdy) || 1;
      if (wlen < e.speed + 2) { e.path.shift(); }
      else { e.x += (wdx/wlen) * effectiveSpeed; e.y += (wdy/wlen) * effectiveSpeed; }
    } else {
      const edx = targetX - e.x, edy = targetY - e.y;
      const elen = Math.sqrt(edx*edx + edy*edy) || 1;
      e.x += edx/elen * effectiveSpeed; e.y += edy/elen * effectiveSpeed;
    }

    // Burn DOT tick
    if (e.burning > 0) {
      e.burning--;
      if (e.burning % 15 === 0) {
        e.hp -= e.burnDmg;
        e.burnFlash = 8;
        if (e.hp <= 0) { enemies.splice(enemies.indexOf(e), 1); continue; }
      }
    }
    // Poison DOT (stacking)
    if (e.poisonTimer > 0) {
      e.poisonTimer--;
      if (e.poisonTimer % 15 === 0 && e.poisonStacks > 0) {
        e.hp -= e.poisonStacks;
        e.burnFlash = 5;
        if (e.hp <= 0) { enemies.splice(enemies.indexOf(e), 1); continue; }
      }
    } else { e.poisonStacks = 0; }
    // Bleed timer
    if (e.bleeding > 0) e.bleeding--;
    // Weaken timer
    if (e.weakened > 0) { e.weakened--; if (e.weakened <= 0) e.dmg = e.baseDmg || e.dmg; }
    // Psychic — tick down, pulse AoE damage every 30 frames to nearby enemies
    if (e.psychic > 0) {
      e.psychic--;
      if (e.psychic % 30 === 0) {
        const pRadius = 100;
        const ex2 = e.x + e.w/2, ey2 = e.y + e.h/2;
        for (let pi = enemies.length-1; pi >= 0; pi--) {
          const oe = enemies[pi];
          if (oe === e || oe.psychic > 0) continue;
          const dx = (oe.x+oe.w/2)-ex2, dy = (oe.y+oe.h/2)-ey2;
          if (Math.sqrt(dx*dx+dy*dy) < pRadius) {
            oe.hp -= (e.psychicDmg || 12);
            oe.burnFlash = 10;
            // Visual: mini purple explosion at oe
            explosions.push({ x: oe.x+oe.w/2, y: oe.y+oe.h/2, r: 20, life: 15, color: '#a855f7' });
            if (oe.hp <= 0) { player.ep += 5; enemies.splice(pi, 1); }
          }
        }
      }
    }

    // Void Shade teleports near player every 3s
    if (e.type === 'voidshade' && frame % 180 === Math.floor(e.x) % 180) {
      const ta = Math.random()*Math.PI*2;
      const td = 80 + Math.random()*60;
      e.x = Math.min((MAP_W-2)*TILE, Math.max(TILE, player.x + Math.cos(ta)*td));
      e.y = Math.min((MAP_H-2)*TILE, Math.max(TILE, player.y + Math.sin(ta)*td));
      e.path = null;
    }
    // Player collision (psychic enemies don't attack player)
    if (e.psychic > 0) continue;
    if (player.invincible === 0 && rectOverlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
      const acReduct = 1 - totalLevel('ac') * 0.08; player.hp -= Math.round((e.dmg || 10) * acReduct); player.invincible = 40;
      if (e.type === 'boss_glacier') { player.frozen = 90; } // freeze player briefly
      if (player.hp <= 0) {
        player.hp = player.maxHp;
        player.x = MAP_W/2*TILE; player.y = MAP_H/2*TILE;
        player.notes = []; enemies = [];
        showNotif('You died! Respawned at center.', '#ff6b6b', 150);
      }
    }
  }

  if (notification) { notification.timer--; if (notification.timer <= 0) notification = null; }
  // Animate explosions + deal damage on spawn frame
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.r = ex.maxR * (1 - ex.life / ex.maxLife);
    // Deal damage to enemies within radius on first frame
    if (ex.dmg && ex.life === ex.maxLife - 1) {
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        const dx = (e.x+e.w/2) - ex.x, dy = (e.y+e.h/2) - ex.y;
        if (Math.sqrt(dx*dx+dy*dy) < ex.maxR) {
          e.hp -= ex.dmg;
          e.burnFlash = 12;
          if (e.hp <= 0) { player.ep += 5; enemies.splice(ei, 1); }
        }
      }
    }
    ex.life--;
    if (ex.life <= 0) explosions.splice(i, 1);
  }
  if (mapNotes.length < 1000 && frame % 15 === 0) spawnMapNote();
  if (player.shootCooldown > 0) player.shootCooldown--;
  if (mouseDown && gameState === 'playing') shoot(mouseX, mouseY);

  // Checkpoint detection

}

function drawPixelRect(x, y, w, h, color) {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h);
}


const UPGRADES = {
  gun: [
    { id:'dmg',    label:'Bullet Damage',  desc:'+20% bullet damage per level',    baseCost:50,  level:0, max:10 },
    { id:'fire',   label:'Fire Rate',      desc:'-10% cooldown per level',          baseCost:75,  level:0, max:10 },
    { id:'range',  label:'Bullet Range',   desc:'+15% bullet lifetime per level',   baseCost:60,  level:0, max:10 },
    { id:'pierce', label:'Piercing',       desc:'Bullets pierce +1 enemy per level',baseCost:150, level:0, max:5  },
  ],
  ability: [
    { id:'ab_fire',      label:'🔥 Fire',        desc:'DOT every 0.25s for 5s',               baseCost:200, level:0, max:5 },
    { id:'ab_bleed',     label:'🩸 Bleed',        desc:'Target takes 1.5x dmg for 5s',         baseCost:220, level:0, max:5 },
    { id:'ab_pierce',    label:'🎯 Piercing',     desc:'Bullet passes through 1 extra enemy',  baseCost:250, level:0, max:5 },
    { id:'ab_freeze',    label:'🧊 Freeze',       desc:'Slows enemy, stacks, 2.5s per hit',    baseCost:200, level:0, max:5 },
    { id:'ab_explode',   label:'💥 Explosive',    desc:'AOE damage on hit',                    baseCost:300, level:0, max:5 },
    { id:'ab_knockback', label:'💨 Knockback',    desc:'Pushes enemy away on hit',             baseCost:180, level:0, max:5 },
    { id:'ab_psychic',   label:'🧠 Psychic',      desc:'Enemy fights for you 2.5s',            baseCost:400, level:0, max:5 },
    { id:'ab_lightning', label:'⚡ Lightning',    desc:'Chains to 1 nearby enemy at 50% dmg',  baseCost:280, level:0, max:5 },
    { id:'ab_weaken',    label:'💀 Weaken',       desc:'-10% enemy dmg output (no stack)',     baseCost:200, level:0, max:5 },
    { id:'ab_poison',    label:'☠️ Poison',       desc:'Stacking DOT every 0.25s for 5s',     baseCost:230, level:0, max:5 },
    { id:'ab_leech',     label:'💚 Lifesteal',    desc:'Heals 10% of damage dealt',            baseCost:250, level:0, max:5 },
    { id:'ab_magnetic',  label:'🧲 Magnetic',     desc:'Pulls enemy toward player on hit',     baseCost:200, level:0, max:5 },
  ],
  stats: [
    { id:'maxhp',  label:'Max HP',          desc:'+20 max HP per level',             baseCost:60,  level:0, max:10 },
    { id:'regen',  label:'HP Regen',        desc:'+1 HP per 5s per level',           baseCost:200, level:0, max:10 },
    { id:'armor',  label:'Durability',      desc:'-5% damage taken per level',       baseCost:80,  level:0, max:10 },
    { id:'speed',  label:'Move Speed',      desc:'+0.3 movement speed per level',    baseCost:100, level:0, max:5  },
    { id:'luck',   label:'Coin Bonus',      desc:'+10% coins from chords per level', baseCost:120, level:0, max:10 },
  ],
};
// Flat list for easy lookup
const ALL_UPGRADES = [...UPGRADES.gun, ...UPGRADES.ability, ...UPGRADES.stats];
function upgradeCost(u) { return Math.floor(u.baseCost * Math.pow(2, u.level)); }
function totalLevel(id) {
  const u = ALL_UPGRADES.find(u => u.id === id);
  if (!u) return 0;
  return u.level + (player.bonusUpgrades[id] || 0);
}

function applyUpgrade(u) {
  if (u.level >= u.max) return;
  const cost = upgradeCost(u);
  if (savedCoins < cost) { showNotif('Not enough Music Points!', '#ef4444', 120); return; }
  savedCoins -= cost;
  u.level++;
  if (u.id === 'fire')  player.shootRate = Math.max(5, Math.floor(40 * Math.pow(0.9, totalLevel('fire'))));
  if (u.id === 'maxhp') { player.maxHp = 150 + totalLevel('maxhp') * 20; player.hp = Math.min(player.hp + 20, player.maxHp); }
  if (u.id === 'speed') player.speed = 3 + totalLevel('speed') * 0.3;
  if (u.id === 'range') { /* applied in bullet life calc */ }
  if (u.id.startsWith('ab_')) {
    if (!equippedAbilities.includes(u.id)) {
      if (equippedAbilities.length < 3) { equippedAbilities.push(u.id); }
    }
    showNotif(u.label + ' leveled up! (-' + cost + ' MP)', '#22c55e', 180);
  } else showNotif(u.label + ' → Lv ' + u.level + '! (-' + cost + ' MP)', '#22c55e', 150);
  // Flash all buy-btn elements green
  document.querySelectorAll('.buy-btn').forEach(b => {
    b.classList.remove('flash-buy');
    void b.offsetWidth; // reflow to restart
    b.classList.add('flash-buy');
    setTimeout(() => b.classList.remove('flash-buy'), 520);
  });
  return true;
}




function drawPauseOverlay() {
  menuButtons = [];
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, CW, CH);
  const cw = CW, ch = CH;
  const pw = 340, ph = 230;
  const px = cw/2 - pw/2, py = ch/2 - ph/2;
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(px, py, pw, 4);
  ctx.fillRect(px, py + ph - 4, pw, 4);
  ctx.fillRect(px, py, 4, ph);
  ctx.fillRect(px + pw - 4, py, 4, ph);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 40px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 16;
  ctx.fillText('PAUSED', cw/2, py + 56);
  ctx.shadowBlur = 0;
  const btnW = 240, btnH = 46;
  const bx = cw/2 - btnW/2;
  const resumeBtn = makeButton(bx, py + 106, btnW, btnH, '> RESUME', () => { gameState = 'playing'; });
  const quitBtn   = makeButton(bx, py + 164, btnW, btnH, 'X QUIT TO MENU', () => { gameState = 'menu'; });
  menuButtons.push(resumeBtn, quitBtn);
  drawMenuButton(resumeBtn);
  drawMenuButton(quitBtn);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#6b21a8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('ESC to resume', cw/2, py + ph + 8);
}

function drawMap() {
  const stx = Math.max(0, Math.floor(camera.x/TILE));
  const etx = Math.min(MAP_W, stx + Math.ceil(CW/TILE) + 2);
  const sty = Math.max(0, Math.floor(camera.y/TILE));
  const ety = Math.min(MAP_H, sty + Math.ceil(CH/TILE) + 2);
  for (let ty = sty; ty < ety; ty++) {
    for (let tx = stx; tx < etx; tx++) {
      const sx = tx*TILE - camera.x, sy = ty*TILE - camera.y;
      if (map[ty][tx] === TILE_WATER) {
        // ── Water tile ───────────────────────────────────────────────────
        const biomeW2 = getBiome(tx, ty);
        const wc = RIVER_WATER_COLORS[biomeW2] || '#1565c0';
        // Check if a bridge is on this tile
        let isBridgeTile = false;
        for (const rv of RIVER_DATA) {
          if (rv.axis==='h' && ty>=rv.coord && ty<rv.coord+rv.riverW) {
            isBridgeTile = rv.bridges.some(bt => tx>=bt && tx<bt+rv.bridgeW);
          } else if (rv.axis==='v' && tx>=rv.coord && tx<rv.coord+rv.riverW) {
            isBridgeTile = rv.bridges.some(bt => ty>=bt && ty<bt+rv.bridgeW);
          }
          if (isBridgeTile) break;
        }
        if (isBridgeTile) {
          // Draw bridge plank (biome wood color)
          const bc = RIVER_BRIDGE_COLORS[biomeW2] || '#8d6e63';
          ctx.fillStyle = bc;
          ctx.fillRect(Math.round(sx), Math.round(sy), TILE, TILE);
          // Plank grain lines
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          const isH = RIVER_DATA.find(rv=>rv.axis==='h'&&ty>=rv.coord&&ty<rv.coord+rv.riverW&&rv.biome===biomeW2);
          if (isH) {
            ctx.fillRect(Math.round(sx), Math.round(sy+TILE*0.3), TILE, 2);
            ctx.fillRect(Math.round(sx), Math.round(sy+TILE*0.65), TILE, 2);
          } else {
            ctx.fillRect(Math.round(sx+TILE*0.3), Math.round(sy), 2, TILE);
            ctx.fillRect(Math.round(sx+TILE*0.65), Math.round(sy), 2, TILE);
          }
        } else {
          // Draw water
          const shimmer = Math.sin(frame*0.06 + tx*0.4 + ty*0.3)*0.12;
          ctx.fillStyle = wc;
          ctx.fillRect(Math.round(sx), Math.round(sy), TILE, TILE);
          ctx.save(); ctx.globalAlpha = 0.18 + shimmer;
          ctx.fillStyle = '#ffffff';
          // Ripple highlight
          if ((tx+ty+Math.floor(frame/12))%3===0) ctx.fillRect(Math.round(sx+3),Math.round(sy+TILE*0.3),TILE-6,2);
          if ((tx+ty+Math.floor(frame/8))%5===0)  ctx.fillRect(Math.round(sx+5),Math.round(sy+TILE*0.6),TILE-10,2);
          ctx.restore();
        }
      } else if (map[ty][tx] === 1) {
        const biomeW = getBiome(tx, ty);
        const seed2 = tx*31+ty*17;
        // ── Forest / default: tree ────────────────────────────────
        if (!biomeW || biomeW === 'forest') {
          ctx.fillStyle='#5d4037'; ctx.fillRect(Math.round(sx+TILE/2-3),Math.round(sy+TILE*0.55),6,Math.round(TILE*0.45));
          ctx.fillStyle='#2e7d32'; ctx.fillRect(Math.round(sx+4),Math.round(sy+6),TILE-8,TILE*0.55);
          ctx.fillStyle='#22803a'; ctx.fillRect(Math.round(sx+7),Math.round(sy+3),TILE-14,TILE*0.45);
          ctx.fillStyle='#2ecc5a'; ctx.fillRect(Math.round(sx+TILE/2-4),Math.round(sy+1),8,8);
        // ── Swamp: mangrove with roots ────────────────────────────
        } else if (biomeW === 'swamp') {
          ctx.fillStyle='#3a2010'; ctx.fillRect(Math.round(sx+TILE/2-3),Math.round(sy+TILE*0.4),6,Math.round(TILE*0.6));
          ctx.fillStyle='#2a5020'; ctx.fillRect(Math.round(sx+2),Math.round(sy+4),TILE-4,TILE*0.5);
          ctx.fillStyle='#1a3a10'; ctx.fillRect(Math.round(sx+6),Math.round(sy),TILE-12,TILE*0.4);
          ctx.fillStyle='#3a2010'; ctx.fillRect(Math.round(sx),Math.round(sy+TILE*0.7),5,TILE*0.3); ctx.fillRect(Math.round(sx+TILE-5),Math.round(sy+TILE*0.7),5,TILE*0.3);
          ctx.fillStyle='#1a5010'; for(let mi=0;mi<4;mi++){ctx.fillRect(Math.round(sx+4+mi*7),Math.round(sy+TILE*0.5),2,8);}
        // ── Desert: cactus ────────────────────────────────────────
        } else if (biomeW === 'desert') {
          ctx.fillStyle='#2a6020'; ctx.fillRect(Math.round(sx+TILE/2-4),Math.round(sy+4),8,TILE-6);
          ctx.fillStyle='#388a2a'; ctx.fillRect(Math.round(sx+TILE/2-3),Math.round(sy+5),4,TILE-8);
          if(seed2%2===0){ctx.fillStyle='#2a6020';ctx.fillRect(Math.round(sx+4),Math.round(sy+TILE*0.35),TILE/2-4,5);ctx.fillRect(Math.round(sx+4),Math.round(sy+TILE*0.2),5,TILE*0.2);}
          if(seed2%3===0){ctx.fillStyle='#2a6020';ctx.fillRect(Math.round(sx+TILE/2),Math.round(sy+TILE*0.45),TILE/2-4,5);ctx.fillRect(Math.round(sx+TILE-9),Math.round(sy+TILE*0.3),5,TILE*0.2);}
          ctx.fillStyle='#ddc88a'; for(let si2=0;si2<5;si2++){ctx.fillRect(Math.round(sx+TILE/2-6),Math.round(sy+8+si2*6),3,1);ctx.fillRect(Math.round(sx+TILE/2+3),Math.round(sy+8+si2*6),3,1);}
        // ── Tundra: ice boulder / frozen tree ────────────────────
        } else if (biomeW === 'tundra') {
          if(seed2%3<2){
            ctx.fillStyle='#6080a0'; ctx.fillRect(Math.round(sx+2),Math.round(sy+TILE*0.3),TILE-4,TILE*0.7);
            ctx.fillStyle='#80a8c8'; ctx.fillRect(Math.round(sx+4),Math.round(sy+TILE*0.2),TILE-8,TILE*0.5);
            ctx.fillStyle='#c0dff0'; ctx.fillRect(Math.round(sx+6),Math.round(sy+TILE*0.2),6,4); ctx.fillRect(Math.round(sx+TILE-12),Math.round(sy+TILE*0.3),4,4);
          } else {
            ctx.fillStyle='#4a3020'; ctx.fillRect(Math.round(sx+TILE/2-3),Math.round(sy+TILE*0.5),6,TILE*0.5);
            ctx.fillStyle='#c0dff0'; ctx.fillRect(Math.round(sx+4),Math.round(sy+4),TILE-8,TILE*0.5);
            ctx.fillStyle='#ffffff'; ctx.fillRect(Math.round(sx+7),Math.round(sy+1),TILE-14,TILE*0.4);
          }
        // ── Crystal: crystal spires ───────────────────────────────
        } else if (biomeW === 'crystal') {
          const numSpires=2+(seed2%3);
          for(let ci=0;ci<numSpires;ci++){
            const cx2=Math.round(sx+4+ci*(TILE-8)/Math.max(1,numSpires-1)), ch=8+((seed2*(ci+1))%16);
            ctx.fillStyle='#2255aa'; ctx.fillRect(cx2-3,Math.round(sy+TILE-ch),6,ch);
            ctx.fillStyle='#55aaee'; ctx.fillRect(cx2-2,Math.round(sy+TILE-ch),4,ch-2);
            ctx.fillStyle='#88ddff'; ctx.fillRect(cx2-1,Math.round(sy+TILE-ch-4),2,5);
          }
        // ── Storm: dark rock / lightning rod ─────────────────────
        } else if (biomeW === 'storm') {
          ctx.fillStyle='#303040'; ctx.fillRect(Math.round(sx+2),Math.round(sy+TILE*0.4),TILE-4,TILE*0.6);
          ctx.fillStyle='#404060'; ctx.fillRect(Math.round(sx+4),Math.round(sy+TILE*0.3),TILE-8,TILE*0.4);
          ctx.fillStyle='#888899'; ctx.fillRect(Math.round(sx+TILE/2-1),Math.round(sy+4),3,TILE*0.4);
          ctx.fillStyle='#ffff44'; ctx.fillRect(Math.round(sx+TILE/2-2),Math.round(sy+2),5,5);
          if(frame%60<4){ctx.fillStyle='rgba(255,255,100,0.6)';ctx.fillRect(Math.round(sx),Math.round(sy),TILE,TILE*0.4);}
        // ── Volcano: lava rock ────────────────────────────────────
        } else if (biomeW === 'volcano') {
          ctx.fillStyle='#2a0800'; ctx.fillRect(Math.round(sx+2),Math.round(sy+TILE*0.2),TILE-4,TILE*0.8);
          ctx.fillStyle='#4a1000'; ctx.fillRect(Math.round(sx+4),Math.round(sy+TILE*0.1),TILE-8,TILE*0.6);
          ctx.fillStyle='#ff4400'; ctx.fillRect(Math.round(sx+6),Math.round(sy+TILE*0.3),2,TILE*0.5); ctx.fillRect(Math.round(sx+TILE-8),Math.round(sy+TILE*0.25),2,TILE*0.4);
          if(seed2%4===0){ctx.save();ctx.globalAlpha=0.3;ctx.fillStyle='#ff4400';ctx.beginPath();ctx.arc(Math.round(sx+TILE/2),Math.round(sy+TILE*0.3),6,0,Math.PI*2);ctx.fill();ctx.restore();}
        // ── Mushroom: giant mushroom ──────────────────────────────
        } else if (biomeW === 'mushroom') {
          ctx.fillStyle='#6a3a7a'; ctx.fillRect(Math.round(sx+TILE/2-4),Math.round(sy+TILE*0.45),8,TILE*0.55);
          ctx.fillStyle='#cc44cc'; ctx.fillRect(Math.round(sx+2),Math.round(sy+8),TILE-4,TILE*0.5);
          ctx.fillStyle='#aa22aa'; ctx.fillRect(Math.round(sx+4),Math.round(sy+4),TILE-8,TILE*0.4);
          ctx.fillStyle='#ffaaff'; for(let sp2=0;sp2<3;sp2++){ctx.fillRect(Math.round(sx+5+sp2*8),Math.round(sy+8),5,5);}
          ctx.save();ctx.globalAlpha=0.15+0.1*Math.sin(frame*0.05+tx);ctx.fillStyle='#ff88ff';ctx.beginPath();ctx.arc(Math.round(sx+TILE/2),Math.round(sy+TILE/2),TILE*0.6,0,Math.PI*2);ctx.fill();ctx.restore();
        // ── Shadow: dark obelisk ──────────────────────────────────
        } else if (biomeW === 'shadow') {
          ctx.fillStyle='#0a0015'; ctx.fillRect(Math.round(sx+TILE/2-5),Math.round(sy+2),10,TILE-4);
          ctx.fillStyle='#150025'; ctx.fillRect(Math.round(sx+TILE/2-3),Math.round(sy+4),6,TILE-6);
          ctx.fillStyle='#cc00ff'; ctx.fillRect(Math.round(sx+TILE/2-1),Math.round(sy+2),2,2);
          ctx.save();ctx.globalAlpha=0.12+0.08*Math.sin(frame*0.08+ty);ctx.fillStyle='#aa00ff';ctx.fillRect(Math.round(sx),Math.round(sy),TILE,TILE);ctx.restore();
        // ── Void: void pillar ─────────────────────────────────────
        } else {
          ctx.save();ctx.globalAlpha=0.7+0.2*Math.sin(frame*0.1+tx+ty);
          ctx.fillStyle='#050008'; ctx.fillRect(Math.round(sx+TILE/2-5),Math.round(sy+4),10,TILE-6);
          ctx.restore();
          ctx.fillStyle='#6600aa'; ctx.fillRect(Math.round(sx+TILE/2-1),Math.round(sy+2),2,3);
        }
        // Shadow under obstacle
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(Math.round(sx+3), Math.round(sy + TILE*0.7), TILE-6, 5);
      } else {
        const biomeHere = getBiome(tx, ty);
        let base, detail;
        if (biomeHere==='swamp')   { base=((tx+ty)%2===0)?'#1a3a1a':'#243a24'; detail='#0f2a0f'; }
        else if (biomeHere==='desert') { base=((tx+ty)%2===0)?'#c8a84b':'#d4b860'; detail='#b89030'; }
        else if (biomeHere==='tundra') { base=((tx+ty)%2===0)?'#a8c0d0':'#bcd0e0'; detail='#80a0b8'; }
        else if (biomeHere==='volcano') { base=((tx+ty)%2===0)?'#3a1008':'#4a1a10'; detail='#6b1010'; }
        else if (biomeHere==='crystal')  { base=((tx+ty)%2===0)?'#1a2a4a':'#203050'; detail='#4488cc'; }
        else if (biomeHere==='storm')    { base=((tx+ty)%2===0)?'#2a2a3a':'#323248'; detail='#8888cc'; }
        else if (biomeHere==='mushroom') { base=((tx+ty)%2===0)?'#3a1a4a':'#4a2258'; detail='#aa44cc'; }
        else if (biomeHere==='shadow')   { base=((tx+ty)%2===0)?'#080810':'#100818'; detail='#2a0a3a'; }
        else if (biomeHere==='void')     { base=((tx+ty)%2===0)?'#0a0818':'#12101e'; detail='#1a1028'; }
        else { base=((tx+ty)%2===0)?'#2d6a4f':'#27ae60'; detail='#1e5631'; } // forest
        drawPixelRect(sx, sy, TILE, TILE, base);
        const seed = tx*73+ty*137;
        if (seed%5===0) { ctx.fillStyle=detail; ctx.fillRect(Math.round(sx+(seed%TILE)), Math.round(sy+((seed*3)%TILE)), 2, 2); }
      }
    }
  }
}

function drawMapNote(n) {
  const s = worldToScreen(n.x, n.y);
  if (s.x > CW+20 || s.x < -20 || s.y > CH+20 || s.y < -20) return;
  const bob = Math.sin(n.glow + n.bobOffset) * 4;
  const radius = 10 + Math.sin(n.glow * 2) * 2;
  const col = NOTE_COLORS[n.pitch];
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(s.x, s.y+bob, radius, 0, Math.PI*2);
  ctx.fillStyle = col; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(NOTE_NAMES[n.pitch], s.x, s.y+bob);
  ctx.restore();
}

function drawPlayer(sx, sy) {
  if (player.invincible > 0 && (frame%6 < 3)) return;
  const cx = sx + player.w/2, cy = sy + player.h/2;
  // Angle from player center to mouse
  const angle = Math.atan2(mouseY - cy, mouseX - cx);

  ctx.save();
  ctx.translate(cx, cy);

  // === BODY ===
  drawCharBody(ctx, selectedCharacter, frame);

  // === RESTING ARM (left side, hangs down normally) ===
  ctx.fillStyle = '#f9c74f';
  ctx.fillRect(-16, -4, 7, 5); // left arm stub

  // === GUN ARM (rotates from shoulder, model depends on selectedGunId) ===
  ctx.save();
  if (selectedCharacter === 'max') {
    ctx.translate(10, 4); ctx.scale(0.78, 0.78); // gun from tail end
  } else {
    ctx.translate(9, -1);
  }
  ctx.rotate(angle);
  // Upper arm
  ctx.fillStyle = '#f9c74f';
  ctx.fillRect(0, -3, 8, 5);
  // Gun model by type
  const gid = selectedGunId || 'pistol';
  if (gid === 'pistol') {
    // Short, chunky pistol
    ctx.fillStyle = '#374151'; ctx.fillRect(7, -3, 9, 6);   // body
    ctx.fillStyle = '#1f2937'; ctx.fillRect(9, 3, 5, 4);    // grip
    ctx.fillStyle = '#6b7280'; ctx.fillRect(14, -2, 4, 4);  // barrel
    ctx.fillStyle = '#fbbf24'; ctx.fillRect(15, -3, 2, 2);  // sight
  } else if (gid === 'rifle') {
    // Long slim rifle with scope
    ctx.fillStyle = '#292524'; ctx.fillRect(7, -2, 18, 5);  // long body
    ctx.fillStyle = '#44403c'; ctx.fillRect(9, 3, 5, 3);    // grip
    ctx.fillStyle = '#78716c'; ctx.fillRect(23, -1, 5, 3);  // muzzle
    ctx.fillStyle = '#60a5fa'; ctx.fillRect(13, -5, 6, 3);  // scope body
    ctx.fillStyle = '#bfdbfe'; ctx.fillRect(14, -5, 2, 2);  // scope lens
  } else if (gid === 'shotgun') {
    // Wide double barrel
    ctx.fillStyle = '#78350f'; ctx.fillRect(7, -4, 14, 9);  // wooden stock
    ctx.fillStyle = '#292524'; ctx.fillRect(9, -4, 14, 4);  // barrel 1
    ctx.fillStyle = '#374151'; ctx.fillRect(9, 1, 14, 4);   // barrel 2
    ctx.fillStyle = '#f97316'; ctx.fillRect(21, -4, 3, 9);  // muzzle guard
    ctx.fillStyle = '#fed7aa'; ctx.fillRect(8, 4, 5, 3);    // pump
  } else if (gid === 'machinegun') {
    // Long boxy with big mag
    ctx.fillStyle = '#1c1917'; ctx.fillRect(7, -4, 20, 8);  // receiver
    ctx.fillStyle = '#292524'; ctx.fillRect(25, -3, 6, 6);  // barrel extension
    ctx.fillStyle = '#44403c'; ctx.fillRect(9, 4, 6, 5);    // magazine box
    ctx.fillStyle = '#a78bfa'; ctx.fillRect(7, -5, 4, 2);   // carry handle
    ctx.fillStyle = '#6d28d9'; ctx.fillRect(8, -6, 2, 2);   // handle detail
  }
  ctx.restore();

  ctx.restore();
}

function drawEnemyByType(e, x, y) {
  if (e.type === 'slimeling') {
    // Fat green blob
    drawPixelRect(x+2, y+6, e.w-4, e.h-6, '#1a7a1a');
    drawPixelRect(x, y+10, e.w, e.h-14, '#22aa22');
    // Wobbly eyes
    const wob = Math.sin(frame*0.15+e.x)*2;
    ctx.fillStyle='#aaff44'; ctx.fillRect(Math.round(x+6), Math.round(y+7+wob),6,6);
    ctx.fillRect(Math.round(x+e.w-12), Math.round(y+7-wob),6,6);
    ctx.fillStyle='#000'; ctx.fillRect(Math.round(x+8),Math.round(y+9+wob),3,3); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+9-wob),3,3);
    // Slime drips
    ctx.fillStyle='#44ff44'; ctx.fillRect(Math.round(x+4),Math.round(y+e.h-2),3,4); ctx.fillRect(Math.round(x+e.w-7),Math.round(y+e.h-4),3,6);
  } else if (e.type === 'scorpling') {
    // Sandy scorpion - low & fast
    drawPixelRect(x+2, y+6, e.w-4, e.h-8, '#c8a040');
    drawPixelRect(x+4, y+2, e.w-8, 8, '#d4b050');
    // Pincers
    ctx.fillStyle='#a07820'; ctx.fillRect(Math.round(x-4),Math.round(y+4),6,4); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+4),6,4);
    // Stinger tail
    ctx.fillStyle='#c83030'; ctx.fillRect(Math.round(x+e.w/2-1),Math.round(y-4),3,6);
    // Eyes
    ctx.fillStyle='#ff4400'; ctx.fillRect(Math.round(x+5),Math.round(y+3),3,3); ctx.fillRect(Math.round(x+e.w-8),Math.round(y+3),3,3);
    // Leg animation
    const leg=Math.sin(frame*0.3+e.x)*3;
    for(let i=0;i<3;i++){ctx.fillStyle='#a07820';ctx.fillRect(Math.round(x-3+i*2),Math.round(y+8+leg),2,8);ctx.fillRect(Math.round(x+e.w+1-i*2),Math.round(y+8-leg),2,8);}
  } else if (e.type === 'yeti') {
    // Big white/blue beast
    drawPixelRect(x+2, y+16, e.w-4, e.h-16, '#8898b8');
    drawPixelRect(x+4, y+6, e.w-8, 14, '#aabbd0');
    drawPixelRect(x+8, y, e.w-16, 10, '#c8d8e8'); // head
    // Horns
    ctx.fillStyle='#d0e0f0'; ctx.fillRect(Math.round(x+8),Math.round(y-4),3,5); ctx.fillRect(Math.round(x+e.w-11),Math.round(y-4),3,5);
    // Eyes
    ctx.fillStyle='#88ccff'; ctx.fillRect(Math.round(x+10),Math.round(y+2),5,5); ctx.fillRect(Math.round(x+e.w-15),Math.round(y+2),5,5);
    ctx.fillStyle='#001040'; ctx.fillRect(Math.round(x+12),Math.round(y+4),3,3); ctx.fillRect(Math.round(x+e.w-13),Math.round(y+4),3,3);
    // Arms
    const arm=Math.sin(frame*0.1+e.y)*4;
    drawPixelRect(x-6, y+14+arm, 8, 16, '#8898b8'); drawPixelRect(x+e.w-2, y+14-arm, 8, 16, '#8898b8');
  } else if (e.type === 'ember') {
    // Fast flaming imp
    drawPixelRect(x+3, y+12, e.w-6, e.h-12, '#8b1a00');
    drawPixelRect(x+4, y+4, e.w-8, 12, '#aa2200');
    drawPixelRect(x+5, y, e.w-10, 7, '#cc3300');
    // Flame head
    const fl=Math.sin(frame*0.25+e.x)*2;
    ctx.fillStyle='#ff6600'; ctx.fillRect(Math.round(x+5),Math.round(y-3+fl),4,5); ctx.fillRect(Math.round(x+e.w-9),Math.round(y-3-fl),4,5); ctx.fillRect(Math.round(x+e.w/2-2),Math.round(y-5),4,6);
    // Eyes - glowing
    ctx.fillStyle='#ffaa00'; ctx.fillRect(Math.round(x+6),Math.round(y+1),4,4); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+1),4,4);
    // Legs fast
    const lf=Math.sin(frame*0.4+e.x)*4;
    drawPixelRect(x+4,y+e.h-8+lf,4,8,'#6b1000'); drawPixelRect(x+e.w-8,y+e.h-8-lf,4,8,'#6b1000');
  } else if (e.type === 'wraith') {
    // Translucent void ghost
    const wa = 0.5+0.3*Math.sin(frame*0.12+e.y);
    ctx.save(); ctx.globalAlpha=wa;
    drawPixelRect(x+3, y+10, e.w-6, e.h-10, '#2a0a4a');
    drawPixelRect(x+5, y+2, e.w-10, 12, '#3a1060');
    // Glowing eyes
    ctx.globalAlpha=1;
    ctx.fillStyle='#cc44ff'; ctx.fillRect(Math.round(x+7),Math.round(y+5),4,4); ctx.fillRect(Math.round(x+e.w-11),Math.round(y+5),4,4);
    ctx.shadowColor='#cc44ff'; ctx.shadowBlur=8;
    ctx.fillRect(Math.round(x+7),Math.round(y+5),4,4); ctx.fillRect(Math.round(x+e.w-11),Math.round(y+5),4,4);
    ctx.restore();
    // Wispy bottom
    ctx.save(); ctx.globalAlpha=wa*0.6; ctx.fillStyle='#3a1060';
    for(let wi=0;wi<3;wi++){const wo=Math.sin(frame*0.1+wi+e.x)*3;ctx.fillRect(Math.round(x+4+wi*7),Math.round(y+e.h-4+wo),5,6);}
    ctx.restore();
  } else if (e.type === 'runner') {
    drawPixelRect(x+3, y+14, e.w-6, e.h-14, '#a00020');
    drawPixelRect(x+4, y+6, e.w-8, 12, '#cc1a35');
    drawPixelRect(x+5, y, e.w-10, 9, '#e8203f');
    ctx.fillStyle='#ff4466'; ctx.fillRect(Math.round(x+6),Math.round(y-4),2,5); ctx.fillRect(Math.round(x+10),Math.round(y-6),2,7); ctx.fillRect(Math.round(x+14),Math.round(y-4),2,5);
    ctx.fillStyle='#fff'; ctx.fillRect(Math.round(x+6),Math.round(y+2),3,3); ctx.fillRect(Math.round(x+12),Math.round(y+2),3,3);
    ctx.fillStyle='#000'; ctx.fillRect(Math.round(x+7),Math.round(y+3),2,2); ctx.fillRect(Math.round(x+13),Math.round(y+3),2,2);
    const legSwing=Math.sin(frame*0.25+e.x)*3;
    drawPixelRect(x+4,y+e.h-8,5,8+legSwing,'#a00020'); drawPixelRect(x+e.w-9,y+e.h-8,5,8-legSwing,'#a00020');
  } else if (e.type === 'bogcrawler') {
    // Swamp armored snapper — low, wide, dark
    drawPixelRect(x+2,y+8,e.w-4,e.h-8,'#1a3a10'); // shell
    drawPixelRect(x+4,y+2,e.w-8,10,'#2a5018'); // head
    ctx.fillStyle='#0a2008'; ctx.fillRect(Math.round(x+4),Math.round(y+2),e.w-8,4); // shell ridges
    ctx.fillRect(Math.round(x+4),Math.round(y+9),e.w-8,3);
    ctx.fillStyle='#88ff44'; ctx.fillRect(Math.round(x+6),Math.round(y+3),5,5); ctx.fillRect(Math.round(x+e.w-11),Math.round(y+3),5,5); // eyes
    ctx.fillStyle='#000'; ctx.fillRect(Math.round(x+8),Math.round(y+5),3,3); ctx.fillRect(Math.round(x+e.w-9),Math.round(y+5),3,3);
    // Muddy legs
    const ml=Math.sin(frame*0.12+e.x)*3;
    for(let li=0;li<3;li++){ctx.fillStyle='#1a3a10';ctx.fillRect(Math.round(x+2+li*10),Math.round(y+e.h-6+ml),5,8);ctx.fillRect(Math.round(x+2+li*10),Math.round(y+e.h-6-ml),5,8);}
  } else if (e.type === 'dunestalker') {
    // Desert ambusher — lean, sandy, low profile
    drawPixelRect(x+2,y+8,e.w-4,e.h-10,'#b88820'); // body
    drawPixelRect(x+4,y+2,e.w-8,10,'#d4a030'); // head
    // Hood/shadow over eyes
    ctx.fillStyle='#805010'; ctx.fillRect(Math.round(x+4),Math.round(y+2),e.w-8,5);
    ctx.fillStyle='#ff4400'; ctx.fillRect(Math.round(x+6),Math.round(y+5),4,4); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+5),4,4); // glowing eyes
    // Blade arms
    ctx.fillStyle='#c0c0c0'; ctx.fillRect(Math.round(x-6),Math.round(y+6),8,3); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+6),8,3);
    const ds=Math.sin(frame*0.35+e.x)*4;
    drawPixelRect(x+4,y+e.h-6+ds,5,7,'#b88820'); drawPixelRect(x+e.w-9,y+e.h-6-ds,5,7,'#b88820');
  } else if (e.type === 'frostimp') {
    // Tundra swarm unit — small, spiky, fast
    const fi=Math.sin(frame*0.25+e.y)*2;
    drawPixelRect(x+2,y+6+fi,e.w-4,e.h-6,'#4488bb'); // body
    drawPixelRect(x+4,y+fi,e.w-8,8,'#66aacc'); // head
    // Ice spikes on back
    ctx.fillStyle='#aaddff'; ctx.fillRect(Math.round(x+4),Math.round(y-4+fi),3,6); ctx.fillRect(Math.round(x+9),Math.round(y-6+fi),3,8); ctx.fillRect(Math.round(x+14),Math.round(y-4+fi),3,6);
    ctx.fillStyle='#fff'; ctx.fillRect(Math.round(x+5),Math.round(y+1+fi),3,3); ctx.fillRect(Math.round(x+e.w-8),Math.round(y+1+fi),3,3); // eyes
    const fa=Math.sin(frame*0.3+e.y)*4;
    drawPixelRect(x-3,y+8+fa,5,4,'#4488bb'); drawPixelRect(x+e.w-2,y+8-fa,5,4,'#4488bb');
  } else if (e.type === 'magmacrab') {
    // Volcano armored crab — wide, red-orange, slow
    ctx.fillStyle='#4a0800'; ctx.fillRect(Math.round(x),Math.round(y+10),e.w,e.h-10); // shell
    ctx.fillStyle='#8b1800'; ctx.fillRect(Math.round(x+4),Math.round(y+2),e.w-8,12); // head
    // Lava cracks
    ctx.fillStyle='#ff4400'; ctx.fillRect(Math.round(x+6),Math.round(y+12),3,10); ctx.fillRect(Math.round(x+16),Math.round(y+15),3,8); ctx.fillRect(Math.round(x+26),Math.round(y+11),3,12);
    ctx.fillStyle='#ffaa00'; ctx.fillRect(Math.round(x+8),Math.round(y+4),5,5); ctx.fillRect(Math.round(x+e.w-13),Math.round(y+4),5,5); // eyes
    // Heavy claws
    ctx.fillStyle='#3a0600'; ctx.fillRect(Math.round(x-10),Math.round(y+6),12,10); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+6),12,10);
    const mc=Math.sin(frame*0.08+e.x)*2;
    for(let ci=0;ci<3;ci++){ctx.fillStyle='#4a0800';ctx.fillRect(Math.round(x+4+ci*10),Math.round(y+e.h-4+mc),6,8);ctx.fillRect(Math.round(x+4+ci*10),Math.round(y+e.h-4-mc),6,8);}
  } else if (e.type === 'crystalgolem') {
    // Geometric, angular, icy blue shards
    drawPixelRect(x+4,y+16,e.w-8,e.h-18,'#1a3a6a'); // legs
    drawPixelRect(x+2,y+8,e.w-4,12,'#2a5090'); // torso
    drawPixelRect(x+6,y,e.w-12,10,'#4488cc'); // head
    // Crystal shards
    ctx.fillStyle='#88ccff'; ctx.fillRect(Math.round(x-4),Math.round(y+4),6,14); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+4),6,14);
    ctx.fillRect(Math.round(x+8),Math.round(y-6),5,8); ctx.fillRect(Math.round(x+e.w-13),Math.round(y-6),5,8);
    ctx.fillStyle='#fff'; ctx.fillRect(Math.round(x+8),Math.round(y+2),5,5); ctx.fillRect(Math.round(x+e.w-13),Math.round(y+2),5,5);
    ctx.fillStyle='#002266'; ctx.fillRect(Math.round(x+10),Math.round(y+4),3,3); ctx.fillRect(Math.round(x+e.w-11),Math.round(y+4),3,3);
  } else if (e.type === 'gemsprite') {
    // Tiny fast sparkling gem creature
    const gs=Math.sin(frame*0.3+e.x)*3;
    drawPixelRect(x+2,y+6+gs,e.w-4,e.h-8,'#aa44ff');
    drawPixelRect(x+3,y+gs,e.w-6,8,'#cc66ff');
    // Gem facets
    ctx.fillStyle='#ffaaff'; ctx.fillRect(Math.round(x+4),Math.round(y+1+gs),3,3); ctx.fillRect(Math.round(x+e.w-7),Math.round(y+1+gs),3,3);
    ctx.fillStyle='#220044'; ctx.fillRect(Math.round(x+5),Math.round(y+2+gs),2,2); ctx.fillRect(Math.round(x+e.w-6),Math.round(y+2+gs),2,2);
    // Sparkle
    if(frame%10<5){ctx.fillStyle='#ffffff';ctx.fillRect(Math.round(x+e.w/2),Math.round(y-3+gs),2,2);}
  } else if (e.type === 'windelemental') {
    // Swirling air entity — semi-transparent, shifting
    const we=Math.sin(frame*0.15+e.y)*4;
    ctx.save(); ctx.globalAlpha=0.7+0.2*Math.sin(frame*0.1);
    drawPixelRect(x+3,y+10+we,e.w-6,e.h-12,'#8888cc');
    drawPixelRect(x+5,y+2+we,e.w-10,12,'#aaaaee');
    ctx.globalAlpha=1; ctx.fillStyle='#ddddff';
    ctx.fillRect(Math.round(x+7),Math.round(y+4+we),5,5); ctx.fillRect(Math.round(x+e.w-12),Math.round(y+4+we),5,5);
    ctx.fillStyle='#4444aa'; ctx.fillRect(Math.round(x+9),Math.round(y+6+we),3,3); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+6+we),3,3);
    // Wind trails
    for(let wi=0;wi<3;wi++){ctx.globalAlpha=0.3;ctx.fillStyle='#aaaaff';ctx.fillRect(Math.round(x-6-wi*4),Math.round(y+8+we+wi*3),8,2);}
    ctx.restore();
  } else if (e.type === 'stormhawk') {
    // Fast swooping bird — wide, low
    drawPixelRect(x+8,y+8,e.w-16,e.h-10,'#334466'); // body
    // Wings spread wide
    const sw=Math.sin(frame*0.25+e.x)*6;
    drawPixelRect(x,y+6+sw,10,6,'#445577'); drawPixelRect(x+e.w-10,y+6-sw,10,6,'#445577');
    drawPixelRect(x-6,y+8+sw,8,4,'#334466'); drawPixelRect(x+e.w-2,y+8-sw,8,4,'#334466');
    ctx.fillStyle='#ffcc00'; ctx.fillRect(Math.round(x+e.w/2-2),Math.round(y+4),4,6); // beak
    ctx.fillStyle='#ffff66'; ctx.fillRect(Math.round(x+e.w/2-5),Math.round(y+6),3,3); ctx.fillRect(Math.round(x+e.w/2+2),Math.round(y+6),3,3);
    ctx.fillStyle='#000'; ctx.fillRect(Math.round(x+e.w/2-4),Math.round(y+7),2,2); ctx.fillRect(Math.round(x+e.w/2+3),Math.round(y+7),2,2);
  } else if (e.type === 'sporepuff') {
    // Round mushroom creature, puffs spores
    const sp=Math.sin(frame*0.12+e.y)*2;
    drawPixelRect(x+2,y+14+sp,e.w-4,e.h-15,'#7a3a8a'); // stalk
    drawPixelRect(x,y+4+sp,e.w,14,'#aa44cc'); // cap
    // Spots on cap
    ctx.fillStyle='#cc88ee'; ctx.fillRect(Math.round(x+4),Math.round(y+5+sp),5,5); ctx.fillRect(Math.round(x+e.w-9),Math.round(y+5+sp),5,5); ctx.fillRect(Math.round(x+e.w/2-2),Math.round(y+4+sp),5,5);
    ctx.fillStyle='#ddaaff'; ctx.fillRect(Math.round(x+6),Math.round(y+7+sp),3,3); ctx.fillRect(Math.round(x+e.w-8),Math.round(y+7+sp),3,3);
    // Eyes under cap brim
    ctx.fillStyle='#ffaaff'; ctx.fillRect(Math.round(x+6),Math.round(y+14+sp),4,4); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+14+sp),4,4);
    ctx.fillStyle='#220033'; ctx.fillRect(Math.round(x+7),Math.round(y+15+sp),2,2); ctx.fillRect(Math.round(x+e.w-9),Math.round(y+15+sp),2,2);
    // Spore puff animation
    if(frame%30<5){ctx.save();ctx.globalAlpha=0.5;ctx.fillStyle='#ddaaff';ctx.beginPath();ctx.arc(Math.round(x+e.w/2),Math.round(y+4+sp),12+frame%30,0,Math.PI*2);ctx.fill();ctx.restore();}
  } else if (e.type === 'myceliumcreep') {
    // Flat spreading ground creature
    const mc2=Math.sin(frame*0.1+e.x)*2;
    drawPixelRect(x,y+6+mc2,e.w,e.h-8,'#4a1a5a'); // flat body
    drawPixelRect(x+4,y+mc2,e.w-8,9,'#6a2a7a'); // raised head
    ctx.fillStyle='#cc66ff'; ctx.fillRect(Math.round(x+6),Math.round(y+1+mc2),4,4); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+1+mc2),4,4);
    ctx.fillStyle='#220033'; ctx.fillRect(Math.round(x+7),Math.round(y+2+mc2),2,2); ctx.fillRect(Math.round(x+e.w-9),Math.round(y+2+mc2),2,2);
    // Tendrils
    for(let ti=0;ti<4;ti++){const ta=Math.sin(frame*0.15+ti)*3;ctx.fillStyle='#6a2a7a';ctx.fillRect(Math.round(x+2+ti*6),Math.round(y+e.h-2+ta),3,6);}
  } else if (e.type === 'voidshade') {
    // Void teleporter — thin, dark, fast
    const vs=0.4+0.4*Math.sin(frame*0.2+e.x);
    ctx.save(); ctx.globalAlpha=vs;
    drawPixelRect(x+4,y+10,e.w-8,e.h-10,'#0a0020');
    drawPixelRect(x+5,y+2,e.w-10,10,'#180040');
    ctx.globalAlpha=1; ctx.fillStyle='#ff00aa';
    ctx.fillRect(Math.round(x+6),Math.round(y+4),4,4); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+4),4,4);
    ctx.shadowColor='#ff00aa'; ctx.shadowBlur=6;
    ctx.fillRect(Math.round(x+6),Math.round(y+4),4,4); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+4),4,4);
    ctx.shadowBlur=0; ctx.restore();
  } else {
    // crawler (default)
    const crawl=Math.sin(frame*0.18+e.y)*2;
    drawPixelRect(x+2, y+8+crawl, e.w-4, e.h-8, '#1a6b2a');
    drawPixelRect(x+4, y+crawl, e.w-8, 12, '#25923a');
    ctx.fillStyle='#aaff44'; ctx.fillRect(Math.round(x+5),Math.round(y+2+crawl),7,7); ctx.fillRect(Math.round(x+16),Math.round(y+2+crawl),7,7);
    ctx.fillStyle='#000'; ctx.fillRect(Math.round(x+7),Math.round(y+4+crawl),4,4); ctx.fillRect(Math.round(x+18),Math.round(y+4+crawl),4,4);
    const armSwing=Math.sin(frame*0.18+e.y)*4;
    drawPixelRect(x-4,y+10+armSwing,7,4,'#1a6b2a'); drawPixelRect(x+e.w-3,y+10-armSwing,7,4,'#1a6b2a');
  }
}


// =====================================================================
// BOSS DRAW FUNCTIONS — one block per biome
// =====================================================================
function drawBoss(e, x, y) {
  // ── Forest: Treant ───────────────────────────────────────────────
  if (e.type === 'boss_treant') {
    ctx.fillStyle='#2d4a1a'; ctx.fillRect(Math.round(x+e.w/2-8),Math.round(y+e.h*0.55),16,Math.round(e.h*0.45)); // trunk
    ctx.fillStyle='#1a5c22'; ctx.fillRect(Math.round(x+4),Math.round(y+10),e.w-8,Math.round(e.h*0.5));
    ctx.fillStyle='#228b22'; ctx.fillRect(Math.round(x+10),Math.round(y+2),e.w-20,Math.round(e.h*0.45));
    ctx.fillStyle='#32cd32'; ctx.fillRect(Math.round(x+18),Math.round(y-4),e.w-36,16);
    ctx.fillStyle='#ff4400'; ctx.fillRect(Math.round(x+12),Math.round(y+14),6,6); ctx.fillRect(Math.round(x+e.w-18),Math.round(y+14),6,6); // eyes
    // Root arms
    ctx.fillStyle='#2d4a1a'; ctx.fillRect(Math.round(x-12),Math.round(y+e.h*0.5),14,8); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+e.h*0.5),14,8);
  }
  // ── Swamp: Bog Queen ─────────────────────────────────────────────
  else if (e.type === 'boss_bogqueen') {
    const bq = Math.sin(frame*0.1+e.x)*3;
    ctx.fillStyle='#0d4a0d'; ctx.fillRect(Math.round(x),Math.round(y+12+bq),e.w,e.h-14);
    ctx.fillStyle='#1a7a1a'; ctx.fillRect(Math.round(x+4),Math.round(y+4+bq),e.w-8,18);
    // Crown
    ctx.fillStyle='#44ff44'; for(let ci=0;ci<5;ci++){ctx.fillRect(Math.round(x+8+ci*12),Math.round(y-6+bq+(ci%2)*4),6,8);}
    ctx.fillStyle='#66ff66'; ctx.fillRect(Math.round(x+8),Math.round(y+6+bq),10,10); ctx.fillRect(Math.round(x+e.w-18),Math.round(y+6+bq),10,10);
    ctx.fillStyle='#000'; ctx.fillRect(Math.round(x+11),Math.round(y+9+bq),5,5); ctx.fillRect(Math.round(x+e.w-15),Math.round(y+9+bq),5,5);
    // Slime drips
    ctx.fillStyle='#22cc22'; for(let si=0;si<4;si++){const sd=Math.sin(frame*0.08+si)*4;ctx.fillRect(Math.round(x+8+si*14),Math.round(y+e.h+sd),4,8);}
  }
  // ── Desert: Sandstorm King ───────────────────────────────────────
  else if (e.type === 'boss_sandking') {
    ctx.fillStyle='#8b6010'; ctx.fillRect(Math.round(x+4),Math.round(y+12),e.w-8,e.h-14);
    ctx.fillStyle='#c8a040'; ctx.fillRect(Math.round(x+8),Math.round(y+4),e.w-16,16);
    // Giant pincers
    ctx.fillStyle='#6b4808'; ctx.fillRect(Math.round(x-16),Math.round(y+4),18,10); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+4),18,10);
    ctx.fillRect(Math.round(x-18),Math.round(y),8,8); ctx.fillRect(Math.round(x+e.w+10),Math.round(y),8,8); // claw tips
    // Giant stinger
    ctx.fillStyle='#cc2200'; ctx.fillRect(Math.round(x+e.w/2-4),Math.round(y-14),8,16);
    ctx.fillRect(Math.round(x+e.w/2-2),Math.round(y-20),5,8);
    ctx.fillStyle='#ff4400'; ctx.fillRect(Math.round(x+12),Math.round(y+5),6,6); ctx.fillRect(Math.round(x+e.w-18),Math.round(y+5),6,6);
    // Many legs
    for(let li=0;li<4;li++){const la=Math.sin(frame*0.3+li+e.x)*5;ctx.fillStyle='#8b6010';ctx.fillRect(Math.round(x+4+li*14),Math.round(y+e.h-4+la),4,14);ctx.fillRect(Math.round(x+4+li*14),Math.round(y+e.h-4-la),4,14);}
  }
  // ── Tundra: Glacier Giant ────────────────────────────────────────
  else if (e.type === 'boss_glacier') {
    ctx.fillStyle='#4060a0'; ctx.fillRect(Math.round(x+4),Math.round(y+28),e.w-8,e.h-30); // legs
    ctx.fillStyle='#6080c0'; ctx.fillRect(Math.round(x+2),Math.round(y+12),e.w-4,22); // torso
    ctx.fillStyle='#80a0d8'; ctx.fillRect(Math.round(x+8),Math.round(y),e.w-16,16); // head
    // Ice horns
    ctx.fillStyle='#c0e8ff'; ctx.fillRect(Math.round(x+10),Math.round(y-10),6,12); ctx.fillRect(Math.round(x+e.w-16),Math.round(y-10),6,12);
    // Eyes
    ctx.fillStyle='#00ccff'; ctx.fillRect(Math.round(x+12),Math.round(y+3),7,7); ctx.fillRect(Math.round(x+e.w-19),Math.round(y+3),7,7);
    ctx.fillStyle='#003366'; ctx.fillRect(Math.round(x+14),Math.round(y+5),4,4); ctx.fillRect(Math.round(x+e.w-17),Math.round(y+5),4,4);
    // Massive arms
    const ga=Math.sin(frame*0.08)*5;
    ctx.fillStyle='#5070b0'; ctx.fillRect(Math.round(x-14),Math.round(y+14+ga),16,24); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+14-ga),16,24);
    // Ice crystals on body
    ctx.fillStyle='#c0e8ff'; ctx.fillRect(Math.round(x+6),Math.round(y+16),4,8); ctx.fillRect(Math.round(x+e.w-10),Math.round(y+20),4,8);
  }
  // ── Volcano: Inferno Drake ───────────────────────────────────────
  else if (e.type === 'boss_drake') {
    ctx.fillStyle='#5a0800'; ctx.fillRect(Math.round(x+4),Math.round(y+16),e.w-8,e.h-18); // body
    ctx.fillStyle='#8b1000'; ctx.fillRect(Math.round(x+6),Math.round(y+6),e.w-12,16); // chest
    ctx.fillStyle='#aa1800'; ctx.fillRect(Math.round(x+10),Math.round(y),e.w-20,12); // head/snout
    // Wings
    ctx.fillStyle='#3a0500'; ctx.fillRect(Math.round(x-20),Math.round(y+8),22,20); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+8),22,20);
    // Flame crest
    const df=Math.sin(frame*0.2+e.x)*3;
    ctx.fillStyle='#ff6600'; ctx.fillRect(Math.round(x+10),Math.round(y-8+df),6,10); ctx.fillRect(Math.round(x+22),Math.round(y-12+df),6,14); ctx.fillRect(Math.round(x+34),Math.round(y-8-df),6,10);
    // Eyes
    ctx.fillStyle='#ffaa00'; ctx.fillRect(Math.round(x+12),Math.round(y+2),6,6); ctx.fillRect(Math.round(x+e.w-18),Math.round(y+2),6,6);
    ctx.fillStyle='#ff0000'; ctx.fillRect(Math.round(x+14),Math.round(y+4),3,3); ctx.fillRect(Math.round(x+e.w-16),Math.round(y+4),3,3);
    // Fire breath particles (periodic)
    if (frame%20 < 10) { ctx.fillStyle='rgba(255,100,0,0.6)'; ctx.fillRect(Math.round(x+e.w+4),Math.round(y+6),20+frame%10,8); }
  }
  // ── Void: Void Lord ──────────────────────────────────────────────
  else if (e.type === 'boss_crystaltitan') {
    drawPixelRect(x+6,y+20,e.w-12,e.h-22,'#1a3a6a');
    drawPixelRect(x+2,y+8,e.w-4,16,'#2a5090');
    drawPixelRect(x+8,y,e.w-16,12,'#4488cc');
    ctx.fillStyle='#88ccff'; ctx.fillRect(Math.round(x-10),Math.round(y+4),12,24); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+4),12,24);
    for(let ci=0;ci<4;ci++){ctx.fillRect(Math.round(x+10+ci*14),Math.round(y-10),6,12);}
    ctx.fillStyle='#fff'; ctx.fillRect(Math.round(x+14),Math.round(y+2),8,8); ctx.fillRect(Math.round(x+e.w-22),Math.round(y+2),8,8);
    ctx.fillStyle='#002266'; ctx.fillRect(Math.round(x+17),Math.round(y+5),5,5); ctx.fillRect(Math.round(x+e.w-19),Math.round(y+5),5,5);
  }
  else if (e.type === 'boss_tempest') {
    const tf=Math.sin(frame*0.2)*6;
    drawPixelRect(x+6,y+14,e.w-12,e.h-16,'#334466');
    drawPixelRect(x+8,y+4,e.w-16,14,'#445588');
    ctx.fillStyle='#aaaaff'; ctx.fillRect(Math.round(x-18),Math.round(y+6+tf),20,10); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+6-tf),20,10);
    ctx.fillRect(Math.round(x-26),Math.round(y+12+tf),10,6); ctx.fillRect(Math.round(x+e.w+16),Math.round(y+12-tf),10,6);
    ctx.fillStyle='#ffff44'; ctx.fillRect(Math.round(x+e.w/2-3),Math.round(y+5),6,8);
    ctx.fillStyle='#ddddff'; ctx.fillRect(Math.round(x+14),Math.round(y+6),6,6); ctx.fillRect(Math.round(x+e.w-20),Math.round(y+6),6,6);
    if(frame%8<4){ctx.fillStyle='rgba(255,255,100,0.4)';ctx.fillRect(x-30,y-10,e.w+60,e.h+20);}
  }
  else if (e.type === 'boss_mycelqueen') {
    const mf=Math.sin(frame*0.08)*3;
    drawPixelRect(x+6,y+28+mf,e.w-12,e.h-30,'#5a1a6a');
    drawPixelRect(x+2,y+12+mf,e.w-4,20,'#7a2a8a');
    drawPixelRect(x,y+mf,e.w,16,'#aa44cc');
    ctx.fillStyle='#cc88ee'; for(let ms=0;ms<6;ms++){ctx.fillRect(Math.round(x+4+ms*10),Math.round(y+1+mf),6,7);}
    ctx.fillStyle='#ffaaff'; ctx.fillRect(Math.round(x+10),Math.round(y+15+mf),8,8); ctx.fillRect(Math.round(x+e.w-18),Math.round(y+15+mf),8,8);
    ctx.fillStyle='#220033'; ctx.fillRect(Math.round(x+12),Math.round(y+17+mf),5,5); ctx.fillRect(Math.round(x+e.w-16),Math.round(y+17+mf),5,5);
    if(e.spawnTimer%200<5){ctx.save();ctx.globalAlpha=0.4;ctx.fillStyle='#ddaaff';ctx.beginPath();ctx.arc(Math.round(x+e.w/2),Math.round(y+e.h/2),60,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  else if (e.type === 'boss_shadowtitan') {
    const sa=0.7+0.2*Math.sin(frame*0.08+e.y);
    ctx.save(); ctx.globalAlpha=sa;
    drawPixelRect(x+4,y+20,e.w-8,e.h-22,'#1a003a');
    drawPixelRect(x+2,y+8,e.w-4,16,'#2a0050');
    drawPixelRect(x+6,y,e.w-12,12,'#3a0070');
    ctx.restore();
    ctx.fillStyle='#ff00ff'; ctx.shadowColor='#ff00ff'; ctx.shadowBlur=20;
    ctx.fillRect(Math.round(x+12),Math.round(y+2),10,10); ctx.fillRect(Math.round(x+e.w-22),Math.round(y+2),10,10);
    ctx.shadowBlur=0;
    ctx.save(); ctx.globalAlpha=sa;
    ctx.fillStyle='#2a0050'; ctx.fillRect(Math.round(x-14),Math.round(y+12),16,28); ctx.fillRect(Math.round(x+e.w-2),Math.round(y+12),16,28);
    ctx.restore();
    for(let wi=0;wi<4;wi++){const wangle=frame*0.025+wi*(Math.PI/2);ctx.save();ctx.globalAlpha=0.6;ctx.fillStyle='#6600cc';ctx.beginPath();ctx.arc(Math.round(x+e.w/2+Math.cos(wangle)*55),Math.round(y+e.h/2+Math.sin(wangle)*55),8,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  else if (e.type === 'boss_voidlord') {
    const va = e.invincible ? 0.25 + 0.2*Math.sin(frame*0.5) : 0.8+0.15*Math.sin(frame*0.1+e.y);
    ctx.save(); ctx.globalAlpha=va;
    ctx.fillStyle='#1a0030'; ctx.fillRect(Math.round(x+4),Math.round(y+16),e.w-8,e.h-18);
    ctx.fillStyle='#2a0050'; ctx.fillRect(Math.round(x+6),Math.round(y+6),e.w-12,16);
    ctx.fillStyle='#3a0070'; ctx.fillRect(Math.round(x+8),Math.round(y),e.w-16,12);
    // Crown of void energy
    ctx.globalAlpha=1; ctx.fillStyle='#9900ff';
    for(let vi=0;vi<5;vi++){const vp=Math.sin(frame*0.15+vi)*3;ctx.fillRect(Math.round(x+8+vi*10),Math.round(y-8+vp),5,10);}
    // Eyes — massive glowing
    ctx.shadowColor='#cc00ff'; ctx.shadowBlur=16;
    ctx.fillStyle='#ff00ff'; ctx.fillRect(Math.round(x+10),Math.round(y+2),10,10); ctx.fillRect(Math.round(x+e.w-20),Math.round(y+2),10,10);
    ctx.shadowBlur=0;
    ctx.restore();
    // Void wisps orbiting
    ctx.save(); ctx.globalAlpha=0.7;
    for(let wi=0;wi<3;wi++){
      const wangle=frame*0.03+wi*(Math.PI*2/3);
      const wx2=x+e.w/2+Math.cos(wangle)*40, wy2=y+e.h/2+Math.sin(wangle)*40;
      ctx.fillStyle='#8800ff'; ctx.beginPath(); ctx.arc(Math.round(wx2),Math.round(wy2),6,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
    if (e.invincible) { ctx.fillStyle='rgba(150,0,255,0.1)'; ctx.fillRect(Math.round(x-4),Math.round(y-4),e.w+8,e.h+8); }
  }
}
// =====================================================================

function drawEnemy(e) {
  const s = worldToScreen(e.x, e.y);
  if (s.x > CW+40 || s.x < -40 || s.y > CH+40 || s.y < -40) return;
  const {x, y} = s;
  if (e.isBoss) { drawBoss(e, x, y); } else {
    ctx.save();
    if (e.evoTier > 0) {
      // Scale slightly larger per tier
      const sc = 1 + e.evoTier * 0.12;
      ctx.translate(x + e.w/2, y + e.h/2);
      ctx.scale(sc, sc);
      ctx.translate(-(x + e.w/2), -(y + e.h/2));
      // Darken tint overlay after drawing
    }
    drawEnemyByType(e, x, y);
    if (e.evoTier > 0) {
      // Dark overlay to darken the sprite
      ctx.globalAlpha = Math.min(0.5, e.evoTier * 0.2);
      ctx.fillStyle = '#000';
      ctx.fillRect(x - e.w*0.1, y - e.h*0.1, e.w*1.2, e.h*1.2);
      ctx.globalAlpha = 1;
      // Evo badge
      ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = e.evoTier===1?'#ff4400':e.evoTier===2?'#ff0000':'#880000';
      const badge = e.evoTier===1?'★':e.evoTier===2?'★★':'★★★+';
      ctx.fillText(badge, Math.round(x+e.w/2), Math.round(y-12));
    }
    ctx.restore();
  }
  // Health bar
  const hpColor = {runner:'#e74c3c',crawler:'#2ecc71',slimeling:'#22cc22',bogcrawler:'#1a5010',scorpling:'#d4b020',dunestalker:'#c8902a',yeti:'#88ccff',frostimp:'#66aadd',crystalgolem:'#4488cc',gemsprite:'#cc66ff',windelemental:'#aaaaee',stormhawk:'#445577',ember:'#ff6600',magmacrab:'#cc3300',sporepuff:'#aa44cc',myceliumcreep:'#6a2a7a',wraith:'#cc44ff',voidshade:'#ff00aa'}[e.type]||'#fff';
  if (e.isBoss) {
    drawPixelRect(x, y-14, e.w, 8, '#111');
    drawPixelRect(x, y-14, Math.round(e.w * e.hp / e.maxHp), 8, e.phase===2?'#ff2200':'#cc0044');
    ctx.fillStyle='#fff'; ctx.font='bold 9px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText((e.label||'BOSS')+' '+e.hp+'/'+e.maxHp, Math.round(x+e.w/2), Math.round(y-10));
  } else {
    drawPixelRect(x, y-8, e.w, 4, '#333');
    drawPixelRect(x, y-8, Math.round(e.w * e.hp / e.maxHp), 4, hpColor);
  }
}

function drawBullet(b) {
  const s = worldToScreen(b.x, b.y);
  ctx.save();
  ctx.shadowColor='#fbbf24'; ctx.shadowBlur=8;
  ctx.fillStyle = b.color || '#fbbf24';
  ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(10, 10, 164, 22);
  ctx.fillStyle='#e74c3c'; ctx.fillRect(12, 12, Math.round(160*player.hp/player.maxHp), 18);
  ctx.fillStyle='#fff'; ctx.font='bold 12px monospace'; ctx.textAlign='left';
  ctx.textBaseline='middle';
  ctx.fillText('HP: '+player.hp+'/'+player.maxHp, 16, 21);
  // EP bar
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(10, 36, 164, 16);
  ctx.fillStyle='#3b82f6'; ctx.fillRect(12, 38, Math.round(160*player.ep/player.epMax), 12);
  ctx.fillStyle='#ddd'; ctx.font='bold 10px monospace'; ctx.textBaseline='middle';
  ctx.fillText('Lv'+player.level+' EP: '+player.ep+'/'+player.epMax, 16, 44);

  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(CW-130, 10, 120, 26);
  ctx.fillStyle='#fbbf24'; ctx.font='bold 14px monospace'; ctx.textAlign='right';
  ctx.fillText('MP: '+player.coins, CW-14, 23);

  // ── Current Upgrades box (bottom-left) ──────────────────────────
  const activeUps = ALL_UPGRADES.filter(u => u.level > 0 || (player.bonusUpgrades[u.id]||0) > 0);
  const boxLines = activeUps.filter(u => !u.id.startsWith('ab_')).map(u => { const t=u.level+(player.bonusUpgrades[u.id]||0); return u.label+' Lv'+t+(player.bonusUpgrades[u.id]?'(+'+player.bonusUpgrades[u.id]+')':''); });
  // Show all equipped abilities at top
  equippedAbilities.slice().reverse().forEach(abId => {
    const ab = ALL_UPGRADES.find(u=>u.id===abId); if(!ab) return;
    const t = ab.level+(player.bonusUpgrades[ab.id]||0);
    boxLines.unshift('✨ ' + ab.label + ' Lv' + t);
  });
  if (boxLines.length > 0) {
    const lineH = 14, pad = 6;
    const bw = 170, bh = pad*2 + boxLines.length * lineH;
    const bx = 10, by = CH - 26 - bh - 6; // 26px controls bar + 6px gap
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('UPGRADES', bx+pad, by+pad);
    boxLines.forEach((line, i) => {
      const isAbility = boxLines[i] && boxLines[i].startsWith('✨');
      ctx.fillStyle = isAbility ? '#22c55e' : '#d4d4d4';
      ctx.font = '10px monospace';
      ctx.fillText(line, bx+pad, by+pad + 12 + i*lineH);
    });
  }
  const biomeNow = getBiomeAtPixel(player.x, player.y);
  const biomeLabel = {forest:'🌿 Forest',swamp:'🌊 Swamp',desert:'🏜️ Desert',tundra:'❄️ Tundra',crystal:'💎 Crystal',storm:'🌪️ Storm',volcano:'🌋 Volcano',mushroom:'🍄 Mushroom',shadow:'🌑 Shadow',void:'💀 Void'}[biomeNow]||biomeNow;
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(CW/2-60, 10, 120, 22);
  ctx.fillStyle='#ffd700'; ctx.font='bold 12px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(biomeLabel, CW/2, 21);
  // Boss warning
  if (bossWarningTimer > 0 && bossWarningTimer % 12 < 6) {
    ctx.fillStyle='rgba(255,0,0,0.8)'; ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle='#fff'; ctx.font='bold 28px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⚠️ BOSS INCOMING ⚠️', CW/2, CH/2);
  }
  // Boss timer progress (when in biome, not boss active)
  if (!bossActive && biomeTimer > 0 && lastBiome !== 'forest') {
    const pct = biomeTimer/3600;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(CW-134, CH-28, 124, 18);
    ctx.fillStyle='#ff4400'; ctx.fillRect(CW-132, CH-26, Math.round(120*pct), 14);
    ctx.fillStyle='#fff'; ctx.font='10px monospace'; ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillText('BOSS: '+Math.floor(pct*100)+'%', CW-14, CH-19);
  }
  const ps = worldToScreen(player.x + player.w/2, player.y);
  const gap = 22, noteR = 10;
  const totalW = player.notes.length * gap;
  let nx = ps.x - totalW/2 + noteR;
  const ny = ps.y - 24;
  for (const pitch of player.notes) {
    ctx.save();
    ctx.beginPath(); ctx.arc(nx, ny, noteR, 0, Math.PI*2);
    ctx.fillStyle = NOTE_COLORS[pitch]; ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 8px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(NOTE_NAMES[pitch], nx, ny);
    ctx.restore();
    nx += gap;
  }

  if (notification) {
    const alpha = Math.min(1, notification.timer / 30);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.font='bold 22px monospace'; ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.strokeStyle='#000'; ctx.lineWidth=4;
    ctx.strokeText(notification.text, CW/2, CH/2-40);
    ctx.fillStyle=notification.color;
    ctx.fillText(notification.text, CW/2, CH/2-40);
    ctx.restore();
  }

  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0, CH-26, CW, 26);
  ctx.fillStyle='#a78bfa'; ctx.font='11px monospace'; ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText('WASD move  |  Left-click shoot  |  Right-click forge chord  |  ESC pause', CW/2, CH-13);
}


function render() {
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(0, 0, CW, CH);
  if (gameState !== 'playing' && gameState !== 'paused') return;
  // Interior map takes over rendering
  if (interiorState && gameState === 'playing') { drawInterior(); return; }
  // Overwrite with game background when playing
  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, 0, CW, CH);
  drawMap();
  drawLandmarks();
  for (const n of mapNotes) drawMapNote(n);
  for (const b of bullets) drawBullet(b);
  // Lightning arcs
  for (let i = lightningArcs.length-1; i >= 0; i--) {
    const a = lightningArcs[i];
    const s1 = worldToScreen(a.x1, a.y1), s2 = worldToScreen(a.x2, a.y2);
    ctx.save(); ctx.globalAlpha = a.life/12;
    ctx.strokeStyle='#aaeeff'; ctx.lineWidth=2; ctx.shadowColor='#55ccff'; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.stroke();
    ctx.restore();
    a.life--;
    if (a.life<=0) lightningArcs.splice(i,1);
  }
  for (const ex of explosions) {
    const s = worldToScreen(ex.x, ex.y);
    const alpha = ex.life / ex.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#ff6b00';
    ctx.beginPath(); ctx.arc(s.x, s.y, ex.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath(); ctx.arc(s.x, s.y, ex.r * 0.6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  for (const e of enemies) {
    drawEnemy(e);
    if (e.psychic > 0) {
      const sp2 = worldToScreen(e.x, e.y);
      ctx.save(); ctx.globalAlpha = 0.4 + 0.2*Math.sin(frame*0.2);
      ctx.fillStyle = '#aa44ff';
      ctx.fillRect(Math.round(sp2.x), Math.round(sp2.y), e.w, e.h);
      ctx.restore();
    }
    if (e.poisonStacks > 0 && e.poisonTimer > 0) {
      const sp3 = worldToScreen(e.x + e.w/2, e.y + e.h/2);
      const pflicker = 0.5 + 0.5 * Math.sin(frame * 0.4 + e.y * 0.3);
      const palpha = Math.min(1, e.poisonTimer / 60) * (0.6 + 0.4 * pflicker);
      ctx.save();
      ctx.globalAlpha = palpha;
      ctx.fillStyle = '#22cc22';
      ctx.beginPath(); ctx.arc(sp3.x, sp3.y - 8, 7 + pflicker * 4, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = palpha * 0.8;
      ctx.fillStyle = '#88ff44';
      ctx.beginPath(); ctx.arc(sp3.x, sp3.y - 10, 4 + pflicker * 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    if (e.bleeding > 0) {
      const sp4 = worldToScreen(e.x, e.y);
      ctx.save(); ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(Math.round(sp4.x), Math.round(sp4.y), e.w, e.h);
      ctx.restore();
    }
    if (e.frozen > 0) {
      const sf = worldToScreen(e.x, e.y);
      ctx.save(); ctx.globalAlpha = Math.min(0.55, e.frozen / 60 * 0.55);
      ctx.fillStyle = '#7ee8fa';
      ctx.fillRect(Math.round(sf.x), Math.round(sf.y), e.w, e.h);
      // Ice crystal sparkles
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
      const sp = e.x * 7 + e.y * 3;
      ctx.fillRect(Math.round(sf.x + (sp%e.w)), Math.round(sf.y + ((sp*3)%e.h)), 2, 2);
      ctx.fillRect(Math.round(sf.x + ((sp*5)%e.w)), Math.round(sf.y + ((sp*7)%e.h)), 2, 2);
      ctx.restore();
    }
    if (e.burnFlash > 0) {
      e.burnFlash--;
      const s2 = worldToScreen(e.x, e.y);
      ctx.save(); ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(Math.round(s2.x), Math.round(s2.y), e.w, e.h);
      ctx.restore();
    }
    if (e.burning > 0) {
      const s = worldToScreen(e.x + e.w/2, e.y + e.h/2);
      const flicker = 0.5 + 0.5 * Math.sin(frame * 0.4 + e.x);
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.burning / 60) * (0.6 + 0.4 * flicker);
      ctx.fillStyle = '#ff6b00';
      ctx.beginPath(); ctx.arc(s.x, s.y - 8, 7 + flicker * 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffdd00';
      ctx.beginPath(); ctx.arc(s.x, s.y - 10, 4 + flicker * 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
  const ps = worldToScreen(player.x, player.y);
  drawPlayer(ps.x, ps.y);
  drawHUD();


}




// ── Landmarks — 15 per biome, varied instances ──────────────────
const CELL = Math.floor((MAP_W - VOID_BORDER*2) / 3);
const BIOME_LANDMARK_FNS = {
  forest: drawTreehouse, tundra: drawIceCave, mushroom: drawMushroomCastle,
  desert: drawPyramid, swamp: drawSwampRuins, crystal: drawCrystalPalace,
  storm: drawLightningTower, volcano: drawVolcanoForge, shadow: drawShadowTemple
};
const BIOME_GRID_POS = [
  [{b:'tundra',col:0,row:0},{b:'crystal',col:1,row:0},{b:'storm',col:2,row:0}],
  [{b:'desert',col:0,row:1},{b:'forest',col:1,row:1},{b:'swamp',col:2,row:1}],
  [{b:'volcano',col:0,row:2},{b:'mushroom',col:1,row:2},{b:'shadow',col:2,row:2}]
];

// Pre-generate 15 instances per biome at startup
let LANDMARK_INSTANCES = [];

// ── River System ────────────────────────────────────────────────────────────
const RIVER_WATER_COLORS = {
  forest:'#1565c0', tundra:'#b3e5fc', mushroom:'#6a0072', desert:'#bf6900',
  swamp:'#1b4a10',  crystal:'#00838f', storm:'#1c2a34',   volcano:'#bf360c',
  shadow:'#1a0030', void:'#0a0018'
};
const RIVER_BRIDGE_COLORS = {
  forest:'#8d6e63', tundra:'#b0bec5', mushroom:'#9c27b0', desert:'#ffd54f',
  swamp:'#4caf50',  crystal:'#26c6da', storm:'#607d8b',   volcano:'#e64a19',
  shadow:'#7b1fa2', void:'#333333'
};
const TILE_WATER = 2;
let RIVER_DATA = []; // { axis, coord, rangeStart, rangeEnd, bridges[], biome, waterColor, bridgeColor }

function initRivers() {
  RIVER_DATA = [];
  const CELL = Math.floor((MAP_W - VOID_BORDER*2) / 3);
  const BIOME_CELLS = [
    [{b:'tundra',col:0,row:0},{b:'crystal',col:1,row:0},{b:'storm',col:2,row:0}],
    [{b:'desert',col:0,row:1},{b:'forest',col:1,row:1},{b:'swamp',col:2,row:1}],
    [{b:'volcano',col:0,row:2},{b:'mushroom',col:1,row:2},{b:'shadow',col:2,row:2}]
  ];
  const rng = (seed) => { let s=seed+1; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; };

  BIOME_CELLS.forEach(rowArr => rowArr.forEach(({b, col, row}) => {
    const rand = rng(col*999+row*333+b.charCodeAt(0)*7);
    const bx0 = VOID_BORDER + col*CELL; // tile coord start of biome cell
    const by0 = VOID_BORDER + row*CELL;
    const RIVER_W = 3; // tiles wide
    const BRIDGE_W = 5; // tiles wide bridge gap
    const BRIDGE_MARGIN = 12;

    // Generate 1-2 rivers per biome (alternating h/v so they don't always align)
    const numRivers = 1 + Math.floor(rand()*2);
    for (let ri = 0; ri < numRivers; ri++) {
      const axis = (col + row + ri) % 2 === 0 ? 'h' : 'v';
      let coord, rangeStart, rangeEnd;
      if (axis === 'h') {
        // Horizontal river: fixed ty row, avoid edges
        coord = by0 + 20 + Math.floor(rand()*(CELL-40));
        rangeStart = bx0 + 4;
        rangeEnd   = bx0 + CELL - 4;
      } else {
        // Vertical river: fixed tx col
        coord = bx0 + 20 + Math.floor(rand()*(CELL-40));
        rangeStart = by0 + 4;
        rangeEnd   = by0 + CELL - 4;
      }
      const span = rangeEnd - rangeStart;

      // 2 bridges per river
      const numBridges = 2;
      const bridges = [];
      for (let bi = 0; bi < numBridges; bi++) {
        const t = Math.floor(rangeStart + BRIDGE_MARGIN + rand()*(span - BRIDGE_MARGIN*2));
        bridges.push(t);
      }

      // Write water tiles into map (tile value 2), then carve bridge gaps
      for (let rw = 0; rw < RIVER_W; rw++) {
        for (let t = rangeStart; t < rangeEnd; t++) {
          let tx, ty;
          if (axis === 'h') { tx = t; ty = coord + rw; }
          else              { tx = coord + rw; ty = t; }
          if (tx < 0||ty < 0||tx >= MAP_W||ty >= MAP_H) continue;
          // Check if this position is a bridge gap
          const onBridge = bridges.some(bt => t >= bt && t < bt + BRIDGE_W);
          map[ty][tx] = onBridge ? 0 : TILE_WATER;
        }
      }

      // Clear walls inside bridge zones
      for (let bi = 0; bi < numBridges; bi++) {
        for (let bw = 0; bw < RIVER_W; bw++) {
          for (let bt2 = bridges[bi]; bt2 < bridges[bi]+BRIDGE_W; bt2++) {
            let tx2, ty2;
            if (axis === 'h') { tx2=bt2; ty2=coord+bw; } else { tx2=coord+bw; ty2=bt2; }
            if (tx2>=0&&ty2>=0&&tx2<MAP_W&&ty2<MAP_H) map[ty2][tx2]=0;
          }
        }
      }

      RIVER_DATA.push({
        axis, coord, rangeStart, rangeEnd, bridges,
        biome: b, riverW: RIVER_W, bridgeW: BRIDGE_W,
        waterColor: RIVER_WATER_COLORS[b] || '#1565c0',
        bridgeColor: RIVER_BRIDGE_COLORS[b] || '#8d6e63'
      });
    }
  }));
}
function initLandmarks() {
  LANDMARK_INSTANCES = [];
  const rng = (seed) => { let s=seed; return ()=>{ s=(s*16807+0)%2147483647; return (s-1)/2147483646; }; };
  BIOME_GRID_POS.forEach(row => row.forEach(({b, col, row:r}) => {
    const fn = BIOME_LANDMARK_FNS[b]; if (!fn) return;
    const rand = rng(col*1000+r*100+b.charCodeAt(0));
    const bx0 = (VOID_BORDER + col*CELL) * TILE;
    const by0 = (VOID_BORDER + r*CELL) * TILE;
    const bw = CELL * TILE, bh = CELL * TILE;
    const margin = 120;
    for (let i = 0; i < 15; i++) {
      const px = bx0 + margin + rand() * (bw - margin*2);
      const py = by0 + margin + rand() * (bh - margin*2);
      const scale = 0.65 + rand() * 0.65; // 0.65–1.3x
      const colorShift = (rand() - 0.5) * 30; // slight hue/brightness variation
      LANDMARK_INSTANCES.push({ px, py, fn, scale, colorShift, biome: b });
    }
  }));
}

function drawLandmarks() {
  ctx.save();
  for (const lm of LANDMARK_INSTANCES) {
    const s = worldToScreen(lm.px, lm.py);
    if (s.x < -300 || s.x > CW+300 || s.y < -300 || s.y > CH+300) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(lm.scale, lm.scale);
    ctx.globalAlpha = 0.85 + lm.scale * 0.1;
    lm.fn(0, 0, lm.colorShift);
    ctx.restore();
  }
  ctx.restore();
}

// 🌿 Forest — Treehouse
function drawTreehouse(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#5c3317',cs); ctx.fillRect(cx-10,cy,20,80);
  for(let i=0;i<5;i++){ctx.strokeStyle=shiftColor('#a0522d',cs);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-8,cy+i*15);ctx.lineTo(cx+8,cy+i*15);ctx.stroke();}
  ctx.fillStyle=shiftColor('#8B4513',cs); ctx.fillRect(cx-50,cy-10,100,12);
  ctx.fillStyle=shiftColor('#cd853f',cs); ctx.fillRect(cx-40,cy-55,80,48);
  ctx.fillStyle='#3b1f0a'; ctx.fillRect(cx-10,cy-30,20,23);
  ctx.fillStyle='#87ceeb'; ctx.fillRect(cx+12,cy-50,16,14);
  ctx.fillStyle=shiftColor('#5c3317',cs); ctx.fillRect(cx+20,cy-50,2,14); ctx.fillRect(cx+12,cy-44,16,2);
  ctx.fillStyle=shiftColor('#2d5a27',cs); ctx.beginPath();ctx.moveTo(cx-50,cy-55);ctx.lineTo(cx,cy-100);ctx.lineTo(cx+50,cy-55);ctx.closePath();ctx.fill();
  ctx.fillStyle=shiftColor('#3a7a30',cs);
  ctx.beginPath();ctx.arc(cx-55,cy-40,28,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx+55,cy-40,25,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy-105,22,0,Math.PI*2);ctx.fill();
}

// ❄️ Tundra — Ice Cave
function drawIceCave(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#b0c8d8',cs); ctx.fillRect(cx-90,cy-60,180,80);
  ctx.fillStyle='#1a1a2e';
  ctx.beginPath();ctx.arc(cx,cy-15,42,Math.PI,0);ctx.lineTo(cx+42,cy+20);ctx.lineTo(cx-42,cy+20);ctx.closePath();ctx.fill();
  ctx.fillStyle=shiftColor('#a8d8ea',cs);
  for(let i=-3;i<=3;i++){const ix=cx+i*13,ilen=15+Math.abs(i)*5;ctx.beginPath();ctx.moveTo(ix-5,cy-55);ctx.lineTo(ix,cy-55+ilen);ctx.lineTo(ix+5,cy-55);ctx.closePath();ctx.fill();}
  ctx.fillStyle=shiftColor('#eef5f9',cs); ctx.beginPath();ctx.arc(cx,cy-65,50,Math.PI,0);ctx.fill();
  ctx.fillStyle='#4fc3f7'; ctx.beginPath();ctx.arc(cx-12,cy-5,4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx+12,cy-5,4,0,Math.PI*2);ctx.fill();
}

// 🍄 Mushroom — Castle
function drawMushroomCastle(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#c084fc',cs); ctx.fillRect(cx-30,cy-80,60,100);
  ctx.fillStyle=shiftColor('#a855f7',cs); ctx.fillRect(cx-70,cy-55,30,75); ctx.fillRect(cx+40,cy-55,30,75);
  ctx.fillStyle=shiftColor('#c084fc',cs);
  for(let i=-2;i<=2;i++){ctx.fillRect(cx+i*12-5,cy-90,8,14);}
  for(let i=0;i<3;i++){ctx.fillStyle=shiftColor('#a855f7',cs);ctx.fillRect(cx-70+i*12,cy-65,8,12);ctx.fillRect(cx+40+i*12,cy-65,8,12);}
  ctx.fillStyle='#1a0a2e'; ctx.beginPath();ctx.arc(cx,cy+5,16,Math.PI,0);ctx.fillRect(cx-16,cy+5,32,15);ctx.fill();
  ctx.fillStyle='#fbbf24';
  ctx.beginPath();ctx.arc(cx-12,cy-45,6,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx+12,cy-45,6,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy-65,6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=shiftColor('#7c3aed',cs);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy-80);ctx.lineTo(cx,cy-105);ctx.stroke();
  ctx.fillStyle='#f43f5e';ctx.fillRect(cx,cy-105,20,12);
}

// 🏜️ Desert — Pyramid
function drawPyramid(cx, cy, cs=0) {
  ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.beginPath();ctx.moveTo(cx-90,cy+20);ctx.lineTo(cx+110,cy+20);ctx.lineTo(cx+90,cy+10);ctx.closePath();ctx.fill();
  ctx.fillStyle=shiftColor('#d4a853',cs); ctx.beginPath();ctx.moveTo(cx,cy-110);ctx.lineTo(cx+90,cy+20);ctx.lineTo(cx-90,cy+20);ctx.closePath();ctx.fill();
  ctx.fillStyle=shiftColor('#b8893a',cs); ctx.beginPath();ctx.moveTo(cx,cy-110);ctx.lineTo(cx+90,cy+20);ctx.lineTo(cx,cy+20);ctx.closePath();ctx.fill();
  ctx.strokeStyle=shiftColor('#c4973f',cs);ctx.lineWidth=1;
  for(let i=1;i<5;i++){const t=i/5,w=90*t;ctx.beginPath();ctx.moveTo(cx-w,cy-110+130*t);ctx.lineTo(cx+w,cy-110+130*t);ctx.stroke();}
  ctx.fillStyle='#1a0a2e'; ctx.beginPath();ctx.moveTo(cx,cy-10);ctx.lineTo(cx+15,cy+20);ctx.lineTo(cx-15,cy+20);ctx.closePath();ctx.fill();
  ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=10;
  ctx.beginPath();ctx.arc(cx,cy-110,6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
}

// 🌊 Swamp — Sunken Ruins
function drawSwampRuins(cx, cy, cs=0) {
  ctx.fillStyle='rgba(30,100,60,0.5)';ctx.beginPath();ctx.ellipse(cx,cy+18,75,18,0,0,Math.PI*2);ctx.fill();
  const cols=[cx-60,cx-30,cx+10,cx+50];
  cols.forEach((x,i)=>{
    const h=[55,35,65,40][i];
    ctx.fillStyle=shiftColor('#7c7a6a',cs); ctx.fillRect(x-8,cy-h,16,h+20);
    ctx.fillStyle=shiftColor('#6b6959',cs); ctx.fillRect(x-10,cy-h-8,20,10);
    ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-3,cy-h+10);ctx.lineTo(x+2,cy-h+25);ctx.stroke();
  });
  ctx.fillStyle=shiftColor('#7c7a6a',cs); ctx.fillRect(cx-45,cy-70,14,75); ctx.fillRect(cx+31,cy-70,14,75);
  ctx.beginPath();ctx.arc(cx,cy-70,45,Math.PI,0);ctx.lineWidth=12;ctx.strokeStyle=shiftColor('#7c7a6a',cs);ctx.stroke();
  ctx.fillStyle='#2d6a4f';ctx.font='16px serif';ctx.textAlign='center';ctx.fillText('~',cx-35,cy-50);ctx.fillText('~',cx+20,cy-60);
}

// 💎 Crystal — Crystal Palace
function drawCrystalPalace(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#67e8f9',cs); ctx.fillRect(cx-80,cy+10,160,15);
  ctx.fillStyle=shiftColor('rgba(103,232,249,0.7)',cs); ctx.beginPath();ctx.moveTo(cx,cy-120);ctx.lineTo(cx+18,cy+10);ctx.lineTo(cx-18,cy+10);ctx.closePath();ctx.fill();
  ctx.strokeStyle=shiftColor('#a5f3fc',cs);ctx.lineWidth=2;ctx.stroke();
  [[cx-50,70],[cx+50,70],[cx-30,90],[cx+30,90]].forEach(([x,h])=>{
    ctx.fillStyle=shiftColor('rgba(103,232,249,0.6)',cs); ctx.beginPath();ctx.moveTo(x,cy-h);ctx.lineTo(x+12,cy+10);ctx.lineTo(x-12,cy+10);ctx.closePath();ctx.fill();
    ctx.strokeStyle=shiftColor('#a5f3fc',cs);ctx.lineWidth=1;ctx.stroke();
  });
  ctx.fillStyle='#fff';ctx.shadowColor='#67e8f9';ctx.shadowBlur=10;
  [[cx,cy-100],[cx-50,cy-55],[cx+50,cy-55]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();});
  ctx.shadowBlur=0;
}

// 🌪️ Storm — Lightning Tower
function drawLightningTower(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#374151',cs); ctx.fillRect(cx-25,cy,50,25);
  ctx.fillStyle=shiftColor('#1f2937',cs); ctx.fillRect(cx-18,cy-90,36,92);
  ctx.fillStyle='#fbbf24';ctx.shadowColor='#fbbf24';ctx.shadowBlur=8;
  for(let i=0;i<3;i++){ctx.fillRect(cx-8,cy-25-i*28,16,14);}
  ctx.shadowBlur=0;
  ctx.fillStyle=shiftColor('#111827',cs); ctx.fillRect(cx-22,cy-100,44,14);
  ctx.strokeStyle='#9ca3af';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,cy-100);ctx.lineTo(cx,cy-140);ctx.stroke();
  ctx.fillStyle='#ffd700';ctx.beginPath();ctx.arc(cx,cy-140,5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fbbf24';ctx.shadowColor='#fbbf24';ctx.shadowBlur=6;
  ctx.font='bold 24px serif';ctx.textAlign='center';ctx.fillText('⚡',cx,cy-60);ctx.shadowBlur=0;
}

// 🌋 Volcano — Forge
function drawVolcanoForge(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#57534e',cs); ctx.fillRect(cx-55,cy-50,110,70);
  ctx.fillStyle=shiftColor('#44403c',cs); ctx.beginPath();ctx.moveTo(cx-65,cy-50);ctx.lineTo(cx,cy-85);ctx.lineTo(cx+65,cy-50);ctx.closePath();ctx.fill();
  ctx.fillStyle=shiftColor('#3c3430',cs); ctx.fillRect(cx+25,cy-95,20,50);
  ctx.fillStyle='#ef4444';ctx.shadowColor='#ef4444';ctx.shadowBlur=20;
  ctx.beginPath();ctx.arc(cx+35,cy-97,10,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#1c1917'; ctx.beginPath();ctx.arc(cx,cy+5,18,Math.PI,0);ctx.fillRect(cx-18,cy+5,36,15);ctx.fill();
  ctx.fillStyle='rgba(239,68,68,0.4)';ctx.beginPath();ctx.arc(cx,cy+20,25,0,Math.PI*2);ctx.fill();
}

// 🌑 Shadow — Dark Temple
function drawShadowTemple(cx, cy, cs=0) {
  ctx.fillStyle=shiftColor('#1e1b2e',cs);ctx.fillRect(cx-70,cy+15,140,8);ctx.fillRect(cx-60,cy+7,120,10);
  ctx.fillStyle=shiftColor('#0f0d1a',cs); ctx.fillRect(cx-50,cy-70,100,85);
  [shiftColor('#2d1b4e',cs),shiftColor('#1e1535',cs),shiftColor('#2d1b4e',cs),shiftColor('#1e1535',cs)].forEach((col,i)=>{
    ctx.fillStyle=col; ctx.fillRect(cx-50+i*32,cy-80,14,90);
  });
  ctx.fillStyle=shiftColor('#1e1b2e',cs); ctx.beginPath();ctx.moveTo(cx-60,cy-80);ctx.lineTo(cx,cy-115);ctx.lineTo(cx+60,cy-80);ctx.closePath();ctx.fill();
  ctx.fillStyle='#a855f7';ctx.shadowColor='#a855f7';ctx.shadowBlur=10;
  ctx.font='14px serif'; ctx.textAlign='center';
  ctx.fillText('ᛟ',cx-20,cy-40);ctx.fillText('ᚹ',cx+15,cy-55);ctx.fillText('ᚷ',cx,cy-25);
  ctx.fillStyle='#c084fc';ctx.beginPath();ctx.arc(cx,cy-90,8,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#050308'; ctx.fillRect(cx-15,cy-5,30,30);
}

// Color shift utility (nudges brightness slightly per instance)
function shiftColor(hex, shift) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex; // skip rgba
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const clamp=(v)=>Math.max(0,Math.min(255,Math.round(v+shift)));
  return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
}

function loop() { update(); render(); requestAnimationFrame(loop); }
window.addEventListener('resize', () => { CW = window.innerWidth; CH = window.innerHeight; });
loop();
