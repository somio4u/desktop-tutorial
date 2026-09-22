export type Pace = 'slow' | 'normal' | 'fast';

export interface LineAnalysis {
  emotion: string;
  pace: Pace;
}

// Text-only heuristic (punctuation, capitalization, sentence length) — not
// true prosody/audio analysis. It's meant to give a reasonable default
// delivery per line without an extra LLM call; callers can always pass an
// explicit emotion to override it.
export function analyzeLine(text: string): LineAnalysis {
  const trimmed = text.trim();
  const exclamations = (trimmed.match(/!/g) ?? []).length;
  const questions = (trimmed.match(/\?/g) ?? []).length;
  const trailsOff = /\.\.\.\s*$/.test(trimmed) || /—\s*$/.test(trimmed);
  const shouting = /\b[A-Z]{3,}\b/.test(trimmed);

  const words = trimmed.split(/\s+/).filter(Boolean);
  const sentenceCount = Math.max(1, (trimmed.match(/[.!?]+/g) ?? []).length);
  const avgWordsPerSentence = words.length / sentenceCount;

  let emotion = 'neutral';
  let pace: Pace = 'normal';

  if (shouting || exclamations >= 3) {
    emotion = 'angry';
    pace = 'fast';
  } else if (exclamations >= 1) {
    emotion = 'excited';
    pace = 'fast';
  } else if (questions >= 1) {
    emotion = 'curious';
  } else if (trailsOff) {
    emotion = 'sad';
    pace = 'slow';
  } else if (avgWordsPerSentence <= 5) {
    pace = 'fast';
  } else if (avgWordsPerSentence >= 18) {
    pace = 'slow';
  }

  return { emotion, pace };
}
