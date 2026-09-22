import { config } from '../config.js';
import { getAccessToken, vertexUrl } from '../clients/googleAuth.js';
import type { LineAnalysis, Pace } from './lineAnalyzer.js';

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    emotion: { type: 'STRING' },
    pace: { type: 'STRING', enum: ['slow', 'normal', 'fast'] },
  },
  required: ['emotion', 'pace'],
};

// Optional alternative to the punctuation/length heuristic in
// lineAnalyzer.ts: asks Gemini to actually read the line (and, if given,
// the character's mood/style) and judge delivery. Slower and costs an API
// call per line, so it's opt-in, not the default.
export async function analyzeLineWithGemini(text: string, characterContext?: string): Promise<LineAnalysis> {
  const prompt = [
    'You are directing voice actors for an audiobook. Read this line of dialogue and judge how it should be delivered.',
    characterContext ? `Character context: ${characterContext}` : null,
    `Line: ${text}`,
    'Respond with the single best-fit emotion word (e.g. angry, excited, curious, sad, joyful, neutral, anxious, tender) and a pace of slow, normal, or fast.',
  ]
    .filter(Boolean)
    .join('\n');

  const url = vertexUrl(config.google.llmModel, 'generateContent');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini line analysis failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as GeminiGenerateContentResponse;
  const text_ = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text_ !== 'string') {
    throw new Error('Gemini line analysis returned no text output');
  }

  const parsed = JSON.parse(text_) as { emotion?: string; pace?: string };
  if (typeof parsed.emotion !== 'string' || !['slow', 'normal', 'fast'].includes(parsed.pace ?? '')) {
    throw new Error('Gemini line analysis returned an unexpected shape');
  }
  return { emotion: parsed.emotion, pace: parsed.pace as Pace };
}
