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

export interface StoryResult {
  storyText: string;
  audio: Buffer;
  outputFormat: OutputFormat;
}

export async function createStory(options: CreateStoryOptions): Promise<StoryResult> {
  const storyText = await generateStory({ prompt: options.prompt, genre: options.genre });
  const outputFormat = options.outputFormat ?? 'pcm_44100';

  const chunks = splitIntoChunks(storyText, MAX_CHUNK_CHARS);
  const audioChunks: Buffer[] = [];
  for (const chunk of chunks) {
    audioChunks.push(await synthesizeSpeech(chunk, { voiceId: options.voiceId, outputFormat }));
  }

  // Raw pcm_* formats are headerless, so concatenating the byte buffers
  // yields one continuous stream. mp3 chunks concatenate acceptably for
  // playback but are not frame-perfect; re-encode with ffmpeg if that matters.
  return { storyText, audio: Buffer.concat(audioChunks), outputFormat };
}
