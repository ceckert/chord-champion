// Chord Champion — Forest Sprite Test
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = window.innerWidth, H = window.innerHeight;
canvas.width = W; canvas.height = H;
ctx.imageSmoothingEnabled = false;

const TILE = 48;

function spriteUrl(prompt, w, h, seed) {
  return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=' + w + '&height=' + h + '&seed=' + seed + '&nologo=true&model=flux';
}

const SPRITE_DEFS = {
  grass:   spriteUrl('top-down pixel art 32x32 forest grass ground tile seamless green game sprite', 64, 64, 11),
  dirt:    spriteUrl('top-down pixel art 32x32 dirt path ground tile seamless brown game sprite', 64, 64, 22),
  tree:    spriteUrl('top-down pixel art forest tree obstacle sprite game asset leafy shadow pixel art', 96, 128, 33),
  stone:   spriteUrl('top-down pixel art mossy stone rock obstacle sprite game asset grey shadow pixel', 64, 64, 44),
  crawler: spriteUrl('top-down pixel art 32x32 forest slime monster enemy green blob game sprite shadow cute pixel art', 64, 64, 55),
  runner:  spriteUrl('top-down pixel art fast forest fairy enemy creature game sprite green wings pixel art', 48, 64, 66),
  boss:    spriteUrl('top-down pixel art forest bog queen boss enemy large green swamp creature game sprite shadow', 128, 128, 77),
};

const sprites = {};
const skeys = Object.keys(SPRITE_DEFS);
let loaded = 0;

function updateLoadUI() {
  const pct = Math.round(loaded / skeys.length * 100);
  document.getElementById('load-bar').style.width = pct + '%';
  if (loaded === skeys.length) {
    document.getElementById('loading').style.display = 'none';
    requestAnimationFrame(loop);
  }
}

skeys.forEach(function(key) {
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = function() { sprites[key] = img; loaded++; updateLoadUI(); };
  img.onerror = function() { sprites[key] = null;  loaded++; updateLoadUI(); };
  img.src = SPRITE_DEFS[key];
  document.getElementById('load-label').textContent = 'Loading ' + key + '...';
});

const COLS = Math.ceil(W / TILE) + 6;
const ROWS = Math.ceil(H / TILE) + 6;

var worldMap = [];
for (var wy = 0; wy < ROWS + 4; wy++) {
  worldMap[wy] = [];
  for (var wx = 0; wx < COLS + 4; wx++) {
    var r = Math.sin(wx * 7.3 + wy * 13.1) * 0.5 + 0.5;
    worldMap[wy][wx] = r > 0.82 ? 1 : r > 0.75 ? 2 : r < 0.18 ? 3 : 0;
  }
}

var player = { x: W/2, y: H/2, speed: 2.5 };
var keys_held = {};
document.addEventListener('keydown', function(e) { keys_held[e.key.toLowerCase()] = true; e.preventDefault(); });
document.addEventListener('keyup',   function(e) { keys_held[e.key.toLowerCase()] = false; });

var enemies = [];
for (var i = 0; i < 20; i++) {
  enemies.push({ x: (Math.random()*(COLS-4)+2)*TILE, y: (Math.random()*(ROWS-4)+2)*TILE,
    type: Math.random()<0.6 ? 'crawler':'runner', vx:(Math.random()-.5)*1.2, vy:(Math.random()-.5)*1.2, w:0 });
}
var boss = { x: 10*TILE, y: 10*TILE, vx:.4, vy:.3, w:0 };

function spr(key, dx, dy, dw, dh) {
  var img = sprites[key];
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (img) { ctx.drawImage(img, dx, dy, dw, dh); }
  else {
    var fc = {grass:'#2d5a1b',dirt:'#5a3a1a',tree:'#1a3a0a',stone:'#4a4a4a',crawler:'#22aa22',runner:'#44cc88',boss:'#116611'};
    ctx.fillStyle = fc[key]||'#888'; ctx.fillRect(dx, dy, dw, dh);
  }
  ctx.restore();
}

function shadow(cx, cy, rx, ry) {
  ctx.save(); ctx.globalAlpha=.3; ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill(); ctx.restore();
}

