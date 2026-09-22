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
  sync_sfx_trigger?: string | null;
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

export type SfxLayer = 'DIEGETIC_FOREGROUND' | 'DIEGETIC_BACKGROUND' | 'NON_DIEGETIC';

export interface SfxTrackEntry {
  sfx_id: string;
  timestamp: string;
  type: SfxLayer;
  sound_name: string;
  mix_gain: string;
  generative_prompt: string;
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
