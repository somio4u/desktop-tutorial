import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { produceScript, type ProduceScriptOptions } from './pipeline/productionPipeline.js';
import { concatenateNarration, parseTimestamp, renderMasterAudio, renderSfxTrack, type SfxMixClip } from './production/masterMix.js';
import { synthesizeNarration, type SynthesizedLine } from './production/narrationSynth.js';
import { synthesizeSfxTrack } from './production/sfxSynth.js';
import type { ProductionScript } from './production/types.js';
import { synthesizeVisualFrames } from './production/visualSynth.js';

interface SfxManifestEntry {
  id: string;
  fileName: string;
  startSeconds: number;
  volumeDb: number;
  loop: boolean;
  targetDurationSeconds: number;
}

const OUTPUT_DIR = path.resolve('output', 'productions');

export const productionRouter = Router();

async function fileExistsNonEmpty(p: string): Promise<boolean> {
  const files = await readdir(p).catch(() => [] as string[]);
  return files.length > 0;
}

// Full script plus what's been generated so far — the timeline UI polls
// this to know what to render (which voice lines/SFX clips/BGM acts exist,
// whether a master mix is ready) without re-deriving it client-side.
productionRouter.get('/production/:id', async (req, res) => {
  try {
    const projectDir = path.join(OUTPUT_DIR, req.params.id);
    const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
    const script = JSON.parse(raw) as ProductionScript;

    const bgmDir = path.join(projectDir, 'bgm');
    const bgmFiles = await readdir(bgmDir).catch(() => [] as string[]);
    const bgmActs = script.bgm_track.map((block, i) => {
      const fileName = bgmFiles.find((f) => f.startsWith(`act-${i}.`));
      return { index: i, blockId: block.block_id, uploaded: Boolean(fileName), fileName: fileName ?? null };
    });

    const masterExists = await readFile(path.join(projectDir, 'master.mp3'))
      .then(() => true)
      .catch(() => false);

    const frameFiles = await readdir(path.join(projectDir, 'visual-frames')).catch(() => [] as string[]);
    const visualFrames = script.visual_track.map((entry) => {
      const fileName = frameFiles.find((f) => f.startsWith(`${entry.interval_index}.`));
      return { index: entry.interval_index, generated: Boolean(fileName), fileName: fileName ?? null };
    });

    res.json({
      id: req.params.id,
      script,
      status: {
        hasNarration: await fileExistsNonEmpty(path.join(projectDir, 'voice-lines')),
        hasSfx: await fileExistsNonEmpty(path.join(projectDir, 'sfx-clips')),
        bgmActs,
        visualFrames,
        hasMaster: masterExists,
      },
    });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

productionRouter.post('/production/script', async (req, res) => {
  const body = req.body as Partial<ProduceScriptOptions>;
  if (!body.premise || !body.durationMinutes) {
    res.status(400).json({ error: 'premise and durationMinutes are required' });
    return;
  }
  try {
    const { script, warnings } = await produceScript(body as ProduceScriptOptions);
    const id = randomUUID();
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(path.join(OUTPUT_DIR, `${id}.json`), JSON.stringify(script, null, 2));
    res.json({ id, script, warnings });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

productionRouter.post('/production/:id/narration', async (req, res) => {
  try {
    const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
    const script = JSON.parse(raw) as ProductionScript;
    const lines = await synthesizeNarration(script);

    const dir = path.join(OUTPUT_DIR, req.params.id, 'voice-lines');
    await mkdir(dir, { recursive: true });
    const files: string[] = [];
    for (const { line, audio } of lines) {
      const fileName = `${String(line.index).padStart(3, '0')}-${line.speaker.replace(/\s+/g, '_')}.mp3`;
      await writeFile(path.join(dir, fileName), audio);
      files.push(fileName);
    }

    res.json({
      id: req.params.id,
      lineCount: files.length,
      audioUrls: files.map((f) => `/api/production/${req.params.id}/voice-lines/${f}`),
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

productionRouter.get('/production/:id/voice-lines/:file', async (req, res) => {
  const dir = path.join(OUTPUT_DIR, req.params.id, 'voice-lines');
  const files = await readdir(dir).catch(() => [] as string[]);
  if (!files.includes(req.params.file)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(dir, req.params.file));
});

// Generates every SFX clip (standalone sfx_track cues + every inline
// mid-dialogue cue across voice_track) via ElevenLabs sound-generation and
// saves a manifest alongside them so /mix can place them without
// re-deriving anything from the script.
productionRouter.post('/production/:id/sfx', async (req, res) => {
  try {
    const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
    const script = JSON.parse(raw) as ProductionScript;
    const clips = await synthesizeSfxTrack(script);

    const dir = path.join(OUTPUT_DIR, req.params.id, 'sfx-clips');
    await mkdir(dir, { recursive: true });
    const manifest: SfxManifestEntry[] = [];
    for (const clip of clips) {
      const fileName = `${clip.id}.mp3`;
      await writeFile(path.join(dir, fileName), clip.buffer);
      manifest.push({
        id: clip.id,
        fileName,
        startSeconds: clip.startSeconds,
        volumeDb: clip.volumeDb,
        loop: clip.loop,
        targetDurationSeconds: clip.targetDurationSeconds,
      });
    }
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const totalCues = script.sfx_track.length + script.voice_track.flatMap((l) => l.inline_sfx).length;
    res.json({
      id: req.params.id,
      generated: manifest.length,
      requested: totalCues,
      clipUrls: manifest.map((m) => `/api/production/${req.params.id}/sfx-clips/${m.fileName}`),
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

productionRouter.get('/production/:id/sfx-clips/:file', async (req, res) => {
  const dir = path.join(OUTPUT_DIR, req.params.id, 'sfx-clips');
  const files = await readdir(dir).catch(() => [] as string[]);
  if (!files.includes(req.params.file)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(dir, req.params.file));
});

// Generates one image per visual_track interval (Imagen) for the video
// timeline. Opt-in and explicit — a 10-minute story is 120 intervals, too
// expensive/slow to generate automatically. Failed intervals are skipped
// with a warning rather than failing the whole batch.
productionRouter.post('/production/:id/visuals', async (req, res) => {
  try {
    const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
    const script = JSON.parse(raw) as ProductionScript;
    const frames = await synthesizeVisualFrames(script);

    const dir = path.join(OUTPUT_DIR, req.params.id, 'visual-frames');
    await mkdir(dir, { recursive: true });
    const frameUrls: string[] = [];
    for (const frame of frames) {
      const fileName = `${frame.index}.png`;
      await writeFile(path.join(dir, fileName), frame.buffer);
      frameUrls.push(`/api/production/${req.params.id}/visual-frames/${fileName}`);
    }

    res.json({ id: req.params.id, generated: frames.length, requested: script.visual_track.length, frameUrls });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

productionRouter.get('/production/:id/visual-frames/:file', async (req, res) => {
  const dir = path.join(OUTPUT_DIR, req.params.id, 'visual-frames');
  const files = await readdir(dir).catch(() => [] as string[]);
  if (!files.includes(req.params.file)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(dir, req.params.file));
});

const AUDIO_EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
};

// Uploads a Suno/Udio render for one BGM act — this app never generates BGM
// itself, so the timeline UI's BGM lane is an upload slot per act, not a
// generate button. Body is the raw audio file; the browser sets
// Content-Type to the file's real MIME type.
productionRouter.post(
  '/production/:id/bgm/:actIndex',
  express.raw({ type: 'audio/*', limit: '50mb' }),
  async (req, res) => {
    try {
      const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
      const script = JSON.parse(raw) as ProductionScript;
      const actIndex = Number(req.params.actIndex);
      if (!Number.isInteger(actIndex) || actIndex < 0 || actIndex >= script.bgm_track.length) {
        res.status(400).json({ error: `actIndex must be between 0 and ${script.bgm_track.length - 1}.` });
        return;
      }
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Request body must be the raw audio file, with an audio/* Content-Type.' });
        return;
      }

      const dir = path.join(OUTPUT_DIR, req.params.id, 'bgm');
      await mkdir(dir, { recursive: true });
      const existing = await readdir(dir).catch(() => [] as string[]);
      await Promise.all(existing.filter((f) => f.startsWith(`act-${actIndex}.`)).map((f) => unlink(path.join(dir, f))));

      const ext = AUDIO_EXTENSION_BY_MIME[req.headers['content-type'] ?? ''] ?? 'mp3';
      const fileName = `act-${actIndex}.${ext}`;
      await writeFile(path.join(dir, fileName), body);

      res.json({ id: req.params.id, actIndex, fileName, url: `/api/production/${req.params.id}/bgm/${actIndex}` });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

productionRouter.get('/production/:id/bgm/:actIndex', async (req, res) => {
  const dir = path.join(OUTPUT_DIR, req.params.id, 'bgm');
  const files = await readdir(dir).catch(() => [] as string[]);
  const fileName = files.find((f) => f.startsWith(`act-${req.params.actIndex}.`));
  if (!fileName) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(dir, fileName));
});

// Mixes a master file from the already-synthesized voice lines (call
// /narration first), the SFX clips generated by /sfx if that was called
// (a silent bed otherwise — SFX are optional), and BGM act files — either
// uploaded per-act via POST /production/:id/bgm/:actIndex (what the timeline
// UI does), or explicit server-readable paths passed as bgmFiles (what the
// CLI does). Requires ffmpeg on PATH.
productionRouter.post('/production/:id/mix', async (req, res) => {
  const { bgmFiles: explicitBgmFiles } = req.body as { bgmFiles?: string[] };

  try {
    const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
    const script = JSON.parse(raw) as ProductionScript;

    let bgmFiles: string[];
    if (Array.isArray(explicitBgmFiles) && explicitBgmFiles.length > 0) {
      bgmFiles = explicitBgmFiles;
    } else {
      const bgmDir = path.join(OUTPUT_DIR, req.params.id, 'bgm');
      const uploaded = await readdir(bgmDir).catch(() => [] as string[]);
      bgmFiles = script.bgm_track.map((_, i) => {
        const fileName = uploaded.find((f) => f.startsWith(`act-${i}.`));
        return fileName ? path.join(bgmDir, fileName) : '';
      });
      if (bgmFiles.some((f) => f === '')) {
        res.status(400).json({
          error: `Missing uploaded BGM audio for ${bgmFiles.filter((f) => f === '').length} act(s). Upload via POST /production/:id/bgm/:actIndex, or pass bgmFiles explicitly.`,
        });
        return;
      }
    }

    if (bgmFiles.length !== script.bgm_track.length) {
      res.status(400).json({ error: `Expected ${script.bgm_track.length} BGM file(s) to match bgm_track, got ${bgmFiles.length}.` });
      return;
    }

    const voiceLinesDir = path.join(OUTPUT_DIR, req.params.id, 'voice-lines');
    const existingFiles = await readdir(voiceLinesDir).catch(() => [] as string[]);
    if (existingFiles.length === 0) {
      res.status(400).json({ error: 'No synthesized voice lines found — call POST /production/:id/narration first.' });
      return;
    }

    const lines: SynthesizedLine[] = [];
    for (const line of script.voice_track) {
      const fileName = existingFiles.find((f) => f.startsWith(String(line.index).padStart(3, '0')));
      if (!fileName) {
        res.status(400).json({ error: `Missing synthesized audio for voice_track line ${line.index}.` });
        return;
      }
      const audio = await readFile(path.join(voiceLinesDir, fileName));
      lines.push({ line, audio });
    }

    const projectDir = path.join(OUTPUT_DIR, req.params.id);
    const narrationPath = path.join(projectDir, 'narration.mp3');
    await concatenateNarration(lines, path.join(projectDir, 'mix-tmp'), narrationPath);

    const sfxDir = path.join(projectDir, 'sfx-clips');
    const manifest = await readFile(path.join(sfxDir, 'manifest.json'), 'utf-8')
      .then((raw) => JSON.parse(raw) as SfxManifestEntry[])
      .catch(() => [] as SfxManifestEntry[]);
    const sfxClips: SfxMixClip[] = manifest.map((m) => ({
      filePath: path.join(sfxDir, m.fileName),
      startSeconds: m.startSeconds,
      volumeDb: m.volumeDb,
      loop: m.loop,
      targetDurationSeconds: m.targetDurationSeconds,
    }));
    const sfxBedPath = path.join(projectDir, 'sfx-bed.mp3');
    await renderSfxTrack(sfxClips, parseTimestamp(script.metadata.total_duration), sfxBedPath);

    const masterPath = path.join(projectDir, 'master.mp3');
    await renderMasterAudio(narrationPath, sfxBedPath, bgmFiles, masterPath);

    res.json({ id: req.params.id, sfxClipsUsed: sfxClips.length, masterUrl: `/api/production/${req.params.id}/master` });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

productionRouter.get('/production/:id/master', async (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.id, 'master.mp3');
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: 'not found' });
  });
});
