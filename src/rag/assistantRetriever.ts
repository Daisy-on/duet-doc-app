import { inspectModelInstallation } from '../models/modelCache';
import type { KnowledgeSource } from '../store/aiWritingStore';
import { getCurrentLocalSourceIds, listIndexedChunks } from './chunkRepository';
import { appendAdjacentEvidence } from './adjacentEvidence';
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
): Promise<{ hasIndex: boolean; hits: AssistantHit[]; notice?: string }> {
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
    const localSources = installed ? await getCurrentLocalSourceIds() : new Set<string>();
    let local: RetrievedChunk[] = [];
    let localFailed = false;
    let localError: unknown;
    if (installed && localSourceTypes.length > 0) {
      try {
        local = await searchLocalKnowledge(query, {
          sourceTypes: localSourceTypes,
          sortBy: options.sortBy,
          limit,
          strategy: 'hybrid',
          queryEmbedding: embedding,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        localFailed = true;
        localError = error;
      }
    }
    const minimumUpdatedAt = options.timeRangeDays
      ? Date.now() - options.timeRangeDays * 24 * 60 * 60 * 1000
      : 0;
    const currentLocal = local.filter((chunk) => chunk.sourceUpdatedAt >= minimumUpdatedAt);
    let remote: Awaited<ReturnType<typeof searchCloudRag>> = { has_index: false, hits: [] };
    let cloudFailed = false;
    try {
      remote = await searchCloudRag(
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
    } catch (error) {
      if (signal?.aborted) throw error;
      if (currentLocal.length === 0) throw error;
      cloudFailed = true;
    }
    if (localFailed && !remote.has_index) throw localError;
    const localHits = currentLocal.map(fromLocal);
    const selectedCloud = remote.hits.filter(
      (hit) => hit.source_type === 'image' || !localSources.has(hit.source_id),
    );
    const cloudHits = selectedCloud.map(fromCloud);
    const hits = [
      ...localHits.map((hit, index) => ({ ...hit, score: 1 / (60 + index + 1) })),
      ...cloudHits.map((hit, index) => ({ ...hit, score: 1 / (60 + index + 1) })),
    ];
    if (options.sortBy === 'updatedAt') {
      hits.sort((left, right) => right.sourceUpdatedAt - left.sourceUpdatedAt);
    } else {
      hits.sort((left, right) => right.score - left.score);
    }
    const primary = hits.slice(0, limit);
    const localIds = new Set(
      primary.filter((hit) => hit.origin === 'local_retrieval').map((hit) => hit.source.sourceId),
    );
    const localCandidates = localIds.size
      ? (await listIndexedChunks({}))
          .filter((chunk) => localIds.has(chunk.sourceId))
          .map((chunk) => fromLocal({ ...chunk, score: 0 }))
      : [];
    const cloudCandidates = selectedCloud.flatMap((hit) =>
      (hit.neighbors ?? []).map((neighbor) =>
        fromCloud({ ...hit, ...neighbor, neighbors: [], score: hit.score }),
      ),
    );
    const hasLocalIndex =
      currentLocal.length > 0 ||
      (!remote.has_index &&
        Boolean(installed) &&
        localSourceTypes.length > 0 &&
        (await listIndexedChunks({ sourceTypes: localSourceTypes })).length > 0);
    signal?.throwIfAborted();
    return {
      hasIndex: remote.has_index || hasLocalIndex,
      hits: appendAdjacentEvidence(primary, [...localCandidates, ...cloudCandidates]),
      notice: cloudFailed
        ? '云端检索暂不可用，本次仅使用本地文字索引，未检索云端图片。'
        : localFailed
          ? '本地检索暂不可用，本次仅使用云端索引。'
          : undefined,
    };
  };
  return installed ? withEmbeddingRuntime(search) : search();
}
