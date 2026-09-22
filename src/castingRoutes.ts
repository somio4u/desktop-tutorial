import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { synthesizeScriptLine, resolveDelivery, type ScriptLine } from './casting/audiobookGenerator.js';
import { CastingManager, type CharacterProfile } from './casting/castingManager.js';
import { analyzeLineWithGemini } from './casting/geminiLineAnalyzer.js';
import { calculateVoiceSettings } from './casting/voiceSettings.js';
import { VOICES, type VoiceProfile } from './data/voices.js';

const OUTPUT_DIR = path.resolve('output', 'casting');

// Single active casting project for this local, single-user app — same
// scope as the rest of the server (no auth/multi-tenancy elsewhere either).
// Starting a new narrator resets it.
let casting: CastingManager | null = null;

function requireCasting(): CastingManager {
  if (!casting) {
    throw new HttpError(400, 'No casting project started yet. POST /api/casting/narrator first.');
  }
  return casting;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function serializeVoice(voice: VoiceProfile) {
  return {
    voiceName: voice.voiceName,
    gender: voice.gender,
    ageBracket: voice.ageBracket,
    ageRange: voice.ageRange,
    energy: voice.energy,
    baseTone: voice.baseTone,
    emotionalTone: voice.emotionalTone,
    archetypes: voice.archetypes,
  };
}

export const castingRouter = Router();

castingRouter.get('/voices', (_req, res) => {
  res.json({ voices: VOICES.map(serializeVoice) });
});

castingRouter.post('/casting/narrator', (req, res) => {
  const { voiceName } = req.body as { voiceName?: string };
  if (!voiceName) {
    res.status(400).json({ error: 'voiceName is required' });
    return;
  }
  try {
    casting = new CastingManager(voiceName);
    res.json({ narrator: serializeVoice(casting.getNarratorVoice()) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

castingRouter.get('/casting/narrator', (req, res) => {
  try {
    const manager = requireCasting();
    const limit = Number(req.query.limit) || 5;
    res.json({
      narrator: serializeVoice(manager.getNarratorVoice()),
      alternatives: manager.suggestNarratorAlternatives(limit).map((s) => ({ ...serializeVoice(s.voice), score: s.score })),
    });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 500).json({ error: (err as Error).message });
  }
});

castingRouter.put('/casting/narrator', (req, res) => {
  const { voiceName } = req.body as { voiceName?: string };
  if (!voiceName) {
    res.status(400).json({ error: 'voiceName is required' });
    return;
  }
  try {
    const manager = requireCasting();
    const narrator = manager.reassignNarrator(voiceName);
    res.json({ narrator: serializeVoice(narrator) });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 400).json({ error: (err as Error).message });
  }
});

castingRouter.post('/casting/characters', (req, res) => {
  const profile = req.body as Partial<CharacterProfile>;
  if (!profile.name || !profile.gender || !profile.ageBracket) {
    res.status(400).json({ error: 'name, gender, and ageBracket are required' });
    return;
  }
  try {
    const manager = requireCasting();
    const assigned = manager.castCharacter(profile as CharacterProfile);
    const alternatives = manager.suggestAlternatives(profile.name, 5);
    res.json({
      name: profile.name,
      assigned: serializeVoice(assigned),
      alternatives: alternatives.map((s) => ({ ...serializeVoice(s.voice), score: s.score })),
    });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 400).json({ error: (err as Error).message });
  }
});

castingRouter.get('/casting/characters', (_req, res) => {
  try {
    const manager = requireCasting();
    res.json({
      characters: manager.listCharacters().map((c) => ({ profile: c.profile, voice: serializeVoice(c.voice) })),
    });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 500).json({ error: (err as Error).message });
  }
});

castingRouter.get('/casting/characters/:name/suggestions', (req, res) => {
  try {
    const manager = requireCasting();
    const limit = Number(req.query.limit) || 5;
    const alternatives = manager.suggestAlternatives(req.params.name, limit);
    res.json({ alternatives: alternatives.map((s) => ({ ...serializeVoice(s.voice), score: s.score })) });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 400).json({ error: (err as Error).message });
  }
});

castingRouter.put('/casting/characters/:name/voice', (req, res) => {
  const { voiceName } = req.body as { voiceName?: string };
  if (!voiceName) {
    res.status(400).json({ error: 'voiceName is required' });
    return;
  }
  try {
    const manager = requireCasting();
    const voice = manager.reassignCharacter(req.params.name, voiceName);
    res.json({ name: req.params.name, voice: serializeVoice(voice) });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 400).json({ error: (err as Error).message });
  }
});

castingRouter.post('/casting/lines/analyze', async (req, res) => {
  const line = req.body as Partial<ScriptLine> & { useAI?: boolean };
  if (!line.speaker || !line.text) {
    res.status(400).json({ error: 'speaker and text are required' });
    return;
  }
  try {
    const manager = requireCasting();
    const voiceId = manager.getVoiceIdForActor(line.speaker);
    const delivery = line.emotion
      ? resolveDelivery(line as ScriptLine)
      : line.useAI
        ? await analyzeLineWithGemini(line.text)
        : resolveDelivery(line as ScriptLine);
    const settings = calculateVoiceSettings(line.speaker, delivery.emotion, delivery.pace);
    res.json({ delivery, voiceId, settings });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 400).json({ error: (err as Error).message });
  }
});

castingRouter.post('/casting/lines/synthesize', async (req, res) => {
  const line = req.body as Partial<ScriptLine>;
  if (!line.speaker || !line.text) {
    res.status(400).json({ error: 'speaker and text are required' });
    return;
  }
  try {
    const manager = requireCasting();
    const audio = await synthesizeScriptLine(line as ScriptLine, manager);
    const id = randomUUID();
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(path.join(OUTPUT_DIR, `${id}.mp3`), audio);
    res.json({ id, audioUrl: `/api/casting/lines/${id}/audio` });
  } catch (err) {
    res.status(err instanceof HttpError ? err.status : 502).json({ error: (err as Error).message });
  }
});

castingRouter.get('/casting/lines/:id/audio', async (req, res) => {
  const files = await readdir(OUTPUT_DIR).catch(() => [] as string[]);
  const match = files.find((f) => f.startsWith(req.params.id));
  if (!match) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.sendFile(path.join(OUTPUT_DIR, match));
});
