import { inspectModelInstallation } from '../models/modelCache';
import type { KnowledgeSource } from '../store/aiWritingStore';
import { getCurrentLocalSourceIds } from './chunkRepository';
import { searchCloudRag, type CloudRagHit } from './cloudRagSearch';
import { embedPassages, withEmbeddingRuntime } from './embeddingClient';
import { searchLocalKnowledge } from './localRetriever';
import type { RetrievedChunk } from './types';

export interface AssistantHit {
  source: KnowledgeSource;
  content: string;
  chunkId: string;
  score: number;
  origin: 'local_retrieval' | 'cloud_retrieval';
  sourceUpdatedAt: number;
}

function fromLocal(chunk: RetrievedChunk): AssistantHit {
  return {
    source: {
      sourceId: chunk.sourceId,
      sourceType: chunk.sourceType,
      documentId: chunk.sourceId,
      kbId: chunk.kbId,
      title: chunk.title,
      chunkIndex: chunk.chunkIndex,
      headingPath: chunk.headingPath,
    },
    content: chunk.content,
    chunkId: chunk.id,
    score: chunk.score,
    origin: 'local_retrieval',
    sourceUpdatedAt: chunk.sourceUpdatedAt,
  };
}

function fromCloud(hit: CloudRagHit): AssistantHit {
  return {
    source: {
      sourceId: hit.source_id,
      sourceType: hit.source_type,
      documentId: hit.document_id,
      kbId: hit.kb_id,
      assetId: hit.asset_id ?? undefined,
      title: hit.title,
      chunkIndex: hit.chunk_index,
      headingPath: hit.heading_path,
    },
    content: hit.content,
    chunkId: hit.chunk_id,
    score: hit.score,
    origin: 'cloud_retrieval',
    sourceUpdatedAt: Date.parse(hit.source_updated_at),
  };
}

export async function searchAssistantKnowledge(
  workspaceId: string,
  query: string,
  options: {
    sourceTypes?: Array<'document' | 'memo' | 'image' | 'selection'>;
    sortBy?: 'relevance' | 'updatedAt';
    timeRangeDays?: number;
    topK?: number;
    allowCloudQuery: boolean;
  },
  signal?: AbortSignal,
): Promise<{ hasIndex: boolean; hits: AssistantHit[] }> {
  const installed = await inspectModelInstallation('bge-large-zh-v1.5-fp16').catch(() => null);
  if (!installed && !options.allowCloudQuery) {
    throw new Error('此设备未安装语义模型。请先下载模型，或在输入框启用按次计费的云端检索。');
  }

  const sourceTypes: Array<'document' | 'memo' | 'image'> = options.sourceTypes
    ? [
        ...options.sourceTypes.filter(
          (type): type is 'document' | 'memo' | 'image' => type !== 'selection',
        ),
        ...(options.sourceTypes.includes('document') && !options.sourceTypes.includes('image')
          ? ['image' as const]
          : []),
      ]
    : ['document', 'memo', 'image'];
  const localSourceTypes = sourceTypes.filter(
    (type): type is 'document' | 'memo' => type === 'document' || type === 'memo',
  );
  const limit = Math.min(Math.max(options.topK ?? 5, 1), 12);
  const search = async () => {
    signal?.throwIfAborted();
    const embedding = installed
      ? (await embedPassages([`为这个句子生成表示以用于检索相关文章：${query.trim()}`])).vectors[0]
      : undefined;
    const local =
      installed && localSourceTypes.length > 0
        ? await searchLocalKnowledge(query, {
            sourceTypes: localSourceTypes,
            sortBy: options.sortBy,
            limit,
            strategy: 'hybrid',
            queryEmbedding: embedding,
          })
        : [];
    const minimumUpdatedAt = options.timeRangeDays
      ? Date.now() - options.timeRangeDays * 24 * 60 * 60 * 1000
      : 0;
    const currentLocal = local.filter((chunk) => chunk.sourceUpdatedAt >= minimumUpdatedAt);
    const remote = await searchCloudRag(
      workspaceId,
      {
        query,
        embedding,
        allowCloudEmbedding: !installed && options.allowCloudQuery,
        sourceTypes,
        sortBy: options.sortBy,
        timeRangeDays: options.timeRangeDays,
        topK: limit,
      },
      signal,
    );
    const localSources = installed ? await getCurrentLocalSourceIds() : new Set<string>();
    const localHits = currentLocal.map(fromLocal);
    const cloudHits = remote.hits
      .filter((hit) => hit.source_type === 'image' || !localSources.has(hit.source_id))
      .map(fromCloud);
    const hits = [
      ...localHits.map((hit, index) => ({ ...hit, score: 1 / (60 + index + 1) })),
      ...cloudHits.map((hit, index) => ({ ...hit, score: 1 / (60 + index + 1) })),
    ];
    if (options.sortBy === 'updatedAt') {
      hits.sort((left, right) => right.sourceUpdatedAt - left.sourceUpdatedAt);
    } else {
      hits.sort((left, right) => right.score - left.score);
    }
    return { hasIndex: remote.has_index || currentLocal.length > 0, hits: hits.slice(0, limit) };
  };
  return installed ? withEmbeddingRuntime(search) : search();
}
