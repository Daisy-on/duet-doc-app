import { db } from '../db';
import {
  chunkDocument,
  createDocumentPassageText,
  getDocumentFingerprint,
  getDocumentSourceType,
} from './documentChunker';
import {
  EMBEDDING_BATCH_SIZE,
  embedPassagesInBatches,
  withEmbeddingRuntime,
} from './embeddingClient';
import {
  getDocumentIndexState,
  markDocumentIndexError,
  replaceDocumentIndex,
} from './chunkRepository';
import {
  DOCUMENT_CHUNKER_VERSION,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
  type DocumentChunk,
  type IndexProgress,
  type IndexRunResult,
  type IndexableDocument,
} from './types';

interface DocumentEmbeddingProgress {
  completedChunks: number;
  totalChunks: number;
  reusedChunks: number;
}

function getReusableEmbeddingKey(chunk: {
  title: string;
  headingPath: string[];
  contentHash: string;
}): string {
  return JSON.stringify([chunk.title, chunk.headingPath, chunk.contentHash]);
}

function isReusableChunk(chunk: DocumentChunk): boolean {
  return (
    chunk.embeddingModel === LOCAL_EMBEDDING_MODEL &&
    chunk.embeddingDimension === LOCAL_EMBEDDING_DIMENSION &&
    chunk.chunkerVersion === DOCUMENT_CHUNKER_VERSION &&
    chunk.embedding.length === LOCAL_EMBEDDING_DIMENSION
  );
}

function hasCurrentEmbedding(
  state: Awaited<ReturnType<typeof getDocumentIndexState>>,
  fingerprint: string,
) {
  return (
    state?.status === 'indexed' &&
    state.sourceFingerprint === fingerprint &&
    state.embeddingModel === LOCAL_EMBEDDING_MODEL &&
    state.embeddingDimension === LOCAL_EMBEDDING_DIMENSION &&
    state.chunkerVersion === DOCUMENT_CHUNKER_VERSION
  );
}

