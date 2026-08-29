import { listIndexedChunks } from './chunkRepository';
import { rankLocalCandidates } from './embeddingClient';
import type { LocalSearchOptions, RetrievedChunk } from './types';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 12;

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function toRetrievedChunk(
  chunk: Awaited<ReturnType<typeof listIndexedChunks>>[number],
  score: number,
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
  };
}

export async function searchLocalKnowledge(
  query: string,
  options: LocalSearchOptions = {},
): Promise<RetrievedChunk[]> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
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

  const ranking = await rankLocalCandidates(
    `query: ${query.trim()}`,
    chunks.map((chunk) => ({ id: chunk.id, embedding: chunk.embedding })),
    Math.min(chunks.length, limit * 3),
  );
  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const normalizedQuery = normalizeQuery(query);

  return ranking.matches
    .map((match) => {
      const chunk = chunksById.get(match.id);
      if (!chunk) return null;
      const titleBoost =
        normalizedQuery && normalizeQuery(chunk.title).includes(normalizedQuery) ? 0.1 : 0;
      return toRetrievedChunk(chunk, match.score + titleBoost);
    })
    .filter((chunk): chunk is RetrievedChunk => chunk !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
