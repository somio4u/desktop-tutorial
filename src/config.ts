import 'dotenv/config';

function env(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export const config = {
  google: {
    apiKey: env('GOOGLE_API_KEY'),
    llmModel: env('GOOGLE_LLM_MODEL', 'gemini-2.5-flash')!,
    imageModel: env('GOOGLE_IMAGE_MODEL', 'imagen-3.0-generate-002')!,
  },
  elevenLabs: {
    apiKey: env('ELEVENLABS_API_KEY'),
    voiceId: env('ELEVENLABS_VOICE_ID'),
  },
  port: Number(env('PORT', '3000')),
};
