interface EvidenceHit {
  source: {
    sourceId: string;
    sourceType: string;
    chunkIndex: number;
    headingPath: string[];
  };
  chunkId: string;
  score: number;
  origin: string;
  sourceUpdatedAt: number;
}

export function appendAdjacentEvidence<T extends EvidenceHit>(
  hits: T[],
  candidates: T[],
  limit = 20,
): T[] {
  const result = [...hits];
  const seen = new Set(hits.map((hit) => `${hit.source.sourceId}:${hit.chunkId}`));
  for (const hit of hits) {
    if (hit.source.sourceType === 'image') continue;
    for (const chunkIndex of [hit.source.chunkIndex - 1, hit.source.chunkIndex + 1]) {
      if (result.length >= limit) return result;
      const candidate = candidates.find(
        (row) =>
          row.source.sourceId === hit.source.sourceId &&
          row.source.sourceType === hit.source.sourceType &&
          row.source.chunkIndex === chunkIndex &&
          row.source.headingPath.length === hit.source.headingPath.length &&
          row.source.headingPath.every(
            (heading, index) => heading === hit.source.headingPath[index],
          ) &&
          row.origin === hit.origin &&
          row.sourceUpdatedAt === hit.sourceUpdatedAt,
      );
      if (!candidate) continue;
      const key = `${candidate.source.sourceId}:${candidate.chunkId}`;
      if (seen.has(key)) continue;
      result.push({ ...candidate, score: hit.score - 0.000001 });
      seen.add(key);
    }
  }
  return result;
}
