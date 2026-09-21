import { GoogleAuth } from 'google-auth-library';
import { config } from '../config.js';

// Picks up the key file from GOOGLE_APPLICATION_CREDENTIALS automatically.
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

export async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain a Google Cloud access token from GOOGLE_APPLICATION_CREDENTIALS');
  }
  return token;
}

export function vertexUrl(model: string, method: 'generateContent' | 'predict'): string {
  if (!config.google.projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT is not set.');
  }
  const { location, projectId } = config.google;
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${method}`;
}
