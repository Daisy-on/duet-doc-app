import Dexie, { type Table } from 'dexie';
import { db } from '../db';
import { chunkDocument, getDocumentFingerprint } from './documentChunker';
import { DIVERSE_SOURCE_TARGET, fuseRankings, MAX_CHUNKS_PER_SOURCE } from './hybridRanker';
import { rankLexicalCandidates } from './lexicalRetriever';
import {
  evaluateRetrievalCase,
  percentile,
  summarizeRetrievalEvaluation,
  type RetrievalEvaluationCase,
  type RetrievalEvaluationCorpusStats,
  type RetrievalEvaluationRun,
} from './retrievalEvaluation';
import {
  disposeBgeLabRuntime,
  embedBgeLabTexts,
  ensureBgeLabRuntime,
  formatBgeQuery,
  type BgePrecision,
} from './bgeLabRuntime';
import type {
  DocumentChunk,
  IndexProgress,
  IndexRunResult,
  LocalRetrievalStrategy,
  LocalSearchOptions,
  RetrievedChunk,
} from './types';

export const BGE_MODEL = 'bge-large-zh-v1.5';
export const BGE_DIMENSION = 1024;
export const BGE_PRECISIONS: BgePrecision[] = ['q4f16', 'fp16'];
export const BGE_CHUNKER_VERSION = 'v2-bge-lab';
const EMBEDDING_BATCH_SIZE = 2;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 12;
const MIN_HYBRID_CANDIDATES = 20;
const HYBRID_CANDIDATE_MULTIPLIER = 4;

interface BgeLabState {
  sourceId: string;
  sourceFingerprint: string;
  sourceUpdatedAt: number;
  chunkCount: number;
  precision: BgePrecision;
  batchSize: number;
  indexedAt: number;
}

interface BgeLabMeta {
  key: 'active';
  precision: BgePrecision;
}

class BgeLabDB extends Dexie {
  chunks!: Table<DocumentChunk, string>;
  states!: Table<BgeLabState, string>;
  meta!: Table<BgeLabMeta, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      chunks: 'id, sourceId, kbId, sourceType, [sourceId+chunkIndex]',
      states: 'sourceId, sourceUpdatedAt',
      meta: 'key',
    });
  }
}

let labDb: BgeLabDB | null = null;
let labOwnerDatabase = '';

function getLabDb() {
  if (!labDb || labOwnerDatabase !== db.name) {
    labDb?.close();
    labOwnerDatabase = db.name;
    labDb = new BgeLabDB(`${db.name}:BgeLab`);
  }
  return labDb;
}

async function activatePrecision(precision: BgePrecision) {
  const database = getLabDb();
  const active = await database.meta.get('active');
  if (active?.precision === precision) return database;

  await database.transaction('rw', [database.chunks, database.states, database.meta], async () => {
    await database.chunks.clear();
    await database.states.clear();
    await database.meta.put({ key: 'active', precision });
  });
  return database;
}

function passageText(chunk: Pick<DocumentChunk, 'title' | 'headingPath' | 'content'>) {
  const heading = chunk.headingPath.length > 0 ? `\n${chunk.headingPath.join(' > ')}` : '';
  return `${chunk.title}${heading}\n${chunk.content}`;
}

export interface BgeLabIndexResult extends IndexRunResult {
  precision: BgePrecision;
  modelLoadMs: number;
  embeddingMs: number;
  totalMs: number;
  embeddedChunks: number;
}

export interface BgeSearchResult {
  results: RetrievedChunk[];
  durationMs: number;
  inferenceMs: number;
}

