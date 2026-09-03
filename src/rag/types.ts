export const LOCAL_EMBEDDING_MODEL = 'multilingual-e5-base';
export const LOCAL_EMBEDDING_DIMENSION = 768;
export const DOCUMENT_CHUNKER_VERSION = 'v2';

export type DocumentSourceType = 'document' | 'memo';
export type DocumentIndexStatus = 'indexed' | 'indexing' | 'error';
export type LocalRetrievalStrategy = 'vector' | 'hybrid';

export interface IndexableDocument {
  id: string;
  kbId: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface DocumentChunkDraft {
  id: string;
  sourceId: string;
  kbId: string;
  sourceType: DocumentSourceType;
  title: string;
  chunkIndex: number;
  headingPath: string[];
  content: string;
  contentHash: string;
  sourceUpdatedAt: number;
}

export interface DocumentChunk extends DocumentChunkDraft {
  embedding: Float32Array;
  embeddingModel: string;
  embeddingDimension: number;
  chunkerVersion: string;
  indexedAt: number;
}

export interface DocumentIndexState {
  sourceId: string;
  kbId: string;
  sourceType: DocumentSourceType;
  sourceFingerprint: string;
  sourceUpdatedAt: number;
  status: DocumentIndexStatus;
  chunkCount: number;
  embeddingModel: string;
  embeddingDimension: number;
  chunkerVersion: string;
  indexedAt?: number;
  errorMessage?: string;
}

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  kbId: string;
  sourceType: DocumentSourceType;
  title: string;
  chunkIndex: number;
  headingPath: string[];
  content: string;
  score: number;
  sourceUpdatedAt: number;
  retrievalStrategy?: LocalRetrievalStrategy;
  vectorRank?: number;
  vectorScore?: number;
  lexicalRank?: number;
  lexicalScore?: number;
  fusionScore?: number;
  matchedTerms?: string[];
}

export interface LocalSearchOptions {
  kbId?: string;
  sourceTypes?: DocumentSourceType[];
  limit?: number;
  sortBy?: 'relevance' | 'updatedAt';
  strategy?: LocalRetrievalStrategy;
}

export interface IndexProgress {
  completedDocuments: number;
  totalDocuments: number;
  sourceId: string;
  title: string;
}

export interface EmbeddingProgress {
  file: string;
  percent: number;
}

export interface IndexRunResult {
  indexedDocuments: number;
  skippedDocuments: number;
  failedDocuments: number;
  failures: Array<{
    sourceId: string;
    title: string;
    message: string;
  }>;
}
