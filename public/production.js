const statusEl = document.getElementById('status');
function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function parseTimestamp(ts) {
  return ts
    .split(':')
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let currentId = null;
let currentScript = null;

// ---------------- Narrator select ----------------
async function loadVoices() {
  const { voices } = await api('/voices');
  document.getElementById('narrator').innerHTML = voices
    .map((v) => `<option value="${v.voiceName}" ${v.archetypes?.includes('main_audiobook_narrator') ? 'selected' : ''}>${v.voiceName} (${v.gender}, ${v.ageBracket})</option>`)
    .join('');
}
loadVoices().catch(() => setStatus('Could not load voice roster.', true));

// ---------------- Script generation ----------------
document.getElementById('script-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const generateBtn = document.getElementById('generate-btn');
  generateBtn.disabled = true;
  setStatus('Generating production script (this can take a minute for longer durations)...');

  try {
    const body = {
      premise: document.getElementById('premise').value,
      durationMinutes: Number(document.getElementById('duration').value),
      genre: document.getElementById('genre').value || undefined,
      narratorVoiceName: document.getElementById('narrator').value || undefined,
    };
    const { id, script, warnings } = await api('/production/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    currentId = id;
    currentScript = script;
    renderTimeline(script);
    document.getElementById('timeline-section').hidden = false;
    setStatus(warnings.length ? `Generated with warnings: ${warnings.join(' ')}` : 'Script generated.', warnings.length > 0);
    await refreshStatus();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    generateBtn.disabled = false;
  }
});

// ---------------- Timeline rendering ----------------
function makeBlock(className, leftPct, widthPct, label, title) {
  const el = document.createElement('div');
  el.className = `tl-block ${className}`;
  el.style.left = `${leftPct}%`;
  el.style.width = `${Math.max(widthPct, 0.6)}%`;
  el.textContent = label;
  el.title = title;
  return el;
}

function showDetail(html) {
  document.getElementById('detail-content').innerHTML = html;
  document.getElementById('detail-panel').hidden = false;
}
document.getElementById('close-detail-btn').addEventListener('click', () => {
  document.getElementById('detail-panel').hidden = true;
});

function renderTimeline(script) {
  const total = parseTimestamp(script.metadata.total_duration);
  document.getElementById('timeline-title').textContent = script.metadata.title || 'Timeline';
  document.getElementById('timeline-meta').textContent =
    `${script.metadata.total_duration} · ${script.metadata.genre} · ${script.voice_track.length} lines · ` +
    `${script.bgm_track.length} BGM acts · ${script.sfx_track.length + script.voice_track.flatMap((l) => l.inline_sfx).length} SFX cues`;

  // Ruler
  const ruler = document.getElementById('ruler');
  ruler.innerHTML = '';
  const tickCount = 8;
  for (let i = 0; i <= tickCount; i++) {
    const t = (total * i) / tickCount;
    const tick = document.createElement('span');
    tick.style.left = `${(i / tickCount) * 100}%`;
    tick.textContent = formatTime(t);
    ruler.appendChild(tick);
  }

  // Voice lane
  const voiceLane = document.getElementById('lane-voice');
  voiceLane.innerHTML = '';
  for (const line of script.voice_track) {
    const start = parseTimestamp(line.start_time);
    const end = parseTimestamp(line.end_time);
    const block = makeBlock('voice', (start / total) * 100, ((end - start) / total) * 100, line.speaker, `${line.speaker}: ${line.script_content}`);
    block.addEventListener('click', () =>
      showDetail(
        `<strong>${line.speaker}</strong> (${line.start_time}–${line.end_time})<br/>` +
          `<em>${line.emotion}, ${line.pacing_wps} wps</em><p>${line.script_content}</p>`,
      ),
    );
    voiceLane.appendChild(block);
  }

  // SFX lane (standalone + inline)
  const sfxLane = document.getElementById('lane-sfx');
  sfxLane.innerHTML = '';
  for (const cue of script.sfx_track) {
    const start = parseTimestamp(cue.timestamp);
    const block = makeBlock('sfx-standalone', (start / total) * 100, (cue.duration_seconds / total) * 100, cue.sound_name, cue.generative_prompt);
    block.addEventListener('click', () =>
      showDetail(`<strong>${cue.sound_name}</strong> (${cue.type})<br/><em>${cue.mix_gain}${cue.loop ? ', looped' : ''}</em><p>${cue.generative_prompt}</p>`),
    );
    sfxLane.appendChild(block);
  }
  for (const line of script.voice_track) {
    for (const cue of line.inline_sfx ?? []) {
      const start = parseTimestamp(line.start_time) + cue.relative_offset_seconds;
      const block = makeBlock('sfx-inline', (start / total) * 100, (cue.duration / total) * 100, cue.tag, cue.sfx_prompt);
      block.addEventListener('click', () =>
        showDetail(`<strong>${cue.tag}</strong> (inline, line ${line.index})<br/><em>${cue.volume_offset_db}dB</em><p>${cue.sfx_prompt}</p>`),
      );
      sfxLane.appendChild(block);
    }
  }

  // BGM lane
  renderBgmLane(script, total, {});
}

function renderBgmLane(script, total, bgmActsStatus) {
  const bgmLane = document.getElementById('lane-bgm');
  bgmLane.innerHTML = '';
  script.bgm_track.forEach((act, i) => {
    const start = parseTimestamp(act.start_time);
    const end = parseTimestamp(act.end_time);
    const uploaded = bgmActsStatus[i]?.uploaded;
    const block = makeBlock('bgm' + (uploaded ? '' : ' pending'), (start / total) * 100, ((end - start) / total) * 100, act.block_id, act.generative_prompt);
    block.textContent = '';

    const label = document.createElement('div');
    label.textContent = `${act.block_id}${uploaded ? ' ✓' : ''}`;
    block.appendChild(label);

    if (uploaded) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = `/api/production/${currentId}/bgm/${i}`;
      block.appendChild(audio);
    } else {
      const uploadWrap = document.createElement('div');
      uploadWrap.className = 'bgm-upload';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.addEventListener('change', () => uploadBgm(i, input.files[0]));
      uploadWrap.appendChild(input);
      block.appendChild(uploadWrap);
    }

    block.title = act.generative_prompt;
    bgmLane.appendChild(block);
  });
}

