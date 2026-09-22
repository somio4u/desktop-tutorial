import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { produceScript, type ProduceScriptOptions } from './pipeline/productionPipeline.js';
import { concatenateNarration, renderMasterAudio } from './production/masterMix.js';
import { synthesizeNarration, type SynthesizedLine } from './production/narrationSynth.js';
import type { ProductionScript } from './production/types.js';

const OUTPUT_DIR = path.resolve('output', 'productions');

export const productionRouter = Router();

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

// Mixes a master file from the already-synthesized voice lines (call
// /narration first) plus BGM act files rendered elsewhere (Suno/Udio) from
// this script's bgm_track prompts — paths must be readable by this server.
// Requires ffmpeg on PATH.
productionRouter.post('/production/:id/mix', async (req, res) => {
  const { bgmFiles } = req.body as { bgmFiles?: string[] };
  if (!Array.isArray(bgmFiles) || bgmFiles.length === 0) {
    res.status(400).json({ error: 'bgmFiles (array of file paths) is required' });
    return;
  }

  try {
    const raw = await readFile(path.join(OUTPUT_DIR, `${req.params.id}.json`), 'utf-8');
    const script = JSON.parse(raw) as ProductionScript;

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

    const masterPath = path.join(projectDir, 'master.mp3');
    await renderMasterAudio(narrationPath, bgmFiles, masterPath);

    res.json({ id: req.params.id, masterUrl: `/api/production/${req.params.id}/master` });
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
