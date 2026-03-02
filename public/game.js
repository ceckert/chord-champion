const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const VERSION = 'v4.5-debug';
const TILE = 32;
const MAP_W = 160, MAP_H = 160;

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

// Game State
let gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'upgrades' | 'levelplan' | 'howtoplay'



function getTile(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 1;
  return map[y][x];
}

const camera = { x: 0, y: 0 };
function worldToScreen(wx, wy) { return { x: wx - camera.x, y: wy - camera.y }; }

let savedCoins = 99999; // DEBUG // banked at checkpoint — spent in upgrades
const player = {
  x: MAP_W / 2 * TILE, y: MAP_H / 2 * TILE,
  level: 1, ep: 0, epMax: 100,
  w: 24, h: 28, speed: 3,
  hp: 100, maxHp: 100, coins: 0,
  notes: [], invincible: 0, facing: 1,
  shootCooldown: 0, shootRate: 40, // frames between shots (higher = slower)
};

// Checkpoint
const checkpoint = {
  x: (MAP_W - 8) * TILE,
  y: (MAP_H - 8) * TILE,
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
for (let i = 0; i < 40; i++) spawnMapNote();

let bullets = [];
let explosions = [];
let lightningArcs = [];
let equippedAbility = null;
let biomeTimer = 0;        // frames in current biome
let lastBiome = 'forest';  // biome player was in last frame
let bossActive = false;    // only one boss at a time
let bossWarningTimer = 0;  // flashing warning before spawn // id of the one active ability // { x1,y1,x2,y2,life } // { x, y, r, maxR, life, maxLife }

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
  player.shootCooldown = player.shootRate;
  const dx = tx - (player.x - camera.x);
  const dy = ty - (player.y - camera.y);
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  bullets.push({ x: player.x, y: player.y, vx: dx/len * 10, vy: dy/len * 10, life: 60 });
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

function getBiome(tx, ty) {
  const cx = MAP_W/2, cy = MAP_H/2;
  const dx = tx - cx, dy = ty - cy;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist < 22) return 'forest';
  if (dist > 68) return 'void';
  const angle = Math.atan2(dy, dx);
  if (angle > -Math.PI/4 && angle < Math.PI/4)       return 'desert';   // east
  if (angle > Math.PI*3/4 || angle < -Math.PI*3/4)   return 'swamp';    // west
  if (angle > Math.PI/4 && angle < Math.PI*3/4)      return 'volcano';  // south
  return 'tundra'; // north
}

function getBiomeAtPixel(px, py) {
  return getBiome(Math.floor(px/TILE), Math.floor(py/TILE));
}

function spawnEnemy() {
  let ex, ey;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) { ex = (1 + Math.floor(Math.random()*(MAP_W-2)))*TILE; ey = TILE; }
  else if (side === 1) { ex = (MAP_W-2)*TILE; ey = (1+Math.floor(Math.random()*(MAP_H-2)))*TILE; }
  else if (side === 2) { ex = (1+Math.floor(Math.random()*(MAP_W-2)))*TILE; ey = (MAP_H-2)*TILE; }
  else { ex = TILE; ey = (1+Math.floor(Math.random()*(MAP_H-2)))*TILE; }
  const biome = getBiomeAtPixel(player.x, player.y);
  const r = Math.random();
  let type, w, h, hp, speed, dmg;
  if (biome === 'swamp') {
    type = r < 0.6 ? 'slimeling' : 'crawler';
    if (type === 'slimeling') { w=36;h=24;hp=80;speed=0.6+r*0.3;dmg=12; }
    else { w=28;h=20;hp=50;speed=0.7;dmg=15; }
  } else if (biome === 'desert') {
    type = r < 0.65 ? 'scorpling' : 'runner';
    if (type === 'scorpling') { w=24;h=20;hp=30;speed=2.5+r*0.8;dmg=8; }
    else { w=18;h=38;hp=25;speed=2.4;dmg=6; }
  } else if (biome === 'tundra') {
    type = r < 0.5 ? 'yeti' : 'crawler';
    if (type === 'yeti') { w=40;h=44;hp=140;speed=0.7+r*0.3;dmg=22; }
    else { w=28;h=20;hp=60;speed=0.8;dmg=15; }
  } else if (biome === 'volcano') {
    type = r < 0.6 ? 'ember' : 'runner';
    if (type === 'ember') { w=20;h=28;hp=35;speed=2.8+r*0.7;dmg=10; }
    else { w=18;h=38;hp=25;speed=2.5;dmg=7; }
  } else if (biome === 'void') {
    type = 'wraith';
    w=26;h=32;hp=60;speed=1.8+r*0.8;dmg=18;
  } else { // forest
    type = r < 0.55 ? 'crawler' : 'runner';
    if (type === 'crawler') { w=28;h=20;hp=50;speed=0.8+r*0.4;dmg=15; }
    else { w=18;h=38;hp=25;speed=2.2+r*0.8;dmg=6; }
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
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
});
canvas.addEventListener('mousedown', e => {
  if (gameState !== 'playing') return;
  mouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  shoot((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
});
window.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (gameState === 'playing') forgeChord(); });

