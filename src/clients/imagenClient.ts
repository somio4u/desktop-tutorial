import { config } from '../config.js';

export interface GenerateImageOptions {
  aspectRatio?: string;
}

interface ImagenPredictResponse {
  predictions?: Array<{ bytesBase64Encoded?: string }>;
}

export async function generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<Buffer> {
  if (!config.google.apiKey) {
    throw new Error('GOOGLE_API_KEY is not set.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.google.imageModel}:predict?key=${config.google.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: options.aspectRatio ?? '1:1' },
    }),
  });

  if (!res.ok) {
    throw new Error(`Imagen predict failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as ImagenPredictResponse;
  const base64 = json.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error('Imagen response had no image data');
  }
  return Buffer.from(base64, 'base64');
}