async function uploadBgm(actIndex, file) {
  if (!file) return;
  setStatus(`Uploading BGM for act ${actIndex}...`);
  try {
    const res = await fetch(`/api/production/${currentId}/bgm/${actIndex}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'audio/mpeg' },
      body: file,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    setStatus(`Uploaded BGM for act ${actIndex}.`);
    await refreshStatus();
  } catch (err) {
    setStatus(err.message, true);
  }
}

// ---------------- Status polling / generation actions ----------------
async function refreshStatus() {
  if (!currentId) return;
  const { script, status } = await api(`/production/${currentId}`);
  currentScript = script;
  const total = parseTimestamp(script.metadata.total_duration);

  const bgmActsStatus = {};
  for (const act of status.bgmActs) bgmActsStatus[act.index] = act;
  renderBgmLane(script, total, bgmActsStatus);

  document.getElementById('lane-voice').classList.toggle('generated', status.hasNarration);
  document.getElementById('lane-sfx').classList.toggle('generated', status.hasSfx);

  const allBgmUploaded = status.bgmActs.every((a) => a.uploaded);
  const mixBtn = document.getElementById('mix-btn');
  mixBtn.disabled = !(status.hasNarration && allBgmUploaded);
  mixBtn.textContent = allBgmUploaded
    ? '3. Mix master'
    : `3. Mix master (upload ${status.bgmActs.filter((a) => !a.uploaded).length} more BGM act(s))`;

  if (status.hasMaster) {
    document.getElementById('master-result').hidden = false;
    document.getElementById('master-audio').src = `/api/production/${currentId}/master?t=${Date.now()}`;
  }
}

document.getElementById('gen-narration-btn').addEventListener('click', async () => {
  setStatus('Synthesizing narration (ElevenLabs)...');
  try {
    const { lineCount } = await api(`/production/${currentId}/narration`, { method: 'POST' });
    setStatus(`Synthesized ${lineCount} narration line(s).`);
    await refreshStatus();
  } catch (err) {
    setStatus(err.message, true);
  }
});

document.getElementById('gen-sfx-btn').addEventListener('click', async () => {
  setStatus('Generating sound effects (ElevenLabs)...');
  try {
    const { generated, requested } = await api(`/production/${currentId}/sfx`, { method: 'POST' });
    setStatus(`Generated ${generated}/${requested} SFX clip(s).`);
    await refreshStatus();
  } catch (err) {
    setStatus(err.message, true);
  }
});

document.getElementById('mix-btn').addEventListener('click', async () => {
  setStatus('Mixing master audio (ffmpeg)...');
  try {
    await api(`/production/${currentId}/mix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setStatus('Master mix ready.');
    await refreshStatus();
  } catch (err) {
    setStatus(err.message, true);
  }
});
