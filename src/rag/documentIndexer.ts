import { db } from '../db';
import { chunkDocument, getDocumentFingerprint, getDocumentSourceType } from './documentChunker';
import { embedPassages } from './embeddingClient';
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

const INDEXING_ENABLED_KEY = 'duet-doc:local-rag:indexing-enabled';
const INDEX_DELAY_MS = 2_000;

const scheduledJobs = new Map<string, number>();

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function isLocalIndexingEnabled(): boolean {
  return canUseStorage() && window.localStorage.getItem(INDEXING_ENABLED_KEY) === 'true';
}

export function enableLocalIndexing(): void {
  if (canUseStorage()) window.localStorage.setItem(INDEXING_ENABLED_KEY, 'true');
}

function createPassageText(chunk: {
  title: string;
  headingPath: string[];
  content: string;
}): string {
  const section = chunk.headingPath.length > 0 ? `\n${chunk.headingPath.join(' > ')}` : '';
  return `passage: ${chunk.title}${section}\n${chunk.content}`;
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

export async function indexDocument(document: IndexableDocument): Promise<'indexed' | 'skipped'> {
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
    const embeddingResult = drafts.length
      ? await embedPassages(drafts.map(createPassageText))
      : { vectors: [], inferenceMs: 0 };

    if (embeddingResult.vectors.length !== drafts.length) {
      throw new Error('Embedding worker returned an unexpected vector count.');
    }

    const latestDocument = await db.documents.get(document.id);
    if (!latestDocument || getDocumentFingerprint(latestDocument) !== sourceFingerprint) {
      if (latestDocument) scheduleDocumentIndex(latestDocument);
      return 'skipped';
    }

    const indexedAt = Date.now();
    const chunks: DocumentChunk[] = drafts.map((draft, index) => ({
      ...draft,
      embedding: embeddingResult.vectors[index],
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
      },
      chunks,
    );
    return 'indexed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDocumentIndexError(baseState, message);
    throw error;
  }
}

export function scheduleDocumentIndex(document: IndexableDocument): void {
  if (!isLocalIndexingEnabled()) return;

  const existingTimer = scheduledJobs.get(document.id);
  if (existingTimer) window.clearTimeout(existingTimer);

  const timer = window.setTimeout(() => {
    scheduledJobs.delete(document.id);
    indexDocument(document).catch((error) => {
      console.error(`[LocalRAG] Failed to index document ${document.id}:`, error);
    });
  }, INDEX_DELAY_MS);
  scheduledJobs.set(document.id, timer);
}

export async function rebuildLocalDocumentIndex(
  onProgress?: (progress: IndexProgress) => void,
): Promise<IndexRunResult> {
  enableLocalIndexing();
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
    failures: [],
  };

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    try {
      const status = await indexDocument(document);
      if (status === 'indexed') result.indexedDocuments += 1;
      else result.skippedDocuments += 1;
    } catch (error) {
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
}
