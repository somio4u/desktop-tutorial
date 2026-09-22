import { VOICES, type VoiceProfile } from '../data/voices.js';
import { suggestForNarrator, suggestVoices, type CharacterProfile, type ScoredVoice } from './voiceMatcher.js';

export type { CharacterProfile } from './voiceMatcher.js';

export interface CharacterCasting {
  profile: CharacterProfile;
  voice: VoiceProfile;
}

// Picks a distinct voice per character (banning each one once cast) so no
// two speaking roles in the same project share a voice. Every assignment —
// narrator included — can be queried for ranked alternatives and reassigned.
export class CastingManager {
  private narratorVoice: VoiceProfile;
  private readonly bannedVoices = new Set<string>();
  private readonly characterProfiles = new Map<string, CharacterProfile>();
  private readonly characterAssignments = new Map<string, VoiceProfile>();

  constructor(narratorVoiceName: string) {
    this.narratorVoice = findVoiceOrThrow(narratorVoiceName, 'narrator');
    this.bannedVoices.add(this.narratorVoice.voiceName);
  }

  getNarratorVoice(): VoiceProfile {
    return this.narratorVoice;
  }

  getNarratorVoiceId(): string {
    return requireVoiceId(this.narratorVoice);
  }

  suggestNarratorAlternatives(limit = 5): ScoredVoice[] {
    const exclude = [...this.bannedVoices].filter((name) => name !== this.narratorVoice.voiceName);
    return suggestForNarrator(this.narratorVoice, { exclude, limit });
  }

  reassignNarrator(voiceName: string): VoiceProfile {
    const newVoice = findVoiceOrThrow(voiceName, 'narrator');
    this.ensureAvailable(newVoice, this.narratorVoice.voiceName);
    this.bannedVoices.delete(this.narratorVoice.voiceName);
    this.narratorVoice = newVoice;
    this.bannedVoices.add(newVoice.voiceName);
    return newVoice;
  }

  castCharacter(profile: CharacterProfile): VoiceProfile {
    this.characterProfiles.set(profile.name, profile);
    const [top] = suggestVoices(profile, { exclude: this.bannedVoices, limit: 1 });
    if (!top) {
      throw new Error(`Exhausted voice models for character ${profile.name}. Consider adding more voices.`);
    }
    this.assign(profile.name, top.voice);
    return top.voice;
  }

  suggestAlternatives(characterName: string, limit = 5): ScoredVoice[] {
    const profile = this.requireProfile(characterName);
    const current = this.characterAssignments.get(characterName);
    const exclude = [...this.bannedVoices].filter((name) => name !== current?.voiceName);
    return suggestVoices(profile, { exclude, limit });
  }

  reassignCharacter(characterName: string, voiceName: string): VoiceProfile {
    this.requireProfile(characterName);
    const newVoice = findVoiceOrThrow(voiceName, 'character');
    const current = this.characterAssignments.get(characterName);
    this.ensureAvailable(newVoice, current?.voiceName);
    if (current) this.bannedVoices.delete(current.voiceName);
    this.assign(characterName, newVoice);
    return newVoice;
  }

  getVoiceIdForActor(speakerName: string): string {
    if (speakerName.toLowerCase() === 'narrator') {
      return this.getNarratorVoiceId();
    }
    const assigned = this.characterAssignments.get(speakerName);
    if (!assigned) {
      throw new Error(`Actor '${speakerName}' has not been cast.`);
    }
    return requireVoiceId(assigned);
  }

  listCharacters(): CharacterCasting[] {
    return [...this.characterAssignments.entries()].map(([name, voice]) => ({
      profile: this.characterProfiles.get(name)!,
      voice,
    }));
  }

  getBannedVoices(): ReadonlySet<string> {
    return this.bannedVoices;
  }

  private assign(name: string, voice: VoiceProfile) {
    this.characterAssignments.set(name, voice);
    this.bannedVoices.add(voice.voiceName);
  }

  private requireProfile(characterName: string): CharacterProfile {
    const profile = this.characterProfiles.get(characterName);
    if (!profile) {
      throw new Error(`Unknown character: ${characterName}`);
    }
    return profile;
  }

  // A voice can be reassigned to its own current holder (no-op) but not to
  // a voice already banned by someone else.
  private ensureAvailable(voice: VoiceProfile, currentHolderVoiceName: string | undefined) {
    if (voice.voiceName !== currentHolderVoiceName && this.bannedVoices.has(voice.voiceName)) {
      throw new Error(`Voice "${voice.voiceName}" is already assigned to another role in this project.`);
    }
  }
}

function findVoiceOrThrow(voiceName: string, kind: 'narrator' | 'character'): VoiceProfile {
  const voice = VOICES.find((v) => v.voiceName === voiceName);
  if (!voice) {
    throw new Error(`Unknown ${kind} voice: ${voiceName}`);
  }
  return voice;
}

function requireVoiceId(voice: VoiceProfile): string {
  if (!voice.voiceId) {
    throw new Error(`Voice "${voice.voiceName}" has no voiceId set yet — add it in src/data/voices.ts.`);
  }
  return voice.voiceId;
}
