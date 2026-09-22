import { config } from '../config.js';

export type OutputFormat =
  | 'mp3_44100_128'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100';

export interface VoiceSettingsOption {
  stability: number;
  similarityBoost: number;
  speed?: number;
}

export interface SynthesizeOptions {
  voiceId?: string;
  outputFormat?: OutputFormat;
  modelId?: string;
  voiceSettings?: VoiceSettingsOption;
}

export async function synthesizeSpeech(text: string, options: SynthesizeOptions = {}): Promise<Buffer> {
  if (!config.elevenLabs.apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set.');
  }
  const voiceId = options.voiceId ?? config.elevenLabs.voiceId;
  if (!voiceId) {
    throw new Error('No ElevenLabs voice id given (pass options.voiceId or set ELEVENLABS_VOICE_ID).');
  }
  const outputFormat = options.outputFormat ?? 'pcm_44100';
  const modelId = options.modelId ?? 'eleven_multilingual_v2';

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.elevenLabs.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      ...(options.voiceSettings && {
        voice_settings: {
          stability: options.voiceSettings.stability,
          similarity_boost: options.voiceSettings.similarityBoost,
          ...(options.voiceSettings.speed !== undefined && { speed: options.voiceSettings.speed }),
        },
      }),
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
