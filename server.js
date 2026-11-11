const path = require('path'), http = require('http'), express = require('express');
const { WebSocketServer } = require('ws');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_, r) => r.send('ok'));
const server = http.createServer(app), wss = new WebSocketServer({ server });

// 屋敷データ（クライアントにも配信）。壁[x1,z1,x2,z2] / ドア[x1,z1,x2,z2,鍵Lv]。部屋番号 = その部屋へのドア番号
const CFG = {
  CAP: [2, 3, 5, 8, 12],
  COST: { bag: [150, 500, 1500, 4000], pick: [200, 800, 2500], boots: [120, 400, 1200, 3000] },
  WALLS: [[-20,-14,20,-13.8],[-20,13.8,-1.5,14],[1.5,13.8,20,14],[-20,-14,-19.8,14],[19.8,-14,20,14],
    [-7.1,-14,-6.9,-9],[-7.1,-7,-6.9,5],[-7.1,7,-6.9,14],[6.9,-14,7.1,-9],[6.9,-7,7.1,5],[6.9,7,7.1,14],
    [-20,-.1,-7,.1],[-7,-.1,-1,.1],[1,-.1,7,.1],[7,-.1,20,.1]],
  DOORS: [[-1.5,13.8,1.5,14,0],[-7.1,5,-6.9,7,1],[6.9,5,7.1,7,1],[-1,-.1,1,.1,2],[-7.1,-9,-6.9,-7,3],[6.9,-9,7.1,-7,2]],
  RM: [[0,7],[-13.5,7],[13.5,7],[0,-7],[-13.5,-7],[13.5,-7]],   // ホール/図書室/寝室/ギャラリー/金庫室/書斎
  NAMES: [['花瓶','置き時計','銀の食器','財布','香水','ノートPC'], ['古書','万年筆','地球儀','ウイスキー','望遠鏡','蓄音機'],
    ['ハンドバッグ','腕時計','毛皮のコート','宝石箱','タブレット','カメラ'], ['油絵','大理石像','古代の壺','金の燭台','名刀','仮面'],
    ['金の延べ棒','大粒ダイヤ','王冠','古代金貨','秘宝の石板','札束'], ['勲章','ダイヤの指輪','金時計','高級葉巻','機密書類','翡翠の置物']],
  VAL: [[40,60,70,90,110,130],[150,180,220,260,300,350],[160,200,250,300,340,400],[400,480,560,650,750,900],[1200,1500,1800,2200,2800,3500],[450,520,600,700,800,950]],
  VAN: [-24, 21], SHOP: [24, 21], SP: [-22, 25]
};
const ROUTES = [
  [[0,9],[-4,6],[-10,6],[-16,10],[-10,5],[-4,6],[0,9],[4,6],[10,6],[16,10],[10,5],[4,6]],
  [[0,-3],[0,-10],[-4,-7],[-10,-8],[-16,-5],[-10,-8],[-4,-7],[0,-10],[4,-7],[10,-8],[16,-5],[10,-8],[4,-7]],
  [[-8,18],[8,18],[8,22],[-8,22]]
];
const val = i => CFG.VAL[i / 6 | 0][i % 6];
const sum = a => a.reduce((x, y) => x + y, 0);
const ang = a => Math.atan2(Math.sin(a), Math.cos(a));
const mkGuards = () => ROUTES.map(rt => ({ x: rt[0][0], z: rt[0][1], r: 0, wp: 1, st: 0, a: 0, tm: 0, tx: 0, tz: 0, lx: 0, lz: 0, route: rt }));

