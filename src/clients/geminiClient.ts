import { config } from '../config.js';
import { getAccessToken, vertexUrl } from './googleAuth.js';

export interface StoryScene {
  text: string;
  imagePrompt: string;
}

export interface StoryWithScenes {
  storyText: string;
  scenes: StoryScene[];
}

export interface GenerateStoryInput {
  prompt: string;
  genre?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

// Ask Gemini for structured JSON so scene text and per-scene image prompts
// come back paired, rather than trying to re-derive scenes from prose later.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    story: { type: 'STRING' },
    scenes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          imagePrompt: { type: 'STRING' },
        },
        required: ['text', 'imagePrompt'],
      },
    },
  },
  required: ['story', 'scenes'],
};

export async function generateStory(input: GenerateStoryInput): Promise<StoryWithScenes> {
  const instruction = [
    `Write a${input.genre ? ` ${input.genre}` : ''} story based on this prompt: ${input.prompt}`,
    'Break the story into 3-6 scenes, in order. For each scene, write the scene\'s narrative text and a short, vivid, self-contained image-generation prompt describing what an illustration of that scene should show.',
  ].join('\n');

  const url = vertexUrl(config.google.llmModel, 'generateContent');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instruction }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini generateContent failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as GeminiGenerateContentResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Gemini response had no text output');
  }

  const parsed = JSON.parse(text) as { story?: unknown; scenes?: unknown };
  if (typeof parsed.story !== 'string' || !Array.isArray(parsed.scenes)) {
    throw new Error('Gemini response JSON did not match the expected { story, scenes } shape');
  }
  return { storyText: parsed.story, scenes: parsed.scenes as StoryScene[] };
}
