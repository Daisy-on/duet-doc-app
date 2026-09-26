import { db } from '../db';
import type { DocumentChunk, DocumentIndexState, DocumentSourceType } from './types';
import { getDocumentFingerprint } from './documentChunker';
import {
  DOCUMENT_CHUNKER_VERSION,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
} from './types';

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

  const currentSources = await getCurrentLocalSourceIds([
    ...new Set(chunks.map((chunk) => chunk.sourceId)),
  ]);
  const currentChunks = chunks.filter((chunk) => currentSources.has(chunk.sourceId));
  if (!options.sourceTypes || options.sourceTypes.length === 0) return currentChunks;
  const sourceTypes = new Set(options.sourceTypes);
  return currentChunks.filter((chunk) => sourceTypes.has(chunk.sourceType));
}

export async function getCurrentLocalSourceIds(sourceIds?: string[]): Promise<Set<string>> {
  const ids =
    sourceIds ??
    (await db.documentIndexStates.where('status').equals('indexed').toArray()).map(
      (state) => state.sourceId,
    );
  const [documents, states] = await Promise.all([
    db.documents.bulkGet(ids),
    db.documentIndexStates.bulkGet(ids),
  ]);
  return new Set(
    ids.filter((_, index) => {
      const document = documents[index];
      const state = states[index];
      return (
        document &&
        state?.status === 'indexed' &&
        state.sourceFingerprint === getDocumentFingerprint(document) &&
        state.embeddingModel === LOCAL_EMBEDDING_MODEL &&
        state.embeddingDimension === LOCAL_EMBEDDING_DIMENSION &&
        state.chunkerVersion === DOCUMENT_CHUNKER_VERSION
      );
    }),
  );
}

export async function hasStaleLocalIndex(sourceTypes: DocumentSourceType[]): Promise<boolean> {
  if (sourceTypes.length === 0) return false;
  const states = (await db.documentIndexStates.where('status').equals('indexed').toArray()).filter(
    (state) => sourceTypes.includes(state.sourceType),
  );
  if (states.length === 0) return false;
  const current = await getCurrentLocalSourceIds(states.map((state) => state.sourceId));
  const documents = await db.documents.bulkGet(states.map((state) => state.sourceId));
  return states.some((state, index) => Boolean(documents[index]) && !current.has(state.sourceId));
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
