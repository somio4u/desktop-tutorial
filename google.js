'use strict';
// Google Drive sync. Scope drive.file = the app can only touch files/folders it created itself.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function createGoogle({ db, save, dataDir, uploadDir, buildRows, toCsv }) {
  const e = process.env;
  const CID = e.GOOGLE_CLIENT_ID, SECRET = e.GOOGLE_CLIENT_SECRET;
  const AUTH = e.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
  const TOKEN = e.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
  const API = e.GOOGLE_API_BASE || 'https://www.googleapis.com/drive/v3';
  const UP = e.GOOGLE_UPLOAD_BASE || 'https://www.googleapis.com/upload/drive/v3';
  const ROOT_NAME = 'Database of Series';
  const TOK_FILE = path.join(dataDir, 'google.json');
  const FOLDER = 'application/vnd.google-apps.folder';
  const SHEET = 'application/vnd.google-apps.spreadsheet';

  let tok = fs.existsSync(TOK_FILE) ? JSON.parse(fs.readFileSync(TOK_FILE, 'utf8')) : {};
  const saveTok = () => fs.writeFileSync(TOK_FILE, JSON.stringify(tok), { mode: 0o600 });
  const states = new Set();
  const status = { pending: 0, lastError: '', lastSync: '' };

  const configured = () => !!(CID && SECRET);
  const connected = () => !!tok.refresh_token;

  function redirectUri(req) {
    if (e.PUBLIC_URL) return e.PUBLIC_URL.replace(/\/$/, '') + '/auth/google/callback';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return `${proto}://${req.headers.host}/auth/google/callback`;
  }
  function authUrl(req) {
    const state = crypto.randomBytes(16).toString('hex');
    states.add(state);
    const q = new URLSearchParams({
      client_id: CID, redirect_uri: redirectUri(req), response_type: 'code', access_type: 'offline', prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/drive.file', state,
    });
    return AUTH + '?' + q;
  }
  async function tokenCall(params) {
    const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CID, client_secret: SECRET, ...params }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Google token error: ' + (j.error_description || j.error || r.status));
    return j;
  }
  async function handleCallback(req, code, state) {
    if (!states.delete(state)) throw new Error('Invalid state');
    const j = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(req) });
    if (!j.refresh_token) throw new Error('No refresh token received');
    tok = { refresh_token: j.refresh_token, access_token: j.access_token, expiry: Date.now() + j.expires_in * 1000 };
    saveTok();
    await rootFolder(); // create "Database of Series" right away
    syncAll();
  }
  function disconnect() { tok = {}; try { fs.rmSync(TOK_FILE, { force: true }); } catch {} }

  async function accessToken() {
    if (tok.access_token && tok.expiry > Date.now() + 60000) return tok.access_token;
    const j = await tokenCall({ refresh_token: tok.refresh_token, grant_type: 'refresh_token' });
    tok.access_token = j.access_token; tok.expiry = Date.now() + j.expires_in * 1000;
    saveTok();
    return tok.access_token;
  }
  async function call(method, url, { json, body, headers } = {}) {
    const r = await fetch(url, {
      method, body: json ? JSON.stringify(json) : body,
      headers: { Authorization: 'Bearer ' + (await accessToken()), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    });
    const text = await r.text();
    if (!r.ok) { const err = new Error(`Drive ${r.status}: ${text.slice(0, 200)}`); err.status = r.status; throw err; }
    return text ? JSON.parse(text) : {};
  }
  async function alive(id) {
    if (!id) return false;
    try { const f = await call('GET', `${API}/files/${id}?fields=id,trashed`); return !f.trashed; }
    catch (x) { if (x.status === 404) return false; throw x; }
  }
  const mkFolder = (name, parent) => call('POST', `${API}/files?fields=id,webViewLink`, { json: { name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) } });
  function multipart(meta, mime, buf) {
    const b = 'b' + crypto.randomBytes(12).toString('hex');
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`),
      buf, Buffer.from(`\r\n--${b}--`)]);
    return { body, headers: { 'Content-Type': `multipart/related; boundary=${b}` } };
  }
  const createFile = (meta, mime, buf) => call('POST', `${UP}/files?uploadType=multipart&fields=id,webViewLink`, multipart(meta, mime, buf));
  const updateFile = (id, mime, buf) => call('PATCH', `${UP}/files/${id}?uploadType=media&fields=id,webViewLink`, { body: buf, headers: { 'Content-Type': mime } });

  async function rootFolder() {
    if (!(await alive(tok.rootId))) { const f = await mkFolder(ROOT_NAME); tok.rootId = f.id; tok.rootUrl = f.webViewLink; saveTok(); }
    return tok.rootId;
  }

  // Make sure folder tree exists for a series and push photos + sheet.
  async function syncSeries(sid) {
    const s = db.series.find((x) => x.id === sid);
    if (!s) return;
    const root = await rootFolder();
    const d = (s.drive = s.drive || {});
    if (!(await alive(d.folderId))) {
      const f = await mkFolder(s.name, root);
      Object.assign(d, { folderId: f.id, folderUrl: f.webViewLink, photosId: null, sheetId: null, sheetUrl: null });
      db.members.filter((m) => m.seriesId === sid && m.drive).forEach((m) => { m.drive = null; m.photoDirty = true; });
    }
    if (!(await alive(d.photosId))) {
      d.photosId = (await mkFolder('Artist Photos', d.folderId)).id;
      db.members.filter((m) => m.seriesId === sid && m.drive).forEach((m) => { m.drive = null; m.photoDirty = true; });
    }
    for (const m of db.members.filter((x) => x.seriesId === sid && x.type === 'artist' && x.photo)) {
      if (m.drive && !m.photoDirty) continue;
      const buf = fs.readFileSync(path.join(uploadDir, path.basename(m.photo)));
      const name = `${m.character}_${m.name}_${m.phone}.jpg`.replace(/[\\/:*?"<>|]/g, '-');
      let f;
      if (m.drive) { try { f = await updateFile(m.drive.fileId, 'image/jpeg', buf); } catch (x) { if (x.status !== 404) throw x; } }
      if (!f) f = await createFile({ name, parents: [d.photosId] }, 'image/jpeg', buf);
      m.drive = { fileId: f.id, url: f.webViewLink };
      m.photoDirty = false;
      save();
    }
    // Sheet is rebuilt from everything each time (as a native Google Sheet via CSV conversion).
    const data = Buffer.from(toCsv(buildRows(s)));
    if (await alive(d.sheetId)) await updateFile(d.sheetId, 'text/csv', data);
    else {
      const f = await createFile({ name: `${s.name} – Cast & Crew`, mimeType: SHEET, parents: [d.folderId] }, 'text/csv', data);
      d.sheetId = f.id; d.sheetUrl = f.webViewLink;
    }
    save();
  }

  // Serialized queue so concurrent submissions never race.
  let chain = Promise.resolve();
  function enqueue(fn) {
    status.pending++;
    chain = chain.then(fn).then(() => { status.lastError = ''; status.lastSync = new Date().toISOString(); })
      .catch((x) => { status.lastError = x.message; console.error('Drive sync failed:', x.message); })
      .finally(() => { status.pending--; });
    return chain;
  }
  const syncSeriesLater = (sid) => { if (connected()) enqueue(() => syncSeries(sid)); };
  const syncAll = () => { if (connected()) db.series.forEach((s) => enqueue(() => syncSeries(s.id))); return chain; };

  return {
    configured, connected, authUrl, handleCallback, disconnect, syncSeriesLater, syncAll, redirectUri,
    info: (req) => ({ configured: configured(), connected: connected(), rootUrl: tok.rootUrl || null, redirectUri: redirectUri(req), ...status }),
  };
};
