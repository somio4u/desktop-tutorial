# Story Creator

Generates a story broken into illustrated scenes, then produces its
audiobook voiceover.

Pipeline: **Gemini** (story text + per-scene image prompts, as structured
JSON) → **Imagen** (one illustration per scene) → **ElevenLabs**
(text-to-speech, output as MP3 or raw PCM). Gemini and Imagen are called via
**Vertex AI** by default, authenticated with a service account JSON key.

The form has a **"Story generation agent"** switch: Vertex AI (default) or
your own Google API key / Anthropic (Claude) API key. Images still come from
this server's Vertex/Imagen setup and audio still from its ElevenLabs setup
regardless — the switch only affects the story-text step. A pasted key rides
along in that one `POST /api/stories` request, used in memory for that call
only; it's never written to disk, logged, or reused for a later request.

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
- `bgm_track` — cue-sheet **data only**: structured directives (mood,
  transitions, instrumentation, generative prompts) meant for an external
  music generator (Suno, Udio). Nothing in this repo calls those services.
  Never a single track for the whole runtime — see below.
- `sfx_track` (plus every line's `inline_sfx`) — **real**: actually
  synthesized via ElevenLabs' sound-generation endpoint, same as
  `voice_track`. See "Sound effects" below.
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

### Multi-act BGM structure

A single BGM track running the whole story causes auditory fatigue and
ignores the story's emotional arc, so `bgm_track` is never one block:
`src/clients/productionScriptClient.ts` computes 2 acts for a story ≤7.5
minutes, 3 for longer, with act boundaries at equal fractions of the runtime
and a fixed 15-second cross-fade window between consecutive acts — these
exact timings are dictated to Gemini (not left to chance), the same way the
visual track's 5-second grid is. Gemini only fills in each act's mood and a
Suno/Udio-ready `generative_prompt`, which the instruction requires to start
with `[Instrumental]` and include `no vocals` so the music stays out of the
narration's frequency range; a warning is raised if either constraint isn't
met. The `warnings` array also flags a wrong BGM block count.

### Sound effects (`src/production/sfxSynth.ts`) — actually generated, unlike BGM

Unlike BGM, SFX don't need an external tool: ElevenLabs has a dedicated
text-to-sound-effects endpoint (`POST /v1/sound-generation`,
`generateSoundEffect` in `elevenLabsClient.ts`), same API key/billing as
voice synthesis. Two kinds of cue, both actually synthesized:

- **Standalone `sfx_track` cues** — classified into exactly one layer, each
  with its own dB range the instruction enforces: `DIEGETIC_FOREGROUND`
  (spot/foley, -3 to -6dB), `DIEGETIC_BACKGROUND` (a continuous ambiance
  bed — crickets, crowd, wind — -14 to -18dB, `loop: true` and any
  `duration_seconds` since it's tiled from a shorter generated clip),
  `NON_DIEGETIC` (stingers).
- **Inline mid-dialogue cues** — when an action happens mid-line (glasses
  clinking right as a character says "cheers"), the instruction has Gemini
  place a `<SFX:TAG>` token directly inside that line's `script_content` at
  the point it happens, with a matching entry in the line's `inline_sfx`
  array (`{ tag, relative_offset_seconds, sfx_prompt, duration,
  volume_offset_db }`). `stripInlineSfxTags` (`src/production/inlineSfx.ts`)
  removes the token before the line ever reaches TTS, so ElevenLabs never
  reads it aloud; the cue's real placement is
  `line.start_time + relative_offset_seconds`.

Generate them with `npm run produce -- "..." --with-sfx` (implied by
`--bgm`, since the final mix always needs an SFX bed — silent if none were
generated) or `POST /api/production/:id/sfx`, which writes each clip plus a
`manifest.json` `/mix` reads back later. Individual failures (rate limit,
content policy) are skipped with a warning rather than failing the whole
track, same as scene illustrations elsewhere in this app.

### Mixing a master file (ffmpeg, requires the `ffmpeg` binary on PATH)

Once you've rendered `bgm_track`'s prompts into actual audio files yourself
(Suno, Udio, or anything else — one file per act, in order — SFX are
generated by this app, BGM still isn't), mix everything into one master
file:

```bash
npm run produce -- "..." --duration 10 --with-narration --with-sfx --bgm act1.mp3,act2.mp3,act3.mp3
# writes output/productions/production-<ts>-master.mp3
```

or via the API, after narration (and optionally `/sfx`) have been
synthesized: `POST /api/production/:id/mix` with
`{ "bgmFiles": ["/path/act1.mp3", ...] }` (paths readable by this server;
count must match `bgm_track`'s length) returns `{ id, masterUrl }`.

This runs the pipeline in `src/production/masterMix.ts`: each voice line is
delayed to its planned `start_time` and mixed into one continuous narration
track (`adelay` + `amix`); every SFX clip (standalone and inline) is placed
the same way into its own bed, looped ambiance clips tiled with
`-stream_loop` and trimmed to length; the BGM acts are cross-faded in
sequence (`acrossfade`, 15s) and sidechain-ducked under the narration
(`sidechaincompress`); and narration, SFX bed, and ducked BGM are blended
into the final file with narration and SFX at near-full presence and BGM
underneath (`amix` weights `1.0 / 0.85 / 0.5`) — the 3-layer mix (voice
foreground, SFX midground, BGM background) the design calls for. If
`ffmpeg` isn't installed, every entry point fails with a clear message
telling you to install it rather than a cryptic spawn error.

### AI-assisted line delivery (Voice Studio, opt-in)

The Dialogue tab's default delivery analysis is the fast text heuristic in
`src/casting/lineAnalyzer.ts`. Checking "Use Gemini to judge delivery" routes
that one line through `src/casting/geminiLineAnalyzer.ts` instead — an actual
Vertex Gemini call that reads the line and picks an emotion/pace, at the cost
of a network round trip per line. Same idea via the API: pass `"useAI": true`
to `POST /api/casting/lines/analyze` (ignored if an explicit `emotion` is
also given — that always wins).

## BYOK Studio (`public/studio.html`) — bring your own API keys

A separate, fully client-side page for people who'd rather manage their own
API keys than rely on this server's `.env` credentials. Click **Settings**
to paste a Google API key (Gemini for story/script, Imagen for images), an
Anthropic API key (Claude, alternative for story/script), and/or an
ElevenLabs API key (voice). Keys are saved to this browser's `localStorage`
only.

**Every generation call goes straight from the browser to the provider —
Google, Anthropic, or ElevenLabs — never through this app's server.** The
only backend call this page makes is `GET /api/voices`, which just serves
the static roster in `src/data/voices.ts` (no external API, no secrets). PDF
export needs no key at all — it's assembled entirely client-side (jsPDF)
from the current story text and any generated images.

This is a real, sanctioned pattern (Anthropic's API supports it explicitly
via an `anthropic-dangerous-direct-browser-access` header; Google and
ElevenLabs' key-based REST endpoints are already browser-callable), but it
means the pasted keys are visible to anyone with access to that browser —
devtools, browser extensions, a shared machine. **Personal, local use only;
don't deploy this page somewhere other people can open it with your keys
still in local storage.**

This page is independent of the server-side pipelines above (`/api/stories`,
Voice Studio, `/api/production/*`) — it doesn't share their casting roster
resolution, structured scene/story schema, or safeguards (e.g. no
hallucinated-voice-ID protection, since there's no server-side resolver in
this flow). It's a simpler, single-story/single-image/single-line tool by
design.
