const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const VERSION = 'v2.7-debug';
const TILE = 32;
const MAP_W = 60, MAP_H = 60;

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
function spawnEnemy() {
  let ex, ey;
  const side = Math.floor(Math.random() * 4);
  if (side === 0) { ex = (1 + Math.floor(Math.random()*(MAP_W-2)))*TILE; ey = TILE; }
  else if (side === 1) { ex = (MAP_W-2)*TILE; ey = (1+Math.floor(Math.random()*(MAP_H-2)))*TILE; }
  else if (side === 2) { ex = (1+Math.floor(Math.random()*(MAP_W-2)))*TILE; ey = (MAP_H-2)*TILE; }
  else { ex = TILE; ey = (1+Math.floor(Math.random()*(MAP_H-2)))*TILE; }
  enemies.push({ x: ex, y: ey, w: 28, h: 28, hp: 30, maxHp: 30, speed: 1.2 + Math.random()*0.8, damageCooldown: 0 });
}

let notification = null;
function showNotif(text, color, duration) {
  notification = { text, color, timer: duration || 120 };
}

const keys = {};
let mouseX = 0, mouseY = 0;
let mouseDown = false;


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
      card.className = 'upg-card' + (maxed ? ' maxed' : canAfford ? ' can' : '');
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

  let dx = 0, dy = 0;
  if (keys['a']||keys['arrowleft'])  dx -= player.speed;
  if (keys['d']||keys['arrowright']) dx += player.speed;
  if (keys['w']||keys['arrowup'])    dy -= player.speed;
  if (keys['s']||keys['arrowdown'])  dy += player.speed;
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
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
    if (getTile(Math.floor(b.x/TILE), Math.floor(b.y/TILE)) === 1) { bullets.splice(i, 1); continue; }
    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (rectOverlap(b.x-4, b.y-4, 8, 8, e.x, e.y, e.w, e.h)) {
        e.hp -= 10;
        if (e.hp <= 0) enemies.splice(j, 1);
        hit = true; break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }

  enemySpawnTimer++;
  if (enemySpawnTimer >= 300) { spawnEnemy(); enemySpawnTimer = 0; }
  if (player.invincible > 0) player.invincible--;

  for (const e of enemies) {
    // Recompute BFS path every 60 frames or if no path
    if (!e.path || e.pathTimer <= 0) {
      e.path = bfsPath(e.x + e.w/2, e.y + e.h/2, player.x + player.w/2, player.y + player.h/2);
      e.pathTimer = 60;
    }
    e.pathTimer--;

    // Follow path waypoints
    if (e.path && e.path.length > 0) {
      const wp = e.path[0];
      const wdx = wp.x - (e.x + e.w/2), wdy = wp.y - (e.y + e.h/2);
      const wlen = Math.sqrt(wdx*wdx + wdy*wdy) || 1;
      if (wlen < e.speed + 2) {
        e.path.shift(); // reached waypoint
      } else {
        e.x += (wdx/wlen) * e.speed;
        e.y += (wdy/wlen) * e.speed;
      }
    } else {
      // Fallback: beeline
      const edx = player.x - e.x, edy = player.y - e.y;
      const elen = Math.sqrt(edx*edx + edy*edy) || 1;
      e.x += edx/elen * e.speed; e.y += edy/elen * e.speed;
    }
    if (player.invincible === 0 && rectOverlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
      player.hp -= 10; player.invincible = 40;
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
    { id:'ab_fire',    label:'Fire Rounds',    desc:'Bullets ignite enemies (DOT)',         baseCost:200, level:0, max:5 },
    { id:'ab_freeze',  label:'Frost Rounds',   desc:'Slow enemies on hit',                  baseCost:200, level:0, max:5 },
    { id:'ab_explode', label:'Explosive',      desc:'Bullets explode on impact',            baseCost:300, level:0, max:5 },
    { id:'ab_leech',   label:'Life Steal',     desc:'10% of dmg dealt restored as HP',      baseCost:250, level:0, max:5 },
    { id:'ab_magnet',  label:'Note Magnet',    desc:'Auto-collect notes within range',      baseCost:175, level:0, max:5 },
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
        const base = ((tx+ty)%2===0) ? '#2d6a4f' : '#27ae60';
        drawPixelRect(sx, sy, TILE, TILE, base);
        const seed = tx*73+ty*137;
        if (seed%5===0) { ctx.fillStyle='#1e5631'; ctx.fillRect(Math.round(sx+(seed%TILE)), Math.round(sy+((seed*3)%TILE)), 2, 2); }
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

function drawEnemy(e) {
  const s = worldToScreen(e.x, e.y);
  if (s.x > canvas.width+40 || s.x < -40 || s.y > canvas.height+40 || s.y < -40) return;
  const {x, y} = s;
  drawPixelRect(x, y+6, e.w, e.h-6, '#c0392b');
  drawPixelRect(x+4, y, e.w-8, 10, '#e74c3c');
  ctx.fillStyle='#fff';
  ctx.fillRect(Math.round(x+5), Math.round(y+2), 5, 5);
  ctx.fillRect(Math.round(x+16), Math.round(y+2), 5, 5);
  ctx.fillStyle='#1a0a2e';
  ctx.fillRect(Math.round(x+7), Math.round(y+4), 3, 3);
  ctx.fillRect(Math.round(x+18), Math.round(y+4), 3, 3);
  drawPixelRect(x, y-6, e.w, 4, '#333');
  drawPixelRect(x, y-6, Math.round(e.w * e.hp / e.maxHp), 4, '#e74c3c');
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

  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(canvas.width-130, 10, 120, 26);
  ctx.fillStyle='#fbbf24'; ctx.font='bold 14px monospace'; ctx.textAlign='right';
  ctx.fillText('Coins: '+player.coins, canvas.width-14, 23);

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
  for (const e of enemies) drawEnemy(e);
  const ps = worldToScreen(player.x, player.y);
  drawPlayer(ps.x, ps.y);
  drawDirectionArrowWorld();
  drawHUD();


}



function loop() { update(); render(); requestAnimationFrame(loop); }
window.addEventListener('resize', () => { canvas.height = window.innerHeight; });
loop();
