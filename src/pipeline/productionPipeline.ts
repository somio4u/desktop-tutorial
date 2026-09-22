import { generateProductionScript } from '../clients/productionScriptClient.js';
import { resolveCast } from '../production/castResolver.js';
import type { ProductionScript } from '../production/types.js';

export interface ProduceScriptOptions {
  premise: string;
  durationMinutes: number;
  genre?: string;
  language?: string;
  narratorVoiceName?: string;
}

export interface ProduceScriptResult {
  script: ProductionScript;
  warnings: string[];
}

export async function produceScript(options: ProduceScriptOptions): Promise<ProduceScriptResult> {
  const generated = await generateProductionScript(options);
  const resolved = resolveCast(generated.script, { narratorVoiceName: options.narratorVoiceName });
  return { script: resolved.script, warnings: [...generated.warnings, ...resolved.warnings] };
}
