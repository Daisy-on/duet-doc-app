export const LOCAL_EMBEDDING_MODEL = 'bge-large-zh-v1.5';
export const LOCAL_EMBEDDING_DIMENSION = 1024;
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
  cloudUploadStatus?: 'pending' | 'uploaded' | 'error';
  cloudUploadError?: string;
  cloudUploadedRevision?: number;
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
  matchedPhrase?: string;
  phraseBonus?: number;
}

export interface LocalSearchOptions {
  kbId?: string;
  sourceTypes?: DocumentSourceType[];
  limit?: number;
  sortBy?: 'relevance' | 'updatedAt';
  strategy?: LocalRetrievalStrategy;
  queryEmbedding?: Float32Array;
}

export interface IndexProgress {
  completedDocuments: number;
  totalDocuments: number;
  sourceId: string;
  title: string;
  completedChunks?: number;
  totalChunks?: number;
  reusedChunks?: number;
}

export interface EmbeddingProgress {
  file: string;
  percent: number;
}

export interface IndexRunResult {
  indexedDocuments: number;
  skippedDocuments: number;
  failedDocuments: number;
  stopped: boolean;
  failures: Array<{
    sourceId: string;
    title: string;
    message: string;
  }>;
}
