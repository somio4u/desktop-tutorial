import { generateSoundEffect } from '../clients/elevenLabsClient.js';
import { parseTimestamp } from './masterMix.js';
import type { ProductionScript } from './types.js';

export interface PlacedSfxClip {
  id: string;
  label: string;
  buffer: Buffer;
  startSeconds: number;
  volumeDb: number;
  loop: boolean;
  targetDurationSeconds: number;
}

// "-4dB" / "-4 dB" / "-4" -> -4. Falls back to 0 (unity) if unparsable
// rather than failing the whole track over one bad string.
function parseDb(mixGain: string): number {
  const match = mixGain.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

async function synthesizeOne(id: string, label: string, prompt: string, durationSeconds: number): Promise<Buffer | null> {
  try {
    return await generateSoundEffect(prompt, { durationSeconds });
  } catch (err) {
    console.warn(`Skipping SFX "${label}" (${id}): ${(err as Error).message}`);
    return null;
  }
}

// Generates every standalone sfx_track cue plus every inline mid-dialogue
// cue across voice_track, computing each one's absolute placement in the
// story's timeline. Individual failures are skipped with a warning rather
// than failing the whole track, same as scene illustrations elsewhere.
export async function synthesizeSfxTrack(script: ProductionScript): Promise<PlacedSfxClip[]> {
  const clips: PlacedSfxClip[] = [];

  for (const cue of script.sfx_track) {
    const buffer = await synthesizeOne(cue.sfx_id, cue.sound_name, cue.generative_prompt, cue.duration_seconds);
    if (!buffer) continue;
    clips.push({
      id: cue.sfx_id,
      label: cue.sound_name,
      buffer,
      startSeconds: parseTimestamp(cue.timestamp),
      volumeDb: parseDb(cue.mix_gain),
      loop: cue.loop,
      targetDurationSeconds: cue.duration_seconds,
    });
  }

  for (const line of script.voice_track) {
    for (const cue of line.inline_sfx ?? []) {
      const id = `line${line.index}-${cue.tag.replace(/[^a-zA-Z0-9]/g, '')}`;
      const buffer = await synthesizeOne(id, cue.tag, cue.sfx_prompt, cue.duration);
      if (!buffer) continue;
      clips.push({
        id,
        label: cue.tag,
        buffer,
        startSeconds: parseTimestamp(line.start_time) + cue.relative_offset_seconds,
        volumeDb: cue.volume_offset_db,
        loop: false,
        targetDurationSeconds: cue.duration,
      });
    }
  }

  return clips;
}
