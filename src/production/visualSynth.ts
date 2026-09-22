import { generateImage } from '../clients/imagenClient.js';
import type { ProductionScript, VisualTrackEntry } from './types.js';

export interface PlacedFrame {
  index: number;
  startSeconds: number;
  endSeconds: number;
  buffer: Buffer;
}

// 16:9 to match the visual_track prompts' --ar 16:9 requirement.
async function synthesizeOne(entry: VisualTrackEntry): Promise<Buffer | null> {
  try {
    return await generateImage(entry.image_generation_prompt, { aspectRatio: '16:9' });
  } catch (err) {
    console.warn(`Skipping visual frame ${entry.interval_index}: ${(err as Error).message}`);
    return null;
  }
}

// "MM:SS" -> seconds. Local copy to avoid pulling in masterMix.ts (ffmpeg)
// from a module that only needs Imagen.
function parseTimestamp(ts: string): number {
  return ts
    .split(':')
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
}

// Generates one image per visual_track interval (a 10-minute story is 120 of
// these — this is why it's an explicit, opt-in step rather than automatic).
// A failed interval is skipped with a warning rather than failing the batch.
export async function synthesizeVisualFrames(script: ProductionScript): Promise<PlacedFrame[]> {
  const frames: PlacedFrame[] = [];
  for (const entry of script.visual_track) {
    const buffer = await synthesizeOne(entry);
    if (!buffer) continue;
    frames.push({
      index: entry.interval_index,
      startSeconds: parseTimestamp(entry.start_time),
      endSeconds: parseTimestamp(entry.end_time),
      buffer,
    });
  }
  return frames;
}
