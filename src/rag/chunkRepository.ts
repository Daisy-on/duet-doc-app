import { db } from '../db';
import type { DocumentChunk, DocumentIndexState, DocumentSourceType } from './types';

export async function getDocumentIndexState(
  sourceId: string,
): Promise<DocumentIndexState | undefined> {
  return db.documentIndexStates.get(sourceId);
}

export async function replaceDocumentIndex(
  state: DocumentIndexState,
  chunks: DocumentChunk[],
): Promise<void> {
  await db.transaction('rw', [db.documentChunks, db.documentIndexStates], async () => {
    await db.documentChunks.where('sourceId').equals(state.sourceId).delete();
    if (chunks.length > 0) await db.documentChunks.bulkPut(chunks);
    await db.documentIndexStates.put(state);
  });
}

export async function markDocumentIndexError(
  state: Omit<DocumentIndexState, 'status'>,
  errorMessage: string,
): Promise<void> {
  await db.documentIndexStates.put({
    ...state,
    status: 'error',
    errorMessage,
  });
}

export async function listIndexedChunks(options: {
  kbId?: string;
  sourceTypes?: DocumentSourceType[];
}): Promise<DocumentChunk[]> {
  const chunks = options.kbId
    ? await db.documentChunks.where('kbId').equals(options.kbId).toArray()
    : await db.documentChunks.toArray();

  if (!options.sourceTypes || options.sourceTypes.length === 0) return chunks;
  const sourceTypes = new Set(options.sourceTypes);
  return chunks.filter((chunk) => sourceTypes.has(chunk.sourceType));
}

export async function updateDocumentChunkScope(
  sourceId: string,
  kbId: string,
  sourceType: DocumentSourceType,
): Promise<void> {
  await db.transaction('rw', [db.documentChunks, db.documentIndexStates], async () => {
    const chunks = await db.documentChunks.where('sourceId').equals(sourceId).toArray();
    if (chunks.length > 0) {
      await db.documentChunks.bulkPut(chunks.map((chunk) => ({ ...chunk, kbId, sourceType })));
    }

    const state = await db.documentIndexStates.get(sourceId);
    if (state) await db.documentIndexStates.put({ ...state, kbId, sourceType });
  });
}
