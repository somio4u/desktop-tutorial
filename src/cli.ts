import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStory } from './pipeline/storyPipeline.js';

async function main() {
  const prompt = process.argv.slice(2).join(' ');
  if (!prompt) {
    console.error('Usage: npm run cli -- "<story prompt>"');
    process.exit(1);
  }

  console.log('Generating story...');
  const result = await createStory({ prompt });

  const outDir = path.resolve('output');
  await mkdir(outDir, { recursive: true });
  const ext = result.outputFormat.startsWith('pcm') ? 'pcm' : 'mp3';
  const base = path.join(outDir, `story-${Date.now()}`);

  await writeFile(`${base}.txt`, result.storyText);
  await writeFile(`${base}.${ext}`, result.audio);

  const sceneManifest = result.scenes.map((scene, i) => ({
    text: scene.text,
    imagePrompt: scene.imagePrompt,
    imageFile: scene.image ? `${path.basename(base)}.image-${i}.${scene.image.extension}` : null,
  }));
  await writeFile(`${base}.scenes.json`, JSON.stringify(sceneManifest, null, 2));
  await Promise.all(
    result.scenes.map((scene, i) =>
      scene.image ? writeFile(`${base}.image-${i}.${scene.image.extension}`, scene.image.buffer) : Promise.resolve(),
    ),
  );

  const illustrated = result.scenes.filter((s) => s.image).length;
  console.log(`Story text: ${base}.txt`);
  console.log(`Audio (${result.outputFormat}): ${base}.${ext}`);
  console.log(`Scenes: ${base}.scenes.json (${illustrated}/${result.scenes.length} illustrated)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
