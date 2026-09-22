import { VOICES } from '../data/voices.js';
import { config } from '../config.js';
import { getAccessToken, vertexUrl } from './googleAuth.js';
import type { ProductionScript } from '../production/types.js';

export interface GenerateProductionScriptInput {
  premise: string;
  durationMinutes: number;
  genre?: string;
  language?: string;
}

export interface GenerateProductionScriptResult {
  script: ProductionScript;
  warnings: string[];
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

const CHARACTER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    name: { type: 'STRING' },
    voice_name: { type: 'STRING' },
    voice_id: { type: 'STRING' },
    visual_token: { type: 'STRING' },
  },
  required: ['id', 'name', 'voice_name', 'voice_id', 'visual_token'],
};

const ENVIRONMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    name: { type: 'STRING' },
    visual_description: { type: 'STRING' },
    ambient_audio_bed: { type: 'STRING' },
  },
  required: ['id', 'name', 'visual_description', 'ambient_audio_bed'],
};

const PROP_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    name: { type: 'STRING' },
    visual_description: { type: 'STRING' },
  },
  required: ['id', 'name', 'visual_description'],
};

const VOICE_TRACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    index: { type: 'INTEGER' },
    start_time: { type: 'STRING' },
    end_time: { type: 'STRING' },
    speaker: { type: 'STRING' },
    voice_id: { type: 'STRING' },
    pacing_wps: { type: 'NUMBER' },
    emotion: { type: 'STRING' },
    elevenlabs_settings: {
      type: 'OBJECT',
      properties: {
        stability: { type: 'NUMBER' },
        similarity_boost: { type: 'NUMBER' },
      },
      required: ['stability', 'similarity_boost'],
    },
    script_content: { type: 'STRING' },
    sync_sfx_trigger: { type: 'STRING' },
  },
  required: ['index', 'start_time', 'end_time', 'speaker', 'voice_id', 'pacing_wps', 'emotion', 'elevenlabs_settings', 'script_content'],
};

const BGM_TRACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    block_id: { type: 'STRING' },
    start_time: { type: 'STRING' },
    end_time: { type: 'STRING' },
    mood: { type: 'STRING' },
    transition_in: { type: 'STRING' },
    transition_out: { type: 'STRING' },
    duck_under_dialogue: { type: 'BOOLEAN' },
    generative_prompt: { type: 'STRING' },
  },
  required: ['block_id', 'start_time', 'end_time', 'mood', 'transition_in', 'transition_out', 'duck_under_dialogue', 'generative_prompt'],
};

const SFX_TRACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sfx_id: { type: 'STRING' },
    timestamp: { type: 'STRING' },
    type: { type: 'STRING', enum: ['DIEGETIC_FOREGROUND', 'DIEGETIC_BACKGROUND', 'NON_DIEGETIC'] },
    sound_name: { type: 'STRING' },
    mix_gain: { type: 'STRING' },
    generative_prompt: { type: 'STRING' },
  },
  required: ['sfx_id', 'timestamp', 'type', 'sound_name', 'mix_gain', 'generative_prompt'],
};

const VISUAL_TRACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    interval_index: { type: 'INTEGER' },
    start_time: { type: 'STRING' },
    end_time: { type: 'STRING' },
    scene_env_ref: { type: 'STRING' },
    characters_present: { type: 'ARRAY', items: { type: 'STRING' } },
    camera_shot: { type: 'STRING' },
    image_generation_prompt: { type: 'STRING' },
  },
  required: ['interval_index', 'start_time', 'end_time', 'scene_env_ref', 'characters_present', 'camera_shot', 'image_generation_prompt'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    metadata: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        total_duration: { type: 'STRING' },
        language: { type: 'STRING' },
        genre: { type: 'STRING' },
      },
      required: ['title', 'total_duration', 'language', 'genre'],
    },
    asset_manifest: {
      type: 'OBJECT',
      properties: {
        characters: { type: 'ARRAY', items: CHARACTER_SCHEMA },
        environments: { type: 'ARRAY', items: ENVIRONMENT_SCHEMA },
        props: { type: 'ARRAY', items: PROP_SCHEMA },
      },
      required: ['characters', 'environments', 'props'],
    },
    voice_track: { type: 'ARRAY', items: VOICE_TRACK_SCHEMA },
    bgm_track: { type: 'ARRAY', items: BGM_TRACK_SCHEMA },
    sfx_track: { type: 'ARRAY', items: SFX_TRACK_SCHEMA },
    visual_track: { type: 'ARRAY', items: VISUAL_TRACK_SCHEMA },
  },
  required: ['metadata', 'asset_manifest', 'voice_track', 'bgm_track', 'sfx_track', 'visual_track'],
};