export interface BgePerformanceResult {
  precision: BgePrecision;
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

export async function rebuildBgeLabIndex(
  precision: BgePrecision,
  onProgress?: (progress: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<BgeLabIndexResult> {
  const startedAt = performance.now();
  const database = await activatePrecision(precision);
  const runtime = await ensureBgeLabRuntime(precision);
  const documents = (await db.documents.toArray()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
  const result: BgeLabIndexResult = {
    precision,
    indexedDocuments: 0,
    skippedDocuments: 0,
    failedDocuments: 0,
    stopped: false,
    failures: [],
    modelLoadMs: runtime.loadMs,
    embeddingMs: 0,
    totalMs: 0,
    embeddedChunks: 0,
  };

  try {
    for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
      if (signal?.aborted) {
        result.stopped = true;
        break;
      }
      const document = documents[documentIndex];
      const fingerprint = getDocumentFingerprint(document);
      const existing = await database.states.get(document.id);
      if (
        existing?.sourceFingerprint === fingerprint &&
        existing.precision === precision &&
        existing.batchSize === EMBEDDING_BATCH_SIZE
      ) {
        result.skippedDocuments += 1;
        onProgress?.({
          completedDocuments: documentIndex + 1,
          totalDocuments: documents.length,
          sourceId: document.id,
          title: document.title,
        });
        continue;
      }

      try {
        const drafts = chunkDocument(document);
        const vectors: Float32Array[] = [];
        for (let offset = 0; offset < drafts.length; offset += EMBEDDING_BATCH_SIZE) {
          signal?.throwIfAborted();
          const batch = drafts.slice(offset, offset + EMBEDDING_BATCH_SIZE);
          const embedding = await embedBgeLabTexts(precision, batch.map(passageText));
          result.embeddingMs += embedding.inferenceMs;
          result.embeddedChunks += embedding.vectors.length;
          vectors.push(...embedding.vectors);
          onProgress?.({
            completedDocuments: documentIndex,
            totalDocuments: documents.length,
            sourceId: document.id,
            title: document.title,
            completedChunks: Math.min(offset + batch.length, drafts.length),
            totalChunks: drafts.length,
            reusedChunks: 0,
          });
        }

        const indexedAt = Date.now();
        const chunks: DocumentChunk[] = drafts.map((draft, index) => ({
          ...draft,
          embedding: vectors[index],
          embeddingModel: `${BGE_MODEL}-${precision}`,
          embeddingDimension: BGE_DIMENSION,
          chunkerVersion: BGE_CHUNKER_VERSION,
          indexedAt,
        }));
        await database.transaction('rw', [database.chunks, database.states], async () => {
          await database.chunks.where('sourceId').equals(document.id).delete();
          if (chunks.length > 0) await database.chunks.bulkPut(chunks);
          await database.states.put({
            sourceId: document.id,
            sourceFingerprint: fingerprint,
            sourceUpdatedAt: document.updatedAt,
            chunkCount: chunks.length,
            precision,
            batchSize: EMBEDDING_BATCH_SIZE,
            indexedAt,
          });
        });
        result.indexedDocuments += 1;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          result.stopped = true;
          break;
        }
        result.failedDocuments += 1;
        result.failures.push({
          sourceId: document.id,
          title: document.title,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      onProgress?.({
        completedDocuments: documentIndex + 1,
        totalDocuments: documents.length,
        sourceId: document.id,
        title: document.title,
      });
    }
  } finally {
    result.totalMs = performance.now() - startedAt;
    disposeBgeLabRuntime();
  }
  return result;
}

function dot(left: Float32Array, right: Float32Array) {
  let score = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function toRetrievedChunk(chunk: DocumentChunk, score: number): RetrievedChunk {
  return {
    id: chunk.id,
    sourceId: chunk.sourceId,
    kbId: chunk.kbId,
    sourceType: chunk.sourceType,
    title: chunk.title,
    chunkIndex: chunk.chunkIndex,
    headingPath: chunk.headingPath,
    content: chunk.content,
    score,
    sourceUpdatedAt: chunk.sourceUpdatedAt,
  };
}

function takeDiverseResults(results: RetrievedChunk[], limit: number) {
  const selected: RetrievedChunk[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const uniqueSourceTarget = Math.min(DIVERSE_SOURCE_TARGET, limit);

  for (const result of results) {
    if (sourceCounts.has(result.sourceId)) continue;
    selected.push(result);
    selectedIds.add(result.id);
    sourceCounts.set(result.sourceId, 1);
    if (selected.length === uniqueSourceTarget) break;
  }
  for (const result of results) {
    if (selected.length >= limit) break;
    if (selectedIds.has(result.id)) continue;
    const count = sourceCounts.get(result.sourceId) ?? 0;
    if (count >= MAX_CHUNKS_PER_SOURCE) continue;
    selected.push(result);
    selectedIds.add(result.id);
    sourceCounts.set(result.sourceId, count + 1);
  }
  return selected;
}

async function searchBgeLabInternal(
  precision: BgePrecision,
  query: string,
  options: LocalSearchOptions = {},
): Promise<BgeSearchResult> {
  const startedAt = performance.now();
  const database = await activatePrecision(precision);
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const strategy: LocalRetrievalStrategy = options.strategy ?? 'vector';
  let chunks = await database.chunks.toArray();
  if (options.kbId) chunks = chunks.filter((chunk) => chunk.kbId === options.kbId);
  if (options.sourceTypes?.length) {
    const sourceTypes = new Set(options.sourceTypes);
    chunks = chunks.filter((chunk) => sourceTypes.has(chunk.sourceType));
  }
  if (chunks.length === 0) return { results: [], durationMs: 0, inferenceMs: 0 };

  const embedding = await embedBgeLabTexts(precision, [formatBgeQuery(query)]);
  const queryVector = embedding.vectors[0];
  const candidateLimit =
    strategy === 'hybrid'
      ? Math.min(
          chunks.length,
          Math.max(MIN_HYBRID_CANDIDATES, limit * HYBRID_CANDIDATE_MULTIPLIER),
        )
      : Math.min(chunks.length, limit * 3);
  const vectorMatches = chunks
    .map((chunk) => ({ id: chunk.id, score: dot(queryVector, chunk.embedding) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, candidateLimit);
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  let results: RetrievedChunk[];
  if (strategy === 'hybrid') {
    const lexicalMatches = rankLexicalCandidates(query, chunks, candidateLimit);
    results = takeDiverseResults(
      fuseRankings(vectorMatches, lexicalMatches).map((match) => {
        const chunk = chunksById.get(match.id)!;
        return {
          ...toRetrievedChunk(chunk, match.score),
          retrievalStrategy: 'hybrid' as const,
          vectorRank: match.vectorRank,
          vectorScore: match.vectorScore,
          lexicalRank: match.lexicalRank,
          lexicalScore: match.lexicalScore,
          fusionScore: match.score,
          matchedTerms: match.matchedTerms,
          matchedPhrase: match.matchedPhrase,
          phraseBonus: match.phraseBonus,
        };
      }),
      limit,
    );
  } else {
    results = takeDiverseResults(
      vectorMatches.map((match, index) => ({
        ...toRetrievedChunk(chunksById.get(match.id)!, match.score),
        retrievalStrategy: 'vector' as const,
        vectorRank: index + 1,
        vectorScore: match.score,
      })),
      limit,
    );
  }

  return { results, durationMs: performance.now() - startedAt, inferenceMs: embedding.inferenceMs };
}

export async function searchBgeLab(
  precision: BgePrecision,
  query: string,
  options: LocalSearchOptions = {},
) {
  await ensureBgeLabRuntime(precision);
  try {
    return await searchBgeLabInternal(precision, query, options);
  } finally {
    disposeBgeLabRuntime();
  }
}

export async function getBgeLabCorpusStats(
  precision: BgePrecision,
): Promise<RetrievalEvaluationCorpusStats> {
  const database = await activatePrecision(precision);
  const [documentCount, states, chunkCount] = await Promise.all([
    db.documents.count(),
    database.states.toArray(),
    database.chunks.count(),
  ]);
  return {
    documentCount,
    indexedSourceCount: states.filter((state) => state.chunkCount > 0).length,
    chunkCount,
  };
}

export async function listBgeLabSources(precision: BgePrecision) {
  const database = await activatePrecision(precision);
  const chunks = await database.chunks.toArray();
  return [...new Map(chunks.map((chunk) => [chunk.sourceId, chunk.title])).entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export async function warmupBgeLab(precision: BgePrecision) {
  const startedAt = performance.now();
  try {
    await embedBgeLabTexts(precision, [formatBgeQuery('语义检索预热')]);
    return performance.now() - startedAt;
  } finally {
    disposeBgeLabRuntime();
  }
}

export async function runBgeLabEvaluation(
  precision: BgePrecision,
  cases: RetrievalEvaluationCase[],
  options: {
    strategy?: LocalRetrievalStrategy;
    shouldContinue?: () => boolean;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<RetrievalEvaluationRun> {
  await ensureBgeLabRuntime(precision);
  const strategy = options.strategy ?? 'vector';
  const results = [];
  try {
    for (const evaluationCase of cases) {
      if (options.shouldContinue && !options.shouldContinue()) break;
      const search = await searchBgeLabInternal(precision, evaluationCase.query, {
        limit: DEFAULT_LIMIT,
        strategy,
      });
      results.push(evaluateRetrievalCase(evaluationCase, search.results, search.durationMs));
      options.onProgress?.(results.length, cases.length);
    }
  } finally {
    disposeBgeLabRuntime();
  }
  return {
    cases: results,
    summary: summarizeRetrievalEvaluation(results),
    cancelled: results.length < cases.length,
    strategy,
  };
}

export async function runBgePerformanceBenchmark(
  precision: BgePrecision,
): Promise<BgePerformanceResult> {
  const database = await activatePrecision(precision);
  const chunks = (await database.chunks.orderBy('id').limit(16).toArray()).map(passageText);
  if (chunks.length < 4) throw new Error('至少需要 4 个实验索引分块才能运行性能基准。');

  const runtime = await ensureBgeLabRuntime(precision);
  try {
    await embedBgeLabTexts(precision, [formatBgeQuery('预热查询')]);
    const queryDurations: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const result = await embedBgeLabTexts(precision, [formatBgeQuery('浏览器端语义检索性能')]);
      queryDurations.push(result.inferenceMs);
    }

    const batches: BgePerformanceResult['batches'] = [];
    for (const batchSize of [1, 2, 4, 8] as const) {
      const startedAt = performance.now();
      for (let offset = 0; offset < chunks.length; offset += batchSize) {
        await embedBgeLabTexts(precision, chunks.slice(offset, offset + batchSize));
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
      precision,
      deviceName: runtime.deviceName,
      modelLoadMs: runtime.loadMs,
      singleQuery: {
        runs: queryDurations.length,
        averageMs: queryDurations.reduce((sum, value) => sum + value, 0) / queryDurations.length,
        p50Ms: percentile(queryDurations, 0.5),
        p95Ms: percentile(queryDurations, 0.95),
      },
      batches,
    };
  } finally {
    disposeBgeLabRuntime();
  }
}

export type { BgePrecision };
