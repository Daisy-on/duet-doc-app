import { listIndexedChunks } from './chunkRepository';
import { createDocumentPassageText } from './documentChunker';
import { embedPassagesInBatches, withEmbeddingRuntime } from './embeddingClient';

interface ComparisonCase {
  id: string;
  query: string;
  expectedText?: string;
  expectedTexts?: string[];
}

const MAX_QUERIES = 20;
const MAX_PASSAGES = 2000;
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
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.query !== 'string' ||
        !item.query.trim() ||
        (item.expectedTexts !== undefined && !Array.isArray(item.expectedTexts)) ||
        (typeof item.expectedText !== 'string' && !Array.isArray(item.expectedTexts)),
    )
  ) {
    throw new Error('每条问题都需要 id、query，以及 expectedText 或 expectedTexts。');
  }
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error('问题 id 不能重复。');
  }

  const chunks = (await listIndexedChunks({})).filter((chunk) => chunk.sourceId === sourceId);
  if (!chunks.length) throw new Error('没有找到该文档的当前本地索引，请先在测试页建立索引。');
  if (chunks.length > MAX_PASSAGES) throw new Error(`全文对照最多支持 ${MAX_PASSAGES} 个分块。`);
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const matches = cases.map((item) => {
    const anchors = item.expectedTexts ?? (item.expectedText ? [item.expectedText] : []);
    if (!anchors.length || anchors.some((anchor) => typeof anchor !== 'string' || !anchor.trim())) {
      throw new Error(`${item.id} 的答案原文片段不能为空。`);
    }
    const matched = anchors.map((anchor) =>
      chunks.filter((chunk) => chunk.content.includes(anchor.trim())),
    );
    if (matched.some((rows) => rows.length === 0)) {
      throw new Error(`${item.id} 有答案原文未命中当前文档分块。`);
    }
    const ids = new Set(matched.flat().map((chunk) => chunk.id));
    return chunks.filter((chunk) => ids.has(chunk.id));
  });

  const fixture = await withEmbeddingRuntime(async () => {
    const inputs = cases.map((item) => queryInput(item.query));
    const { vectors } = await embedPassagesInBatches(inputs);
    return {
      version: 3,
      localModel: 'bge-large-zh-v1.5-fp16',
      sourceId,
      totalChunkCount: chunks.length,
      passages: chunks.map((chunk) => ({
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
  anchor.download = 'duet-bge-full-document.json';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { passageCount: chunks.length, queryCount: cases.length };
}
