import 'dotenv/config';

function env(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export const config = {
  dify: {
    baseUrl: env('DIFY_API_BASE_URL', 'https://api.dify.ai/v1')!,
    apiKey: env('DIFY_API_KEY'),
  },
  elevenLabs: {
    apiKey: env('ELEVENLABS_API_KEY'),
    voiceId: env('ELEVENLABS_VOICE_ID'),
  },
  port: Number(env('PORT', '3000')),
};
