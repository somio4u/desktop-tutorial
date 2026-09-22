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
function parseTimestamp(ts: string): number {
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

// Cross-fades the BGM act files in sequence, ducks the result under the
// narration track (sidechain compression, per the -12dB/attack/release
// convention from the spec), and mixes the two into one master file.
export async function renderMasterAudio(narrationPath: string, bgmPaths: string[], outputPath: string): Promise<void> {
  if (bgmPaths.length < 1) {
    throw new Error('renderMasterAudio needs at least one BGM file.');
  }

  let bgmFilter: string;
  let bgmLabel: string;
  if (bgmPaths.length === 1) {
    bgmFilter = '';
    bgmLabel = '[1:a]';
  } else {
    const stages: string[] = [];
    let prevLabel = '[1:a]';
    for (let i = 1; i < bgmPaths.length; i++) {
      const nextInput = `[${i + 1}:a]`;
      const outLabel = i === bgmPaths.length - 1 ? '[bgm_full]' : `[bgm${i}]`;
      stages.push(`${prevLabel}${nextInput}acrossfade=d=${CROSSFADE_SECONDS}:c1=tri:c2=tri${outLabel}`);
      prevLabel = outLabel;
    }
    bgmFilter = stages.join(';') + ';';
    bgmLabel = '[bgm_full]';
  }

  const filterComplex =
    `${bgmFilter}` +
    `${bgmLabel}[0:a]sidechaincompress=threshold=0.03:ratio=8:attack=200:release=1000[ducked_bgm];` +
    `[0:a][ducked_bgm]amix=inputs=2:duration=first:dropout_transition=2[outa]`;

  const inputArgs = [narrationPath, ...bgmPaths].flatMap((p) => ['-i', p]);

  await runFfmpeg(['-y', ...inputArgs, '-filter_complex', filterComplex, '-map', '[outa]', '-b:a', '320k', outputPath]);
}
