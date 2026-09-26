// NVIDIA-hosted models (build.nvidia.com). The API route only accepts IDs from this list.
export const MODELS = [
  { id: "google/gemma-4-31b-it", label: "Gemma 4 31B" },
  { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = MODELS[0].id;

export function isModelId(value: unknown): value is ModelId {
  return MODELS.some((m) => m.id === value);
}

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}
