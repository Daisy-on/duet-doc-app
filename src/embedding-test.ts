import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;

const MODEL_PATH = '/ai-models/multilingual-e5-base/';
const WARM_RUN_COUNT = 10;

export type EmbeddingDtype = 'fp16' | 'int8';

export type EmbeddingProgress = {
  file: string;
  percent: number;
};

export type RetrievalResult = {
  passage: string;
  score: number;
};

export type EmbeddingBenchmarkResult = {
  dtype: EmbeddingDtype;
  modelLoadMs: number;
  firstInferenceMs: number;
  averageInferenceMs: number;
  p50InferenceMs: number;
  p95InferenceMs: number;
  batchSize: number;
  batchInferenceMs: number;
  embeddingDimension: number;
  ranking: RetrievalResult[];
};

type BenchmarkOptions = {
  dtype: EmbeddingDtype;
  onProgress?: (progress: EmbeddingProgress) => void;
};

const query = 'query: 如何在浏览器中运行本地人工智能模型？';

const passages = [
  'passage: WebGPU allows web applications to perform machine learning inference on a local GPU.',
  'passage: IndexedDB is a browser database suitable for storing structured local data.',
  'passage: FastAPI is a Python framework for building backend web APIs.',
  'passage: Browser-based local AI can keep private content on the user device.',
];

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index];
}

function cosineSimilarity(left: number[], right: number[]) {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function runEmbeddingBenchmark({
  dtype,
  onProgress,
}: BenchmarkOptions): Promise<EmbeddingBenchmarkResult> {
  const modelLoadStartedAt = performance.now();

  const extractor = (await pipeline('feature-extraction', MODEL_PATH, {
    device: 'webgpu',
    dtype,
    progress_callback: (progress: ProgressInfo) => {
      if (progress.status !== 'progress' || typeof progress.progress !== 'number') {
        return;
      }

      onProgress?.({
        file: progress.file,
        percent: Math.round(progress.progress),
      });
    },
  })) as FeatureExtractionPipeline;

  const modelLoadMs = performance.now() - modelLoadStartedAt;

  const firstInferenceStartedAt = performance.now();
  await extractor(query, { pooling: 'mean', normalize: true });
  const firstInferenceMs = performance.now() - firstInferenceStartedAt;

  const warmInferenceDurations: number[] = [];
  for (let index = 0; index < WARM_RUN_COUNT; index += 1) {
    const startedAt = performance.now();
    await extractor(query, { pooling: 'mean', normalize: true });
    warmInferenceDurations.push(performance.now() - startedAt);
  }

  const batchStartedAt = performance.now();
  const passageOutput = await extractor(passages, { pooling: 'mean', normalize: true });
  const batchInferenceMs = performance.now() - batchStartedAt;

  const queryOutput = await extractor(query, { pooling: 'mean', normalize: true });
  const queryVector = queryOutput.tolist()[0] as number[];
  const passageVectors = passageOutput.tolist() as number[][];

  const ranking = passageVectors
    .map((vector, index) => ({
      passage: passages[index],
      score: cosineSimilarity(queryVector, vector),
    }))
    .sort((left, right) => right.score - left.score);

  const averageInferenceMs =
    warmInferenceDurations.reduce((sum, duration) => sum + duration, 0) /
    warmInferenceDurations.length;

  const result: EmbeddingBenchmarkResult = {
    dtype,
    modelLoadMs,
    firstInferenceMs,
    averageInferenceMs,
    p50InferenceMs: percentile(warmInferenceDurations, 0.5),
    p95InferenceMs: percentile(warmInferenceDurations, 0.95),
    batchSize: passages.length,
    batchInferenceMs,
    embeddingDimension: queryVector.length,
    ranking,
  };

  console.groupCollapsed(`[embedding-benchmark] ${dtype} / WebGPU`);
  console.table({
    modelLoadMs: modelLoadMs.toFixed(2),
    firstInferenceMs: firstInferenceMs.toFixed(2),
    averageInferenceMs: averageInferenceMs.toFixed(2),
    p50InferenceMs: result.p50InferenceMs.toFixed(2),
    p95InferenceMs: result.p95InferenceMs.toFixed(2),
    batchInferenceMs: batchInferenceMs.toFixed(2),
    embeddingDimension: queryVector.length,
  });
  console.table(ranking);
  console.groupEnd();

  return result;
}