var frame = 0;
function loop() {
  frame++;
  if (keys_held['w']||keys_held['arrowup'])    player.y -= player.speed;
  if (keys_held['s']||keys_held['arrowdown'])  player.y += player.speed;
  if (keys_held['a']||keys_held['arrowleft'])  player.x -= player.speed;
  if (keys_held['d']||keys_held['arrowright']) player.x += player.speed;
  player.x = Math.max(TILE, Math.min((COLS-2)*TILE, player.x));
  player.y = Math.max(TILE, Math.min((ROWS-2)*TILE, player.y));

  var camX = player.x - W/2, camY = player.y - H/2;

  enemies.forEach(function(e) {
    e.w += .04; e.x += e.vx + Math.sin(e.w)*.3; e.y += e.vy + Math.cos(e.w)*.3;
    if (e.x<TILE||e.x>(COLS-2)*TILE) e.vx*=-1;
    if (e.y<TILE||e.y>(ROWS-2)*TILE) e.vy*=-1;
  });
  boss.w += .03; boss.x += boss.vx + Math.sin(boss.w)*.4; boss.y += boss.vy + Math.cos(boss.w)*.4;
  if (boss.x<2*TILE||boss.x>(COLS-3)*TILE) boss.vx*=-1;
  if (boss.y<2*TILE||boss.y>(ROWS-3)*TILE) boss.vy*=-1;

  ctx.fillStyle='#1a2e1a'; ctx.fillRect(0,0,W,H);

  var sx0 = Math.floor(camX/TILE)-1, sy0 = Math.floor(camY/TILE)-1;
  for (var ty=sy0; ty<sy0+ROWS+2; ty++) {
    for (var tx=sx0; tx<sx0+COLS+2; tx++) {
      var row = worldMap[Math.max(0,Math.min(ROWS+3,ty))]||[];
      var t = row[Math.max(0,Math.min(COLS+3,tx))]||0;
      var sx = tx*TILE-camX, sy2 = ty*TILE-camY;
      spr('grass', sx, sy2, TILE, TILE);
      if (t===3) spr('dirt', sx, sy2, TILE, TILE);
    }
  }

  // Collect all objects for depth sort
  var objs = [];
  for (var ty2=sy0; ty2<sy0+ROWS+2; ty2++) {
    for (var tx2=sx0; tx2<sx0+COLS+2; tx2++) {
      var row2 = worldMap[Math.max(0,Math.min(ROWS+3,ty2))]||[];
      var t2 = row2[Math.max(0,Math.min(COLS+3,tx2))]||0;
      if (t2===1||t2===2) objs.push({ y:(ty2+1)*TILE, type: t2===1?'tree':'stone', wx:tx2*TILE-camX, wy:ty2*TILE-camY });
    }
  }
  enemies.forEach(function(e) { objs.push({ y:e.y-camY, type:'enemy', e:e, camX:camX, camY:camY }); });
  objs.push({ y:boss.y-camY, type:'boss_obj', camX:camX, camY:camY });
  objs.push({ y:player.y-camY, type:'player_obj' });
  objs.sort(function(a,b){return a.y-b.y;});

  objs.forEach(function(o) {
    if (o.type==='tree') {
      shadow(o.wx+TILE/2+4, o.wy+TILE-6, TILE*0.35, 7);
      spr('tree', o.wx-TILE*0.1, o.wy-TILE*0.6, TILE*1.2, TILE*1.9);
    } else if (o.type==='stone') {
      shadow(o.wx+TILE/2+2, o.wy+TILE-4, TILE*0.35, 6);
      spr('stone', o.wx, o.wy, TILE, TILE);
    } else if (o.type==='enemy') {
      var e=o.e, ex=e.x-o.camX-20, ey=e.y-o.camY-20;
      var sz=e.type==='crawler'?40:34, bob=Math.sin(e.w*2.5)*2;
      shadow(ex+sz/2+2, ey+sz+2, sz*0.4, 7);
      spr(e.type, ex, ey+bob, sz, sz);
    } else if (o.type==='boss_obj') {
      var bx=boss.x-o.camX-44, by2=boss.y-o.camY-44, bob2=Math.sin(frame*.04)*3;
      shadow(bx+52, by2+84, 32, 10);
      spr('boss', bx, by2+bob2, 88, 88);
      ctx.save(); ctx.fillStyle='#ff4444'; ctx.font='bold 12px monospace'; ctx.textAlign='center';
      ctx.fillText('BOSS: BOG QUEEN', boss.x-o.camX, boss.y-o.camY-52); ctx.restore();
    } else if (o.type==='player_obj') {
      var px=player.x-camX, py2=player.y-camY;
      ctx.save(); ctx.translate(px, py2);
      ctx.fillStyle='rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(2,18,11,5,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3b82f6'; ctx.fillRect(-9,-6,18,20);
      ctx.fillStyle='#93c5fd'; ctx.fillRect(-9,-3,18,2); ctx.fillRect(-9,3,18,2);
      ctx.fillStyle='#7c3aed'; ctx.fillRect(-10,13,8,5); ctx.fillRect(2,13,8,5);
      ctx.fillStyle='#f9c74f'; ctx.beginPath(); ctx.arc(0,-12,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#78350f'; ctx.beginPath(); ctx.arc(0,-18,7,Math.PI,0); ctx.fill();
      ctx.fillRect(-4,-20,3,5); ctx.fillRect(2,-22,3,6);
      ctx.fillStyle='#1a0a2e'; ctx.fillRect(-4,-14,3,3); ctx.fillRect(2,-14,3,3);
      ctx.restore();
    }
  });

  // HUD
  ctx.fillStyle='rgba(10,10,30,.75)'; ctx.fillRect(10,10,280,50);
  ctx.strokeStyle='#7c3aed'; ctx.lineWidth=1; ctx.strokeRect(10,10,280,50);
  ctx.fillStyle='#a855f7'; ctx.font='bold 13px monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillText('🌲 Forest Biome — AI Sprite Test', 18, 18);
  ctx.fillStyle='#6b7280'; ctx.font='11px monospace';
  ctx.fillText('WASD to move  •  Chord Champion v10.4', 18, 36);

  requestAnimationFrame(loop);
}
