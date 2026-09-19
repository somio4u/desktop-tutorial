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
  await Promise.all(
    result.images.map((img, i) => writeFile(`${base}.image-${i}.${img.extension}`, img.buffer)),
  );

  console.log(`Story text: ${base}.txt`);
  console.log(`Audio (${result.outputFormat}): ${base}.${ext}`);
  if (result.images.length) {
    console.log(`Illustrations: ${base}.image-0.${result.images[0].extension} .. (${result.images.length} total)`);
  } else {
    console.log('No illustrations (workflow produced no "images" output, or none downloaded successfully).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
