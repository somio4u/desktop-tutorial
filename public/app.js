const form = document.getElementById('story-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const audioPlayer = document.getElementById('audio-player');
const audioDownload = document.getElementById('audio-download');
const scenesEl = document.getElementById('scenes');
const storyTextEl = document.getElementById('story-text');

function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultEl.hidden = true;
  submitBtn.disabled = true;
  setStatus('Generating story, illustrations, and narration… this can take a minute.');

  const outputFormat = document.getElementById('outputFormat').value;
  const body = {
    prompt: document.getElementById('prompt').value,
    genre: document.getElementById('genre').value || undefined,
    voiceId: document.getElementById('voiceId').value || undefined,
    outputFormat,
  };

  try {
    const res = await fetch('/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

    renderResult(data, outputFormat);
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

function renderResult(data, outputFormat) {
  const isPlayable = outputFormat.startsWith('mp3');

  audioPlayer.hidden = !isPlayable;
  audioDownload.hidden = isPlayable;
  if (isPlayable) {
    audioPlayer.src = data.audioUrl;
  } else {
    audioDownload.href = data.audioUrl;
    audioDownload.textContent = `Download raw PCM audio (${outputFormat})`;
  }

  scenesEl.innerHTML = '';
  for (const scene of data.scenes) {
    const card = document.createElement('div');
    card.className = 'scene-card';

    if (scene.imageUrl) {
      const img = document.createElement('img');
      img.src = scene.imageUrl;
      img.alt = scene.imagePrompt;
      card.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'no-image';
      placeholder.textContent = 'Illustration unavailable';
      card.appendChild(placeholder);
    }

    const text = document.createElement('p');
    text.textContent = scene.text;
    card.appendChild(text);

    scenesEl.appendChild(card);
  }

  storyTextEl.textContent = data.storyText;
  resultEl.hidden = false;
}
