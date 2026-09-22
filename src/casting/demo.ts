import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { CastingManager, type CharacterProfile } from './castingManager.js';
import { synthesizeScriptLine, type ScriptLine } from './audiobookGenerator.js';

async function main() {
  // Monika Sogam narrates; she's automatically banned from character roles.
  const casting = new CastingManager('Monika Sogam');

  const charactersToCast: CharacterProfile[] = [
    { name: 'Bijay', gender: 'male', ageBracket: 'young_adult', mood: 'confident' },
    { name: 'Mamata', gender: 'female', ageBracket: 'young_adult', mood: 'joyful' },
    { name: 'Bada Bapa', gender: 'male', ageBracket: 'senior', mood: 'wise' },
    { name: 'Sarpanch', gender: 'male', ageBracket: 'adult', mood: 'commanding' },
  ];

  for (const character of charactersToCast) {
    const voice = casting.castCharacter(character);
    console.log(`Cast '${character.name}' -> ${voice.voiceName} (banned from other characters)`);

    const alternatives = casting.suggestAlternatives(character.name, 3);
    console.log(
      `  Alternatives if you want to change: ${alternatives.map((a) => `${a.voice.voiceName} (score ${a.score})`).join(', ')}`,
    );
  }

  console.log('\nBanned voices for this project:', [...casting.getBannedVoices()]);

  const sampleScript: ScriptLine[] = [
    { speaker: 'Narrator', text: 'ସକାଳର କଅଁଳ ଖରାରେ ଗାଁ ଦାଣ୍ଡଟି ଚଳଚଞ୍ଚଳ ହୋଇ ଉଠିଥିଲା।', emotion: 'neutral' },
    { speaker: 'Bijay', text: 'ମମତା! ଶୀଘ୍ର ଚାଲ, ଆମକୁ ଆଜି ସମୟ ପୂର୍ବରୁ ସେଠାରେ ପହଞ୍ଚିବାକୁ ହେବ!', emotion: 'joyful' },
    { speaker: 'Mamata', text: 'ମୁଁ ପ୍ରସ୍ତୁତ ଅଛି, କିନ୍ତୁ ବଡ଼ ବାପା ଆମ ସହିତ ଆସୁଛନ୍ତି ତ?', emotion: 'neutral' },
    { speaker: 'Bada Bapa', text: 'ହଁ ମାଆ, ମୁଁ ତୁମ ସହିତ ଅଛି। ଧୈର୍ଯ୍ୟ ରଖ।', emotion: 'sad' },
  ];

  if (!config.elevenLabs.apiKey) {
    console.log('\nELEVENLABS_API_KEY not set — skipping synthesis, casting-only demo complete.');
    return;
  }

  const outDir = path.resolve('output', 'casting-demo');
  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < sampleScript.length; i++) {
    const line = sampleScript[i];
    console.log(`Generating line for [${line.speaker}] (emotion: ${line.emotion})...`);
    const audio = await synthesizeScriptLine(line, casting);
    const file = path.join(outDir, `line-${i}-${line.speaker.replace(/\s+/g, '_')}.mp3`);
    await writeFile(file, audio);
    console.log(`Saved: ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
