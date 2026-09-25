export const MODEL_CACHE_PATH_PREFIX = '/__duet_models__/v1';

export const MODEL_DEFINITIONS = [
  {
    id: 'bge-large-zh-v1.5-fp16',
    directory: 'bge-large-zh-v1.5-fp16',
    name: '中文语义检索',
    modelName: 'BGE Large Zh v1.5',
    precision: 'FP16',
    estimatedSizeBytes: 650_141_789,
  },
  {
    id: 'qwen3.5-0.8b-opt-q4f16',
    directory: 'qwen3.5-0.8b-opt',
    name: '端侧智能助手',
    modelName: 'Qwen3.5 0.8B',
    precision: 'Q4F16',
    estimatedSizeBytes: 664_862_495,
  },
] as const;

export type ModelId = (typeof MODEL_DEFINITIONS)[number]['id'];
export type ModelDefinition = (typeof MODEL_DEFINITIONS)[number];

export function getModelDefinition(modelId: ModelId): ModelDefinition {
  const definition = MODEL_DEFINITIONS.find((item) => item.id === modelId);
  if (!definition) throw new Error(`未知模型: ${modelId}`);
  return definition;
}

export function getModelBasePath(modelId: ModelId): string {
  return `${MODEL_CACHE_PATH_PREFIX}/${getModelDefinition(modelId).directory}/`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
