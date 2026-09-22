import { synthesizeSpeech } from '../clients/elevenLabsClient.js';
import type { CastingManager } from './castingManager.js';
import { calculateVoiceSettings } from './voiceSettings.js';

export interface ScriptLine {
  speaker: string;
  text: string;
  emotion?: string;
}

export async function synthesizeScriptLine(line: ScriptLine, casting: CastingManager): Promise<Buffer> {
  const voiceId = casting.getVoiceIdForActor(line.speaker);
  const voiceSettings = calculateVoiceSettings(line.speaker, line.emotion ?? 'neutral');
  return synthesizeSpeech(line.text, { voiceId, voiceSettings, outputFormat: 'mp3_44100_128' });
}

export async function synthesizeScript(lines: ScriptLine[], casting: CastingManager): Promise<Buffer[]> {
  const buffers: Buffer[] = [];
  for (const line of lines) {
    buffers.push(await synthesizeScriptLine(line, casting));
  }
  return buffers;
}
