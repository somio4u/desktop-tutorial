import { generateStory } from '../clients/difyClient.js';
import { synthesizeSpeech, type OutputFormat } from '../clients/elevenLabsClient.js';

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
}

export interface StoryImage {
  sourceUrl: string;
  buffer: Buffer;
  extension: string;
}

export interface StoryResult {
  storyText: string;
  audio: Buffer;
  outputFormat: OutputFormat;
  images: StoryImage[];
}

function extensionFromContentType(contentType: string | null): string {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return 'jpg';
}

async function downloadImage(url: string): Promise<StoryImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { sourceUrl: url, buffer, extension: extensionFromContentType(res.headers.get('content-type')) };
  } catch (err) {
    console.warn(`Skipping illustration, failed to download ${url}: ${(err as Error).message}`);
    return null;
  }
}

export async function createStory(options: CreateStoryOptions): Promise<StoryResult> {
  const { storyText, images: imageUrls } = await generateStory({ prompt: options.prompt, genre: options.genre });
  const outputFormat = options.outputFormat ?? 'pcm_44100';

  const chunks = splitIntoChunks(storyText, MAX_CHUNK_CHARS);
  const audioChunks: Buffer[] = [];
  for (const chunk of chunks) {
    audioChunks.push(await synthesizeSpeech(chunk, { voiceId: options.voiceId, outputFormat }));
  }

  const downloaded = await Promise.all(imageUrls.map(downloadImage));
  const images = downloaded.filter((img): img is StoryImage => img !== null);

  // Raw pcm_* formats are headerless, so concatenating the byte buffers
  // yields one continuous stream. mp3 chunks concatenate acceptably for
  // playback but are not frame-perfect; re-encode with ffmpeg if that matters.
  return { storyText, audio: Buffer.concat(audioChunks), outputFormat, images };
}
