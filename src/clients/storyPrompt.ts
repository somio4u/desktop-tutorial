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

// Gemini-family structured-output schema (Vertex and the API-key endpoint
// both accept this shape). Claude has no equivalent — its client instructs
// JSON output via the prompt instead and parses more defensively.
export const GEMINI_STORY_RESPONSE_SCHEMA = {
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

export function buildStoryInstruction(input: GenerateStoryInput): string {
  return [
    `Write a${input.genre ? ` ${input.genre}` : ''} story based on this prompt: ${input.prompt}`,
    'Break the story into 3-6 scenes, in order. For each scene, write the scene\'s narrative text and a short, vivid, self-contained image-generation prompt describing what an illustration of that scene should show.',
  ].join('\n');
}

// Strips a markdown code fence if the model wrapped its JSON in one
// (common with Claude even when asked not to).
export function parseStoryResponse(rawText: string): StoryWithScenes {
  const text = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(text) as { story?: unknown; scenes?: unknown };
  if (typeof parsed.story !== 'string' || !Array.isArray(parsed.scenes)) {
    throw new Error('Model response JSON did not match the expected { story, scenes } shape');
  }
  return { storyText: parsed.story, scenes: parsed.scenes as StoryScene[] };
}
