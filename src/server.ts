import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { createStory, type CreateStoryOptions } from './pipeline/storyPipeline.js';

const OUTPUT_DIR = path.resolve('output');

const extensionFor = (format: string) => (format.startsWith('pcm') ? 'pcm' : 'mp3');

const app = express();
app.use(express.json());

app.post('/api/stories', async (req, res) => {
  const { prompt, genre, voiceId, outputFormat } = req.body as Partial<CreateStoryOptions>;
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const result = await createStory({ prompt, genre, voiceId, outputFormat });
    const id = randomUUID();
    await mkdir(OUTPUT_DIR, { recursive: true });
    const fileName = `${id}.${extensionFor(result.outputFormat)}`;
    await writeFile(path.join(OUTPUT_DIR, fileName), result.audio);

    res.json({
      id,
      storyText: result.storyText,
      outputFormat: result.outputFormat,
      audioUrl: `/api/stories/${id}/audio`,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get('/api/stories/:id/audio', async (req, res) => {
  // Looks up the file by id regardless of extension.
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(OUTPUT_DIR).catch(() => [] as string[]);
  const match = files.find((f) => f.startsWith(req.params.id));
  if (!match) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(OUTPUT_DIR, match));
});

app.listen(config.port, () => {
  console.log(`story-creator listening on http://localhost:${config.port}`);
});
