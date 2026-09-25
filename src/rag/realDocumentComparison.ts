import { listIndexedChunks } from './chunkRepository';
import { createDocumentPassageText } from './documentChunker';
import { embedPassagesInBatches, withEmbeddingRuntime } from './embeddingClient';

interface ComparisonCase {
  id: string;
  query: string;
  expectedText: string;
}

const MAX_PASSAGES = 64;
const MAX_QUERIES = 20;
const queryInput = (query: string) => `为这个句子生成表示以用于检索相关文章：${query.trim()}`;

export async function exportRealDocumentComparison(
  sourceId: string,
  rawCases: string,
): Promise<{
  passageCount: number;
  queryCount: number;
}> {
  const parsed: unknown = JSON.parse(rawCases);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_QUERIES) {
    throw new Error(`请输入 1-${MAX_QUERIES} 条问题组成的 JSON 数组。`);
  }
  const cases = parsed as ComparisonCase[];
  if (
    cases.some(
      (item) => !item || !item.id?.trim() || !item.query?.trim() || !item.expectedText?.trim(),
    )
  ) {
    throw new Error('每条问题都需要 id、query 和 expectedText（答案所在块的原文片段）。');
  }
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error('问题 id 不能重复。');
  }

  const chunks = (await listIndexedChunks({})).filter((chunk) => chunk.sourceId === sourceId);
  if (!chunks.length) throw new Error('没有找到该文档的当前本地索引，请先在测试页建立索引。');
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const matches = cases.map((item) =>
    chunks.filter((chunk) => chunk.content.includes(item.expectedText.trim())),
  );
  if (matches.some((rows) => rows.length === 0)) {
    throw new Error('至少一条 expectedText 未命中当前文档分块，请选取同一块内的短原文片段。');
  }
  const relevantIds = new Set(matches.flat().map((chunk) => chunk.id));
  if (relevantIds.size > MAX_PASSAGES) throw new Error('匹配块过多，请缩短 expectedText。');
  const selected = chunks.filter((chunk) => relevantIds.has(chunk.id));
  const distractors = chunks.filter((chunk) => !relevantIds.has(chunk.id));
  const count = Math.min(MAX_PASSAGES - selected.length, distractors.length);
  for (let index = 0; index < count; index++) {
    selected.push(distractors[Math.floor((index * distractors.length) / count)]);
  }
  selected.sort((a, b) => a.chunkIndex - b.chunkIndex);

  const fixture = await withEmbeddingRuntime(async () => {
    const inputs = cases.map((item) => queryInput(item.query));
    const { vectors } = await embedPassagesInBatches(inputs);
    return {
      version: 2,
      localModel: 'bge-large-zh-v1.5-fp16',
      sourceId,
      totalChunkCount: chunks.length,
      passages: selected.map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        text: createDocumentPassageText(chunk),
        embedding: Array.from(chunk.embedding),
      })),
      queries: cases.map((item, index) => ({
        id: item.id,
        input: inputs[index],
        expectedPassageIds: matches[index].map((chunk) => chunk.id),
        embedding: Array.from(vectors[index]),
      })),
    };
  });
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(fixture)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'duet-bge-real-document.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { passageCount: selected.length, queryCount: cases.length };
}
