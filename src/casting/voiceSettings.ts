import type { Pace } from './lineAnalyzer.js';

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  speed?: number;
}

const HIGH_INTENSITY = new Set(['angry', 'shouting', 'panicked', 'crying']);
const UPBEAT = new Set(['joyful', 'excited', 'laughing']);
const SUBDUED = new Set(['sad', 'whispering', 'frail']);

// ElevenLabs' speed range is roughly 0.7-1.2; map pace to it.
const SPEED_BY_PACE: Record<Pace, number> = { slow: 0.85, normal: 1.0, fast: 1.15 };

// Lower stability = more expressive/variable delivery; higher = more
// consistent/monotone. Tuned per emotion so lines don't all sound flat.
export function calculateVoiceSettings(speaker: string, emotion: string, pace: Pace = 'normal'): VoiceSettings {
  const speed = SPEED_BY_PACE[pace];

  if (speaker.toLowerCase() === 'narrator') {
    return { stability: 0.7, similarityBoost: 0.8, speed };
  }
  if (HIGH_INTENSITY.has(emotion)) return { stability: 0.35, similarityBoost: 0.7, speed };
  if (UPBEAT.has(emotion)) return { stability: 0.45, similarityBoost: 0.75, speed };
  if (SUBDUED.has(emotion)) return { stability: 0.6, similarityBoost: 0.8, speed };
  return { stability: 0.5, similarityBoost: 0.75, speed };
}
