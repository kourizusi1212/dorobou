const path = require('path'), http = require('http'), express = require('express');
const { WebSocketServer } = require('ws');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_, r) => r.send('ok'));
const server = http.createServer(app), wss = new WebSocketServer({ server });

// ゲーム設定（クライアントにも配信される）
const CFG = {
  CAP: [2, 3, 5, 8, 12],                 // バッグLvごとの持てる数
  LOCK: [0, 0, 1, 1, 2, 3],              // 各家の鍵レベル
  VAL: [[40, 60, 90, 120], [150, 200, 260, 350], [400, 500, 650, 800], [1000, 1400, 2000, 3000]],
  COST: { bag: [150, 500, 1500, 4000], pick: [200, 800, 2500], boots: [120, 400, 1200, 3000] }
};
const rooms = new Map();
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => ABC[Math.random() * ABC.length | 0]).join(''); } while (rooms.has(c)); return c; };
const send = (w, o) => { if (w.readyState === 1) w.send(JSON.stringify(o)); };
const all = (r, o, except) => r.ps.forEach(p => { if (p.ws !== except) send(p.ws, o); });
const sum = a => a.reduce((x, y) => x + y, 0);
const snap = r => ({
  t: 'st', money: r.money, up: r.up, open: [...r.open], taken: [...r.taken], cargo: r.cargo, cargoN: r.cargoN,
  ps: [...r.ps].map(([id, p]) => ({ id, n: p.name, c: p.carry.length, cv: sum(p.carry) }))
});
const sync = r => all(r, snap(r));
const newNight = r => { r.open.clear(); r.taken.clear(); r.cargo = 0; r.cargoN = 0; r.ps.forEach(p => p.carry = []); };
let nextId = 1;

wss.on('connection', ws => {
  const id = nextId++; let room = null, me = null;
  const leave = () => {
    if (!room) return;
    room.ps.delete(id);
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
        r = { code: newCode(), money: 0, up: { bag: 0, pick: 0, boots: 0 }, open: new Set(), taken: new Set(), cargo: 0, cargoN: 0, ps: new Map() };
        rooms.set(r.code, r);
      } else {
        r = rooms.get(String(m.code || '').trim().toUpperCase());
        if (!r) return send(ws, { t: 'err', msg: 'ルームが見つかりません' });
        if (r.ps.size >= 5) return send(ws, { t: 'err', msg: '満員です（最大5人）' });
      }
      room = r; me = { ws, name: String(m.name || '泥棒').slice(0, 12), carry: [] };
      r.ps.set(id, me);
      send(ws, { t: 'joined', id, code: r.code, cfg: CFG }); sync(r);
      return;
    }
    const r = room, { LOCK, VAL, CAP, COST } = CFG;
    switch (m.t) {
      case 'p': all(r, { t: 'p', id, x: +m.x || 0, z: +m.z || 0, r: +m.r || 0 }, ws); break;
      case 'open': {
        const h = m.h | 0;
        if (h >= 0 && h < LOCK.length && !r.open.has(h) && r.up.pick >= LOCK[h]) { r.open.add(h); send(ws, { t: 'ev', k: 'open' }); sync(r); }
        break;
      }
      case 'take': {
        const i = m.i | 0, h = i >> 2;
        if (i >= 0 && h < LOCK.length && r.open.has(h) && !r.taken.has(i) && me.carry.length < CAP[r.up.bag]) {
          r.taken.add(i); me.carry.push(VAL[LOCK[h]][i & 3]); send(ws, { t: 'ev', k: 'take' }); sync(r);
        }
        break;
      }
      case 'load':
        if (me.carry.length) { r.cargo += sum(me.carry); r.cargoN += me.carry.length; me.carry = []; send(ws, { t: 'ev', k: 'load' }); sync(r); }
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
