/**
 * Series Cast & Crew platform — Google Apps Script version.
 * Data lives in YOUR Google Drive:
 *   Database of Series / <Series> / Artist Photos + "<Series> – Cast & Crew" (Google Sheet)
 *
 * SETUP: 1) change ADMIN_PASSWORD below  2) run setup() once  3) Deploy > New deployment > Web app
 *        (Execute as: Me, Who has access: Anyone)
 */
const ADMIN_PASSWORD = 'CHANGE-ME';   // <-- yahan apna password likhein (quotes ke andar)

const ROOT_NAME = 'Database of Series';
const DEPARTMENTS = {
  direction: { label: 'Direction', roles: ['Assistant Director', 'Associate Director'] },
  cinematography: { label: 'Cinematography', roles: ['Cameraman', 'Assistant Cameraman', 'Gimbal Operator', 'Camera Attendant', 'Light Boys'] },
  production: { label: 'Production', roles: null }, // free-text designation
  costume: { label: 'Costume and Makeup', roles: ['Costume Designer', 'Costume Assistant', 'Costume Man', 'Hairstylist', 'Makeup', 'Assistant Makeup'] },
};
const HEAD = ['ID', 'Type', 'Name', 'Department', 'Designation', 'Character', 'Age', 'Gender', 'Phone', 'Photo link', 'PhotoFileId', 'Added', 'Updated'];
const C = { ID: 0, TYPE: 1, NAME: 2, DEPT: 3, ROLE: 4, CHAR: 5, AGE: 6, GENDER: 7, PHONE: 8, LINK: 9, FILE: 10, ADDED: 11, UPDATED: 12 };
const MAX_ROWS = 2000;