// HTML UI — global functions called by inline onclick handlers
function uiShow(screenId) {
  ['scr-main','scr-upgrades','scr-levelplan','scr-howtoplay'].forEach(id => {
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
  canvas.setAttribute('tabindex', '0');
  canvas.focus();
}
function openLevelUp() {
  gameState = 'paused';
  // Pick 3 random upgrades (not maxed)
  const pool = ALL_UPGRADES.filter(u => u.level < u.max);
  const picks = [];
  const used = new Set();
  while (picks.length < Math.min(3, pool.length)) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!used.has(idx)) { used.add(idx); picks.push(pool[idx]); }
  }
  const el = document.getElementById('levelup-overlay');
  const title = document.getElementById('levelup-title');
  const opts = document.getElementById('levelup-options');
  title.textContent = '⭐ Level ' + player.level + '!';
  opts.innerHTML = '';
  picks.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'buy-btn';
    btn.style.cssText = 'width:100%;margin:6px 0;padding:12px;font-size:15px;';
    btn.innerHTML = '<strong>' + u.label + '</strong> <span style="color:#a78bfa">[Lv ' + u.level + '→' + (u.level+1) + ']</span><br><small style="color:#aaa">' + u.desc + '</small>';
    btn.onclick = () => {
      u.level++;
      if (u.id === 'fire')  player.shootRate = Math.max(5, Math.floor(40 * Math.pow(0.9, u.level)));
      if (u.id === 'maxhp') { player.maxHp = 100 + u.level * 20; player.hp = Math.min(player.hp + 20, player.maxHp); }
      if (u.id === 'speed') player.speed = 3 + u.level * 0.3;
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
function uiUpgrades() {
  document.getElementById('coins-display').textContent = 'Banked: ' + savedCoins + ' coins';
  ['gun','ability','stats'].forEach(tab => {
    const pane = document.getElementById('tab-' + tab);
    pane.innerHTML = '';
    UPGRADES[tab].forEach(u => {
      const cost = upgradeCost(u);
      const maxed = u.level >= u.max;
      const canAfford = savedCoins >= cost && !maxed;
      const card = document.createElement('div');
      const isEquipped = tab === 'ability' && equippedAbility === u.id;
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
        btn.textContent = cost + ' coins — BUY';
        btn.onclick = () => { if (applyUpgrade(u)) uiUpgrades(); };
        card.appendChild(btn);
      }
      // Ability tab: equip button
      if (tab === 'ability' && u.level > 0) {
        const equipped = equippedAbility === u.id;
        const eq = document.createElement('button');
        eq.className = 'buy-btn'; eq.style.marginTop = '4px';
        eq.style.background = equipped ? '#22c55e' : '#7c3aed';
        eq.textContent = equipped ? '✅ EQUIPPED' : 'EQUIP';
        eq.onclick = () => { equippedAbility = equipped ? null : u.id; uiUpgrades(); };
        card.appendChild(eq);
      }
      pane.appendChild(card);
    });
  });
  uiShow('scr-upgrades');
}

function uiTab(tabName, btnEl) {
  ['gun','ability','stats'].forEach(t => {
    document.getElementById('tab-' + t).className = 'tab-pane' + (t === tabName ? ' active' : '');
    document.getElementById('tab-' + t).style.display = t === tabName ? 'flex' : 'none';
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
  player.coins += best.def.coins;
  const usedPitches = [...best.needed];
  player.notes = player.notes.filter(p => {
    const idx = usedPitches.indexOf(p);
    if (idx !== -1) { usedPitches.splice(idx, 1); return false; }
    return true;
  });
  showNotif(rootName + ' ' + best.def.name + '! +' + best.def.coins + ' coins', '#fbbf24', 140);
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
  while (queue.length > 0) {
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
  } else if (!bossActive && curBiome !== 'forest') {
    biomeTimer++;
    if (biomeTimer >= 3600) { // 60s at 60fps
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

  camera.x = player.x + player.w/2 - canvas.width/2;
  camera.y = player.y + player.h/2 - canvas.height/2;
  camera.x = Math.max(0, Math.min(MAP_W*TILE - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(MAP_H*TILE - canvas.height, camera.y));

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
    if (getTile(Math.floor(b.x/TILE), Math.floor(b.y/TILE)) === 1) {
      const explodeLv = ALL_UPGRADES.find(u => u.id === 'ab_explode')?.level || 0;
      if (explodeLv > 0) triggerExplosion(b.x, b.y, 40 + explodeLv * 15, 15 + explodeLv * 5);
      bullets.splice(i, 1); continue;
    }
    const dmgMult = 1 + (ALL_UPGRADES.find(u => u.id === 'dmg')?.level || 0) * 0.2;
    const explodeLv = ALL_UPGRADES.find(u => u.id === 'ab_explode')?.level || 0;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (rectOverlap(b.x-4, b.y-4, 8, 8, e.x, e.y, e.w, e.h)) {
        if (e.invincible) { hit = true; break; } // Void Lord phase
        let actualDmg = Math.round(10 * dmgMult);
        // Bleed: 1.5x damage taken
        if (e.bleeding > 0) actualDmg = Math.round(actualDmg * 1.5);
        e.hp -= actualDmg;

        // Active ability effect (only one equipped at a time)
        const ab = equippedAbility ? ALL_UPGRADES.find(u => u.id === equippedAbility) : null;
        const abLv = ab?.level || 0;
        if (ab && abLv > 0) {
          if (ab.id === 'ab_fire')    { e.burning = 300; e.burnDmg = 1 + abLv; }
          if (ab.id === 'ab_bleed')   { e.bleeding = 300; }
          if (ab.id === 'ab_freeze')  { e.frozen = Math.min(450,(e.frozen||0)+150); e.frozenSpeedMult = Math.max(0.15,1-abLv*0.17); }
          if (ab.id === 'ab_weaken' && !e.weakened) { e.weakened=300; e.dmg=Math.round((e.dmg||10)*0.9); }
          if (ab.id === 'ab_poison')  { e.poisonStacks=Math.min(8,(e.poisonStacks||0)+1); e.poisonTimer=300; }
          if (ab.id === 'ab_leech')   { player.hp=Math.min(player.maxHp,player.hp+Math.ceil(actualDmg*0.1)); }
          if (ab.id === 'ab_knockback') {
            const kbdx=e.x-player.x,kbdy=e.y-player.y,kbl=Math.sqrt(kbdx*kbdx+kbdy*kbdy)||1;
            e.x+=(kbdx/kbl)*(20+abLv*8); e.y+=(kbdy/kbl)*(20+abLv*8);
          }
          if (ab.id === 'ab_magnetic') {
            const mgdx=player.x-e.x,mgdy=player.y-e.y,mgl=Math.sqrt(mgdx*mgdx+mgdy*mgdy)||1;
            e.x+=(mgdx/mgl)*(15+abLv*6); e.y+=(mgdy/mgl)*(15+abLv*6);
          }
          if (ab.id === 'ab_psychic' && Math.random()<0.25+abLv*0.05) e.psychic=150;
          if (ab.id === 'ab_lightning') {
          let closest = null, closestDist = 180;
          for (const oe of enemies) {
            if (oe === e) continue;
            const d = Math.sqrt((oe.x-e.x)**2+(oe.y-e.y)**2);
            if (d < closestDist) { closestDist=d; closest=oe; }
          }
          if (closest) {
            closest.hp -= Math.round(actualDmg * 0.5);
            closest.burnFlash = 8;
            lightningArcs.push({ x1:e.x+e.w/2, y1:e.y+e.h/2, x2:closest.x+closest.w/2, y2:closest.y+closest.h/2, life:12 });
            if (closest.hp <= 0) enemies.splice(enemies.indexOf(closest), 1);
          }
          } // end lightning
        } // end ab check

        if (e.hp <= 0) {
          enemies.splice(j, 1);
          if (e.isBoss) { bossActive = false; showNotif('🏆 Boss defeated! +500 coins!', '#fbbf24', 240); savedCoins += 500; }
          const epGain = {crawler:10,runner:8,slimeling:14,scorpling:10,yeti:25,ember:12,wraith:18,boss_treant:200,boss_bogqueen:180,boss_sandking:190,boss_glacier:220,boss_drake:175,boss_voidlord:200}[e.type]||10;
          player.ep += epGain;
          if (player.ep >= player.epMax) {
            player.ep = 0;
            if (player.level < 99) {
              player.level++;
              player.epMax = Math.floor(100 * Math.pow(1.18, player.level - 1));
              openLevelUp();
            }
          }
        }
        if (equippedAbility === 'ab_explode' && explodeLv > 0) triggerExplosion(b.x, b.y, 40 + explodeLv * 15, 15 + explodeLv * 5);

        // Piercing — don't mark as hit if pierce level active
        const pierceLv = (ALL_UPGRADES.find(u => u.id === 'ab_pierce')?.level || 0) + (ALL_UPGRADES.find(u => u.id === 'pierce')?.level || 0);
        if (pierceLv > 0 && (b.pierced||0) < pierceLv) { b.pierced = (b.pierced||0)+1; }
        else hit = true;
        break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  enemySpawnTimer++;
  if (enemySpawnTimer >= 300) { spawnEnemy(); enemySpawnTimer = 0; }
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
    // Psychic — tick down, attack on contact
    if (e.psychic > 0) {
      e.psychic--;
      for (let pi = enemies.length-1; pi >= 0; pi--) {
        const oe = enemies[pi];
        if (oe === e) continue;
        if (rectOverlap(e.x,e.y,e.w,e.h,oe.x,oe.y,oe.w,oe.h)) {
          oe.hp -= 8;
          if (oe.hp <= 0) enemies.splice(pi, 1);
          break;
        }
      }
    }

    // Player collision (psychic enemies don't attack player)
    if (e.psychic > 0) continue;
    if (player.invincible === 0 && rectOverlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
      player.hp -= (e.dmg || 10); player.invincible = 40;
      if (e.type === 'boss_glacier') { player.frozen = 90; } // freeze player briefly
      if (player.hp <= 0) {
        const lost = Math.floor(player.coins * 0.3);
        player.coins -= lost; player.hp = player.maxHp;
        player.x = MAP_W/2*TILE; player.y = MAP_H/2*TILE;
        player.notes = []; enemies = [];
        showNotif('You died! Lost ' + lost + ' coins', '#ff6b6b', 150);
      }
    }
  }

  if (notification) { notification.timer--; if (notification.timer <= 0) notification = null; }
  // Animate explosions
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.r = ex.maxR * (1 - ex.life / ex.maxLife);
    ex.life--;
    if (ex.life <= 0) explosions.splice(i, 1);
  }
  if (mapNotes.length < 25 && frame % 120 === 0) spawnMapNote();
  if (player.shootCooldown > 0) player.shootCooldown--;
  if (mouseDown && gameState === 'playing') shoot(mouseX, mouseY);

  // Checkpoint detection
  if (!checkpoint.reached) {
    if (Math.abs((player.x + player.w/2) - (checkpoint.x + checkpoint.w/2)) < checkpoint.w &&
        Math.abs((player.y + player.h/2) - (checkpoint.y + checkpoint.h/2)) < checkpoint.h) {
      checkpoint.reached = true;
      savedCoins += player.coins;
      const banked = player.coins;
      player.coins = 0;
      checkpoint.reached = true;
      showNotif('Checkpoint! ' + banked + ' coins banked.', '#22c55e', 180);
    }
  }
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

function applyUpgrade(u) {
  if (u.level >= u.max) return;
  const cost = upgradeCost(u);
  if (savedCoins < cost) { showNotif('Not enough coins!', '#ef4444', 120); return; }
  savedCoins -= cost;
  u.level++;
  if (u.id === 'fire')  player.shootRate = Math.max(5, Math.floor(40 * Math.pow(0.9, u.level)));
  if (u.id === 'maxhp') { player.maxHp = 100 + u.level * 20; player.hp = Math.min(player.hp + 20, player.maxHp); }
  if (u.id === 'speed') player.speed = 3 + u.level * 0.3;
  if (u.id === 'range') { /* applied in bullet life calc */ }
  showNotif(u.label + ' → Lv ' + u.level + '!', '#22c55e', 150);
  return true;
}




function drawPauseOverlay() {
  menuButtons = [];
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cw = canvas.width, ch = canvas.height;
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
  const etx = Math.min(MAP_W, stx + Math.ceil(canvas.width/TILE) + 2);
  const sty = Math.max(0, Math.floor(camera.y/TILE));
  const ety = Math.min(MAP_H, sty + Math.ceil(canvas.height/TILE) + 2);
  for (let ty = sty; ty < ety; ty++) {
    for (let tx = stx; tx < etx; tx++) {
      const sx = tx*TILE - camera.x, sy = ty*TILE - camera.y;
      if (map[ty][tx] === 1) {
        // Tree trunk
        ctx.fillStyle = '#5c3d1e';
        ctx.fillRect(Math.round(sx + TILE/2 - 4), Math.round(sy + TILE*0.55), 8, Math.round(TILE*0.45));
        // Tree canopy (layered circles for pixel look)
        ctx.fillStyle = '#1a5c2a';
        ctx.fillRect(Math.round(sx + 4), Math.round(sy + 6), TILE-8, TILE*0.55);
        ctx.fillStyle = '#22803a';
        ctx.fillRect(Math.round(sx + 7), Math.round(sy + 3), TILE-14, TILE*0.45);
        ctx.fillStyle = '#2ecc5a';
        ctx.fillRect(Math.round(sx + TILE/2 - 4), Math.round(sy + 1), 8, 8);
        // Shadow on grass under tree
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(Math.round(sx+3), Math.round(sy + TILE*0.7), TILE-6, 5);
      } else {
        const biomeHere = getBiome(tx, ty);
        let base, detail;
        if (biomeHere==='swamp')   { base=((tx+ty)%2===0)?'#1a3a1a':'#243a24'; detail='#0f2a0f'; }
        else if (biomeHere==='desert') { base=((tx+ty)%2===0)?'#c8a84b':'#d4b860'; detail='#b89030'; }
        else if (biomeHere==='tundra') { base=((tx+ty)%2===0)?'#a8c0d0':'#bcd0e0'; detail='#80a0b8'; }
        else if (biomeHere==='volcano') { base=((tx+ty)%2===0)?'#3a1008':'#4a1a10'; detail='#6b1010'; }
        else if (biomeHere==='void') { base=((tx+ty)%2===0)?'#0a0818':'#12101e'; detail='#1a1028'; }
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
  if (s.x > canvas.width+20 || s.x < -20 || s.y > canvas.height+20 || s.y < -20) return;
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

  // === BODY (does NOT rotate — top-down overhead view) ===
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(2, 14, 11, 5, 0, 0, Math.PI*2); ctx.fill();

  // Pajama body
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(-9, -6, 18, 20);
  ctx.fillStyle = '#93c5fd';
  ctx.fillRect(-9, -3, 18, 2);
  ctx.fillRect(-9, 3, 18, 2);
  ctx.fillRect(-9, 9, 18, 2);

  // Feet / slippers (bottom)
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(-10, 13, 8, 5);
  ctx.fillRect(2, 13, 8, 5);

  // Head (top-down: circle with hair)
  ctx.fillStyle = '#f9c74f';
  ctx.beginPath(); ctx.arc(0, -12, 9, 0, Math.PI*2); ctx.fill();
  // Bedhead hair
  ctx.fillStyle = '#78350f';
  ctx.beginPath(); ctx.arc(0, -18, 7, Math.PI, 0); ctx.fill();
  ctx.fillRect(-4, -20, 3, 5);
  ctx.fillRect(2, -22, 3, 6);
  ctx.fillRect(-8, -17, 3, 5);

  // === RESTING ARM (left side, hangs down normally) ===
  ctx.fillStyle = '#f9c74f';
  ctx.fillRect(-16, -4, 7, 5); // left arm stub

  // === GUN ARM (rotates from shoulder) ===
  ctx.save();
  ctx.translate(9, -1); // shoulder pivot point
  ctx.rotate(angle);
  // Upper arm
  ctx.fillStyle = '#f9c74f';
  ctx.fillRect(0, -3, 8, 5);
  // Gun
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(7, -4, 12, 7);
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(17, -2, 5, 4);
  ctx.restore();

  // Eyes (fixed, no rotation)
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(-4, -14, 3, 3);
  ctx.fillRect(2, -14, 3, 3);

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
  if (s.x > canvas.width+40 || s.x < -40 || s.y > canvas.height+40 || s.y < -40) return;
  const {x, y} = s;
  if (e.isBoss) { drawBoss(e, x, y); } else { drawEnemyByType(e, x, y); }
  // Health bar
  const hpColor = {runner:'#e74c3c',crawler:'#2ecc71',slimeling:'#22cc22',scorpling:'#d4b020',yeti:'#88ccff',ember:'#ff6600',wraith:'#cc44ff'}[e.type]||'#fff';
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
  ctx.fillStyle='#fbbf24';
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

  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(canvas.width-130, 10, 120, 26);
  ctx.fillStyle='#fbbf24'; ctx.font='bold 14px monospace'; ctx.textAlign='right';
  ctx.fillText('Coins: '+player.coins, canvas.width-14, 23);

  const biomeNow = getBiomeAtPixel(player.x, player.y);
  const biomeLabel = {forest:'🌿 Forest',swamp:'🌊 Swamp',desert:'🏜️ Desert',tundra:'❄️ Tundra',volcano:'🌋 Volcano',void:'💀 Void'}[biomeNow]||biomeNow;
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(canvas.width/2-60, 10, 120, 22);
  ctx.fillStyle='#ffd700'; ctx.font='bold 12px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(biomeLabel, canvas.width/2, 21);
  // Boss warning
  if (bossWarningTimer > 0 && bossWarningTimer % 12 < 6) {
    ctx.fillStyle='rgba(255,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff'; ctx.font='bold 28px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⚠️ BOSS INCOMING ⚠️', canvas.width/2, canvas.height/2);
  }
  // Boss timer progress (when in biome, not boss active)
  if (!bossActive && biomeTimer > 0 && lastBiome !== 'forest') {
    const pct = biomeTimer/3600;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(canvas.width-134, canvas.height-28, 124, 18);
    ctx.fillStyle='#ff4400'; ctx.fillRect(canvas.width-132, canvas.height-26, Math.round(120*pct), 14);
    ctx.fillStyle='#fff'; ctx.font='10px monospace'; ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillText('BOSS: '+Math.floor(pct*100)+'%', canvas.width-14, canvas.height-19);
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
    ctx.strokeText(notification.text, canvas.width/2, canvas.height/2-40);
    ctx.fillStyle=notification.color;
    ctx.fillText(notification.text, canvas.width/2, canvas.height/2-40);
    ctx.restore();
  }

  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0, canvas.height-26, canvas.width, 26);
  ctx.fillStyle='#a78bfa'; ctx.font='11px monospace'; ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText('WASD move  |  Left-click shoot  |  Right-click forge chord  |  ESC pause', canvas.width/2, canvas.height-13);
}


function drawCheckpointWorld() {
  const s = worldToScreen(checkpoint.x, checkpoint.y);
  if (s.x > canvas.width+60 || s.x < -60 || s.y > canvas.height+60 || s.y < -60) return;
  const col = checkpoint.reached ? '#22c55e' : '#fbbf24';
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(Math.round(s.x + 22), Math.round(s.y), 4, checkpoint.h);
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(s.x + 26), Math.round(s.y), 18, 13);
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(s.x), Math.round(s.y), checkpoint.w, checkpoint.h);
  ctx.restore();
  ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillText(checkpoint.reached ? 'SAVED' : 'SAVE', Math.round(s.x + checkpoint.w/2), Math.round(s.y + checkpoint.h/2 + 4));
}

function drawDirectionArrowWorld() {
  if (checkpoint.reached) return;
  const cx2 = checkpoint.x + checkpoint.w/2, cy2 = checkpoint.y + checkpoint.h/2;
  const sx = cx2 - camera.x, sy = cy2 - camera.y;
  if (sx > 20 && sx < canvas.width-20 && sy > 20 && sy < canvas.height-20) return;
  const dx = cx2 - (player.x + player.w/2), dy = cy2 - (player.y + player.h/2);
  const ang = Math.atan2(dy, dx);
  const margin = 50;
  const ax = canvas.width/2 + Math.cos(ang) * (canvas.width/2 - margin);
  const ay = canvas.height/2 + Math.sin(ang) * (canvas.height/2 - margin);
  ctx.save();
  ctx.translate(ax, ay); ctx.rotate(ang);
  ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(-10,-8); ctx.lineTo(-10,8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.shadowBlur = 0;
  ctx.fillText('SAVE', 0, 22);
  ctx.restore();
}

function render() {
  // Always fill canvas so semi-transparent overlay has something to show over
  ctx.fillStyle = '#1a0a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (gameState !== 'playing' && gameState !== 'paused') return;
  // Overwrite with game background when playing
  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawMap();
  drawCheckpointWorld();
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
  drawDirectionArrowWorld();
  drawHUD();


}



function loop() { update(); render(); requestAnimationFrame(loop); }
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
loop();
