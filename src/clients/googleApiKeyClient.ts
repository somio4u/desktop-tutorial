import { buildStoryInstruction, parseStoryResponse, GEMINI_STORY_RESPONSE_SCHEMA, type GenerateStoryInput, type StoryWithScenes } from './storyPrompt.js';

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

const MODEL = 'gemini-2.5-flash';

// Override path: a user-supplied Google API key (AI Studio style), instead
// of the server's Vertex AI service account. Same story/scene shape as the
// Vertex path so the rest of the pipeline (images, audio) doesn't care
// which one produced the text.
export async function generateStory(input: GenerateStoryInput, apiKey: string): Promise<StoryWithScenes> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildStoryInstruction(input) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_STORY_RESPONSE_SCHEMA,
      },
    }),
  });

  const json = (await res.json()) as GeminiGenerateContentResponse;
  if (!res.ok) {
    throw new Error(`Google API key request failed: ${res.status} ${json.error?.message ?? ''}`.trim());
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Google API response had no text output');
  }
  return parseStoryResponse(text);
}