// 線分と矩形の交差（視線判定）
const seg = (ax, az, bx, bz, b) => {
  let t0 = 0, t1 = 1; const d = [bx - ax, bz - az], q = [ax, az], lo = [b[0], b[1]], hi = [b[2], b[3]];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (q[i] < lo[i] || q[i] > hi[i]) return false; }
    else { let a = (lo[i] - q[i]) / d[i], c = (hi[i] - q[i]) / d[i]; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return false; }
  }
  return true;
};
const los = (a, b, c, d, r) => !(CFG.WALLS.some(w => seg(a, b, c, d, w)) || CFG.DOORS.some((w, i) => !r.open.has(i) && seg(a, b, c, d, w)));
// 警備員の移動（col=1で壁に衝突。ドアの隙間は鍵を持つ警備員は通れる）
const go = (g, x, z, s, col) => {
  const dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz); if (d < .01) return d;
  const k = Math.min(s, d) / d, mx = dx * k, mz = dz * k;
  const hit = (nx, nz) => col && CFG.WALLS.some(w => nx > w[0] - .4 && nx < w[2] + .4 && nz > w[1] - .4 && nz < w[3] + .4);
  if (!hit(g.x + mx, g.z)) g.x += mx; if (!hit(g.x, g.z + mz)) g.z += mz;
  g.r += ang(Math.atan2(-dx, -dz) - g.r) * .25; return d;
};

const rooms = new Map();
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => ABC[Math.random() * ABC.length | 0]).join(''); } while (rooms.has(c)); return c; };
const send = (w, o) => { if (w.readyState === 1) w.send(JSON.stringify(o)); };
const all = (r, o, except) => r.ps.forEach(p => { if (p.ws !== except) send(p.ws, o); });
const snap = r => ({
  t: 'st', money: r.money, up: r.up, open: [...r.open], taken: [...r.taken], cargo: r.cargo, cargoN: r.cargoN,
  ps: [...r.ps].map(([id, p]) => ({ id, n: p.name, c: p.carry.length, cv: sum(p.carry.map(val)) }))
});
const sync = r => all(r, snap(r));
const newNight = r => { r.open.clear(); r.taken.clear(); r.cargo = 0; r.cargoN = 0; r.gd = mkGuards(); r.ps.forEach(p => p.carry = []); };
function caught(r, p) {
  p.carry.forEach(i => r.taken.delete(i)); p.carry = []; p.x = CFG.SP[0]; p.z = CFG.SP[1];
  send(p.ws, { t: 'caught' }); r.gd.forEach(g => { g.st = 0; g.a = 0; }); sync(r);
}
function tick(r, dt) {
  const ps = [...r.ps.values()];
  for (const g of r.gd) {
    let seen = null, bd = 1e9;
    for (const p of ps) {
      const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
      if (d < (p.cr ? 6 : 12) && d < bd && (d < 2.5 || Math.abs(ang(Math.atan2(-dx, -dz) - g.r)) < .9) && los(g.x, g.z, p.x, p.z, r)) { seen = p; bd = d; }
    }
    if (seen) { g.a = Math.min(1, g.a + dt * (bd < 5 ? 1.4 : .7)); g.lx = seen.x; g.lz = seen.z; if (g.a >= 1 && g.st < 2) { g.st = 2; g.tm = 4; } }
    else g.a = Math.max(0, g.a - dt * .25);
    if (g.st === 2) {                                   // 追跡
      if (seen) { g.tx = seen.x; g.tz = seen.z; g.tm = 4; } else g.tm -= dt;
      if (g.tm <= 0) { g.st = 1; g.tx = g.lx; g.tz = g.lz; g.tm = 2.5; g.a = .5; }
      else { go(g, g.tx, g.tz, 4.6 * dt, 1); if (seen && bd < 1.2) return caught(r, seen); }
    } else if (g.st === 1) {                            // 調査
      if (go(g, g.tx, g.tz, 3 * dt, 1) < .8) { g.tm -= dt; g.r += dt * 2.5; }
      if (g.tm <= 0) { g.st = 0; g.a = 0; }
    } else {                                            // 巡回
      const w = g.route[g.wp];
      if (go(g, w[0], w[1], 2.2 * dt, 0) < .4) g.wp = (g.wp + 1) % g.route.length;
    }
  }
}
setInterval(() => {
  for (const r of rooms.values()) {
    tick(r, .066);
    all(r, { t: 'g', g: r.gd.map(g => [+g.x.toFixed(2), +g.z.toFixed(2), +g.r.toFixed(2), g.st, +g.a.toFixed(2)]) });
  }
}, 66);

