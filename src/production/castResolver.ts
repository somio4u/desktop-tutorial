import { VOICES, type VoiceProfile } from '../data/voices.js';
import { suggestVoices } from '../casting/voiceMatcher.js';
import type { ProductionScript } from './types.js';

export interface CastResolution {
  script: ProductionScript;
  warnings: string[];
}

export interface ResolveCastOptions {
  narratorVoiceName?: string;
}

const NARRATOR_SPEAKER = 'narrator';

// Never trusts a voice_id the model produced — always resolves it against
// our own verified roster by name, since an invented ID would only surface
// as a confusing 400/404 from ElevenLabs at synthesis time.
export function resolveCast(script: ProductionScript, options: ResolveCastOptions = {}): CastResolution {
  const warnings: string[] = [];
  const used = new Set<string>();

  const narratorVoice = VOICES.find((v) => v.voiceName === (options.narratorVoiceName ?? 'Raju'));
  if (!narratorVoice) {
    throw new Error(`Unknown narrator voice: ${options.narratorVoiceName}`);
  }
  used.add(narratorVoice.voiceName);

  const nameToVoice = new Map<string, VoiceProfile>();

  const resolvedCharacters = script.asset_manifest.characters.map((char) => {
    let voice = VOICES.find((v) => v.voiceName.toLowerCase() === char.voice_name.toLowerCase());
    if (voice && used.has(voice.voiceName)) {
      warnings.push(`"${voice.voiceName}" was assigned to more than one role; re-picking for "${char.name}".`);
      voice = undefined;
    }
    if (!voice) {
      const [top] = suggestVoices({ name: char.name, description: char.visual_token }, { exclude: used, limit: 1 });
      if (!top) {
        warnings.push(`Could not resolve a voice for "${char.name}" — roster exhausted, left unassigned.`);
        return char;
      }
      warnings.push(
        `voice_name "${char.voice_name}" for "${char.name}" isn't in the roster; matched to "${top.voice.voiceName}" instead.`,
      );
      voice = top.voice;
    }
    used.add(voice.voiceName);
    nameToVoice.set(char.name, voice);
    return { ...char, voice_name: voice.voiceName, voice_id: voice.voiceId ?? char.voice_id };
  });

  const resolvedVoiceTrack = script.voice_track.map((line) => {
    if (line.speaker.toLowerCase() === NARRATOR_SPEAKER) {
      return narratorVoice.voiceId ? { ...line, voice_id: narratorVoice.voiceId } : line;
    }
    const voice = nameToVoice.get(line.speaker);
    if (!voice) {
      warnings.push(`voice_track line ${line.index} has speaker "${line.speaker}" not found in asset_manifest.characters.`);
      return line;
    }
    return voice.voiceId ? { ...line, voice_id: voice.voiceId } : line;
  });

  const missingVoiceIds = [narratorVoice, ...nameToVoice.values()].filter((v) => !v.voiceId).map((v) => v.voiceName);
  if (missingVoiceIds.length > 0) {
    warnings.push(`These roster voices have no voiceId set in src/data/voices.ts yet: ${missingVoiceIds.join(', ')}.`);
  }

  return {
    script: {
      ...script,
      asset_manifest: { ...script.asset_manifest, characters: resolvedCharacters },
      voice_track: resolvedVoiceTrack,
    },
    warnings,
  };
}
