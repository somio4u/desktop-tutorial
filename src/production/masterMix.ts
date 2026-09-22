import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SynthesizedLine } from './narrationSynth.js';

const CROSSFADE_SECONDS = 15;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('ffmpeg is not installed or not on PATH. Install it (e.g. `apt install ffmpeg` / `brew install ffmpeg`) and try again.'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}:\n${stderr}`));
    });
  });
}

// "MM:SS" or "HH:MM:SS" -> total seconds.
export function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Could not parse timestamp "${ts}"`);
  }
  return parts.reduceRight((acc, part, i) => acc + part * 60 ** (parts.length - 1 - i), 0);
}

// Writes each synthesized line to its own file, then uses ffmpeg to delay
// each one to its script-planned start_time and mix them into one
// continuous track spanning the story's full runtime. Real per-line audio
// duration can drift from the plan (see narrationSynth.ts), so lines may
// overlap slightly or leave small gaps — this places every line as close to
// its planned position as the plan allows, it doesn't reflow later lines.
export async function concatenateNarration(lines: SynthesizedLine[], workDir: string, outputPath: string): Promise<void> {
  await mkdir(workDir, { recursive: true });

  const linePaths: string[] = [];
  for (const { line, audio } of lines) {
    const filePath = path.join(workDir, `line-${String(line.index).padStart(3, '0')}.mp3`);
    await writeFile(filePath, audio);
    linePaths.push(filePath);
  }

  const inputArgs = linePaths.flatMap((p) => ['-i', p]);
  const delayed = lines.map((l, i) => `[${i}:a]adelay=${Math.round(parseTimestamp(l.line.start_time) * 1000)}:all=1[a${i}]`);
  const mixInputs = lines.map((_, i) => `[a${i}]`).join('');
  const filterComplex = [...delayed, `${mixInputs}amix=inputs=${lines.length}:duration=longest:normalize=0[out]`].join(';');

  await runFfmpeg([
    '-y',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[out]',
    '-b:a',
    '192k',
    outputPath,
  ]);
}

export interface SfxMixClip {
  filePath: string;
  startSeconds: number;
  volumeDb: number;
  // Looped clips are shorter than their target on-screen duration (ElevenLabs
  // sound-generation caps at 30s) and get tiled with ffmpeg's -stream_loop,
  // then cut back down to targetDurationSeconds.
  loop: boolean;
  targetDurationSeconds: number;
}

// Places every SFX clip (standalone ambiance/foley/stingers, plus every
// inline mid-dialogue cue) at its computed timestamp and mixes them into one
// continuous bed spanning the story's full runtime. Produces a silent track
// if there are no clips, so the final mix always has three well-formed
// inputs to work with.
export async function renderSfxTrack(clips: SfxMixClip[], totalDurationSeconds: number, outputPath: string): Promise<void> {
  if (clips.length === 0) {
    await runFfmpeg(['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${totalDurationSeconds}`, outputPath]);
    return;
  }

  const inputArgs = clips.flatMap((c) => (c.loop ? ['-stream_loop', '-1', '-i', c.filePath] : ['-i', c.filePath]));
  const chains = clips.map((c, i) => {
    const delayMs = Math.round(c.startSeconds * 1000);
    const trim = c.loop ? `atrim=duration=${c.targetDurationSeconds},` : '';
    return `[${i}:a]${trim}adelay=${delayMs}:all=1,volume=${c.volumeDb}dB[sfx${i}]`;
  });
  const mixInputs = clips.map((_, i) => `[sfx${i}]`).join('');
  const filterComplex = [...chains, `${mixInputs}amix=inputs=${clips.length}:normalize=0:duration=longest[out]`].join(';');

  await runFfmpeg(['-y', ...inputArgs, '-filter_complex', filterComplex, '-map', '[out]', '-b:a', '192k', outputPath]);
}

// Cross-fades the BGM act files in sequence, ducks the result under the
// narration track (sidechain compression), and blends narration + SFX bed +
// ducked BGM into the final master — narration and SFX at full/near-full
// presence, BGM well underneath, matching the 3-layer mix the SFX design
// calls for (voice foreground, SFX midground, BGM background).
export async function renderMasterAudio(narrationPath: string, sfxPath: string, bgmPaths: string[], outputPath: string): Promise<void> {
  if (bgmPaths.length < 1) {
    throw new Error('renderMasterAudio needs at least one BGM file.');
  }

  const BGM_INPUT_START = 2; // 0 = narration, 1 = sfx bed
  let bgmFilter = '';
  let bgmLabel = `[${BGM_INPUT_START}:a]`;
  if (bgmPaths.length > 1) {
    const stages: string[] = [];
    let prevLabel = bgmLabel;
    for (let i = 1; i < bgmPaths.length; i++) {
      const nextInput = `[${BGM_INPUT_START + i}:a]`;
      const outLabel = i === bgmPaths.length - 1 ? '[bgm_full]' : `[bgm${i}]`;
      stages.push(`${prevLabel}${nextInput}acrossfade=d=${CROSSFADE_SECONDS}:c1=tri:c2=tri${outLabel}`);
      prevLabel = outLabel;
    }
    bgmFilter = stages.join(';') + ';';
    bgmLabel = '[bgm_full]';
  }

  const filterComplex =
    `${bgmFilter}` +
    `${bgmLabel}[0:a]sidechaincompress=threshold=0.03:ratio=8:attack=150:release=800[ducked_bgm];` +
    `[0:a][1:a][ducked_bgm]amix=inputs=3:weights=1.0 0.85 0.5:duration=longest[outa]`;

  const inputArgs = [narrationPath, sfxPath, ...bgmPaths].flatMap((p) => ['-i', p]);

  await runFfmpeg(['-y', ...inputArgs, '-filter_complex', filterComplex, '-map', '[outa]', '-b:a', '320k', outputPath]);
}
