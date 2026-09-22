import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { produceScript } from './pipeline/productionPipeline.js';
import { synthesizeNarration } from './production/narrationSynth.js';
import { concatenateNarration, renderMasterAudio } from './production/masterMix.js';

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { premise: positional.join(' '), flags };
}

async function main() {
  const { premise, flags } = parseArgs(process.argv.slice(2));
  if (!premise) {
    console.error(
      'Usage: npm run produce -- "<premise>" [--duration 5] [--genre fantasy] [--lang English] ' +
        '[--narrator Raju] [--with-narration] [--bgm act1.mp3,act2.mp3[,act3.mp3]]',
    );
    process.exit(1);
  }

  const durationMinutes = Number(flags.duration ?? 5);
  console.log(`Generating a ${durationMinutes}-minute production script...`);

  const { script, warnings } = await produceScript({
    premise,
    durationMinutes,
    genre: typeof flags.genre === 'string' ? flags.genre : undefined,
    language: typeof flags.lang === 'string' ? flags.lang : undefined,
    narratorVoiceName: typeof flags.narrator === 'string' ? flags.narrator : undefined,
  });

  for (const warning of warnings) console.warn(`Warning: ${warning}`);

  const outDir = path.resolve('output', 'productions');
  await mkdir(outDir, { recursive: true });
  const base = path.join(outDir, `production-${Date.now()}`);
  await writeFile(`${base}.json`, JSON.stringify(script, null, 2));

  console.log(`Script: ${base}.json`);
  console.log(
    `  ${script.voice_track.length} voice lines, ${script.bgm_track.length} BGM blocks, ` +
      `${script.sfx_track.length} SFX cues, ${script.visual_track.length} visual intervals`,
  );

  if (!flags['with-narration']) {
    console.log('(pass --with-narration to also synthesize the voice track via ElevenLabs)');
    return;
  }

  console.log('Synthesizing narration audio (ElevenLabs)...');
  const lines = await synthesizeNarration(script);
  const voiceLinesDir = `${base}-voice-lines`;
  await mkdir(voiceLinesDir, { recursive: true });
  for (const { line, audio } of lines) {
    const fileName = path.join(voiceLinesDir, `${String(line.index).padStart(3, '0')}-${line.speaker.replace(/\s+/g, '_')}.mp3`);
    await writeFile(fileName, audio);
  }
  console.log(`Voice lines: ${voiceLinesDir}/`);

  const bgmFlag = flags.bgm;
  if (typeof bgmFlag !== 'string') {
    console.log('(pass --bgm act1.mp3,act2.mp3[,act3.mp3] — your own Suno/Udio renders of bgm_track\'s prompts — to mix a master file)');
    return;
  }

  const bgmPaths = bgmFlag.split(',').map((p) => p.trim());
  if (bgmPaths.length !== script.bgm_track.length) {
    console.error(`Expected ${script.bgm_track.length} BGM file(s) to match bgm_track (got ${bgmPaths.length}). Skipping mix.`);
    return;
  }

  console.log('Mixing master audio (ffmpeg: cross-fading BGM acts, ducking under narration)...');
  const narrationPath = `${base}-narration.mp3`;
  await concatenateNarration(lines, `${base}-mix-tmp`, narrationPath);
  const masterPath = `${base}-master.mp3`;
  await renderMasterAudio(narrationPath, bgmPaths, masterPath);
  console.log(`Master mix: ${masterPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
