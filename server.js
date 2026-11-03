'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { departments } = require('./config');
const exporter = require('./export');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC = path.join(__dirname, 'public');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- tiny JSON database ----------
let db = { series: [], members: [] };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const id = () => crypto.randomBytes(8).toString('hex');

// ---------- auth (one admin password, in-memory sessions) ----------
const sessions = new Set();
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
// login brute-force guard: 10 wrong passwords / 15 min / IP
const fails = new Map();
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
const isAdmin = (req) => sessions.has(cookies(req).sid);

// ---------- helpers ----------
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type + (type.startsWith('text') || type.includes('json') ? '; charset=utf-8' : '') });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('Bad JSON')); }
    });
  });
}
const clean = (s, max = 100) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const phoneOk = (p) => /^\+?[0-9 \-]{8,16}$/.test(p);
const slugify = (s) => clean(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'series';

function validate(body) {
  const type = body.type === 'artist' ? 'artist' : 'crew';
  const m = { type, name: clean(body.name), phone: clean(body.phone, 20) };
  if (!m.name) return { error: 'नाम ज़रूरी है' };
  if (!phoneOk(m.phone)) return { error: 'सही phone number डालें' };
  if (type === 'crew') {
    const dep = departments[body.department];
    if (!dep) return { error: 'Department चुनें' };
    m.department = body.department;
    if (dep.roles) {
      if (!dep.roles.includes(body.designation)) return { error: 'Designation चुनें' };
      m.designation = body.designation;
    } else {
      m.designation = clean(body.designation);
      if (!m.designation) return { error: 'Designation लिखें' };
    }
  } else {
    m.character = clean(body.character);
    if (!m.character) return { error: 'Character का नाम लिखें' };
    const age = parseInt(body.age, 10);
    if (!(age > 0 && age < 120)) return { error: 'सही Age डालें' };
    m.age = age;
    if (!['Male', 'Female', 'Other'].includes(body.gender)) return { error: 'Gender चुनें' };
    m.gender = body.gender;
    m.designation = 'Artist';
  }
  return { member: m };
}

function saveSelfie(dataUrl, memberId) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) return null;
  const buf = Buffer.from(match[1], 'base64');
  if (buf.length > 3 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  fs.writeFileSync(path.join(UPLOAD_DIR, memberId + '.jpg'), buf);
  return memberId + '.jpg';
}
function removePhoto(m) {
  if (m.photo) fs.rmSync(path.join(UPLOAD_DIR, path.basename(m.photo)), { force: true });
}

const google = require('./google')({
  db, save, dataDir: DATA_DIR, uploadDir: UPLOAD_DIR,
  buildRows: (s) => exporter.rowsFor(db, s, departments), toCsv: exporter.csv,
});

