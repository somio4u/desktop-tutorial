import { config } from '../config.js';

interface DifyWorkflowRunResponse {
  data: {
    status: string;
    outputs: Record<string, unknown> | null;
    error: string | null;
  };
}

export interface GenerateStoryInput {
  prompt: string;
  genre?: string;
}

export interface StoryWithImages {
  storyText: string;
  images: string[];
}

// A Dify File-type output (from an image-generation tool/node) looks like
// this; only a subset of fields is guaranteed depending on node type.
interface DifyFileRef {
  url?: string;
  remote_url?: string;
}

// File URLs from a self-hosted Dify instance are often host-relative
// (e.g. "/files/abc.png"); resolve them against the API host.
function resolveDifyUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = new URL(config.dify.baseUrl).origin;
  return new URL(url, origin).toString();
}

function extractImageUrl(entry: unknown): string | null {
  if (typeof entry === 'string') return resolveDifyUrl(entry);
  if (entry && typeof entry === 'object') {
    const ref = entry as DifyFileRef;
    const url = ref.remote_url ?? ref.url;
    if (typeof url === 'string') return resolveDifyUrl(url);
  }
  return null;
}

// Calls a Dify Workflow app's "run" endpoint. The workflow must expose an
// input variable named "prompt" (and optionally "genre"), an output
// variable named "story" (or "text"/"output" as fallbacks), and — for
// visual storytelling — an output variable named "images" (or
// "image_urls"/"illustrations") holding an array of image URLs or Dify
// File objects, e.g. produced by an Iteration node that runs an
// image-generation tool once per scene.
export async function generateStory(input: GenerateStoryInput): Promise<StoryWithImages> {
  if (!config.dify.apiKey) {
    throw new Error('DIFY_API_KEY is not set. Create a Workflow app in Dify, publish it, and set its API key.');
  }

  const res = await fetch(`${config.dify.baseUrl}/workflows/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.dify.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: { prompt: input.prompt, genre: input.genre ?? '' },
      response_mode: 'blocking',
      user: 'story-creator-service',
    }),
  });

  if (!res.ok) {
    throw new Error(`Dify workflow run failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as DifyWorkflowRunResponse;
  if (json.data.status !== 'succeeded') {
    throw new Error(`Dify workflow did not succeed: ${json.data.error ?? json.data.status}`);
  }

  const outputs = json.data.outputs ?? {};
  const story = outputs.story ?? outputs.text ?? outputs.output;
  if (typeof story !== 'string') {
    throw new Error(
      'Dify workflow response had no recognizable text output (expected an output variable named "story", "text", or "output")',
    );
  }

  const rawImages = outputs.images ?? outputs.image_urls ?? outputs.illustrations;
  const images = Array.isArray(rawImages) ? rawImages.map(extractImageUrl).filter((u): u is string => u !== null) : [];

  return { storyText: story, images };
}
