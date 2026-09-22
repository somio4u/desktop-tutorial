import { synthesizeSpeech } from '../clients/elevenLabsClient.js';
import type { CastingManager } from './castingManager.js';
import { analyzeLine, type Pace } from './lineAnalyzer.js';
import { calculateVoiceSettings } from './voiceSettings.js';

export interface ScriptLine {
  speaker: string;
  text: string;
  // Explicit emotion overrides the text-based heuristic in analyzeLine().
  emotion?: string;
}

export interface LineDelivery {
  emotion: string;
  pace: Pace;
}

// Explicit emotion wins; otherwise infer from the line's text.
export function resolveDelivery(line: ScriptLine): LineDelivery {
  if (line.emotion) {
    return { emotion: line.emotion, pace: analyzeLine(line.text).pace };
  }
  return analyzeLine(line.text);
}

export async function synthesizeScriptLine(line: ScriptLine, casting: CastingManager): Promise<Buffer> {
  const voiceId = casting.getVoiceIdForActor(line.speaker);
  const { emotion, pace } = resolveDelivery(line);
  const voiceSettings = calculateVoiceSettings(line.speaker, emotion, pace);
  return synthesizeSpeech(line.text, { voiceId, voiceSettings, outputFormat: 'mp3_44100_128' });
}

export async function synthesizeScript(lines: ScriptLine[], casting: CastingManager): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (const line of lines) {
    buffers.push(await synthesizeScriptLine(line, casting));
  }
  return buffers;
}
