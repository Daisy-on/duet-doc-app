import { listIndexedChunks } from './chunkRepository';
import { createDocumentPassageText } from './documentChunker';
import { rebuildLocalDocumentIndex } from './documentIndexer';
import {
  embedPassages,
  ensureEmbeddingModelReady,
  getEmbeddingRuntimeStatus,
  withEmbeddingRuntime,
} from './embeddingClient';
import { searchLocalKnowledge } from './localRetriever';
import {
  evaluateRetrievalCase,
  getRetrievalEvaluationCorpusStats,
  listRetrievalEvaluationSources,
  percentile,
  summarizeRetrievalEvaluation,
  type RetrievalEvaluationCase,
  type RetrievalEvaluationRun,
} from './retrievalEvaluation';
import {
  DOCUMENT_CHUNKER_VERSION,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
  type IndexProgress,
  type IndexRunResult,
  type LocalRetrievalStrategy,
} from './types';

export const BGE_MODEL = LOCAL_EMBEDDING_MODEL;
export const BGE_DIMENSION = LOCAL_EMBEDDING_DIMENSION;
export const BGE_CHUNKER_VERSION = DOCUMENT_CHUNKER_VERSION;

export interface BgeIndexResult extends IndexRunResult {
  totalMs: number;
}

export async function rebuildBgeIndex(
  onProgress?: (progress: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<BgeIndexResult> {
  const startedAt = performance.now();
  return withEmbeddingRuntime(async () => {
    await ensureEmbeddingModelReady();
    const result = await rebuildLocalDocumentIndex(onProgress, signal);
    return { ...result, totalMs: performance.now() - startedAt };
  });
}

export async function searchBge(query: string, strategy: LocalRetrievalStrategy = 'vector') {
  const startedAt = performance.now();
  const results = await searchLocalKnowledge(query, { strategy });
  return { results, durationMs: performance.now() - startedAt };
}

export const getBgeCorpusStats = getRetrievalEvaluationCorpusStats;
export const listBgeSources = listRetrievalEvaluationSources;

export async function warmupBge() {
  const startedAt = performance.now();
  await withEmbeddingRuntime(async () => {
    await embedPassages(['为这个句子生成表示以用于检索相关文章：语义检索预热']);
  });
  return performance.now() - startedAt;
}

export async function runBgeEvaluation(
  cases: RetrievalEvaluationCase[],
  options: {
    strategy?: LocalRetrievalStrategy;
    shouldContinue?: () => boolean;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<RetrievalEvaluationRun> {
  const strategy = options.strategy ?? 'vector';
  const results: RetrievalEvaluationRun['cases'] = [];
  await withEmbeddingRuntime(async () => {
    for (const evaluationCase of cases) {
      if (options.shouldContinue && !options.shouldContinue()) break;
      const startedAt = performance.now();
      const chunks = await searchLocalKnowledge(evaluationCase.query, {
        limit: 5,
        strategy,
      });
      results.push(evaluateRetrievalCase(evaluationCase, chunks, performance.now() - startedAt));
      options.onProgress?.(results.length, cases.length);
    }
  });
  return {
    cases: results,
    summary: summarizeRetrievalEvaluation(results),
    cancelled: results.length < cases.length,
    strategy,
  };
}

export interface BgePerformanceResult {
  deviceName: string;
  modelLoadMs: number;
  singleQuery: { runs: number; averageMs: number; p50Ms: number; p95Ms: number };
  batches: Array<{
    batchSize: 1 | 2 | 4 | 8;
    chunks: number;
    durationMs: number;
    chunksPerSecond: number;
  }>;
}

export async function runBgePerformanceBenchmark(): Promise<BgePerformanceResult> {
  const chunks = (await listIndexedChunks({})).slice(0, 16).map(createDocumentPassageText);
  if (chunks.length < 4) throw new Error('至少需要 4 个索引分块才能运行性能基准。');

  const startedAt = performance.now();
  return withEmbeddingRuntime(async () => {
    await ensureEmbeddingModelReady();
    const modelLoadMs = performance.now() - startedAt;
    await embedPassages(['为这个句子生成表示以用于检索相关文章：预热查询']);
    const queryDurations: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const result = await embedPassages([
        '为这个句子生成表示以用于检索相关文章：浏览器端语义检索性能',
      ]);
      queryDurations.push(result.inferenceMs);
    }

    const batches: BgePerformanceResult['batches'] = [];
    for (const batchSize of [1, 2, 4, 8] as const) {
      const startedAt = performance.now();
      for (let offset = 0; offset < chunks.length; offset += batchSize) {
        await embedPassages(chunks.slice(offset, offset + batchSize));
      }
      const durationMs = performance.now() - startedAt;
      batches.push({
        batchSize,
        chunks: chunks.length,
        durationMs,
        chunksPerSecond: chunks.length / (durationMs / 1000),
      });
    }

    return {
      deviceName: getEmbeddingRuntimeStatus().deviceName,
      modelLoadMs,
      singleQuery: {
        runs: queryDurations.length,
        averageMs:
          queryDurations.reduce((sum, duration) => sum + duration, 0) / queryDurations.length,
        p50Ms: percentile(queryDurations, 0.5),
        p95Ms: percentile(queryDurations, 0.95),
      },
      batches,
    };
  });
}