function formatRoster(): string {
  return VOICES.map(
    (v) => `- ${v.voiceName}: ${v.gender}, ${v.ageBracket} (${v.ageRange}), energy ${v.energy}, tone: ${v.baseTone} (${v.emotionalTone.join(', ')}), archetypes: ${v.archetypes.join(', ')}`,
  ).join('\n');
}

function buildInstruction(input: GenerateProductionScriptInput, intervalCount: number, totalSeconds: number): string {
  const totalDuration = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;

  return `You are an expert Audio Film Director, Sound Designer, Screenwriter, and Visual Continuity Supervisor. Turn the premise below into a production-grade, multi-track cue script for automated TTS (ElevenLabs), AI music generation (Suno/Udio), procedural SFX placement, and AI image generation (Midjourney/Flux/Kling).

PREMISE: ${input.premise}
GENRE: ${input.genre ?? 'unspecified — infer from the premise'}
LANGUAGE: ${input.language ?? 'English'}
TARGET DURATION: exactly ${totalDuration} (${totalSeconds} seconds)

TIMING & PACING STANDARD
- Narrator (expository/reflective): ~2.2 words/second.
- Character dialogue (conversational): ~2.5-2.8 words/second.
- Urgent/action/panic: ~3.0-3.4 words/second.
- Elderly/solemn/somber: ~1.8-2.0 words/second.
- Leave 0.3s between speaker turns, 0.8-1.2s for heavy dramatic beats.
- Use the pacing_wps value that matches each line's actual delivery style, and make start_time/end_time consistent with script_content's word count at that pace.
- voice_track timestamps must be contiguous and non-overlapping, covering the full ${totalDuration}.

BGM PROGRESSION
- bgm_track blocks must be contiguous and non-overlapping across the full runtime.
- transition_in/transition_out must be one of: FADE_IN_2S-style fade, CROSS_FADE_Ns, HARD_CUT, FADE_TO_SILENCE, SWELL_AND_DROP.
- generative_prompt must specify instrumentation, key, and tempo (e.g. "D minor, 72 BPM, violin tremolo, muted acoustic guitar").
- duck_under_dialogue: true when dialogue plays over this block.

SFX
- Every meaningful diegetic or non-diegetic sound gets an entry with an exact timestamp within the runtime.
- type is DIEGETIC_FOREGROUND, DIEGETIC_BACKGROUND, or NON_DIEGETIC.
- generative_prompt must be a concrete, literal sound description usable by a text-to-audio SFX generator.

VISUAL BEATS (critical — do not skip)
- Produce EXACTLY ${intervalCount} visual_track entries, one per 5-second interval, covering 00:00 to ${totalDuration} with no gaps and no overlaps.
- interval_index runs 1..${intervalCount}. start_time/end_time are MM:SS.
- Every image_generation_prompt MUST reference the same environment/character visual details every time they recur (continuity), and follow this shape: [Shot Type] + [Subject & action, with consistency tags matching visual_token] + [Environment tag matching visual_description] + [Lighting & color grade] + [Focal depth & camera angle] --ar 16:9.
- scene_env_ref and characters_present must reference ids from asset_manifest.

CASTING — IMPORTANT
Choose voice_name for every character ONLY from this exact roster (do not invent names). Set voice_id to the SAME string as voice_name for every character AND for every "Narrator" line's voice_id in voice_track — a separate system resolves the real ElevenLabs voice_id afterward, so do not invent one:
${formatRoster()}

Pick a distinct voice per named character; do not reuse a voice across two characters. The narrator is a separate role — pick a voice for it too and use "Narrator" (exactly that string) as its voice_track speaker.

Return only the JSON described by the response schema.`;
}

export async function generateProductionScript(input: GenerateProductionScriptInput): Promise<GenerateProductionScriptResult> {
  const totalSeconds = Math.round(input.durationMinutes * 60);
  const intervalCount = Math.round(totalSeconds / 5);
  const instruction = buildInstruction(input, intervalCount, totalSeconds);

  const url = vertexUrl(config.google.llmModel, 'generateContent');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instruction }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 32768,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini generateContent failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as GeminiGenerateContentResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Gemini response had no text output (may have hit maxOutputTokens — try a shorter duration)');
  }

  const script = JSON.parse(text) as ProductionScript;
  const warnings: string[] = [];
  if (script.visual_track.length !== intervalCount) {
    warnings.push(`Expected ${intervalCount} visual_track entries (one per 5s), got ${script.visual_track.length}.`);
  }

  return { script, warnings };
}