let nextId = 1;
wss.on('connection', ws => {
  const id = nextId++; let room = null, me = null;
  const leave = () => {
    if (!room) return;
    me.carry.forEach(i => room.taken.delete(i)); room.ps.delete(id);
    if (room.ps.size) { all(room, { t: 'left', id }); sync(room); } else rooms.delete(room.code);
    room = null;
  };
  ws.on('close', leave);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!room) {
      if (m.t !== 'create' && m.t !== 'join') return;
      let r;
      if (m.t === 'create') {
        r = { code: newCode(), money: 0, up: { bag: 0, pick: 0, boots: 0 }, open: new Set(), taken: new Set(), cargo: 0, cargoN: 0, ps: new Map(), gd: mkGuards() };
        rooms.set(r.code, r);
      } else {
        r = rooms.get(String(m.code || '').trim().toUpperCase());
        if (!r) return send(ws, { t: 'err', msg: 'ルームが見つかりません' });
        if (r.ps.size >= 5) return send(ws, { t: 'err', msg: '満員です（最大5人）' });
      }
      room = r; me = { ws, name: String(m.name || '泥棒').slice(0, 12), carry: [], x: CFG.SP[0], z: CFG.SP[1], cr: 0 };
      r.ps.set(id, me);
      send(ws, { t: 'joined', id, code: r.code, cfg: CFG }); sync(r);
      return;
    }
    const r = room, { DOORS, CAP, COST } = CFG;
    switch (m.t) {
      case 'p': me.x = +m.x || 0; me.z = +m.z || 0; me.cr = m.c ? 1 : 0; all(r, { t: 'p', id, x: me.x, z: me.z, r: +m.r || 0, c: me.cr }, ws); break;
      case 'open': {
        const h = m.h | 0;
        if (DOORS[h] && !r.open.has(h) && r.up.pick >= DOORS[h][4]) { r.open.add(h); send(ws, { t: 'ev', k: 'open' }); sync(r); }
        break;
      }
      case 'noise': {                                   // 鍵開け失敗の物音 → 近くの警備員が調査に来る
        const d = DOORS[m.h | 0]; if (!d) break;
        const x = (d[0] + d[2]) / 2, z = (d[1] + d[3]) / 2;
        r.gd.forEach(g => { if (g.st < 2 && Math.hypot(g.x - x, g.z - z) < 18) { g.st = 1; g.tx = x; g.tz = z; g.tm = 2.5; g.a = Math.max(g.a, .5); } });
        break;
      }
      case 'take': {
        const i = m.i | 0;
        if (i >= 0 && i < 36 && r.open.has(i / 6 | 0) && !r.taken.has(i) && me.carry.length < CAP[r.up.bag]) {
          r.taken.add(i); me.carry.push(i); send(ws, { t: 'ev', k: 'take' }); sync(r);
        }
        break;
      }
      case 'load':
        if (me.carry.length) { r.cargo += sum(me.carry.map(val)); r.cargoN += me.carry.length; me.carry = []; send(ws, { t: 'ev', k: 'load' }); sync(r); }
        break;
      case 'sell':
        if (r.cargo > 0) { const g = r.cargo; r.money += g; r.cargo = 0; r.cargoN = 0; all(r, { t: 'ev', k: 'sell', v: g }); sync(r); }
        break;
      case 'buy': {
        const k = m.k, lv = r.up[k], c = COST[k] && COST[k][lv];
        if (c !== undefined && r.money >= c) { r.money -= c; r.up[k]++; send(ws, { t: 'ev', k: 'buy' }); sync(r); }
        break;
      }
      case 'night': newNight(r); sync(r); break;
      case 'loadsave': {
        const s = m.s || {}, u = s.up || {};
        r.money = Math.max(0, Math.floor(+s.money) || 0);
        for (const k in COST) r.up[k] = Math.min(COST[k].length, Math.max(0, u[k] | 0));
        newNight(r); sync(r);
        break;
      }
    }
  });
});
server.listen(process.env.PORT || 3000, () => console.log('listening on', process.env.PORT || 3000));
