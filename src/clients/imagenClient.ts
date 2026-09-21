import { config } from '../config.js';
import { getAccessToken, vertexUrl } from './googleAuth.js';

export interface GenerateImageOptions {
  aspectRatio?: string;
}

interface ImagenPredictResponse {
  predictions?: Array<{ bytesBase64Encoded?: string }>;
}

export async function generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<Buffer> {
  const url = vertexUrl(config.google.imageModel, 'predict');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json',
    },
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
