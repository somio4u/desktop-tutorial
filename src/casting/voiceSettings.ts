export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
}

const HIGH_INTENSITY = new Set(['angry', 'shouting', 'panicked', 'crying']);
const UPBEAT = new Set(['joyful', 'excited', 'laughing']);
const SUBDUED = new Set(['sad', 'whispering', 'frail']);

// Lower stability = more expressive/variable delivery; higher = more
// consistent/monotone. Tuned per emotion so lines don't all sound flat.
export function calculateVoiceSettings(speaker: string, emotion: string): VoiceSettings {
  if (speaker.toLowerCase() === 'narrator') {
    return { stability: 0.7, similarityBoost: 0.8 };
  }
  if (HIGH_INTENSITY.has(emotion)) return { stability: 0.35, similarityBoost: 0.7 };
  if (UPBEAT.has(emotion)) return { stability: 0.45, similarityBoost: 0.75 };
  if (SUBDUED.has(emotion)) return { stability: 0.6, similarityBoost: 0.8 };
  return { stability: 0.5, similarityBoost: 0.75 };
}
