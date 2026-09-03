import type { DocumentChunk } from './types';

const TITLE_WEIGHT = 3;
const HEADING_WEIGHT = 2;
const CONTENT_WEIGHT = 1;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const STOP_WORDS = new Set([
  '我',
  '我的',
  '我有',
  '我在',
  '有没有',
  '没有',
  '曾经',
  '是否',
  '的',
  '了',
  '吗',
  '呢',
  '在',
  '哪',
  '篇',
  '一篇',
  '哪篇',
  '找到',
  '告诉',
  '什么',
  '关于',
  '名为',
  '和',
  '与',
  '及',
  '或',
]);

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const SINGLE_HAN_CHARACTER = /^\p{Script=Han}$/u;

export interface LexicalMatch {
  id: string;
  score: number;
  matchedTerms: string[];
}

interface TokenizedCandidate {
  id: string;
  weightedTermFrequency: Map<string, number>;
  terms: Set<string>;
  length: number;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function shouldKeepTerm(term: string): boolean {
  return Boolean(term) && !STOP_WORDS.has(term) && !SINGLE_HAN_CHARACTER.test(term);
}

function addHanNgrams(target: string[], characters: string[]): void {
  if (characters.length < 2) return;

  const text = characters.join('');
  for (const size of [2, 3]) {
    for (let index = 0; index <= text.length - size; index += 1) {
      const term = text.slice(index, index + size);
      if (shouldKeepTerm(term)) target.push(term);
    }
  }
}

function tokenize(value: string): string[] {
  const terms: string[] = [];
  let adjacentHanCharacters: string[] = [];

  const flushAdjacentHanCharacters = () => {
    addHanNgrams(terms, adjacentHanCharacters);
    adjacentHanCharacters = [];
  };

  for (const segment of segmenter.segment(normalizeText(value))) {
    const term = segment.segment.trim();

    if (segment.isWordLike && SINGLE_HAN_CHARACTER.test(term)) {
      if (STOP_WORDS.has(term)) {
        flushAdjacentHanCharacters();
      } else {
        adjacentHanCharacters.push(term);
      }
      continue;
    }

    flushAdjacentHanCharacters();
    if (segment.isWordLike && shouldKeepTerm(term)) terms.push(term);
  }

  flushAdjacentHanCharacters();
  return terms;
}

function addTerms(target: Map<string, number>, terms: string[], weight: number): void {
  for (const term of terms) {
    target.set(term, (target.get(term) ?? 0) + weight);
  }
}

function tokenizeCandidate(chunk: DocumentChunk): TokenizedCandidate {
  const titleTerms = tokenize(chunk.title);
  const headingTerms = tokenize(chunk.headingPath.join(' '));
  const contentTerms = tokenize(chunk.content);
  const weightedTermFrequency = new Map<string, number>();

  addTerms(weightedTermFrequency, titleTerms, TITLE_WEIGHT);
  addTerms(weightedTermFrequency, headingTerms, HEADING_WEIGHT);
  addTerms(weightedTermFrequency, contentTerms, CONTENT_WEIGHT);

  return {
    id: chunk.id,
    weightedTermFrequency,
    terms: new Set(weightedTermFrequency.keys()),
    length: titleTerms.length + headingTerms.length + contentTerms.length,
  };
}

export function rankLexicalCandidates(
  query: string,
  chunks: DocumentChunk[],
  limit: number,
): LexicalMatch[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const candidates = chunks.map(tokenizeCandidate);
  const averageLength =
    candidates.reduce((sum, candidate) => sum + candidate.length, 0) / candidates.length || 1;
  const documentFrequency = new Map<string, number>();

  for (const term of queryTerms) {
    documentFrequency.set(term, candidates.filter((candidate) => candidate.terms.has(term)).length);
  }

  return candidates
    .map((candidate): LexicalMatch | null => {
      let score = 0;
      const matchedTerms: string[] = [];

      for (const term of queryTerms) {
        const termFrequency = candidate.weightedTermFrequency.get(term) ?? 0;
        if (termFrequency === 0) continue;

        matchedTerms.push(term);
        const frequency = documentFrequency.get(term) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 + (candidates.length - frequency + 0.5) / (frequency + 0.5),
        );
        const lengthNormalization =
          BM25_K1 * (1 - BM25_B + BM25_B * (candidate.length / averageLength));
        score +=
          inverseDocumentFrequency *
          ((termFrequency * (BM25_K1 + 1)) / (termFrequency + lengthNormalization));
      }

      return score > 0 ? { id: candidate.id, score, matchedTerms } : null;
    })
    .filter((match): match is LexicalMatch => match !== null)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}
