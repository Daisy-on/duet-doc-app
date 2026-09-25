import { authFetch } from '../auth/authClient';
import { db } from '../db';
import { getDocumentFingerprint } from './documentChunker';
import {
  DOCUMENT_CHUNKER_VERSION,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
  type DocumentSourceType,
} from './types';

interface RemoteTextIndexStatus {
  source_id: string;
  source_revision: number;
  source_fingerprint: string | null;
  embedding_model: string | null;
  embedding_dimension: number | null;
  chunker_version: string | null;
  status: 'pending' | 'ready' | 'stale' | 'error';
}

function describeValidationError(detail: unknown): string | null {
  if (typeof detail === 'string') return detail;
  if (!Array.isArray(detail)) return null;

  const messages = detail
    .slice(0, 3)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const validation = entry as { loc?: unknown; msg?: unknown };
      const location = Array.isArray(validation.loc)
        ? validation.loc.filter((part) => part !== 'body').join('.')
        : '';
      const message = typeof validation.msg === 'string' ? validation.msg : '';
      if (!message) return null;
      return location ? `${location}：${message}` : message;
    })
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join('；') : null;
}

async function setCloudUploadState(
  sourceId: string,
  status: 'uploaded' | 'error',
  options: { error?: string; revision?: number } = {},
): Promise<void> {
  const state = await db.documentIndexStates.get(sourceId);
  if (!state) return;
  await db.documentIndexStates.put({
    ...state,
    cloudUploadStatus: status,
    cloudUploadError: options.error,
    cloudUploadedRevision: options.revision,
  });
}

function isCurrentRemoteIndex(
  remote: RemoteTextIndexStatus | undefined,
  revision: number,
  fingerprint: string,
): boolean {
  return (
    remote?.status === 'ready' &&
    remote.source_revision === revision &&
    remote.source_fingerprint === fingerprint &&
    remote.embedding_model === LOCAL_EMBEDDING_MODEL &&
    remote.embedding_dimension === LOCAL_EMBEDDING_DIMENSION &&
    remote.chunker_version === DOCUMENT_CHUNKER_VERSION
  );
}

async function loadRemoteStatuses(workspaceId: string) {
  const response = await authFetch(
    `/api/v1/rag/workspaces/${encodeURIComponent(workspaceId)}/text-indexes`,
  );
  if (!response.ok) {
    throw new Error(`读取云端文本索引状态失败（HTTP ${response.status}）`);
  }
  const statuses = (await response.json()) as RemoteTextIndexStatus[];
  return new Map(statuses.map((status) => [status.source_id, status]));
}

async function uploadSourceIndex(
  workspaceId: string,
  sourceId: string,
  sourceType: DocumentSourceType,
  sourceRevision: number,
  sourceFingerprint: string,
) {
  try {
    const chunks = await db.documentChunks.where('sourceId').equals(sourceId).sortBy('chunkIndex');
    const response = await authFetch(
      `/api/v1/rag/workspaces/${encodeURIComponent(workspaceId)}/text-indexes/${sourceType}/${encodeURIComponent(sourceId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_revision: sourceRevision,
          source_fingerprint: sourceFingerprint,
          embedding_model: LOCAL_EMBEDDING_MODEL,
          embedding_dimension: LOCAL_EMBEDDING_DIMENSION,
          chunker_version: DOCUMENT_CHUNKER_VERSION,
          chunks: chunks.map((chunk) => ({
            id: chunk.id,
            chunk_index: chunk.chunkIndex,
            heading_path: chunk.headingPath,
            content: chunk.content,
            content_hash: chunk.contentHash,
            embedding: Array.from(chunk.embedding),
          })),
        }),
      },
    );
    if (response.ok) {
      await setCloudUploadState(sourceId, 'uploaded', { revision: sourceRevision });
      return;
    }

    const body = await response.json().catch(() => null);
    const code = body?.detail?.code;
    if (response.status === 409 && code === 'SOURCE_REVISION_MISMATCH') {
      throw new Error('文档在索引上传期间已被其他客户端更新，请重新同步后再试。');
    }
    const validationMessage = describeValidationError(body?.detail);
    throw new Error(
      validationMessage
        ? `上传文本索引失败（HTTP ${response.status}：${validationMessage}）`
        : `上传文本索引失败（HTTP ${response.status}）`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setCloudUploadState(sourceId, 'error', { error: message });
    throw error;
  }
}

export async function uploadReadyTextIndexes(workspaceId: string): Promise<number> {
  const remoteStatuses = await loadRemoteStatuses(workspaceId);
  const states = await db.documentIndexStates.where('status').equals('indexed').toArray();
  let uploaded = 0;

  for (const state of states) {
    if (
      state.embeddingModel !== LOCAL_EMBEDDING_MODEL ||
      state.embeddingDimension !== LOCAL_EMBEDDING_DIMENSION ||
      state.chunkerVersion !== DOCUMENT_CHUNKER_VERSION
    ) {
      continue;
    }

    const [document, syncState] = await Promise.all([
      db.documents.get(state.sourceId),
      db.syncEntityStatesV2.get([workspaceId, 'document', state.sourceId]),
    ]);
    if (!document || !syncState?.serverRev) continue;

    const fingerprint = getDocumentFingerprint(document);
    if (fingerprint !== state.sourceFingerprint) continue;
    if (
      isCurrentRemoteIndex(remoteStatuses.get(state.sourceId), syncState.serverRev, fingerprint)
    ) {
      await setCloudUploadState(state.sourceId, 'uploaded', { revision: syncState.serverRev });
      continue;
    }

    await uploadSourceIndex(
      workspaceId,
      state.sourceId,
      state.sourceType,
      syncState.serverRev,
      fingerprint,
    );
    uploaded += 1;
  }

  return uploaded;
}
