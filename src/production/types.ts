// Mirrors the "Standard JSON Schema Deliverable" exactly, field names
// included, since this is meant as an interchange format for external
// tools (Suno/Udio, Midjourney/Flux/Kling), not just internal use.

export interface ProductionMetadata {
  title: string;
  total_duration: string;
  language: string;
  genre: string;
}

export interface CharacterAsset {
  id: string;
  name: string;
  voice_name: string;
  voice_id: string;
  visual_token: string;
}

export interface EnvironmentAsset {
  id: string;
  name: string;
  visual_description: string;
  ambient_audio_bed: string;
}

export interface PropAsset {
  id: string;
  name: string;
  visual_description: string;
}

export interface AssetManifest {
  characters: CharacterAsset[];
  environments: EnvironmentAsset[];
  props: PropAsset[];
}

export interface ElevenLabsLineSettings {
  stability: number;
  similarity_boost: number;
}

// A sound cued to trigger mid-line (e.g. glasses clinking right as a
// character says "cheers"). script_content carries a matching <SFX:tag>
// token at the point in the text where it happens; that token is stripped
// before the line is sent to TTS (see production/inlineSfx.ts) and used
// here only to place the generated sound effect at
// (line's start_time + relative_offset_seconds).
export interface InlineSfxCue {
  tag: string;
  relative_offset_seconds: number;
  sfx_prompt: string;
  duration: number;
  volume_offset_db: number;
}

export interface VoiceTrackEntry {
  index: number;
  start_time: string;
  end_time: string;
  speaker: string;
  voice_id: string;
  pacing_wps: number;
  emotion: string;
  elevenlabs_settings: ElevenLabsLineSettings;
  script_content: string;
  inline_sfx: InlineSfxCue[];
}

export interface BgmTrackEntry {
  block_id: string;
  start_time: string;
  end_time: string;
  mood: string;
  transition_in: string;
  transition_out: string;
  duck_under_dialogue: boolean;
  generative_prompt: string;
}

// DIEGETIC_FOREGROUND = spot/foley SFX (synced to a physical action),
// DIEGETIC_BACKGROUND = continuous ambiance bed (crickets, crowd, wind),
// NON_DIEGETIC = dramatic stingers (risers, sub-bass drops).
export type SfxLayer = 'DIEGETIC_FOREGROUND' | 'DIEGETIC_BACKGROUND' | 'NON_DIEGETIC';

export interface SfxTrackEntry {
  sfx_id: string;
  timestamp: string;
  type: SfxLayer;
  sound_name: string;
  // dB string, e.g. "-4dB" — foreground/foley -3 to -6dB, background/ambiance
  // -14 to -18dB, non-diegetic stingers as the moment calls for.
  mix_gain: string;
  generative_prompt: string;
  // ElevenLabs sound-generation clamps a single call to 0.5-30s. For an
  // ambiance bed that needs to run longer than that, set loop: true and the
  // mixer tiles the generated clip to fill duration_seconds.
  duration_seconds: number;
  loop: boolean;
}

export interface VisualTrackEntry {
  interval_index: number;
  start_time: string;
  end_time: string;
  scene_env_ref: string;
  characters_present: string[];
  camera_shot: string;
  image_generation_prompt: string;
}

export interface ProductionScript {
  metadata: ProductionMetadata;
  asset_manifest: AssetManifest;
  voice_track: VoiceTrackEntry[];
  bgm_track: BgmTrackEntry[];
  sfx_track: SfxTrackEntry[];
  visual_track: VisualTrackEntry[];
}
