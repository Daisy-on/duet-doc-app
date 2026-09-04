import type { LexicalMatch } from './lexicalRetriever';

export const RRF_RANK_CONSTANT = 60;
export const VECTOR_RRF_WEIGHT = 1;
export const LEXICAL_RRF_WEIGHT = 1;
export const MAX_CHUNKS_PER_SOURCE = 2;
export const DIVERSE_SOURCE_TARGET = 3;

export interface VectorMatch {
  id: string;
  score: number;
}

export interface HybridMatch {
  id: string;
  score: number;
  vectorRank?: number;
  vectorScore?: number;
  lexicalRank?: number;
  lexicalScore?: number;
  matchedTerms?: string[];
  matchedPhrase?: string;
  phraseBonus?: number;
}

export function fuseRankings(
  vectorMatches: VectorMatch[],
  lexicalMatches: LexicalMatch[],
): HybridMatch[] {
  const matches = new Map<string, HybridMatch>();

  vectorMatches.forEach((match, index) => {
    const vectorRank = index + 1;
    matches.set(match.id, {
      id: match.id,
      score: VECTOR_RRF_WEIGHT / (RRF_RANK_CONSTANT + vectorRank),
      vectorRank,
      vectorScore: match.score,
    });
  });

  lexicalMatches.forEach((match, index) => {
    const lexicalRank = index + 1;
    const existing = matches.get(match.id);
    const lexicalScore = LEXICAL_RRF_WEIGHT / (RRF_RANK_CONSTANT + lexicalRank);

    matches.set(match.id, {
      ...existing,
      id: match.id,
      score: (existing?.score ?? 0) + lexicalScore,
      lexicalRank,
      lexicalScore: match.score,
      matchedTerms: match.matchedTerms,
      matchedPhrase: match.matchedPhrase,
      phraseBonus: match.phraseBonus,
    });
  });

  return [...matches.values()].sort(
    (left, right) =>
      right.score - left.score ||
      Math.min(left.vectorRank ?? Infinity, left.lexicalRank ?? Infinity) -
        Math.min(right.vectorRank ?? Infinity, right.lexicalRank ?? Infinity) ||
      left.id.localeCompare(right.id),
  );
}
