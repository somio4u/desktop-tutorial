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

// Calls a Dify Workflow app's "run" endpoint. The workflow must expose an
// input variable named "prompt" (and optionally "genre"), and an output
// variable named "story" (or "text"/"output" as fallbacks).
export async function generateStory(input: GenerateStoryInput): Promise<string> {
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
  return story;
}
