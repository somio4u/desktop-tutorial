const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------- Tabs ----------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'dialogue') refreshSpeakerOptions();
  });
});

// ---------------- Voice list / narrator ----------------
let allVoices = [];

function voiceOptionRow(voice, { onSelect, selected } = {}) {
  const row = document.createElement('div');
  row.className = 'voice-option' + (selected ? ' selected' : '');
  const label = document.createElement('div');
  label.innerHTML = `<strong>${voice.voiceName}</strong> <span class="meta">${voice.gender} · ${voice.ageBracket} · ${voice.baseTone}${voice.score !== undefined ? ` · score ${voice.score}` : ''}</span>`;
  row.appendChild(label);
  if (onSelect && !selected) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Use this voice';
    btn.addEventListener('click', () => onSelect(voice.voiceName));
    row.appendChild(btn);
  }
  return row;
}

async function loadVoices() {
  const { voices } = await api('/voices');
  allVoices = voices;
  const select = document.getElementById('narrator-select');
  select.innerHTML = voices.map((v) => `<option value="${v.voiceName}">${v.voiceName} (${v.gender}, ${v.ageBracket})</option>`).join('');
}

async function refreshNarrator() {
  const { narrator, alternatives } = await api('/casting/narrator');
  const currentEl = document.getElementById('narrator-current');
  currentEl.hidden = false;
  currentEl.textContent = `Current narrator: ${narrator.voiceName} (${narrator.gender}, ${narrator.ageBracket}, ${narrator.baseTone})`;

  const altEl = document.getElementById('narrator-alternatives');
  altEl.hidden = false;
  altEl.innerHTML = '<h4>Change narrator voice</h4>';
  for (const alt of alternatives) {
    altEl.appendChild(
      voiceOptionRow(alt, {
        selected: alt.voiceName === narrator.voiceName,
        onSelect: async (voiceName) => {
          try {
            await api('/casting/narrator', { method: 'PUT', body: JSON.stringify({ voiceName }) });
            await refreshNarrator();
            setStatus('');
          } catch (err) {
            setStatus(err.message, true);
          }
        },
      }),
    );
  }
}

document.getElementById('set-narrator-btn').addEventListener('click', async () => {
  const voiceName = document.getElementById('narrator-select').value;
  try {
    await api('/casting/narrator', { method: 'POST', body: JSON.stringify({ voiceName }) });
    document.getElementById('character-list').innerHTML = '';
    await refreshNarrator();
    setStatus('Narrator set. Casting resets banned voices for a new project.');
  } catch (err) {
    setStatus(err.message, true);
  }
});

// ---------------- Characters ----------------
function renderCharacterCard(name, assigned, alternatives) {
  let card = document.getElementById(`character-${name}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'character-card';
    card.id = `character-${name}`;
    document.getElementById('character-list').appendChild(card);
  }
  card.innerHTML = `<h3>${name}</h3><p>Voice: <span class="voice-name">${assigned.voiceName}</span> <span class="meta">(${assigned.gender}, ${assigned.ageBracket}, ${assigned.baseTone})</span></p>`;

  const altWrap = document.createElement('div');
  altWrap.className = 'alternatives';
  altWrap.innerHTML = '<h4>Change voice (relevant options only)</h4>';
  for (const alt of alternatives) {
    altWrap.appendChild(
      voiceOptionRow(alt, {
        selected: alt.voiceName === assigned.voiceName,
        onSelect: async (voiceName) => {
          try {
            const result = await api(`/casting/characters/${encodeURIComponent(name)}/voice`, {
              method: 'PUT',
              body: JSON.stringify({ voiceName }),
            });
            const { alternatives: newAlts } = await api(`/casting/characters/${encodeURIComponent(name)}/suggestions`);
            renderCharacterCard(name, result.voice, newAlts);
            refreshSpeakerOptions();
            setStatus('');
          } catch (err) {
            setStatus(err.message, true);
          }
        },
      }),
    );
  }
  card.appendChild(altWrap);
}

document.getElementById('character-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('char-name').value.trim();
  const profile = {
    name,
    gender: document.getElementById('char-gender').value,
    ageBracket: document.getElementById('char-age').value,
    style: document.getElementById('char-style').value || undefined,
    mood: document.getElementById('char-mood').value || undefined,
    description: document.getElementById('char-description').value || undefined,
  };
  try {
    const result = await api('/casting/characters', { method: 'POST', body: JSON.stringify(profile) });
    renderCharacterCard(result.name, result.assigned, result.alternatives);
    refreshSpeakerOptions();
    document.getElementById('character-form').reset();
    document.getElementById('char-age').value = 'young_adult';
    setStatus(`Suggested ${result.assigned.voiceName} for ${result.name}.`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

// ---------------- Dialogue ----------------
async function refreshSpeakerOptions() {
  const select = document.getElementById('line-speaker');
  const previous = select.value;
  let characters = [];
  try {
    ({ characters } = await api('/casting/characters'));
  } catch {
    // no casting project started yet
  }
  const options = ['Narrator', ...characters.map((c) => c.profile.name)];
  select.innerHTML = options.map((name) => `<option value="${name}">${name}</option>`).join('');
  if (options.includes(previous)) select.value = previous;
}

let lastAnalyzedLine = null;

document.getElementById('line-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const speaker = document.getElementById('line-speaker').value;
  const text = document.getElementById('line-text').value;
  const emotion = document.getElementById('line-emotion').value || undefined;

  try {
    const { delivery, settings } = await api('/casting/lines/analyze', {
      method: 'POST',
      body: JSON.stringify({ speaker, text, emotion }),
    });
    lastAnalyzedLine = { speaker, text, emotion };

    const resultEl = document.getElementById('line-result');
    resultEl.hidden = false;
    document.getElementById('line-analysis').textContent =
      `Detected emotion: ${delivery.emotion} · pace: ${delivery.pace} ` +
      `(stability ${settings.stability}, similarity ${settings.similarityBoost}, speed ${settings.speed})`;

    const altWrap = document.getElementById('line-voice-alternatives');
    altWrap.innerHTML = '';
    if (speaker.toLowerCase() !== 'narrator') {
      altWrap.innerHTML = '<h4>Not happy with this character\'s voice? Change it here too</h4>';
      const { alternatives } = await api(`/casting/characters/${encodeURIComponent(speaker)}/suggestions`);
      for (const alt of alternatives) {
        altWrap.appendChild(
          voiceOptionRow(alt, {
            onSelect: async (voiceName) => {
              await api(`/casting/characters/${encodeURIComponent(speaker)}/voice`, {
                method: 'PUT',
                body: JSON.stringify({ voiceName }),
              });
              document.getElementById('line-form').requestSubmit();
            },
          }),
        );
      }
    }

    document.getElementById('synthesize-btn').disabled = false;
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
    document.getElementById('synthesize-btn').disabled = true;
  }
});

document.getElementById('synthesize-btn').addEventListener('click', async () => {
  if (!lastAnalyzedLine) return;
  setStatus('Generating audio…');
  try {
    const { audioUrl } = await api('/casting/lines/synthesize', {
      method: 'POST',
      body: JSON.stringify(lastAnalyzedLine),
    });
    const audio = document.getElementById('line-audio');
    audio.src = audioUrl;
    audio.hidden = false;
    audio.play();
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  }
});

loadVoices()
  .then(refreshNarrator)
  .catch(() => setStatus('No casting project yet — pick a narrator voice and click "Set narrator" to begin.'));
