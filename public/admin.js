const $ = (i) => document.getElementById(i);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cfg = {};
const state = { tab: 'all', q: '' };

async function api(path, opts = {}) {
  const r = await fetch('/api/admin' + path, { ...opts, headers: { 'Content-Type': 'application/json' } });
  if (r.status === 401) { showLogin(); throw new Error('login'); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function showLogin() { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }
$('lf').onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('pw').value }) });
  if (r.ok) { $('login').classList.add('hidden'); route(); } else $('lerr').textContent = 'गलत password';
};
async function logout() { await fetch('/api/logout', { method: 'POST' }); showLogin(); }
const formLink = (s) => location.origin + '/s/' + s.slug;
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { prompt('Copy this link:', text); }
  if (btn) { const t = btn.textContent; btn.textContent = 'Copied ✔'; setTimeout(() => (btn.textContent = t), 1500); }
}

async function route() {
  try {
    cfg = await (await fetch('/api/config')).json();
    const m = /^#series=([a-f0-9]+)$/.exec(location.hash);
    $('app').classList.remove('hidden');
    m ? await seriesView(m[1]) : await home();
  } catch (e) { if (e.message !== 'login') $('app').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}
window.onhashchange = route;

function googleCard(g) {
  const flash = /google=connected/.test(location.hash) ? '<p style="color:var(--ok)">✔ Google Drive connect हो गया।</p>'
    : /google=error/.test(location.hash) ? '<p class="err">Google connect नहीं हो पाया, दोबारा कोशिश करें।</p>' : '';
  let body;
  if (!g.configured) {
    body = `<p class="mute">Google connect करने के लिए server पर <code>GOOGLE_CLIENT_ID</code> और <code>GOOGLE_CLIENT_SECRET</code> set करने होंगे (README में steps हैं)।
      Google Console में Redirect URI यह डालें:<br><code>${esc(g.redirectUri)}</code></p>`;
  } else if (!g.connected) {
    body = `<p class="mute">Connect करते ही आपके Drive में “Database of Series” folder बनेगा और हर series का data, sheet और photos वहीं save होंगे।</p>
      <a class="btn" href="/auth/google">🔗 Connect Google Drive</a>`;
  } else {
    body = `<div class="link"><span class="pill">✔ Connected</span>
      ${g.rootUrl ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(g.rootUrl)}">📁 Drive folder खोलें</a>` : ''}
      <button class="ghost" id="gsync">⟳ Sync now</button><button class="danger" id="gdis">Disconnect</button></div>
      <div class="mute" style="margin-top:8px">${g.pending ? 'Sync हो रहा है…' : g.lastSync ? 'Last sync: ' + new Date(g.lastSync).toLocaleString() : ''}</div>
      ${g.lastError ? `<div class="err">Drive error: ${esc(g.lastError)}</div>` : ''}`;
  }
  return `<div class="card" style="margin:14px 0"><b>☁ Google Drive Backup</b>${flash}${body}</div>`;
}

async function home() {
  const [list, g] = await Promise.all([api('/series'), api('/google')]);
  $('app').innerHTML = `
    <div class="top"><h1>🎬 My Web Series</h1><button class="ghost" id="lo">Logout</button></div>
    ${googleCard(g)}
    <div class="card" style="margin:14px 0"><form id="nf" class="bar" style="margin:0">
      <input id="nn" placeholder="नई web series का नाम" maxlength="100">
      <button>+ Add Series</button></form><div class="err" id="ne"></div></div>
    ${list.length ? '' : '<p class="mute">अभी कोई series नहीं है। ऊपर से पहली series बनाएँ।</p>'}
    <div class="grid">${list.map((s) => `
      <div class="card series-card" data-id="${s.id}">
        <h3>${esc(s.name)}</h3><div class="mute">${new Date(s.createdAt).toLocaleDateString()}</div>
        <div class="stats"><span class="pill">👥 Crew ${s.crew}</span><span class="pill">🎭 Artists ${s.artists}</span></div>
      </div>`).join('')}</div>`;
  $('lo').onclick = logout;
  if ($('gsync')) $('gsync').onclick = async () => { await api('/google/sync', { method: 'POST' }); setTimeout(route, 2500); };
  if ($('gdis')) $('gdis').onclick = async () => { if (confirm('Google Drive disconnect करें? (Drive में पड़ा data वैसे ही रहेगा)')) { await api('/google/disconnect', { method: 'POST' }); route(); } };
  document.querySelectorAll('.series-card').forEach((c) => (c.onclick = () => (location.hash = 'series=' + c.dataset.id)));
  $('nf').onsubmit = async (e) => {
    e.preventDefault();
    try { const s = await api('/series', { method: 'POST', body: JSON.stringify({ name: $('nn').value }) }); location.hash = 'series=' + s.id; }
    catch (x) { $('ne').textContent = x.message; }
  };
}

async function seriesView(sid) {
  const s = await api('/series/' + sid);
  const all = s.members;
  const label = (k) => cfg[k] ? cfg[k].label : k;
  const tabs = [['all', 'All'], ...Object.entries(cfg).map(([k, d]) => [k, d.label]), ['artist', 'Artists']];
  const count = (k) => all.filter((m) => k === 'all' || (k === 'artist' ? m.type === 'artist' : m.department === k)).length;
  const q = state.q.toLowerCase();
  const shown = all.filter((m) => (state.tab === 'all' || (state.tab === 'artist' ? m.type === 'artist' : m.department === state.tab)) &&
    (!q || [m.name, m.phone, m.designation, m.character].some((v) => String(v || '').toLowerCase().includes(q))));
  const crew = shown.filter((m) => m.type === 'crew');
  const artists = shown.filter((m) => m.type === 'artist');

  $('app').innerHTML = `
    <div class="top noprint"><button class="ghost" id="back">← सभी Series</button><button class="ghost" id="lo">Logout</button></div>
    <h1>${esc(s.name)}</h1>
    <div class="card noprint"><div class="mute" style="margin-bottom:8px">इस series का form link (cast &amp; crew को भेजें):</div>
      <div class="link"><code>${esc(formLink(s))}</code>
      <button id="cp">Copy link</button>
      <a class="btn ghost" target="_blank" href="${esc(formLink(s))}">Open</a>
      <a class="btn ghost" href="/api/admin/series/${s.id}/export.xlsx">⬇ Excel</a>
      <a class="btn ghost" href="/api/admin/series/${s.id}/export.csv">⬇ CSV</a>
      <button class="ghost" onclick="print()">🖨 Print</button></div>
      ${s.drive && s.drive.folderUrl ? `<div class="link" style="margin-top:10px"><span class="mute">Google Drive:</span>
        <a target="_blank" rel="noopener" href="${esc(s.drive.folderUrl)}">📁 Series folder</a>
        ${s.drive.sheetUrl ? `<a target="_blank" rel="noopener" href="${esc(s.drive.sheetUrl)}">📊 Google Sheet</a>` : ''}</div>` : ''}</div>
    <div class="bar noprint"><div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${state.tab === k ? 'on' : ''}">${esc(l)} (${count(k)})</button>`).join('')}</div></div>
    <div class="bar noprint"><input id="q" placeholder="🔍 नाम / phone / role / character खोजें" value="${esc(state.q)}"></div>
    ${!shown.length ? '<p class="mute">अभी कोई entry नहीं है।</p>' : ''}
    ${crew.length ? `<h2>Crew (${crew.length})</h2><div class="card tbl"><table><thead><tr><th>Name</th><th>Department</th><th>Designation</th><th>Phone</th><th class="noprint"></th></tr></thead><tbody>
      ${crew.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(label(m.department))}</td><td>${esc(m.designation)}</td>
      <td><a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></td><td class="noprint"><button class="danger" data-del="${m.id}">Delete</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    ${artists.length ? `<h2>Artists (${artists.length})</h2><div class="artists">
      ${artists.map((m) => `<div class="card artist">
        <img src="/uploads/${esc(m.photo)}" alt="${esc(m.name)}" data-zoom="/uploads/${esc(m.photo)}">
        <b>${esc(m.name)}</b><div>🎭 ${esc(m.character)}</div>
        <div class="mute">${esc(m.gender)} · ${esc(m.age)} yrs</div>
        <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>
        <button class="danger noprint" data-del="${m.id}">Delete</button></div>`).join('')}</div>` : ''}
    <div class="noprint" style="margin-top:50px"><button class="danger" id="delS">इस Series को delete करें</button></div>`;

  $('back').onclick = () => (location.hash = '');
  $('lo').onclick = logout;
  $('cp').onclick = (e) => copy(formLink(s), e.target);
  document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.t; seriesView(sid); }));
  $('q').oninput = (e) => { state.q = e.target.value; const p = e.target.selectionStart; seriesView(sid).then(() => { $('q').focus(); $('q').setSelectionRange(p, p); }); };
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (confirm('यह entry delete करें?')) { await api('/members/' + b.dataset.del, { method: 'DELETE' }); seriesView(sid); }
  }));
  document.querySelectorAll('[data-zoom]').forEach((i) => (i.onclick = () => window.open(i.dataset.zoom, '_blank')));
  $('delS').onclick = async () => {
    if (confirm(`"${s.name}" और उसका पूरा data (${all.length} entries) हमेशा के लिए delete होगा। पक्का?`)) { await api('/series/' + sid, { method: 'DELETE' }); location.hash = ''; }
  };
}

(async () => { try { await api('/me'); route(); } catch {} })();
