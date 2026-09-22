import { buildStoryInstruction, parseStoryResponse, type GenerateStoryInput, type StoryWithScenes } from './storyPrompt.js';

interface AnthropicMessagesResponse {
  content?: Array<{ text?: string }>;
  error?: { message?: string };
}

const MODEL = 'claude-sonnet-5';

// Override path: a user-supplied Anthropic API key. Claude has no
// schema-constrained JSON mode like Gemini, so the instruction spells out
// the exact shape and parseStoryResponse() defensively strips markdown
// fences before parsing.
export async function generateStory(input: GenerateStoryInput, apiKey: string): Promise<StoryWithScenes> {
  const instruction = [
    buildStoryInstruction(input),
    '',
    'Respond with ONLY a single JSON object of the exact shape { "story": string, "scenes": [{ "text": string, "imagePrompt": string }] } — no markdown code fences, no other text before or after it.',
  ].join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: instruction }],
    }),
  });

  const json = (await res.json()) as AnthropicMessagesResponse;
  if (!res.ok) {
    throw new Error(`Anthropic API request failed: ${res.status} ${json.error?.message ?? ''}`.trim());
  }

  const text = json.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Anthropic response had no text output');
  }
  return parseStoryResponse(text);
}
