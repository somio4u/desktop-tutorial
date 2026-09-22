import { generateStory as generateStoryVertex, type StoryScene, type StoryWithScenes } from '../clients/geminiClient.js';
import { generateStory as generateStoryGoogleApiKey } from '../clients/googleApiKeyClient.js';
import { generateStory as generateStoryClaude } from '../clients/claudeClient.js';
import { generateImage } from '../clients/imagenClient.js';
import { synthesizeSpeech, type OutputFormat } from '../clients/elevenLabsClient.js';

export type StoryProvider = 'vertex' | 'google-api-key' | 'anthropic';

async function generateStoryText(
  provider: StoryProvider,
  input: { prompt: string; genre?: string },
  apiKey?: string,
): Promise<StoryWithScenes> {
  switch (provider) {
    case 'vertex':
      return generateStoryVertex(input);
    case 'google-api-key':
      if (!apiKey) throw new Error('apiKey is required when storyProvider is "google-api-key"');
      return generateStoryGoogleApiKey(input, apiKey);
    case 'anthropic':
      if (!apiKey) throw new Error('apiKey is required when storyProvider is "anthropic"');
      return generateStoryClaude(input, apiKey);
  }
}

// Keep request bodies well under ElevenLabs' per-request character limit.
const MAX_CHUNK_CHARS = 2000;

// Splits on paragraph breaks so no sentence is cut mid-way across chunks.
function splitIntoChunks(text: string, maxChars: number): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface CreateStoryOptions {
  prompt: string;
  genre?: string;
  voiceId?: string;
  outputFormat?: OutputFormat;
  // Defaults to Vertex AI (the server's configured service account). Passing
  // 'google-api-key' or 'anthropic' overrides just the story-text step with
  // a caller-supplied key; images (Imagen) and audio (ElevenLabs) are
  // unaffected either way.
  storyProvider?: StoryProvider;
  apiKey?: string;
}

export interface GeneratedImage {
  buffer: Buffer;
  extension: string;
}

export interface StorySceneResult {
  text: string;
  imagePrompt: string;
  image: GeneratedImage | null;
}

export interface StoryResult {
  storyText: string;
  audio: Buffer;
  outputFormat: OutputFormat;
  scenes: StorySceneResult[];
}

async function illustrateScene(scene: StoryScene): Promise<StorySceneResult> {
  try {
    const buffer = await generateImage(scene.imagePrompt);
    return { text: scene.text, imagePrompt: scene.imagePrompt, image: { buffer, extension: 'png' } };
  } catch (err) {
    console.warn(`Illustration failed for scene ("${scene.imagePrompt}"): ${(err as Error).message}`);
    return { text: scene.text, imagePrompt: scene.imagePrompt, image: null };
  }
}

export async function createStory(options: CreateStoryOptions): Promise<StoryResult> {
  const provider = options.storyProvider ?? 'vertex';
  const { storyText, scenes } = await generateStoryText(provider, { prompt: options.prompt, genre: options.genre }, options.apiKey);
  const outputFormat = options.outputFormat ?? 'pcm_44100';

  const chunks = splitIntoChunks(storyText, MAX_CHUNK_CHARS);
  const audioChunks: Buffer[] = [];
  for (const chunk of chunks) {
    audioChunks.push(await synthesizeSpeech(chunk, { voiceId: options.voiceId, outputFormat }));
  }

  const sceneResults = await Promise.all(scenes.map(illustrateScene));

  // Raw pcm_* formats are headerless, so concatenating the byte buffers
  // yields one continuous stream. mp3 chunks concatenate acceptably for
  // playback but are not frame-perfect; re-encode with ffmpeg if that matters.
  return { storyText, audio: Buffer.concat(audioChunks), outputFormat, scenes: sceneResults };
}
