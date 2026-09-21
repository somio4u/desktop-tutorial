import 'dotenv/config';

function env(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export const config = {
  google: {
    // GoogleAuth reads the service account key from GOOGLE_APPLICATION_CREDENTIALS.
    projectId: env('GOOGLE_CLOUD_PROJECT'),
    location: env('GOOGLE_CLOUD_LOCATION', 'us-central1')!,
    llmModel: env('GOOGLE_VERTEX_LLM_MODEL', 'gemini-2.5-flash')!,
    imageModel: env('GOOGLE_VERTEX_IMAGE_MODEL', 'imagen-3.0-generate-002')!,
  },
  elevenLabs: {
    apiKey: env('ELEVENLABS_API_KEY'),
    voiceId: env('ELEVENLABS_VOICE_ID'),
  },
  port: Number(env('PORT', '3000')),
};