// ---------------- web app entry ----------------
function doGet(e) {
  const slug = e && e.parameter && e.parameter.s;
  const meta = { viewport: 'width=device-width, initial-scale=1' };
  if (slug) {
    const s = seriesMeta_(slug);
    const t = HtmlService.createTemplateFromFile('form');
    t.data = json_({ found: !!s, name: s ? s.name : '', slug: slug, departments: DEPARTMENTS });
    return t.evaluate().setTitle(s ? s.name + ' – Registration' : 'Registration').addMetaTag('viewport', meta.viewport);
  }
  const t = HtmlService.createTemplateFromFile('admin');
  t.data = json_({ baseUrl: ScriptApp.getService().getUrl(), departments: DEPARTMENTS, passwordSet: ADMIN_PASSWORD !== 'CHANGE-ME' });
  return t.evaluate().setTitle('Series Dashboard').addMetaTag('viewport', meta.viewport);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function json_(o) { return JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

/** Run once from the editor: asks for permissions and creates the root Drive folder. */
function setup() {
  if (ADMIN_PASSWORD === 'CHANGE-ME') throw new Error('Pehle ADMIN_PASSWORD badlein (line 9).');
  const f = root_();
  Logger.log('Ready. Drive folder: ' + f.getUrl());
  return f.getUrl();
}

// ---------------- helpers ----------------
const clean_ = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 100);
const phoneOk_ = (p) => /^\+?[0-9 \-]{8,16}$/.test(p);
const slugify_ = (s) => clean_(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'series';

function root_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recreate */ } }
  const f = DriveApp.createFolder(ROOT_NAME);
  props.setProperty('ROOT_ID', f.getId());
  return f;
}
function seriesMeta_(slug) {
  if (!/^[a-z0-9-]{1,60}$/.test(String(slug))) return null;
  const p = PropertiesService.getScriptProperties().getProperty('S_' + slug);
  return p ? JSON.parse(p) : null;
}
function saveMeta_(s) { PropertiesService.getScriptProperties().setProperty('S_' + s.slug, JSON.stringify(s)); }
function sheet_(s) {
  try { return SpreadsheetApp.openById(s.sheetId).getSheets()[0]; }
  catch (e) { throw new Error('Is series ki Google Sheet nahi mili (Drive se delete ho gayi?)'); }
}
function members_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEAD.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[C.ID]), type: String(r[C.TYPE]), name: String(r[C.NAME]), department: String(r[C.DEPT]),
    designation: String(r[C.ROLE]), character: String(r[C.CHAR]), age: String(r[C.AGE]), gender: String(r[C.GENDER]),
    phone: String(r[C.PHONE]), link: String(r[C.LINK]), fileId: String(r[C.FILE]), added: String(r[C.ADDED]),
  }));
}
function publicMember_(m) {
  const d = DEPARTMENTS[m.department];
  return { id: m.id, type: m.type, name: m.name, department: m.department, departmentLabel: d ? d.label : '',
    designation: m.designation, character: m.character, age: m.age, gender: m.gender, phone: m.phone, link: m.link, hasPhoto: !!m.fileId, added: m.added };
}
function updateCounts_(s, list) {
  s.crew = list.filter((m) => m.type === 'crew').length;
  s.artists = list.filter((m) => m.type === 'artist').length;
  saveMeta_(s);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------------- public: form submission ----------------
function submitEntry(slug, body) {
  const s = seriesMeta_(slug);
  if (!s) throw new Error('Series nahi mili');
  body = body || {};
  const type = body.type === 'artist' ? 'artist' : 'crew';
  const name = clean_(body.name), phone = clean_(body.phone, 20);
  if (!name) throw new Error('नाम ज़रूरी है');
  if (!phoneOk_(phone)) throw new Error('सही phone number डालें');
  let dept = '', role = '', character = '', age = '', gender = '', photoBytes = null;
  if (type === 'crew') {
    const d = DEPARTMENTS[body.department];
    if (!d) throw new Error('Department चुनें');
    dept = body.department;
    if (d.roles) { if (d.roles.indexOf(body.designation) < 0) throw new Error('Designation चुनें'); role = body.designation; }
    else { role = clean_(body.designation); if (!role) throw new Error('Designation लिखें'); }
  } else {
    character = clean_(body.character);
    if (!character) throw new Error('Character का नाम लिखें');
    const a = parseInt(body.age, 10);
    if (!(a > 0 && a < 120)) throw new Error('सही Age डालें');
    age = String(a);
    if (['Male', 'Female', 'Other'].indexOf(body.gender) < 0) throw new Error('Gender चुनें');
    gender = body.gender;
    role = 'Artist';
    const b64 = String(body.selfie || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!b64) throw new Error('Selfie ज़रूरी है');
    if (b64.length > 4 * 1024 * 1024) throw new Error('Selfie बहुत बड़ी है');
    try { photoBytes = Utilities.base64Decode(b64); } catch (e) { throw new Error('Selfie सही नहीं है'); }
    if (!(photoBytes.length > 4 && photoBytes[0] === -1 && photoBytes[1] === -40)) throw new Error('Selfie सही नहीं है');
  }
  return withLock_(() => {
    const sh = sheet_(s);
    const list = members_(sh);
    if (list.length >= MAX_ROWS) throw new Error('Is series me entries ki limit poori ho gayi');
    const existing = list.filter((m) => m.type === type && m.phone === phone)[0];
    const now = new Date().toISOString();
    let fileId = existing ? existing.fileId : '', link = existing ? existing.link : '';
    if (photoBytes) {
      if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ } }
      const fname = (character + '_' + name + '_' + phone + '.jpg').replace(/[\\/:*?"<>|]/g, '-');
      const f = DriveApp.getFolderById(s.photosId).createFile(Utilities.newBlob(photoBytes, 'image/jpeg', fname));
      fileId = f.getId(); link = f.getUrl();
    }
    const row = [existing ? existing.id : Utilities.getUuid().replace(/-/g, '').slice(0, 12), type, name, dept, role, character, age, gender, phone, link, fileId,
      existing ? existing.added : now, existing ? now : ''];
    const r = existing ? existing.row : sh.getLastRow() + 1;
    // plain-text format first, so values like "=1+1" are never turned into formulas
    const range = sh.getRange(r, 1, 1, HEAD.length);
    range.setNumberFormat('@').setValues([row]);
    updateCounts_(s, members_(sh));
    return { ok: true, updated: !!existing };
  });
}

// ---------------- admin ----------------
function login(pw) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 10) throw new Error('बहुत कोशिशें हुईं, 15 मिनट बाद आज़माएँ');
  if (ADMIN_PASSWORD === 'CHANGE-ME') throw new Error('पहले Code.gs में ADMIN_PASSWORD बदलें');
  if (String(pw) !== ADMIN_PASSWORD) { cache.put('fails', String(fails + 1), 900); throw new Error('गलत password'); }
  cache.remove('fails');
  const tok = Utilities.getUuid() + Utilities.getUuid();
  cache.put('adm_' + tok, '1', 21600);
  return tok;
}
function auth_(token) {
  if (!token || !CacheService.getScriptCache().get('adm_' + token)) throw new Error('LOGIN');
}
function logout(token) { CacheService.getScriptCache().remove('adm_' + token); }
function checkToken(token) { auth_(token); return true; }