async function indexDocumentInternal(
  document: IndexableDocument,
  onProgress?: (progress: DocumentEmbeddingProgress) => void,
  signal?: AbortSignal,
): Promise<'indexed' | 'skipped'> {
  signal?.throwIfAborted();
  const sourceFingerprint = getDocumentFingerprint(document);
  const sourceType = getDocumentSourceType(document);
  const existingState = await getDocumentIndexState(document.id);

  if (existingState && hasCurrentEmbedding(existingState, sourceFingerprint)) {
    if (
      existingState.kbId !== document.kbId ||
      existingState.sourceType !== sourceType ||
      existingState.sourceUpdatedAt !== document.updatedAt
    ) {
      await replaceDocumentIndex(
        {
          ...existingState,
          kbId: document.kbId,
          sourceType,
          sourceUpdatedAt: document.updatedAt,
        },
        await db.documentChunks.where('sourceId').equals(document.id).toArray(),
      );
    }
    return 'skipped';
  }

  const drafts = chunkDocument(document);
  const baseState = {
    sourceId: document.id,
    kbId: document.kbId,
    sourceType,
    sourceFingerprint,
    sourceUpdatedAt: document.updatedAt,
    chunkCount: drafts.length,
    embeddingModel: LOCAL_EMBEDDING_MODEL,
    embeddingDimension: LOCAL_EMBEDDING_DIMENSION,
    chunkerVersion: DOCUMENT_CHUNKER_VERSION,
  };

  try {
    const previousChunks = await db.documentChunks.where('sourceId').equals(document.id).toArray();
    const reusableEmbeddings = new Map(
      previousChunks
        .filter(isReusableChunk)
        .map((chunk) => [getReusableEmbeddingKey(chunk), chunk.embedding] as const),
    );
    const vectors = drafts.map((draft) => reusableEmbeddings.get(getReusableEmbeddingKey(draft)));
    const missingDrafts = drafts
      .map((draft, index) => ({ draft, index }))
      .filter(({ index }) => !vectors[index]);
    const reusedChunks = drafts.length - missingDrafts.length;

    onProgress?.({ completedChunks: reusedChunks, totalChunks: drafts.length, reusedChunks });

    if (missingDrafts.length > 0) {
      const embeddingResult = await embedPassagesInBatches(
        missingDrafts.map(({ draft }) => createDocumentPassageText(draft)),
        (completed) => {
          onProgress?.({
            completedChunks: reusedChunks + completed,
            totalChunks: drafts.length,
            reusedChunks,
          });
        },
        signal,
      );
      missingDrafts.forEach(({ index }, resultIndex) => {
        vectors[index] = embeddingResult.vectors[resultIndex];
      });
    }

    const completedVectors = vectors.map((vector) => {
      if (!vector) throw new Error('Embedding result is missing for a document chunk.');
      return vector;
    });

    signal?.throwIfAborted();
    const latestDocument = await db.documents.get(document.id);
    if (!latestDocument || getDocumentFingerprint(latestDocument) !== sourceFingerprint) {
      return 'skipped';
    }

    const indexedAt = Date.now();
    const chunks: DocumentChunk[] = drafts.map((draft, index) => ({
      ...draft,
      embedding: completedVectors[index],
      embeddingModel: LOCAL_EMBEDDING_MODEL,
      embeddingDimension: LOCAL_EMBEDDING_DIMENSION,
      chunkerVersion: DOCUMENT_CHUNKER_VERSION,
      indexedAt,
    }));

    await replaceDocumentIndex(
      {
        ...baseState,
        status: 'indexed',
        indexedAt,
        cloudUploadStatus: 'pending',
        cloudUploadError: undefined,
        cloudUploadedRevision: undefined,
      },
      chunks,
    );
    console.info('[LocalRAG] Document index updated', {
      sourceId: document.id,
      chunks: drafts.length,
      reusedChunks,
      embeddedChunks: missingDrafts.length,
      batchSize: EMBEDDING_BATCH_SIZE,
    });
    return 'indexed';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : String(error);
    await markDocumentIndexError(baseState, message);
    throw error;
  }
}

export function indexDocument(
  document: IndexableDocument,
  onProgress?: (progress: DocumentEmbeddingProgress) => void,
  signal?: AbortSignal,
): Promise<'indexed' | 'skipped'> {
  return withEmbeddingRuntime(() => indexDocumentInternal(document, onProgress, signal));
}

export async function rebuildLocalDocumentIndex(
  onProgress?: (progress: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<IndexRunResult> {
  return withEmbeddingRuntime(async () => {
    const documents = (await db.documents.toArray()).sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
    console.info('[LocalRAG] Starting local index rebuild', {
      origin: window.location.origin,
      documentCount: documents.length,
    });
    const result: IndexRunResult = {
      indexedDocuments: 0,
      skippedDocuments: 0,
      failedDocuments: 0,
      stopped: false,
      failures: [],
    };

    for (let index = 0; index < documents.length; index += 1) {
      if (signal?.aborted) {
        result.stopped = true;
        break;
      }
      const document = documents[index];
      try {
        const status = await indexDocument(
          document,
          (chunkProgress) => {
            onProgress?.({
              completedDocuments: index,
              totalDocuments: documents.length,
              sourceId: document.id,
              title: document.title,
              ...chunkProgress,
            });
          },
          signal,
        );
        if (status === 'indexed') result.indexedDocuments += 1;
        else result.skippedDocuments += 1;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          result.stopped = true;
          break;
        }
        result.failedDocuments += 1;
        const message = error instanceof Error ? error.message : String(error);
        result.failures.push({ sourceId: document.id, title: document.title, message });
        console.error('[LocalRAG] Document indexing failed', {
          sourceId: document.id,
          title: document.title,
          message,
        });
      }
      onProgress?.({
        completedDocuments: index + 1,
        totalDocuments: documents.length,
        sourceId: document.id,
        title: document.title,
      });
    }

    return result;
  });
}
