# Story Creator

Generates a story broken into illustrated scenes, then produces its
audiobook voiceover.

Pipeline: **Gemini** (story text + per-scene image prompts, as structured
JSON) → **Imagen** (one illustration per scene) → **ElevenLabs**
(text-to-speech, output as MP3 or raw PCM). Gemini and Imagen are called via
**Vertex AI**, authenticated with a service account JSON key.

## Setup

### 1. Vertex AI

1. In a Google Cloud project, enable the **Vertex AI API**.
2. Create a service account with the **Vertex AI User** role, and download a
   JSON key for it.
3. Save that key file somewhere outside version control (the repo's
   `.gitignore` already excludes `service-account*.json` as a safety net)
   and note its path, your project ID, and the region you want to call
   (e.g. `us-central1`).
4. Note: Imagen access may require billing to be enabled on the project.

### 2. ElevenLabs

1. Get an API key from your ElevenLabs account.
2. Pick or create a voice and copy its voice ID.

### 3. Configure

```bash
cp .env.example .env
# fill in GOOGLE_APPLICATION_CREDENTIALS (path to the service account JSON),
# GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION,
# ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
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

## Multi-character casting (`src/casting/`)

For dialogue-driven scripts (narrator + multiple speaking characters),
`CastingManager` (`src/casting/castingManager.ts`) auto-assigns each
character a distinct voice from `src/data/voices.ts`, matched by
gender/age-bracket/tone, and bans it from being reused by another character
in the same project (the narrator's voice is banned automatically). Each
line is then synthesized with emotion-tuned `stability`/`similarity_boost`
settings (`src/casting/voiceSettings.ts`).

This isn't wired into the main story pipeline yet (which narrates the whole
story in one voice) — it's a standalone module for scripts that already have
`{ speaker, text, emotion }` lines. Try it with the built-in demo:

```bash
npm run cast-demo
```

### Voice Studio UI (`public/casting.html`)

A browser UI for casting and dialogue, linked from the main page (`npm run dev`,
then open `/casting.html`):

- **Characters tab**: pick a narrator voice; add characters by name, gender,
  age bracket, and free-text style/mood/description. Each character gets an
  automatically suggested voice (`src/casting/voiceMatcher.ts` scores every
  voice in the roster by gender + age-bracket match plus keyword overlap
  between your style/mood/description text and the voice's tone/archetypes).
  A ranked list of alternatives — restricted to the same gender/age-bracket
  category, so you're never offered a mismatched voice — is shown for
  changing the pick; reassigning frees the old voice for other characters.
- **Dialogue tab**: pick a speaker (narrator or any cast character), write a
  line, and click Analyze. `src/casting/lineAnalyzer.ts` infers an
  emotion/pace from the line's own text (punctuation, capitalization,
  sentence length — a text heuristic, not real prosody analysis) unless you
  give an explicit emotion, then maps that to ElevenLabs `stability` /
  `similarity_boost` / `speed` settings. You can also swap that character's
  voice right from this tab, from the same relevant-category alternatives
  list, then re-analyze/generate. "Generate audio" synthesizes and plays
  that one line.

All 24 voices in `src/data/voices.ts` now have a `voiceId` filled in.
**Verify these against your own ElevenLabs "Voices" library before relying
on them in production.** 17 of the 24 match well-known ElevenLabs default
premade voices (reused here under different character names, which works
fine). The other 7 — `Aarav`, `Raju`, `Vikram`, `Aaditya K`, `Monika Sogam`,
`Shanti`, `Kavita M` — don't match any recognized default voice ID; they may
be real custom/cloned voices from a specific account, or they may not exist.
An invalid ID fails at synthesis time with a 400/404 from ElevenLabs, not
before, so check these 7 first if `cast-demo` or the main pipeline errors on
a specific character's line.

## Full production script (`src/production/`, `src/pipeline/productionPipeline.ts`)

A separate, heavier pipeline that turns a one-line premise into a full
multi-track production script — dialogue cue sheet, BGM progression, SFX cue
sheet, and a 5-second-interval visual beat sheet — as one JSON document (see
`src/production/types.ts` for the exact shape: `metadata`, `asset_manifest`,
`voice_track`, `bgm_track`, `sfx_track`, `visual_track`).

**What's real vs. what's a deliverable spec, not generated media:**
- `voice_track` — real: Gemini writes the dialogue/narration + per-line
  pacing/emotion, and `npm run produce -- "..." --with-narration` (or
  `POST /api/production/:id/narration`) actually synthesizes each line
  through ElevenLabs (`src/production/narrationSynth.ts`), mapping
  `pacing_wps` to ElevenLabs' `speed` setting. Note: ElevenLabs doesn't let
  you dictate an exact output duration, so real audio length can drift from
  the script's planned `start_time`/`end_time` — treat those as a
  pre-visualization/sync-planning aid, not a guarantee.
- `bgm_track` / `sfx_track` — cue-sheet **data only**: structured
  directives (mood, transitions, instrumentation, generative prompts) meant
  to be fed into an external music/SFX generator (Suno, Udio, a procedural
  SFX tool). Nothing in this repo calls those services; there's no
  integration for them.
- `visual_track` — one `image_generation_prompt` per 5-second interval
  (continuity-tagged against `asset_manifest`). These are prompts only; the
  pipeline doesn't batch-generate images for every interval (a 10-minute
  script is 120 of them — expensive and slow to do by default). You can feed
  any of these prompts through the existing `src/clients/imagenClient.ts` by
  hand if you want a specific one rendered.

**Casting is never trusted from the model.** Gemini is given the real
`src/data/voices.ts` roster by name and told to assign from it, but
`src/production/castResolver.ts` always re-resolves every `voice_id`
against that roster afterward (falling back to the same tone-matching engine
from Voice Studio if a name is invalid or duplicated) — so a hallucinated ID
never reaches ElevenLabs.

```bash
npm run produce -- "A lighthouse keeper finds a message in a bottle from the future" --duration 5 --genre mystery
# writes output/productions/production-<ts>.json
# add --with-narration to also synthesize the voice track (output/productions/production-<ts>-voice-lines/)
# --narrator <VoiceName> to pick who narrates (default: Raju)
```

Or via the API: `POST /api/production/script` with
`{ premise, durationMinutes, genre?, language?, narratorVoiceName? }` returns
`{ id, script, warnings }`; then `POST /api/production/:id/narration`
synthesizes and returns URLs for each line's audio.

Longer durations mean a much larger single JSON response (120 visual
intervals + dozens of dialogue lines for 10 minutes) — if Gemini's output
gets truncated by the token limit, `generateProductionScript` will report it
as a parse failure; the `warnings` array also flags if the visual track
didn't come back with exactly one entry per 5 seconds.
