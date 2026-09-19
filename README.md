# Story Creator

Generates a story, then produces its audiobook voiceover.

Pipeline: **Dify** (workflow app generates the story text) → **ElevenLabs**
(text-to-speech, output as MP3 or raw PCM).

## Setup

### 1. Dify

1. Create a **Workflow** app in Dify (self-hosted or cloud).
2. Add an input variable `prompt` (and optionally `genre`).
3. Add an output variable named `story` (the generated text).
4. Publish the app, then open **API Access** and copy the API key and base URL.

### 2. ElevenLabs

1. Get an API key from your ElevenLabs account.
2. Pick or create a voice and copy its voice ID.

### 3. Configure

```bash
cp .env.example .env
# fill in DIFY_API_KEY, DIFY_API_BASE_URL, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
npm install
```

## Usage

CLI (writes `output/story-<timestamp>.txt` and `.pcm`/`.mp3`):

```bash
npm run cli -- "A short bedtime story about a lighthouse keeper and a lost star"
```

API server:

```bash
npm run dev
# POST http://localhost:3000/api/stories
# body: { "prompt": "...", "genre": "fantasy", "outputFormat": "pcm_44100" }
# -> { id, storyText, outputFormat, audioUrl }
# GET  http://localhost:3000{audioUrl}  -> the audio file
```

`outputFormat` accepts `mp3_44100_128`, `pcm_16000`, `pcm_22050`, `pcm_24000`,
or `pcm_44100` (default). Raw PCM is headerless 16-bit signed little-endian
audio, ready to feed into further audio processing.

Long stories are automatically split into paragraph-sized chunks for
ElevenLabs (which caps request length) and the resulting audio is
concatenated back into one file.