// ---------- routes ----------
const STATIC = {
  '/': ['admin.html', 'text/html'],
  '/admin': ['admin.html', 'text/html'],
  '/app.css': ['app.css', 'text/css'],
  '/admin.js': ['admin.js', 'application/javascript'],
  '/form.js': ['form.js', 'application/javascript'],
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const method = req.method;

  // static files
  if (method === 'GET' && STATIC[p]) {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC, STATIC[p][0])), STATIC[p][1]);
  }
  if (method === 'GET' && p === '/healthz') return send(res, 200, 'ok', 'text/plain');
  if (method === 'GET' && p === '/api/config') return send(res, 200, departments);
  let m;
  if (method === 'GET' && (m = /^\/s\/([a-z0-9-]+)$/.exec(p))) {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'form.html')), 'text/html');
  }

  // ----- public API (form) -----
  if (method === 'GET' && (m = /^\/api\/public\/([a-z0-9-]+)$/.exec(p))) {
    const s = db.series.find((x) => x.slug === m[1]);
    if (!s) return send(res, 404, { error: 'Series नहीं मिली' });
    return send(res, 200, { name: s.name, description: s.description });
  }
  if (method === 'POST' && (m = /^\/api\/public\/([a-z0-9-]+)\/submit$/.exec(p))) {
    const s = db.series.find((x) => x.slug === m[1]);
    if (!s) return send(res, 404, { error: 'Series नहीं मिली' });
    const body = await readBody(req);
    const { member, error } = validate(body);
    if (error) return send(res, 400, { error });
    if (member.type === 'artist') {
      if (!body.selfie) return send(res, 400, { error: 'Selfie ज़रूरी है' });
    }
    // One person may submit several entries (other role / character, crew + artist).
    // Only an exact repeat (same person + same role/character) is ignored, e.g. a double tap.
    const digits = (x) => String(x).replace(/[^0-9+]/g, '');
    const lc = (x) => String(x || '').toLowerCase();
    const dup = db.members.find((x) => x.seriesId === s.id && x.type === member.type && digits(x.phone) === digits(member.phone) &&
      (x.department || '') === (member.department || '') && lc(x.designation) === lc(member.designation) && lc(x.character) === lc(member.character));
    if (dup) return send(res, 200, { ok: true, duplicate: true });
    const mid = id();
    if (member.type === 'artist') {
      const file = saveSelfie(body.selfie, mid);
      if (!file) return send(res, 400, { error: 'Selfie सही नहीं है' });
      member.photo = file;
    }
    db.members.push({ id: mid, seriesId: s.id, ...member, createdAt: new Date().toISOString() });
    save();
    google.syncSeriesLater(s.id);
    return send(res, 200, { ok: true, duplicate: false });
  }

  // ----- admin auth -----
  if (method === 'POST' && p === '/api/login') {
    const body = await readBody(req).catch(() => ({}));
    const ip = clientIp(req);
    const f = fails.get(ip);
    if (f && f.n >= 10 && Date.now() - f.t < 15 * 60 * 1000) return send(res, 429, { error: 'बहुत कोशिशें हुईं, 15 मिनट बाद आज़माएँ' });
    const a = Buffer.from(String(body.password || ''));
    const b = Buffer.from(ADMIN_PASSWORD);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.add(sid);
      fails.delete(ip);
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
      return send(res, 200, { ok: true });
    }
    fails.set(ip, { n: (f && Date.now() - f.t < 15 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
    return send(res, 401, { error: 'गलत password' });
  }
  if (method === 'POST' && p === '/api/logout') {
    sessions.delete(cookies(req).sid);
    res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  // ----- Google Drive OAuth (browser redirects; admin cookie required) -----
  if (method === 'GET' && p === '/auth/google') {
    if (!isAdmin(req)) return send(res, 401, 'Login required', 'text/plain');
    if (!google.configured()) return send(res, 400, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set', 'text/plain');
    res.writeHead(302, { Location: google.authUrl(req) });
    return res.end();
  }
  if (method === 'GET' && p === '/auth/google/callback') {
    if (!isAdmin(req)) return send(res, 401, 'Login required', 'text/plain');
    let ok = false;
    try {
      if (url.searchParams.get('code')) { await google.handleCallback(req, url.searchParams.get('code'), url.searchParams.get('state')); ok = true; }
    } catch (x) { console.error(x.message); }
    res.writeHead(302, { Location: '/#google=' + (ok ? 'connected' : 'error') });
    return res.end();
  }

  // ----- admin API -----
  if (p.startsWith('/api/admin') || p.startsWith('/uploads/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Login required' });

    if (method === 'GET' && (m = /^\/uploads\/([a-f0-9]+\.jpg)$/.exec(p))) {
      const f = path.join(UPLOAD_DIR, m[1]);
      if (!fs.existsSync(f)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(f), 'image/jpeg');
    }
    if (method === 'GET' && p === '/api/admin/me') return send(res, 200, { ok: true });
    if (method === 'GET' && p === '/api/admin/google') return send(res, 200, google.info(req));
    if (method === 'POST' && p === '/api/admin/google/disconnect') { google.disconnect(); return send(res, 200, { ok: true }); }
    if (method === 'POST' && p === '/api/admin/google/sync') {
      if (!google.connected()) return send(res, 400, { error: 'Google connected नहीं है' });
      google.syncAll();
      return send(res, 200, { ok: true });
    }

    if (method === 'GET' && p === '/api/admin/series') {
      return send(res, 200, db.series.map((s) => {
        const ms = db.members.filter((x) => x.seriesId === s.id);
        return { ...s, crew: ms.filter((x) => x.type === 'crew').length, artists: ms.filter((x) => x.type === 'artist').length };
      }));
    }
    if (method === 'POST' && p === '/api/admin/series') {
      const body = await readBody(req);
      const name = clean(body.name);
      if (!name) return send(res, 400, { error: 'Series का नाम लिखें' });
      let slug = slugify(name) + '-' + crypto.randomBytes(3).toString('hex'); // unguessable link
      const s = { id: id(), name, description: clean(body.description, 200), slug, createdAt: new Date().toISOString() };
      db.series.push(s);
      save();
      return send(res, 200, s);
    }
    if ((m = /^\/api\/admin\/series\/([a-f0-9]+)$/.exec(p))) {
      const s = db.series.find((x) => x.id === m[1]);
      if (!s) return send(res, 404, { error: 'not found' });
      if (method === 'DELETE') {
        db.members.filter((x) => x.seriesId === s.id).forEach(removePhoto);
        db.members = db.members.filter((x) => x.seriesId !== s.id);
        db.series = db.series.filter((x) => x.id !== s.id);
        save();
        return send(res, 200, { ok: true });
      }
      if (method === 'GET') return send(res, 200, { ...s, members: db.members.filter((x) => x.seriesId === s.id) });
    }
    if (method === 'GET' && (m = /^\/api\/admin\/series\/([a-f0-9]+)\/export\.(csv|xlsx)$/.exec(p))) {
      const s = db.series.find((x) => x.id === m[1]);
      if (!s) return send(res, 404, { error: 'not found' });
      const rows = exporter.rowsFor(db, s, departments);
      res.setHeader('Content-Disposition', `attachment; filename="${s.slug}.${m[2]}"`);
      return m[2] === 'csv'
        ? send(res, 200, exporter.csv(rows), 'text/csv')
        : send(res, 200, exporter.xlsx(rows, s.name), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    if (method === 'DELETE' && (m = /^\/api\/admin\/members\/([a-f0-9]+)$/.exec(p))) {
      const x = db.members.find((y) => y.id === m[1]);
      if (!x) return send(res, 404, { error: 'not found' });
      removePhoto(x);
      db.members = db.members.filter((y) => y.id !== x.id);
      save();
      google.syncSeriesLater(x.seriesId);
      return send(res, 200, { ok: true });
    }
  }
  send(res, 404, { error: 'Not found' });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, e.message === 'Too large' ? 413 : 400, { error: e.message });
  });
}).listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.log('⚠ Default admin password "admin123" — set ADMIN_PASSWORD env var.');
  console.log('Data directory:', DATA_DIR);
});
