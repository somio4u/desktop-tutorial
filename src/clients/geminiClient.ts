import { config } from '../config.js';
import { getAccessToken, vertexUrl } from './googleAuth.js';
import {
  buildStoryInstruction,
  parseStoryResponse,
  GEMINI_STORY_RESPONSE_SCHEMA,
  type GenerateStoryInput,
  type StoryWithScenes,
} from './storyPrompt.js';

export type { StoryScene, StoryWithScenes, GenerateStoryInput } from './storyPrompt.js';

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

// The default story provider: Vertex AI, authenticated with the service
// account configured in GOOGLE_APPLICATION_CREDENTIALS.
export async function generateStory(input: GenerateStoryInput): Promise<StoryWithScenes> {
  const url = vertexUrl(config.google.llmModel, 'generateContent');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildStoryInstruction(input) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_STORY_RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini (Vertex) generateContent failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as GeminiGenerateContentResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Gemini (Vertex) response had no text output');
  }
  return parseStoryResponse(text);
}