function listSeries(token) {
  auth_(token);
  const all = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all).filter((k) => k.indexOf('S_') === 0).map((k) => JSON.parse(all[k]))
    .sort((a, b) => (a.created < b.created ? 1 : -1));
}
function createSeries(token, name) {
  auth_(token);
  name = clean_(name);
  if (!name) throw new Error('Series का नाम लिखें');
  return withLock_(() => {
    const folder = root_().createFolder(name);
    const photos = folder.createFolder('Artist Photos');
    const ss = SpreadsheetApp.create(name + ' – Cast & Crew');
    const sh = ss.getSheets()[0];
    sh.setName('Cast & Crew');
    sh.getRange(1, 1, 1, HEAD.length).setNumberFormat('@').setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    const s = { slug: slugify_(name) + '-' + Utilities.getUuid().slice(0, 6), name: name, folderId: folder.getId(), photosId: photos.getId(),
      sheetId: ss.getId(), folderUrl: folder.getUrl(), sheetUrl: ss.getUrl(), crew: 0, artists: 0, created: new Date().toISOString() };
    saveMeta_(s);
    return s;
  });
}
function getSeries(token, slug) {
  auth_(token);
  const s = seriesMeta_(slug);
  if (!s) throw new Error('Series nahi mili');
  const list = members_(sheet_(s));
  return { series: s, members: list.map(publicMember_) };
}
/** Returns {memberId: dataUrl} for up to ~6 artists at a time (keeps responses small). */
function getPhotos(token, slug, ids) {
  auth_(token);
  const s = seriesMeta_(slug);
  if (!s) throw new Error('Series nahi mili');
  const want = {};
  (ids || []).slice(0, 8).forEach((i) => (want[String(i)] = 1));
  const out = {};
  members_(sheet_(s)).forEach((m) => {
    if (want[m.id] && m.fileId) {
      try { out[m.id] = 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(m.fileId).getBlob().getBytes()); } catch (e) { /* missing file */ }
    }
  });
  return out;
}
function deleteMember(token, slug, id) {
  auth_(token);
  const s = seriesMeta_(slug);
  if (!s) throw new Error('Series nahi mili');
  return withLock_(() => {
    const sh = sheet_(s);
    const m = members_(sh).filter((x) => x.id === String(id))[0];
    if (!m) throw new Error('Entry nahi mili');
    if (m.fileId) { try { DriveApp.getFileById(m.fileId).setTrashed(true); } catch (e) { /* ignore */ } }
    sh.deleteRow(m.row);
    updateCounts_(s, members_(sh));
    return true;
  });
}
/** Removes the series from the dashboard. The Drive folder/Sheet are kept (delete them in Drive if you want). */
function deleteSeries(token, slug) {
  auth_(token);
  if (!seriesMeta_(slug)) throw new Error('Series nahi mili');
  PropertiesService.getScriptProperties().deleteProperty('S_' + slug);
  return true;
}
function exportXlsx(token, slug) {
  auth_(token);
  const s = seriesMeta_(slug);
  if (!s) throw new Error('Series nahi mili');
  const res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + s.sheetId + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Excel export fail hua — Google Sheet me File > Download > Excel use karein');
  return { name: s.slug + '.xlsx', base64: Utilities.base64Encode(res.getContent()) };
}
