import { db } from '../db';
import { ensureEmbeddingModelReady } from './embeddingClient';
import {
  DIVERSE_SOURCE_TARGET,
  LEXICAL_RRF_WEIGHT,
  MAX_CHUNKS_PER_SOURCE,
  RRF_RANK_CONSTANT,
  VECTOR_RRF_WEIGHT,
} from './hybridRanker';
import {
  HYBRID_CANDIDATE_MULTIPLIER,
  MIN_HYBRID_CANDIDATES,
  searchLocalKnowledge,
} from './localRetriever';
import {
  DOCUMENT_CHUNKER_VERSION,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
  type LocalRetrievalStrategy,
  type RetrievedChunk,
} from './types';

const DEFAULT_LIMIT = 5;

export interface RetrievalEvaluationCase {
  id: string;
  category: string;
  query: string;
  expectedSourceIds: string[];
  expectedChunkKeywords?: string[];
}

export interface RetrievalEvaluationSource {
  sourceId: string;
  title: string;
  chunkIndex: number;
  headingPath: string[];
  content: string;
  score: number;
  vectorRank?: number;
  vectorScore?: number;
  lexicalRank?: number;
  lexicalScore?: number;
  fusionScore?: number;
  matchedTerms?: string[];
}

export interface RetrievalEvaluationCaseResult {
  caseId: string;
  category: string;
  query: string;
  expectedSourceIds: string[];
  expectedChunkKeywords?: string[];
  durationMs: number;
  firstRelevantRank: number | null;
  hitAt1: boolean;
  hitAt3: boolean;
  hitAt5: boolean;
  reciprocalRank: number;
  sourceRecallAt1: number;
  sourceRecallAt3: number;
  sourceRecallAt5: number;
  keywordRecallAt1?: number;
  keywordRecallAt3?: number;
  keywordRecallAt5?: number;
  firstFullKeywordRank?: number | null;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  topResults: RetrievalEvaluationSource[];
}

export interface RetrievalEvaluationSummary {
  completedCases: number;
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  mrr: number;
  sourceRecallAt1: number;
  sourceRecallAt3: number;
  sourceRecallAt5: number;
  keywordCaseCount: number;
  averageKeywordRecallAt1: number | null;
  averageKeywordRecallAt3: number | null;
  averageKeywordRecallAt5: number | null;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
}

export interface RetrievalEvaluationRun {
  cases: RetrievalEvaluationCaseResult[];
  summary: RetrievalEvaluationSummary;
  cancelled: boolean;
  strategy: LocalRetrievalStrategy;
}

export interface RetrievalEvaluationCorpusStats {
  documentCount: number;
  indexedSourceCount: number;
  chunkCount: number;
}

export interface RetrievalEvaluationReport {
  label: string;
  createdAt: string;
  model: string;
  embeddingDimension: number;
  chunkerVersion: string;
  topK: number;
  retrievalStrategy: LocalRetrievalStrategy;
  hybridConfig: {
    minimumCandidates: number;
    candidateMultiplier: number;
    rrfRankConstant: number;
    vectorWeight: number;
    lexicalWeight: number;
    maxChunksPerSource: number;
    uniqueSourceTarget: number;
  } | null;
  warmupMs: number | null;
  corpus: RetrievalEvaluationCorpusStats;
  summary: RetrievalEvaluationSummary;
  cases: RetrievalEvaluationCaseResult[];
}

type EvaluationRunOptions = {
  limit?: number;
  strategy?: LocalRetrievalStrategy;
  shouldContinue?: () => boolean;
  onProgress?: (completedCases: number, totalCases: number) => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeStringArray(value: unknown, field: string, caseIndex: number): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`第 ${caseIndex + 1} 条评测用例的 ${field} 必须是非空字符串数组。`);
  }
  return value.map((item) => item.trim());
}

