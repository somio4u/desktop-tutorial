import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { castingRouter } from './castingRoutes.js';
import { config } from './config.js';
import { createStory, type CreateStoryOptions } from './pipeline/storyPipeline.js';

const OUTPUT_DIR = path.resolve('output');

const audioExtensionFor = (format: string) => (format.startsWith('pcm') ? 'pcm' : 'mp3');

const app = express();
app.use(express.json());
app.use(express.static(path.resolve('public')));
app.use('/api', castingRouter);

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

    await writeFile(path.join(OUTPUT_DIR, `${id}.audio.${audioExtensionFor(result.outputFormat)}`), result.audio);
    await Promise.all(
      result.scenes.map((scene, i) =>
        scene.image
          ? writeFile(path.join(OUTPUT_DIR, `${id}.image-${i}.${scene.image.extension}`), scene.image.buffer)
          : Promise.resolve(),
      ),
    );

    res.json({
      id,
      storyText: result.storyText,
      outputFormat: result.outputFormat,
      audioUrl: `/api/stories/${id}/audio`,
      scenes: result.scenes.map((scene, i) => ({
        text: scene.text,
        imagePrompt: scene.imagePrompt,
        imageUrl: scene.image ? `/api/stories/${id}/images/${i}` : null,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get('/api/stories/:id/audio', async (req, res) => {
  const files = await readdir(OUTPUT_DIR).catch(() => [] as string[]);
  const match = files.find((f) => f.startsWith(`${req.params.id}.audio.`));
  if (!match) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(OUTPUT_DIR, match));
});

app.get('/api/stories/:id/images/:index', async (req, res) => {
  const files = await readdir(OUTPUT_DIR).catch(() => [] as string[]);
  const match = files.find((f) => f.startsWith(`${req.params.id}.image-${req.params.index}.`));
  if (!match) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(OUTPUT_DIR, match));
});

app.listen(config.port, () => {
  console.log(`story-creator listening on http://localhost:${config.port}`);
});
