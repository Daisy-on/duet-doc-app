import { listIndexedChunks } from './chunkRepository';
import { rankLocalCandidates } from './embeddingClient';
import { DIVERSE_SOURCE_TARGET, fuseRankings, MAX_CHUNKS_PER_SOURCE } from './hybridRanker';
import { rankLexicalCandidates } from './lexicalRetriever';
import type {
  DocumentChunk,
  LocalRetrievalStrategy,
  LocalSearchOptions,
  RetrievedChunk,
} from './types';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 12;
export const MIN_HYBRID_CANDIDATES = 20;
export const HYBRID_CANDIDATE_MULTIPLIER = 4;

interface VectorRankingMatch {
  id: string;
  score: number;
}

type RetrievalDiagnostics = Pick<
  RetrievedChunk,
  | 'retrievalStrategy'
  | 'vectorRank'
  | 'vectorScore'
  | 'lexicalRank'
  | 'lexicalScore'
  | 'fusionScore'
  | 'matchedTerms'
  | 'matchedPhrase'
  | 'phraseBonus'
>;

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toRetrievedChunk(
  chunk: DocumentChunk,
  score: number,
  diagnostics: Partial<RetrievalDiagnostics> = {},
): RetrievedChunk {
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
    ...diagnostics,
  };
}

async function rankVectorMatches(
  query: string,
  chunks: DocumentChunk[],
  limit: number,
): Promise<VectorRankingMatch[]> {
  const ranking = await rankLocalCandidates(
    `query: ${query.trim()}`,
    chunks.map((chunk) => ({ id: chunk.id, embedding: chunk.embedding })),
    limit,
  );
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const normalizedQuery = normalizeQuery(query);

  return ranking.matches
    .map((match): VectorRankingMatch | null => {
      const chunk = chunksById.get(match.id);
      if (!chunk) return null;
      const titleBoost =
        normalizedQuery && normalizeQuery(chunk.title).includes(normalizedQuery) ? 0.1 : 0;
      return { id: match.id, score: match.score + titleBoost };
    })
    .filter((match): match is VectorRankingMatch => match !== null)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function takeDiverseResults(results: RetrievedChunk[], limit: number): RetrievedChunk[] {
  const sourceCounts = new Map<string, number>();
  const selectedIds = new Set<string>();
  const selected: RetrievedChunk[] = [];
  const uniqueSourceTarget = Math.min(DIVERSE_SOURCE_TARGET, limit);

  for (const result of results) {
    if (sourceCounts.has(result.sourceId)) continue;

    selected.push(result);
    selectedIds.add(result.id);
    sourceCounts.set(result.sourceId, 1);
    if (selected.length === uniqueSourceTarget) break;
  }

  if (selected.length === limit) return selected;

  for (const result of results) {
    if (selectedIds.has(result.id)) continue;

    const sourceCount = sourceCounts.get(result.sourceId) ?? 0;
    if (sourceCount >= MAX_CHUNKS_PER_SOURCE) continue;

    selected.push(result);
    selectedIds.add(result.id);
    sourceCounts.set(result.sourceId, sourceCount + 1);
    if (selected.length === limit) break;
  }

  return selected;
}

async function searchByVector(
  query: string,
  chunks: DocumentChunk[],
  limit: number,
): Promise<RetrievedChunk[]> {
  const vectorMatches = await rankVectorMatches(query, chunks, Math.min(chunks.length, limit * 3));
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  return vectorMatches.slice(0, limit).map((match, index) =>
    toRetrievedChunk(chunksById.get(match.id)!, match.score, {
      retrievalStrategy: 'vector',
      vectorRank: index + 1,
      vectorScore: match.score,
    }),
  );
}

async function searchByHybrid(
  query: string,
  chunks: DocumentChunk[],
  limit: number,
): Promise<RetrievedChunk[]> {
  const candidateLimit = Math.min(
    chunks.length,
    Math.max(MIN_HYBRID_CANDIDATES, limit * HYBRID_CANDIDATE_MULTIPLIER),
  );
  const vectorRankingPromise = rankVectorMatches(query, chunks, candidateLimit);
  const lexicalMatches = rankLexicalCandidates(query, chunks, candidateLimit);
  const vectorMatches = await vectorRankingPromise;
  const fusedMatches = fuseRankings(vectorMatches, lexicalMatches);
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  const results = fusedMatches
    .map((match): RetrievedChunk | null => {
      const chunk = chunksById.get(match.id);
      if (!chunk) return null;
      return toRetrievedChunk(chunk, match.score, {
        retrievalStrategy: 'hybrid',
        vectorRank: match.vectorRank,
        vectorScore: match.vectorScore,
        lexicalRank: match.lexicalRank,
        lexicalScore: match.lexicalScore,
        fusionScore: match.score,
        matchedTerms: match.matchedTerms,
        matchedPhrase: match.matchedPhrase,
        phraseBonus: match.phraseBonus,
      });
    })
    .filter((result): result is RetrievedChunk => result !== null);

  return takeDiverseResults(results, limit);
}

export async function searchLocalKnowledge(
  query: string,
  options: LocalSearchOptions = {},
): Promise<RetrievedChunk[]> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const strategy: LocalRetrievalStrategy = options.strategy ?? 'vector';
  const chunks = await listIndexedChunks({
    kbId: options.kbId,
    sourceTypes: options.sourceTypes,
  });
  if (chunks.length === 0) return [];

  if (options.sortBy === 'updatedAt') {
    const seenSources = new Set<string>();
    return [...chunks]
      .sort((left, right) => right.sourceUpdatedAt - left.sourceUpdatedAt)
      .filter((chunk) => {
        if (seenSources.has(chunk.sourceId)) return false;
        seenSources.add(chunk.sourceId);
        return true;
      })
      .slice(0, limit)
      .map((chunk) => toRetrievedChunk(chunk, 1));
  }

  return strategy === 'hybrid'
    ? searchByHybrid(query, chunks, limit)
    : searchByVector(query, chunks, limit);
}
