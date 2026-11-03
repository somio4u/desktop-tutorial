const slug = location.pathname.split('/').pop();
const $ = (i) => document.getElementById(i);
let type = 'crew', cfg = {}, selfie = '';

(async () => {
  const [sr, cr] = await Promise.all([fetch('/api/public/' + slug), fetch('/api/config')]);
  $('loading').classList.add('hidden');
  if (!sr.ok) return $('notfound').classList.remove('hidden');
  const s = await sr.json();
  cfg = await cr.json();
  $('title').textContent = s.name;
  document.title = s.name + ' – Registration';
  Object.entries(cfg).forEach(([k, d]) => $('dept').add(new Option(d.label, k)));
  $('main').classList.remove('hidden');
})();

function setType(t) {
  type = t;
  $('b-crew').classList.toggle('on', t === 'crew');
  $('b-artist').classList.toggle('on', t === 'artist');
  $('crew-fields').classList.toggle('hidden', t !== 'crew');
  $('artist-fields').classList.toggle('hidden', t !== 'artist');
  $('err').textContent = '';
}
$('b-crew').onclick = () => setType('crew');
$('b-artist').onclick = () => setType('artist');

$('dept').onchange = () => {
  const d = cfg[$('dept').value];
  $('role-wrap').classList.toggle('hidden', !d || !d.roles);
  $('role-text-wrap').classList.toggle('hidden', !d || !!d.roles);
  if (d && d.roles) {
    const r = $('role'); r.innerHTML = '<option value="">— चुनें —</option>';
    d.roles.forEach((x) => r.add(new Option(x, x)));
    if (d.roles.length === 1) r.value = d.roles[0];   // only one choice: pre-select it
  }
};

$('selfieBtn').onclick = () => $('selfie').click();
$('selfie').onchange = () => {
  const f = $('selfie').files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const max = 800, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    selfie = c.toDataURL('image/jpeg', 0.8);
    $('preview').src = selfie; $('preview').classList.remove('hidden');
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
};

$('another').onclick = () => {   // keep name + phone, clear everything entry-specific
  ['dept', 'role', 'roletext', 'character', 'age', 'gender'].forEach((i) => ($(i).value = ''));
  $('dept').onchange(); selfie = ''; $('selfie').value = ''; $('preview').classList.add('hidden');
  $('err').textContent = ''; $('submit').disabled = false;
  $('done').classList.add('hidden'); $('main').classList.remove('hidden');
};

$('f').onsubmit = async (e) => {
  e.preventDefault();
  const err = (m) => ($('err').textContent = m);
  err('');
  const body = { type, name: $('name').value, phone: $('phone').value };
  if (!body.name.trim()) return err('नाम लिखें');
  if (!/^\+?[0-9 \-]{8,16}$/.test(body.phone.trim())) return err('सही phone number डालें');
  if (type === 'crew') {
    body.department = $('dept').value;
    if (!body.department) return err('Department चुनें');
    body.designation = cfg[body.department].roles ? $('role').value : $('roletext').value;
    if (!body.designation.trim()) return err('Designation चुनें / लिखें');
  } else {
    Object.assign(body, { character: $('character').value, age: $('age').value, gender: $('gender').value, selfie });
    if (!body.character.trim()) return err('Character का नाम लिखें');
    if (!body.age) return err('Age डालें');
    if (!body.gender) return err('Gender चुनें');
    if (!selfie) return err('Selfie लें');
  }
  $('submit').disabled = true;
  try {
    const r = await fetch('/api/public/' + slug + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Error');
    $('doneMsg').textContent = j.duplicate ? 'यह entry पहले से जमा है (दोबारा नहीं जोड़ी)।' : 'आपकी entry save हो गई।';
    $('main').classList.add('hidden'); $('done').classList.remove('hidden');
  } catch (x) { err(x.message); $('submit').disabled = false; }
};
