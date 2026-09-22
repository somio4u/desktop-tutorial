// Everything in this file calls Google/Anthropic/ElevenLabs directly from
// the browser using keys the user pastes into Settings. Nothing here is
// sent to this app's own server except the static voice roster (GET
// /api/voices), which holds no external API calls or secrets.

const STORAGE_KEY = 'story-creator.apiKeys';
const GOOGLE_TEXT_MODEL = 'gemini-2.5-flash';
const GOOGLE_IMAGE_MODEL = 'imagen-3.0-generate-002';
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const statusEl = document.getElementById('status');
function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

// ---------------- Key storage ----------------
function loadKeys() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveKeys(keys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function clearKeys() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------- Settings modal ----------------
const modal = document.getElementById('settings-modal');

function openSettings() {
  const keys = loadKeys();
  document.getElementById('key-google').value = keys.google || '';
  document.getElementById('key-anthropic').value = keys.anthropic || '';
  document.getElementById('key-elevenlabs').value = keys.elevenlabs || '';
  document.getElementById('default-provider').value = keys.storyProvider || 'google';
  modal.showModal();
}

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('close-settings-btn').addEventListener('click', () => modal.close());

document.querySelectorAll('.toggle-visibility').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'show' : 'hide';
  });
});

document.getElementById('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveKeys({
    google: document.getElementById('key-google').value.trim(),
    anthropic: document.getElementById('key-anthropic').value.trim(),
    elevenlabs: document.getElementById('key-elevenlabs').value.trim(),
    storyProvider: document.getElementById('default-provider').value,
  });
  document.getElementById('story-provider').value = loadKeys().storyProvider || 'google';
  modal.close();
  setStatus('Keys saved to this browser.');
});

document.getElementById('clear-keys-btn').addEventListener('click', () => {
  clearKeys();
  document.getElementById('settings-form').reset();
  setStatus('Keys cleared.');
});

function requireKey(provider) {
  const keys = loadKeys();
  const key = keys[provider];
  if (!key) {
    throw new Error(`No ${provider} API key set. Click Settings and paste one first.`);
  }
  return key;
}

// ---------------- Provider calls ----------------
async function generateStoryGoogle(prompt) {
  const apiKey = requireKey('google');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_TEXT_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Google API error (${res.status})`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Google API returned no text.');
  return text;
}

async function generateStoryAnthropic(prompt) {
  const apiKey = requireKey('anthropic');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required to allow this request directly from a browser page.
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Anthropic API error (${res.status})`);
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Anthropic API returned no text.');
  return text;
}

async function generateImageGoogle(prompt) {
  const apiKey = requireKey('google');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_IMAGE_MODEL}:predict?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Google Imagen error (${res.status})`);
  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) throw new Error('Google Imagen returned no image data.');
  return `data:image/png;base64,${base64}`;
}

async function generateVoiceElevenLabs(text, voiceId) {
  const apiKey = requireKey('elevenlabs');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs error (${res.status}): ${errText}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---------------- Story section ----------------
document.getElementById('story-provider').value = loadKeys().storyProvider || 'google';

document.getElementById('generate-story-btn').addEventListener('click', async () => {
  const prompt = document.getElementById('story-prompt').value.trim();
  if (!prompt) return setStatus('Enter a prompt first.', true);
  const provider = document.getElementById('story-provider').value;

  setStatus(`Generating story via ${provider}...`);
  try {
    const text = provider === 'anthropic' ? await generateStoryAnthropic(prompt) : await generateStoryGoogle(prompt);
    document.getElementById('story-text').value = text;
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  }
});

// ---------------- Image section ----------------
const generatedImages = [];

function renderGallery() {
  const gallery = document.getElementById('image-gallery');
  gallery.innerHTML = '';
  generatedImages.forEach((img, i) => {
    const figure = document.createElement('figure');
    figure.innerHTML = `<img src="${img.dataUrl}" alt="${img.prompt}" />
      <figcaption>${img.prompt}</figcaption>`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      generatedImages.splice(i, 1);
      renderGallery();
    });
    figure.appendChild(removeBtn);
    gallery.appendChild(figure);
  });
}

document.getElementById('generate-image-btn').addEventListener('click', async () => {
  const prompt = document.getElementById('image-prompt').value.trim();
  if (!prompt) return setStatus('Enter an image prompt first.', true);

  setStatus('Generating image via Google Imagen...');
  try {
    const dataUrl = await generateImageGoogle(prompt);
    generatedImages.push({ prompt, dataUrl });
    renderGallery();
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  }
});

// ---------------- Voice section ----------------
async function loadVoiceOptions() {
  try {
    const res = await fetch('/api/voices');
    const { voices } = await res.json();
    const select = document.getElementById('voice-select');
    select.innerHTML =
      voices.map((v) => `<option value="${v.voiceId ?? ''}">${v.voiceName} (${v.gender}, ${v.ageBracket})</option>`).join('') +
      '<option value="__custom__">Custom voice ID...</option>';
  } catch {
    // /api/voices unreachable — leave the select empty; the custom-ID field still works.
  }
}
loadVoiceOptions();

document.getElementById('voice-select').addEventListener('change', (e) => {
  document.getElementById('voice-custom-wrap').hidden = e.target.value !== '__custom__';
});

document.getElementById('use-story-text-btn').addEventListener('click', () => {
  document.getElementById('voice-text').value = document.getElementById('story-text').value;
});

document.getElementById('generate-voice-btn').addEventListener('click', async () => {
  const text = document.getElementById('voice-text').value.trim();
  if (!text) return setStatus('Enter text to speak first.', true);

  const select = document.getElementById('voice-select');
  const voiceId = select.value === '__custom__' ? document.getElementById('voice-custom-id').value.trim() : select.value;
  if (!voiceId) return setStatus('Pick a voice or enter a custom voice ID.', true);

  setStatus('Generating audio via ElevenLabs...');
  try {
    const audioUrl = await generateVoiceElevenLabs(text, voiceId);
    const audio = document.getElementById('voice-audio');
    audio.src = audioUrl;
    audio.hidden = false;
    audio.play();
    const download = document.getElementById('voice-download');
    download.href = audioUrl;
    download.hidden = false;
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  }
});

// ---------------- PDF export ----------------
document.getElementById('export-pdf-btn').addEventListener('click', () => {
  const storyText = document.getElementById('story-text').value.trim();
  if (!storyText && generatedImages.length === 0) {
    return setStatus('Nothing to export yet — generate a story or an image first.', true);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const usableWidth = pageWidth - margin * 2;

  if (storyText) {
    const lines = doc.splitTextToSize(storyText, usableWidth);
    let y = margin;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.getHeight();
    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
  }

  for (const img of generatedImages) {
    doc.addPage();
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(img.prompt, usableWidth), margin, margin);
    doc.addImage(img.dataUrl, 'PNG', margin, margin + 12, usableWidth, usableWidth);
  }

  doc.save('story.pdf');
});
