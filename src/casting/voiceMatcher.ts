import { VOICES, type AgeBracket, type Gender, type VoiceProfile } from '../data/voices.js';

export interface CharacterProfile {
  name: string;
  // Optional: callers that only have free text (e.g. a visual description,
  // no structured demographics) can omit these and matching falls back to
  // tone/archetype keyword overlap alone.
  gender?: Gender;
  ageBracket?: AgeBracket;
  // Free text describing how the character talks/behaves, e.g. "fast-talking,
  // sarcastic" or "anxious, soft-spoken" — matched against each voice's
  // baseTone/emotionalTone/archetypes.
  style?: string;
  mood?: string;
  description?: string;
}

export interface ScoredVoice {
  voice: VoiceProfile;
  score: number;
}

const isNeutral = (gender: Gender) => gender === 'neutral_child';

function words(text: string | undefined): string[] {
  return (text ?? '').toLowerCase().match(/[a-z]+/g) ?? [];
}

function scoreVoice(voice: VoiceProfile, character: CharacterProfile): number {
  let score = 0;

  if (!character.gender) score += 10;
  else if (voice.gender === character.gender) score += 40;
  else if (isNeutral(voice.gender)) score += 25;

  if (!character.ageBracket) score += 10;
  else if (voice.ageBracket === character.ageBracket) score += 30;

  const characterWords = new Set([...words(character.style), ...words(character.mood), ...words(character.description)]);
  const voiceWords = new Set([voice.baseTone, ...voice.emotionalTone, ...voice.archetypes].flatMap((w) => words(w)));
  for (const word of characterWords) {
    if (voiceWords.has(word)) score += 8;
  }

  return score;
}

export interface SuggestOptions {
  exclude?: Iterable<string>;
  limit?: number;
}

// Ranks voices for a character, restricted to a "relevant category" (same
// gender, same age bracket) so overrides never offer a mismatched voice
// (e.g. a child voice for an adult character). Falls back to gender-only
// matching across age brackets if that category is empty (e.g. exhausted by
// banning), rather than returning nothing.
export function suggestVoices(character: CharacterProfile, options: SuggestOptions = {}): ScoredVoice[] {
  const excluded = new Set(options.exclude ?? []);
  const limit = options.limit ?? 5;

  const matchesGender = (v: VoiceProfile) => !character.gender || v.gender === character.gender || isNeutral(v.gender);
  const available = VOICES.filter((v) => !excluded.has(v.voiceName) && matchesGender(v));

  const sameAgeBracket = character.ageBracket ? available.filter((v) => v.ageBracket === character.ageBracket) : available;
  const pool = sameAgeBracket.length > 0 ? sameAgeBracket : available;

  return pool
    .map((voice) => ({ voice, score: scoreVoice(voice, character) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function suggestForNarrator(current: VoiceProfile, options: SuggestOptions = {}): ScoredVoice[] {
  return suggestVoices(
    { name: current.voiceName, gender: current.gender, ageBracket: current.ageBracket, mood: current.baseTone },
    options,
  );
}
