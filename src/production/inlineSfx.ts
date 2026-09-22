// Strips <SFX:TAG> markup out of dialogue text before it's sent to TTS —
// ElevenLabs would otherwise read the tag aloud.
export function stripInlineSfxTags(text: string): string {
  return text
    .replace(/<SFX:[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
