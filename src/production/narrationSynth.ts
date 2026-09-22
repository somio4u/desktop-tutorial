import { synthesizeSpeech } from '../clients/elevenLabsClient.js';
import { stripInlineSfxTags } from './inlineSfx.js';
import type { ProductionScript, VoiceTrackEntry } from './types.js';

// ElevenLabs' speed range is roughly 0.7-1.2. 2.6 wps is a natural
// conversational baseline (speed 1.0); scale relative to that and clamp.
function speedFromPacing(pacingWps: number): number {
  const speed = pacingWps / 2.6;
  return Math.round(Math.min(1.2, Math.max(0.7, speed)) * 100) / 100;
}

export interface SynthesizedLine {
  line: VoiceTrackEntry;
  audio: Buffer;
}

// Synthesizes each voice_track line individually. Note: ElevenLabs doesn't
// let you dictate an exact output duration, so the actual audio length can
// drift from the script's planned start_time/end_time — those are useful
// for pre-visualization and BGM/SFX/visual sync planning, not a guarantee.
export async function synthesizeNarration(script: ProductionScript): Promise<SynthesizedLine[]> {
  const results: SynthesizedLine[] = [];
  for (const line of script.voice_track) {
    const audio = await synthesizeSpeech(stripInlineSfxTags(line.script_content), {
      voiceId: line.voice_id,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: line.elevenlabs_settings.stability,
        similarityBoost: line.elevenlabs_settings.similarity_boost,
        speed: speedFromPacing(line.pacing_wps),
      },
    });
    results.push({ line, audio });
  }
  return results;
}
