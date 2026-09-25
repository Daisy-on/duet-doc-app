import { authFetch } from '../auth/authClient';

export interface CloudRagHit {
  source_id: string;
  source_type: 'document' | 'memo' | 'image';
  document_id: string;
  kb_id: string;
  title: string;
  chunk_id: string;
  chunk_index: number;
  heading_path: string[];
  content: string;
  asset_id: string | null;
  score: number;
  source_updated_at: string;
  neighbors?: Array<{
    chunk_id: string;
    chunk_index: number;
    heading_path: string[];
    content: string;
  }>;
}

export interface CloudRagSearchResult {
  has_index: boolean;
  hits: CloudRagHit[];
}

export async function searchCloudRag(
  workspaceId: string,
  request: {
    query: string;
    embedding?: Float32Array;
    allowCloudEmbedding: boolean;
    sourceTypes?: Array<'document' | 'memo' | 'image'>;
    sortBy?: 'relevance' | 'updatedAt';
    timeRangeDays?: number;
    topK?: number;
  },
  signal?: AbortSignal,
): Promise<CloudRagSearchResult> {
  const response = await authFetch(
    `/api/v1/rag/workspaces/${encodeURIComponent(workspaceId)}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: request.query,
        embedding: request.embedding ? Array.from(request.embedding) : undefined,
        allow_cloud_embedding: request.allowCloudEmbedding,
        source_types: request.sourceTypes,
        sort_by: request.sortBy,
        time_range_days: request.timeRangeDays,
        top_k: request.topK,
      }),
      signal,
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || `云端检索失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as CloudRagSearchResult;
}
