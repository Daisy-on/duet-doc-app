import type { DocumentChunk } from './types';

const TITLE_WEIGHT = 3;
const HEADING_WEIGHT = 2;
const CONTENT_WEIGHT = 1;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
export const TITLE_PHRASE_BONUS = 8;
export const HEADING_PHRASE_BONUS = 4;
export const CONTENT_PHRASE_BONUS = 2;
export const MIN_PHRASE_LENGTH = 4;

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
const MULTI_CHARACTER_HAN_PHRASE = /^\p{Script=Han}{4,}$/u;

export interface LexicalMatch {
  id: string;
  score: number;
  matchedTerms: string[];
  matchedPhrase?: string;
  phraseBonus?: number;
}

interface TokenizedCandidate {
  id: string;
  weightedTermFrequency: Map<string, number>;
  terms: Set<string>;
  length: number;
  normalizedTitle: string;
  normalizedHeading: string;
  normalizedContent: string;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function normalizePhrase(value: string): string {
  return normalizeText(value).replace(/[\p{P}\p{S}\s]+/gu, '');
}

function phraseLength(value: string): number {
  return [...value].length;
}

function isEligiblePhrase(terms: string[], phrase: string): boolean {
  if (phraseLength(phrase) < MIN_PHRASE_LENGTH) return false;

  return terms.length >= 2 || MULTI_CHARACTER_HAN_PHRASE.test(terms[0]);
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

function extractQueryPhrases(value: string): string[] {
  const termGroups: string[][] = [];
  let currentGroup: string[] = [];
  let adjacentHanCharacters: string[] = [];

  const flushAdjacentHanCharacters = () => {
    if (adjacentHanCharacters.length >= 2) {
      currentGroup.push(adjacentHanCharacters.join(''));
    }
    adjacentHanCharacters = [];
  };
  const flushGroup = () => {
    flushAdjacentHanCharacters();
    if (currentGroup.length > 0) termGroups.push(currentGroup);
    currentGroup = [];
  };

  for (const segment of segmenter.segment(normalizeText(value))) {
    if (!segment.isWordLike) continue;

    const term = segment.segment.trim();
    if (STOP_WORDS.has(term)) {
      flushGroup();
    } else if (SINGLE_HAN_CHARACTER.test(term)) {
      adjacentHanCharacters.push(term);
    } else if (shouldKeepTerm(term)) {
      flushAdjacentHanCharacters();
      currentGroup.push(term);
    }
  }
  flushGroup();

  const phrases = new Set<string>();
  for (const terms of termGroups) {
    for (let size = 1; size <= Math.min(4, terms.length); size += 1) {
      for (let index = 0; index <= terms.length - size; index += 1) {
        const phraseTerms = terms.slice(index, index + size);
        const phrase = normalizePhrase(phraseTerms.join(''));
        if (isEligiblePhrase(phraseTerms, phrase)) phrases.add(phrase);
      }
    }
  }

  return [...phrases].sort(
    (left, right) => phraseLength(right) - phraseLength(left) || left.localeCompare(right),
  );
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
  const normalizedTitle = normalizePhrase(chunk.title);
  const phraseHeadingPath =
    normalizePhrase(chunk.headingPath[0] ?? '') === normalizedTitle
      ? chunk.headingPath.slice(1)
      : chunk.headingPath;

  addTerms(weightedTermFrequency, titleTerms, TITLE_WEIGHT);
  addTerms(weightedTermFrequency, headingTerms, HEADING_WEIGHT);
  addTerms(weightedTermFrequency, contentTerms, CONTENT_WEIGHT);

  return {
    id: chunk.id,
    weightedTermFrequency,
    terms: new Set(weightedTermFrequency.keys()),
    length: titleTerms.length + headingTerms.length + contentTerms.length,
    normalizedTitle,
    normalizedHeading: normalizePhrase(phraseHeadingPath.join(' ')),
    normalizedContent: normalizePhrase(chunk.content),
  };
}

function findPhraseMatch(
  candidate: TokenizedCandidate,
  queryPhrases: string[],
  normalizedQuery: string,
): { phrase: string; bonus: number } | null {
  if (
    phraseLength(candidate.normalizedTitle) >= MIN_PHRASE_LENGTH &&
    normalizedQuery.includes(candidate.normalizedTitle)
  ) {
    return { phrase: candidate.normalizedTitle, bonus: TITLE_PHRASE_BONUS };
  }

  const headingPhrase = queryPhrases.find((phrase) => candidate.normalizedHeading.includes(phrase));
  if (headingPhrase) return { phrase: headingPhrase, bonus: HEADING_PHRASE_BONUS };

  const contentPhrase = queryPhrases.find((phrase) => candidate.normalizedContent.includes(phrase));
  return contentPhrase ? { phrase: contentPhrase, bonus: CONTENT_PHRASE_BONUS } : null;
}

export function rankLexicalCandidates(
  query: string,
  chunks: DocumentChunk[],
  limit: number,
): LexicalMatch[] {
  const queryTerms = [...new Set(tokenize(query))];
  const queryPhrases = extractQueryPhrases(query);
  if ((queryTerms.length === 0 && queryPhrases.length === 0) || chunks.length === 0) return [];

  const candidates = chunks.map(tokenizeCandidate);
  const normalizedQuery = normalizePhrase(query);
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

      const phraseMatch = findPhraseMatch(candidate, queryPhrases, normalizedQuery);
      score += phraseMatch?.bonus ?? 0;

      return score > 0
        ? {
            id: candidate.id,
            score,
            matchedTerms,
            matchedPhrase: phraseMatch?.phrase,
            phraseBonus: phraseMatch?.bonus,
          }
        : null;
    })
    .filter((match): match is LexicalMatch => match !== null)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}
