# Story Creator

Generates a story broken into illustrated scenes, then produces its
audiobook voiceover.

Pipeline: **Gemini** (story text + per-scene image prompts, as structured
JSON) → **Imagen** (one illustration per scene) → **ElevenLabs**
(text-to-speech, output as MP3 or raw PCM).

## Setup

### 1. Google AI

1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Note: Imagen access may require billing to be enabled on the associated
   Google Cloud project, depending on your account tier.

### 2. ElevenLabs

1. Get an API key from your ElevenLabs account.
2. Pick or create a voice and copy its voice ID.

### 3. Configure

```bash
cp .env.example .env
# fill in GOOGLE_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
npm install
```

## Usage

CLI (writes `output/story-<timestamp>.txt`, `.pcm`/`.mp3`, `.scenes.json`,
and `.image-0.png`, `.image-1.png`, ... for each illustrated scene):

```bash
npm run cli -- "A short bedtime story about a lighthouse keeper and a lost star"
```

API server:

```bash
npm run dev
# POST http://localhost:3000/api/stories
# body: { "prompt": "...", "genre": "fantasy", "outputFormat": "pcm_44100" }
# -> { id, storyText, outputFormat, audioUrl, scenes: [{ text, imagePrompt, imageUrl }] }
# GET  http://localhost:3000{audioUrl}          -> the audio file
# GET  http://localhost:3000{scenes[i].imageUrl} -> illustration for scene i
```

`outputFormat` accepts `mp3_44100_128`, `pcm_16000`, `pcm_22050`, `pcm_24000`,
or `pcm_44100` (default). Raw PCM is headerless 16-bit signed little-endian
audio, ready to feed into further audio processing.

Long stories are automatically split into paragraph-sized chunks for
ElevenLabs (which caps request length) and the resulting audio is
concatenated back into one file. Gemini generates 3-6 scenes per story, each
with its own image prompt; if Imagen fails for a given scene (e.g. rate
limit, safety filter), that scene is returned with `image: null` / a `null`
`imageUrl` rather than failing the whole request.