function normalizeCase(value: unknown, caseIndex: number): RetrievalEvaluationCase {
  const record = asRecord(value);
  if (!record) throw new Error(`第 ${caseIndex + 1} 条评测用例必须是对象。`);

  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw new Error(`第 ${caseIndex + 1} 条评测用例缺少 id。`);
  }
  if (typeof record.query !== 'string' || !record.query.trim()) {
    throw new Error(`第 ${caseIndex + 1} 条评测用例缺少 query。`);
  }

  const expectedChunkKeywords =
    record.expectedChunkKeywords === undefined
      ? undefined
      : normalizeStringArray(record.expectedChunkKeywords, 'expectedChunkKeywords', caseIndex);

  return {
    id: record.id.trim(),
    category:
      typeof record.category === 'string' && record.category.trim()
        ? record.category.trim()
        : 'general',
    query: record.query.trim(),
    expectedSourceIds: normalizeStringArray(
      record.expectedSourceIds,
      'expectedSourceIds',
      caseIndex,
    ),
    expectedChunkKeywords,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function includesKeyword(content: string, keyword: string): boolean {
  return content.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

function calculateSourceRecall(
  results: RetrievedChunk[],
  expectedSourceIds: Set<string>,
  limit: number,
): number {
  const retrievedSourceIds = new Set(results.slice(0, limit).map((result) => result.sourceId));
  const matchedSourceCount = [...expectedSourceIds].filter((sourceId) =>
    retrievedSourceIds.has(sourceId),
  ).length;
  return matchedSourceCount / expectedSourceIds.size;
}

function getKeywordCoverage(
  results: RetrievedChunk[],
  expectedSourceIds: Set<string>,
  expectedKeywords: string[],
  limit: number,
) {
  const relevantContent = results
    .slice(0, limit)
    .filter((result) => expectedSourceIds.has(result.sourceId))
    .flatMap((result) => [result.title, ...result.headingPath, result.content])
    .join('\n');
  const matchedKeywords = expectedKeywords.filter((keyword) =>
    includesKeyword(relevantContent, keyword),
  );
  const matchedKeywordSet = new Set(matchedKeywords);

  return {
    recall: matchedKeywords.length / expectedKeywords.length,
    matchedKeywords,
    missingKeywords: expectedKeywords.filter((keyword) => !matchedKeywordSet.has(keyword)),
  };
}

function evaluateKeywords(
  results: RetrievedChunk[],
  expectedSourceIds: Set<string>,
  expectedKeywords: string[] | undefined,
): {
  keywordRecallAt1?: number;
  keywordRecallAt3?: number;
  keywordRecallAt5?: number;
  firstFullKeywordRank?: number | null;
  matchedKeywords?: string[];
  missingKeywords?: string[];
} {
  if (!expectedKeywords) return {};

  const at1 = getKeywordCoverage(results, expectedSourceIds, expectedKeywords, 1);
  const at3 = getKeywordCoverage(results, expectedSourceIds, expectedKeywords, 3);
  const at5 = getKeywordCoverage(results, expectedSourceIds, expectedKeywords, 5);
  let firstFullKeywordRank: number | null = null;

  for (let rank = 1; rank <= results.length; rank += 1) {
    if (getKeywordCoverage(results, expectedSourceIds, expectedKeywords, rank).recall === 1) {
      firstFullKeywordRank = rank;
      break;
    }
  }

  return {
    keywordRecallAt1: at1.recall,
    keywordRecallAt3: at3.recall,
    keywordRecallAt5: at5.recall,
    firstFullKeywordRank,
    matchedKeywords: at5.matchedKeywords,
    missingKeywords: at5.missingKeywords,
  };
}

function toSource(chunk: RetrievedChunk): RetrievalEvaluationSource {
  return {
    sourceId: chunk.sourceId,
    title: chunk.title,
    chunkIndex: chunk.chunkIndex,
    headingPath: chunk.headingPath,
    content: chunk.content,
    score: chunk.score,
    vectorRank: chunk.vectorRank,
    vectorScore: chunk.vectorScore,
    lexicalRank: chunk.lexicalRank,
    lexicalScore: chunk.lexicalScore,
    fusionScore: chunk.fusionScore,
    matchedTerms: chunk.matchedTerms,
  };
}

function evaluateCase(
  evaluationCase: RetrievalEvaluationCase,
  results: RetrievedChunk[],
  durationMs: number,
): RetrievalEvaluationCaseResult {
  const expectedSourceIds = new Set(evaluationCase.expectedSourceIds);
  const firstRelevantIndex = results.findIndex((result) => expectedSourceIds.has(result.sourceId));
  const firstRelevantRank = firstRelevantIndex === -1 ? null : firstRelevantIndex + 1;
  const keywordEvaluation = evaluateKeywords(
    results,
    expectedSourceIds,
    evaluationCase.expectedChunkKeywords,
  );

  return {
    caseId: evaluationCase.id,
    category: evaluationCase.category,
    query: evaluationCase.query,
    expectedSourceIds: evaluationCase.expectedSourceIds,
    expectedChunkKeywords: evaluationCase.expectedChunkKeywords,
    durationMs,
    firstRelevantRank,
    hitAt1: firstRelevantRank === 1,
    hitAt3: firstRelevantRank !== null && firstRelevantRank <= 3,
    hitAt5: firstRelevantRank !== null && firstRelevantRank <= 5,
    reciprocalRank: firstRelevantRank ? 1 / firstRelevantRank : 0,
    sourceRecallAt1: calculateSourceRecall(results, expectedSourceIds, 1),
    sourceRecallAt3: calculateSourceRecall(results, expectedSourceIds, 3),
    sourceRecallAt5: calculateSourceRecall(results, expectedSourceIds, 5),
    ...keywordEvaluation,
    topResults: results.map(toSource),
  };
}

export function parseRetrievalEvaluationCases(raw: string): RetrievalEvaluationCase[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('评测集必须是有效的 JSON 数组。');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('评测集必须至少包含一条用例。');
  }

  const cases = parsed.map(normalizeCase);
  const ids = new Set<string>();
  for (const evaluationCase of cases) {
    if (ids.has(evaluationCase.id)) {
      throw new Error(`评测用例 id 重复：${evaluationCase.id}`);
    }
    ids.add(evaluationCase.id);
  }
  return cases;
}

export async function getRetrievalEvaluationCorpusStats(): Promise<RetrievalEvaluationCorpusStats> {
  const [documentCount, indexedStates, chunkCount] = await Promise.all([
    db.documents.count(),
    db.documentIndexStates.where('status').equals('indexed').toArray(),
    db.documentChunks.count(),
  ]);
  const indexedSourceCount = indexedStates.filter((state) => state.chunkCount > 0).length;

  return { documentCount, indexedSourceCount, chunkCount };
}

export async function listRetrievalEvaluationSources(): Promise<
  Array<{ id: string; title: string }>
> {
  const chunks = await db.documentChunks.toArray();
  const sources = new Map<string, string>();
  for (const chunk of chunks) {
    sources.set(chunk.sourceId, chunk.title);
  }

  return [...sources]
    .map(([id, title]) => ({ id, title }))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export function validateRetrievalEvaluationSources(
  cases: RetrievalEvaluationCase[],
  sources: Array<{ id: string; title: string }>,
): void {
  const availableSourceIds = new Set(sources.map((source) => source.id));
  const invalidCases = cases
    .map((evaluationCase) => ({
      caseId: evaluationCase.id,
      unknownIds: evaluationCase.expectedSourceIds.filter(
        (sourceId) => !availableSourceIds.has(sourceId),
      ),
    }))
    .filter((evaluationCase) => evaluationCase.unknownIds.length > 0);

  if (invalidCases.length === 0) return;

  const details = invalidCases
    .map(({ caseId, unknownIds }) => `${caseId}: ${unknownIds.join(', ')}`)
    .join('；');
  throw new Error(
    `expectedSourceIds 包含未建立索引的来源 ID：${details}。这里必须填写“可用来源 ID”列表中的实际 ID，不能填写文档标题。`,
  );
}

export async function warmupRetrievalEvaluation(): Promise<number> {
  const startedAt = performance.now();
  await ensureEmbeddingModelReady();
  return performance.now() - startedAt;
}

export async function runRetrievalEvaluation(
  cases: RetrievalEvaluationCase[],
  options: EvaluationRunOptions = {},
): Promise<RetrievalEvaluationRun> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const strategy = options.strategy ?? 'vector';
  const results: RetrievalEvaluationCaseResult[] = [];

  for (const evaluationCase of cases) {
    if (options.shouldContinue && !options.shouldContinue()) break;

    const startedAt = performance.now();
    const retrievedChunks = await searchLocalKnowledge(evaluationCase.query, { limit, strategy });
    results.push(evaluateCase(evaluationCase, retrievedChunks, performance.now() - startedAt));
    options.onProgress?.(results.length, cases.length);
  }

  const durations = results.map((result) => result.durationMs);
  const keywordResults = results.filter((result) => result.keywordRecallAt5 !== undefined);
  const total = results.length;
  const summary: RetrievalEvaluationSummary = {
    completedCases: total,
    hitAt1: total ? results.filter((result) => result.hitAt1).length / total : 0,
    hitAt3: total ? results.filter((result) => result.hitAt3).length / total : 0,
    hitAt5: total ? results.filter((result) => result.hitAt5).length / total : 0,
    mrr: total ? results.reduce((sum, result) => sum + result.reciprocalRank, 0) / total : 0,
    sourceRecallAt1: total
      ? results.reduce((sum, result) => sum + result.sourceRecallAt1, 0) / total
      : 0,
    sourceRecallAt3: total
      ? results.reduce((sum, result) => sum + result.sourceRecallAt3, 0) / total
      : 0,
    sourceRecallAt5: total
      ? results.reduce((sum, result) => sum + result.sourceRecallAt5, 0) / total
      : 0,
    keywordCaseCount: keywordResults.length,
    averageKeywordRecallAt1: keywordResults.length
      ? keywordResults.reduce((sum, result) => sum + (result.keywordRecallAt1 ?? 0), 0) /
        keywordResults.length
      : null,
    averageKeywordRecallAt3: keywordResults.length
      ? keywordResults.reduce((sum, result) => sum + (result.keywordRecallAt3 ?? 0), 0) /
        keywordResults.length
      : null,
    averageKeywordRecallAt5: keywordResults.length
      ? keywordResults.reduce((sum, result) => sum + (result.keywordRecallAt5 ?? 0), 0) /
        keywordResults.length
      : null,
    averageDurationMs: total ? durations.reduce((sum, duration) => sum + duration, 0) / total : 0,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
  };

  return {
    cases: results,
    summary,
    cancelled: results.length < cases.length,
    strategy,
  };
}

export function createRetrievalEvaluationReport(
  label: string,
  warmupMs: number | null,
  corpus: RetrievalEvaluationCorpusStats,
  run: RetrievalEvaluationRun,
): RetrievalEvaluationReport {
  return {
    label: label.trim() || 'local-rag-evaluation',
    createdAt: new Date().toISOString(),
    model: LOCAL_EMBEDDING_MODEL,
    embeddingDimension: LOCAL_EMBEDDING_DIMENSION,
    chunkerVersion: DOCUMENT_CHUNKER_VERSION,
    topK: DEFAULT_LIMIT,
    retrievalStrategy: run.strategy,
    hybridConfig:
      run.strategy === 'hybrid'
        ? {
            minimumCandidates: MIN_HYBRID_CANDIDATES,
            candidateMultiplier: HYBRID_CANDIDATE_MULTIPLIER,
            rrfRankConstant: RRF_RANK_CONSTANT,
            vectorWeight: VECTOR_RRF_WEIGHT,
            lexicalWeight: LEXICAL_RRF_WEIGHT,
            maxChunksPerSource: MAX_CHUNKS_PER_SOURCE,
            uniqueSourceTarget: DIVERSE_SOURCE_TARGET,
          }
        : null,
    warmupMs,
    corpus,
    summary: run.summary,
    cases: run.cases,
  };
}
