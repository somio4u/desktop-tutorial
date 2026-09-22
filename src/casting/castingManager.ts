import { VOICES, type AgeBracket, type Gender, type VoiceProfile } from '../data/voices.js';

export interface CharacterRequirement {
  name: string;
  gender: Gender;
  ageBracket: AgeBracket;
  tone?: string;
}

const isNeutral = (gender: Gender) => gender === 'neutral_child';

// Picks a distinct voice per character (banning each one once cast) so no
// two speaking roles in the same project share a voice.
export class CastingManager {
  private readonly narratorVoice: VoiceProfile;
  private readonly bannedVoices = new Set<string>();
  private readonly characterAssignments = new Map<string, VoiceProfile>();

  constructor(narratorVoiceName: string) {
    const narrator = VOICES.find((v) => v.voiceName === narratorVoiceName);
    if (!narrator) {
      throw new Error(`Unknown narrator voice: ${narratorVoiceName}`);
    }
    this.narratorVoice = narrator;
    this.bannedVoices.add(narrator.voiceName);
  }

  getNarratorVoiceId(): string {
    return requireVoiceId(this.narratorVoice);
  }

  castCharacter(character: CharacterRequirement): VoiceProfile {
    const matchesGender = (v: VoiceProfile) => v.gender === character.gender || isNeutral(v.gender);

    let candidates = VOICES.filter(
      (v) => !this.bannedVoices.has(v.voiceName) && matchesGender(v) && v.ageBracket === character.ageBracket,
    );

    // Fallback: drop the age-bracket constraint if nothing's left.
    if (candidates.length === 0) {
      candidates = VOICES.filter((v) => !this.bannedVoices.has(v.voiceName) && matchesGender(v));
    }

    if (candidates.length === 0) {
      throw new Error(`Exhausted voice models for character ${character.name}. Consider adding more voices.`);
    }

    const toneMatch = character.tone ? candidates.find((v) => v.baseTone === character.tone) : undefined;
    const selected = toneMatch ?? candidates[0];

    this.characterAssignments.set(character.name, selected);
    this.bannedVoices.add(selected.voiceName);
    return selected;
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

  getAssignments(): ReadonlyMap<string, VoiceProfile> {
    return this.characterAssignments;
  }

  getBannedVoices(): ReadonlySet<string> {
    return this.bannedVoices;
  }
}

function requireVoiceId(voice: VoiceProfile): string {
  if (!voice.voiceId) {
    throw new Error(`Voice "${voice.voiceName}" has no voiceId set yet — add it in src/data/voices.ts.`);
  }
  return voice.voiceId;
}
